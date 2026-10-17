import { redirect } from 'next/navigation';

// Legacy preview URL. The customer app now lives at "/" (see src/app/(marketplace)); keep old links and email redirects working.
export default function LegacyAppRoute() {
  redirect('/');
}
