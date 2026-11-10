'use client';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDsText } from '../lang';
import { Button, IconButton } from '../primitives/Button';
import { cx } from '../primitives/cx';

/** Native <dialog> + showModal(): focus trap, Escape, inert background and focus return come from the browser (all evergreen browsers, D7). */
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // React's autoFocus cannot work inside a closed <dialog>, so the preferred element is focused after it opens.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', h);
    return () => d.removeEventListener('cancel', h);
  }, [onClose]);
  return ref;
}

const PANEL = 'm-auto max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] overflow-auto rounded-ds-lg border border-line-default bg-surface-card p-0 text-ink-primary shadow-lg backdrop:bg-black/50';

export interface ConfirmDialogProps {
  open: boolean; title: string; description?: ReactNode; confirmLabel: string; cancelLabel?: string;
  tone?: 'default' | 'destructive';
  /** May be async: the dialog shows a loading state and stays open if it throws. */
  onConfirm: () => void | Promise<void>; onCancel: () => void;
}

/** The one confirm dialog (replaces the two existing ones). Use only for decisions that need an interruption. Destructive tone focuses Cancel first. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, tone = 'default', onConfirm, onCancel }: ConfirmDialogProps) {
  const t = useDsText();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const ref = useModal(open, () => { if (!busy) onCancel(); });
  const go = async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } };
  return (
    <dialog ref={ref} aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined} className={PANEL}>
      <div className="p-6">
        <h2 id={`${id}-t`} className="text-xl font-medium">{title}</h2>
        {description ? <div id={`${id}-d`} className="mt-2 text-sm text-ink-secondary">{description}</div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" data-autofocus={tone === 'destructive' ? '' : undefined} disabled={busy} onClick={onCancel}>{cancelLabel ?? t.cancel}</Button>
          <Button variant={tone === 'destructive' ? 'destructive' : 'primary'} data-autofocus={tone !== 'destructive' ? '' : undefined} loading={busy} onClick={go}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

/** Side panel for navigation or detail. `side` is logical (start/end), so it flips in RTL. */
export function Drawer({ open, onClose, title, side = 'end', children }: { open: boolean; onClose: () => void; title: string; side?: 'start' | 'end'; children: ReactNode }) {
  const t = useDsText();
  const id = useId();
  const ref = useModal(open, onClose);
  return (
    <dialog ref={ref} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-0 h-dvh max-h-none w-[min(24rem,100vw)] max-w-none overflow-auto border-line-default bg-surface-card p-0 text-ink-primary shadow-lg backdrop:bg-black/50', side === 'end' ? 'ms-auto border-s' : 'me-auto border-e')}>
      <div className="flex items-center justify-between gap-2 border-b border-line-default p-4">
        <h2 id={`${id}-t`} className="text-lg font-medium">{title}</h2>
        <IconButton label={t.close} icon={<X size={18} strokeWidth={1.5} />} onClick={onClose} />
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

export interface ModalProps {
  open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode;
  /** Sticky action row (Cancel and the one primary action). */
  footer?: ReactNode; size?: 'md' | 'lg';
}

/** Content dialog for flows that need focus and an interruption (booking). Same native <dialog> behaviour as ConfirmDialog; body scrolls, footer stays visible. Click on the backdrop closes it. */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  const t = useDsText();
  const id = useId();
  const ref = useModal(open, onClose);
  return (
    <dialog ref={ref} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto max-h-[92dvh] w-[min(var(--modal-w),calc(100vw-1rem))] overflow-hidden rounded-ds-lg border border-line-default bg-surface-card p-0 text-ink-primary shadow-lg backdrop:bg-black/50 sm:w-[min(var(--modal-w),calc(100vw-2rem))]', open && 'flex flex-col')}
      style={{ ['--modal-w' as string]: size === 'lg' ? '40rem' : '32rem' }}>
      <div className="flex items-start justify-between gap-3 border-b border-line-default p-4 sm:px-6">
        <div className="min-w-0"><h2 id={`${id}-t`} className="text-xl font-medium">{title}</h2>{subtitle ? <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p> : null}</div>
        <IconButton label={t.close} icon={<X size={18} strokeWidth={1.5} />} onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-default bg-surface-sunken p-4 sm:px-6">{footer}</div> : null}
    </dialog>
  );
}
