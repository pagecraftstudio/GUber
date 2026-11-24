import { DriverToday } from '@/features/driver/DriverToday';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'Today' };

export default async function DriverPage() {
  const lang = await readDriverLang();
  return <DriverToday lang={lang} />;
}
