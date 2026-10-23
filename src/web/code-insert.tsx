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
    // DOM 값과 커서를 먼저 동기로 넣고 상태를 바꾼다 — React 는 값이 같으면 다시 쓰지 않아 커서가 그대로 남는다
    // (상태를 먼저 바꾸고 다음 틱에 커서를 옮기면, 그 사이 들어온 입력이 끝에 붙는다)
    if (el) {
      el.value = text;
      el.setSelectionRange(caret, caret);
      el.focus();
    }
    onChange(text);
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
