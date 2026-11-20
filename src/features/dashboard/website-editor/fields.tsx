'use client';
import { Bi } from '@/components/dashboard/T';
import { inputClass } from '@/components/dashboard/FormParts';
import { useDashLang } from '../lang';
import type { FieldDef } from '@/features/website/section-fields';

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

function Label({ l }: { l: { en: string; ar: string } }) { return <Bi en={l.en} ar={l.ar} />; }

/** Controlled editor for one level of a section's content, driven by FieldDef (see website/section-fields.ts). */
export function FieldsForm({ defs, value, onChange, disabled, idPrefix }: { defs: FieldDef[]; value: Obj; onChange: (v: Obj) => void; disabled: boolean; idPrefix: string }) {
  const lang = useDashLang();
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-4">
      {defs.map((d) => {
        const id = `${idPrefix}-${d.key}`;
        if (d.kind === 'text' || d.kind === 'textarea' || d.kind === 'richtext') {
          const loc = asObj(value[d.key]);
          const multi = d.kind !== 'text';
          const one = (code: 'en' | 'ar') => {
            const props = { id: `${id}-${code}`, value: asStr(loc[code]), disabled, maxLength: d.max, dir: code === 'ar' ? ('rtl' as const) : ('ltr' as const), lang: code,
              'aria-label': `${d.label[lang]} (${code === 'ar' ? 'العربية' : 'English'})`,
              onChange: (e: { target: { value: string } }) => set(d.key, { ...loc, [code]: e.target.value }), className: inputClass(false) };
            return multi ? <textarea rows={d.kind === 'richtext' ? 6 : 3} {...props} /> : <input {...props} />;
          };
          return (
            <fieldset key={d.key} className="space-y-1.5">
              <legend className="text-xs font-semibold text-ink-secondary"><Label l={d.label} /></legend>
              <div className="grid gap-2 md:grid-cols-2">{one('en')}{one('ar')}</div>
              {d.kind === 'richtext' && <p className="text-xs text-ink-muted"><Bi en="Blank line = new paragraph. “- ” starts a list. **bold**. [label](https://link)." ar="سطر فارغ = فقرة جديدة. «- » لبدء قائمة. **غامق**. [نص](https://رابط)." /></p>}
            </fieldset>
          );
        }
        if (d.kind === 'href') {
          return (
            <label key={d.key} className="block text-xs font-semibold text-ink-secondary" htmlFor={id}><Label l={d.label} />
              <input id={id} dir="ltr" value={asStr(value[d.key])} disabled={disabled} maxLength={2048} onChange={(e) => set(d.key, e.target.value)} className={`mt-1.5 ${inputClass(false)}`} />
              {d.hint && <span className="mt-1 block text-xs font-normal text-ink-muted"><Label l={d.hint} /></span>}
            </label>
          );
        }
        if (d.kind === 'int') {
          const n = value[d.key];
          return (
            <label key={d.key} className="block text-xs font-semibold text-ink-secondary" htmlFor={id}><Label l={d.label} />
              <input id={id} type="number" inputMode="numeric" min={d.min} max={d.max} dir="ltr" value={typeof n === 'number' ? n : ''} disabled={disabled}
                onChange={(e) => set(d.key, e.target.value === '' ? undefined : Number(e.target.value))} className={`mt-1.5 w-28 ${inputClass(false)}`} />
            </label>
          );
        }
        if (d.kind !== 'list') return null;
        const items = Array.isArray(value[d.key]) ? (value[d.key] as unknown[]).map(asObj) : [];
        const upd = (next: Obj[]) => set(d.key, next);
        return (
          <fieldset key={d.key} className="space-y-3">
            <legend className="text-xs font-semibold text-ink-secondary"><Label l={d.label} /> ({items.length}/{d.max})</legend>
            {items.map((it, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-line-default bg-surface-page p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary"><span><Label l={d.itemLabel} /> {i + 1}</span>
                  {!disabled && <button type="button" onClick={() => upd(items.filter((_, k) => k !== i))} className="text-status-error-fg underline"><Bi en="Remove" ar="حذف" /></button>}
                </div>
                <FieldsForm defs={d.fields} value={it} disabled={disabled} idPrefix={`${id}-${i}`} onChange={(v) => upd(items.map((x, k) => (k === i ? v : x)))} />
              </div>
            ))}
            {!disabled && items.length < d.max && <button type="button" onClick={() => upd([...items, {}])} className="rounded-xl border border-line-default px-3 py-2 text-xs font-semibold"><Bi en="Add" ar="إضافة" /> <Label l={d.itemLabel} /></button>}
          </fieldset>
        );
      })}
    </div>
  );
}
