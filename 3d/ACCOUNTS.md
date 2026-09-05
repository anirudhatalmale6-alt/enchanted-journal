# Turning on accounts

Without this, the journal saves what you write on the device you wrote it on.
That is why it works with no internet, and it is also why writing on a laptop
does not appear on a phone — nothing is storing it anywhere else.

Accounts need a database. This uses [Supabase](https://supabase.com), whose free
tier is far more than this needs. **The project should belong to the journal's
owner, not to me** — it holds people's private journals, and the owner should be
able to take it elsewhere at any time.

## 1. Make the project

1. Sign up at supabase.com, click **New Project**, any name, any nearby region.
2. When it has finished building, open **Project Settings → API**.
3. Copy the **Project URL** and the key labelled **anon public**.

> The `anon public` key is meant to be published — it is what the web page uses,
> and the policy in step 2 is what actually protects the data.
> The **`service_role`** key on that same page is the master key. It must never
> be put in a web page, emailed, or committed.

## 2. Make the table

**SQL Editor → New query**, paste this, Run:

```sql
create table if not exists public.entries (
  user_id    uuid        not null references auth.users on delete cascade,
  page       int         not null,
  body       text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, page)
);

alter table public.entries enable row level security;

-- One policy, and it is the whole of the security model: a signed-in reader can
-- see and change their own rows and nothing else. `with check` matters as much
-- as `using` — without it somebody could write a row under another user's id.
create policy "own entries" on public.entries
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 3. Point the journal at it

In `3d/config.js`:

```js
window.JOURNAL_CLOUD = window.JOURNAL_CLOUD || {
  url: 'https://YOURPROJECT.supabase.co',
  anonKey: 'the anon public key'
};
```

That is the whole switch. With those two values empty the sign-in screen never
appears and nothing changes; with them filled in it appears on load.

## 4. Allow the journal's address back in

**Authentication → URL Configuration**:

- **Site URL**: `https://anirudhatalmale6-alt.github.io/enchanted-journal/3d/`
- **Redirect URLs**: add the same address.

This matters for the "forgotten your password" link. Supabase will only send
someone back to an address on that list — leave it out and the reset email
lands on a Supabase page and stops there. Add every address the journal is
served from, including a custom domain later on.

## 5. Decide about confirmation emails

**Authentication → Providers → Email** has *Confirm email* on by default. Leave
it on and people must click a link before they can sign in — safer, but it needs
email delivery set up before it is reliable. Turn it off and they are signed in
the moment they register. The journal handles both: if signing up returns no
token it says so and asks them to check their email.

## How it behaves

- Writing is saved to the device on every keystroke, and queued to the account,
  which is sent after a short pause. Losing the connection loses nothing.
- **Signing in on a device that already has writing on it merges rather than
  overwrites.** A page the account has not seen is uploaded; a page the account
  already has wins, because it may have been written elsewhere since. Where the
  local copy is the account's copy with more added to the end, the longer one
  wins. Nothing is ever silently dropped.
- **Signing out wipes the local copy**, because by then it lives in the account
  and the next person to open the journal on a shared computer must not find it.
- Someone who would rather not have an account can choose *Just use this device*
  and get exactly the old behaviour. **That choice is remembered** — otherwise
  the journal asks the same question every single time it is opened, which is
  the fastest way to make somebody stop opening it. A *Sign in* link stays in
  the corner so it is never a one-way door.
- **Forgotten passwords**: the reset email comes back to this page with the new
  session in the URL *fragment* (`#access_token=…&type=recovery`). A fragment
  never reaches a server and is not in `location.search`; the journal reads it,
  keeps it, and scrubs it out of the address bar so the token is not left in
  browser history. The form then asks for a new password instead of an old one.
  The reply is always "if there is an account for that address…", whether or not
  there is one — otherwise the form becomes a way of finding out who has
  registered.
