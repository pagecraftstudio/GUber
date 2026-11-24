import { DriverBoarding } from '@/features/driver/DriverBoarding';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'Boarding' };

export default async function DriverPage() {
  const lang = await readDriverLang();
  return (
    <div className="space-y-4">
      <DriverBoarding lang={lang} />
    </div>
  );
}
