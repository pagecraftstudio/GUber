'use client';
import { createContext, useContext } from 'react';
import type { Lang } from './format';
import { DS_TEXT, type DsText } from './messages';

const Ctx = createContext<Lang>('en');
/** Shells (Phase 4) own the language and provide it here. Until then components default to English or take a `lang` prop. */
export const DsLangProvider = Ctx.Provider;
export const useDsLang = (override?: Lang): Lang => { const c = useContext(Ctx); return override ?? c; };
export const useDsText = (override?: Lang): DsText => DS_TEXT[useDsLang(override)];
