import type { AttachDisplay, AttachmentView, BoardConfig, CommentView, ContextFacet, ListQuery, ListResult, PostView } from '../shared/types';

/**
 * 호스트가 주는 요청 함수 — 쿠키 · CSRF · 오류 모양은 호스트 것. 없으면 기본 fetch.
 * body 가 Blob 이면 파일 그대로(application/octet-stream), 아니면 JSON.
 * 오류는 `.code` 를 가진 Error 로 던져야 한다(BoardError 의 JSON 그대로 — 기본 fetcher 가 그렇게 한다).
 */
export type Fetcher = <T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<T>;

export class BoardApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const defaultFetcher: Fetcher = async (method, path, body) => {
  const raw = body instanceof Blob;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json';
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) {
    const { code, ...detail } = json;
    throw new BoardApiError(res.status, typeof code === 'string' ? code : `HTTP-${res.status}`, detail);
  }
  return json as never;
};

/** 경로 조립 + 형 — 화면이 부르는 전부 */
export class BoardApi {
  constructor(
    readonly base: string,
    private readonly f: Fetcher,
  ) {}

  config = () => this.f<BoardConfig>('GET', `${this.base}/config`);
  list = (q: ListQuery) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    const s = p.toString();
    return this.f<ListResult>('GET', `${this.base}/posts${s ? `?${s}` : ''}`);
  };
  facets = (key: string) => this.f<ContextFacet[]>('GET', `${this.base}/posts/facets?key=${encodeURIComponent(key)}`);
  get = (id: number) => this.f<PostView>('GET', `${this.base}/posts/${id}`);
  create = (b: { category: string; title: string; body: string; context?: Record<string, unknown> }) => this.f<PostView>('POST', `${this.base}/posts`, b);
  update = (id: number, b: { category: string; title: string; body: string }) => this.f<PostView>('PUT', `${this.base}/posts/${id}`, b);
  close = (id: number, closed: boolean) => this.f<PostView>('POST', `${this.base}/posts/${id}/close`, { closed });
  remove = (id: number) => this.f<void>('DELETE', `${this.base}/posts/${id}`);
  comment = (id: number, body: string, priv = false) => this.f<CommentView>('POST', `${this.base}/posts/${id}/comments`, { body, private: priv });
  updateComment = (id: number, body: string) => this.f<CommentView>('PUT', `${this.base}/comments/${id}`, { body });
  removeComment = (id: number) => this.f<void>('DELETE', `${this.base}/comments/${id}`);
  react = (id: number) => this.f<{ reactions: number; reactedByMe: boolean }>('POST', `${this.base}/posts/${id}/react`);
  attach = (owner: { kind: 'post' | 'comment'; id: number }, file: File, display: AttachDisplay) =>
    this.f<AttachmentView>('POST', `${this.base}/${owner.kind}s/${owner.id}/attachments?name=${encodeURIComponent(file.name)}&display=${display}`, file);
  attachPreview = (id: number, blob: Blob) => this.f<AttachmentView>('POST', `${this.base}/attachments/${id}/preview`, blob);
  setAttachmentDisplay = (id: number, display: AttachDisplay) => this.f<AttachmentView>('PATCH', `${this.base}/attachments/${id}`, { display });
  removeAttachment = (id: number) => this.f<void>('DELETE', `${this.base}/attachments/${id}`);
  attachmentUrl = (id: number, preview = false) => `${this.base}/attachments/${id}${preview ? '?preview=1' : ''}`;
  exportUrl = () => `${this.base}/export`;
}

export function errorCode(e: unknown): string {
  const c = (e as { code?: unknown } | undefined)?.code;
  return typeof c === 'string' ? c : 'unknown';
}
