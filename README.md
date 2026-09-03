# The Journey to Me — 21 Day Self-Transformation Journal

A web version of the journal that people can write in, keep, and install on a
phone, tablet, MacBook or laptop like an app.

**Live:** https://anirudhatalmale6-alt.github.io/enchanted-journal/

## What's here

| File | What it does |
|---|---|
| `content.js` | **Every word in the journal.** Edit this to change any wording |
| `index.html` | The page shell |
| `styles.css` | The whole look — paper, leather, gold, ornate border, 3-D flip |
| `journal.js` | Page turning, writing and saving, tabs, the petal/stardust engine, install |
| `sw.js` | Offline cache, so the journal works with no internet after the first visit |
| `manifest.webmanifest` | Makes it installable, with the gold book as its icon |
| `assets/` | Paper texture, ornate border, cover and the 21 flowers |

No frameworks and no libraries. Drop the folder on any web host and it runs.

## The book

- Cover → This Book Belongs to → Welcome → Table of Contents
- Then, for each of the 21 days: the prompt page with its flower, followed by
  **two** writing pages, so nobody runs out of room part-way through a thought
- A Personal Message to You at the end, with a way back to the cover

70 pages in all. The page numbering, the Table of Contents, the numbered tabs
and the thickness of the book are all worked out from `content.js` at load
time — add or remove a day and everything follows.

## Changing the text

```js
{
  n: 1,
  title: 'The Day of Introduction',
  body: [ 'First paragraph.', 'Second paragraph.' ],
  bullets: [ 'an optional bulleted question' ],   // optional
  note: '(an optional italic aside)'              // optional
}
```

## Where the artwork came from

The paper texture, the ornate page border, the cover and all 21 flowers were
cut out of the client's own PDF (`extract_flowers.py` and `extract_assets.py`
in the parent folder), so the web version matches the printed design rather
than imitating it. Total weight of every image is under 900KB.

## Notes

- Writing is saved on the reader's own device (localStorage) and comes back
  when they return. It is private to them, and it survives being offline.
  Syncing one person's writing across two devices would need a small backend.
- `✦ Magic` cycles the petals and stardust: On / Soft / Off. Readers who ask
  their device for reduced motion get Soft automatically.
- Installing: Chrome, Edge and Android show an Install button; on iPhone and
  iPad it's Share → Add to Home Screen. Either way it then opens full screen
  with no browser bars and works with no internet.
- **When you change anything in `assets/`, bump `CACHE` in `sw.js`** or already
  installed copies will keep serving the old files forever.
