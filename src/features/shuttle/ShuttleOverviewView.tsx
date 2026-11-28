'use client';
import Link from 'next/link';
import { FormField, FormResult, SubmitButton } from '@/components/dashboard/FormParts';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { buttonClass } from '@/ds/primitives/button-class';
import { fieldErr } from '@/features/dashboard/CreateForms';
import { useDashLang } from '@/features/dashboard/lang';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { useActionForm } from '@/features/dashboard/useActionForm';
import { cancelShuttleDayFormAction } from './actions';
import { ST } from './text';
import { SD } from './textDay';
import type { ShuttleOverview } from './types';

export type ShuttleOverviewProps = {
  services: { id: string; name: string }[]; serviceId: string | null; overview: ShuttleOverview | null; canOperate: boolean; canConfig: boolean; enabled: boolean;
};

function CancelDay({ dayId }: { dayId: string }) {
  const lang = useDashLang();
  const t = SD[lang];
  const { state, pending, onSubmit } = useActionForm(cancelShuttleDayFormAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
      <h2 className="font-bold">{t.cancelDay}</h2>
      <p className="text-[13px] text-ink-muted">{t.cancelHint}</p>
      <input type="hidden" name="dayId" value={dayId} />
      <FormField name="reason" label={t.cancelReason} required error={fieldErr(state, lang, 'reason')} />
      <SubmitButton pending={pending} blocked={false}>{t.cancelSubmit}</SubmitButton>
      <FormResult state={state} />
    </form>
  );
}

export function ShuttleOverviewView(p: ShuttleOverviewProps) {
  const lang = useDashLang();
  const t = SD[lang];
  const s = ST[lang];
  const day = p.overview?.day ?? null;
  const allReady = !!p.overview && p.overview.sessions.every((x) => x.state === 'ready');
  return (
    <div className="space-y-6">
      <PageHeaderMasar title={t.title} description={t.intro} />
      {!p.enabled && <InlineAlert tone="warning" title={s.notInPlan}>{s.notInPlanHint}</InlineAlert>}
      {p.services.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">{t.noServices}</p>
          {p.canConfig && <Link href="/dashboard/shuttle/settings" className={buttonClass('primary', 'md', false)}>{t.settings}</Link>}
        </div>
      ) : (
        <>
          <nav aria-label={t.service} className="flex flex-wrap items-center gap-2">
            {p.services.map((x) => (
              <Link key={x.id} href={`/dashboard/shuttle?service=${x.id}`} aria-current={x.id === p.serviceId ? 'page' : undefined}
                className={buttonClass(x.id === p.serviceId ? 'primary' : 'secondary', 'md', false)}>{x.name}</Link>
            ))}
            {p.canConfig && <Link href="/dashboard/shuttle/settings" className={buttonClass('secondary', 'md', false)}>{t.settings}</Link>}
          </nav>
          {!day ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-secondary">{t.noDay}</p>
              {p.canOperate && p.enabled && p.serviceId && <Link href={`/dashboard/shuttle/start?service=${p.serviceId}`} className={buttonClass('primary', 'md', false)}>{t.startDay}</Link>}
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-secondary"><span className="font-medium">{t.date}:</span> <span dir="ltr">{p.overview?.serviceDate}</span> · <span className="font-medium">{t.status}:</span> {day.status}</p>
              <div className="overflow-x-auto rounded-2xl border border-line-default bg-surface-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start">
                      {[t.run, t.bus, t.driver, t.direction, t.station, t.seats, t.status].map((h) => <th key={h} scope="col" className="p-3 text-start font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {p.overview!.sessions.map((x) => (
                      <tr key={x.id} className="border-t border-line-default">
                        <td className="p-3" dir="ltr">{x.runNo}</td>
                        <td className="p-3" dir="ltr"><Link href={`/dashboard/shuttle/vehicles/${x.id}`} className="underline">{x.plate}</Link></td>
                        <td className="p-3">{x.driverName}</td>
                        <td className="p-3">{x.direction === 'forward' ? t.forward : t.backward}</td>
                        <td className="p-3">{x.stationName}</td>
                        <td className="p-3" dir="ltr">{x.capacity}</td>
                        <td className="p-3">{t.state[x.state]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.canOperate && day.status === 'open' && allReady && <CancelDay dayId={day.id} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
