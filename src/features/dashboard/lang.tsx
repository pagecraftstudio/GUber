'use client';
import { createContext, useContext } from 'react';
import type { Lang } from './messages';

const LangContext = createContext<Lang>('en');
/** The dashboard shell owns the language (toggle + localStorage); client forms read it here instead of keeping their own. */
export const DashboardLangProvider = LangContext.Provider;
export const useDashLang = (): Lang => useContext(LangContext);
