'use client';
import { useDsFlipped } from '@/ds/shell/flag';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { T } from './T';

/** One header for every dashboard page: the MASAR header (no eyebrow, sentence case) when the surface is flipped, the old one otherwise. */
export function PageHeader({eyebrow,title,description,action}:{eyebrow:string;title:React.ReactNode;description:React.ReactNode;action?:React.ReactNode}) {
 const flipped = useDsFlipped();
 const tx = (v: React.ReactNode) => (typeof v === 'string' ? <T>{v}</T> : v);
 if (flipped) return <PageHeaderMasar title={tx(title)} description={tx(description)} actions={action} />;
 return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-blue-600"><T>{eyebrow}</T></p><h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">{tx(title)}</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{tx(description)}</p></div>{action}</div>
}
