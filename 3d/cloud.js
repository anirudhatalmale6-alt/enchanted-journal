/* ------------------------------------------------------------------
   Accounts and cloud storage for the journal.

   This talks to Supabase's REST endpoints directly with fetch rather than
   pulling in the JavaScript SDK.  The SDK is a few hundred kilobytes to do
   what six requests do here, and the rest of this project vendors everything
   it uses — a journal that stops working because a CDN is having a bad day
   would be a poor journal.

   Nothing here runs at all until config.js has a url and an anon key in it.
   Until then `configured()` is false, the sign-in screen never appears, and
   the journal saves to the device exactly as it did before.
------------------------------------------------------------------- */

const CFG = (typeof window !== 'undefined' && window.JOURNAL_CLOUD) || {};
const SESSION_KEY = 'journey-to-me-session';

export function configured() {
  return !!(CFG.url && CFG.anonKey);
}

/* ------------------------------------------------------------- session */

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }

function store(s) {
  session = s;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

export function currentUser() {
  return session && session.user ? session.user : null;
}

function keep(json) {
  if (!json || !json.access_token) return null;
  const s = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    // expires_in is seconds from now; store the absolute moment instead, or a
    // tab left open overnight thinks its hour-old token has an hour left.
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    user: json.user ? { id: json.user.id, email: json.user.email } : null
  };
  store(s);
  return s;
}

/* ------------------------------------------------------------ requests */

function authUrl(path) { return CFG.url.replace(/\/$/, '') + '/auth/v1' + path; }
function restUrl(path) { return CFG.url.replace(/\/$/, '') + '/rest/v1' + path; }

async function readError(res) {
  let body = null;
  try { body = await res.json(); } catch (e) { /* not json */ }
  const msg = (body && (body.error_description || body.msg || body.message || body.error))
              || ('Request failed (' + res.status + ')');
  const err = new Error(msg);
  err.status = res.status;
  return err;
}

async function postAuth(path, body) {
  const res = await fetch(authUrl(path), {
    method: 'POST',
    headers: { 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

/* A token lasts an hour. Refresh a minute before it runs out rather than after
   it has, so a long writing session never has a request fail underneath it. */
async function freshToken() {
  if (!session) throw new Error('Not signed in');
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  try {
    const json = await postAuth('/token?grant_type=refresh_token',
      { refresh_token: session.refresh_token });
    return keep(json).access_token;
  } catch (e) {
    store(null);
    throw new Error('Your session has expired — please sign in again.');
  }
}

async function rest(path, opts) {
  const token = await freshToken();
  const res = await fetch(restUrl(path), Object.assign({}, opts, {
    headers: Object.assign({
      'apikey': CFG.anonKey,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }, (opts && opts.headers) || {})
  }));
  if (!res.ok) throw await readError(res);
  return res.status === 204 ? null : res.json();
}

/* --------------------------------------------------------------- auth */

export async function signUp(email, password) {
  const json = await postAuth('/signup', { email, password });
  // With email confirmation switched on Supabase returns a user and no token.
  // That is not a failure, it just means nothing can be saved yet.
  if (!json.access_token) {
    return { needsConfirmation: true, email };
  }
  keep(json);
  return { needsConfirmation: false, user: currentUser() };
}

export async function signIn(email, password) {
  const json = await postAuth('/token?grant_type=password', { email, password });
  keep(json);
  return currentUser();
}

export function signOut() {
  store(null);
}

/* Supabase emails a link back to whatever page asked for it, so the redirect
   has to be this page — a reset that lands on a Supabase default page and then
   nowhere is worse than no reset at all. */
export async function resetPassword(email) {
  const redirect = location.origin + location.pathname;
  await postAuth('/recover?redirect_to=' + encodeURIComponent(redirect), { email });
}

/* Coming back from that email, the new session arrives in the URL FRAGMENT —
   `#access_token=...&type=recovery` — which never reaches a server and is not
   in location.search. Pick it up, keep it, and scrub it out of the address bar
   so the token is not left sitting in history or copied out of it. */
export function claimLinkSession() {
  const hash = location.hash || '';
  if (hash.indexOf('access_token=') === -1) return null;
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const at = q.get('access_token');
  if (!at) return null;
  const s = {
    access_token: at,
    refresh_token: q.get('refresh_token') || '',
    expires_at: Date.now() + (parseInt(q.get('expires_in'), 10) || 3600) * 1000,
    user: null
  };
  store(s);
  history.replaceState(null, '', location.pathname + location.search);
  return { type: q.get('type') || 'recovery' };
}

/* Who the current token belongs to. Used after a link session, which arrives
   with a token and no user on it. */
export async function loadUser() {
  const token = await freshToken();
  const res = await fetch(authUrl('/user'), {
    headers: { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) throw await readError(res);
  const u = await res.json();
  store(Object.assign({}, session, { user: { id: u.id, email: u.email } }));
  return currentUser();
}

export async function changePassword(password) {
  const token = await freshToken();
  const res = await fetch(authUrl('/user'), {
    method: 'PUT',
    headers: {
      'apikey': CFG.anonKey,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

/* ------------------------------------------------------------ entries */

export async function pull() {
  const rows = await rest('/entries?select=page,body', { method: 'GET' });
  const out = {};
  (rows || []).forEach(r => { out[r.page] = r.body; });
  return out;
}

export async function put(page, body) {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  await rest('/entries', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify([{ user_id: user.id, page: Number(page), body: String(body) }])
  });
}

/* Writing arrives a keystroke at a time. Queue by page and flush after a pause,
   so a paragraph is one request rather than two hundred. */
const queue = new Map();
let timer = null;
let onState = () => {};

export function onSyncState(fn) { onState = fn || (() => {}); }

export function save(page, body) {
  if (!configured() || !currentUser()) return;
  queue.set(String(page), body);
  onState('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
}

async function flush() {
  if (!queue.size) return;
  const batch = Array.from(queue.entries());
  queue.clear();
  try {
    for (const [page, body] of batch) await put(page, body);
    onState(queue.size ? 'saving' : 'saved');
  } catch (e) {
    // Put the work back so the next keystroke retries it, and say so plainly —
    // silently dropping somebody's journal entry is the worst thing this could
    // possibly do.
    batch.forEach(([page, body]) => { if (!queue.has(page)) queue.set(page, body); });
    onState('error', e.message);
  }
}

export function flushNow() {
  clearTimeout(timer);
  return flush();
}

/* -------------------------------------------------------------- merge

   First sign-in on a device that already has writing on it is the only place
   the two copies can disagree. The rule is simply never to lose a word:

     - a page the account does not have yet takes the local copy, and is
       uploaded;
     - a page the account already has wins, because it may have been written
       on another device since.

   Anything the reader can lose here they can never get back, so where the rule
   is ambiguous it keeps both by preferring the longer text.
*/
export async function merge(local) {
  const remote = await pull();
  const out = Object.assign({}, remote);
  const uploads = [];

  Object.keys(local || {}).forEach(page => {
    const mine = (local[page] || '').trim();
    if (!mine) return;
    const theirs = (remote[page] || '').trim();
    if (!theirs) {
      out[page] = local[page];
      uploads.push([page, local[page]]);
    } else if (theirs !== mine && mine.length > theirs.length && mine.indexOf(theirs) === 0) {
      // the local copy is the same entry with more written on the end
      out[page] = local[page];
      uploads.push([page, local[page]]);
    }
  });

  for (const [page, body] of uploads) await put(page, body);
  return out;
}
