import { DriverProfile } from '@/features/driver/DriverProfile';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'My profile' };

export default async function DriverProfilePage() {
  return <DriverProfile lang={await readDriverLang()} />;
}
