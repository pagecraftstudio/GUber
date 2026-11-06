'use client';
import { useActionState, useEffect, useRef, useTransition, type FormEvent } from 'react';
import { IDLE, type FormState } from './form-state';

/**
 * Wraps a server action that RETURNS a FormState. React 19 resets an uncontrolled form after every `action`, which would
 * wipe what the user typed when the server says no. Submitting through onSubmit + a transition keeps their input; the
 * form is cleared only after a success when `resetOnSuccess` is set.
 */
export function useActionForm(action: (prev: FormState, fd: FormData) => Promise<FormState>, opts: { isBlocked?: (state: FormState) => boolean; resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (opts.resetOnSuccess && state.status === 'success') ref.current?.reset();
  }, [state, opts.resetOnSuccess]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (opts.isBlocked?.(state) || pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, ref, onSubmit };
}
