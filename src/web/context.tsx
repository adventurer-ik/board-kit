import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { BoardApi, defaultFetcher, type Fetcher } from './api';
import { type Dict, type DictKey, makeT } from './i18n';

export interface BoardProviderProps {
  /** API 접두어 — 서버 BoardModule.register 의 prefix 와 같게(앞에 / 를 붙여) */
  baseUrl: string;
  /** 호스트의 요청 함수(쿠키 · CSRF) — 없으면 기본 fetch */
  fetcher?: Fetcher;
  lang?: string;
  /** 사전 일부 덮기 — 예: title 을 제품 말로 */
  text?: Partial<Dict>;
  /** UTC 시각(YYYY-MM-DD HH:MM:SS) → 보이는 글자. 없으면 브라우저 시간대 */
  formatTime?: (utc: string) => string;
  /** 글 쓸 때 붙일 맥락 — 예: { path: location.pathname } */
  context?: () => Record<string, unknown>;
  /** 맥락 중 목록에 보이고 거를 키 — 기본 path */
  contextKey?: string;
  children: ReactNode;
}

export interface BoardCtx {
  api: BoardApi;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  formatTime: (utc: string) => string;
  context: () => Record<string, unknown>;
  contextKey: string;
}

const Ctx = createContext<BoardCtx | null>(null);

export function BoardProvider(p: BoardProviderProps) {
  const value = useMemo<BoardCtx>(
    () => ({
      api: new BoardApi(p.baseUrl.replace(/\/$/, ''), p.fetcher ?? defaultFetcher),
      t: makeT(p.lang ?? 'ko', p.text),
      formatTime: p.formatTime ?? localTime,
      context: p.context ?? (() => ({})),
      contextKey: p.contextKey ?? 'path',
    }),
    [p.baseUrl, p.fetcher, p.lang, p.text, p.formatTime, p.context, p.contextKey],
  );
  return <Ctx.Provider value={value}>{p.children}</Ctx.Provider>;
}

export function useBoard(): BoardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('board-kit: <BoardProvider> 안에서 써야 한다');
  return c;
}

function localTime(utc: string): string {
  const d = new Date(utc.includes('T') ? utc : `${utc.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return utc;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 바이트 → 사람 글자 */
export function bytesText(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
