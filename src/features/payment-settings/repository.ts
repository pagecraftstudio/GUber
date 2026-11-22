import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings, type PaymentSettingsInput } from './schema';

type Row = {
  require_prepayment: boolean; vodafone_cash_number: string | null; vodafone_cash_holder: string | null; instapay_address: string | null; instapay_holder: string | null;
  payment_whatsapp: string | null; payment_deadline_hours: number; note_en: string | null; note_ar: string | null;
};
const SELECT = 'require_prepayment,vodafone_cash_number,vodafone_cash_holder,instapay_address,instapay_holder,payment_whatsapp,payment_deadline_hours,note_en,note_ar';

export const paymentSettingsRepository = {
  /** RLS returns only the caller's own company's row (settings.read); no row = the company never configured payments. */
  async get({ db }: TenantServiceContext): Promise<PaymentSettings> {
    const { data, error } = await db.from('company_payment_settings').select(SELECT).maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) return DEFAULT_PAYMENT_SETTINGS;
    const r = data as Row;
    return {
      requirePrepayment: r.require_prepayment, vodafoneCashNumber: r.vodafone_cash_number ?? '', vodafoneCashHolder: r.vodafone_cash_holder ?? '', instapayAddress: r.instapay_address ?? '',
      instapayHolder: r.instapay_holder ?? '', paymentWhatsapp: r.payment_whatsapp ?? '', paymentDeadlineHours: r.payment_deadline_hours, noteEn: r.note_en ?? '', noteAr: r.note_ar ?? '',
    };
  },
  async save({ db }: TenantServiceContext, i: PaymentSettingsInput): Promise<void> {
    const { error } = await db.rpc('save_company_payment_settings', {
      p_require: i.requirePrepayment, p_vodafone: i.vodafoneCashNumber ?? null, p_vodafone_holder: i.vodafoneCashHolder ?? null, p_instapay: i.instapayAddress ?? null,
      p_instapay_holder: i.instapayHolder ?? null, p_whatsapp: i.paymentWhatsapp ?? null, p_deadline_hours: i.paymentDeadlineHours, p_note_en: i.noteEn ?? null, p_note_ar: i.noteAr ?? null,
    });
    if (error) throw mapDbError(error);
  },
};
export type PaymentSettingsRepository = typeof paymentSettingsRepository;
