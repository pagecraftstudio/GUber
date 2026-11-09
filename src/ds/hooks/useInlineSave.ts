'use client';
import { useCallback, useState, useTransition } from 'react';

export type AutoResult = { ok: true } | { ok: false; code: string; detail?: string };

/** Instant, optimistic single-field saves. Moved from features/dashboard/useAutosave.ts unchanged; that file re-exports it. */
export function useInlineSave() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AutoResult | null>(null);
  const run = useCallback((work: () => Promise<AutoResult>, optimistic?: () => void) => {
    start(async () => {
      optimistic?.();
      setResult(null);
      try { setResult(await work()); } catch { setResult({ ok: false, code: 'internal' }); }
    });
  }, []);
  return { pending, result, run };
}
