import { redirect } from 'next/navigation';

// S1 only has the settings screen; the operations overview arrives with S2.
export default function ShuttleIndexPage() {
  redirect('/dashboard/shuttle/settings');
}
