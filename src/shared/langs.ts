/**
 * 울타리 블록의 포맷 표 — 글에 ```py ```node ```html 처럼 적은 꼬리표를 하나의 이름으로 맞춘다.
 * `id` 는 highlight.js 의 언어 이름과 같다(화면이 그 이름으로 문법 모듈을 늦게 불러 색을 입힌다).
 * 표에 없는 꼬리표는 그대로 두고(소문자) 색 없이 상자로만 보인다 — 글은 깨지지 않는다.
 */
export interface Lang {
  /** highlight.js 언어 이름 = 저장되는 꼬리표 */
  id: string;
  /** 화면에 보이는 이름 */
  label: string;
  /** 같은 뜻으로 받아 주는 다른 꼬리표 */
  aliases: string[];
}

export const LANGS: Lang[] = [
  { id: 'json', label: 'JSON', aliases: ['json5', 'jsonc'] },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'node', 'nodejs', 'mjs', 'cjs', 'jsx'] },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx'] },
  { id: 'python', label: 'Python', aliases: ['py', 'py3'] },
  { id: 'php', label: 'PHP', aliases: [] },
  { id: 'java', label: 'Java', aliases: [] },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt'] },
  { id: 'csharp', label: 'C#', aliases: ['cs', 'c#'] },
  { id: 'c', label: 'C', aliases: ['h'] },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cc', 'cxx', 'hpp'] },
  { id: 'go', label: 'Go', aliases: ['golang'] },
  { id: 'rust', label: 'Rust', aliases: ['rs'] },
  { id: 'ruby', label: 'Ruby', aliases: ['rb'] },
  { id: 'xml', label: 'HTML / XML', aliases: ['html', 'htm', 'xhtml', 'svg', 'xsl', 'xsd'] },
  { id: 'css', label: 'CSS', aliases: ['scss', 'less'] },
  { id: 'bash', label: 'Shell', aliases: ['sh', 'shell', 'zsh', 'console'] },
  { id: 'powershell', label: 'PowerShell', aliases: ['ps1', 'pwsh'] },
  { id: 'sql', label: 'SQL', aliases: ['sqlite', 'mysql', 'pgsql', 'postgres', 'postgresql'] },
  { id: 'yaml', label: 'YAML', aliases: ['yml'] },
  { id: 'ini', label: 'INI / TOML', aliases: ['toml', 'conf', 'cfg', 'properties'] },
  { id: 'dockerfile', label: 'Dockerfile', aliases: ['docker'] },
  { id: 'nginx', label: 'nginx', aliases: [] },
  { id: 'http', label: 'HTTP', aliases: [] },
  { id: 'diff', label: 'Diff', aliases: ['patch'] },
  { id: 'markdown', label: 'Markdown', aliases: ['md'] },
  { id: 'plaintext', label: 'Text', aliases: ['text', 'txt', 'plain', 'log'] },
];

const BY_TAG = new Map<string, Lang>();
for (const l of LANGS) {
  BY_TAG.set(l.id, l);
  for (const a of l.aliases) BY_TAG.set(a, l);
}

/** 꼬리표 → 표의 id. 표에 없으면 소문자 그대로, 빈 꼬리표는 null */
export function normalizeLang(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const k = tag.trim().toLowerCase();
  if (!k) return null;
  return BY_TAG.get(k)?.id ?? k;
}

/** 화면 이름 — 표에 없는 꼬리표는 그대로 */
export function langLabel(id: string | null): string {
  if (!id) return 'Text';
  return BY_TAG.get(id)?.label ?? id;
}

/** 색을 입힐 수 있는가(표에 있고 평문이 아님) */
export function canHighlight(id: string | null): boolean {
  return !!id && id !== 'plaintext' && BY_TAG.has(id);
}
