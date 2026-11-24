/*
 * MASAR driver service worker (P7b slice D). Scope: /driver. Registered by src/features/driver/DriverPwa.tsx, production only.
 *
 * WHAT IT DOES, and nothing else:
 *   1. Keeps one static offline page and the app icons (install).
 *   2. Serves hashed build files (/_next/static) and brand images cache-first. They are public and immutable.
 *   3. If a navigation inside /driver cannot reach the network, answers with the offline page.
 *
 * WHAT IT NEVER DOES (privacy on a shared phone, correctness of boarding):
 *   - never caches an HTML page, an RSC payload, or any response from Supabase or the app's own API: they carry passenger names and sessions;
 *   - never touches a non-GET request, a cross-origin request, or a request outside /driver;
 *   - never answers a scan, a boarding or an end-trip call from a cache. Boarding is online-only on purpose.
 * The offline passenger list lives in the page (manifest-cache.ts: per user, one trip, 12 h, wiped on sign-out), NOT here.
 * Changing this file: bump VERSION. Old caches whose name starts with "driver-" are deleted on activate. No skipWaiting: an open screen is never
 * swapped under the driver mid-scan; the new worker takes over the next time the app is opened.
 */
'use strict';

const VERSION = 'v1';
const STATIC_CACHE = 'driver-static-' + VERSION;
const OFFLINE_URL = '/driver-offline.html';
const PRECACHE = [OFFLINE_URL, '/brand/icons/icon-192.png', '/brand/icons/icon-512.png'];

const inDriverScope = (path) => path === '/driver' || path.startsWith('/driver/');
const isStaticAsset = (path) => path.startsWith('/_next/static/') || path.startsWith('/brand/');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('driver-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // only a complete, same-origin 200 is stored (not 206 partials, not opaque, not errors)
  if (response && response.status === 200 && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && inDriverScope(url.pathname)) {
    // a server answer of ANY status is shown as it is; only "no network at all" becomes the offline page
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (isStaticAsset(url.pathname)) event.respondWith(cacheFirst(request));
});
