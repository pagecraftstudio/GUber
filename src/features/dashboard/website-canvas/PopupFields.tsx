'use client';
import { useId, useState } from 'react';
import { Bi } from '@/components/dashboard/T';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { SECTION_FIELDS, SECTION_NOTES, compactContent } from '@/features/website/section-fields';
import type { DraftSection } from '@/features/website/pages-types';
import { saveSectionFormAction } from '../website-actions';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { FieldsForm } from '../website-editor/fields';

/** The section's own fields (same descriptors and the same save action as the page editor), in the popup. Explicit Save. */
export function PopupFields({ section }: { section: DraftSection }) {
  const lang = useDashLang();
  const uid = useId();
  const [content, setContent] = useState<Record<string, unknown>>(section.content);
  const { state, pending, ref, onSubmit } = useActionForm(saveSectionFormAction);
  const defs = SECTION_FIELDS[section.type];
  const note = SECTION_NOTES[section.type];
  if (defs.length === 0) return note ? <p className="text-xs text-ink-muted">{note[lang]}</p> : null;
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="pageId" value={section.pageId} />
      <input type="hidden" name="sectionId" value={section.id} />
      <input type="hidden" name="content" value={JSON.stringify(compactContent(content) ?? {})} />
      {note ? <p className="text-xs text-ink-muted">{note[lang]}</p> : null}
      <FieldsForm defs={defs} value={content} onChange={setContent} disabled={false} idPrefix={uid} />
      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 bg-surface-card px-1 py-2">
        <button type="submit" disabled={pending} className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-ink-on-brand disabled:opacity-60"><Bi en="Save" ar="حفظ" /></button>
        <SaveStatus view={viewOfForm(state, pending)} />
      </div>
    </form>
  );
}
