import { describe, expect, it } from 'vitest';
import { sectionWriteSchemas, parseSectionContent } from './content-schema';
import { ADDABLE_SECTIONS, SECTION_FIELDS, SECTION_LABELS, compactContent, type FieldDef } from './section-fields';
import type { SectionType } from '@/features/site/sections';

const keysOf = (t: SectionType) => Object.keys((sectionWriteSchemas[t] as unknown as { shape: Record<string, unknown> }).shape);

describe('editor field table matches the write schema', () => {
  it('every field key exists in its section schema (no field the server would refuse)', () => {
    for (const t of Object.keys(SECTION_FIELDS) as SectionType[]) for (const f of SECTION_FIELDS[t]) expect(keysOf(t), `${t}.${f.key}`).toContain(f.key);
  });
  it('every section type has a label; addable types exclude image (no media picker yet)', () => {
    for (const t of Object.keys(sectionWriteSchemas)) expect(SECTION_LABELS).toHaveProperty(t);
    expect(ADDABLE_SECTIONS).not.toContain('image');
    for (const t of ADDABLE_SECTIONS) expect(parseSectionContent(t, {}).success, t).toBe(true);
  });
  it('field max lengths never exceed the schema limits', () => {
    const maxes = (defs: FieldDef[]): number[] => defs.flatMap((d) => (d.kind === 'list' ? maxes(d.fields) : 'max' in d ? [d.max] : []));
    expect(Math.max(...maxes(SECTION_FIELDS.rich_text))).toBe(8000);
    const filled = { body: { en: 'x'.repeat(8000), ar: 'x'.repeat(8000) } };
    expect(parseSectionContent('rich_text', filled).success).toBe(true);
    expect(parseSectionContent('rich_text', { body: { en: 'x'.repeat(8001) } }).success).toBe(false);
  });
});

describe('compactContent', () => {
  it('drops blanks, empty localized objects and empty lists; keeps unknown keys (preserved media ids)', () => {
    expect(compactContent({ title: { en: ' ', ar: '' }, items: [{ title: { en: '' } }], cta_href: '', image_media_id: 'abc', limit: 0 })).toEqual({ image_media_id: 'abc', limit: 0 });
    expect(compactContent({ title: { en: 'Hi', ar: '' } })).toEqual({ title: { en: 'Hi' } });
    expect(compactContent({})).toBeUndefined();
  });
  it('compacted editor output passes the write schema', () => {
    const c = compactContent({ title: { en: 'FAQ' }, items: [{ question: { en: 'Q?' }, answer: { en: '' } }, {}] });
    expect(parseSectionContent('faq', c).success).toBe(true);
  });
});
