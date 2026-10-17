'use client';

import dynamic from 'next/dynamic';

/**
 * The UI keeps browser-only state (localStorage-backed mock data, theme, locale), so it is rendered on the client
 * only. Phase 6+ replaces the mock data layer with the real backend; this wrapper stays.
 */
const App = dynamic(() => import('./App'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-[var(--surface-page)]" aria-busy="true" />,
});

export function UiRoot() {
  return <App />;
}
