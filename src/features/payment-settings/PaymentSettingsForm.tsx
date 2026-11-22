'use client';
import { useId } from 'react';
import { FormField } from '@/components/dashboard/FormParts';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { Button } from '@/ds/primitives/Button';
import { useActionForm } from '@/features/dashboard/useActionForm';
import { useDashLang } from '@/features/dashboard/lang';
import { savePaymentSettingsFormAction } from './actions';
import type { PaymentSettings } from './schema';

const TXT = {
  en: { title: 'Payment before travel', intro: 'Ask students to pay by transfer before the deadline. Their seats are held until then; unpaid bookings are cancelled automatically. You confirm each payment by recording the amount on the booking.',
    require: 'Ask for payment first', vf: 'Vodafone Cash number', vfHolder: 'Vodafone Cash account holder', ip: 'InstaPay address', ipHolder: 'InstaPay account holder', wa: 'WhatsApp number for payment proof',
    hours: 'Hours to pay (1 to 48)', noteEn: 'Note for students (English)', noteAr: 'Note for students (Arabic)', save: 'Save payment settings', off: 'When this is off, bookings are confirmed at once and paid on the bus.' },
  ar: { title: 'الدفع قبل السفر', intro: 'اطلب من الطلاب الدفع بالتحويل قبل المهلة. تُحجز مقاعدهم حتى ذلك الوقت وتُلغى الحجوزات غير المدفوعة تلقائيًا. تؤكد أنت كل دفعة بتسجيل المبلغ على الحجز.',
    require: 'اطلب الدفع أولًا', vf: 'رقم فودافون كاش', vfHolder: 'اسم صاحب حساب فودافون كاش', ip: 'عنوان إنستاباي', ipHolder: 'اسم صاحب حساب إنستاباي', wa: 'رقم واتساب لإرسال إثبات الدفع',
    hours: 'عدد ساعات الدفع (١ إلى ٤٨)', noteEn: 'ملاحظة للطلاب (إنجليزي)', noteAr: 'ملاحظة للطلاب (عربي)', save: 'حفظ إعدادات الدفع', off: 'عند الإيقاف تُؤكَّد الحجوزات فورًا ويُدفع في الحافلة.' },
} as const;

export function PaymentSettingsForm({ settings }: { settings: PaymentSettings }) {
  const lang = useDashLang();
  const t = TXT[lang];
  const uid = useId();
  const { state, pending, ref, onSubmit } = useActionForm(savePaymentSettingsFormAction);
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${uid}-t`} className="max-w-3xl space-y-4 rounded-2xl border border-line-default bg-surface-card p-5">
      <h2 id={`${uid}-t`} className="font-bold">{t.title}</h2>
      <p className="text-sm text-ink-secondary">{t.intro}</p>
      <label className="flex min-h-8 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="requirePrepayment" defaultChecked={settings.requirePrepayment} className="size-5 rounded border-line-strong accent-ink-link" />{t.require}</label>
      <p className="text-xs text-ink-secondary">{t.off}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="vodafoneCashNumber" label={t.vf} defaultValue={settings.vodafoneCashNumber} inputMode="tel" autoComplete="off" dir="ltr" />
        <FormField name="vodafoneCashHolder" label={t.vfHolder} defaultValue={settings.vodafoneCashHolder} autoComplete="off" />
        <FormField name="instapayAddress" label={t.ip} defaultValue={settings.instapayAddress} autoComplete="off" dir="ltr" />
        <FormField name="instapayHolder" label={t.ipHolder} defaultValue={settings.instapayHolder} autoComplete="off" />
        <FormField name="paymentWhatsapp" label={t.wa} defaultValue={settings.paymentWhatsapp} inputMode="tel" autoComplete="off" dir="ltr" />
        <FormField name="paymentDeadlineHours" label={t.hours} type="number" inputMode="numeric" min={1} max={48} step="1" required defaultValue={String(settings.paymentDeadlineHours)} />
        <FormField name="noteEn" label={t.noteEn} defaultValue={settings.noteEn} autoComplete="off" />
        <FormField name="noteAr" label={t.noteAr} defaultValue={settings.noteAr} autoComplete="off" dir="rtl" />
      </div>
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{t.save}</Button><SaveStatus view={viewOfForm(state, pending)} className="text-xs" /></div>
    </form>
  );
}
