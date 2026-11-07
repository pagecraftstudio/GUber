'use client';
import { useId } from 'react';
import { FormField, FormResult, inputClass } from '@/components/dashboard/FormParts';
import { fieldErr } from './CreateForms';
import { inviteDriverFormAction, linkDriverFormAction } from './form-actions';
import { useDashLang } from './lang';
import { DRIVER_UI } from './messages';
import { useActionForm } from './useActionForm';

export type LinkableMember = { id: string; label: string };
const small = 'min-h-8 text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300';

/** The Login column of the Drivers page: who this driver signs in as, or how to create/attach one. */
export function DriverLogin({ driverId, driverName, driverActive, linked, pendingExpires, members, canManage }: {
  driverId: string; driverName: string; driverActive: boolean;
  linked: { name: string; email: string | null; suspended: boolean } | null; pendingExpires: string | null; members: LinkableMember[]; canManage: boolean;
}) {
  const lang = useDashLang();
  const T = DRIVER_UI[lang];
  const uid = useId();
  const invite = useActionForm(inviteDriverFormAction, { resetOnSuccess: true });
  const link = useActionForm(linkDriverFormAction);
  if (linked)
    return <div><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{T.linked(linked.name)}</p><p className="text-xs text-slate-600 dark:text-slate-400">{linked.email}{linked.suspended ? ` · ${T.suspendedNote}` : ''}</p></div>;
  if (pendingExpires) return <p className="text-xs text-slate-700 dark:text-slate-300">{T.pending(new Date(pendingExpires).toLocaleDateString())}</p>;
  if (!canManage || !driverActive) return <p className="text-xs text-slate-600 dark:text-slate-400">{T.none}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600 dark:text-slate-400">{T.none}</p>
      <form ref={invite.ref} onSubmit={invite.onSubmit} aria-label={T.inviteFor(driverName)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="driverId" value={driverId} />
        <div className="min-w-44 flex-1"><FormField name="email" label={T.email} type="email" autoComplete="off" required error={fieldErr(invite.state, lang, 'email')} /></div>
        <button type="submit" aria-disabled={invite.pending} className={small}>{T.invite}<span className="sr-only"> {driverName}</span></button>
      </form>
      <FormResult state={invite.state} />
      {invite.state.status === 'success' && invite.state.invite && (
        <div className="space-y-1 rounded-xl border border-slate-300 p-2 dark:border-slate-600">
          <label htmlFor={`${uid}-l`} className="block text-xs font-semibold">{T.linkLink}</label>
          <input id={`${uid}-l`} readOnly value={invite.state.invite.url} onFocus={(e) => e.currentTarget.select()} className={inputClass(false)} />
        </div>
      )}
      {members.length > 0 && (
        <form ref={link.ref} onSubmit={link.onSubmit} aria-label={T.linkFor(driverName)} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="driverId" value={driverId} />
          <div className="min-w-44 flex-1">
            <label htmlFor={`${uid}-m`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{T.member}</label>
            <select id={`${uid}-m`} name="memberId" required defaultValue="" className={inputClass(false)}>
              <option value="" disabled>{T.pick}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <button type="submit" aria-disabled={link.pending} className={small}>{T.linkBtn}<span className="sr-only"> {driverName}</span></button>
        </form>
      )}
      <FormResult state={link.state} />
    </div>
  );
}
