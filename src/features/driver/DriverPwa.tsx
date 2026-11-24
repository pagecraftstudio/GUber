'use client';
import { useEffect } from 'react';

/** Registers the driver service worker (public/driver-sw.js, scope /driver). Production only: in development a worker hides code changes. Failure is silent: the app works without it. */
export function DriverPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => { navigator.serviceWorker.register('/driver-sw.js', { scope: '/driver' }).catch(() => undefined); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
