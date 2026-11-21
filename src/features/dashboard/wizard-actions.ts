'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { wizardService } from '@/features/website/wizard-service';
import { WIZARD_STEPS, type WizardStep } from '@/features/website/wizard-state';
import { fromSectionShape } from '@/features/website/wizard-content';
import { errorState, successState, type FormState } from './form-state';

/**
 * Website setup wizard actions. The company comes from the session (never the form). A save action redirects to the NEXT step only
 * after the service succeeded; the next step is computed here from the hidden `step` value checked against the fixed list.
 */
const PATH = '/dashboard/website';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const raw = (f: FormData, k: string) => String(f.get(k) ?? '');

async function ctx(): Promise<TenantServiceContext> {
  return createTenantServiceContext(await createClient(), await requireTenant('website.write'));
}
function nextStep(f: FormData): WizardStep {
  const i = WIZARD_STEPS.indexOf(str(f, 'step') as WizardStep);
  return WIZARD_STEPS[Math.min(Math.max(i, 0) + 1, WIZARD_STEPS.length - 1)]!;
}
async function saveThenAdvance(f: FormData, work: (c: TenantServiceContext) => Promise<void>): Promise<FormState> {
  try { await work(await ctx()); } catch (e) { return errorState(e); }
  revalidatePath(PATH);
  redirect(`${PATH}?step=${nextStep(f)}`); // after the try: redirect() signals by throwing
}

export async function saveIdentityStepAction(_prev: FormState, f: FormData): Promise<FormState> {
  return saveThenAdvance(f, (c) => wizardService.saveIdentity(c, { titleEn: raw(f, 'titleEn').trim(), titleAr: raw(f, 'titleAr').trim(), primaryColor: str(f, 'primaryColor'), secondaryColor: str(f, 'secondaryColor') }));
}

export async function saveContactStepAction(_prev: FormState, f: FormData): Promise<FormState> {
  return saveThenAdvance(f, (c) => wizardService.saveContact(c, {
    email: str(f, 'email'), phone: str(f, 'phone'), whatsapp: str(f, 'whatsapp'),
    addressEn: str(f, 'addressEn'), addressAr: str(f, 'addressAr'), footerEn: str(f, 'footerEn'), footerAr: str(f, 'footerAr'),
  }));
}

export async function saveContentStepAction(_prev: FormState, f: FormData): Promise<FormState> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw(f, 'content')); } catch { return errorState(new AppError('validation', { detail: 'invalid_section_content' })); }
  return saveThenAdvance(f, (c) => wizardService.saveContent(c, fromSectionShape(parsed)));
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
