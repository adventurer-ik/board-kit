import type { RefObject } from 'react';
import { LANGS } from '../shared/langs';
import { useBoard } from './context';
import { Select } from './ui';

/**
 * "코드 넣기…" 고르기 — 고른 포맷의 ``` 울타리를 글자 상자의 선택 자리(없으면 커서 자리)에 넣는다.
 * 글 쓰기 창과 댓글 칸이 같이 쓴다. 울타리 안에 글자가 있으면 그 글자를 감싼다.
 */
export function CodeInsert({ textarea, value, onChange }: { textarea: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (next: string) => void }) {
  const { t } = useBoard();
  const insert = (lang: string) => {
    const el = textarea.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, caret } = wrapFence(value, start, end, lang);
    onChange(text);
    // 상태가 반영된 다음 틱에 커서를 울타리 안으로
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };
  return (
    <Select
      aria-label={t('insertCode')}
      title={t('insertCodeTitle')}
      value=""
      onChange={(e) => e.target.value && insert(e.target.value)}
      className="h-8 w-auto text-xs"
    >
      <option value="">{t('insertCode')}</option>
      {LANGS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </Select>
  );
}

/** 순수 함수 — [start, end) 를 ```lang 울타리로 감싼 본문과, 울타리 안 첫 자리(커서) */
export function wrapFence(value: string, start: number, end: number, lang: string): { text: string; caret: number } {
  const before = value.slice(0, start);
  const inner = value.slice(start, end);
  const after = value.slice(end);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const tail = after && !after.startsWith('\n') ? '\n' : '';
  const open = `${lead}\`\`\`${lang}\n`;
  const text = `${before}${open}${inner}\n\`\`\`${tail}${after}`;
  return { text, caret: before.length + open.length + inner.length };
}
