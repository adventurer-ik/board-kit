import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardEvent, BoardHost } from '../src/core/host';
import { BoardService } from '../src/core/service';

/**
 * 게시판 파일이 깨졌을 때 — 호스트 서버는 떠야 하고(생성자가 던지지 않음), 게시판만 BOARD_UNAVAILABLE,
 * 운영자가 파일을 치우면 recover() 로 되살아난다. 메인 DB 는 내내 멀쩡해야 한다.
 */
const kim = { name: 'kim', moderator: true };
let dir: string;
let db: Database.Database;
let events: BoardEvent[];
const host = (retryMs: number): BoardHost => ({
  db,
  file: join(dir, 'board.sqlite'),
  attach: { dir: join(dir, 'files'), maxFiles: 2, maxBytes: 1000, kinds: ['png', 'text'] },
  enabled: () => true,
  actor: () => kim,
  onEvent: (e) => events.push(e),
  retryMs,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'board-kit-fault-'));
  db = new Database(join(dir, 'main.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE host_t (v TEXT)');
  events = [];
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('게시판 파일 고장 격리', () => {
  it('DB 가 아닌 파일 — 생성자는 살고, 사용 불가 503, 메인 DB 는 멀쩡, 치우면 되살아남', () => {
    writeFileSync(join(dir, 'board.sqlite'), Buffer.alloc(8192, 0x5a));
    const svc = new BoardService(host(0));
    expect(svc.status().ok).toBe(false);
    expect(svc.status().fault?.message).toMatch(/not a database|손상/);
    expect(events.map((e) => e.type)).toEqual(['unavailable']);
    expect(events[0]!.actor).toBe('system');
    expect(events[0]!.detail?.file).toBe(join(dir, 'board.sqlite'));
    // 반쯤 붙은 채 남지 않았다 — 호스트 커넥션은 그대로 쓸 수 있다
    expect((db.pragma('database_list') as { name: string }[]).some((d) => d.name === 'board')).toBe(false);
    db.prepare('INSERT INTO host_t VALUES (?)').run('ok');
    expect(db.prepare('SELECT count(*) c FROM host_t').get()).toEqual({ c: 1 });
    // 게시판 길은 전부 503
    expect(() => svc.assertAvailable()).toThrowError(/BOARD_UNAVAILABLE/);
    expect(() => svc.wipe(kim)).toThrowError(/BOARD_UNAVAILABLE/);
    const cfg = svc.config(kim);
    expect(cfg.enabled).toBe(true);
    expect(cfg.unavailable?.message).toBeTruthy();
    // 운영자가 파일을 옆으로 치움 → 다시 열면 빈 게시판으로 살아난다
    rmSync(join(dir, 'board.sqlite'));
    expect(svc.recover(true)).toBe(true);
    expect(svc.status().ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['unavailable', 'recovered']);
    expect(svc.config(kim).unavailable).toBeNull();
    const p = svc.create({ category: 'bug', title: 't', body: 'b' }, kim);
    expect(svc.get(p.id, kim).title).toBe('t');
  });

  it('retryMs 안에서는 다시 열어 보지 않고, config 를 물으면 간격이 지난 뒤 저절로 되살아난다', async () => {
    writeFileSync(join(dir, 'board.sqlite'), Buffer.alloc(8192, 0x5a));
    const svc = new BoardService(host(50));
    rmSync(join(dir, 'board.sqlite'));
    expect(svc.recover()).toBe(false); // 방금 실패했으니 아직
    expect(svc.config(kim).unavailable).not.toBeNull();
    await new Promise((r) => setTimeout(r, 80));
    expect(svc.config(kim).unavailable).toBeNull(); // 간격이 지나 config 가 다시 열었다
    expect(svc.status().ok).toBe(true);
  });

  it('[새로 시작] — 고장 상태에서만, 파일 셋 · 첨부 폴더를 .broken-<시각> 으로 옮기고 빈 게시판으로(지우지 않음)', () => {
    writeFileSync(join(dir, 'board.sqlite'), Buffer.alloc(8192, 0x5a));
    writeFileSync(join(dir, 'board.sqlite-wal'), Buffer.alloc(16));
    mkdirSync(join(dir, 'files'), { recursive: true });
    writeFileSync(join(dir, 'files', 'x.bin'), 'keep');
    const svc = new BoardService(host(0));
    expect(svc.status().ok).toBe(false);
    const r = svc.startFresh(kim);
    // sqlite · files/ 는 반드시(-wal 은 SQLite 가 깨진 파일을 열 때 치울 수 있어 세지 않는다)
    expect(r.movedTo.some((p) => /board\.sqlite\.broken-/.test(p))).toBe(true);
    expect(r.movedTo.some((p) => /files\.broken-/.test(p))).toBe(true);
    for (const p of r.movedTo) expect(existsSync(p)).toBe(true);
    expect(existsSync(join(dir, 'files', 'x.bin'))).toBe(false);
    expect(r.movedTo.every((p) => /\.broken-\d{8}-\d{6}$/.test(p))).toBe(true);
    expect(svc.status().ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['unavailable', 'reset', 'recovered']);
    expect(svc.list({}).total).toBe(0);
    svc.create({ category: 'bug', title: '새 글', body: 'b' }, kim);
    expect(svc.list({}).total).toBe(1);
    // 멀쩡한 게시판에서는 거부(비우기는 wipe)
    expect(() => svc.startFresh(kim)).toThrowError(/BOARD_INVALID/);
  });

  it('markFault — 요청 도중 손상을 알리면 사용 불가로 돌리고 DETACH', () => {
    const svc = new BoardService(host(0));
    svc.create({ category: 'bug', title: 't', body: 'b' }, kim);
    svc.markFault('SQLITE_CORRUPT: database disk image is malformed');
    expect(svc.status().ok).toBe(false);
    expect((db.pragma('database_list') as { name: string }[]).some((d) => d.name === 'board')).toBe(false);
    expect(events.at(-1)?.type).toBe('unavailable');
    // 파일은 실제로 멀쩡하므로 다시 열면 글이 그대로
    expect(svc.recover(true)).toBe(true);
    expect(svc.list({}).total).toBe(1);
  });

  it('새 파일은 quick_check ok · synchronous FULL · 안전 복사는 만들지 않는다', () => {
    const svc = new BoardService(host(0));
    expect(svc.status().ok).toBe(true);
    expect((db.pragma('board.synchronous') as { synchronous: number }[])[0]!.synchronous).toBe(2);
    expect((db.pragma('board.journal_mode') as { journal_mode: string }[])[0]!.journal_mode).toBe('wal');
    expect(existsSync(join(dir, 'board.sqlite.pre-migrate'))).toBe(false);
  });
});
