import type { Lang } from '@/ds/format';

/** Driver language (D17): Arabic unless the driver chose English. Anything unrecognised is Arabic (the default for this role). */
export const DRIVER_LANG_COOKIE = 'malaky-driver-language';
export const parseDriverLang = (raw: string | null | undefined): Lang => (raw === 'en' ? 'en' : 'ar');
