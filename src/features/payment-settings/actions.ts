'use server';
import { revalidatePath } from 'next/cache';
import { normalizeDigits } from '@/ds/format/normalize-digits';
import { requireTenant } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { errorState, successState, type FormState } from '@/features/dashboard/form-state';
import { paymentSettingsService } from './service';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

/** Payment settings (settings.write). The company comes from the session, never from the form. */
export async function savePaymentSettingsFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  try {
    const auth = await requireTenant();
    const ctx = createTenantServiceContext(await createClient(), auth);
    await paymentSettingsService.save(ctx, {
      requirePrepayment: f.get('requirePrepayment') === 'on',
      vodafoneCashNumber: str(f, 'vodafoneCashNumber'), vodafoneCashHolder: str(f, 'vodafoneCashHolder'),
      instapayAddress: str(f, 'instapayAddress'), instapayHolder: str(f, 'instapayHolder'), paymentWhatsapp: str(f, 'paymentWhatsapp'),
      paymentDeadlineHours: Number(normalizeDigits(str(f, 'paymentDeadlineHours'))), noteEn: str(f, 'noteEn'), noteAr: str(f, 'noteAr'),
    });
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return errorState(e);
  }
  revalidatePath('/dashboard/settings');
  return successState('saved');
}
