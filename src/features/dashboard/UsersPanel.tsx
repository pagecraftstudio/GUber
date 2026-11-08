'use client';
import { useId, useState } from 'react';
import { FormField, FormResult, inputClass, PlanLimitNotice, SubmitButton } from '@/components/dashboard/FormParts';
import { allowanceFor, blocksSubmit, type PlanUsage } from '@/features/subscriptions/usage';
import { liveUsage, fieldErr } from './CreateForms';
import { createInviteFormAction, revokeInviteFormAction, setMemberRoleFormAction, setMemberStatusFormAction } from './form-actions';
import { useDashLang } from './lang';
import { DRIVER_UI, FORM_TEXT, USER_UI } from './messages';
import { useActionForm } from './useActionForm';
import { useAutosaveForm } from './useAutosave';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';

export type RoleOption = { key: string; name: string };

export type DriverOption = { id: string; label: string };

export function InviteForm({ roles, usage, drivers }: { roles: RoleOption[]; usage: PlanUsage | null; drivers: DriverOption[] }) {
  const lang = useDashLang();
  const T = USER_UI[lang];
  const D = DRIVER_UI[lang];
  const [role, setRole] = useState('');
  const uid = useId();
  const { state, pending, ref, onSubmit } = useActionForm(createInviteFormAction, { resetOnSuccess: true, isBlocked: (s) => blocksSubmit(allowanceFor(liveUsage(usage, s), 'max_users')) });
  const current = liveUsage(usage, state);
  const blocked = blocksSubmit(allowanceFor(current, 'max_users'));
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${uid}-t`} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 id={`${uid}-t`} className="font-bold">{T.invite}</h2>
      <PlanLimitNotice usage={current} resource="max_users" id={`${uid}-limit`} />
      <FormField name="email" label={T.email} dir="ltr" type="email" autoComplete="off" required error={fieldErr(state, lang, 'email')} />
      <div>
        <label htmlFor={`${uid}-role`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{T.role}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <select id={`${uid}-role`} name="roleKey" required value={role} onChange={(e) => setRole(e.target.value)} className={inputClass(!!fieldErr(state, lang, 'roleKey'))}>
          <option value="" disabled>—</option>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>
      {role === 'driver' && (
        <div>
          <label htmlFor={`${uid}-drv`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{D.needRecord}<span aria-hidden="true" className="text-red-600"> *</span></label>
          <select id={`${uid}-drv`} name="driverId" required defaultValue="" aria-describedby={`${uid}-drv-h`} className={inputClass(!!fieldErr(state, lang, 'driverId'))}>
            <option value="" disabled>—</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <p id={`${uid}-drv-h`} className="mt-1 text-xs text-slate-600 dark:text-slate-400">{drivers.length === 0 ? D.noRecords : D.driverHint}</p>
        </div>
      )}
      <SubmitButton pending={pending} blocked={blocked || (role === 'driver' && drivers.length === 0)} describedBy={`${uid}-limit`}>{T.send}</SubmitButton>
      {blocked && <p className="text-xs font-semibold text-red-700 dark:text-red-300">{FORM_TEXT[lang].limitBlocked}</p>}
      <FormResult state={state} resource="max_users" />
      {state.status === 'success' && state.invite && (
        <div className="space-y-1 rounded-xl border border-slate-300 p-3 dark:border-slate-600">
          <label htmlFor={`${uid}-link`} className="block text-xs font-semibold">{T.link}</label>
          <input id={`${uid}-link`} readOnly value={state.invite.url} onFocus={(e) => e.currentTarget.select()} dir="ltr" className={inputClass(false)} />
          <p className="text-xs text-slate-600 dark:text-slate-400">{T.expires}: <time dateTime={state.invite.expiresAt} dir="ltr">{new Date(state.invite.expiresAt).toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB')}</time></p>
        </div>
      )}
    </form>
  );
}

const small = 'min-h-8 text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300';

export function MemberControls({ memberId, name, roleKey, status, roles, isSelf, canWrite }: { memberId: string; name: string; roleKey: string | null; status: 'active' | 'suspended'; roles: RoleOption[]; isSelf: boolean; canWrite: boolean }) {
  const lang = useDashLang();
  const T = USER_UI[lang];
  const role = useAutosaveForm(setMemberRoleFormAction, 0);
  const stat = useActionForm(setMemberStatusFormAction);
  if (!canWrite) return null;
  if (isSelf) return <p className="text-xs text-slate-600 dark:text-slate-400">{T.self}</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <form {...role.formProps} className="flex items-center gap-2">
          <input type="hidden" name="memberId" value={memberId} />
          <select name="roleKey" aria-label={T.roleFor(name)} defaultValue={roleKey ?? ''} className="rounded-lg border border-slate-300 bg-transparent p-1.5 text-xs dark:border-slate-600">
            {roles.filter((r) => r.key !== 'driver' || roleKey === 'driver').map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <SaveStatus view={viewOfForm(role.state, role.pending)} />
        </form>
        <form ref={stat.ref} onSubmit={stat.onSubmit}>
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="status" value={status === 'active' ? 'suspended' : 'active'} />
          <button type="submit" aria-disabled={stat.pending} className={small}>{status === 'active' ? T.suspend : T.reactivate}<span className="sr-only"> {name}</span></button>
        </form>
      </div>
      <FormResult state={stat.state} />
    </div>
  );
}

export function RevokeInvite({ inviteId, email }: { inviteId: string; email: string }) {
  const lang = useDashLang();
  const T = USER_UI[lang];
  const { state, pending, onSubmit } = useActionForm(revokeInviteFormAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <button type="submit" aria-disabled={pending} className={small}>{T.revoke}<span className="sr-only"> {email}</span></button>
      <FormResult state={state} />
    </form>
  );
}
