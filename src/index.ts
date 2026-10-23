/**
 * board-kit — 작은 소통 게시판.
 *  core  : 틀 없는 본체(BoardService + 호스트 계약)
 *  nest  : NestJS 어댑터(BoardModule.register)
 *  web   : React 화면 — `board-kit/web` 로 따로 가져간다(번들러가 소스를 읽는다)
 */
export * from './shared';
export * from './core';
export * from './nest';
