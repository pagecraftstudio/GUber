'use client';
import { createContext, useContext } from 'react';

const Ctx = createContext(false);
/** A server layout tells client components whether its surface is flipped to MASAR (the decision itself is server-side, DsScope / isSurfaceScoped). Styling only, never authorization. */
export const DsFlagProvider = Ctx.Provider;
export const useDsFlipped = (): boolean => useContext(Ctx);
