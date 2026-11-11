'use client';
import { useActionState, useEffect, useId, useState } from 'react';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { Modal } from '@/ds/feedback/Dialog';
import { Button } from '@/ds/primitives/Button';
import { Field } from '@/ds/primitives/Field';
import { Input, Select, Textarea } from '@/ds/primitives/Input';
import { IDLE, type AdminActionState } from '@/features/admin/action-state';
import { fieldMessage } from '../messages';

export type DialogField = { name: string; label: string; kind: 'select' | 'number' | 'text'; options?: { value: string; label: string }[]; defaultValue?: string; min?: number; max?: number; hint?: string };

export interface AdminActionDialogProps {
  triggerLabel: string; title: string; description: string; confirmLabel: string; tone?: 'danger' | 'primary';
  action: (prev: AdminActionState, fd: FormData) => Promise<AdminActionState>;
  /** Hidden form values (target ids, the status to set). Never roles or actor ids: the server derives those. */
  hidden: Record<string, string>;
  fields?: DialogField[];
  /** Adds a required reason (submitted as `reason`, kept in the audit log). */
  reason?: { label: string; hint?: string };
}

/**
 * Every consequential admin action goes through this: the consequence is written out, a reason is required where it is kept in the audit log,
 * and the confirm button is the only way through. Danger actions focus Cancel first. Same props and same server actions as the old ConfirmDialog.
 */
export function AdminActionDialog({ triggerLabel, title, description, confirmLabel, tone = 'primary', action, hidden, reason, fields }: AdminActionDialogProps) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, IDLE);
  useEffect(() => { if (state.status === 'ok') setOpen(false); }, [state]);
  const danger = tone === 'danger';
  return (
    <>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)} className={danger ? '!border-status-error-fg !text-status-error-fg' : undefined}>{triggerLabel}</Button>
      <Modal
        open={open} onClose={() => { if (!pending) setOpen(false); }} title={title} size="md"
        footer={<>
          <Button variant="secondary" data-autofocus={danger ? '' : undefined} disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form={formId} variant={danger ? 'destructive' : 'primary'} loading={pending} data-autofocus={danger ? undefined : ''}>{confirmLabel}</Button>
        </>}
      >
        <form id={formId} action={formAction} className="space-y-4">
          <p className="text-sm text-ink-secondary">{description}</p>
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {fields?.map((f) => (
            <Field key={f.name} label={f.label} required hint={f.hint} error={fieldMessage(state.fields?.[f.name])}>
              {f.kind === 'select'
                ? <Select name={f.name} defaultValue={f.defaultValue}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                : <Input name={f.name} type={f.kind === 'number' ? 'number' : 'text'} min={f.min} max={f.max} defaultValue={f.defaultValue} />}
            </Field>
          ))}
          {reason ? <Field label={reason.label} required hint={reason.hint} error={fieldMessage(state.fields?.reason)}><Textarea name="reason" required minLength={3} maxLength={500} rows={3} /></Field> : null}
          {state.status === 'error' && !state.fields?.reason ? <InlineAlert tone="error">{state.message}</InlineAlert> : null}
        </form>
      </Modal>
    </>
  );
}
