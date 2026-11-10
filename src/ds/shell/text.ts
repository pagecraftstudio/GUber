import type { Lang } from '../format';

/** Shell chrome. Arabic reuses the wording the dashboard already shipped where it exists; the rest is UNREVIEWED (D10, O1). */
export interface ShellText {
  skip: string; openNav: string; closeNav: string; mainNav: string; collapse: string; expand: string; account: string; theme: string;
  workspace: string; signOut: string; platform: string; platformNote: string; soon: string; poweredBy: string; productName: string; menu: string;
}
export const SHELL_TEXT: Record<Lang, ShellText> = {
  en: { skip: 'Skip to main content', openNav: 'Open navigation', closeNav: 'Close navigation', mainNav: 'Main navigation', collapse: 'Collapse sidebar', expand: 'Expand sidebar', account: 'Account menu', theme: 'Toggle theme', workspace: 'Workspace', signOut: 'Sign out', platform: 'Platform', platformNote: 'Changes here affect every company.', soon: 'soon', poweredBy: 'Powered by MALAKY Studio', productName: 'MASAR', menu: 'Menu' },
  ar: { skip: 'تخطي إلى المحتوى الرئيسي', openNav: 'فتح التنقل', closeNav: 'إغلاق التنقل', mainNav: 'التنقل الرئيسي', collapse: 'تصغير القائمة', expand: 'توسيع القائمة', account: 'قائمة الحساب', theme: 'تبديل المظهر', workspace: 'مساحة العمل', signOut: 'تسجيل الخروج', platform: 'المنصة', platformNote: 'التغييرات هنا تؤثر على كل الشركات.', soon: 'قريباً', poweredBy: 'بدعم من MALAKY Studio', productName: 'مسار', menu: 'القائمة' },
};
