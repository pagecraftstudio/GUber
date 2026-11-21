'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { wizardService } from '@/features/website/wizard-service';
import { errorState, successState, type FormState } from './form-state';

/**
 * Website flow actions (site details, logo). The company comes from the session (never the form). A save action redirects to the NEXT step only
 * after the service succeeded; the next step is computed here from the hidden `step` value checked against the fixed list.
 */
const PATH = '/dashboard/website';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const raw = (f: FormData, k: string) => String(f.get(k) ?? '');

async function ctx(): Promise<TenantServiceContext> {
  return createTenantServiceContext(await createClient(), await requireTenant('website.write'));
}

/** Name + contact details from the canvas panel (one save, no redirect). Only the name is required. */
export async function saveSiteDetailsFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  try {
    await wizardService.saveDetails(await ctx(), {
      titleEn: raw(f, 'titleEn').trim(), titleAr: raw(f, 'titleAr').trim(), email: str(f, 'email'), phone: str(f, 'phone'), whatsapp: str(f, 'whatsapp'),
      addressEn: str(f, 'addressEn'), addressAr: str(f, 'addressAr'), footerEn: str(f, 'footerEn'), footerAr: str(f, 'footerAr'),
    });
  } catch (e) { return errorState(e); }
  revalidatePath(PATH);
  return successState('saved');
}
export async function uploadLogoFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const file = f.get('file');
  if (!(file instanceof File) || file.size === 0) return errorState(new AppError('validation', { detail: 'image_type_not_supported' }));
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await wizardService.setLogo(await ctx(), { filename: file.name }, bytes);
  } catch (e) { return errorState(e); }
  revalidatePath(PATH);
  return successState('saved');
}

export async function removeLogoFormAction(_prev: FormState, _f: FormData): Promise<FormState> {
  try { await wizardService.removeLogo(await ctx()); } catch (e) { return errorState(e); }
  revalidatePath(PATH);
  return successState('saved');
}
