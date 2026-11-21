import type { ReactNode } from 'react';

/**
 * Markup the dashboard's visual editor adds around the site's own sections. Used ONLY when SiteView is given `editor` (the draft
 * canvas); the public site never renders any of it. It is plain, server-rendered HTML with data-* hooks: the client shell reads
 * those hooks from one delegated listener, so this file has no event handlers and no client code.
 */
export type EditorBlock = { id: string; type: string; label: string; enabled: boolean };

export function Block({ block, children }: { block: EditorBlock; children: ReactNode }) {
  return (
    <div data-block-id={block.id} data-enabled={block.enabled ? 'true' : 'false'} tabIndex={0} role="group" aria-roledescription="editable section" aria-label={block.label}
      className={`group/block relative cursor-pointer outline-none hover:ring-2 hover:ring-inset hover:ring-focus focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus data-[selected=true]:ring-2 data-[selected=true]:ring-inset data-[selected=true]:ring-action ${block.enabled ? '' : 'opacity-50'}`}>
      {!block.enabled ? <span className="pointer-events-none absolute start-2 top-2 z-10 rounded-full bg-ink-primary px-2 py-0.5 text-[11px] font-medium text-surface-page">Hidden · مخفي</span> : null}
      {children}
    </div>
  );
}

/** A thin strip between sections (and at both ends) with a "+" shown on hover/focus, always visible on touch screens. */
export function InsertSlot({ index, prominent = false }: { index: number; prominent?: boolean }) {
  return (
    <div className={`relative z-20 flex items-center justify-center ${prominent ? 'py-16' : 'h-0'}`}>
      <button type="button" data-insert-at={index} aria-label="Add a section here · إضافة قسم هنا"
        className={`flex size-7 items-center justify-center rounded-full bg-action text-on-action shadow-md outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus ${prominent ? 'size-auto gap-2 px-4 py-2 text-sm font-medium opacity-100' : '-my-3.5 opacity-0 hover:opacity-100 [@media(hover:none)]:opacity-90'}`}>
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        {prominent ? <span>Add your first section · أضف أول قسم</span> : null}
      </button>
    </div>
  );
}

export function Placeholder({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-xs text-ink-muted">{label}</div>;
}
