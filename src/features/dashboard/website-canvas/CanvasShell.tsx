'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DraftSection } from '@/features/website/pages-types';
import { DeviceFrame } from '../website-wizard/DeviceFrame';
import { AddMenu, BlockPopup, POPUP_WIDTH, type Pos } from './Popups';

type Open = { kind: 'block'; id: string } | { kind: 'add'; index: number } | null;

/** Where the popup goes: beside the clicked element, inside the viewport, below the dashboard's sticky header. */
export function placeFor(el: Element, anchor: 'block' | 'slot'): Pos {
  const r = el.getBoundingClientRect();
  const rtl = getComputedStyle(el).direction === 'rtl';
  const vw = window.innerWidth, vh = window.innerHeight;
  const raw = anchor === 'slot' ? r.left + r.width / 2 - POPUP_WIDTH / 2 : rtl ? r.left + 12 : r.right - POPUP_WIDTH - 12;
  const left = Math.max(12, Math.min(raw, vw - POPUP_WIDTH - 12));
  const top = Math.max(72, Math.min(anchor === 'slot' ? r.bottom + 8 : r.top + 8, vh - 200));
  return { left, top };
}

/**
 * The draft site as a canvas. `children` is the server-rendered site (SiteView with `editor`), so this component holds NO site
 * markup of its own: it only listens. One delegated listener maps a click or Enter on a [data-block-id] to its popup and on a
 * [data-insert-at] "+" to the add menu. Every click inside the site is swallowed (links, FAQ toggles), so nothing can navigate away
 * from unsaved work. Read-only staff get the same canvas without any popup.
 */
export function CanvasShell({ children, pageId, sections, canWrite, canUpload = false, imageUrls = {} }: { children: ReactNode; pageId: string; sections: DraftSection[]; canWrite: boolean; canUpload?: boolean; imageUrls?: Record<string, string> }) {
  const [open, setOpen] = useState<Open>(null);
  const [pos, setPos] = useState<Pos>({ top: 72, left: 12 });
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLElement | null>(null);              // the element to hand focus back to on close

  const findOrigin = useCallback((o: NonNullable<Open>) => rootRef.current?.querySelector<HTMLElement>(o.kind === 'block' ? `[data-block-id="${CSS.escape(o.id)}"]` : `[data-insert-at="${o.index}"]`) ?? null, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(null);
    if (restoreFocus) originRef.current?.focus({ preventScroll: true });
    originRef.current = null;
  }, []);

  // Mark the selected block (an unmanaged attribute: React leaves it alone when the server re-renders the section).
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    root.querySelectorAll('[data-selected="true"]').forEach((n) => n.removeAttribute('data-selected'));
    if (open?.kind === 'block') root.querySelector(`[data-block-id="${CSS.escape(open.id)}"]`)?.setAttribute('data-selected', 'true');
  });

  // The thing the popup belongs to disappeared (deleted) or a section was added through the menu: close.
  const count = sections.length;
  const lastCount = useRef(count);
  useEffect(() => {
    if (open?.kind === 'block' && !sections.some((s) => s.id === open.id)) close(false);
    if (open?.kind === 'add' && count > lastCount.current) close(false);
    lastCount.current = count;
  }, [sections, count, open, close]);

  // Follow the anchor while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const update = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const el = originRef.current ?? findOrigin(open); if (el) setPos(placeFor(el, open.kind === 'add' ? 'slot' : 'block')); }); };
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, findOrigin]);

  // A click outside the canvas and its popup closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) close(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, close]);

  const show = (next: NonNullable<Open>, el: HTMLElement) => {
    originRef.current = el;
    setPos(placeFor(el, next.kind === 'add' ? 'slot' : 'block'));
    setOpen(next);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    e.preventDefault(); e.stopPropagation();                         // nothing inside the draft site may navigate or toggle
    if (!canWrite) return;
    const slot = t.closest<HTMLElement>('[data-insert-at]');
    if (slot) { show({ kind: 'add', index: Number(slot.dataset.insertAt) }, slot); return; }
    const block = t.closest<HTMLElement>('[data-block-id]');
    if (block?.dataset.blockId) show({ kind: 'block', id: block.dataset.blockId }, block); else close(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && open) { e.stopPropagation(); close(); return; }
    if (canWrite && (e.key === 'Enter' || e.key === ' ') && t.matches('[data-block-id]') && t.dataset.blockId) { e.preventDefault(); show({ kind: 'block', id: t.dataset.blockId }, t); }
  };

  const idx = open?.kind === 'block' ? sections.findIndex((s) => s.id === open.id) : -1;
  const section = idx >= 0 ? sections[idx] : undefined;
  return (
    <>
      <DeviceFrame>
        <div ref={rootRef} onClickCapture={onClickCapture} onKeyDown={onKeyDown}>{children}</div>
      </DeviceFrame>
      {canWrite && open?.kind === 'block' && section ? <BlockPopup ref={popRef} section={section} index={idx} count={count} pos={pos} onClose={() => close()} imageUrl={imageUrls[section.id] ?? null} canUpload={canUpload} /> : null}
      {canWrite && open?.kind === 'add' ? <AddMenu ref={popRef} pageId={pageId} index={open.index} count={count} pos={pos} onClose={() => close()} /> : null}
    </>
  );
}
