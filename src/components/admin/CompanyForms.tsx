'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { addCompanyNoteAction, createCompanyAction, inviteOwnerAction, updateCompanyAction } from '@/features/admin/actions';
import { IDLE } from '@/features/admin/action-state';
import { AdminField, AdminSelect, AdminTextarea } from './AdminField';
import { InviteLinkPanel } from './InviteLinkPanel';

const PRIMARY = 'inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60';

function ErrorLine({ message }: { message?: string }) {
  return message ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p> : null;
}

export type PlanOption = { code: string; name: string; trialDays: number };

export function CreateCompanyForm({ plans }: { plans: PlanOption[] }) {
  const [state, formAction, pending] = useActionState(createCompanyAction, IDLE);
  const e = state.fields ?? {};

  if (state.status === 'ok' && state.inviteUrl) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">The company was created in trial status with its first subscription.</p>
        <InviteLinkPanel url={state.inviteUrl} expiresAt={state.inviteExpiresAt} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/companies/${state.companyId}`} className={PRIMARY}>Open company</Link>
          <a href="/admin/companies/new" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Create another</a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <ErrorLine message={state.status === 'error' && Object.keys(e).length === 0 ? state.message : undefined} />
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Company</legend>
        <AdminField label="Company name" name="name" required maxLength={120} error={e.name} />
        <AdminField label="Slug" name="slug" required maxLength={40} error={e.slug} hint="Becomes the default address: slug.yourplatform.com. It cannot be changed later." />
        <AdminField label="Legal name" name="legalName" maxLength={200} error={e.legalName} />
        <AdminField label="Country (2 letters)" name="country" maxLength={2} placeholder="EG" error={e.country} />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Responsible person</legend>
        <AdminField label="Contact name" name="contactName" maxLength={120} error={e.contactName} />
        <AdminField label="Contact email" name="contactEmail" type="email" maxLength={254} error={e.contactEmail} />
        <AdminField label="Contact phone" name="contactPhone" type="tel" placeholder="+201012345678" error={e.contactPhone} />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Plan and owner</legend>
        <AdminSelect
          label="Plan"
          name="planCode"
          required
          error={e.planCode}
          options={plans.map((p) => ({ value: p.code, label: `${p.name} (${p.trialDays}-day trial)` }))}
        />
        <AdminField label="Trial days" name="trialDays" type="number" min={1} max={365} error={e.trialDays} hint="Leave empty to use the plan's trial length." />
        <AdminField label="Owner email" name="ownerEmail" type="email" required maxLength={254} error={e.ownerEmail} hint="An invite link is created for this address. The person must not belong to another company." />
      </fieldset>
      <button type="submit" disabled={pending || plans.length === 0} className={PRIMARY}>{pending ? 'Creating…' : 'Create company'}</button>
    </form>
  );
}

export type EditableCompany = {
  id: string;
  name: string;
  legalName: string | null;
  taxNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
};

export function EditCompanyForm({ company }: { company: EditableCompany }) {
  const [state, formAction, pending] = useActionState(updateCompanyAction, IDLE);
  const e = state.fields ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={company.id} />
      {state.status === 'ok' ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p> : null}
      <ErrorLine message={state.status === 'error' && Object.keys(e).length === 0 ? state.message : undefined} />
      <AdminField label="Company name" name="name" required maxLength={120} defaultValue={company.name} error={e.name} />
      <AdminField label="Legal name" name="legalName" maxLength={200} defaultValue={company.legalName ?? ''} error={e.legalName} />
      <AdminField label="Tax number" name="taxNumber" maxLength={50} defaultValue={company.taxNumber ?? ''} error={e.taxNumber} />
      <AdminField label="Country (2 letters)" name="country" maxLength={2} defaultValue={company.country ?? ''} error={e.country} />
      <AdminField label="Contact name" name="contactName" maxLength={120} defaultValue={company.contactName ?? ''} error={e.contactName} />
      <AdminField label="Contact email" name="contactEmail" type="email" maxLength={254} defaultValue={company.contactEmail ?? ''} error={e.contactEmail} />
      <AdminField label="Contact phone" name="contactPhone" type="tel" defaultValue={company.contactPhone ?? ''} error={e.contactPhone} />
      <p className="text-xs text-slate-500">An empty optional field clears it. The slug and the status are not edited here.</p>
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}

export function AddNoteForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(addCompanyNoteAction, IDLE);
  return (
    <form action={formAction} className="space-y-2" key={state.status === 'ok' ? 'sent' : 'draft'}>
      <input type="hidden" name="companyId" value={companyId} />
      <AdminTextarea label="Internal note" name="body" required maxLength={2000} error={state.fields?.body} hint="Visible to MALAKY staff only." />
      <ErrorLine message={state.status === 'error' && !state.fields?.body ? state.message : undefined} />
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? 'Adding…' : 'Add note'}</button>
    </form>
  );
}

export function InviteOwnerForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(inviteOwnerAction, IDLE);
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="companyId" value={companyId} />
        <div className="flex-1">
          <AdminField label="Invite another owner" name="email" type="email" required maxLength={254} error={state.fields?.email} />
        </div>
        <button type="submit" disabled={pending} className={PRIMARY}>{pending ? 'Creating…' : 'Create invite'}</button>
      </form>
      <ErrorLine message={state.status === 'error' && !state.fields?.email ? state.message : undefined} />
      {state.status === 'ok' && state.inviteUrl ? <InviteLinkPanel url={state.inviteUrl} expiresAt={state.inviteExpiresAt} /> : null}
    </div>
  );
}
