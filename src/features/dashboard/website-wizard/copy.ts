import type { WizardStep } from '@/features/website/wizard-state';

type Bi = { en: string; ar: string };
/** Everything the wizard says about its steps. The step order itself lives in website/wizard-state.ts. */
export const STEP_TEXT: Record<WizardStep, { label: Bi; title: Bi; hint: Bi }> = {
  identity: {
    label: { en: 'Brand', ar: 'العلامة' },
    title: { en: 'Name your website and add a logo', ar: 'سمِّ موقعك وأضف شعارك' },
    hint: { en: 'Riders see this at the top of every page.', ar: 'يراه الركاب أعلى كل صفحة.' },
  },
  content: {
    label: { en: 'Home page', ar: 'الرئيسية' },
    title: { en: 'Say what you offer', ar: 'اشرح ما تقدمه' },
    hint: { en: 'Fill in what you need. Empty parts are left out of the site.', ar: 'املأ ما تحتاجه. الأجزاء الفارغة لا تظهر في الموقع.' },
  },
  contact: {
    label: { en: 'Contact', ar: 'التواصل' },
    title: { en: 'Tell riders how to reach you', ar: 'عرّف الركاب بطريقة التواصل معك' },
    hint: { en: 'Add at least one way to be reached.', ar: 'أضف طريقة واحدة على الأقل للتواصل.' },
  },
  preview: {
    label: { en: 'Preview', ar: 'المعاينة' },
    title: { en: 'See it as riders will', ar: 'شاهده كما سيراه الركاب' },
    hint: { en: 'Only your team can see this. Routes and trips are your real ones.', ar: 'يراها فريقك فقط. الخطوط والرحلات هي بياناتك الفعلية.' },
  },
  publish: {
    label: { en: 'Publish', ar: 'النشر' },
    title: { en: 'Put your website online', ar: 'انشر موقعك' },
    hint: { en: 'You can change it and publish again at any time.', ar: 'يمكنك تعديله ونشره مجددًا في أي وقت.' },
  },
};
export const NEXT_LABEL: Bi = { en: 'Save and continue', ar: 'حفظ ومتابعة' };
export const BACK_LABEL: Bi = { en: 'Back', ar: 'رجوع' };
export const CONTINUE_LABEL: Bi = { en: 'Continue', ar: 'متابعة' };
