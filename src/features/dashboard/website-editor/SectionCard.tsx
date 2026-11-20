'use client';
import { useId, useState } from 'react';
import { Bi } from '@/components/dashboard/T';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { SECTION_FIELDS, SECTION_LABELS, SECTION_NOTES, compactContent } from '@/features/website/section-fields';
import type { DraftSection } from '@/features/website/pages-types';
import { deleteSectionFormAction, moveSectionFormAction, saveSectionFormAction, toggleSectionFormAction } from '../website-actions';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { FieldsForm } from './fields';
import { MiniActionForm } from './MiniActionForm';

/** One section: explicit Save (E2), move up/down, show/hide, delete. Read-only users see the content but no controls. */
export function SectionCard({ section, index, count, canWrite }: { section: DraftSection; index: number; count: number; canWrite: boolean }) {
  const lang = useDashLang();
  const uid = useId();
  const [content, setContent] = useState<Record<string, unknown>>(section.content);
  const { state, pending, ref, onSubmit } = useActionForm(saveSectionFormAction);
  const defs = SECTION_FIELDS[section.type];
  const note = SECTION_NOTES[section.type];
  const ids = { pageId: section.pageId, sectionId: section.id };
  return (
    <section aria-labelledby={`${uid}-h`} className={`space-y-4 rounded-2xl border border-line-default bg-surface-card p-5 ${section.isEnabled ? '' : 'opacity-70'}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${uid}-h`} className="font-bold">{index + 1}. {SECTION_LABELS[section.type][lang]}{!section.isEnabled && <span className="ms-2 text-xs font-medium text-ink-muted"><Bi en="(hidden)" ar="(مخفي)" /></span>}</h3>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <MiniActionForm action={moveSectionFormAction} fields={{ ...ids, dir: 'up' }} disabled={index === 0}><Bi en="Move up" ar="أعلى" /></MiniActionForm>
            <MiniActionForm action={moveSectionFormAction} fields={{ ...ids, dir: 'down' }} disabled={index === count - 1}><Bi en="Move down" ar="أسفل" /></MiniActionForm>
            <MiniActionForm action={toggleSectionFormAction} fields={{ ...ids, enabled: section.isEnabled ? '0' : '1' }}>{section.isEnabled ? <Bi en="Hide" ar="إخفاء" /> : <Bi en="Show" ar="إظهار" />}</MiniActionForm>
            <MiniActionForm action={deleteSectionFormAction} fields={ids} className="text-status-error-fg" confirmText={lang === 'ar' ? 'حذف هذا القسم؟' : 'Delete this section?'}><Bi en="Delete" ar="حذف" /></MiniActionForm>
          </div>
        )}
      </header>
      {note && <p className="text-xs text-ink-muted">{note[lang]}</p>}
      {defs.length > 0 && (
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="pageId" value={section.pageId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="content" value={JSON.stringify(compactContent(content) ?? {})} />
          <FieldsForm defs={defs} value={content} onChange={setContent} disabled={!canWrite} idPrefix={uid} />
          {canWrite && (
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-ink-on-brand disabled:opacity-60"><Bi en="Save section" ar="حفظ القسم" /></button>
              <SaveStatus view={viewOfForm(state, pending)} />
            </div>
          )}
        </form>
      )}
    </section>
  );
}
