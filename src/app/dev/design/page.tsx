import { notFound } from 'next/navigation';
import { contrast, gradeText } from '@/ds/contrast';
import { PRIMITIVES, REQUIRED_PAIRS, STATUS } from '@/ds/tokens';
import { Logo } from '@/ds/brand/Logo';

/**
 * Design token page (plan Phase 2). Development and Vercel preview only: a production deployment returns 404.
 * Server component, so none of this ships in the client bundle; tests/bundle-scan.sh also checks the marker below.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Design tokens', robots: { index: false, follow: false } };

function allowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.VERCEL_ENV === 'preview';
}

const SPACING = [4, 8, 12, 16, 20, 24, 28, 32, 36, 48, 56, 64];
const TYPE: [string, number][] = [['display', 40], ['h1', 32], ['h2', 24], ['h3', 20], ['h4', 18], ['body-lg', 16], ['body', 14], ['body-sm', 13], ['caption', 12]];

export default function DesignPage() {
  if (!allowed()) notFound();
  const failing = REQUIRED_PAIRS.filter((p) => contrast(p.fg, p.bg) < (p.kind === 'text' ? 4.5 : 3));
  return (
    <div data-ds="masar" style={{ display: 'contents' }}>
      {/* MASAR-DESIGN-PAGE */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px', background: 'var(--ds-surface-page)', color: 'var(--ds-text-primary)' }}>
        <Logo size="lg" tone="onLight" />
        <h1 style={{ fontSize: 32, fontWeight: 500, margin: '16px 0 4px' }}>Design tokens</h1>
        <p style={{ color: 'var(--ds-text-muted)', fontSize: 14 }}>
          Dark values are unsigned until Phase 7. Contrast pairs failing: <strong>{failing.length}</strong>.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Color</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {Object.entries(PRIMITIVES).map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--ds-border-default)', borderRadius: 10, overflow: 'hidden', background: 'var(--ds-surface-card)' }}>
              <div style={{ background: v, height: 48 }} />
              <div style={{ padding: 8, fontSize: 12 }}><div>{k}</div><code>{v}</code></div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Contrast (WCAG 2.2 AA)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'start', background: 'var(--ds-surface-sunken)' }}>
              <th style={{ padding: 8, textAlign: 'start' }}>Pair</th><th style={{ padding: 8, textAlign: 'start' }}>Sample</th>
              <th style={{ padding: 8, textAlign: 'start' }}>Ratio</th><th style={{ padding: 8, textAlign: 'start' }}>Needs</th><th style={{ padding: 8, textAlign: 'start' }}>Result</th>
            </tr></thead>
            <tbody>
              {REQUIRED_PAIRS.map((p) => {
                const r = contrast(p.fg, p.bg);
                const need = p.kind === 'text' ? 4.5 : 3;
                const ok = r >= need;
                return (
                  <tr key={p.label} style={{ borderTop: '1px solid var(--ds-border-default)' }}>
                    <td style={{ padding: 8 }}>{p.label}</td>
                    <td style={{ padding: 8 }}><span style={{ background: p.bg, color: p.fg, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--ds-border-default)' }}>Aa 123</span></td>
                    <td style={{ padding: 8, fontVariantNumeric: 'tabular-nums' }}>{r.toFixed(2)}:1</td>
                    <td style={{ padding: 8 }}>{need}:1</td>
                    <td style={{ padding: 8 }}>{ok ? `Pass (${p.kind === 'text' ? gradeText(r) : 'non-text'})` : 'FAIL'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Status</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(STATUS).map(([k, v]) => (
            <span key={k} style={{ background: v.bg, color: v.fg, padding: '4px 10px', borderRadius: 6, fontSize: 13 }}>{k}</span>
          ))}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Type</h2>
        {TYPE.map(([n, px]) => (
          <div key={n} style={{ fontSize: px, lineHeight: px >= 24 ? 1.25 : 1.5, fontWeight: n.startsWith('h') || n === 'display' ? 500 : 400 }}>
            {n} {px}px: Book a seat. <span dir="rtl" lang="ar">احجز مقعدك</span>
          </div>
        ))}

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Spacing</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {SPACING.map((s) => (
            <div key={s} style={{ textAlign: 'center', fontSize: 11 }}>
              <div style={{ width: s, height: s, background: 'var(--ds-action-primary)' }} />{s}
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '32px 0 12px' }}>Font check (manual, 5.5)</h2>
        <p style={{ fontSize: 14 }}>Latin reference inside Arabic: <span dir="rtl" lang="ar">الحجز <span className="ds-ltr ds-tabular">MB-7K3Q9X</span> مؤكد</span></p>
        <p className="ds-tabular" style={{ fontSize: 14 }}>0123456789 / <span lang="ar">٠١٢٣٤٥٦٧٨٩</span> / 1,250.00 / <span lang="ar">١٬٢٥٠٫٠٠</span></p>
      </main>
    </div>
  );
}
