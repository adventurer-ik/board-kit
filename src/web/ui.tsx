import { X } from 'lucide-react';
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect } from 'react';

/**
 * 작은 화면 부품 — 호스트의 UI 라이브러리를 가져오지 않는다.
 * 색은 shadcn 식 토큰 이름(bg-background · text-muted-foreground · border …)만 쓴다 — 같은 토큰을 가진 호스트면 그대로 어울린다.
 */
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  danger: 'border border-destructive/40 text-destructive bg-background hover:bg-destructive/10',
};

export function Button({ variant = 'outline', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon' }) {
  const sz = size === 'sm' ? 'h-8 px-3 text-xs' : size === 'icon' ? 'h-9 w-9' : 'h-9 px-4 text-sm';
  return <button type="button" className={cn('inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50', sz, VARIANT[variant], className)} {...rest} />;
}

const FIELD = 'w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, 'h-9', className)} {...rest} />;
}
export function Textarea({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(FIELD, 'min-h-24 resize-y py-2 leading-relaxed', className)} {...rest} />;
}
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, 'h-9', className)} {...rest} />;
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

/** 갈래 배지 — 갈래마다 다른 색. 모르는 갈래는 회색 */
const CAT_TONE: Record<string, string> = {
  idea: 'bg-blue-500/12 text-blue-700 dark:text-blue-300',
  tip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  question: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  bug: 'bg-red-500/12 text-red-700 dark:text-red-300',
};
export function Badge({ tone, children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', (tone && CAT_TONE[tone]) || 'bg-muted text-muted-foreground', className)}>{children}</span>;
}

export function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-8 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors', on ? 'border-foreground bg-foreground text-background' : 'border-input bg-background text-foreground hover:bg-accent')}>
      {children}
    </button>
  );
}

/** 창 — 바탕 누르면 닫힘, Esc 로 닫힘 */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-12" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('w-full rounded-xl border bg-background text-foreground shadow-2xl', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</div>;
}
