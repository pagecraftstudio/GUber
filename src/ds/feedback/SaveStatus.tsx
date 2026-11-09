'use client';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type { AutoResult } from '../hooks/useInlineSave';

export type SaveView = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; code: string; detail?: string };
export const viewOfInline = (r: AutoResult | null, pending: boolean): SaveView =>
  pending ? { kind: 'saving' } : !r ? { kind: 'idle' } : r.ok ? { kind: 'saved' } : { kind: 'error', code: r.code, ...(r.detail ? { detail: r.detail } : {}) };

/** Live status beside an autosaving control. The live region is ALWAYS in the DOM so screen readers announce changes; errors use role="alert". */
export function SaveStatus({ view, labels }: { view: SaveView; labels: { saving: string; saved: string; error: (e: Extract<SaveView, { kind: 'error' }>) => string } }) {
  let body = null;
  if (view.kind === 'saving') body = <span className="inline-flex items-center gap-1 text-ink-muted"><Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />{labels.saving}</span>;
  else if (view.kind === 'saved') body = <span className="inline-flex items-center gap-1 text-status-success-fg"><Check size={12} strokeWidth={1.5} aria-hidden="true" />{labels.saved}</span>;
  else if (view.kind === 'error') body = <span role="alert" className="inline-flex items-center gap-1 text-status-error-fg"><AlertCircle size={12} strokeWidth={1.5} aria-hidden="true" />{labels.error(view)}</span>;
  return <span aria-live="polite" className="min-h-4 text-xs font-medium">{body}</span>;
}
