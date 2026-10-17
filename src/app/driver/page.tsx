import { DriverBoarding } from '@/features/driver/DriverBoarding';

export const metadata = { title: 'Boarding' };

export default function DriverPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Boarding</h1>
      <DriverBoarding />
    </div>
  );
}
