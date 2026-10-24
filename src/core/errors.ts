/**
 * 게시판 오류 — 코드 + HTTP 상태. 화면은 코드로 문구를 고른다(호스트 사전과 무관).
 */
export type BoardErrorCode =
  | 'BOARD_DISABLED'
  | 'BOARD_UNAUTHORIZED'
  | 'BOARD_FORBIDDEN'
  | 'BOARD_NOT_FOUND'
  | 'BOARD_INVALID'
  | 'BOARD_ATTACH_OFF'
  | 'BOARD_ATTACH_TOO_MANY'
  | 'BOARD_ATTACH_TOO_BIG'
  | 'BOARD_ATTACH_KIND'
  | 'BOARD_IMPORT_FORMAT'
  | 'BOARD_UNAVAILABLE'
  | 'BOARD_INTERNAL';

const STATUS: Record<BoardErrorCode, number> = {
  BOARD_DISABLED: 403,
  BOARD_UNAUTHORIZED: 401,
  BOARD_FORBIDDEN: 403,
  BOARD_NOT_FOUND: 404,
  BOARD_INVALID: 400,
  BOARD_ATTACH_OFF: 403,
  BOARD_ATTACH_TOO_MANY: 400,
  BOARD_ATTACH_TOO_BIG: 413,
  BOARD_ATTACH_KIND: 415,
  BOARD_IMPORT_FORMAT: 400,
  /** 게시판 파일을 못 열었다(손상 · 권한) — 서버는 멀쩡, 게시판만. 고치면 되살아난다 */
  BOARD_UNAVAILABLE: 503,
  /** 게시판 안의 다른 DB 오류 */
  BOARD_INTERNAL: 500,
};

export class BoardError extends Error {
  readonly status: number;
  constructor(
    readonly code: BoardErrorCode,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.status = STATUS[code];
  }
  toJSON() {
    return { code: this.code, ...this.detail };
  }
}
