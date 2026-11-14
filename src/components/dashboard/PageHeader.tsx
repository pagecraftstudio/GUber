import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { T } from './T';

/** One header for every dashboard page (no eyebrow, sentence case). `eyebrow` stays in the signature so callers do not change. */
export function PageHeader({ title, description, action }: { eyebrow?: string; title: React.ReactNode; description: React.ReactNode; action?: React.ReactNode }) {
  const tx = (v: React.ReactNode) => (typeof v === 'string' ? <T>{v}</T> : v);
  return <PageHeaderMasar title={tx(title)} description={tx(description)} actions={action} />;
}
