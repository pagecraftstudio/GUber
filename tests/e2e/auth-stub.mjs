// LOCAL TEST SCAFFOLDING ONLY. A minimal GoTrue-compatible stub (signup / password login / refresh / user / logout / recover)
// that signs HS256 JWTs with the same secret as the local PostgREST, and proxies /rest/v1/* to it.
// It is NOT Supabase Auth: it does not validate real GoTrue behaviour (rate limits, email delivery, PKCE, MFA...).
// Its purpose is to let the app's real supabase-js code path run in a browser against the real RPCs/RLS locally.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const { JWT_SECRET, REST_URL, PSQL_BIN = 'psql', DB, PORT = '3200', AUTOCONFIRM = '1' } = process.env;
const users = new Map(); // email -> { id, password, meta, confirmed, createdAt }
const refresh = new Map(); // refresh token -> email
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (claims) => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const p = b64u(JSON.stringify(claims));
  return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const verify = (tok) => {
  const [h, p, s] = (tok || '').split('.');
  if (!s || crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString()); return c.exp * 1000 > Date.now() ? c : null;
};
const userJson = (u, email) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: u.confirmed ? u.createdAt : null,
  phone: '', created_at: u.createdAt, updated_at: u.createdAt, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.meta, identities: [], is_anonymous: false });
const session = (email) => {
  const u = users.get(email); const now = Math.floor(Date.now() / 1000); const exp = now + 3600;
  const access = sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email, iat: now, exp, session_id: crypto.randomUUID(), user_metadata: u.meta, app_metadata: { provider: 'email' } });
  const rt = crypto.randomBytes(16).toString('hex'); refresh.set(rt, email);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson(u, email) };
};
const psql = (sql, vars) => new Promise((res, rej) => {
  const args = ['-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, ...Object.entries(vars).flatMap(([k, v]) => ['-v', `${k}=${v}`]), '-f', '-'];
  const c = spawn(PSQL_BIN, args); let err = ''; c.stderr.on('data', (d) => (err += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(err)))); c.stdin.end(sql);
});
const readBody = (req) => new Promise((r) => { const a = []; req.on('data', (d) => a.push(d)); req.on('end', () => r(Buffer.concat(a))); });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
const send = (res, status, obj) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    if (url.pathname.startsWith('/rest/v1/')) {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers }; for (const k of ['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer']) delete headers[k];
      if (headers.authorization && !verify(headers.authorization.replace(/^Bearer /, ''))) delete headers.authorization; // anon key / expired -> anon role
      const r = await fetch(REST_URL + url.pathname.slice('/rest/v1'.length) + url.search, { method: req.method, headers, body });
      const out = Buffer.from(await r.arrayBuffer()); const h = { ...cors }; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
      res.writeHead(r.status, h); return res.end(out);
    }
    if (url.pathname === '/__test/confirm') { const u = users.get(url.searchParams.get('email')); if (u) u.confirmed = true; return send(res, 200, { ok: !!u }); }
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}'); const email = String(b.email || '').toLowerCase();
      if (!email || !b.password) return authErr(res, 422, 'validation_failed', 'email and password required');
      if (String(b.password).length < 8) return authErr(res, 422, 'weak_password', 'Password should be at least 8 characters.');
      if (users.has(email)) return send(res, 200, userJson({ ...users.get(email), id: crypto.randomUUID() }, email)); // obfuscated, like GoTrue
      const u = { id: crypto.randomUUID(), password: b.password, meta: b.data || {}, confirmed: AUTOCONFIRM === '1', createdAt: new Date().toISOString() };
      users.set(email, u);
      await psql("insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values (:'id', :'email', :'meta'::jsonb, now());", { id: u.id, email, meta: JSON.stringify(u.meta) });
      return send(res, 200, u.confirmed ? session(email) : userJson(u, email));
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}'); const grant = url.searchParams.get('grant_type');
      if (grant === 'refresh_token') { const email = refresh.get(b.refresh_token); return email ? send(res, 200, session(email)) : authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token'); }
      const email = String(b.email || '').toLowerCase(); const u = users.get(email);
      if (!u || u.password !== b.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return send(res, 200, session(email));
    }
    if (url.pathname === '/auth/v1/user') {
      const c = verify((req.headers.authorization || '').replace(/^Bearer /, '')); if (!c) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
      const email = c.email; return users.has(email) ? send(res, 200, userJson(users.get(email), email)) : authErr(res, 404, 'user_not_found', 'User not found');
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    if (url.pathname === '/auth/v1/recover') return send(res, 200, {});
    send(res, 404, { msg: 'not found in stub: ' + url.pathname });
  } catch (e) { console.error(e); send(res, 500, { msg: String(e.message || e) }); }
}).listen(Number(PORT), '127.0.0.1', () => console.log('auth stub on', PORT));
