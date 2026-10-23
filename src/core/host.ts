import type Database from 'better-sqlite3';
import type { AttachKind, Category } from '../shared/types';

/**
 * 호스트 계약 — 게시판이 바깥 세상에 요구하는 전부.
 * 이 밖의 것(어떤 제품인지 · 로그인 방식 · 알림 통로 · 감사 로그)은 게시판이 모른다.
 * 호스트는 이 객체 하나를 만들어 넘긴다(NestJS 면 BoardModule.register 의 host).
 */
export interface Actor {
  /** 글에 남는 이름 — 계정이 지워져도 글은 남으므로 글자로 둔다 */
  name: string;
  /** 운영자 — 남의 글을 닫고 지울 수 있다 */
  moderator: boolean;
}

export type BoardEventType =
  | 'post.created'
  | 'post.updated'
  | 'post.closed'
  | 'post.reopened'
  | 'post.deleted'
  | 'comment.created'
  | 'comment.deleted'
  | 'reaction.changed'
  | 'import.done'
  | 'wipe';

export interface BoardEvent {
  type: BoardEventType;
  at: string;
  actor: string;
  postId?: number;
  commentId?: number;
  /** 글 제목 — 알림 한 줄을 만들 때 */
  title?: string;
  /** 글쓴이 — "내 글에 댓글" 알림을 가르기 위해 */
  postAuthor?: string;
  detail?: Record<string, unknown>;
}

export interface AttachRule {
  /** 첨부 파일이 놓이는 폴더(호스트 데이터 폴더 아래) */
  dir: string;
  /** 글 · 댓글 하나에 붙일 수 있는 개수 */
  maxFiles: number;
  /** 한 개 크기 상한(바이트) */
  maxBytes: number;
  /** 받는 종류 — 매직 바이트로 판정한 결과가 여기 있어야 한다 */
  kinds: AttachKind[];
}

export interface BoardHost<Req = unknown> {
  /** better-sqlite3 커넥션 — 프로세스당 하나를 그대로 넘긴다. 게시판이 자기 파일을 ATTACH 한다 */
  db: Database.Database;
  /** 게시판 DB 파일 경로 — 없으면 만든다 */
  file: string;
  /** 첨부 규칙 — 없으면 첨부 기능 자체가 꺼진다 */
  attach?: AttachRule;
  /** 기능 스위치 — false 면 모든 API 가 403 과 코드 BOARD_DISABLED */
  enabled(): boolean;
  /** 요청의 주체 — null 이면 로그인 안 됨(401) */
  actor(req: Req): Actor | null;
  /** 글에 붙일 맥락 — 호스트가 정한다(예: 화면 경로 · 버전). 글 쓸 때 화면이 보낸 값과 합쳐진다 */
  context?(req: Req): Record<string, unknown>;
  /** 사건 알림 — 호스트가 실시간 알림 · 감사 로그로 옮긴다 */
  onEvent?(e: BoardEvent): void;
  /** 갈래 코드 — 기본 idea · tip · question · bug */
  categories?: Category[];
}
