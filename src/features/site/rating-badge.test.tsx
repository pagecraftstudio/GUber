// P7c follow-up: company rating on the company's own public site. NOT RUN when written: run `npx vitest run src/features/site` before approving.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteRatingBadge } from './SiteRatingBadge';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('SiteRatingBadge', () => {
  it('shows the average and the count, with a full-sentence accessible name', () => {
    const out = html(<SiteRatingBadge rating={{ ratings: 12, average: 4.6 }} locale="en" showNew />);
    expect(out).toContain('aria-label="Rated 4.6 out of 5, 12 ratings"');
    expect(out).toContain('4.6');
    expect(out).toContain('12 ratings');
  });
  it('Arabic uses Arabic-Indic digits and the Arabic wording', () => {
    const out = html(<SiteRatingBadge rating={{ ratings: 12, average: 4.6 }} locale="ar" showNew={false} />);
    expect(out).toMatch(/[٠-٩]/);
    expect(out).toContain('التقييم');
    expect(out).not.toMatch(/4\.6|12/);
  });
  it('a single rating uses the singular', () => {
    expect(html(<SiteRatingBadge rating={{ ratings: 1, average: 5 }} locale="en" showNew />)).toContain('1 rating"');
  });
  it('no average yet -> "New" on the home page only', () => {
    expect(html(<SiteRatingBadge rating={{ ratings: 3, average: null }} locale="en" showNew />)).toContain('New');
    expect(html(<SiteRatingBadge rating={{ ratings: 3, average: null }} locale="en" showNew={false} />)).toBe('');
    expect(html(<SiteRatingBadge rating={{ ratings: 3, average: null }} locale="ar" showNew />)).toContain('جديدة');
  });
  it('no rating data (failed read, preview) -> nothing at all', () => {
    expect(html(<SiteRatingBadge rating={null} locale="en" showNew />)).toBe('');
    expect(html(<SiteRatingBadge rating={undefined} locale="ar" showNew />)).toBe('');
  });
  it('never shows the number of a hidden low count as an average: 4 ratings with an average of null stays "New"', () => {
    const out = html(<SiteRatingBadge rating={{ ratings: 4, average: null }} locale="en" showNew />);
    expect(out).not.toMatch(/\d\.\d/);
  });
});
