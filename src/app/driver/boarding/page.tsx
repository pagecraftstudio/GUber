import { DriverBoarding } from '@/features/driver/DriverBoarding';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'Boarding' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The boarding screen (it used to be /driver). `?trip=` preselects a trip from the manifest; anything that is not a UUID is ignored, and the screen only honours an id from the driver's own list. */
export default async function DriverBoardingPage({ searchParams }: { searchParams: Promise<{ trip?: string | string[] }> }) {
  const lang = await readDriverLang();
  const raw = (await searchParams).trip;
  const trip = typeof raw === 'string' && UUID.test(raw) ? raw : undefined;
  return (
    <div className="space-y-4">
      <DriverBoarding lang={lang} initialTripId={trip} />
    </div>
  );
}
