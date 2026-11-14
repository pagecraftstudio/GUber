'use client';
import { generateTripTemplateFormAction, setTripTemplateActiveFormAction } from './form-actions';
import type { FormState } from './form-state';
import { useDashLang } from './lang';
import { genericErrorText } from './messages';
import { useActionForm } from './useActionForm';
import { useRowActionSkin } from './skin';

const TXT = {
  en: { generate: 'Generate next 4 weeks', working: 'Working…', pause: 'Pause', resume: 'Resume', created: (n: number) => `${n} trip${n === 1 ? '' : 's'} created.`, returns: (n: number) => `${n} return trip${n === 1 ? '' : 's'} created.`, existed: (n: number) => `${n} already existed.`, conflicts: (n: number) => `${n} skipped: bus or driver already busy.`, limit: 'Stopped: monthly trip limit of your plan reached.' },
  ar: { generate: 'توليد الأسابيع الأربعة القادمة', working: 'جارٍ التنفيذ…', pause: 'إيقاف', resume: 'استئناف', created: (n: number) => `تم إنشاء ${n} رحلة.`, returns: (n: number) => `تم إنشاء ${n} رحلة عودة.`, existed: (n: number) => `${n} موجودة مسبقاً.`, conflicts: (n: number) => `تم تخطي ${n}: الحافلة أو السائق مشغول.`, limit: 'توقف التوليد: تم بلوغ حد الرحلات الشهري في باقتك.' },
} as const;

/** What the generator did, in numbers. Shown after creating a regular trip and after "Generate". */
export function GenerateSummary({ state }: { state: FormState }) {
  const T = TXT[useDashLang()];
  const g = state.status === 'success' ? state.generated : undefined;
  return (
    <div aria-live="polite" aria-atomic="true">
      {g && (
        <ul role="status" className="space-y-0.5 text-xs font-semibold text-ink-primary">
          <li>{T.created(g.created)}</li>
          {g.returnTripsCreated > 0 && <li>{T.returns(g.returnTripsCreated)}</li>}
          {g.alreadyExisted > 0 && <li>{T.existed(g.alreadyExisted)}</li>}
          {g.conflicts > 0 && <li className="text-status-warning-fg">{T.conflicts(g.conflicts)}</li>}
          {g.limitReached && <li className="text-status-error-fg">{T.limit}</li>}
        </ul>
      )}
    </div>
  );
}

export function TemplateActions({ id, isActive, label }: { id: string; isActive: boolean; label: string }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const gen = useActionForm(generateTripTemplateFormAction);
  const act = useActionForm(setTripTemplateActiveFormAction);
  const skin = useRowActionSkin();
  const err = [gen.state, act.state].find((s) => s.status === 'error');
  const sr = <span className="sr-only"> {label}</span>;
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {isActive && (
          <form onSubmit={gen.onSubmit}><input type="hidden" name="id" value={id} />
            <button type="submit" aria-disabled={gen.pending} className={skin.main}>{gen.pending ? T.working : T.generate}{sr}</button>
          </form>
        )}
        <form onSubmit={act.onSubmit}><input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={isActive ? '0' : '1'} />
          <button type="submit" aria-disabled={act.pending} className={skin.action}>{isActive ? T.pause : T.resume}{sr}</button>
        </form>
      </div>
      <GenerateSummary state={gen.state} />
      <div aria-live="polite">{err && err.status === 'error' && <p role="alert" className="text-xs font-semibold text-status-error-fg">{genericErrorText(lang, err.code, err.detail)}</p>}</div>
    </div>
  );
}
