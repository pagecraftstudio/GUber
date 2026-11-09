'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { FormState } from './form-state';
import { useActionForm } from './useActionForm';

/**
 * Autosaving form: a change is saved ~0.7 s after the user stops typing (immediately on blur / Enter / select change).
 * Edits made while a save is running are saved right after it, so nothing is lost and requests never overlap.
 * A form that does not pass its own validation (e.g. a required field being edited) is simply not sent yet.
 */
export function useAutosaveForm(action: (prev: FormState, fd: FormData) => Promise<FormState>, delay = 700) {
  const base = useActionForm(action);
  const { pending, ref } = base;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const busy = useRef(false);
  useEffect(() => { busy.current = pending; }, [pending]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const f = ref.current;
    if (!f || !dirty.current) return;
    if (busy.current) return; // re-run by the effect below when the running save ends
    if (!f.checkValidity()) return;
    dirty.current = false;
    f.requestSubmit();
  }, [ref]);

  useEffect(() => { if (!pending && dirty.current) flush(); }, [pending, flush]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const schedule = useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  return { ...base, formProps: { ref, onSubmit: base.onSubmit, onChange: schedule, onBlur: flush } };
}

export { useInlineSave } from '@/ds/hooks/useInlineSave';
