import type { AnalyticsLocale } from './copy';

type Section = { h: string; p: string[]; li?: string[] };
type Notice = { title: string; version: string; sections: Section[] };

/**
 * DRAFT. Everything in [BRACKETS] must be filled by the owner; the legal wording needs counsel review
 * (Egypt PDPL No. 151 of 2020 and, if EU users appear, GDPR: verify current text, licensing, cross-border transfer, DPO duties).
 * Arabic follows the project rule (Egyptian colloquial); counsel may prefer formal Arabic for the legal text: that is their call.
 * Version string must change whenever the meaning changes, together with ANALYTICS_NOTICE_VERSION and app_private.analytics_config.
 */
export const PRIVACY_NOTICE: Record<AnalyticsLocale, Notice> = {
  ar: {
    title: 'سياسة الخصوصية',
    version: 'النسخة 1 · آخر تحديث: [التاريخ]',
    sections: [
      { h: 'مين إحنا', p: ['منصة مسار بتشغّلها [اسم الجهة المسؤولة عن البيانات]. للتواصل بخصوص بياناتك: [الإيميل].'] },
      {
        h: 'إيه اللي بنسجّله (لو وافقت بس)',
        p: ['بنسجّل استخدامك للموقع عشان نفهم الناس بتدوّر على إيه ونحسّن الرحلات:'],
        li: [
          'الصفحات اللي بتفتحها (من غير ما بنسجّل اللي بعد علامة الاستفهام في الرابط).',
          'عمليات البحث: من فين، لفين، التاريخ، الفلاتر، وعدد النتائج.',
          'اللغة، نوع الجهاز (موبايل أو تابلت أو كمبيوتر)، الدولة، والموقع اللي جيت منه.',
          'رقم عشوائي بيتحفظ في متصفحك عشان نربط الأحداث ببعض. لو سجّلت دخول، بنربطها بحسابك.',
        ],
      },
      {
        h: 'إيه اللي مش بنسجّله',
        p: ['مش بنسجّل اللي بتكتبه على الكيبورد، ولا تسجيل لشاشتك، ولا موقعك بالتحديد، ولا جهات الاتصال بتاعتك، ولا عنوان الـ IP نفسه. بنحوّل الـ IP لرمز مشفّر بيتغيّر كل يوم، ومش بنحتفظ بالـ IP الأصلي.'],
      },
      { h: 'ليه', p: ['عشان نعرف الرحلات والمسارات الناقصة ونصلّح مشاكل الاستخدام. مش بنبيع بياناتك.'] },
      { h: 'بنحتفظ بيها قد إيه', p: ['السجلات الخام بتتمسح بعد 13 شهر. [المحامي يأكد المدة]. سجل موافقتك بيفضل محفوظ كإثبات لاختيارك.'] },
      { h: 'اختيارك وحقوقك', p: ['تقدر تغيّر رأيك في أي وقت من الأسفل. لما تسحب موافقتك، بنمسح البيانات اللي اتسجّلت عن متصفحك وحسابك. ولك الحق تطلب نسخة من بياناتك أو مسحها: [الإيميل].'] },
      { h: 'مكان التخزين', p: ['البيانات متخزّنة على Supabase في [المنطقة/الدولة]. [المحامي يأكد شروط نقل البيانات خارج مصر].'] },
    ],
  },
  en: {
    title: 'Privacy notice',
    version: 'Version 1 · Last updated: [DATE]',
    sections: [
      { h: 'Who we are', p: ['MASAR is operated by [DATA CONTROLLER NAME]. For questions about your data: [EMAIL].'] },
      {
        h: 'What we record (only if you agree)',
        p: ['We record how the site is used so we can see what people look for and improve trips:'],
        li: [
          'The pages you open (anything after a question mark in the address is not recorded).',
          'Searches: origin, destination, date, filters and number of results.',
          'Language, device type (phone, tablet or computer), country, and the site you came from.',
          'A random id kept in your browser to link events together. If you are signed in, events are linked to your account.',
        ],
      },
      {
        h: 'What we do not record',
        p: ['We do not record keystrokes, screen recordings, your precise location, your contacts, or your IP address itself. The IP is turned into a code that changes every day, and the original is not kept.'],
      },
      { h: 'Why', p: ['To find missing trips and routes and to fix usability problems. We do not sell your data.'] },
      { h: 'How long we keep it', p: ['Raw records are deleted after 13 months. [COUNSEL TO CONFIRM]. Your consent record is kept as proof of your choice.'] },
      { h: 'Your choices and rights', p: ['You can change your mind below at any time. When you withdraw, the data recorded about your browser and account is deleted. You may ask for a copy of your data or its deletion: [EMAIL].'] },
      { h: 'Where it is stored', p: ['Data is stored on Supabase in [REGION/COUNTRY]. [COUNSEL TO CONFIRM cross-border transfer requirements].'] },
    ],
  },
};
