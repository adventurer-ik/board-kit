import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { langLabel } from '../shared/langs';
import { parseBody, type Segment } from '../shared/text';
import { useBoard } from './context';
import { ensureHighlightStyle, useHighlight } from './highlight';
import { Button } from './ui';

/** 본문 그리기 — 평문은 줄바꿈 그대로 + 링크, 울타리는 고정폭 상자(포맷 이름 + 색 + 복사). json 은 정렬 여부 표시 */
export function Body({ text, className }: { text: string; className?: string }) {
  const segs = parseBody(text);
  return (
    <div className={className ?? 'flex flex-col gap-3'}>
      {segs.map((s, i) => (s.kind === 'text' ? <TextSeg key={i} seg={s} /> : <Fence key={i} seg={s} />))}
    </div>
  );
}

function TextSeg({ seg }: { seg: Extract<Segment, { kind: 'text' }> }) {
  return (
    <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-7">
      {seg.parts.map((p, i) =>
        p.kind === 'link' ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            {p.href}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function Fence({ seg }: { seg: Extract<Segment, { kind: 'fence' }> }) {
  const { t } = useBoard();
  const [copied, setCopied] = useState(false);
  const html = useHighlight(seg.code, seg.lang);
  useEffect(ensureHighlightStyle, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(seg.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 막힘 */
    }
  };
  const lines = seg.code.split('\n').length;
  return (
    <figure className="m-0 overflow-hidden rounded-lg border bg-muted/40">
      <figcaption className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{langLabel(seg.lang)}</span>
          {seg.lang === 'json' && <span>{seg.pretty ? t('jsonPretty') : t('jsonBroken')}</span>}
          {lines > 1 && <span>{t('lines', { n: lines })}</span>}
        </span>
        <Button variant="ghost" size="sm" onClick={copy} aria-label={t('copy')}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </figcaption>
      {/* 색이 준비되기 전엔 평문으로 — 글은 늘 바로 보인다 */}
      {html ? (
        <pre className="bk-hl m-0 overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      ) : (
        <pre className="m-0 overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
          <code>{seg.code}</code>
        </pre>
      )}
    </figure>
  );
}
