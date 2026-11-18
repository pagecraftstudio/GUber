'use client';
import { useState, useTransition } from 'react';
import type { MemberResult } from '../actions';
import { errorText } from './text';

/** One pending flag + one friendly error line per control. The server result is a small code, mapped to text here. */
export function useMemberAction(lang: 'en' | 'ar') {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T,>(work: () => Promise<MemberResult<T>>, onOk?: (r: Extract<MemberResult<T>, { ok: true }>) => void) => {
    setError(null);
    start(async () => {
      const r = await work();
      if (r.ok) onOk?.(r as Extract<MemberResult<T>, { ok: true }>);
      else setError(errorText(lang, r.code, r.detail));
    });
  };
  return { pending, error, run, clear: () => setError(null) };
}
