/**
 * Runs in <head> before the first paint so a saved dark preference never flashes light.
 * The dashboard keeps its own saved value (`malaky-dashboard-theme`); every other surface uses `malaky_theme_mode`
 * ('light' | 'dark' | 'system'). Admin, driver and sign-in pages have no toggle and follow the same saved choice.
 * Any failure (storage blocked) leaves the page light.
 */
export const THEME_SCRIPT = `try{var k=location.pathname.indexOf('/dashboard')===0?'malaky-dashboard-theme':'malaky_theme_mode';var m=localStorage.getItem(k);if(m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)){var r=document.documentElement;r.classList.add('dark');r.setAttribute('data-theme','dark')}}catch(e){}`;
