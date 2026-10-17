import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
export const BASE = process.env.BASE, STUB = process.env.STUB, DB = process.env.DB, PSQL = process.env.PSQL_BIN;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sql = (q) => execFileSync(PSQL, ['-tA', '-F', '|', '-d', DB, '-c', q]).toString().trim();
/** One row as a real JS object. Uses row_to_json so booleans are true/false (psql's text format prints 't'/'f', which broke === 'true'). */
export const sqlRow = (q) => JSON.parse(execFileSync(PSQL, ['-tA', '-d', DB, '-c', `select row_to_json(r) from (${q}) r`]).toString().trim() || 'null');
const results = []; let shot = 0;
export const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
export const summary = () => { const f = results.filter((r) => !r.ok); console.log(`\nE2E: ${results.length - f.length} passed, ${f.length} failed`); return f.length === 0; };
export const launch = async () => { // CHROME_PATH = any local Chromium (e.g. Playwright's); otherwise @sparticuz/chromium if installed
  if (process.env.CHROME_PATH) return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: 'shell' });
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--no-sandbox'], headless: 'shell' });
};
export async function newPage(browser) {
  const p = await browser.newPage(); await p.setViewport({ width: 1280, height: 1000 });
  p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e).slice(0, 200)));
  p.reqs = []; p.on('request', (r) => p.reqs.push(r.url()));
  return p;
}
export const text = (p) => p.evaluate(() => document.body.innerText);
export const snap = async (p, name) => p.screenshot({ path: `/tmp/e2e/shots/${String(++shot).padStart(2, '0')}-${name}.png` });
export async function clickText(p, txt, { sel = 'button,a', scope = 'body', exact = false } = {}) {
  const h = await p.evaluateHandle((t, s, sc, ex) => [...document.querySelector(sc).querySelectorAll(s)].find((e) => e.offsetParent && (ex ? e.innerText.trim() === t : e.innerText.trim().startsWith(t))), txt, sel, scope, exact);
  const el = h.asElement(); if (!el) throw new Error('no clickable element: ' + txt); await el.click(); await sleep(350);
}
export const hasText = async (p, re) => re.test(await text(p));
export async function waitText(p, re, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await text(p))) return true; await sleep(200); } return false; }
export const dialogText = (p) => p.evaluate(() => (document.querySelector('[role=dialog]') || { innerText: '' }).innerText);
export async function typeInto(p, sel, value) {
  await p.waitForSelector(sel, { timeout: 5000 }); await p.focus(sel);
  await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); // clear (fields may be prefilled)
  await p.type(sel, value);
}
export const confirmEmail = (email) => fetch(`${STUB}/__test/confirm?email=${encodeURIComponent(email)}`).then((r) => r.json());
export async function tokenFor(email, password) { const r = await fetch(`${STUB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); return (await r.json()).access_token; }
export const rpc = (token, fn, args) => fetch(`${STUB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(args) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
export const T = (n) => `00000000-0000-4000-8000-000000000${n}`;
