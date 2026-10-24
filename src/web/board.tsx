import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, Plus } from 'lucide-react';
import { useState } from 'react';
import type { BoardConfig } from '../shared/types';
import { ComposeDialog } from './compose';
import { useBoard } from './context';
import { BoardList } from './list';
import { PostDetail } from './post';
import { Button } from './ui';

export interface BoardProps {
  /** 보고 있는 글 — null 이면 목록. 주소(라우터)와 묶는 것은 호스트 */
  postId: number | null;
  onNavigate: (postId: number | null) => void;
  /** 머리(제목 · 설명 · 글 쓰기 버튼)를 패키지가 그린다. 호스트가 자기 PageHeader 를 쓰면 false */
  header?: boolean;
  initialContextValue?: string;
}

/** 게시판 한 장 — 목록 ↔ 글 보기 + 글 쓰기 창. 꺼져 있으면 안내 한 줄 */
export function Board({ postId, onNavigate, header = true, initialContextValue }: BoardProps) {
  const { api, t } = useBoard();
  const cfg = useQuery({ queryKey: ['board', 'config'], queryFn: api.config });
  const [composing, setComposing] = useState(false);

  if (cfg.data && !cfg.data.enabled) return <div className="rounded-lg border px-4 py-10 text-center text-sm text-muted-foreground">{t('disabled')}</div>;
  if (cfg.data?.unavailable) return <Unavailable cfg={cfg.data} onRetried={() => cfg.refetch()} />;
  return (
    <div className="flex flex-col gap-4">
      {header && postId === null && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <Button variant="primary" onClick={() => setComposing(true)}>
            <Plus className="size-4" />
            {t('write')}
          </Button>
        </div>
      )}
      {postId === null ? <BoardList onOpen={(id) => onNavigate(id)} initialContextValue={initialContextValue} /> : <PostDetail id={postId} onBack={() => onNavigate(null)} onDeleted={() => onNavigate(null)} />}
      <ComposeDialog open={composing} onClose={() => setComposing(false)} onCreated={(id) => onNavigate(id)} />
    </div>
  );
}

/** 파일을 못 열어 사용 불가 — 서버는 정상. 운영자에게는 [다시 시도] */
function Unavailable({ cfg, onRetried }: { cfg: BoardConfig; onRetried: () => void }) {
  const { api, t } = useBoard();
  const [busy, setBusy] = useState(false);
  const u = cfg.unavailable!;
  const retry = async () => {
    setBusy(true);
    try {
      await api.retry();
    } catch {
      /* 아직 그대로 — 아래 메시지가 갱신된다 */
    } finally {
      setBusy(false);
      onRetried();
    }
  };
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center text-sm">
      <p className="m-0 font-medium text-destructive">{t('unavailable')}</p>
      <p className="m-0 max-w-prose text-muted-foreground">{t('unavailableHint')}</p>
      <p className="m-0 max-w-prose break-all font-mono text-xs text-muted-foreground">
        {t('unavailableSince', { since: u.since })} · {u.message}
      </p>
      {cfg.me?.moderator && (
        <Button variant="outline" onClick={retry} disabled={busy}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

/** 화면 머리의 말풍선 — 어느 화면에서든 "이 화면에 대해 적기". 글이 만들어지면 onCreated 로 그 글로 */
export function WriteAboutButton({ onCreated, className, context }: { onCreated?: (id: number) => void; className?: string; context?: Record<string, unknown> }) {
  const { api, t } = useBoard();
  const cfg = useQuery({ queryKey: ['board', 'config'], queryFn: api.config });
  const [open, setOpen] = useState(false);
  if (!cfg.data?.enabled || cfg.data.unavailable) return null;
  return (
    <>
      <Button variant="outline" size="icon" className={className} aria-label={t('writeAbout')} title={t('writeAbout')} onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" />
      </Button>
      <ComposeDialog open={open} onClose={() => setOpen(false)} title={t('writeAbout')} context={context} onCreated={onCreated} />
    </>
  );
}
