/* Where the journal keeps its accounts.

   Until these two are filled in the journal behaves exactly as it always has:
   no sign-in screen, and writing saved on the device it was written on. Fill
   them in and the sign-in screen appears and the writing follows the reader to
   any device.

   Both values are meant to be public. The anon key is designed to sit in a web
   page, and every row is protected by a policy on the database that lets a
   reader touch nothing but their own. The OTHER key on that page in Supabase —
   the one called service_role — must never go anywhere near this file. */

/* `||` rather than a plain assignment so a host, a test rig or a build step can
   set the values before this file loads without having to edit it. */
window.JOURNAL_CLOUD = window.JOURNAL_CLOUD || {
  url: '',        // e.g. https://abcdefgh.supabase.co
  anonKey: ''     // the key labelled "anon public"
};
