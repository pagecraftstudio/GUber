import type { ReactNode } from 'react';

/** Wraps one surface's layout and sets data-ds="masar", which switches on the base styles and fonts (src/styles). `display: contents` keeps layout identical. */
export function DsScope({ children }: { surface?: string; companyId?: string | null; children: ReactNode }) {
  return (
    <div data-ds="masar" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
