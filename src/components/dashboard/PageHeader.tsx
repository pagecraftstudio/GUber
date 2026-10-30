import { Plus } from 'lucide-react';
export function PageHeader({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}) {
 return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-blue-600">{eyebrow}</p><h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">{title}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{action}</div>
}
