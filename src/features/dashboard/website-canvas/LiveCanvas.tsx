'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { SiteView, type SiteLinks } from '@/features/site/SiteView';
import { CanvasShell } from './CanvasShell';
import { overlayDetails, overlaySections, type DetailsDraft, type SectionDrafts } from './live-overlay';

type Live = { setSection: (id: string, content: Record<string, unknown>) => void; setDetails: (d: DetailsDraft) => void };
const NOOP: Live = { setSection: () => undefined, setDetails: () => undefined };
const LiveContext = createContext<Live>(NOOP);
const DraftsContext = createContext<{ sections: SectionDrafts; details: DetailsDraft | null }>({ sections: {}, details: null });

/** What is being typed, shared by the editing popup / details panel (writers) and the preview (reader). Without a provider it does nothing. */
export const useLiveDraft = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<SectionDrafts>({});
  const [details, setDetailsState] = useState<DetailsDraft | null>(null);
  const setSection = useCallback((id: string, content: Record<string, unknown>) => setSections((p) => ({ ...p, [id]: content })), []);
  const setDetails = useCallback((d: DetailsDraft) => setDetailsState(d), []);
  const api = useMemo(() => ({ setSection, setDetails }), [setSection, setDetails]);
  const drafts = useMemo(() => ({ sections, details }), [sections, details]);
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
  const { sections, details } = useContext(DraftsContext);
  const ids = useMemo(() => (site.editor ?? []).map((b) => b.id), [site.editor]);
  const page = useMemo(() => ({ ...site.page, sections: overlaySections(site.page.sections, ids, sections) }), [site.page, ids, sections]);
  const data = useMemo(() => {
    const settings = overlayDetails(site.data.site.settings, details);
    const pages = site.data.site.pages.map((p) => (p.slug === site.page.slug && p.is_home === site.page.is_home ? page : p));
    return { ...site.data, site: { ...site.data.site, settings, pages } };
  }, [site.data, site.page, page, details]);
  return (
    <CanvasShell {...shell}>
      <SiteView {...site} data={data} page={page} links={inert} />
    </CanvasShell>
  );
}
