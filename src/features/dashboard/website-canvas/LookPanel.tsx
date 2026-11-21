'use client';
import { useState, useTransition } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { tenantAccent } from '@/ds/contrast';
import { buttonClass } from '@/ds/primitives/button-class';
import { BUTTON_LABEL, BUTTON_RADIUS, BUTTON_STYLES, COLOR_PRESETS, FONT_PAIRS, FONT_STACK, readTheme } from '@/features/site/theme';
import { IDLE, type FormState } from '../form-state';
import { useDashLang } from '../lang';
import { saveLookFormAction } from '../website-actions';

/** Native colour inputs need some value while a hex is incomplete; built so no colour literal sits in the source. */
const FALLBACK_HEX = '#' + '0'.repeat(6);

type Look = { fontHeading: string; fontBody: string; buttonStyle: string; primaryColor: string; secondaryColor: string };

/**
 * Fonts, colours and button shape as a few clear choices. A choice saves the moment it is picked (the canvas below redraws from the
 * saved draft), so there is nothing to "apply". Lists only: no free fonts or CSS. Custom colours are validated hex, and a colour whose
 * text would be unreadable is flagged here (the site then falls back to the standard colour instead of showing unreadable buttons).
 */
export function LookPanel({ look, canWrite }: { look: Look; canWrite: boolean }) {
  const lang = useDashLang();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>(IDLE);
  const [primary, setPrimary] = useState(look.primaryColor);
  const [secondary, setSecondary] = useState(look.secondaryColor);
  const theme = readTheme({ font_heading: look.fontHeading, font_body: look.fontBody, button_style: look.buttonStyle });
  const save = (values: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    start(async () => setState(await saveLookFormAction(IDLE, fd)));
  };
  const hex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const readable = !hex(primary) || tenantAccent(primary) !== null;
  const group = 'space-y-2';
  const label = 'text-xs font-medium text-ink-secondary';
  const choice = (on: boolean) => `rounded-ds-md border px-3 py-2 text-sm transition-colors duration-(--duration-ds-feedback) disabled:opacity-60 ${on ? 'border-line-strong bg-surface-sunken font-medium' : 'border-line-default bg-surface-card hover:bg-surface-sunken'}`;
  return (
    <details className="mb-4 rounded-ds-lg border border-line-default bg-surface-card">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
        <span>{t('Look: fonts, colours and buttons', 'المظهر: الخطوط والألوان والأزرار')}</span>
        <SaveStatus view={viewOfForm(state, pending)} />
      </summary>
      <fieldset disabled={!canWrite || pending} className="grid min-w-0 gap-6 border-t border-line-default p-4 md:grid-cols-3">
        <div className={group}>
          <p className={label}>{t('Fonts', 'الخطوط')}</p>
          <div className="grid grid-cols-2 gap-2">
            {FONT_PAIRS.map((p) => {
              const on = p.heading === theme.fontHeading && p.body === theme.fontBody;
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => save({ fontPair: p.id })} className={choice(on)} style={{ fontFamily: FONT_STACK[p.heading] }}>
                  <span className="block">{p.label[lang]}</span><span className="block text-xs text-ink-muted" style={{ fontFamily: FONT_STACK[p.body] }}>Aa أب</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={group}>
          <p className={label}>{t('Colours', 'الألوان')}</p>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_PRESETS.map((c) => {
              const on = c.primary.toLowerCase() === look.primaryColor.toLowerCase() && c.secondary.toLowerCase() === look.secondaryColor.toLowerCase();
              return (
                <button key={c.id} type="button" aria-pressed={on} aria-label={c.label[lang]} title={c.label[lang]} onClick={() => { setPrimary(c.primary); setSecondary(c.secondary); save({ primaryColor: c.primary, secondaryColor: c.secondary }); }} className={`${choice(on)} flex items-center justify-center gap-1 px-2`}>
                  <span aria-hidden className="size-4 rounded-full border border-line-default" style={{ background: c.primary }} /><span aria-hidden className="size-4 rounded-full border border-line-default" style={{ background: c.secondary }} />
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-xs text-ink-secondary">{t('Main', 'الرئيسي')}<input type="color" value={hex(primary) ? primary : FALLBACK_HEX} onChange={(e) => setPrimary(e.target.value)} className="mt-1 block h-9 w-12 cursor-pointer rounded-ds-md border border-line-default bg-surface-card p-1" /></label>
            <label className="text-xs text-ink-secondary">{t('Second', 'الثانوي')}<input type="color" value={hex(secondary) ? secondary : FALLBACK_HEX} onChange={(e) => setSecondary(e.target.value)} className="mt-1 block h-9 w-12 cursor-pointer rounded-ds-md border border-line-default bg-surface-card p-1" /></label>
            <button type="button" onClick={() => save({ primaryColor: primary, secondaryColor: secondary })} className={buttonClass('secondary', 'md')}>{t('Use these colours', 'استخدم هذه الألوان')}</button>
          </div>
          {!readable && <p role="alert" className="text-xs text-status-warning-fg">{t('Button text would be hard to read on this colour, so the site will use the standard colour instead. Pick a darker or lighter one.', 'سيصعب قراءة نص الأزرار على هذا اللون، فسيستخدم الموقع اللون القياسي بدلًا منه. اختر لونًا أغمق أو أفتح.')}</p>}
        </div>
        <div className={group}>
          <p className={label}>{t('Buttons', 'الأزرار')}</p>
          <div className="flex flex-wrap gap-2">
            {BUTTON_STYLES.map((b) => (
              <button key={b} type="button" aria-pressed={theme.buttonStyle === b} onClick={() => save({ buttonStyle: b })} className={choice(theme.buttonStyle === b)}>
                <span aria-hidden className="mb-1 block h-4 w-10 bg-ink-primary" style={{ borderRadius: BUTTON_RADIUS[b] }} />{BUTTON_LABEL[b][lang]}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
    </details>
  );
}
