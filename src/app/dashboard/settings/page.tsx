import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { companyService } from '@/features/companies/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SettingsForm } from '@/features/dashboard/SettingsForm';

const field = (label: string, value: string | null) => (
  <div key={label}><dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value || '—'}</dd></div>
);

export default async function SettingsPage() {
  const auth = await requireTenant('settings.read'); // no settings.read => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('settings.write');
  const [profile, settings] = await Promise.all([companyService.getProfile(ctx), companyService.getSettings(ctx)]);
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" description="Your company profile and how booking and scheduling behave." />
      <div className="space-y-6">
        <section aria-labelledby="profile-h" className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="profile-h" className="font-bold">Company profile</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Name, legal details and contact data are managed by the platform team. Ask MALAKY support to change them.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {field('Name', profile.name)}{field('Address name', profile.slug)}{field('Legal name', profile.legalName)}{field('Tax number', profile.taxNumber)}
            {field('Contact email', profile.contactEmail)}{field('Contact phone', profile.contactPhone)}{field('Country', profile.country)}{field('Status', profile.status)}
          </dl>
        </section>
        {canWrite ? <SettingsForm settings={settings} /> : (
          <section aria-labelledby="ro-h" className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 id="ro-h" className="font-bold">Booking and operations</h2>
            <p role="status" className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">You can view these settings but not change them.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {field('Time zone', settings.timezone)}{field('Currency', settings.currency)}{field('Default language', settings.defaultLocale === 'ar' ? 'Arabic' : 'English')}{field('Supported languages', settings.supportedLocales.map((l) => (l === 'ar' ? 'Arabic' : 'English')).join(', '))}
              {field('Accept online bookings', settings.bookingEnabled ? 'Yes' : 'No')}{field('Allow booking without an account', settings.allowGuestBooking ? 'Yes' : 'No')}
              {field('Booking cut-off (minutes before departure)', String(settings.bookingCutoffMinutes))}{field('Cancellation window (hours before departure)', String(settings.cancellationWindowHours))}
              {field('Seats per booking (max)', String(settings.maxSeatsPerBooking))}{field('Turnaround time between trips (minutes)', String(settings.tripBufferMinutes))}
            </dl>
          </section>
        )}
      </div>
    </>
  );
}
