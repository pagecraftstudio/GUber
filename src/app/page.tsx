import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';

// Phase 6 turns this host into the tenant-aware public site. Until then: route people to where they belong.
export default async function Home() {
  redirect(homePathFor(await getAuthContext()));
}
