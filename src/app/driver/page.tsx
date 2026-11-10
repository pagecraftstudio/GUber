import { DriverBoarding } from '@/features/driver/DriverBoarding';
import { PageTitle } from '@/features/driver/PageTitle';

export const metadata = { title: 'Boarding' };

export default function DriverPage() {
  return (
    <div className="space-y-4">
      <PageTitle />
      <DriverBoarding />
    </div>
  );
}
