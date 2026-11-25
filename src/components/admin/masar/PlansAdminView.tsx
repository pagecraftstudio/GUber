import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { formatNumber } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { cx } from '@/ds/primitives/cx';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { createEntitlementDefinitionAction, createPlanAction, setPlanActiveAction, setPlanEntitlementAction, updatePlanAction } from '@/features/admin/actions';
import type { AdminPlan, EntitlementDefinition, PlanEntitlementValue, PlanOverview } from '@/features/plans/output';
import { describePlan } from '@/features/plans/preview';
import { AdminActionDialog, type DialogField } from './AdminActionDialog';
import { KEY_LABEL } from './PlatformMasarViews';

const n = (v: number) => formatNumber(v, 'en');
const card = 'rounded-ds-md border border-line-default bg-surface-card';
const label = (key: string) => KEY_LABEL[key] ?? key.replace(/^(max|feature)_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const valueText = (e: PlanEntitlementValue | undefined): string => (!e ? 'Not set (0)' : e.kind === 'flag' ? (e.enabled ? 'Included' : 'Not included') : e.limit === null ? 'Unlimited' : n(e.limit));
const valueDefault = (e: PlanEntitlementValue | undefined, d: EntitlementDefinition): string => (!e ? (d.valueType === 'boolean' ? 'off' : '0') : e.kind === 'flag' ? (e.enabled ? 'on' : 'off') : e.limit === null ? 'unlimited' : String(e.limit));
const money = (v: number, c: string) => `${n(v)} ${c}`;

/** Fields shared by "new plan" and "edit plan". Prices are what NEW subscriptions are charged; existing subscriptions keep the price they started with. */
const planFields = (p?: AdminPlan): DialogField[] => [
  { name: 'name', label: 'Name', kind: 'text', defaultValue: p?.name, hint: '1 to 80 characters.' },
  { name: 'description', label: 'Description', kind: 'text', defaultValue: p?.description ?? '', optional: true },
  { name: 'priceMonthly', label: 'Monthly price', kind: 'number', min: 0, step: '0.01', defaultValue: String(p?.priceMonthly ?? 0) },
  { name: 'priceYearly', label: 'Yearly price', kind: 'number', min: 0, step: '0.01', defaultValue: p?.priceYearly == null ? '' : String(p.priceYearly), optional: true, hint: 'Leave empty for no yearly option.' },
  { name: 'currency', label: 'Currency', kind: 'text', defaultValue: p?.currency ?? 'EGP', hint: '3-letter code. Fixed once a company has used the plan.' },
  { name: 'trialDays', label: 'Trial days', kind: 'number', min: 0, max: 365, defaultValue: String(p?.trialDays ?? 14) },
  { name: 'isPublic', label: 'Shown publicly', kind: 'select', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], defaultValue: p?.isPublic ? 'yes' : 'no' },
  { name: 'sortOrder', label: 'Sort order', kind: 'number', min: 0, max: 1000, defaultValue: String(p?.sortOrder ?? 100), hint: 'Lower numbers first.' },
];

function PlanCard({ plan, definitions, isSuper }: { plan: AdminPlan; definitions: EntitlementDefinition[]; isSuper: boolean }) {
  const byKey = new Map(plan.entitlements.map((e) => [e.key, e]));
  const live = plan.liveSubscribers;
  const preview = describePlan(plan, definitions);
  return (
    <article className={cx(card, 'space-y-4 p-5', !plan.isActive && 'opacity-80')}>
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-ink-primary">{plan.name}</h2>
          <Identifier value={plan.code} />
        </div>
        <p className="text-[13px] text-ink-secondary tabular-nums">
          {money(plan.priceMonthly, plan.currency)} / month{plan.priceYearly !== null ? ` · ${money(plan.priceYearly, plan.currency)} / year` : ''} · {plan.trialDays}-day trial
        </p>
        <p className="text-[13px] text-ink-secondary">
          {plan.isActive ? 'Active' : 'Archived (cannot be assigned)'} · {plan.isPublic ? 'Public' : 'Not public'} · {n(live)} live / {n(plan.totalSubscriptions)} total subscription{plan.totalSubscriptions === 1 ? '' : 's'}
        </p>
        {plan.description ? <p className="text-[13px] text-ink-secondary">{plan.description}</p> : null}
      </header>
      <dl className="divide-y divide-line-default text-sm">
        {definitions.map((d) => {
          const e = byKey.get(d.key);
          return (
            <div key={d.key} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-ink-secondary">{label(d.key)}</dt>
              <dd className="flex items-center gap-3 text-ink-primary tabular-nums">
                <span>{valueText(e)}</span>
                {isSuper ? (
                  <AdminActionDialog
                    triggerLabel="Edit" title={`${label(d.key)}: ${plan.name}`} confirmLabel="Save"
                    description={`${d.valueType === 'boolean' ? 'Type on or off.' : 'Type a whole number, or "unlimited".'} A raised limit applies to the very next new item; a lower limit never removes what a company already has.${live > 0 ? ` ${n(live)} live subscriber${live === 1 ? ' is' : 's are'} on this plan.` : ''}`}
                    action={setPlanEntitlementAction} hidden={{ planId: plan.id, key: d.key }}
                    fields={d.valueType === 'boolean'
                      ? [{ name: 'value', label: 'Value', kind: 'select', options: [{ value: 'on', label: 'Included' }, { value: 'off', label: 'Not included' }], defaultValue: valueDefault(e, d) }]
                      : [{ name: 'value', label: 'Limit', kind: 'text', defaultValue: valueDefault(e, d) }]}
                  />
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <details className="rounded-ds-sm border border-line-default px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-ink-primary">What a company on this plan can do</summary>
        <div className="mt-2 space-y-2">
          {preview.warnings.map((w) => <p key={w} role="note" className="text-[13px] font-medium text-status-error-fg">{w}</p>)}
          {preview.allows.length > 0 ? <ul className="list-disc space-y-0.5 ps-5 text-ink-primary">{preview.allows.map((t) => <li key={t}>{t}</li>)}</ul> : null}
          {preview.blocked.length > 0 ? <ul className="list-disc space-y-0.5 ps-5 text-ink-secondary">{preview.blocked.map((t) => <li key={t}>{t}</li>)}</ul> : null}
          <p className="text-[13px] text-ink-secondary">New companies are charged {money(plan.priceMonthly, plan.currency)} / month{plan.priceYearly !== null ? ` or ${money(plan.priceYearly, plan.currency)} / year` : ''}, after a {plan.trialDays}-day trial. Limits stop NEW items only; nothing a company already has is removed.</p>
        </div>
      </details>
      {isSuper ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${plan.name} actions`}>
          <AdminActionDialog
            triggerLabel="Edit plan" title={`Edit ${plan.name}`} confirmLabel="Save plan" action={updatePlanAction} hidden={{ planId: plan.id }} fields={planFields(plan)}
            description={`Price changes apply to NEW subscriptions only: companies already on this plan keep the price they started with.${live > 0 ? ` ${n(live)} live subscriber${live === 1 ? ' is' : 's are'} on this plan.` : ''} The plan code cannot be changed.`}
          />
          {plan.isActive ? (
            <AdminActionDialog
              triggerLabel="Archive" tone="danger" title={`Archive ${plan.name}?`} confirmLabel="Archive plan" action={setPlanActiveAction} hidden={{ planId: plan.id, active: 'false' }}
              description={`The plan can no longer be assigned or shown publicly. ${live > 0 ? `${n(live)} live subscriber${live === 1 ? '' : 's'} keep${live === 1 ? 's' : ''} it until the subscription ends.` : 'Nobody is subscribed right now.'} Plans are never deleted; you can restore it later.`}
              reason={{ label: 'Reason (kept in the audit log)', hint: 'At least 3 characters.' }}
            />
          ) : (
            <AdminActionDialog triggerLabel="Restore" title={`Restore ${plan.name}?`} confirmLabel="Restore plan" action={setPlanActiveAction} hidden={{ planId: plan.id, active: 'true' }}
              description="The plan can be assigned again. It stays not public until you change that." />
          )}
        </div>
      ) : null}
    </article>
  );
}

export function PlansAdminView({ result, isSuper }: { result: { data: PlanOverview } | { error: string }; isSuper: boolean }) {
  const actions = isSuper ? (
    <>
      <AdminActionDialog
        triggerLabel="New limit key" title="Add a limit or feature key" confirmLabel="Add key" action={createEntitlementDefinitionAction} hidden={{}}
        description="Adds the key to EVERY plan as 0 / off. A key only limits something once a database migration enforces it, so add one when that migration is ready."
        fields={[
          { name: 'key', label: 'Key', kind: 'text', hint: 'Starts with max_ or feature_, lowercase, for example max_vehicles_per_route.' },
          { name: 'valueType', label: 'Type', kind: 'select', options: [{ value: 'integer', label: 'Number (limit)' }, { value: 'boolean', label: 'On / off (feature)' }], defaultValue: 'integer' },
          { name: 'description', label: 'Description', kind: 'text', optional: true },
        ]}
      />
      <AdminActionDialog
        triggerLabel="New plan" title="Create a plan" confirmLabel="Create plan" action={createPlanAction} hidden={{}}
        description="Every limit starts at 0 / off, so nothing is allowed until you set the limits. The code is permanent."
        fields={[{ name: 'code', label: 'Code', kind: 'text', hint: 'Lowercase letters, digits and underscores, 2 to 32 characters, starting with a letter.' }, ...planFields()]}
      />
    </>
  ) : null;
  return (
    <div>
      <PageHeaderMasar
        title="Plans"
        description={isSuper ? 'The plans companies buy from MALAKY. Limits are enforced by the database on every new user, bus, driver, route, trip and booking.' : 'Read-only for your role. Limits are enforced by the database.'}
        actions={actions}
      />
      {'error' in result ? <ErrorState title="Could not load plans" description={result.error} /> : result.data.plans.length === 0 ? <EmptyState title="No plans" description="Create the first plan with New plan." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.plans.map((p) => <PlanCard key={p.id} plan={p} definitions={result.data.definitions} isSuper={isSuper} />)}
        </div>
      )}
    </div>
  );
}
