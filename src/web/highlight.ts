/**
 * 울타리 블록 색 입히기 — highlight.js 를 늦게(처음 울타리를 그릴 때) 불러 쓴다.
 * 본체는 한 번, 문법은 포맷마다 한 번만 받는다 — 게시판 첫 묶음에는 안 들어간다.
 * 결과 HTML 은 highlight.js 가 글자를 모두 이스케이프한 것이라 그대로 넣어도 안전하다.
 */
import type { HLJSApi, LanguageFn } from 'highlight.js';
import { useEffect, useState } from 'react';
import { canHighlight } from '../shared/langs';

type Loader = () => Promise<{ default: LanguageFn }>;

/** langs.ts 의 id ↔ 문법 모듈. 표에 더하면 여기도 한 줄 */
const GRAMMAR: Record<string, Loader> = {
  json: () => import('highlight.js/lib/languages/json'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  php: () => import('highlight.js/lib/languages/php'),
  java: () => import('highlight.js/lib/languages/java'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  bash: () => import('highlight.js/lib/languages/bash'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  sql: () => import('highlight.js/lib/languages/sql'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  http: () => import('highlight.js/lib/languages/http'),
  diff: () => import('highlight.js/lib/languages/diff'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
};

/** 이보다 긴 코드는 색을 안 입힌다(느려지고, 그런 글은 보통 로그 덤프) */
const MAX_CHARS = 30_000;

let core: Promise<HLJSApi> | null = null;
const loaded = new Set<string>();

async function engine(lang: string): Promise<HLJSApi | null> {
  const loader = GRAMMAR[lang];
  if (!loader) return null;
  core ??= import('highlight.js/lib/core').then((m) => m.default);
  const hljs = await core;
  if (!loaded.has(lang)) {
    hljs.registerLanguage(lang, (await loader()).default);
    loaded.add(lang);
  }
  return hljs;
}

/** 색 입힌 HTML — 못 하면(모르는 포맷 · 너무 김 · 불러오기 실패) null */
export async function highlight(code: string, lang: string | null): Promise<string | null> {
  if (!lang || !canHighlight(lang) || code.length > MAX_CHARS) return null;
  try {
    const hljs = await engine(lang);
    if (!hljs) return null;
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

/** 화면용 — 처음엔 null(평문으로 보임), 준비되면 색 입힌 HTML */
export function useHighlight(code: string, lang: string | null): string | null {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    void highlight(code, lang).then((h) => alive && h && setHtml(h));
    return () => {
      alive = false;
    };
  }, [code, lang]);
  return html;
}

/**
 * 토큰 색 — 밝은/어두운 두 벌. 호스트는 <html class="dark"> 를 쓰거나 `--bk-hl-*` 변수를 덮어 바꾼다.
 * 스타일 한 장을 문서 머리에 한 번만 넣는다(패키지가 CSS 파일을 따로 요구하지 않게).
 */
const STYLE_ID = 'bk-highlight-style';
const STYLE = `
.bk-hl{--bk-hl-comment:#6b7280;--bk-hl-keyword:#7c3aed;--bk-hl-string:#15803d;--bk-hl-number:#b45309;--bk-hl-name:#1d4ed8;--bk-hl-attr:#0f766e;--bk-hl-meta:#9333ea;--bk-hl-del:#b91c1c;--bk-hl-ins:#15803d;--bk-hl-del-bg:rgba(239,68,68,.12);--bk-hl-ins-bg:rgba(34,197,94,.14)}
.dark .bk-hl{--bk-hl-comment:#9ca3af;--bk-hl-keyword:#c4b5fd;--bk-hl-string:#86efac;--bk-hl-number:#fcd34d;--bk-hl-name:#93c5fd;--bk-hl-attr:#5eead4;--bk-hl-meta:#d8b4fe;--bk-hl-del:#fca5a5;--bk-hl-ins:#86efac}
.bk-hl .hljs-comment,.bk-hl .hljs-quote{color:var(--bk-hl-comment);font-style:italic}
.bk-hl .hljs-keyword,.bk-hl .hljs-selector-tag,.bk-hl .hljs-literal,.bk-hl .hljs-doctag,.bk-hl .hljs-built_in,.bk-hl .hljs-type{color:var(--bk-hl-keyword)}
.bk-hl .hljs-string,.bk-hl .hljs-regexp,.bk-hl .hljs-template-tag,.bk-hl .hljs-symbol{color:var(--bk-hl-string)}
.bk-hl .hljs-number,.bk-hl .hljs-variable,.bk-hl .hljs-template-variable,.bk-hl .hljs-link{color:var(--bk-hl-number)}
.bk-hl .hljs-title,.bk-hl .hljs-title.function_,.bk-hl .hljs-title.class_,.bk-hl .hljs-section,.bk-hl .hljs-name,.bk-hl .hljs-selector-id,.bk-hl .hljs-selector-class{color:var(--bk-hl-name)}
.bk-hl .hljs-attr,.bk-hl .hljs-attribute,.bk-hl .hljs-property,.bk-hl .hljs-params,.bk-hl .hljs-selector-attr,.bk-hl .hljs-selector-pseudo,.bk-hl .hljs-bullet{color:var(--bk-hl-attr)}
.bk-hl .hljs-meta,.bk-hl .hljs-meta .hljs-keyword,.bk-hl .hljs-tag{color:var(--bk-hl-meta)}
.bk-hl .hljs-deletion{color:var(--bk-hl-del);background:var(--bk-hl-del-bg)}
.bk-hl .hljs-addition{color:var(--bk-hl-ins);background:var(--bk-hl-ins-bg)}
.bk-hl .hljs-emphasis{font-style:italic}.bk-hl .hljs-strong{font-weight:600}
`;

export function ensureHighlightStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE;
  document.head.appendChild(el);
}
