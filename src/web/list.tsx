import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Search, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import type { ListQuery, PostSummary } from '../shared/types';
import { AttachIcon, ErrorLine } from './attachments';
import { catName } from './compose';
import { useBoard } from './context';
import { Badge, Button, Chip, Input, Select, cn } from './ui';

export interface ListProps {
  onOpen: (id: number) => void;
  /** 처음 열 때 맥락 거르기(예: 지금 화면) */
  initialContextValue?: string;
}

/** 목록 — 갈래 칩 · 검색 · 맥락 고르기 · 닫힌 글 토글 · 더 보기(keyset) */
export function BoardList({ onOpen, initialContextValue }: ListProps) {
  const { api, t, formatTime, contextKey } = useBoard();
  const [category, setCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [ctxValue, setCtxValue] = useState(initialContextValue ?? '');
  const [closed, setClosed] = useState<'open' | 'all'>('open');
  const [pages, setPages] = useState<number[]>([]); // before 값들 — 더 보기

  const cfg = useQuery({ queryKey: ['board', 'config'], queryFn: api.config });
  const facets = useQuery({ queryKey: ['board', 'facets', contextKey], queryFn: () => api.facets(contextKey) });
  const base: ListQuery = { category: category || undefined, q: q || undefined, contextKey: ctxValue ? contextKey : undefined, contextValue: ctxValue || undefined, closed };
  const first = useQuery({ queryKey: ['board', 'posts', base], queryFn: () => api.list(base) });
  const more = useQuery({
    queryKey: ['board', 'posts', base, pages],
    queryFn: async () => {
      const all: PostSummary[] = [];
      let next: number | null = null;
      for (const before of pages) {
        const r = await api.list({ ...base, before });
        all.push(...r.items);
        next = r.next;
      }
      return { items: all, next };
    },
    enabled: pages.length > 0,
  });

  const items = [...(first.data?.items ?? []), ...(more.data?.items ?? [])];
  const next = pages.length ? more.data?.next ?? null : first.data?.next ?? null;
  const total = first.data?.total ?? 0;
  const resetPages = () => setPages([]);
  const filtered = !!(category || q || ctxValue || closed !== 'open');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={!category} onClick={() => (setCategory(''), resetPages())}>
          {t('all')}
        </Chip>
        {(cfg.data?.categories ?? []).map((c) => (
          <Chip key={c} on={category === c} onClick={() => (setCategory(c), resetPages())}>
            {catName(t, c)}
          </Chip>
        ))}
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qLive.trim());
            resetPages();
          }}
        >
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder={t('search')} className="w-72 pl-8" aria-label={t('search')} />
        </form>
        <Select value={ctxValue} onChange={(e) => (setCtxValue(e.target.value), resetPages())} className="w-44" aria-label={t('colContext')}>
          <option value="">{t('anyContext')}</option>
          {(facets.data ?? []).map((f) => (
            <option key={f.value} value={f.value}>
              {f.value} ({f.count})
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={closed === 'all'} onChange={(e) => (setClosed(e.target.checked ? 'all' : 'open'), resetPages())} />
          {t('showClosed')}
        </label>
      </div>

      <ErrorLine error={first.error} />

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="hidden border-b px-4 py-2 text-xs font-semibold text-muted-foreground md:grid md:grid-cols-[88px_minmax(0,1fr)_150px_120px_130px_100px]">
          <div>{t('colCategory')}</div>
          <div>{t('colTitle')}</div>
          <div>{t('colContext')}</div>
          <div>{t('colAuthor')}</div>
          <div>{t('colAt')}</div>
          <div className="text-right">{t('colReactions')}</div>
        </div>
        {first.isSuccess && items.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">{filtered ? t('emptyFiltered') : t('empty')}</div>}
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className={cn('grid w-full cursor-pointer grid-cols-1 gap-1 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent/60 md:grid-cols-[88px_minmax(0,1fr)_150px_120px_130px_100px] md:items-center md:gap-0', p.closedAt && 'opacity-60')}
          >
            <div>
              <Badge tone={p.category}>{catName(t, p.category)}</Badge>
            </div>
            <div className="flex min-w-0 items-center gap-2 font-medium">
              <span className="truncate">{p.title}</span>
              {p.closedAt && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{t('closed')}</span>}
              <AttachIcon n={p.attachments} />
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">{String(p.context?.[contextKey] ?? '')}</div>
            <div className="text-[13px]">{p.author}</div>
            <div className="text-xs text-muted-foreground">{formatTime(p.createdAt)}</div>
            <div className="flex gap-3 text-xs text-muted-foreground md:justify-end">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3.5" />
                {p.comments}
              </span>
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="size-3.5" />
                {p.reactions}
              </span>
            </div>
          </button>
        ))}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{t('countOf', { total, shown: items.length })}</span>
          {next && (
            <Button size="sm" onClick={() => setPages((ps) => [...ps, next])}>
              {t('more')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
