/**
 * 본문 형식 `text` 의 해석 — 평문 + 줄바꿈 + 자동 링크 + 울타리 블록.
 * 서버는 저장만 하고, 화면이 이 함수로 조각을 만들어 그린다(순수 함수 · 의존성 0).
 *
 *   보통 글
 *   ```json
 *   {"a":1}
 *   ```
 *
 * → [{ kind:'text', ... }, { kind:'fence', lang:'json', code:'{\n  "a": 1\n}', pretty:true }]
 *
 * 울타리 꼬리표(```py ```node ```html …)는 langs.ts 표로 하나의 이름에 맞춘다 — 색 입히기는 화면(web/highlight.ts)이 한다.
 */
import { normalizeLang } from './langs';
export type Segment =
  | { kind: 'text'; parts: TextPart[] }
  | { kind: 'fence'; lang: string | null; code: string; /** json 울타리를 정렬했는가(파싱 실패면 false) */ pretty: boolean };

export type TextPart = { kind: 'plain'; text: string } | { kind: 'link'; href: string };

const FENCE = /^```([A-Za-z0-9_#+-]*)[ \t]*$/;
const URL = /https?:\/\/[^\s<>"'`]+/g;

export function parseBody(body: string): Segment[] {
  const out: Segment[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let text: string[] = [];
  let fence: { lang: string | null; lines: string[] } | null = null;

  const flushText = () => {
    if (!text.length) return;
    const joined = text.join('\n');
    if (joined.trim()) out.push({ kind: 'text', parts: linkify(joined) });
    text = [];
  };

  for (const line of lines) {
    const m = FENCE.exec(line);
    if (fence) {
      if (m && m[1] === '') {
        out.push(finishFence(fence));
        fence = null;
      } else fence.lines.push(line);
      continue;
    }
    if (m) {
      flushText();
      fence = { lang: normalizeLang(m[1]), lines: [] };
      continue;
    }
    text.push(line);
  }
  // 닫히지 않은 울타리는 그래도 상자로 — 쓰다 만 글이 글자 더미로 보이지 않게
  if (fence) out.push(finishFence(fence));
  flushText();
  return out;
}

function finishFence(f: { lang: string | null; lines: string[] }): Segment {
  const raw = f.lines.join('\n');
  if (f.lang === 'json') {
    const pretty = prettyJson(raw);
    if (pretty !== null) return { kind: 'fence', lang: 'json', code: pretty, pretty: true };
  }
  return { kind: 'fence', lang: f.lang, code: raw, pretty: false };
}

/** JSON 이면 2칸 들여쓰기로 다시 정렬, 아니면 null */
export function prettyJson(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

/** `http(s)://` 만 링크로 — 뒤에 붙은 문장 부호는 링크에서 뺀다 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  // 이웃한 평문은 하나로 합친다(링크 뒤 꼬리 문장 부호 + 다음 글)
  const plain = (t: string) => {
    if (!t) return;
    const prev = parts[parts.length - 1];
    if (prev && prev.kind === 'plain') prev.text += t;
    else parts.push({ kind: 'plain', text: t });
  };
  let last = 0;
  for (const m of text.matchAll(URL)) {
    let href = m[0];
    let trail = '';
    while (/[.,;:!?)\]}>]$/.test(href)) {
      trail = href.slice(-1) + trail;
      href = href.slice(0, -1);
    }
    const start = m.index;
    if (start > last) plain(text.slice(last, start));
    parts.push({ kind: 'link', href });
    plain(trail);
    last = start + m[0].length;
  }
  plain(text.slice(last));
  return parts;
}
