'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { SECTION_FIELDS, SECTION_NOTES, compactContent } from '@/features/website/section-fields';
import type { DraftSection } from '@/features/website/pages-types';
import { saveSectionFormAction } from '../website-actions';
import { IDLE } from '../form-state';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { FieldsForm } from '../website-editor/fields';
import { useLiveDraft } from './LiveCanvas';

/** Quiet period after the last keystroke before the draft is saved. */
export const AUTOSAVE_MS = 900;

/**
 * The section's own fields (same descriptors and the same save action as the page editor), in the popup. Typing shows in the canvas at
 * once (LiveCanvas) and is saved by itself shortly after the last keystroke; closing the popup saves what is still waiting.
 */
export function PopupFields({ section }: { section: DraftSection }) {
  const lang = useDashLang();
  const uid = useId();
  const live = useLiveDraft();
  const [content, setContent] = useState<Record<string, unknown>>(section.content);
  const { state, pending, ref, submit } = useActionForm(saveSectionFormAction);
  const latest = useRef(content);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const build = () => {
    const fd = new FormData();
    fd.set('pageId', section.pageId); fd.set('sectionId', section.id); fd.set('content', JSON.stringify(compactContent(latest.current) ?? {}));
    return fd;
  };
  const flush = () => { clearTimeout(timer.current); if (!dirty.current) return; dirty.current = false; submit(build()); };
  const change = (next: Record<string, unknown>) => {
    latest.current = next; dirty.current = true;
    setContent(next); live.setSection(section.id, next);
    clearTimeout(timer.current); timer.current = setTimeout(flush, AUTOSAVE_MS);
  };
  // Closing the popup (or switching section) must not lose the last keystrokes: save them directly, the hook is going away.
  const closing = useRef(() => undefined as void);
  closing.current = () => { clearTimeout(timer.current); if (dirty.current) { dirty.current = false; void saveSectionFormAction(IDLE, build()); } };
  useEffect(() => () => closing.current(), []);
  const defs = SECTION_FIELDS[section.type];
  const note = SECTION_NOTES[section.type];
  if (defs.length === 0) return note ? <p className="text-xs text-ink-muted">{note[lang]}</p> : null;
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); flush(); }} className="space-y-3">
      {note ? <p className="text-xs text-ink-muted">{note[lang]}</p> : null}
      <FieldsForm defs={defs} value={content} onChange={change} disabled={false} idPrefix={uid} />
      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 bg-surface-card px-1 py-2">
        <p className="text-xs text-ink-muted">{lang === 'ar' ? 'يُحفظ تلقائيًا' : 'Saves automatically'}</p>
        <SaveStatus view={viewOfForm(state, pending)} />
      </div>
    </form>
  );
}
