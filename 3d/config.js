/* Where the journal keeps its accounts.

   Both values are meant to be public. The anon key is designed to sit in a web
   page — it is in the page source either way — and every row is protected by a
   policy on the database that lets a reader touch nothing but their own. The
   OTHER key in the Supabase dashboard, the one called service_role (or secret),
   must never come anywhere near this file.

   Having these filled in is NOT on its own enough to switch accounts on: the
   `entries` table has to exist as well. The journal checks for it on load and
   stays on device-only storage until it is there. See ACCOUNTS.md.

   `||` rather than a plain assignment so a host, a test rig or a build step can
   set the values before this file loads without having to edit it. */

window.JOURNAL_CLOUD = window.JOURNAL_CLOUD || {
  url: 'https://mxwtlhfvkrslinpnsxnn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14d3RsaGZ2a3JzbGlucG5zeG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjAwMTcsImV4cCI6MjEwNDE5NjAxN30.P7NRInm4XBX0X8ZltHWYt9oZ7qPTUUvJzA_iu3j_oTs'
};
