import { useMutation } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, Paperclip, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AttachDisplay, AttachmentView, BoardConfig } from '../shared/types';
import { errorCode } from './api';
import { makePreview } from './preview';
import { bytesText, useBoard } from './context';
import type { DictKey } from './i18n';
import { Alert, Button, cn } from './ui';

/** 보기 — inline 그림은 펼쳐서(누르면 원본), 나머지는 파일 줄(이름 · 크기 · 받기) */
export function AttachmentList({ items, canRemove, onRemoved }: { items: AttachmentView[]; canRemove?: boolean; onRemoved?: () => void }) {
  const { api, t } = useBoard();
  const images = items.filter((a) => a.display === 'inline');
  const files = items.filter((a) => a.display !== 'inline');
  const remove = useMutation({ mutationFn: (id: number) => api.removeAttachment(id), onSuccess: () => onRemoved?.() });
  const toggle = useMutation({ mutationFn: (a: AttachmentView) => api.setAttachmentDisplay(a.id, a.display === 'inline' ? 'file' : 'inline'), onSuccess: () => onRemoved?.() });
  const isImage = (a: AttachmentView) => ['png', 'jpeg', 'gif', 'webp'].includes(a.kind);
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground">{t('images', { n: images.length })}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((a) => (
              <figure key={a.id} className="relative m-0 overflow-hidden rounded-lg border bg-muted/30">
                {/* 미리보기가 있으면 줄인 그림을 보이고, 누르면 원본 */}
                <a href={api.attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" title={t('original')}>
                  <img src={api.attachmentUrl(a.id, a.preview)} alt={a.name} className="max-h-72 w-full object-contain" loading="lazy" />
                </a>
                <figcaption className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto shrink-0">{bytesText(a.bytes)}</span>
                  {canRemove && (
                    <button type="button" className="shrink-0 cursor-pointer rounded border border-input px-1.5 py-0.5 text-[11px] hover:bg-accent" onClick={() => toggle.mutate(a)} disabled={toggle.isPending}>
                      {t('attachFile')}
                    </button>
                  )}
                </figcaption>
                {canRemove && (
                  <Button variant="ghost" size="icon" className="absolute top-1 right-1 size-7 bg-background/80" aria-label={t('attachRemove')} onClick={() => remove.mutate(a.id)}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground">{t('files', { n: files.length })}</div>
          <div className="overflow-hidden rounded-lg border">
            {files.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-[13px]">{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.kind}</span>
                <span className="ml-auto text-xs text-muted-foreground">{bytesText(a.bytes)}</span>
                <a href={api.attachmentUrl(a.id)} download={a.name} className="rounded-md border border-input px-2.5 py-1 text-xs font-semibold text-primary hover:bg-accent">
                  {t('download')}
                </a>
                {canRemove && isImage(a) && (
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent" onClick={() => toggle.mutate(a)} disabled={toggle.isPending} title={t('attachInline')}>
                    <ImageIcon className="size-3.5" />
                    {t('attachInline')}
                  </button>
                )}
                {canRemove && (
                  <Button variant="ghost" size="icon" className="size-7" aria-label={t('attachRemove')} onClick={() => remove.mutate(a.id)}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 올리기 전 고른 파일 — 그림이면 inline/file 을 고르고, 아니면 file 고정 */
export interface Pending {
  key: string;
  file: File;
  isImage: boolean;
  display: AttachDisplay;
  state: 'ready' | 'uploading' | 'done' | 'failed';
  error?: string;
}

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function usePending(rule: BoardConfig['attach']) {
  const [items, setItems] = useState<Pending[]>([]);
  const add = (files: FileList | File[]) => {
    const max = rule?.maxFiles ?? 0;
    setItems((cur) => {
      const next = [...cur];
      for (const f of Array.from(files)) {
        if (next.length >= max) break;
        const isImage = IMAGE_MIME.has(f.type);
        next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 6)}`, file: f, isImage, display: isImage ? 'inline' : 'file', state: 'ready' });
      }
      return next;
    });
  };
  const remove = (key: string) => setItems((cur) => cur.filter((p) => p.key !== key));
  const setDisplay = (key: string, display: AttachDisplay) => setItems((cur) => cur.map((p) => (p.key === key ? { ...p, display } : p)));
  const patch = (key: string, x: Partial<Pending>) => setItems((cur) => cur.map((p) => (p.key === key ? { ...p, ...x } : p)));
  const reset = () => setItems([]);
  return { items, add, remove, setDisplay, patch, reset };
}

/** 고른 파일을 차례로 올린다 — 하나가 실패해도 나머지는 올린다. 실패한 것은 표에 남아 다시 시도할 수 있다 */
export async function uploadPending(api: ReturnType<typeof useBoard>['api'], owner: { kind: 'post' | 'comment'; id: number }, pending: ReturnType<typeof usePending>): Promise<number> {
  let failed = 0;
  for (const p of pending.items) {
    if (p.state === 'done') continue;
    pending.patch(p.key, { state: 'uploading' });
    try {
      const saved = await api.attach(owner, p.file, p.display);
      pending.patch(p.key, { state: 'done' });
      // 큰 그림은 줄인 미리보기를 따로 올린다 — 실패해도 원본은 이미 붙었으니 조용히 넘어간다
      if (p.isImage) {
        try {
          const prev = await makePreview(p.file);
          if (prev) await api.attachPreview(saved.id, prev);
        } catch {
          /* 미리보기 없이 원본만 */
        }
      }
    } catch (e) {
      failed++;
      pending.patch(p.key, { state: 'failed', error: errorCode(e) });
    }
  }
  return failed;
}

export function AttachPicker({ pending, rule, existing = 0 }: { pending: ReturnType<typeof usePending>; rule: BoardConfig['attach']; existing?: number }) {
  const { t } = useBoard();
  const input = useRef<HTMLInputElement>(null);
  if (!rule) return null;
  const n = existing + pending.items.length;
  const full = n >= rule.maxFiles;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t('attach')}</span>
        <span className="text-xs text-muted-foreground">{t('attachRule', { n, max: rule.maxFiles, size: bytesText(rule.maxBytes) })}</span>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => e.target.files && (pending.add(e.target.files), (e.target.value = ''))} />
        <Button size="sm" className="ml-auto" disabled={full} onClick={() => input.current?.click()}>
          <Plus className="size-3.5" />
          {t('attachPick')}
        </Button>
      </div>
      {pending.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          {pending.items.map((p) => (
            <div key={p.key} className={cn('flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0', p.state === 'failed' && 'bg-destructive/5')}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">{p.isImage ? 'IMG' : (p.file.name.split('.').pop() ?? 'FILE').slice(0, 5).toUpperCase()}</div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-[13px]">{p.file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {bytesText(p.file.size)}
                  {p.file.size > rule.maxBytes && <span className="ml-2 text-destructive">{t('e_BOARD_ATTACH_TOO_BIG')}</span>}
                  {p.state === 'uploading' && <span className="ml-2">{t('attachUploading')}</span>}
                  {p.state === 'failed' && <span className="ml-2 text-destructive">{t('attachFailed')} · {t(`e_${p.error}` as DictKey)}</span>}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {p.isImage ? (
                  <div className="inline-flex overflow-hidden rounded-md border border-input text-xs">
                    <button type="button" onClick={() => pending.setDisplay(p.key, 'inline')} className={cn('h-8 cursor-pointer px-2.5 font-semibold', p.display === 'inline' ? 'bg-foreground text-background' : 'bg-background hover:bg-accent')}>
                      {t('attachInline')}
                    </button>
                    <button type="button" onClick={() => pending.setDisplay(p.key, 'file')} className={cn('h-8 cursor-pointer border-l border-input px-2.5 font-semibold', p.display === 'file' ? 'bg-foreground text-background' : 'bg-background hover:bg-accent')}>
                      {t('attachFile')}
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex h-8 items-center rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground">{t('attachFile')}</span>
                )}
                <Button variant="ghost" size="icon" className="size-8" aria-label={t('attachRemove')} onClick={() => pending.remove(p.key)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="m-0 text-xs text-muted-foreground">{t('attachHint')}</p>
    </div>
  );
}

export function AttachIcon({ n }: { n: number }) {
  if (!n) return null;
  return <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label={`attachments ${n}`} />;
}

export function ErrorLine({ error }: { error: unknown }) {
  const { t } = useBoard();
  if (!error) return null;
  const code = errorCode(error);
  return <Alert>{t(`e_${code}` as DictKey) === `e_${code}` ? t('e_unknown') : t(`e_${code}` as DictKey)}</Alert>;
}

