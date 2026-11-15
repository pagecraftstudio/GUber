/**
 * Decides, before first paint, whether this visit plays the loading reveal. It plays once per browser session, never on the
 * staff and driver surfaces (/dashboard, /admin, /driver: people there are working and must not wait), and never when storage
 * is blocked (it cannot remember, so it would replay on every page). When it should not play, `ds-splash-off` hides it.
 */
export const SPLASH_KEY = 'masar-splash-seen';
export const SPLASH_SCRIPT = `try{var p=location.pathname,r=document.documentElement;if(/^\\/(dashboard|admin|driver)(\\/|$)/.test(p)||sessionStorage.getItem('${SPLASH_KEY}')){r.classList.add('ds-splash-off')}else{sessionStorage.setItem('${SPLASH_KEY}','1')}}catch(e){document.documentElement.classList.add('ds-splash-off')}`;
