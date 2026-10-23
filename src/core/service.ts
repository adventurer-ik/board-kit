import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import {
  type AttachDisplay, type AttachmentView, type BoardConfig, type Category, type CommentView, type ContextFacet, DEFAULT_CATEGORIES, INLINE_KINDS,
  type ListQuery, type ListResult, type PostSummary, type PostView,
} from '../shared/types';
import { BoardError } from './errors';
import { AttachStore } from './files';
import type { Actor, BoardEvent, BoardEventType, BoardHost } from './host';
import { attachAndMigrate } from './migrate';
import { type AttachmentRow, BoardRepo, type CommentRow, type PostRow } from './repo';
import { MIME } from './sniff';
import { now } from './time';

export const LIMITS = { title: 200, body: 20_000, comment: 5_000, page: 50, pageMax: 200 } as const;

export interface PostInput {
  category: Category;
  title: string;
  body: string;
  /** 화면이 보낸 맥락 — 호스트 context() 가 위에 덮인다 */
  context?: Record<string, unknown>;
}

/**
 * 게시판 규칙 — 틀(Nest · HTTP)과 무관한 본체. 호스트 계약(BoardHost) 하나로 바깥과 만난다.
 * 이 클래스는 요청(req)을 모른다 — 어댑터가 actor · context 를 뽑아 넘긴다.
 */
export class BoardService {
  readonly repo: BoardRepo;
  readonly store: AttachStore | null;
  readonly categories: readonly Category[];

  constructor(private readonly host: BoardHost) {
    attachAndMigrate(host.db, host.file);
    this.repo = new BoardRepo(host.db);
    this.store = host.attach ? new AttachStore(host.attach.dir) : null;
    this.categories = host.categories?.length ? host.categories : DEFAULT_CATEGORIES;
  }

  // ── 문 ──
  /** 꺼져 있으면 모든 길을 막는다 */
  assertEnabled(): void {
    if (!this.host.enabled()) throw new BoardError('BOARD_DISABLED');
  }

  config(actor: Actor | null): BoardConfig {
    const a = this.host.attach;
    return {
      enabled: this.host.enabled(),
      categories: [...this.categories],
      attach: a ? { maxFiles: a.maxFiles, maxBytes: a.maxBytes, kinds: [...a.kinds] } : null,
      me: actor ? { name: actor.name, moderator: actor.moderator } : null,
    };
  }

  // ── 글 ──
  list(q: ListQuery): ListResult {
    const limit = Math.min(Math.max(1, q.limit ?? LIMITS.page), LIMITS.pageMax);
    q = { ...q, closed: q.closed ?? 'open' }; // 기본은 열린 글만 — 닫힌 글은 골라서 본다
    const rows = this.repo.list(q, limit + 1);
    const more = rows.length > limit;
    const items = rows.slice(0, limit).map(summary);
    return { items, next: more ? items[items.length - 1]!.id : null, total: this.repo.count(q) };
  }

  facets(contextKey: string): ContextFacet[] {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(contextKey)) throw new BoardError('BOARD_INVALID', { field: 'contextKey' });
    return this.repo.facets(contextKey);
  }

  get(id: number, actor: Actor): PostView {
    const p = this.live(id);
    const reactedBy = this.repo.reactedBy(id);
    const atts = this.repo.attachmentsOfPost(id);
    const comments = this.repo.comments(id).map((c) => commentView(c, atts.filter((a) => a.owner_kind === 'comment' && a.owner_id === c.id), actor));
    return {
      ...summary(p),
      body: p.body,
      bodyFormat: 'text',
      closedBy: p.closed_by,
      reactedByMe: reactedBy.includes(actor.name),
      reactedBy,
      attachmentList: atts.filter((a) => a.owner_kind === 'post').map(attachmentView),
      commentList: comments,
      canEdit: p.author === actor.name && !p.closed_at,
      canClose: p.author === actor.name || actor.moderator,
      canDelete: p.author === actor.name || actor.moderator,
    };
  }

  create(input: PostInput, actor: Actor, hostContext: Record<string, unknown> = {}): PostView {
    const v = this.validatePost(input);
    const context = { ...(input.context ?? {}), ...hostContext };
    const id = this.repo.insertPost({ ...v, author: actor.name, context: Object.keys(context).length ? JSON.stringify(context) : null });
    this.emit('post.created', actor, { postId: id, title: v.title, postAuthor: actor.name });
    return this.get(id, actor);
  }

  update(id: number, input: PostInput, actor: Actor): PostView {
    const p = this.live(id);
    if (p.author !== actor.name) throw new BoardError('BOARD_FORBIDDEN');
    if (p.closed_at) throw new BoardError('BOARD_CLOSED');
    const v = this.validatePost(input);
    this.repo.updatePost(id, v);
    this.emit('post.updated', actor, { postId: id, title: v.title, postAuthor: p.author });
    return this.get(id, actor);
  }

  close(id: number, actor: Actor, closed: boolean): PostView {
    const p = this.live(id);
    this.mayModerate(p.author, actor);
    this.repo.closePost(id, closed ? actor.name : null);
    this.emit(closed ? 'post.closed' : 'post.reopened', actor, { postId: id, title: p.title, postAuthor: p.author });
    return this.get(id, actor);
  }

  remove(id: number, actor: Actor): void {
    const p = this.live(id);
    this.mayModerate(p.author, actor);
    this.repo.deletePost(id, actor.name);
    this.emit('post.deleted', actor, { postId: id, title: p.title, postAuthor: p.author });
  }

  // ── 댓글 ──
  addComment(postId: number, body: string, actor: Actor): CommentView {
    const p = this.live(postId);
    const b = (body ?? '').trim();
    if (!b || b.length > LIMITS.comment) throw new BoardError('BOARD_INVALID', { field: 'body', max: LIMITS.comment });
    const id = this.repo.insertComment(postId, b, actor.name);
    this.emit('comment.created', actor, { postId, commentId: id, title: p.title, postAuthor: p.author });
    return commentView(this.repo.comment(id)!, [], actor);
  }

  removeComment(id: number, actor: Actor): void {
    const c = this.repo.comment(id);
    if (!c || c.deleted_at) throw new BoardError('BOARD_NOT_FOUND');
    this.mayModerate(c.author, actor);
    this.repo.deleteComment(id, actor.name);
    const p = this.repo.post(c.post_id);
    this.emit('comment.deleted', actor, { postId: c.post_id, commentId: id, title: p?.title, postAuthor: p?.author });
  }

  // ── 반응 ──
  react(postId: number, actor: Actor): { reactions: number; reactedByMe: boolean } {
    const p = this.live(postId);
    const on = this.repo.toggleReaction(postId, actor.name);
    this.emit('reaction.changed', actor, { postId, title: p.title, postAuthor: p.author, detail: { on } });
    return { reactions: this.repo.reactedBy(postId).length, reactedByMe: on };
  }

  // ── 첨부 ──
  async addAttachment(owner: { kind: 'post' | 'comment'; id: number }, input: Readable, meta: { name: string; display?: AttachDisplay }, actor: Actor): Promise<AttachmentView> {
    const rule = this.host.attach;
    if (!rule || !this.store) {
      input.resume();
      throw new BoardError('BOARD_ATTACH_OFF');
    }
    const ownerAuthor = this.ownerAuthor(owner);
    if (ownerAuthor !== actor.name && !actor.moderator) {
      input.resume();
      throw new BoardError('BOARD_FORBIDDEN');
    }
    if (this.repo.attachments(owner.kind, owner.id).length >= rule.maxFiles) {
      input.resume();
      throw new BoardError('BOARD_ATTACH_TOO_MANY', { max: rule.maxFiles });
    }
    const name = safeName(meta.name);
    const stored = await this.store.save(input, rule.maxBytes, rule.kinds);
    // 그림만 inline 을 고를 수 있다 — 그림이 아니면(svg 포함) 늘 file
    const display: AttachDisplay = meta.display === 'inline' && INLINE_KINDS.includes(stored.kind) ? 'inline' : 'file';
    const id = this.repo.insertAttachment({ owner_kind: owner.kind, owner_id: owner.id, name, kind: stored.kind, mime: MIME[stored.kind], bytes: stored.bytes, sha256: stored.sha256, display, path: stored.path });
    return attachmentView(this.repo.attachment(id)!);
  }

  removeAttachment(id: number, actor: Actor): void {
    const a = this.repo.attachment(id);
    if (!a || a.deleted_at) throw new BoardError('BOARD_NOT_FOUND');
    this.mayModerate(this.ownerAuthor({ kind: a.owner_kind, id: a.owner_id }), actor);
    this.repo.deleteAttachment(id);
    if (this.store && !this.repo.sha256InUse(a.sha256)) this.store.remove(a.path);
  }

  /** 내려주기 — 어댑터가 파일을 흘린다. inline 그림만 그림 MIME, 나머지는 받기(attachment) */
  openAttachment(id: number): { abs: string; row: AttachmentRow; disposition: 'inline' | 'attachment' } {
    const a = this.repo.attachment(id);
    if (!a || a.deleted_at || !this.store) throw new BoardError('BOARD_NOT_FOUND');
    const post = a.owner_kind === 'post' ? this.repo.post(a.owner_id) : this.repo.post(this.repo.comment(a.owner_id)?.post_id ?? -1);
    if (!post || post.deleted_at) throw new BoardError('BOARD_NOT_FOUND');
    const inline = a.display === 'inline' && INLINE_KINDS.includes(a.kind);
    return { abs: this.store.abs(a.path), row: a, disposition: inline ? 'inline' : 'attachment' };
  }

  // ── 내보내기 · 가져오기 · 비우기 ──
  /** JSONL — 글 하나가 한 줄(댓글 · 반응 · 첨부 메타 포함). 첨부 파일은 첨부 폴더를 그대로 복사하면 내용 주소로 맞는다 */
  *exportJsonl(): Generator<string> {
    yield JSON.stringify({ kind: 'board-kit', version: 1, exportedAt: now(), stats: this.repo.stats() });
    for (const r of this.repo.allPosts()) {
      const { comments: _c, reactions: _r, attachments: _a, comment_list, reaction_list, attachment_list, ...post } = r;
      yield JSON.stringify({ ...post, comments: JSON.parse(comment_list), reactions: JSON.parse(reaction_list), attachments: JSON.parse(attachment_list) });
    }
  }

  /** 가져오기 — 새 id 로 붙인다(원래 id 는 context._importedId 에 남긴다). 첨부는 파일이 폴더에 있어야 행을 만든다 */
  importJsonl(lines: Iterable<string>, actor: Actor): { posts: number; comments: number; attachments: number; skippedFiles: number } {
    const out = { posts: 0, comments: 0, attachments: 0, skippedFiles: 0 };
    const rows: Record<string, unknown>[] = [];
    let first = true;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new BoardError('BOARD_IMPORT_FORMAT', { reason: 'json' });
      }
      if (first) {
        first = false;
        if (o['kind'] === 'board-kit') continue;
      }
      if (typeof o['title'] !== 'string' || typeof o['body'] !== 'string' || typeof o['author'] !== 'string') throw new BoardError('BOARD_IMPORT_FORMAT', { reason: 'fields' });
      rows.push(o);
    }
    this.repo.transaction(() => {
      for (const o of rows) {
        const ctx = { ...(o['context'] ? (JSON.parse(String(o['context'])) as Record<string, unknown>) : {}), _importedId: o['id'] };
        const id = this.repo.insertPost({ category: String(o['category'] ?? this.categories[0]), title: String(o['title']), body: String(o['body']), author: String(o['author']), context: JSON.stringify(ctx) });
        this.copyTimes('post', id, o);
        out.posts++;
        for (const a of (o['attachments'] as Record<string, unknown>[] | undefined) ?? []) out.attachments += this.importAttachment('post', id, a, out);
        for (const c of (o['comments'] as Record<string, unknown>[] | undefined) ?? []) {
          const cid = this.repo.insertComment(id, String(c['body']), String(c['author']));
          this.copyTimes('comment', cid, c);
          out.comments++;
          for (const a of (c['attachments'] as Record<string, unknown>[] | undefined) ?? []) out.attachments += this.importAttachment('comment', cid, a, out);
        }
        for (const r of (o['reactions'] as Record<string, unknown>[] | undefined) ?? []) {
          try {
            this.host.db.prepare(`INSERT OR IGNORE INTO board.reaction (post_id, author, kind, created_at) VALUES (?, ?, ?, ?)`).run(id, String(r['author']), String(r['kind'] ?? 'up'), String(r['created_at'] ?? now()));
          } catch {
            /* 반응은 없어도 글은 살린다 */
          }
        }
      }
    });
    this.emit('import.done', actor, { detail: out });
    return out;
  }

  wipe(actor: Actor): void {
    const rows = this.store ? (this.host.db.prepare(`SELECT DISTINCT path FROM board.attachment`).all() as { path: string }[]) : [];
    this.repo.wipe();
    for (const r of rows) this.store!.remove(r.path);
    this.emit('wipe', actor, {});
  }

  stats() {
    return this.repo.stats();
  }

  // ── 안 ──
  private live(id: number): PostRow {
    const p = this.repo.post(id);
    if (!p || p.deleted_at) throw new BoardError('BOARD_NOT_FOUND');
    return p;
  }

  private mayModerate(owner: string, actor: Actor): void {
    if (owner !== actor.name && !actor.moderator) throw new BoardError('BOARD_FORBIDDEN');
  }

  private ownerAuthor(owner: { kind: 'post' | 'comment'; id: number }): string {
    if (owner.kind === 'post') return this.live(owner.id).author;
    const c = this.repo.comment(owner.id);
    if (!c || c.deleted_at) throw new BoardError('BOARD_NOT_FOUND');
    this.live(c.post_id);
    return c.author;
  }

  private validatePost(input: PostInput): { category: Category; title: string; body: string } {
    const title = (input.title ?? '').trim();
    const body = (input.body ?? '').replace(/\r\n?/g, '\n').trim();
    if (!title || title.length > LIMITS.title) throw new BoardError('BOARD_INVALID', { field: 'title', max: LIMITS.title });
    if (!body || body.length > LIMITS.body) throw new BoardError('BOARD_INVALID', { field: 'body', max: LIMITS.body });
    if (!this.categories.includes(input.category)) throw new BoardError('BOARD_INVALID', { field: 'category', allowed: this.categories });
    return { category: input.category, title, body };
  }

  private copyTimes(table: 'post' | 'comment', id: number, o: Record<string, unknown>): void {
    const cols = table === 'post' ? ['created_at', 'updated_at', 'closed_at', 'closed_by', 'deleted_at', 'deleted_by'] : ['created_at', 'deleted_at', 'deleted_by'];
    const sets = cols.filter((c) => o[c] !== undefined && o[c] !== null);
    if (!sets.length) return;
    this.host.db.prepare(`UPDATE board.${table} SET ${sets.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...sets.map((c) => String(o[c])), id);
  }

  private importAttachment(kind: 'post' | 'comment', ownerId: number, a: Record<string, unknown>, out: { skippedFiles: number }): number {
    const path = String(a['path'] ?? '');
    if (!this.store || !path || !this.store.exists(path)) {
      out.skippedFiles++;
      return 0;
    }
    this.repo.insertAttachment({
      owner_kind: kind, owner_id: ownerId, name: safeName(String(a['name'] ?? 'file')), kind: a['kind'] as AttachmentRow['kind'], mime: String(a['mime'] ?? 'application/octet-stream'),
      bytes: Number(a['bytes'] ?? this.store.size(path)), sha256: String(a['sha256'] ?? ''), display: a['display'] === 'inline' ? 'inline' : 'file', path,
    });
    return 1;
  }

  private emit(type: BoardEventType, actor: Actor, e: Omit<BoardEvent, 'type' | 'at' | 'actor'>): void {
    try {
      this.host.onEvent?.({ type, at: now(), actor: actor.name, ...e });
    } catch {
      /* 호스트 알림 실패가 글쓰기를 막지 않는다 */
    }
  }
}

// ── 행 → 화면 모양 ──
function summary(p: PostRow): PostSummary {
  let context: Record<string, unknown> | null = null;
  if (p.context) {
    try {
      context = JSON.parse(p.context) as Record<string, unknown>;
    } catch {
      context = null;
    }
  }
  return { id: p.id, category: p.category, title: p.title, author: p.author, context, createdAt: p.created_at, updatedAt: p.updated_at, closedAt: p.closed_at, comments: p.comments, reactions: p.reactions, attachments: p.attachments };
}

function commentView(c: CommentRow, atts: AttachmentRow[], actor: Actor): CommentView {
  return { id: c.id, postId: c.post_id, author: c.author, body: c.body, bodyFormat: 'text', createdAt: c.created_at, attachments: atts.map(attachmentView), canDelete: c.author === actor.name || actor.moderator };
}

function attachmentView(a: AttachmentRow): AttachmentView {
  return { id: a.id, name: a.name, kind: a.kind, mime: a.mime, bytes: a.bytes, display: a.display, createdAt: a.created_at };
}

/** 화면용 이름 — 경로 글자 · 제어 문자를 빼고 200자로 */
export function safeName(name: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return clean || `file-${randomUUID().slice(0, 8)}`;
}
