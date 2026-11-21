import type { SectionType } from '@/features/site/sections';

/**
 * Form description of each section type for the editor. The editor renders from this table, so adding a section type is one
 * entry here plus its schemas (read: site/sections.ts, write: content-schema.ts). Keys must match the write schema.
 * Media pickers (hero image, image section) are NOT here yet: there is no company-media upload UI, and a typed media id would
 * be a footgun. Existing image_media_id values are preserved untouched on save.
 */
type Label = { en: string; ar: string };
export type FieldDef =
  | { key: string; kind: 'text' | 'textarea' | 'richtext'; localized: true; label: Label; max: number }
  | { key: string; kind: 'href'; label: Label; hint?: Label }
  | { key: string; kind: 'int'; label: Label; min: number; max: number }
  | { key: string; kind: 'list'; label: Label; max: number; itemLabel: Label; fields: FieldDef[] };

const title: FieldDef = { key: 'title', kind: 'text', localized: true, label: { en: 'Title', ar: 'العنوان' }, max: 120 };

export const SECTION_LABELS: Record<SectionType, Label> = {
  hero: { en: 'Hero banner', ar: 'البانر الرئيسي' }, about: { en: 'About', ar: 'من نحن' }, features: { en: 'Features', ar: 'المزايا' },
  routes: { en: 'Routes (live from your routes)', ar: 'الخطوط (مباشرة من خطوطك)' }, trips: { en: 'Upcoming trips (live)', ar: 'الرحلات القادمة (مباشرة)' },
  faq: { en: 'FAQ', ar: 'الأسئلة الشائعة' }, contact: { en: 'Contact', ar: 'التواصل' }, rich_text: { en: 'Text block', ar: 'نص' },
  image: { en: 'Image', ar: 'صورة' }, subscriptions: { en: 'Subscription plans (live)', ar: 'باقات الاشتراك (مباشرة)' }, footer: { en: 'Footer', ar: 'التذييل' },
};
/** Types the editor can add today (image waits for the media picker). */
export const ADDABLE_SECTIONS: SectionType[] = ['hero', 'about', 'features', 'routes', 'trips', 'faq', 'contact', 'rich_text', 'footer', 'subscriptions'];

export const SECTION_FIELDS: Record<SectionType, FieldDef[]> = {
  hero: [title,
    { key: 'subtitle', kind: 'textarea', localized: true, label: { en: 'Subtitle', ar: 'العنوان الفرعي' }, max: 300 },
    { key: 'cta_label', kind: 'text', localized: true, label: { en: 'Button label', ar: 'نص الزر' }, max: 40 },
    { key: 'cta_href', kind: 'href', label: { en: 'Button link', ar: 'رابط الزر' }, hint: { en: 'https://…, mailto:, tel:, #section or /path', ar: 'https://… أو mailto: أو tel: أو #قسم أو /مسار' } }],
  about: [title, { key: 'body', kind: 'richtext', localized: true, label: { en: 'Text', ar: 'النص' }, max: 4000 }],
  features: [title, { key: 'items', kind: 'list', max: 24, label: { en: 'Features', ar: 'المزايا' }, itemLabel: { en: 'Feature', ar: 'ميزة' },
    fields: [{ key: 'title', kind: 'text', localized: true, label: { en: 'Title', ar: 'العنوان' }, max: 120 }, { key: 'body', kind: 'textarea', localized: true, label: { en: 'Description', ar: 'الوصف' }, max: 600 }] }],
  routes: [title],
  trips: [title, { key: 'limit', kind: 'int', label: { en: 'How many trips to show', ar: 'عدد الرحلات المعروضة' }, min: 1, max: 20 }],
  faq: [title, { key: 'items', kind: 'list', max: 40, label: { en: 'Questions', ar: 'الأسئلة' }, itemLabel: { en: 'Question', ar: 'سؤال' },
    fields: [{ key: 'question', kind: 'text', localized: true, label: { en: 'Question', ar: 'السؤال' }, max: 200 }, { key: 'answer', kind: 'textarea', localized: true, label: { en: 'Answer', ar: 'الجواب' }, max: 1200 }] }],
  contact: [title],
  subscriptions: [title],
  rich_text: [{ key: 'body', kind: 'richtext', localized: true, label: { en: 'Text', ar: 'النص' }, max: 8000 }],
  image: [],
  footer: [],
};

/** What the visual editor offers in its "add a section" menu (footer is always drawn from settings; image waits for the media picker). */
export const CANVAS_SECTIONS: SectionType[] = ['hero', 'about', 'features', 'faq', 'routes', 'trips', 'subscriptions', 'contact', 'rich_text'];

/**
 * Content a section starts with when added from the visual editor: a heading only, never invented claims or body text. Every value
 * must satisfy the strict write schema (a test enforces it), so adding can never fail on its own defaults.
 */
export const SECTION_DEFAULTS: Partial<Record<SectionType, Record<string, unknown>>> = {
  hero: { title: { en: 'Welcome', ar: 'أهلًا بك' } },
  about: { title: { en: 'About us', ar: 'من نحن' } },
  features: { title: { en: 'Why ride with us', ar: 'لماذا تركب معنا' } },
  faq: { title: { en: 'Frequently asked questions', ar: 'الأسئلة الشائعة' } },
  routes: { title: { en: 'Our routes', ar: 'خطوطنا' } },
  trips: { title: { en: 'Upcoming trips', ar: 'الرحلات القادمة' }, limit: 8 },
  contact: { title: { en: 'Contact us', ar: 'تواصل معنا' } },
  subscriptions: { title: { en: 'Subscription plans', ar: 'باقات الاشتراك' } },
};

/** Sections that take their data from elsewhere, shown as a hint under the form. */
export const SECTION_NOTES: Partial<Record<SectionType, Label>> = {
  routes: { en: 'Shows your active routes automatically.', ar: 'يعرض خطوطك الفعّالة تلقائيًا.' },
  trips: { en: 'Shows upcoming bookable trips automatically.', ar: 'يعرض الرحلات القادمة المتاحة للحجز تلقائيًا.' },
  subscriptions: { en: 'Shows your public subscription plans automatically. Students sign in to request one.', ar: 'يعرض باقات الاشتراك المتاحة تلقائيًا. يسجّل الطالب دخوله لطلب باقة.' },
  contact: { en: 'Uses the contact details and social links from Website settings.', ar: 'يستخدم بيانات التواصل والروابط من إعدادات الموقع.' },
  footer: { en: 'Uses the footer text from Website settings.', ar: 'يستخدم نص التذييل من إعدادات الموقع.' },
};

/** Drops empty strings / empty localized objects / empty lists so saved content stays minimal. Unknown keys are kept as they are. */
export function compactContent(v: unknown): unknown {
  if (typeof v === 'string') return v.trim() === '' ? undefined : v;
  if (Array.isArray(v)) { const a = v.map(compactContent).filter((x) => x !== undefined); return a.length ? a : undefined; }
  if (v && typeof v === 'object') {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compactContent(x)]).filter(([, x]) => x !== undefined));
    return Object.keys(o).length ? o : undefined;
  }
  return v ?? undefined;
}
