import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Lock, ThumbsUp } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CommentView } from '../shared/types';
import { AttachmentList, AttachPicker, ErrorLine, uploadPending, usePending } from './attachments';
import { Body } from './body';
import { catName, ComposeDialog } from './compose';
import { CodeInsert } from './code-insert';
import { useBoard } from './context';
import { Badge, Button, Label, Textarea, cn } from './ui';

export interface PostProps {
  id: number;
  onBack: () => void;
  /** 글이 지워진 뒤 — 보통 목록으로 */
  onDeleted?: () => void;
}

/** 글 보기 — 머리(갈래 · 맥락 · 제목 · 글쓴이 · 동작) · 본문 · 첨부 · 공감 · 댓글 */
export function PostDetail({ id, onBack, onDeleted }: PostProps) {
  const { api, t, formatTime } = useBoard();
  const qc = useQueryClient();
  const post = useQuery({ queryKey: ['board', 'post', id], queryFn: () => api.get(id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['board', 'post', id] });
    void qc.invalidateQueries({ queryKey: ['board', 'posts'] });
  };
  const close = useMutation({ mutationFn: (closed: boolean) => api.close(id, closed), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.remove(id), onSuccess: () => (refresh(), onDeleted?.()) });
  const react = useMutation({ mutationFn: () => api.react(id), onSuccess: refresh });
  const [editing, setEditing] = useState(false);

  const p = post.data;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <button type="button" onClick={onBack} className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        {t('back')}
      </button>
      <ErrorLine error={post.error ?? close.error ?? remove.error ?? react.error} />
      {p && (
        <article className="flex flex-col gap-4">
          <header className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={p.category}>{catName(t, p.category)}</Badge>
              {Object.entries(p.context ?? {})
                .filter(([k]) => !k.startsWith('_'))
                .map(([k, v]) => (
                  <span key={k} className="rounded border px-2 py-0.5 font-mono text-xs text-muted-foreground" title={k}>
                    {String(v)}
                  </span>
                ))}
              {p.closedAt && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {t('closed')} · {t('closedBy', { by: p.closedBy ?? '' })}
                </span>
              )}
            </div>
            <h1 className="m-0 text-2xl leading-snug font-semibold tracking-tight">{p.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{p.author}</span>
              <span>{formatTime(p.createdAt)}</span>
              {p.updatedAt && <span>({formatTime(p.updatedAt)})</span>}
              <span className="ml-auto flex gap-2">
                {p.canEdit && (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    {t('edit')}
                  </Button>
                )}
                {p.canClose && p.category !== 'tip' && ( // 경험(tip) 글에는 "완료" 가 어색하다
                  <Button size="sm" onClick={() => close.mutate(!p.closedAt)} disabled={close.isPending}>
                    {p.closedAt ? t('reopen') : t('close')}
                  </Button>
                )}
                {p.canDelete && (
                  <Button size="sm" variant="danger" onClick={() => window.confirm(t('removeConfirm')) && remove.mutate()} disabled={remove.isPending}>
                    {t('remove')}
                  </Button>
                )}
              </span>
            </div>
          </header>

          <Body text={p.body} />
          <AttachmentList items={p.attachmentList} canRemove={p.canEdit} onRemoved={refresh} />

          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={() => react.mutate()} className={cn('rounded-full', p.reactedByMe && 'border-primary/40 bg-primary/10 text-primary')} aria-pressed={p.reactedByMe}>
              <ThumbsUp className="size-3.5" />
              {p.reactions}
            </Button>
            {p.reactedBy.length > 0 && <span className="text-xs text-muted-foreground">{t('reactedBy', { names: p.reactedBy.join(' · ') })}</span>}
          </div>

          <Comments postId={id} postAuthor={p.author} items={p.commentList} onChanged={refresh} />
        </article>
      )}
      {p && <ComposeDialog open={editing} onClose={() => setEditing(false)} post={p} />}
    </div>
  );
}

function Comments({ postId, postAuthor, items, onChanged }: { postId: number; postAuthor: string; items: CommentView[]; onChanged: () => void }) {
  const { api, t, formatTime } = useBoard();
  const cfg = useQuery({ queryKey: ['board', 'config'], queryFn: api.config });
  const [body, setBody] = useState('');
  const [priv, setPriv] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const pending = usePending(cfg.data?.attach ?? null);
  const add = useMutation({
    mutationFn: async () => {
      const c = await api.comment(postId, body, priv);
      const failed = await uploadPending(api, { kind: 'comment', id: c.id }, pending);
      return failed;
    },
    onSuccess: (failed) => {
      setBody('');
      setPriv(false);
      if (!failed) pending.reset();
      onChanged();
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => api.removeComment(id), onSuccess: onChanged });

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <h2 className="m-0 text-base font-semibold">{t('comments', { n: items.length })}</h2>
      {items.map((c, i) => (
        <div key={c.id} className={cn('flex flex-col gap-1.5 rounded-lg border px-3.5 py-3', i % 2 === 1 && 'bg-muted/30')}>
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{c.author}</span>
            {c.author === postAuthor && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{t('author')}</span>}
            {c.private && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-800 dark:text-amber-300" title={t('commentPrivateHint')}>
                <Lock className="size-3" />
                {t('privateBadge')}
              </span>
            )}
            <span>{formatTime(c.createdAt)}</span>
            {c.canDelete && (
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-muted-foreground" onClick={() => window.confirm(t('removeCommentConfirm')) && remove.mutate(c.id)}>
                {t('remove')}
              </Button>
            )}
          </div>
          {c.hidden ? (
            <p className="m-0 text-sm text-muted-foreground italic">{t('privateHidden')}</p>
          ) : (
            <>
              <Body text={c.body} className="flex flex-col gap-2 [&_p]:text-sm [&_p]:leading-6" />
              <AttachmentList items={c.attachments} canRemove={c.canDelete} onRemoved={onChanged} />
            </>
          )}
        </div>
      ))}
      <div className="mt-1 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="bk-comment">{t('commentWrite')}</Label>
          <CodeInsert textarea={commentRef} value={body} onChange={setBody} />
        </div>
        <Textarea id="bk-comment" ref={commentRef} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder={t('commentPlaceholder')} className="min-h-20" />
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <AttachPicker pending={pending} rule={cfg.data?.attach ?? null} />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 self-end pb-2 text-xs text-muted-foreground" title={t('commentPrivateHint')}>
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <Lock className="size-3" />
            {t('commentPrivate')}
          </label>
          <Button variant="primary" className="self-end" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
            {t('commentSubmit')}
          </Button>
        </div>
        <ErrorLine error={add.error ?? remove.error} />
      </div>
    </section>
  );
}
