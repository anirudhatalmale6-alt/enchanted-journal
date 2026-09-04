/* ------------------------------------------------------------------
   The Journey to Me — page painting for the 3D book.

   Every leaf in the scene is a piece of geometry with a picture on it,
   and this file paints those pictures.  Each page is drawn onto its own
   2D canvas, which then becomes a texture.

   Only a handful of pages are ever visible at once, so canvases are kept
   in a small pool and the least-recently-used one is recycled.  Painting
   all 90-odd pages up front would cost a few hundred megabytes.

   The text itself is not written here — it comes from content.js, which
   is transcribed word for word from the client's own PDF.
------------------------------------------------------------------- */

const J = (typeof JOURNAL !== 'undefined') ? JOURNAL : window.JOURNAL;

export const PAGE_W = 900;
export const PAGE_H = 1203;             // 1.337, the rectified cover's ratio

const INK = '#241206';
const INK_SOFT = '#54341f';
const GOLD = '#96641c';
const GOLD_LIGHT = '#b98c3c';
const RULE = 'rgba(120,84,44,0.46)';

const SERIF = '"Iowan Old Style","Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';
const DISPLAY = '"Didot","Bodoni MT","Playfair Display",Georgia,serif';
const HAND = 'Caveat,"Snell Roundhand","Bradley Hand","Segoe Script","Brush Script MT",cursive';

/* ------------------------------------------------------------------ list */

/* Page 0 is the cover art, which lives on the cover board rather than on a
   leaf.  Everything from index 1 on is a leaf face: leaf j shows page 1+2j on
   its front and page 2+2j on its back.

   Each day gets four pages — the prompt, then three to write on.  Four is not
   arbitrary: with an odd block the prompt and the writing would swap sides of
   the spread every single day.  At four, the prompt always falls on the left
   and you always write on the right. */
export function buildPages() {
  const p = [
    { t: 'cover' },
    { t: 'belongs' },
    { t: 'welcome' },
    { t: 'contents' }
  ];
  J.days.forEach(d => {
    p.push({ t: 'prompt', day: d });
    for (let i = 1; i <= 3; i++) p.push({ t: 'write', day: d, part: i });
  });
  p.push({ t: 'closing' });
  p.push({ t: 'endpaper', last: true });
  while ((p.length - 1) % 2) p.push({ t: 'endpaper' });   // leaves need two faces
  p.forEach((q, i) => { q.i = i; });
  return p;
}

/* Where a day's prompt sits, for the table of contents. */
export function dayPage(n) { return 4 + (n - 1) * 4; }

/* ------------------------------------------------------------- utilities */

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

/* The frame from the client's own cover, redrawn: a heavy rule, a hairline
   inside it, and a small diamond at each corner. */
function frame(ctx, inset) {
  const x = inset, y = inset * 1.02, w = PAGE_W - inset * 2, h = PAGE_H - inset * 2.04;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3.2;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(176,133,66,0.55)';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);

  ctx.fillStyle = GOLD_LIGHT;
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }
}

function flourish(ctx, cx, cy, w) {
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy);
  ctx.lineTo(cx - 14, cy);
  ctx.moveTo(cx + 14, cy);
  ctx.lineTo(cx + w / 2, cy);
  ctx.stroke();
  ctx.fillStyle = GOLD_LIGHT;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-4.5, -4.5, 9, 9);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx - 9, cy, 2.2, 0, 7);
  ctx.arc(cx + 9, cy, 2.2, 0, 7);
  ctx.fill();
}

function paper(ctx, tex) {
  ctx.fillStyle = '#f7eeda';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (tex && tex.complete && tex.naturalWidth) {
    ctx.globalAlpha = 0.62;
    ctx.drawImage(tex, 0, 0, PAGE_W, PAGE_H);
    ctx.globalAlpha = 1;
  }
  // A little age in the corners, so the flat cream does not read as plastic.
  const g = ctx.createRadialGradient(
    PAGE_W * 0.5, PAGE_H * 0.45, PAGE_W * 0.18,
    PAGE_W * 0.5, PAGE_H * 0.5, PAGE_W * 0.85);
  g.addColorStop(0, 'rgba(255,251,240,0.42)');
  g.addColorStop(1, 'rgba(120,86,48,0.13)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
}

/* --------------------------------------------------------- ruled writing */

const LINE_TOP = 250, LINE_GAP = 62, MARGIN = 118;
const LINE_W = PAGE_W - MARGIN * 2;

function rules(ctx, from) {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.4;
  for (let y = from; y < PAGE_H - 150; y += LINE_GAP) {
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
  }
}

function nLines(from) { return Math.floor((PAGE_H - 150 - from) / LINE_GAP); }

/* The client's handwriting, laid along the ruled lines.  Returns how many
   characters were consumed, so a long answer can run onto the next page. */
function handwrite(ctx, text, from, caret) {
  ctx.font = `46px ${HAND}`;
  ctx.fillStyle = '#2f3a52';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, text || '', LINE_W - 12);
  const max = nLines(from);
  let lastX = MARGIN + 2, lastY = from - 12;
  for (let i = 0; i < Math.min(lines.length, max); i++) {
    const y = from + i * LINE_GAP - 12;
    ctx.fillText(lines[i], MARGIN + 2, y);
    lastX = MARGIN + 2 + ctx.measureText(lines[i]).width;
    lastY = y;
  }
  if (caret) {
    ctx.fillStyle = 'rgba(47,58,82,0.85)';
    ctx.fillRect(lastX + 3, lastY - 32, 3, 40);
  }
  return { overflow: Math.max(0, lines.length - max) };
}

/* ------------------------------------------------------------- the pages */

export function paintPage(ctx, page, ctxState) {
  const { paperImg, coverImg, entries, caretOn, focus } = ctxState;
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);

  if (page.t === 'cover') {
    if (coverImg && coverImg.complete && coverImg.naturalWidth) {
      ctx.drawImage(coverImg, 0, 0, PAGE_W, PAGE_H);
    } else {
      ctx.fillStyle = '#4a1220';
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    }
    return;
  }

  paper(ctx, paperImg);

  if (page.t === 'endpaper') {
    frame(ctx, 54);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(176,133,66,0.75)';
    ctx.font = `italic 38px ${DISPLAY}`;
    ctx.fillText('The Journey to Me', PAGE_W / 2, PAGE_H / 2 - 6);
    flourish(ctx, PAGE_W / 2, PAGE_H / 2 + 34, 210);
    return;
  }

  frame(ctx, 46);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(150,100,28,0.75)';
  ctx.font = `19px ${SERIF}`;
  ctx.fillText(String(page.i), PAGE_W / 2, PAGE_H - 62);
  ctx.textAlign = 'center';

  if (page.t === 'belongs') {
    ctx.fillStyle = GOLD;
    ctx.font = `54px ${DISPLAY}`;
    ctx.fillText(J.belongs.heading, PAGE_W / 2, 360);
    flourish(ctx, PAGE_W / 2, 410, 260);
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(MARGIN + 30, 560);
    ctx.lineTo(PAGE_W - MARGIN - 30, 560);
    ctx.stroke();
    const name = entries[page.i] || '';
    ctx.font = `52px ${HAND}`;
    ctx.fillStyle = '#2f3a52';
    ctx.fillText(name, PAGE_W / 2, 546);
    if (focus === page.i && caretOn) {
      const w = ctx.measureText(name).width;
      ctx.fillRect(PAGE_W / 2 + w / 2 + 5, 512, 3, 40);
    }
    return;
  }

  if (page.t === 'welcome') {
    ctx.fillStyle = GOLD;
    ctx.font = `40px ${DISPLAY}`;
    ctx.fillText(J.welcome.title, PAGE_W / 2, 168);
    ctx.font = `50px ${DISPLAY}`;
    ctx.fillText(J.welcome.title2, PAGE_W / 2, 226);
    flourish(ctx, PAGE_W / 2, 268, 240);
    body(ctx, J.welcome.body, 330);
    return;
  }

  if (page.t === 'contents') {
    ctx.fillStyle = GOLD;
    ctx.font = `50px ${DISPLAY}`;
    ctx.fillText(J.contents.title, PAGE_W / 2, 160);
    flourish(ctx, PAGE_W / 2, 200, 240);
    ctx.textAlign = 'left';
    ctx.font = `23px ${SERIF}`;
    let y = 262;
    J.days.forEach(d => {
      ctx.fillStyle = GOLD;
      ctx.fillText(String(d.n).padStart(2, '0'), MARGIN - 26, y);
      ctx.fillStyle = INK;
      const t = d.title.length > 34 ? d.title.slice(0, 33) + '…' : d.title;
      ctx.fillText(t, MARGIN + 18, y);
      y += 40.5;
    });
    return;
  }

  if (page.t === 'prompt') {
    const d = page.day;
    ctx.fillStyle = GOLD;
    ctx.font = `600 26px ${SERIF}`;
    ctx.letterSpacing = '6px';
    ctx.fillText('DAY ' + String(d.n).padStart(2, '0'), PAGE_W / 2, 158);
    ctx.letterSpacing = '0px';
    ctx.font = `44px ${DISPLAY}`;
    ctx.fillStyle = '#7d1f33';
    const tl = wrap(ctx, d.title, LINE_W);
    let y = 216;
    tl.forEach(l => { ctx.fillText(l, PAGE_W / 2, y); y += 52; });
    flourish(ctx, PAGE_W / 2, y + 6, 230);
    body(ctx, d.body, y + 66);
    ctx.font = `italic 24px ${SERIF}`;
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = 'center';
    ctx.fillText(J.strings.answerHere, PAGE_W / 2, PAGE_H - 108);
    return;
  }

  if (page.t === 'write') {
    const d = page.day;
    ctx.fillStyle = GOLD;
    ctx.font = `600 22px ${SERIF}`;
    ctx.letterSpacing = '5px';
    ctx.fillText('DAY ' + String(d.n).padStart(2, '0') +
      (page.part > 1 ? '  ·  ' + J.strings.continued.toUpperCase() : ''), PAGE_W / 2, 150);
    ctx.letterSpacing = '0px';
    flourish(ctx, PAGE_W / 2, 186, 200);
    rules(ctx, LINE_TOP);
    handwrite(ctx, entries[page.i] || '', LINE_TOP, focus === page.i && caretOn);
    if (!entries[page.i] && focus !== page.i) {
      ctx.textAlign = 'left';
      ctx.font = `italic 28px ${SERIF}`;
      ctx.fillStyle = 'rgba(107,75,54,0.45)';
      ctx.fillText(J.strings.writeHere, MARGIN + 4, LINE_TOP - 14);
    }
    return;
  }

  if (page.t === 'closing') {
    ctx.fillStyle = GOLD;
    ctx.font = `44px ${DISPLAY}`;
    const tl = wrap(ctx, J.closing.title, LINE_W);
    let y = 180;
    tl.forEach(l => { ctx.fillText(l, PAGE_W / 2, y); y += 52; });
    flourish(ctx, PAGE_W / 2, y + 6, 230);
    body(ctx, J.closing.body, y + 66);
  }
}

function body(ctx, paras, y) {
  ctx.textAlign = 'left';
  ctx.font = `29px ${SERIF}`;
  ctx.fillStyle = INK;
  for (const p of paras) {
    for (const line of wrap(ctx, p, LINE_W)) {
      ctx.fillText(line, MARGIN, y);
      y += 40;
    }
    y += 18;
  }
  return y;
}

export function isWritable(page) {
  return page.t === 'write' || page.t === 'belongs';
}
