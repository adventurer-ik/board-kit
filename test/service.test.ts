import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BoardError, type BoardEvent, type BoardHost, BoardService } from '../src/core';

const kim = { name: 'kim', moderator: false };
const lee = { name: 'lee', moderator: false };
const root = { name: 'root', moderator: true };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);

describe('BoardService', () => {
  let dir: string;
  let db: Database.Database;
  let events: BoardEvent[];
  let enabled = true;
  let svc: BoardService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-kit-'));
    db = new Database(join(dir, 'main.sqlite')); // 호스트의 메인 DB 역할 — 게시판은 여기 붙는다
    db.pragma('journal_mode = WAL');
    events = [];
    enabled = true;
    const host: BoardHost = {
      db,
      file: join(dir, 'board.sqlite'),
      attach: { dir: join(dir, 'files'), maxFiles: 2, maxBytes: 1000, kinds: ['png', 'text', 'json', 'pcap'] },
      enabled: () => enabled,
      actor: () => kim,
      onEvent: (e) => events.push(e),
    };
    svc = new BoardService(host);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('붙이기 · 마이그레이션 — 메인 DB 에는 표가 안 생기고 board 파일에 생긴다', () => {
    const main = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(main.map((r) => r.name)).toEqual([]);
    const board = db.prepare("SELECT name FROM board.sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    expect(board.map((r) => r.name)).toEqual(['attachment', 'comment', 'post', 'reaction', 'schema_migration']);
    expect(existsSync(join(dir, 'board.sqlite'))).toBe(true);
    // 두 번 만들어도(재기동) 그대로
    new BoardService({ db, file: join(dir, 'board.sqlite'), enabled: () => true, actor: () => kim });
  });

  it('글 쓰기 · 보기 · 목록 · 맥락 거르기 · 검색', () => {
    const a = svc.create({ category: 'idea', title: ' 제안 하나 ', body: '본문\r\n둘째', context: { path: '/deploys', version: 'spoof' } }, kim, { version: '1.1.0' });
    expect(a.title).toBe('제안 하나');
    expect(a.body).toBe('본문\n둘째');
    expect(a.context).toEqual({ path: '/deploys', version: '1.1.0' }); // 호스트 맥락이 이긴다
    svc.create({ category: 'bug', title: '오류', body: 'pcap 두 개', context: { path: '/lab/3' } }, lee);
    svc.create({ category: 'tip', title: '경험', body: '보존 정리', context: { path: '/deploys' } }, kim);

    expect(svc.list({}).items.map((p) => p.title)).toEqual(['경험', '오류', '제안 하나']);
    expect(svc.list({ category: 'bug' }).items.map((p) => p.title)).toEqual(['오류']);
    expect(svc.list({ contextKey: 'path', contextValue: '/deploys' }).total).toBe(2);
    expect(svc.list({ q: 'pcap' }).items.map((p) => p.title)).toEqual(['오류']);
    expect(svc.list({ q: '%' }).total).toBe(0); // LIKE 특수문자는 글자로
    expect(svc.facets('path')).toEqual([{ value: '/deploys', count: 2 }, { value: '/lab/3', count: 1 }]);
    expect(events.map((e) => e.type)).toEqual(['post.created', 'post.created', 'post.created']);
  });

  it('keyset 쪽 넘기기', () => {
    for (let i = 0; i < 5; i++) svc.create({ category: 'idea', title: `t${i}`, body: 'b' }, kim);
    const p1 = svc.list({ limit: 2 });
    expect(p1.items.map((p) => p.title)).toEqual(['t4', 't3']);
    expect(p1.next).toBe(p1.items[1]!.id);
    const p2 = svc.list({ limit: 2, before: p1.next! });
    expect(p2.items.map((p) => p.title)).toEqual(['t2', 't1']);
    const p3 = svc.list({ limit: 2, before: p2.next! });
    expect(p3.items.map((p) => p.title)).toEqual(['t0']);
    expect(p3.next).toBeNull();
  });

  it('입력 규칙 — 제목 · 본문 · 갈래', () => {
    expect(() => svc.create({ category: 'idea', title: '', body: 'b' }, kim)).toThrow(BoardError);
    expect(() => svc.create({ category: 'nope', title: 't', body: 'b' }, kim)).toThrowError(/BOARD_INVALID/);
    expect(() => svc.create({ category: 'idea', title: 't', body: 'x'.repeat(20_001) }, kim)).toThrowError(/BOARD_INVALID/);
  });

  it('권한 — 고치기는 글쓴이만 · 완료 · 지우기는 글쓴이 또는 운영자, 완료 글도 글쓴이는 고친다(표시일 뿐)', () => {
    const p = svc.create({ category: 'question', title: 'q', body: 'b' }, kim);
    expect(() => svc.update(p.id, { category: 'question', title: 'q2', body: 'b' }, lee)).toThrowError(/BOARD_FORBIDDEN/);
    expect(() => svc.close(p.id, lee, true)).toThrowError(/BOARD_FORBIDDEN/);
    const closed = svc.close(p.id, root, true);
    expect(closed.closedAt).not.toBeNull();
    expect(closed.closedBy).toBe('root');
    expect(svc.update(p.id, { category: 'question', title: 'q2', body: 'b' }, kim).title).toBe('q2'); // 완료 뒤에도 글쓴이는 고친다
    expect(svc.get(p.id, kim).canEdit).toBe(true);
    expect(svc.addComment(p.id, '완료 뒤 댓글', lee).body).toBe('완료 뒤 댓글');
    expect(svc.list({}).total).toBe(0); // 기본 목록은 열린 글
    expect(svc.list({ closed: 'closed' }).total).toBe(1);
    svc.close(p.id, kim, false);
    expect(svc.get(p.id, kim).canEdit).toBe(true);
    // 운영자 권한도 고치기는 못 한다
    expect(() => svc.update(p.id, { category: 'question', title: 'q2', body: 'b' }, root)).toThrowError(/BOARD_FORBIDDEN/);
    svc.remove(p.id, root);
    expect(() => svc.get(p.id, kim)).toThrowError(/BOARD_NOT_FOUND/);
    // 소프트 — 행은 남는다
    expect((db.prepare('SELECT deleted_by FROM board.post WHERE id = ?').get(p.id) as { deleted_by: string }).deleted_by).toBe('root');
  });

  it('댓글 · 반응', () => {
    const p = svc.create({ category: 'idea', title: 't', body: 'b' }, kim);
    const c = svc.addComment(p.id, ' 댓글 ', lee);
    expect(c.body).toBe('댓글');
    expect(() => svc.addComment(p.id, '   ', lee)).toThrowError(/BOARD_INVALID/);
    expect(svc.react(p.id, lee)).toEqual({ reactions: 1, reactedByMe: true });
    expect(svc.react(p.id, kim)).toEqual({ reactions: 2, reactedByMe: true });
    expect(svc.react(p.id, lee)).toEqual({ reactions: 1, reactedByMe: false });
    const v = svc.get(p.id, kim);
    expect(v.comments).toBe(1);
    expect(v.reactedBy).toEqual(['kim']);
    expect(v.commentList[0]!.canDelete).toBe(false);
    expect(() => svc.removeComment(c.id, kim)).toThrowError(/BOARD_FORBIDDEN/);
    svc.removeComment(c.id, root);
    expect(svc.get(p.id, kim).commentList).toEqual([]);
    const commentEvent = events.find((e) => e.type === 'comment.created')!;
    expect(commentEvent.postAuthor).toBe('kim');
    expect(commentEvent.actor).toBe('lee');
  });

  it('첨부 — 매직 바이트 · inline 은 그림만 · 개수 · 크기 · 내용 주소 중복 · 지우면 파일도(다른 글이 안 쓸 때)', async () => {
    const p = svc.create({ category: 'bug', title: 't', body: 'b' }, kim);
    const img = await svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([PNG]), { name: '../evil/shot.png', display: 'inline' }, kim);
    expect(img.kind).toBe('png');
    expect(img.display).toBe('inline');
    expect(img.name).toBe('shot.png');
    const log = await svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([Buffer.from('log line\n')]), { name: 'a.log', display: 'inline' }, kim);
    expect(log.kind).toBe('text');
    expect(log.display).toBe('file'); // 그림이 아니면 늘 file
    await expect(svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([PNG]), { name: 'x' }, kim)).rejects.toThrowError(/BOARD_ATTACH_TOO_MANY/);

    const q = svc.create({ category: 'bug', title: 't2', body: 'b' }, lee);
    await expect(svc.addAttachment({ kind: 'post', id: q.id }, Readable.from([PNG]), { name: 'x' }, kim)).rejects.toThrowError(/BOARD_FORBIDDEN/);
    await expect(svc.addAttachment({ kind: 'post', id: q.id }, Readable.from([Buffer.alloc(1001)]), { name: 'big' }, lee)).rejects.toThrowError(/BOARD_ATTACH_TOO_BIG/);
    await expect(svc.addAttachment({ kind: 'post', id: q.id }, Readable.from([Buffer.from([0x50, 0x4b, 0x03, 0x04])]), { name: 'z.zip' }, lee)).rejects.toThrowError(/BOARD_ATTACH_KIND/);
    const svgLike = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(svc.addAttachment({ kind: 'post', id: q.id }, Readable.from([svgLike]), { name: 'v.svg', display: 'inline' }, lee)).rejects.toThrowError(/BOARD_ATTACH_KIND/); // kinds 에 svg 없음

    // 같은 그림을 다른 글에 — 디스크 파일은 하나
    const dup = await svc.addAttachment({ kind: 'post', id: q.id }, Readable.from([PNG]), { name: 'same.png' }, lee);
    const o1 = svc.openAttachment(img.id);
    const o2 = svc.openAttachment(dup.id);
    expect(o1.abs).toBe(o2.abs);
    expect(o1.disposition).toBe('inline');
    expect(o2.disposition).toBe('attachment');
    svc.removeAttachment(img.id, kim);
    expect(existsSync(o1.abs)).toBe(true); // q 가 아직 쓴다
    svc.removeAttachment(dup.id, root);
    expect(existsSync(o1.abs)).toBe(false);
    expect(existsSync(join(dir, 'files', 'tmp'))).toBe(true);
    expect(svc.stats()).toEqual({ posts: 2, comments: 0, attachments: 1, bytes: 9 });
  });

  it('꺼짐 스위치', () => {
    enabled = false;
    expect(() => svc.assertEnabled()).toThrowError(/BOARD_DISABLED/);
    expect(svc.config(kim).enabled).toBe(false);
    expect(svc.config(null).me).toBeNull();
  });

  it('내보내기 → 비우기 → 가져오기 — 글 · 댓글 · 반응 · 첨부가 돌아온다(지운 글은 지운 채로)', async () => {
    const p = svc.create({ category: 'idea', title: 't', body: 'b', context: { path: '/x' } }, kim);
    const c = svc.addComment(p.id, 'c', lee);
    svc.react(p.id, lee);
    await svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([PNG]), { name: 'shot.png', display: 'inline' }, kim);
    await svc.addAttachment({ kind: 'comment', id: c.id }, Readable.from([Buffer.from('{"a":1}')]), { name: 'r.json' }, lee);
    const gone = svc.create({ category: 'bug', title: 'gone', body: 'b' }, kim);
    svc.remove(gone.id, kim);

    const lines = [...svc.exportJsonl()];
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).kind).toBe('board-kit');
    const row = JSON.parse(lines[1]!);
    expect(row.comments).toHaveLength(1);
    expect(row.comments[0].attachments[0].name).toBe('r.json');
    expect(row.attachments[0].display).toBe('inline');

    // 비우기 — 행 · 파일 다 지움(첨부 파일은 비우기 뒤 다시 복사된 상황을 흉내)
    const files = (db.prepare('SELECT DISTINCT path FROM board.attachment').all() as { path: string }[]).map((r) => r.path);
    svc.wipe(root);
    expect(svc.stats().posts).toBe(0);
    for (const f of files) expect(existsSync(join(dir, 'files', f))).toBe(false);

    // 첨부 폴더를 되돌린 뒤 가져오기(여기서는 한 파일만 되돌려 "없는 파일은 건너뜀" 도 본다)
    const back = svc.store!;
    await back.save(Readable.from([PNG]), 1000, ['png']);
    const r = svc.importJsonl(lines, root);
    expect(r).toEqual({ posts: 2, comments: 1, attachments: 1, skippedFiles: 1 });
    const list = svc.list({});
    expect(list.total).toBe(1); // 지운 글은 지운 채로
    const v = svc.get(list.items[0]!.id, kim);
    expect(v.context).toEqual({ path: '/x', _importedId: p.id });
    expect(v.reactions).toBe(1);
    expect(v.attachmentList[0]!.display).toBe('inline');
    expect(v.commentList[0]!.attachments).toEqual([]);
    expect(() => svc.importJsonl(['not json'], root)).toThrowError(/BOARD_IMPORT_FORMAT/);
  });
  it('비밀 댓글 — 글쓴이 · 쓴 사람 · 운영자만 본문 · 첨부를 본다, 남에게는 있다는 것만', async () => {
    const p = svc.create({ category: 'question', title: 'q', body: 'b' }, kim);
    const c = svc.addComment(p.id, '비밀 말', lee, true);
    expect(c.private).toBe(true);
    expect(c.hidden).toBe(false);
    const att = await svc.addAttachment({ kind: 'comment', id: c.id }, Readable.from([PNG]), { name: 'a.png', display: 'file' }, lee);
    const other = { name: 'park', moderator: false };
    const seen = (a: typeof kim) => svc.get(p.id, a).commentList[0]!;
    expect(seen(kim).body).toBe('비밀 말'); // 글쓴이
    expect(seen(lee).body).toBe('비밀 말'); // 쓴 사람
    expect(seen(root).body).toBe('비밀 말'); // 운영자
    const hidden = seen(other);
    expect(hidden.hidden).toBe(true);
    expect(hidden.body).toBe('');
    expect(hidden.attachments).toEqual([]);
    expect(hidden.author).toBe('lee'); // 쓴 사람은 보인다
    expect(svc.get(p.id, other).comments).toBe(1); // 수는 센다
    expect(() => svc.openAttachment(att.id, other)).toThrowError(/BOARD_NOT_FOUND/);
    expect(svc.openAttachment(att.id, kim).row.id).toBe(att.id);
    // 내보내기 → 가져오기에도 비밀이 따라간다
    const lines = [...svc.exportJsonl()];
    const rec = JSON.parse(lines[1]!) as { comments: { private: number }[] };
    expect(rec.comments[0]!.private).toBe(1);
    svc.wipe(root);
    svc.importJsonl(lines, root);
    const again = svc.list({ closed: 'all' }).items[0]!;
    expect(svc.get(again.id, other).commentList[0]!.hidden).toBe(true);
  });
  it('미리보기 · 보이기 바꾸기 · 댓글 고치기', async () => {
    const p = svc.create({ category: 'bug', title: 't', body: 'b' }, kim);
    const a = await svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([PNG]), { name: 'big.png', display: 'inline' }, kim);
    expect(a.preview).toBe(false);
    // 미리보기 — 그림 첨부에만, 올린 사람만, 종류는 매직 바이트
    await expect(svc.addPreview(a.id, Readable.from([PNG]), lee)).rejects.toThrowError(/BOARD_FORBIDDEN/);
    await expect(svc.addPreview(a.id, Readable.from([Buffer.from('not image')]), kim)).rejects.toThrowError(/BOARD_ATTACH_KIND/);
    const pv = await svc.addPreview(a.id, Readable.from([PNG]), kim);
    expect(pv.preview).toBe(true);
    const o = svc.openAttachment(a.id, lee, true);
    expect(o.mime).toBe('image/png');
    expect(o.disposition).toBe('inline');
    const txt = await svc.addAttachment({ kind: 'post', id: p.id }, Readable.from([Buffer.from('plain text')]), { name: 'a.txt' }, kim);
    await expect(svc.addPreview(txt.id, Readable.from([PNG]), kim)).rejects.toThrowError(/BOARD_INVALID/);
    // 보이기 바꾸기 — 그림은 양쪽, 그림이 아니면 inline 불가, 남은 못 바꾼다
    expect(svc.setAttachmentDisplay(a.id, 'file', kim).display).toBe('file');
    expect(svc.openAttachment(a.id, kim).disposition).toBe('attachment');
    expect(svc.setAttachmentDisplay(a.id, 'inline', root).display).toBe('inline');
    expect(() => svc.setAttachmentDisplay(txt.id, 'inline', kim)).toThrowError(/BOARD_INVALID/);
    expect(() => svc.setAttachmentDisplay(a.id, 'file', lee)).toThrowError(/BOARD_FORBIDDEN/);
    // 지우면 원본 · 미리보기 파일 모두(같은 내용이라 한 파일) — 다른 행이 안 쓰면
    const abs = svc.openAttachment(a.id, kim).abs;
    svc.removeAttachment(a.id, kim);
    expect(existsSync(abs)).toBe(false);
    // 댓글 고치기 — 쓴 사람만, updated_at · canEdit
    const c = svc.addComment(p.id, '처음', lee, true);
    expect(c.canEdit).toBe(true);
    expect(c.updatedAt).toBeNull();
    expect(() => svc.updateComment(c.id, '남이', kim)).toThrowError(/BOARD_FORBIDDEN/);
    const u = svc.updateComment(c.id, '고침', lee);
    expect(u.body).toBe('고침');
    expect(u.private).toBe(true);
    expect(u.updatedAt).not.toBeNull();
    expect(svc.get(p.id, kim).commentList[0]!.canEdit).toBe(false);
    expect(events.some((e) => e.type === 'comment.updated')).toBe(true);
  });
});
