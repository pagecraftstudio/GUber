'use client';
import { useDsFlipped } from '@/ds/shell/flag';

/** The old screen shows this heading from the page; the MASAR screen draws its own, so exactly one <h1> exists either way. */
export function PageTitle() {
  return useDsFlipped() ? null : <h1 className="text-xl font-semibold">Boarding</h1>;
}
