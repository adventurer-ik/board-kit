import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 붙인 DB 의 스키마 이름 — SQL 파일이 `board.표` 로 쓰므로 고정 */
export const SCHEMA = 'board';

/**
 * 게시판 파일을 호스트 커넥션에 붙이고(ATTACH) 자기 마이그레이션을 돌린다.
 * 호스트의 마이그레이션 표와는 무관 — 파일마다 `schema_migration` 을 따로 둔다.
 * PRAGMA 는 파일마다: auto_vacuum 은 표를 만들기 전에 정해야 효과가 있다.
 */
export function attachAndMigrate(db: Database.Database, file: string): string[] {
  mkdirSync(dirname(file), { recursive: true });
  const attached = (db.pragma('database_list') as { name: string }[]).some((d) => d.name === SCHEMA);
  if (!attached) db.prepare(`ATTACH DATABASE ? AS ${SCHEMA}`).run(file);
  db.pragma(`${SCHEMA}.auto_vacuum = INCREMENTAL`);
  db.pragma(`${SCHEMA}.journal_mode = WAL`);

  db.exec(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migration (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')))`);
  const done = new Set((db.prepare(`SELECT version FROM ${SCHEMA}.schema_migration`).all() as { version: number }[]).map((r) => r.version));

  const dir = schemaDir();
  const applied: string[] = [];
  for (const f of readdirSync(dir).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
    const version = Number(f.split('_')[0]);
    if (done.has(version)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO ${SCHEMA}.schema_migration (version, name, sha256) VALUES (?, ?, ?)`).run(version, f, sha256);
    })();
    applied.push(f);
  }
  return applied;
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
