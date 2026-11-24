import { notFound } from 'next/navigation';
import { DriverTripManifest } from '@/features/driver/DriverTripManifest';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'Trip' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trip manifest + End trip. The id is only a target: the database answers "not your trip" the same way for an unknown id and for another driver's trip. */
export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const lang = await readDriverLang();
  return <DriverTripManifest tripId={id} lang={lang} />;
}
