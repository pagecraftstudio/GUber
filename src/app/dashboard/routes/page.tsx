import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable,StatusPill } from '@/components/dashboard/DataTable';
import { createRouteAction,updateRouteAction } from '@/features/dashboard/actions';
export default async function RoutesPage(){
 const auth=await requireTenant('routes.read'),ctx=createTenantServiceContext(await createClient(),auth);
 const page=await routeService.list(ctx,{page:1,pageSize:100});
 return <><PageHeader eyebrow="Network management" title="Routes & destinations" description="Create and maintain your company's travel corridors."/>
 <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><DataTable rows={page.items} columns={[
 {key:'name',label:'Route',render:r=><div><p className="font-bold text-slate-800 dark:text-white">{r.name}</p><p className="text-xs text-slate-400">{r.code||'No route code'}</p></div>},
 {key:'origin',label:'Origin',render:r=>r.originName},{key:'destination',label:'Destination',render:r=>r.destinationName},
 {key:'status',label:'Status',render:r=><StatusPill value={r.isActive?'active':'inactive'}/>},
 {key:'manage',label:'Manage',render:r=><form action={updateRouteAction}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="isActive" value={String(!r.isActive)}/><button className="text-xs font-bold text-blue-600">{r.isActive?'Deactivate':'Activate'}</button></form>}
 ]}/>
 <form action={createRouteAction} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold">Add a route</h2><Field name="name" label="Route name" required/><div className="grid grid-cols-2 gap-2"><Field name="originName" label="Origin" required/><Field name="destinationName" label="Destination" required/></div><Field name="code" label="Route code"/><Field name="description" label="Description"/><Submit/></form></div></>
}
function Field(p:{name:string;label:string;required?:boolean}){return <label className="block text-xs font-semibold text-slate-500">{p.label}<input name={p.name} required={p.required} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"/></label>}
function Submit(){return <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-700">Add route</button>}
