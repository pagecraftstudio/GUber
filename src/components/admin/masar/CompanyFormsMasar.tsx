'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, formatTime } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { Field } from '@/ds/primitives/Field';
import { Input } from '@/ds/primitives/Input';
import { addCompanyNoteAction, createCompanyAction, inviteOwnerAction, updateCompanyAction } from '@/features/admin/actions';
import { IDLE } from '@/features/admin/action-state';
import type { EditableCompany, PlanOption } from '../CompanyForms';
import { AdminField, AdminSelect, AdminTextarea, useFormDraft } from './fields';
import { fieldMessage } from '../messages';

const utc = (iso: string) => `${formatDate(iso, 'en', { timeZone: 'UTC', style: 'long' })}, ${formatTime(iso, 'en', { timeZone: 'UTC' })} UTC`;

/** Owner invite link, shown once. It is a credential: it lives in React state only and is not stored anywhere. */
export function InviteLinkPanelMasar({ url, expiresAt }: { url: string; expiresAt?: string }) {
  return (
    <InlineAlert tone="success" title="Owner invite link">
      <p>Copy it now and send it to the owner yourself. It is not stored and cannot be shown again{expiresAt ? `; it expires ${utc(expiresAt)}` : ''}.</p>
      <CopyRow url={url} />
    </InlineAlert>
  );
}

function CopyRow({ url }: { url: string }) {
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={url} aria-label="Invite link" dir="ltr" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 text-[13px]" />
      <CopyButton url={url} />
    </div>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); /* clipboard blocked: the field is selectable */ } }}>{copied ? 'Copied' : 'Copy'}</Button>
      <span className="sr-only" aria-live="polite">{copied ? 'Invite link copied' : ''}</span>
    </>
  );
}

const alertFor = (state: { status: string; message?: string; fields?: Record<string, string> }) =>
  state.status === 'error' && Object.keys(state.fields ?? {}).length === 0 ? <InlineAlert tone="error">{state.message}</InlineAlert> : null;

export function CreateCompanyForm({ plans }: { plans: PlanOption[] }) {
  const [state, formAction, pending] = useActionState(createCompanyAction, IDLE);
  const e = state.fields ?? {};
  const d = useFormDraft();
  if (state.status === 'ok' && state.inviteUrl) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="success">The company was created in trial status with its first subscription.</InlineAlert>
        <InviteLinkPanelMasar url={state.inviteUrl} expiresAt={state.inviteExpiresAt} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/companies/${state.companyId}`} className={buttonClass('primary', 'md')}>Open company</Link>
          <a href="/admin/companies/new" className={buttonClass('secondary', 'md')}>Create another</a>
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} onSubmit={d.onSubmit} className="space-y-8">
      {alertFor(state)}
      <fieldset className="space-y-4"><legend className="mb-1 text-lg font-medium text-ink-primary">Company</legend>
        <AdminField label="Company name" name="name" defaultValue={d.value('name')} required maxLength={120} error={e.name} />
        <AdminField label="Slug" name="slug" defaultValue={d.value('slug')} required maxLength={40} error={e.slug} hint="Becomes the default address: slug.yourplatform.com. It cannot be changed later." />
        <AdminField label="Legal name" name="legalName" defaultValue={d.value('legalName')} maxLength={200} error={e.legalName} />
        <AdminField label="Country (2 letters)" name="country" defaultValue={d.value('country')} maxLength={2} placeholder="EG" error={e.country} />
      </fieldset>
      <fieldset className="space-y-4"><legend className="mb-1 text-lg font-medium text-ink-primary">Responsible person</legend>
        <AdminField label="Contact name" name="contactName" defaultValue={d.value('contactName')} maxLength={120} error={e.contactName} />
        <AdminField label="Contact email" name="contactEmail" type="email" defaultValue={d.value('contactEmail')} maxLength={254} error={e.contactEmail} />
        <AdminField label="Contact phone" name="contactPhone" type="tel" defaultValue={d.value('contactPhone')} placeholder="+201012345678" error={e.contactPhone} />
      </fieldset>
      <fieldset className="space-y-4"><legend className="mb-1 text-lg font-medium text-ink-primary">Plan and owner</legend>
        <AdminSelect label="Plan" name="planCode" required defaultValue={d.value('planCode')} error={e.planCode} options={plans.map((p) => ({ value: p.code, label: `${p.name} (${p.trialDays}-day trial)` }))} />
        <AdminField label="Trial days" name="trialDays" type="number" defaultValue={d.value('trialDays')} min={1} max={365} error={e.trialDays} hint="Leave empty to use the plan's trial length." />
        <AdminField label="Owner email" name="ownerEmail" type="email" defaultValue={d.value('ownerEmail')} required maxLength={254} error={e.ownerEmail} hint="An invite link is created for this address. The person must not belong to another company." />
      </fieldset>
      <Button type="submit" loading={pending} disabled={plans.length === 0}>{pending ? 'Creating…' : 'Create company'}</Button>
    </form>
  );
}

export function EditCompanyForm({ company }: { company: EditableCompany }) {
  const [state, formAction, pending] = useActionState(updateCompanyAction, IDLE);
  const e = state.fields ?? {};
  const d = useFormDraft();
  return (
    <form action={formAction} onSubmit={d.onSubmit} className="space-y-4">
      <input type="hidden" name="companyId" value={company.id} />
      {state.status === 'ok' ? <InlineAlert tone="success">{state.message}</InlineAlert> : null}
      {alertFor(state)}
      <AdminField label="Company name" name="name" required maxLength={120} defaultValue={d.value('name', company.name)} error={e.name} />
      <AdminField label="Legal name" name="legalName" maxLength={200} defaultValue={d.value('legalName', company.legalName ?? '')} error={e.legalName} />
      <AdminField label="Tax number" name="taxNumber" maxLength={50} defaultValue={d.value('taxNumber', company.taxNumber ?? '')} error={e.taxNumber} />
      <AdminField label="Country (2 letters)" name="country" maxLength={2} defaultValue={d.value('country', company.country ?? '')} error={e.country} />
      <AdminField label="Contact name" name="contactName" maxLength={120} defaultValue={d.value('contactName', company.contactName ?? '')} error={e.contactName} />
      <AdminField label="Contact email" name="contactEmail" type="email" maxLength={254} defaultValue={d.value('contactEmail', company.contactEmail ?? '')} error={e.contactEmail} />
      <AdminField label="Contact phone" name="contactPhone" type="tel" defaultValue={d.value('contactPhone', company.contactPhone ?? '')} error={e.contactPhone} />
      <p className="text-[13px] text-ink-muted">An empty optional field clears it. The slug and the status are not edited here.</p>
      <Button type="submit" loading={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}

export function AddNoteForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(addCompanyNoteAction, IDLE);
  const d = useFormDraft();
  return (
    <form action={formAction} onSubmit={d.onSubmit} className="space-y-3" key={state.status === 'ok' ? 'sent' : 'draft'}>
      <input type="hidden" name="companyId" value={companyId} />
      <AdminTextarea label="Internal note" name="body" required defaultValue={state.status === 'ok' ? '' : d.value('body')} maxLength={2000} error={state.fields?.body} hint="Visible to the MASAR platform team only." />
      {state.status === 'error' && !state.fields?.body ? <InlineAlert tone="error">{state.message}</InlineAlert> : null}
      <Button type="submit" variant="secondary" loading={pending}>{pending ? 'Adding…' : 'Add note'}</Button>
    </form>
  );
}

export function InviteOwnerForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(inviteOwnerAction, IDLE);
  const d = useFormDraft();
  return (
    <div className="space-y-3">
      <form action={formAction} onSubmit={d.onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="companyId" value={companyId} />
        <div className="flex-1"><Field label="Invite another owner" required error={fieldMessage(state.fields?.email)}><Input name="email" type="email" required maxLength={254} dir="ltr" autoComplete="off" defaultValue={d.value('email')} /></Field></div>
        <Button type="submit" variant="secondary" loading={pending}>{pending ? 'Creating…' : 'Create invite'}</Button>
      </form>
      {state.status === 'error' && !state.fields?.email ? <InlineAlert tone="error">{state.message}</InlineAlert> : null}
      {state.status === 'ok' && state.inviteUrl ? <InviteLinkPanelMasar url={state.inviteUrl} expiresAt={state.inviteExpiresAt} /> : null}
    </div>
  );
}
