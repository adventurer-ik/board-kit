import type Database from 'better-sqlite3';
import type { AttachDisplay, AttachKind, Category, ListQuery } from '../shared/types';
import { SCHEMA as S } from './migrate';
import { now } from './time';

/** DB 행 모양 — 표 열 그대로(snake_case). 화면 모양으로 바꾸는 것은 service 가 한다 */
export interface PostRow {
  id: number; category: string; title: string; body: string; body_format: string; author: string; context: string | null;
  created_at: string; updated_at: string | null; closed_at: string | null; closed_by: string | null; deleted_at: string | null; deleted_by: string | null;
  comments: number; reactions: number; attachments: number;
}
export interface CommentRow { id: number; post_id: number; body: string; body_format: string; author: string; private: number; created_at: string; updated_at: string | null; deleted_at: string | null }
export interface AttachmentRow {
  id: number; owner_kind: 'post' | 'comment'; owner_id: number; name: string; kind: AttachKind; mime: string; bytes: number; sha256: string; display: AttachDisplay; path: string; preview_path: string | null; preview_bytes: number | null; created_at: string; deleted_at: string | null;
}

const POST_COLS = `p.*,
  (SELECT COUNT(*) FROM ${S}.comment c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comments,
  (SELECT COUNT(*) FROM ${S}.reaction r WHERE r.post_id = p.id) AS reactions,
  (SELECT COUNT(*) FROM ${S}.attachment a WHERE a.owner_kind = 'post' AND a.owner_id = p.id AND a.deleted_at IS NULL) AS attachments`;

/** SQL 만 — 규칙(권한 · 닫힘 · 한도)은 service 에 */
export class BoardRepo {
  constructor(private readonly db: Database.Database) {}

  // ── 글 ──
  private where(q: ListQuery): { sql: string; args: unknown[] } {
    const cond = ['p.deleted_at IS NULL'];
    const args: unknown[] = [];
    if (q.category) { cond.push('p.category = ?'); args.push(q.category); }
    if (q.author) { cond.push('p.author = ?'); args.push(q.author); }
    if (q.contextKey && q.contextValue !== undefined) { cond.push("json_extract(p.context, '$.' || ?) = ?"); args.push(q.contextKey, q.contextValue); }
    if (q.closed === 'open') cond.push('p.closed_at IS NULL');
    if (q.closed === 'closed') cond.push('p.closed_at IS NOT NULL');
    if (q.q) {
      const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      cond.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' OR p.author LIKE ? ESCAPE '\\')");
      args.push(like, like, like);
    }
    return { sql: cond.join(' AND '), args };
  }

  list(q: ListQuery, limit: number): PostRow[] {
    const w = this.where(q);
    const before = q.before ? ' AND p.id < ?' : '';
    return this.db
      .prepare(`SELECT ${POST_COLS} FROM ${S}.post p WHERE ${w.sql}${before} ORDER BY p.id DESC LIMIT ?`)
      .all(...w.args, ...(q.before ? [q.before] : []), limit) as PostRow[];
  }

  count(q: ListQuery): number {
    const w = this.where(q);
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM ${S}.post p WHERE ${w.sql}`).get(...w.args) as { n: number }).n;
  }

  facets(key: string): { value: string; count: number }[] {
    return this.db
      .prepare(`SELECT json_extract(context, '$.' || ?) AS value, COUNT(*) AS count FROM ${S}.post WHERE deleted_at IS NULL AND value IS NOT NULL GROUP BY value ORDER BY count DESC, value LIMIT 200`)
      .all(key) as { value: string; count: number }[];
  }

  post(id: number): PostRow | undefined {
    return this.db.prepare(`SELECT ${POST_COLS} FROM ${S}.post p WHERE p.id = ?`).get(id) as PostRow | undefined;
  }

  insertPost(p: { category: Category; title: string; body: string; author: string; context: string | null }): number {
    const r = this.db
      .prepare(`INSERT INTO ${S}.post (category, title, body, author, context) VALUES (?, ?, ?, ?, ?)`)
      .run(p.category, p.title, p.body, p.author, p.context);
    return Number(r.lastInsertRowid);
  }

  updatePost(id: number, p: { category: Category; title: string; body: string }): void {
    this.db.prepare(`UPDATE ${S}.post SET category = ?, title = ?, body = ?, updated_at = ? WHERE id = ?`).run(p.category, p.title, p.body, now(), id);
  }

  closePost(id: number, by: string | null): void {
    this.db.prepare(`UPDATE ${S}.post SET closed_at = ?, closed_by = ? WHERE id = ?`).run(by ? now() : null, by, id);
  }

  deletePost(id: number, by: string): void {
    this.db.prepare(`UPDATE ${S}.post SET deleted_at = ?, deleted_by = ? WHERE id = ?`).run(now(), by, id);
  }

  // ── 댓글 ──
  comments(postId: number): CommentRow[] {
    return this.db.prepare(`SELECT * FROM ${S}.comment WHERE post_id = ? AND deleted_at IS NULL ORDER BY id`).all(postId) as CommentRow[];
  }
  comment(id: number): CommentRow | undefined {
    return this.db.prepare(`SELECT * FROM ${S}.comment WHERE id = ?`).get(id) as CommentRow | undefined;
  }
  insertComment(postId: number, body: string, author: string, priv = false): number {
    return Number(this.db.prepare(`INSERT INTO ${S}.comment (post_id, body, author, private) VALUES (?, ?, ?, ?)`).run(postId, body, author, priv ? 1 : 0).lastInsertRowid);
  }
  deleteComment(id: number, by: string): void {
    this.db.prepare(`UPDATE ${S}.comment SET deleted_at = ?, deleted_by = ? WHERE id = ?`).run(now(), by, id);
  }

  // ── 반응 ──
  reactedBy(postId: number): string[] {
    return (this.db.prepare(`SELECT author FROM ${S}.reaction WHERE post_id = ? AND kind = 'up' ORDER BY created_at`).all(postId) as { author: string }[]).map((r) => r.author);
  }
  toggleReaction(postId: number, author: string): boolean {
    const del = this.db.prepare(`DELETE FROM ${S}.reaction WHERE post_id = ? AND author = ? AND kind = 'up'`).run(postId, author);
    if (del.changes > 0) return false;
    this.db.prepare(`INSERT INTO ${S}.reaction (post_id, author, kind) VALUES (?, ?, 'up')`).run(postId, author);
    return true;
  }

  // ── 첨부 ──
  attachments(kind: 'post' | 'comment', ownerId: number): AttachmentRow[] {
    return this.db.prepare(`SELECT * FROM ${S}.attachment WHERE owner_kind = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY id`).all(kind, ownerId) as AttachmentRow[];
  }
  attachmentsOfPost(postId: number): AttachmentRow[] {
    return this.db
      .prepare(`SELECT a.* FROM ${S}.attachment a WHERE a.deleted_at IS NULL AND ((a.owner_kind = 'post' AND a.owner_id = ?) OR (a.owner_kind = 'comment' AND a.owner_id IN (SELECT id FROM ${S}.comment WHERE post_id = ? AND deleted_at IS NULL))) ORDER BY a.id`)
      .all(postId, postId) as AttachmentRow[];
  }
  attachment(id: number): AttachmentRow | undefined {
    return this.db.prepare(`SELECT * FROM ${S}.attachment WHERE id = ?`).get(id) as AttachmentRow | undefined;
  }
  insertAttachment(a: Omit<AttachmentRow, 'id' | 'created_at' | 'deleted_at' | 'preview_path' | 'preview_bytes'> & { preview_path?: string | null; preview_bytes?: number | null }): number {
    return Number(
      this.db
        .prepare(`INSERT INTO ${S}.attachment (owner_kind, owner_id, name, kind, mime, bytes, sha256, display, path, preview_path, preview_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(a.owner_kind, a.owner_id, a.name, a.kind, a.mime, a.bytes, a.sha256, a.display, a.path, a.preview_path ?? null, a.preview_bytes ?? null).lastInsertRowid,
    );
  }
  setPreview(id: number, path: string, bytes: number): void {
    this.db.prepare(`UPDATE ${S}.attachment SET preview_path = ?, preview_bytes = ? WHERE id = ?`).run(path, bytes, id);
  }
  setDisplay(id: number, display: AttachDisplay): void {
    this.db.prepare(`UPDATE ${S}.attachment SET display = ? WHERE id = ?`).run(display, id);
  }
  /** 그 디스크 파일을 아직 쓰는 행이 있는가(원본 path 또는 미리보기) — 있으면 파일은 남긴다 */
  pathInUse(path: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM ${S}.attachment WHERE deleted_at IS NULL AND (path = ? OR preview_path = ?) LIMIT 1`).get(path, path);
  }
  updateComment(id: number, body: string): void {
    this.db.prepare(`UPDATE ${S}.comment SET body = ?, updated_at = ? WHERE id = ?`).run(body, now(), id);
  }
  deleteAttachment(id: number): void {
    this.db.prepare(`UPDATE ${S}.attachment SET deleted_at = ? WHERE id = ?`).run(now(), id);
  }
  /** 같은 내용(sha256)을 아직 쓰는 다른 행이 있는가 — 있으면 디스크 파일은 남긴다 */
  sha256InUse(sha256: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM ${S}.attachment WHERE sha256 = ? AND deleted_at IS NULL LIMIT 1`).get(sha256);
  }

  // ── 내보내기 · 통계 · 비우기 ──
  /** 지운 글도 포함(deleted_at 그대로) — 옮긴 뒤에도 같은 상태 */
  allPosts(): Iterable<PostRow & { comment_list: string; reaction_list: string; attachment_list: string }> {
    return this.db
      .prepare(
        `SELECT p.*, 0 AS comments, 0 AS reactions, 0 AS attachments,
           (SELECT json_group_array(json_object('id', c.id, 'body', c.body, 'body_format', c.body_format, 'author', c.author, 'private', c.private, 'created_at', c.created_at, 'updated_at', c.updated_at, 'deleted_at', c.deleted_at, 'deleted_by', c.deleted_by,
              'attachments', (SELECT json_group_array(json_object('name', a.name, 'kind', a.kind, 'mime', a.mime, 'bytes', a.bytes, 'sha256', a.sha256, 'display', a.display, 'path', a.path, 'preview_path', a.preview_path, 'preview_bytes', a.preview_bytes, 'created_at', a.created_at))
                              FROM ${S}.attachment a WHERE a.owner_kind = 'comment' AND a.owner_id = c.id AND a.deleted_at IS NULL)))
            FROM ${S}.comment c WHERE c.post_id = p.id ORDER BY c.id) AS comment_list,
           (SELECT json_group_array(json_object('author', r.author, 'kind', r.kind, 'created_at', r.created_at)) FROM ${S}.reaction r WHERE r.post_id = p.id) AS reaction_list,
           (SELECT json_group_array(json_object('name', a.name, 'kind', a.kind, 'mime', a.mime, 'bytes', a.bytes, 'sha256', a.sha256, 'display', a.display, 'path', a.path, 'preview_path', a.preview_path, 'preview_bytes', a.preview_bytes, 'created_at', a.created_at))
            FROM ${S}.attachment a WHERE a.owner_kind = 'post' AND a.owner_id = p.id AND a.deleted_at IS NULL) AS attachment_list
         FROM ${S}.post p ORDER BY p.id`,
      )
      .iterate() as Iterable<PostRow & { comment_list: string; reaction_list: string; attachment_list: string }>;
  }

  stats(): { posts: number; comments: number; attachments: number; bytes: number } {
    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      posts: n(`SELECT COUNT(*) AS n FROM ${S}.post WHERE deleted_at IS NULL`),
      comments: n(`SELECT COUNT(*) AS n FROM ${S}.comment WHERE deleted_at IS NULL`),
      attachments: n(`SELECT COUNT(*) AS n FROM ${S}.attachment WHERE deleted_at IS NULL`),
      bytes: n(`SELECT COALESCE(SUM(bytes), 0) AS n FROM ${S}.attachment WHERE deleted_at IS NULL`),
    };
  }

  wipe(): void {
    this.db.transaction(() => {
      for (const t of ['attachment', 'reaction', 'comment', 'post']) this.db.exec(`DELETE FROM ${S}.${t}`);
    })();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
