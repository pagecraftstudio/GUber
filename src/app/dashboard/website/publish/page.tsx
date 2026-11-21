import { redirect } from 'next/navigation';

/** Retired: this screen is now a step of /dashboard/website. Kept so old links and bookmarks still land in the right place. */
export default function Retiredpublish() {
  redirect('/dashboard/website?step=publish');
}
