import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 붙인 DB 의 스키마 이름 — SQL 파일이 `board.표` 로 쓰므로 고정 */
export const SCHEMA = 'board';

/**
 * 게시판 파일을 호스트 커넥션에 붙이고(ATTACH) 자기 마이그레이션을 돌린다.
 * 호스트의 마이그레이션 표와는 무관 — 파일마다 `schema_migration` 을 따로 둔다.
 * PRAGMA 는 파일마다: auto_vacuum 은 표를 만들기 전에 정해야 효과가 있다.
 *
 * 안 깨지게 · 깨졌을 때:
 * - 붙인 직후 `quick_check` — 깨진 파일(디스크 가득 · 강제 종료 · 손으로 만진 파일)은 여기서 걸린다. 새 파일은 ok
 * - `synchronous = FULL` — 커밋마다 fsync. 글 몇 줄이라 비용은 없다시피 하고 정전 때 WAL 끝이 어긋날 여지를 줄인다
 * - 표가 이미 있는 파일에 새 마이그레이션을 적용하기 전에 `<파일>.pre-migrate` 로 통째 복사(VACUUM INTO) — 스키마 변경이 잘못돼도 돌아갈 곳
 * - 어디서든 실패하면 DETACH 하고 던진다 — 호스트 커넥션에 반쯤 붙은 채 남지 않게. 잡는 쪽(BoardService)이 "사용 불가" 로 둔다
 */
export function attachAndMigrate(db: Database.Database, file: string): string[] {
  mkdirSync(dirname(file), { recursive: true });
  const attached = (db.pragma('database_list') as { name: string }[]).some((d) => d.name === SCHEMA);
  if (!attached) db.prepare(`ATTACH DATABASE ? AS ${SCHEMA}`).run(file);
  try {
    quickCheck(db);
    db.pragma(`${SCHEMA}.auto_vacuum = INCREMENTAL`);
    db.pragma(`${SCHEMA}.journal_mode = WAL`);
    db.pragma(`${SCHEMA}.synchronous = FULL`);

    db.exec(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migration (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')))`);
    const done = new Set((db.prepare(`SELECT version FROM ${SCHEMA}.schema_migration`).all() as { version: number }[]).map((r) => r.version));

    const dir = schemaDir();
    const pending = readdirSync(dir)
      .filter((n) => /^\d+_.*\.sql$/.test(n))
      .sort()
      .filter((f) => !done.has(Number(f.split('_')[0])));
    if (pending.length && done.size) safetyCopy(db, file);

    const applied: string[] = [];
    for (const f of pending) {
      const version = Number(f.split('_')[0]);
      const sql = readFileSync(join(dir, f), 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      db.transaction(() => {
        db.exec(sql);
        db.prepare(`INSERT INTO ${SCHEMA}.schema_migration (version, name, sha256) VALUES (?, ?, ?)`).run(version, f, sha256);
      })();
      applied.push(f);
    }
    return applied;
  } catch (e) {
    try {
      db.exec(`DETACH DATABASE ${SCHEMA}`);
    } catch {
      /* 붙지 않았거나 떼지 못하면 그대로 — 어차피 사용 불가로 간다 */
    }
    throw e;
  }
}

/** 붙인 파일의 빠른 무결성 검사 — 'ok' 가 아니면 던진다(깨진 파일 · DB 가 아닌 파일은 pragma 자체가 던진다) */
export function quickCheck(db: Database.Database, schema: string = SCHEMA): void {
  const rows = db.pragma(`${schema}.quick_check`) as Record<string, string>[];
  const msg = rows.map((r) => Object.values(r)[0]).join('; ');
  if (msg !== 'ok') throw new Error(`게시판 DB 손상(quick_check): ${msg.slice(0, 300)}`);
}

/** 마이그레이션 전 안전 복사 — 지난 복사는 하나만 남긴다(파일이 작다) */
function safetyCopy(db: Database.Database, file: string): void {
  const dest = `${file}.pre-migrate`;
  if (existsSync(dest)) unlinkSync(dest);
  db.prepare(`VACUUM ${SCHEMA} INTO ?`).run(dest);
}

/** 붙인 파일을 떼어낸다(초기화 · 복원 때) */
export function detach(db: Database.Database): void {
  db.pragma(`${SCHEMA}.wal_checkpoint(TRUNCATE)`);
  db.exec(`DETACH DATABASE ${SCHEMA}`);
}

function schemaDir(): string {
  // dist/core/migrate.js 와 src/core/migrate.ts 둘 다 옆의 schema/ 를 본다
  const here = join(__dirname, 'schema');
  if (existsSync(here)) return here;
  throw new Error(`board-kit: 스키마 폴더가 없다: ${here}`);
}
