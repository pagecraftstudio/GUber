'use client';
import { useEffect, useRef } from 'react';
import { browserStore } from './manifest-cache';
import { clearManifest } from './manifest-cache';

/** Put inside the sign-out <form>: when it is submitted the offline passenger list is wiped from this device first. */
export function ClearOfflineOnSignOut() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;
    const wipe = () => clearManifest(browserStore());
    form.addEventListener('submit', wipe);
    return () => form.removeEventListener('submit', wipe);
  }, []);
  return <span ref={marker} hidden aria-hidden="true" />;
}
