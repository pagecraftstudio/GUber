'use client';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDsText } from '../lang';
import { IconButton } from '../primitives/Button';
import type { AlertTone } from './InlineAlert';
import { cx } from '../primitives/cx';

interface ToastItem { id: number; tone: AlertTone; message: ReactNode }
const Ctx = createContext<{ show: (message: ReactNode, tone?: AlertTone) => void } | null>(null);
const AUTO_MS = 6000;

export const useToast = () => { const c = useContext(Ctx); if (!c) throw new Error('useToast needs <ToastProvider>'); return c; };

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const t = useDsText();
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Errors stay until dismissed (WCAG 2.2.1). Others close on their own and pause while hovered or focused.
  useEffect(() => {
    if (item.tone === 'error' || paused) return;
    timer.current = setTimeout(() => onDone(item.id), AUTO_MS);
    return () => clearTimeout(timer.current);
  }, [paused, item, onDone]);
  const tone = { info: 'border-line-default', success: 'border-status-success-fg', warning: 'border-status-warning-fg', error: 'border-status-error-fg' }[item.tone];
  return (
    <li onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      className={cx('ds-toast-in pointer-events-auto flex items-start gap-3 rounded-ds-md border bg-surface-card p-3 text-sm text-ink-primary shadow-md', tone)}>
      <div className="min-w-0 flex-1">{item.message}</div>
      <IconButton label={t.close} size="md" icon={<X size={16} strokeWidth={1.5} />} onClick={() => onDone(item.id)} className="-my-1 !size-8" />
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useDsText();
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const done = useCallback((id: number) => setItems((x) => x.filter((i) => i.id !== id)), []);
  const show = useCallback((message: ReactNode, tone: AlertTone = 'info') => setItems((x) => [...x.slice(-3), { id: next.current++, tone, message }]), []);
  const value = useMemo(() => ({ show }), [show]);
  const errors = items.filter((i) => i.tone === 'error');
  const others = items.filter((i) => i.tone !== 'error');
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="region" aria-label={t.notifications} className="pointer-events-none fixed bottom-4 end-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        <ul role="status" aria-live="polite" className="flex flex-col gap-2">{others.map((i) => <ToastView key={i.id} item={i} onDone={done} />)}</ul>
        <ul role="alert" className="flex flex-col gap-2">{errors.map((i) => <ToastView key={i.id} item={i} onDone={done} />)}</ul>
      </div>
    </Ctx.Provider>
  );
}
