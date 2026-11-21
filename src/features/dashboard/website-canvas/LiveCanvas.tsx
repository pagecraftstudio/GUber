'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ComponentProps, type ReactNode } from 'react';
import type { SectionType } from '@/features/site/sections';
import { IDLE } from '../form-state';
import { insertSectionFormAction } from '../website-actions';
import { SiteView, type SiteLinks } from '@/features/site/SiteView';
import { CanvasShell } from './CanvasShell';
import { overlayDetails, overlaySections, withPending, type DetailsDraft, type PendingSection, type SectionDrafts, type StyleDrafts } from './live-overlay';

type Live = {
  setSection: (id: string, content: Record<string, unknown>) => void;
  setDetails: (d: DetailsDraft) => void;
  /** Show a style choice at once (the server save follows). */
  setStyle: (id: string, change: Record<string, string>) => void;
  /** Add a section: it appears at once, the server creates the real one in the background. */
  insert: (pageId: string, index: number, type: SectionType, base: number) => void;
};
const NOOP: Live = { setSection: () => undefined, setDetails: () => undefined, setStyle: () => undefined, insert: () => undefined };
const LiveContext = createContext<Live>(NOOP);
type Drafts = { sections: SectionDrafts; styles: StyleDrafts; details: DetailsDraft | null; pending: PendingSection[]; error: boolean; clearPending: (count: number) => void };
const DraftsContext = createContext<Drafts>({ sections: {}, styles: {}, details: null, pending: [], error: false, clearPending: () => undefined });

/** What is being typed or chosen, shared by the editing popup / details panel (writers) and the preview (reader). Without a provider it does nothing. */
export const useLiveDraft = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<SectionDrafts>({});
  const [styles, setStyles] = useState<StyleDrafts>({});
  const [details, setDetailsState] = useState<DetailsDraft | null>(null);
  const [pending, setPending] = useState<PendingSection[]>([]);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();
  const setSection = useCallback((id: string, content: Record<string, unknown>) => setSections((p) => ({ ...p, [id]: content })), []);
  const setDetails = useCallback((d: DetailsDraft) => setDetailsState(d), []);
  const setStyle = useCallback((id: string, change: Record<string, string>) => setStyles((p) => ({ ...p, [id]: { ...p[id], ...change } })), []);
  const insert = useCallback((pageId: string, index: number, type: SectionType, base: number) => {
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setError(false);
    setPending((p) => [...p, { tempId, type, index, base }]);
    const fd = new FormData();
    fd.set('pageId', pageId); fd.set('index', String(index)); fd.set('type', type);
    startTransition(async () => {
      const r = await insertSectionFormAction(IDLE, fd).catch(() => null);
      if (!r || r.status !== 'success') { setPending((p) => p.filter((x) => x.tempId !== tempId)); setError(true); }
    });
  }, []);
  const api = useMemo(() => ({ setSection, setDetails, setStyle, insert }), [setSection, setDetails, setStyle, insert]);
  // The real section arrived (the page has more sections than when it was added): drop the stand-in.
  const clearPending = useCallback((count: number) => setPending((p) => (p.some((x) => count > x.base) ? p.filter((x) => count <= x.base) : p)), []);
  const drafts = useMemo(() => ({ sections, styles, details, pending, error, clearPending }), [sections, styles, details, pending, error, clearPending]);
  return <LiveContext.Provider value={api}><DraftsContext.Provider value={drafts}>{children}</DraftsContext.Provider></LiveContext.Provider>;
}

const inert: SiteLinks = { home: () => '#', page: () => '#', lang: () => '#' };
type SiteProps = Omit<ComponentProps<typeof SiteView>, 'links'>;

/**
 * The canvas: the draft site drawn here, in the browser, from the server's data plus whatever is being typed, so text shows up as it
 * is typed. Drafts are never cleared on a server refresh (that would flash the old text between a save and the refreshed data); they
 * only hold keys the text form owns, so they cannot conflict with other saves, and a page change remounts everything.
 */
export function LiveCanvas({ shell, site }: { shell: Omit<ComponentProps<typeof CanvasShell>, 'children'>; site: SiteProps }) {
  const { sections, styles, details, pending, error, clearPending } = useContext(DraftsContext);
  const count = shell.sections.length;
  useEffect(() => { clearPending(count); }, [count, clearPending]);
  const ids = useMemo(() => (site.editor ?? []).map((b) => b.id), [site.editor]);
  const shown = useMemo(() => {
    const overlaid = overlaySections(site.page.sections, ids, sections, styles);
    return withPending(overlaid, site.editor ?? [], pending.filter((p) => count <= p.base), (p) => ({ id: p.tempId, type: p.type, enabled: true, label: 'Adding… · جارٍ الإضافة…' }));
  }, [site.page.sections, site.editor, ids, sections, styles, pending, count]);
  const page = useMemo(() => ({ ...site.page, sections: shown.sections }), [site.page, shown.sections]);
  const data = useMemo(() => {
    const settings = overlayDetails(site.data.site.settings, details);
    const pages = site.data.site.pages.map((p) => (p.slug === site.page.slug && p.is_home === site.page.is_home ? page : p));
    return { ...site.data, site: { ...site.data.site, settings, pages } };
  }, [site.data, site.page, page, details]);
  return (
    <CanvasShell {...shell}>
      {error ? <p role="alert" className="bg-status-error-bg px-3 py-2 text-xs text-status-error-fg">Could not add the section. Try again. · تعذّرت إضافة القسم، حاول مرة أخرى.</p> : null}
      <SiteView {...site} data={data} page={page} links={inert} editor={shown.blocks} />
    </CanvasShell>
  );
}
