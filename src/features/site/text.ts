import type { Localized, MediaEntry } from './schema';

export type SiteLocale = 'ar' | 'en';
export const parseLocale = (v: unknown): SiteLocale | null => (v === 'ar' || v === 'en' ? v : null);
/** Platform default (company_settings.default_locale defaults to 'ar'). The snapshot does not carry the company's own default yet. */
export const DEFAULT_SITE_LOCALE: SiteLocale = 'ar';

/** Requested locale, then the other one (a missing translation falls back instead of leaving a hole), then ''. */
export function pick(value: Localized | null | undefined, locale: SiteLocale): string {
  if (!value) return '';
  const other: SiteLocale = locale === 'ar' ? 'en' : 'ar';
  return (value[locale]?.trim() || value[other]?.trim() || '');
}

/**
 * Link allow-list, applied again at render (the database already refuses anything else on write). https, mailto, tel, '#anchor'
 * and same-site '/path' only. Anything else -> null and the caller renders plain text, never an <a>.
 */
export function safeHref(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (s === '' || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  if (/^https:\/\/[^/\s]+/i.test(s) || /^mailto:[^\s]+$/i.test(s) || /^tel:[+\d\s().-]+$/i.test(s)) return s;
  if (/^#[\w-]*$/.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s;
  return null;
}

/** Public-bucket object URL. The path comes from the published snapshot (validated to be a public, non-SVG object of this company). */
export function mediaUrl(supabaseUrl: string, media: MediaEntry | undefined): string | null {
  if (!media || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(media.path) || media.path.includes('..')) return null;
  if (media.mime === 'image/svg+xml') return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/company-public/${media.path.split('/').map(encodeURIComponent).join('/')}`;
}

// ---- restricted markdown -> data (rendered by React elements; never HTML) --------------------------------------------------
export type Inline = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'link'; v: string; href: string };
export type Block = { t: 'p'; inline: Inline[] } | { t: 'ul'; items: Inline[][] };

const INLINE_RE = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else {
      const href = safeHref(m[3]);
      out.push(href ? { t: 'link', v: m[2]!, href } : { t: 'text', v: m[2]! });   // unsafe target -> its label as plain text
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

/** Paragraphs (blank-line separated), '- ' lists, **bold**, [label](safe url). Nothing else: no headings, images, HTML. */
export function parseRichText(src: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of src.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    if (lines.every((l) => /^\s*-\s+/.test(l))) blocks.push({ t: 'ul', items: lines.map((l) => parseInline(l.replace(/^\s*-\s+/, ''))) });
    else blocks.push({ t: 'p', inline: parseInline(lines.join('\n')) });
  }
  return blocks;
}
