'use client';
import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2, X } from 'lucide-react';
import { Bi } from '@/components/dashboard/T';
import { CANVAS_SECTIONS, SECTION_LABELS } from '@/features/website/section-fields';
import type { DraftSection } from '@/features/website/pages-types';
import { deleteSectionFormAction, insertSectionFormAction, moveSectionFormAction, toggleSectionFormAction } from '../website-actions';
import { MiniActionForm } from '../website-editor/MiniActionForm';
import { useDashLang } from '../lang';
import { HeroImageCard } from './HeroImageCard';
import { PopupFields } from './PopupFields';
import { StyleCard } from './StyleCard';

/** Every section that draws content has a look; the footer is always drawn from settings. */
const SECTION_HAS_LOOK = new Set(['hero', 'about', 'features', 'routes', 'trips', 'faq', 'contact', 'rich_text', 'image']);

export type Pos = { top: number; left: number };
const W = 320;
export const POPUP_WIDTH = W;

/** Shared frame: a small floating box (a bottom sheet on phones), non-modal, Escape closes, focus moves in and is handed back by the shell. */
const Frame = forwardRef<HTMLDivElement, { title: ReactNode; pos: Pos; onClose: () => void; children: ReactNode; labelledBy: string }>(function Frame({ title, pos, onClose, children, labelledBy }, ref) {
  const lang = useDashLang();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div ref={ref} role="dialog" aria-modal="false" aria-labelledby={labelledBy} dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      style={{ ['--pop-top' as string]: `${pos.top}px`, ['--pop-left' as string]: `${pos.left}px`, ['--pop-max' as string]: `calc(100vh - ${pos.top}px - 16px)` }}
      className="fixed inset-x-2 bottom-2 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface-card text-ink-primary shadow-xl md:inset-x-auto md:bottom-auto md:[left:var(--pop-left)] md:[top:var(--pop-top)] md:max-h-[var(--pop-max)] md:w-80">
      <div className="flex items-center justify-between gap-2 border-b border-line-hairline px-4 py-2.5">
        <h2 id={labelledBy} className="text-sm font-semibold">{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={lang === 'ar' ? 'إغلاق' : 'Close'} className="grid size-7 place-items-center rounded-full hover:bg-surface-sunken"><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  );
});

const Ico = ({ i: I, children }: { i: typeof X; children: ReactNode }) => <span className="inline-flex items-center gap-1"><I size={14} aria-hidden="true" />{children}</span>;

/** Click a block: its controls (move, hide/show, delete) and its fields, in one place. */
export const BlockPopup = forwardRef<HTMLDivElement, { section: DraftSection; index: number; count: number; pos: Pos; onClose: () => void; imageUrl?: string | null; canUpload?: boolean }>(function BlockPopup({ section, index, count, pos, onClose, imageUrl = null, canUpload = false }, ref) {
  const lang = useDashLang();
  const ids = { pageId: section.pageId, sectionId: section.id };
  return (
    <Frame ref={ref} labelledBy={`pop-${section.id}`} pos={pos} onClose={onClose} title={<>{SECTION_LABELS[section.type][lang]}{!section.isEnabled && <span className="ms-2 text-xs font-medium text-ink-muted"><Bi en="(hidden)" ar="(مخفي)" /></span>}</>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <MiniActionForm action={moveSectionFormAction} fields={{ ...ids, dir: 'up' }} disabled={index === 0}><Ico i={ArrowUp}><Bi en="Up" ar="أعلى" /></Ico></MiniActionForm>
        <MiniActionForm action={moveSectionFormAction} fields={{ ...ids, dir: 'down' }} disabled={index === count - 1}><Ico i={ArrowDown}><Bi en="Down" ar="أسفل" /></Ico></MiniActionForm>
        <MiniActionForm action={toggleSectionFormAction} fields={{ ...ids, enabled: section.isEnabled ? '0' : '1' }}>
          {section.isEnabled ? <Ico i={EyeOff}><Bi en="Hide" ar="إخفاء" /></Ico> : <Ico i={Eye}><Bi en="Show" ar="إظهار" /></Ico>}
        </MiniActionForm>
        <MiniActionForm action={deleteSectionFormAction} fields={ids} className="text-status-error-fg" confirmText={lang === 'ar' ? 'حذف هذا القسم؟' : 'Delete this section?'}><Ico i={Trash2}><Bi en="Delete" ar="حذف" /></Ico></MiniActionForm>
      </div>
      {section.type === 'hero' ? <HeroImageCard key={`img:${section.id}:${section.updatedAt}`} section={section} imageUrl={imageUrl} canUpload={canUpload} /> : null}
      {SECTION_HAS_LOOK.has(section.type) ? <StyleCard key={`look:${section.id}:${section.updatedAt}`} section={section} /> : null}
      <PopupFields key={section.id} section={section} />
    </Frame>
  );
});

/** The "+" between two blocks: pick what to add. */
export const AddMenu = forwardRef<HTMLDivElement, { pageId: string; index: number; pos: Pos; onClose: () => void }>(function AddMenu({ pageId, index, pos, onClose }, ref) {
  const lang = useDashLang();
  return (
    <Frame ref={ref} labelledBy="pop-add" pos={pos} onClose={onClose} title={<Bi en="Add a section" ar="إضافة قسم" />}>
      <ul className="grid grid-cols-2 gap-2">
        {CANVAS_SECTIONS.map((t) => (
          <li key={t}><MiniActionForm action={insertSectionFormAction} fields={{ pageId, index: String(index), type: t }} className="w-full text-start">{SECTION_LABELS[t][lang]}</MiniActionForm></li>
        ))}
      </ul>
    </Frame>
  );
});
