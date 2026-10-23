import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PostView } from '../shared/types';
import { AttachPicker, ErrorLine, uploadPending, usePending } from './attachments';
import { useBoard } from './context';
import type { DictKey } from './i18n';
import { Button, Dialog, Input, Label, Select, Textarea } from './ui';

export interface ComposeProps {
  open: boolean;
  onClose: () => void;
  /** 고치기면 그 글 — 없으면 새 글 */
  post?: PostView;
  /** 새 글이 만들어진 뒤(id) — 호스트가 그 글로 이동 */
  onCreated?: (id: number) => void;
  /** 창 제목 덮기 — 머리의 말풍선에서 열면 "이 화면에 대해 적기" */
  title?: string;
  /** 글에 붙일 맥락 덮기 — 없으면 Provider 의 context() */
  context?: Record<string, unknown>;
}

/**
 * 글 쓰기 · 고치기 창. 새 글은 "글 만들기 → 첨부 올리기" 두 단계로 간다(첨부는 글 id 가 있어야 붙는다).
 * 첨부 하나가 실패하면 글은 남고 그 줄에 이유가 남는다 — 다시 [올리기] 를 누르면 실패한 것만 다시.
 */
export function ComposeDialog(p: ComposeProps) {
  const { api, t, context } = useBoard();
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['board', 'config'], queryFn: api.config });
  const categories = cfg.data?.categories ?? [];

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const pending = usePending(cfg.data?.attach ?? null);

  useEffect(() => {
    if (!p.open) return;
    setTitle(p.post?.title ?? '');
    setBody(p.post?.body ?? '');
    setCategory(p.post?.category ?? categories[0] ?? '');
    setCreatedId(null);
    pending.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.post?.id, categories.length]);

  const ctx = p.context ?? context();
  const save = useMutation({
    mutationFn: async () => {
      let id = p.post?.id ?? createdId;
      if (p.post) await api.update(p.post.id, { category, title, body });
      else if (id === null) {
        const created = await api.create({ category, title, body, context: ctx });
        id = created.id;
        setCreatedId(id);
      }
      const failed = await uploadPending(api, { kind: 'post', id: id! }, pending);
      return { id: id!, failed };
    },
    onSuccess: ({ id, failed }) => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      if (failed) return; // 창을 열어 두고 실패한 줄을 보인다
      p.onClose();
      if (!p.post) p.onCreated?.(id);
    },
  });

  const ready = title.trim().length > 0 && body.trim().length > 0 && !!category;
  const ctxEntries = Object.entries(ctx).filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      title={p.title ?? (p.post ? t('edit') : t('write'))}
      wide
      footer={
        <>
          <Button onClick={p.onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {p.post ? t('save') : t('submit')}
          </Button>
        </>
      }
    >
      {!p.post && ctxEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{t('context')}</span>
          {ctxEntries.map(([k, v]) => (
            <span key={k} className="rounded border bg-background px-2 py-0.5 font-mono text-foreground">
              {k}: {String(v)}
            </span>
          ))}
          {cfg.data?.me && (
            <span className="ml-auto">
              {t('author')} {cfg.data.me.name}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-3 flex flex-col gap-1.5">
          <Label htmlFor="bk-title">{t('fTitle')}</Label>
          <Input id="bk-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-cat">{t('fCategory')}</Label>
          <Select id="bk-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {catName(t, c)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bk-body">{t('fBody')}</Label>
        <Textarea id="bk-body" value={body} maxLength={20_000} onChange={(e) => setBody(e.target.value)} className="min-h-44 font-[inherit]" />
        <p className="m-0 text-xs text-muted-foreground">{t('bodyHint')}</p>
      </div>
      <AttachPicker pending={pending} rule={cfg.data?.attach ?? null} existing={p.post?.attachmentList.length ?? 0} />
      <ErrorLine error={save.error} />
    </Dialog>
  );
}

/** 갈래 코드 → 이름. 사전에 없는 코드(호스트가 더한 갈래)는 코드 그대로 */
export function catName(t: (k: DictKey) => string, code: string): string {
  const k = `cat_${code}` as DictKey;
  const s = t(k);
  return s === k ? code : s;
}
