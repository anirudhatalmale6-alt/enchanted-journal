# The Enchanted Journal

A vintage animated web journal — write on every page, turn the leaves with a
realistic flip, and watch flower petals and stardust drift across the spread.

**Live demo:** https://anirudhatalmale6-alt.github.io/enchanted-journal/

## What's here

| File | What it does |
|---|---|
| `index.html` | The page shell |
| `styles.css` | The whole vintage look — aged paper, leather cover, gold foil, 3-D flip |
| `journal.js`  | Page turning, writing + saving, tabs, and the petal/stardust engine |
| `content.js`  | **The journal text.** Edit this file to change what the pages say |

No build step, no frameworks, no external libraries. Drop the folder on any
web host and it runs.

## Changing the text

Open `content.js`. Each entry is one page:

```js
{
  title: 'Once Upon a Page',
  date:  'The first evening',
  body:  'Paragraph one.\n\nParagraph two.'
}
```

Add or remove entries freely — the page numbers, the numbered tabs and the
book's thickness all follow automatically.

## Notes

- Writing is saved to the visitor's own browser (localStorage), so it comes
  back for them on the same device. Saving to an account across devices needs
  a small backend, which can be added.
- Tested in Chrome, and responsive down to a 390px phone (one page at a time,
  with swipe).
- `✦ Magic` cycles the particle density: On / Soft / Off. Off is also used
  automatically for visitors who ask for reduced motion.
