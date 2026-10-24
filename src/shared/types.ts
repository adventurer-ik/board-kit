/**
 * 서버와 화면이 같이 쓰는 모양 — API 응답의 정본.
 * 여기에는 호스트(어떤 제품인지)에 대한 지식이 없다. 맥락(context)은 호스트가 넣는 JSON 그대로다.
 */

/** 갈래 코드 — 이름은 사전(ko/en)이 붙인다. 호스트가 목록을 바꿀 수 있다 */
export type Category = string;
export const DEFAULT_CATEGORIES: readonly Category[] = ['idea', 'tip', 'question', 'bug'];

/** 본문 형식 — 지금은 text 하나. markdown 은 열만 미리 둔다 */
export type BodyFormat = 'text';

/** 첨부 종류 — 매직 바이트로 판정한 결과 */
export type AttachKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'pdf' | 'zip' | 'gzip' | 'pcap' | 'pcapng' | 'text' | 'json' | 'binary';
/** 본문 아래 그림으로 펼쳐 보일 수 있는 종류 — svg 는 스크립트가 들어갈 수 있어 늘 파일 */
export const INLINE_KINDS: readonly AttachKind[] = ['png', 'jpeg', 'gif', 'webp'];
/** 보이기 방식 — 그림이면 글쓴이가 고르고, 그림이 아니면 늘 file */
export type AttachDisplay = 'inline' | 'file';

export interface AttachmentView {
  id: number;
  name: string;
  kind: AttachKind;
  mime: string;
  bytes: number;
  display: AttachDisplay;
  /** 줄인 미리보기가 있는가 — 있으면 본문에는 `?preview=1` 을 보이고 누르면 원본 */
  preview: boolean;
  createdAt: string;
}

export interface PostSummary {
  id: number;
  category: Category;
  title: string;
  author: string;
  context: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string | null;
  /** 완료 표시(목록 거르기용) — 보기 · 댓글 · 고치기는 그대로 된다 */
  closedAt: string | null;
  comments: number;
  reactions: number;
  attachments: number;
}

export interface CommentView {
  id: number;
  postId: number;
  author: string;
  body: string;
  bodyFormat: BodyFormat;
  createdAt: string;
  attachments: AttachmentView[];
  /** 고친 시각(고친 적 없으면 null) */
  updatedAt: string | null;
  /** 보는 사람이 고칠 수 있는가(쓴 사람) */
  canEdit: boolean;
  /** 비밀 댓글 — 글쓴이 · 쓴 사람 · 운영자만 본문을 본다 */
  private: boolean;
  /** 보는 사람에게 숨겨진 비밀 댓글(body '' · 첨부 []) — 있다는 것과 쓴 사람만 보인다 */
  hidden: boolean;
  /** 보는 사람이 지울 수 있는가(본인 또는 운영자) */
  canDelete: boolean;
}

export interface PostView extends PostSummary {
  body: string;
  bodyFormat: BodyFormat;
  closedBy: string | null;
  reactedByMe: boolean;
  reactedBy: string[];
  attachmentList: AttachmentView[];
  commentList: CommentView[];
  canEdit: boolean;
  canClose: boolean;
  canDelete: boolean;
}

export interface ListQuery {
  category?: Category;
  /** 맥락의 한 키로 거르기 — 예: contextKey=path, contextValue=/deploys */
  contextKey?: string;
  contextValue?: string;
  author?: string;
  q?: string;
  closed?: 'open' | 'closed' | 'all';
  /** keyset — 이 id 보다 작은 글부터 */
  before?: number;
  limit?: number;
}

export interface ListResult {
  items: PostSummary[];
  /** 다음 쪽이 있으면 그 before 값 */
  next: number | null;
  total: number;
}

export interface BoardMe {
  name: string;
  moderator: boolean;
}

export interface BoardConfig {
  enabled: boolean;
  /** 게시판 파일을 못 열어 사용 불가(서버는 정상) — since 부터, message 는 원인. 없으면 null */
  unavailable?: { since: string; message: string } | null;
  categories: Category[];
  attach: { maxFiles: number; maxBytes: number; kinds: AttachKind[] } | null;
  me: BoardMe | null;
}

/** 맥락 값으로 거를 때 쓰는 목록 — 어떤 키에 어떤 값들이 쓰였는지 */
export interface ContextFacet {
  value: string;
  count: number;
}
