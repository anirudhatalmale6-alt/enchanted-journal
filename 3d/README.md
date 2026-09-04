# The Journey to Me — the 3D version

The same journal, in a real three-dimensional scene: the book lying on a dark
walnut table, lit by candles, with crimson petals falling through the air.

**Live:** https://anirudhatalmale6-alt.github.io/enchanted-journal/3d/
**Walkthrough:** https://anirudhatalmale6-alt.github.io/enchanted-journal/preview.html

Nothing in it is a picture of a book. The boards, the spine, the page block and
every leaf you turn are geometry; the candles are light sources. The shadow
under the book and the shine along the gold are worked out fresh every frame
from wherever the flames happen to be, which is why they move when the flames
flicker.

## What's here

| File | What it does |
|---|---|
| `index.html` | The page shell, the on-screen controls and the handwriting font |
| `scene.js` | The whole scene: table, candles, book, page turning, petals, dust, input |
| `pages.js` | Paints each page onto a 2D canvas, which becomes a texture |
| `lib/` | three.js r169, its orbit controls and the bloom pass, vendored |
| `assets/` | Wood and leather maps, the petals, the handwriting font |
| `walkthrough-3d.mp4` | The recorded walkthrough |

The words come from `../content.js` — the same file the illustrated version
uses, transcribed from the client's PDF. Change a prompt there and it changes
in both.

## The page turn

A page is not a card that flips. `shapeLeaf` walks along the page from the
spine to the outer edge in 48 steps, turning the direction of travel a little
further at each one, and drops each vertex wherever that walk lands it. That
accumulating turn is what makes the page bow up off the stack in the middle of
a turn and settle flat at either end, instead of scything through the paper
underneath it.

## Things that bit, so they do not bite again

- **A shadow-casting point light renders a cube map**, and the seam between two
  of its faces fell straight down the open page as a hard vertical line. The
  shadows come from a spot light, which has one map and no seams.
- **A resting page dips into the gutter, and that dip must stay smaller than
  the gap between the page and the block underneath it.** At 7.5mm the page
  sank into the block near the spine and the block's cream top face showed
  through — which read exactly like a shadow bug and was not one.
- **`state.coverOpen === 1` is the wrong test.** An eased animation driven by a
  capped frame delta lands a hair short of its target on a slow machine, and
  exact equality then locks the book shut for good. It compares `> 0.999`.
- **A CSS animation on `opacity` outranks a plain rule**, so the opening hint
  kept breathing away long after it had been told to leave.
- The candles stand back and tall on purpose. Close to the book, the inverse
  square falloff lights the near page and leaves the far one in the dark.

## Recording the walkthrough

`../record3d.py`. Headless WebGL runs on SwiftShader, which manages perhaps six
frames a second — filming that in real time would show the page turn
stuttering, which is a lie about the animation. So the scene's clock is taken
away from it (`__scene.capture(true)`) and advanced by hand, one exact 25th of
a second per screenshot.

## Notes

- Writing is saved on the reader's own device, under its own key
  (`journey-to-me-3d`), separate from the illustrated version.
- The service worker deliberately does not cache anything under `/3d/`, so a
  change here reaches everyone on their next visit.
- three.js is MIT; the Caveat handwriting font is SIL Open Font License. Both
  licences are alongside the files.
