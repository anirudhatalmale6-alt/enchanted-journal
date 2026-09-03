/* ==================================================================
   The Enchanted Journal — page turning, writing, petals & stardust
   No external libraries. ~30KB of hand-written JS.
   ================================================================== */

(function () {
  'use strict';

  const STORE_KEY   = 'enchanted-journal:v1';
  const REDUCED     = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLIP_MS     = REDUCED ? 60 : 1050;

  const stage     = document.getElementById('stage');
  const book      = document.getElementById('book');
  const tabsEl    = document.getElementById('tabs');
  const prevBtn   = document.getElementById('prevBtn');
  const nextBtn   = document.getElementById('nextBtn');
  const pageLabel = document.getElementById('pageLabel');
  const saveState = document.getElementById('saveState');
  const hintEl    = document.getElementById('hint');
  const fxToggle  = document.getElementById('fxToggle');
  const sndToggle = document.getElementById('soundToggle');

  /* ----------------------------------------------------------------
     1. Build the page list
     ---------------------------------------------------------------- */

  const defs = [];
  defs.push({ kind: 'cover' });
  defs.push({ kind: 'board' });
  JOURNAL.pages.forEach((p, i) => defs.push({ kind: 'entry', entry: p, num: i + 1 }));
  if ((defs.length + 2) % 2 !== 0) defs.push({ kind: 'blank' });   // keep whole leaves
  const finaleIndex = defs.length;
  defs.push({ kind: 'finale' });
  defs.push({ kind: 'backboard' });

  const LEAVES = defs.length / 2;
  const leafEls = [];

  const FLOURISH =
    '<svg class="flourish tl" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<path d="M4 42C4 18 18 4 42 4"/><path d="M10 46c0-20 16-36 36-36"/>' +
    '<path d="M16 50c14-2 24-12 26-26" stroke-dasharray="2 4"/>' +
    '<circle cx="46" cy="46" r="3"/><path d="M46 46c8-6 14-4 18 2"/><path d="M46 46c-6 8-4 14 2 18"/>' +
    '</svg>';

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function toParas(text) {
    return text.split(/\n\s*\n/).map(t => '<p>' + esc(t.trim()).replace(/\n/g, '<br>') + '</p>').join('');
  }

  function faceHTML(def, index, side) {
    const cls = 'face ' + side;
    const shades = '<div class="gutter-shade"></div><div class="turn-shade"></div><div class="corner-cue"></div>';

    if (def.kind === 'cover') {
      return '<div class="' + cls + ' cover">' + shades +
        '<div class="cover-frame"></div>' +
        '<div class="cover-inner">' +
          '<svg class="cover-crest" width="54" height="54" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="1.4">' +
            '<path d="M30 4c4 9 11 14 21 16-10 2-17 7-21 16-4-9-11-14-21-16 10-2 17-7 21-16z"/>' +
            '<circle cx="30" cy="20" r="3.2" fill="currentColor" stroke="none"/>' +
            '<path d="M30 40v14M22 50h16" stroke-linecap="round"/>' +
          '</svg>' +
          '<h1 class="cover-title">' + esc(JOURNAL.cover.title) + '</h1>' +
          '<p class="cover-sub">' + esc(JOURNAL.cover.subtitle) + '</p>' +
          '<p class="cover-owner">' + esc(JOURNAL.cover.owner) + '</p>' +
          '<p class="cover-open">Open the book</p>' +
        '</div></div>';
    }

    if (def.kind === 'board') {
      return '<div class="' + cls + ' board">' + shades +
        '<div class="board-inner"><div class="bookplate">' +
          '<h3>Ex Libris</h3>' +
          '<p contenteditable="true" class="plate-name" data-store="plate">Your name here</p>' +
        '</div></div></div>';
    }

    if (def.kind === 'backboard') {
      return '<div class="' + cls + ' board">' + shades + '<div class="board-inner"></div></div>';
    }

    if (def.kind === 'blank') {
      return '<div class="' + cls + '">' + shades + FLOURISH + '<div class="page-inner"></div></div>';
    }

    if (def.kind === 'finale') {
      return '<div class="' + cls + ' finale">' + shades + FLOURISH +
        '<div class="page-inner">' +
          '<h2 class="finale-title">' + esc(JOURNAL.ending.title) + '</h2>' +
          '<p class="finale-line">' + esc(JOURNAL.ending.line) + '</p>' +
          '<div class="finale-actions">' +
            '<button class="ink-btn" type="button" data-act="cover">Return to the cover</button>' +
            '<button class="ink-btn" type="button" data-act="prev">Back a page</button>' +
          '</div>' +
        '</div></div>';
    }

    // an entry page
    const e = def.entry;
    return '<div class="' + cls + '">' + shades + FLOURISH +
      '<div class="page-inner">' +
        '<div class="page-head">' +
          (e.title ? '<h2 class="page-title">' + esc(e.title) + '</h2>' : '') +
          (e.date ? '<div class="page-date">' + esc(e.date) + '</div>' : '') +
        '</div>' +
        '<div class="rule"></div>' +
        '<div class="entry" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"' +
          ' data-store="p' + index + '" data-prompt="' + esc(e.prompt || 'Write here…') + '">' +
          toParas(e.body || '') +
        '</div>' +
        '<div class="page-num">' + def.num + '</div>' +
      '</div></div>';
  }

  for (let i = 0; i < LEAVES; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    leaf.dataset.leaf = i;
    leaf.innerHTML = faceHTML(defs[i * 2], i * 2, 'front') + faceHTML(defs[i * 2 + 1], i * 2 + 1, 'back');
    book.appendChild(leaf);
    leafEls.push(leaf);
  }

  /* ----------------------------------------------------------------
     2. Saving what the reader writes
     ---------------------------------------------------------------- */

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { saved = {}; }

  const editables = Array.prototype.slice.call(book.querySelectorAll('[data-store]'));
  editables.forEach(el => {
    const k = el.dataset.store;
    if (Object.prototype.hasOwnProperty.call(saved, k)) el.innerHTML = saved[k];
  });

  let saveTimer = null;
  function scheduleSave() {
    saveState.textContent = 'Saving…';
    saveState.classList.add('flash');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commitSave, 600);
  }
  function commitSave() {
    const data = {};
    editables.forEach(el => { data[el.dataset.store] = el.innerHTML; });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      saveState.textContent = 'Saved';
    } catch (e) {
      saveState.textContent = 'Could not save';
    }
    setTimeout(() => saveState.classList.remove('flash'), 900);
  }

  book.addEventListener('input', e => {
    if (e.target.hasAttribute('data-store')) scheduleSave();
  });
  book.addEventListener('focusin', e => {
    if (e.target.hasAttribute('data-store')) hideHint();
  });
  // paste as plain text so pasted styling never breaks the vintage look
  book.addEventListener('paste', e => {
    if (!e.target.hasAttribute('data-store')) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); commitSave(); } });

  /* ----------------------------------------------------------------
     3. Layout — fit the book to whatever screen it lands on
     ---------------------------------------------------------------- */

  const RATIO = 1.4;              // page height / page width
  let single = false;             // one page at a time (phones / narrow windows)

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    single = w < 860;
    document.body.classList.toggle('single', single);

    const availW = w - (single ? 26 : 96);
    const availH = h - (single ? 178 : 174);   // room for the topbar, hint and controls

    let pw = single ? availW : availW / 2;
    let ph = pw * RATIO;
    if (ph > availH) { ph = availH; pw = ph / RATIO; }

    pw = Math.max(190, Math.min(pw, single ? 460 : 540));
    ph = pw * RATIO;

    document.documentElement.style.setProperty('--pw', pw.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--ph', ph.toFixed(1) + 'px');
    pan(false);
    sizeCanvas();
  }

  /* ----------------------------------------------------------------
     4. Navigation
     ---------------------------------------------------------------- */

  const state = { page: 0, busy: false };

  const spreadOf = p => (p % 2 === 0 ? p / 2 : (p + 1) / 2);

  function pan(animate) {
    const pw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pw'));
    const sp = spreadOf(state.page);
    let x = 0;
    if (single) {
      x = (state.page % 2 === 0) ? -pw / 2 : pw / 2;
    } else {
      if (sp === 0) x = -pw / 2;
      else if (sp === LEAVES) x = pw / 2;
    }
    book.style.transition = animate ? '' : 'none';
    book.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    if (!animate) { void book.offsetWidth; book.style.transition = ''; }
    book.classList.toggle('at-cover', sp === 0);
    book.classList.toggle('at-end', sp === LEAVES);
    updateStatics(sp, animate);
  }

  /* The block of paper under the leaves must not appear on a side the book
     has not opened onto yet — otherwise a closed cover sits next to a
     mysterious blank page. Hide instantly, reveal only once the turning
     leaf is past upright and already covering that half. */
  const statLeft  = book.querySelector('.static-left');
  const statRight = book.querySelector('.static-right');
  let statTimers = [];
  function updateStatics(sp, animate) {
    statTimers.forEach(clearTimeout);
    statTimers = [];
    const delay = animate ? FLIP_MS * 0.5 : 0;
    const set = (el, wanted) => {
      if (!wanted) { el.classList.add('hidden'); return; }
      if (!el.classList.contains('hidden')) return;
      statTimers.push(setTimeout(() => el.classList.remove('hidden'), delay));
    };
    set(statLeft, sp > 0);
    set(statRight, sp < LEAVES);
  }

  function setZ(flipping) {
    const sp = spreadOf(state.page);
    leafEls.forEach((el, i) => {
      el.style.zIndex = (i < sp) ? String(i + 1) : String(LEAVES - i);
    });
    (flipping || []).forEach(i => { leafEls[i].style.zIndex = String(LEAVES + 6); });
  }

  function goToPage(target, opts) {
    opts = opts || {};
    target = Math.max(0, Math.min(defs.length - 1, target));
    if (target === state.page && !opts.force) return;

    const fromSpread = spreadOf(state.page);
    state.page = target;
    const toSpread = spreadOf(target);

    const moving = [];
    if (toSpread > fromSpread) for (let i = fromSpread; i < toSpread; i++) moving.push(i);
    if (toSpread < fromSpread) for (let i = fromSpread - 1; i >= toSpread; i--) moving.push(i);

    setZ(moving);

    moving.forEach((idx, n) => {
      const el = leafEls[idx];
      const delay = Math.min(n * 95, 600);
      setTimeout(() => {
        el.classList.add('turning');
        el.classList.toggle('turned', idx < toSpread);
        setTimeout(() => { el.classList.remove('turning'); setZ(); }, FLIP_MS + 40);
      }, delay);
    });

    // whole-leaf turns get the burst; a plain side-to-side pan gets a whisper
    if (moving.length) {
      state.busy = true;
      setTimeout(() => { state.busy = false; }, FLIP_MS * 0.55);
      const key = target === 0 || target === finaleIndex || target === defs.length - 1;
      burst(toSpread > fromSpread ? 1 : -1, key ? 2.3 : (turnCount % 4 === 3 ? 1.55 : 1));
      turnCount++;
      playTurn();
    } else {
      burst(target > 0 ? 1 : -1, 0.45);
    }

    pan(true);
    if (!moving.length) setZ();
    updateChrome();
    hideHint();
  }

  let turnCount = 0;
  const next = () => goToPage(single ? state.page + 1 : 2 * (spreadOf(state.page) + 1));
  const prev = () => goToPage(single ? state.page - 1 : 2 * (spreadOf(state.page) - 1));

  function labelFor(p) {
    const d = defs[p];
    if (!d) return '';
    if (d.kind === 'cover') return 'Cover';
    if (d.kind === 'board') return 'Ex Libris';
    if (d.kind === 'finale') return 'The End';
    if (d.kind === 'backboard') return 'Back cover';
    if (d.kind === 'blank') return '';
    return 'Page ' + d.num;
  }

  function visiblePages() {
    const sp = spreadOf(state.page);
    if (single) return [state.page];
    const out = [];
    if (sp > 0) out.push(2 * sp - 1);
    if (2 * sp < defs.length) out.push(2 * sp);
    return out;
  }

  function updateChrome() {
    const vis = visiblePages();
    const names = vis.map(labelFor).filter(Boolean);
    pageLabel.textContent = names.length ? names.join(' · ') : '—';

    prevBtn.disabled = state.page <= 0;
    nextBtn.disabled = state.page >= defs.length - 1;

    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', vis.indexOf(parseInt(t.dataset.page, 10)) !== -1);
    });
  }

  /* ---- tabs ---- */
  function buildTabs() {
    const items = [{ label: '❦', page: 0, cls: 'tab-cover', title: 'Cover' }];
    defs.forEach((d, i) => { if (d.kind === 'entry') items.push({ label: String(d.num), page: i, cls: '', title: 'Page ' + d.num }); });
    items.push({ label: '✦', page: finaleIndex, cls: 'tab-end', title: 'The End' });

    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab ' + it.cls;
      b.textContent = it.label;
      b.title = it.title;
      b.dataset.page = it.page;
      b.addEventListener('click', () => goToPage(it.page));
      tabsEl.appendChild(b);
    });
  }
  buildTabs();

  /* ---- clicks on the book itself ---- */
  book.addEventListener('click', e => {
    if (e.target.closest('[data-store]')) return;             // writing, not turning

    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'cover') goToPage(0);
      else prev();
      return;
    }

    const face = e.target.closest('.face');
    if (!face) return;

    if (single) {
      const r = face.getBoundingClientRect();
      ((e.clientX - r.left) / r.width < 0.32) ? prev() : next();
    } else {
      face.classList.contains('back') ? prev() : next();
    }
  });

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  document.addEventListener('keydown', e => {
    if (e.target.hasAttribute && e.target.hasAttribute('data-store')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp')   { e.preventDefault(); prev(); }
    if (e.key === 'Home') { e.preventDefault(); goToPage(0); }
    if (e.key === 'End')  { e.preventDefault(); goToPage(finaleIndex); }
  });

  /* ---- swipe ---- */
  let tx = 0, ty = 0, tActive = false;
  stage.addEventListener('touchstart', e => {
    if (e.target.closest('[data-store]')) return;
    tActive = true; tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (!tActive) return;
    tActive = false;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? next() : prev());
  }, { passive: true });

  function hideHint() { hintEl.classList.add('gone'); }
  setTimeout(hideHint, 9000);

  /* ----------------------------------------------------------------
     5. Petals & stardust
     ---------------------------------------------------------------- */

  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;

  const petals = [];
  const dust = [];
  const LEVELS = [
    { name: 'On',   ambientPetals: 10, ambientDust: 40, mult: 1 },
    { name: 'Soft', ambientPetals: 4,  ambientDust: 16, mult: 0.4 },
    { name: 'Off',  ambientPetals: 0,  ambientDust: 0,  mult: 0 }
  ];
  let levelIdx = REDUCED ? 1 : 0;
  const level = () => LEVELS[levelIdx];

  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = stage.clientWidth; ch = stage.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const PETAL_TINTS = [
    ['#ffe3ea', '#e9a8b6'],
    ['#fff0d8', '#e6c091'],
    ['#fde5f0', '#d69ec0'],
    ['#fff6e2', '#f0d29a'],
    ['#f6e6ff', '#c7a8de']
  ];

  function bookRect() {
    const r = book.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  /* only the half (or halves) actually showing paper */
  function visibleRect() {
    const r = bookRect();
    const sp = spreadOf(state.page);
    const rightOnly = single ? (state.page % 2 === 0) : (sp === 0);
    const leftOnly  = single ? (state.page % 2 === 1) : (sp === LEAVES);
    if (rightOnly) return { x: r.x + r.w / 2, y: r.y, w: r.w / 2, h: r.h };
    if (leftOnly)  return { x: r.x, y: r.y, w: r.w / 2, h: r.h };
    return r;
  }

  function makePetal(o) {
    o = o || {};
    const tint = PETAL_TINTS[(Math.random() * PETAL_TINTS.length) | 0];
    return {
      x: o.x !== undefined ? o.x : Math.random() * cw,
      y: o.y !== undefined ? o.y : -40 - Math.random() * 120,
      vx: o.vx !== undefined ? o.vx : (Math.random() - 0.4) * 0.35,
      vy: o.vy !== undefined ? o.vy : 0.28 + Math.random() * 0.5,
      size: 5 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.035,
      spin: Math.random() * Math.PI * 2,
      vspin: 0.012 + Math.random() * 0.03,
      sway: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      alpha: 0,
      target: 0.26 + Math.random() * 0.26,   // stays readable over the writing
      life: 0,
      tint: tint,
      drag: 0.985
    };
  }

  function makeDust(o) {
    o = o || {};
    const life = 900 + Math.random() * 1600;
    return {
      x: o.x !== undefined ? o.x : Math.random() * cw,
      y: o.y !== undefined ? o.y : Math.random() * ch,
      vx: o.vx !== undefined ? o.vx : (Math.random() - 0.5) * 0.25,
      vy: o.vy !== undefined ? o.vy : -0.05 - Math.random() * 0.2,
      size: 0.6 + Math.random() * 1.5,
      life: 0,
      maxLife: life,
      twinkle: Math.random() * Math.PI * 2,
      vtwinkle: 0.05 + Math.random() * 0.11,
      warm: Math.random() < 0.72,
      drag: 0.99
    };
  }

  function seedAmbient() {
    const L = level();
    while (petals.length < L.ambientPetals) {
      const p = makePetal({ y: Math.random() * ch });
      p.alpha = p.target;
      petals.push(p);
    }
    while (dust.length < L.ambientDust) dust.push(makeDust());
  }

  /* the burst that rides along with a turning page */
  let burstJobs = [];
  function burst(dir, intensity) {
    if (!level().mult || !intensity) return;
    const strength = intensity * level().mult;
    const r = bookRect();
    burstJobs.push({
      t: 0,
      dur: FLIP_MS,
      dir: dir,
      strength: strength,
      rect: r,
      petalsLeft: Math.round(8 * strength),
      dustLeft: Math.round(64 * strength)
    });
    // an immediate puff at the spine so the turn feels like it *starts* something
    const spineX = r.x + r.w / 2;
    for (let i = 0; i < Math.round(10 * strength); i++) {
      dust.push(makeDust({
        x: spineX + (Math.random() - 0.5) * 40,
        y: r.y + Math.random() * r.h,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.6) * 1.2
      }));
    }
  }

  function runBursts(dt) {
    for (let i = burstJobs.length - 1; i >= 0; i--) {
      const j = burstJobs[i];
      j.t += dt;
      const prog = Math.min(1, j.t / j.dur);
      // the free edge of the page sweeps from one side to the other
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * prog);
      const spine = j.rect.x + j.rect.w / 2;
      const halfW = j.rect.w / 2;
      // cos() traces the free edge from the outer side, through the spine, to the other side
      const useX = spine + j.dir * halfW * Math.cos(Math.PI * eased);

      const wantDust = Math.round(j.dustLeft * (dt / j.dur) * 2.4);
      for (let k = 0; k < wantDust && j.dustLeft > 0; k++) {
        j.dustLeft--;
        dust.push(makeDust({
          x: useX + (Math.random() - 0.5) * 26,
          y: j.rect.y + Math.random() * j.rect.h,
          vx: (Math.random() - 0.5) * 1.1 + j.dir * -0.35,
          vy: (Math.random() - 0.55) * 1.0
        }));
      }
      const wantPetals = Math.round(j.petalsLeft * (dt / j.dur) * 2.2);
      for (let k = 0; k < wantPetals && j.petalsLeft > 0; k++) {
        j.petalsLeft--;
        const p = makePetal({
          x: useX + (Math.random() - 0.5) * 60,
          y: j.rect.y + Math.random() * j.rect.h * 0.9,
          vx: (Math.random() - 0.5) * 1.7,
          vy: -0.5 + Math.random() * 1.5
        });
        p.alpha = 0;
        petals.push(p);
      }
      if (prog >= 1) burstJobs.splice(i, 1);
    }
  }

  /* Particles read as magic against the dark room but as clutter on top of the
     writing, so everything inside the book's footprint is quietened. */
  let box = null, boxAge = 99;
  function overBook(x, y) {
    return box && x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
  }

  function drawPetal(p) {
    const s = p.size;
    const squash = Math.abs(Math.cos(p.spin)) * 0.75 + 0.25;   // fake 3-D tumble
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, squash);
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, p.tint[0]);
    g.addColorStop(1, p.tint[1]);
    const dim = overBook(p.x, p.y) ? 0.6 : 1;
    ctx.fillStyle = g;
    ctx.globalAlpha = p.alpha * dim;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.92, -s * 0.55, s * 0.72, s * 0.62, 0, s);
    ctx.bezierCurveTo(-s * 0.72, s * 0.62, -s * 0.92, -s * 0.55, 0, -s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = p.alpha * dim * 0.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawDust(d) {
    const t = d.life / d.maxLife;
    const fade = t < 0.14 ? t / 0.14 : (1 - t) / 0.86;
    const a = Math.max(0, Math.min(1, fade)) * (0.42 + 0.4 * Math.sin(d.twinkle))
              * (overBook(d.x, d.y) ? 0.62 : 1);
    if (a <= 0.01) return;
    const r = d.size * (1.5 + 0.45 * Math.sin(d.twinkle));
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 3.0);
    if (d.warm) {
      g.addColorStop(0, 'rgba(255,246,214,' + a + ')');
      g.addColorStop(0.32, 'rgba(255,214,132,' + a * 0.55 + ')');
      g.addColorStop(1, 'rgba(255,190,90,0)');
    } else {
      g.addColorStop(0, 'rgba(240,248,255,' + a + ')');
      g.addColorStop(0.32, 'rgba(196,220,255,' + a * 0.5 + ')');
      g.addColorStop(1, 'rgba(160,200,255,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, r * 3.0, 0, Math.PI * 2);
    ctx.fill();
  }

  let last = 0, running = true;
  const MAX_PETALS = 52, MAX_DUST = 280;

  function frame(now) {
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 60) dt = 60;                      // never let a stall throw the sim
    const f = dt / 16.667;

    ctx.clearRect(0, 0, cw, ch);

    if (++boxAge > 5) { box = visibleRect(); boxAge = 0; }   // cheap, and it moves rarely

    if (level().mult > 0) {
      seedAmbient();
      runBursts(dt);
    }

    // ---- petals ----
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.life += dt;
      p.phase += 0.012 * f;
      p.vx *= Math.pow(p.drag, f);
      p.vy = p.vy * Math.pow(p.drag, f) + 0.006 * f;     // gentle gravity
      p.x += (p.vx + Math.sin(p.phase) * 0.28 * p.sway) * f;
      p.y += p.vy * f;
      p.rot += p.vrot * f;
      p.spin += p.vspin * f;
      p.alpha += (p.target - p.alpha) * 0.045 * f;
      if (p.y > ch + 60 || p.x < -80 || p.x > cw + 80) {
        petals.splice(i, 1);
        continue;
      }
      drawPetal(p);
    }
    while (petals.length > MAX_PETALS) petals.shift();

    // ---- stardust (additive) ----
    ctx.globalCompositeOperation = 'lighter';
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life += dt;
      d.twinkle += d.vtwinkle * f;
      d.vx *= Math.pow(d.drag, f);
      d.vy *= Math.pow(d.drag, f);
      d.x += d.vx * f;
      d.y += d.vy * f;
      if (d.life >= d.maxLife || d.x < -40 || d.x > cw + 40 || d.y < -40 || d.y > ch + 40) {
        dust.splice(i, 1);
        continue;
      }
      drawDust(d);
    }
    ctx.globalCompositeOperation = 'source-over';
    while (dust.length > MAX_DUST) dust.shift();

    if (running) requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  });

  fxToggle.addEventListener('click', () => {
    levelIdx = (levelIdx + 1) % LEVELS.length;
    fxToggle.textContent = '✦ Magic: ' + level().name;
    if (levelIdx === 2) { petals.length = 0; dust.length = 0; burstJobs.length = 0; }
  });

  /* ----------------------------------------------------------------
     6. Page-turn sound (off until asked for)
     ---------------------------------------------------------------- */

  let audio = null, soundOn = false;
  sndToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    sndToggle.textContent = '♪ Sound: ' + (soundOn ? 'On' : 'Off');
    if (soundOn && !audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    if (soundOn && audio && audio.state === 'suspended') audio.resume();
    if (soundOn) playTurn();
  });

  function playTurn() {
    if (!soundOn || !audio) return;
    const dur = 0.42;
    const rate = audio.sampleRate;
    const buf = audio.createBuffer(1, Math.floor(rate * dur), rate);
    const ch0 = buf.getChannelData(0);
    for (let i = 0; i < ch0.length; i++) {
      const t = i / ch0.length;
      ch0[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.1) * (0.35 + 0.65 * Math.sin(Math.PI * t));
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const flt = audio.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(900, audio.currentTime);
    flt.frequency.exponentialRampToValueAtTime(2600, audio.currentTime + dur);
    flt.Q.value = 0.8;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.16, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    src.connect(flt).connect(gain).connect(audio.destination);
    src.start();
  }

  /* ----------------------------------------------------------------
     7. Go
     ---------------------------------------------------------------- */

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });

  layout();
  setZ();
  updateChrome();
  requestAnimationFrame(frame);

  // a first breath of stardust so the cover never looks static on arrival
  setTimeout(() => burst(1, 1.4), 700);

  window.__journal = { goToPage, state, defs };   // handy for testing
})();
