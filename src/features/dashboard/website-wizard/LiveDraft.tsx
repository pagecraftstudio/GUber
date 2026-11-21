'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { LiveDraft } from '@/features/website/preview-site';
import type { SectionShape } from '@/features/website/wizard-content';

type Api = { open: boolean; setOpen(v: boolean): void; draft: LiveDraft; patchForm(fd: FormData): void; setContent(c: SectionShape): void };
const Ctx = createContext<Api | null>(null);

const TEXT_KEYS = ['titleEn', 'titleAr', 'primaryColor', 'secondaryColor', 'email', 'phone', 'whatsapp', 'addressEn', 'addressAr', 'footerEn', 'footerAr'] as const;

/** What the owner has typed but not necessarily saved. Only the preview reads it; saving still goes through the step's own form. */
export function LiveDraftProvider({ initial, children }: { initial: LiveDraft; children: ReactNode }) {
  const [draft, setDraft] = useState<LiveDraft>(initial);
  const [open, setOpen] = useState(true);
  const patchForm = useCallback((fd: FormData) => {
    setDraft((d) => {
      const next = { ...d };
      for (const k of TEXT_KEYS) if (fd.has(k)) next[k] = String(fd.get(k) ?? '');
      return next;
    });
  }, []);
  const setContent = useCallback((content: SectionShape) => setDraft((d) => ({ ...d, content })), []);
  const api = useMemo(() => ({ open, setOpen, draft, patchForm, setContent }), [open, draft, patchForm, setContent]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export const useLiveDraft = (): Api | null => useContext(Ctx);
