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

/* Is the database actually set up, or are there only keys?

   The project can be live and the keys correct while the `entries` table has
   not been created yet — the SQL is a separate step, done by hand. Without this
   check the reader would be shown a sign-in screen, allowed to make an account,
   and then told "could not find the table public.entries" the first time they
   wrote a word. So the journal asks once, on load, and quietly stays on
   device-only storage until the answer is yes.

   With row-level security on and nobody signed in, this returns 200 and an
   empty list. A missing table returns 404 / PGRST205. */
export async function ready() {
  if (!configured()) return false;
  try {
    const res = await fetch(restUrl('/entries?select=page&limit=1'), {
      headers: { 'apikey': CFG.anonKey }
    });
    if (res.ok) return true;
    const body = await readJson(res);
    if (res.status === 404 || (body && body.code === 'PGRST205')) {
      console.warn('[journal] Accounts are configured but the `entries` table ' +
                   'does not exist yet — see 3d/ACCOUNTS.md, step 2. ' +
                   'Writing is being saved to this device only.');
      return false;
    }
    /* Anything else — a 401, a 403, a bad gateway — means the table is there
       and something else is wrong. Fail OPEN: show the sign-in screen and let
       the real request report the real reason, rather than silently deciding
       accounts do not exist because a project is momentarily unhappy. */
    console.warn('[journal] Account service answered', res.status, body);
    return true;
  } catch (e) {
    // Offline, or the project is asleep. Device-only is the right answer to
    // both, and the journal is meant to work with no internet anyway.
    console.warn('[journal] Could not reach the account service:', e.message);
    return false;
  }
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

/* PostgREST answers a successful upsert with 200 or 201 and a body of ZERO
   bytes unless you ask for a representation. `res.json()` on that throws
   "Unexpected end of JSON input" — which is what a real reader saw, as
   "Signed in, but could not load your writing", the moment the merge tried to
   upload anything. Read the text and only parse if there is any. */
async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function readError(res) {
  const body = await readJson(res);
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
  // `{}` not null: callers read .access_token off this, and /auth/v1/recover
  // answers with an empty object anyway.
  return (await readJson(res)) || {};
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
  return readJson(res);
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
  const q = new URLSearchParams(hash.replace(/^#/, ''));

  /* An expired or already-used link comes back as an error in the same
     fragment. Without this the reader is dropped on the sign-in screen with no
     idea why their link did nothing, which is the most annoying possible
     outcome of clicking a link that was supposed to help them. */
  const err = q.get('error_description') || q.get('error');
  if (err) {
    history.replaceState(null, '', location.pathname + location.search);
    return { type: 'error', message: decodeURIComponent(err).replace(/\+/g, ' ') };
  }

  if (hash.indexOf('access_token=') === -1) return null;
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
  const u = (await readJson(res)) || {};
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
  return readJson(res);
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
