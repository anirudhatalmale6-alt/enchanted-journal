/* ==================================================================
   The Journey to Me — 21 Day Self-Transformation Journal
   Page turning, writing, saving, petals and stardust.
   No frameworks, no libraries.
   ================================================================== */

(function () {
  'use strict';

  const STORE_KEY = 'journey-to-me:v1';
  const REDUCED   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLIP_MS   = REDUCED ? 60 : 1050;

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

  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ----------------------------------------------------------------
     1. Lay the book out, page by page
     ---------------------------------------------------------------- */

  const defs = [];
  defs.push({ kind: 'cover' });
  defs.push({ kind: 'belongs' });
  defs.push({ kind: 'welcome' });
  defs.push({ kind: 'contents' });

  JOURNAL.days.forEach(d => {
    defs.push({ kind: 'prompt', day: d });
    defs.push({ kind: 'write', day: d, part: 1 });
    defs.push({ kind: 'write', day: d, part: 2 });
  });

  // The closing letter should face the reader on a right-hand page, with the
  // back board behind it, so pad in front of it rather than after.
  if (defs.length % 2 !== 0) defs.push({ kind: 'blank' });
  const closingIndex = defs.length;
  defs.push({ kind: 'closing' });
  defs.push({ kind: 'backboard' });

  const LEAVES = defs.length / 2;
  const leafEls = [];
  const pageOfDay = {};
  defs.forEach((d, i) => { if (d.kind === 'prompt') pageOfDay[d.day.n] = i; });

  /* ---- page bodies ---- */

  const paras = arr => arr.map(t => '<p>' + esc(t) + '</p>').join('');

  function promptHTML(d) {
    const day = d.day;
    // FLOWER_BOX records where the flower sat on the client's printed page, as
    // fractions of that page, so the web version reproduces their layout
    // rather than my guess at a margin — and nothing gets cropped.
    const b = (typeof FLOWER_BOX !== 'undefined' && FLOWER_BOX[day.n]) ||
              { l: 0.02, t: 0.02, w: 0.22, h: 0.96 };
    const box = 'left:' + (b.l * 100).toFixed(3) + '%;top:' + (b.t * 100).toFixed(3) +
                '%;width:' + (b.w * 100).toFixed(3) + '%;height:' + (b.h * 100).toFixed(3) + '%';
    const textLeft = ((b.l + b.w) * 100 + 3).toFixed(2);
    return '<div class="page-inner prompt" style="--text-left:' + textLeft + '%">' +
      '<img class="day-flower" style="' + box + '"' +
        ' src="assets/flowers/day' + String(day.n).padStart(2, '0') + '.webp"' +
        ' alt="" loading="lazy" decoding="async">' +
      '<div class="prompt-body">' +
        '<div class="day-no">Day ' + day.n + '</div>' +
        '<h2 class="day-title">' + esc(day.title) + '</h2>' +
        paras(day.body) +
        (day.bullets ? '<ul class="day-bullets">' +
            day.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') +
        (day.note ? '<p class="day-note">' + esc(day.note) + '</p>' : '') +
        '<p class="day-cue">' + esc(JOURNAL.strings.answerHere) + '</p>' +
      '</div></div>';
  }

  function writeHTML(d, index) {
    const day = d.day;
    return '<div class="page-inner write">' +
      '<div class="write-head">' + esc(day.title) +
        (d.part === 2 ? ' <span class="cont">' + esc(JOURNAL.strings.continued) + '</span>' : '') +
      '</div>' +
      '<div class="entry" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"' +
        ' aria-label="Day ' + day.n + ' — your writing"' +
        ' data-store="d' + day.n + 'p' + d.part + '"' +
        ' data-prompt="' + esc(JOURNAL.strings.writeHere) + '"></div>' +
      '<div class="page-num">Day ' + day.n + '</div>' +
    '</div>';
  }

  function faceHTML(def, index, side) {
    const cls = 'face ' + side;
    const chrome = '<div class="gutter-shade"></div><div class="turn-shade"></div><div class="corner-cue"></div>';
    const frame  = '<div class="page-frame"></div>';
    const framed = cls + ' framed';

    switch (def.kind) {

      // The client's own cover artwork, straightened and cut out of their PDF —
      // no CSS approximation comes close to that embossed gold lettering.
      case 'cover':
        return '<div class="' + cls + ' cover">' + chrome +
          '<div class="cover-inner">' +
            '<h1 class="sr-only">' + esc(JOURNAL.cover.title) + ' — ' + esc(JOURNAL.cover.subtitle) + '</h1>' +
          '</div></div>';

      case 'belongs':
        return '<div class="' + framed + '">' + chrome + frame +
          '<div class="page-inner centred">' +
            '<h2 class="plate-title">' + esc(JOURNAL.belongs.heading) + '</h2>' +
            '<div class="plate-orn">❦</div>' +
            '<div class="plate-line"><span class="name-field" contenteditable="true"' +
              ' data-store="owner" data-prompt="your name"></span></div>' +
          '</div></div>';

      case 'welcome':
        return '<div class="' + framed + '">' + chrome + frame +
          '<div class="page-inner">' +
            '<h2 class="script-title small">' + esc(JOURNAL.welcome.title) + '<br>' +
              esc(JOURNAL.welcome.title2) + '</h2>' +
            '<div class="scroller">' + paras(JOURNAL.welcome.body) + '</div>' +
          '</div></div>';

      case 'contents':
        return '<div class="' + framed + '">' + chrome + frame +
          '<div class="page-inner">' +
            '<h2 class="script-title">' + esc(JOURNAL.contents.title) + '</h2>' +
            '<ol class="toc scroller">' +
              JOURNAL.days.map(d =>
                '<li><button type="button" class="toc-link" data-goto="' + pageOfDay[d.n] + '">' +
                  '<em>Day ' + d.n + ':</em> ' + esc(d.title) + '</button></li>').join('') +
            '</ol>' +
          '</div></div>';

      case 'prompt':
        return '<div class="' + cls + '">' + chrome + promptHTML(def) + '</div>';

      case 'write':
        return '<div class="' + cls + '">' + chrome + writeHTML(def, index) + '</div>';

      case 'closing':
        return '<div class="' + framed + '">' + chrome + frame +
          '<div class="page-inner">' +
            '<h2 class="script-title">' + esc(JOURNAL.closing.title) + '</h2>' +
            '<div class="scroller">' + paras(JOURNAL.closing.body) + '</div>' +
            '<div class="finale-actions">' +
              '<button class="ink-btn" type="button" data-act="cover">Return to the cover</button>' +
              '<button class="ink-btn" type="button" data-act="prev">Back a page</button>' +
            '</div>' +
          '</div></div>';

      case 'backboard':
        return '<div class="' + cls + ' board">' + chrome + '<div class="page-inner"></div></div>';

      default:
        return '<div class="' + cls + '">' + chrome + '<div class="page-inner"></div></div>';
    }
  }

  for (let i = 0; i < LEAVES; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    leaf.dataset.leaf = i;
    leaf.innerHTML = faceHTML(defs[i * 2], i * 2, 'front') +
                     faceHTML(defs[i * 2 + 1], i * 2 + 1, 'back');
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
    saveTimer = setTimeout(commitSave, 550);
  }
  function commitSave() {
    const data = {};
    editables.forEach(el => {
      const v = el.innerHTML.trim();
      if (v) data[el.dataset.store] = v;
    });
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
  book.addEventListener('paste', e => {
    if (!e.target.hasAttribute('data-store')) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); commitSave(); }
  });

  /* ----------------------------------------------------------------
     3. Fit the book to the screen
     ---------------------------------------------------------------- */

  const RATIO = 1.337;   // the rectified cover crop, so nothing is stretched
  let single = false;

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    single = w < 900;
    document.body.classList.toggle('single', single);

    // lift the book off the bottom of the screen so the table it stands on is
    // actually visible behind it
    const lift = Math.round(Math.min(96, h * (single ? 0.06 : 0.11)));
    document.documentElement.style.setProperty('--lift', lift + 'px');

    const availW = w - (single ? 24 : 96);
    const availH = h - (single ? 176 : 196) - lift;

    let pw = single ? availW : availW / 2;
    let ph = pw * RATIO;
    if (ph > availH) { ph = availH; pw = ph / RATIO; }

    pw = Math.max(190, Math.min(pw, single ? 470 : 520));
    ph = pw * RATIO;

    document.documentElement.style.setProperty('--pw', pw.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--ph', ph.toFixed(1) + 'px');
    pan(false);
    sizeCanvas();
  }

  /* ----------------------------------------------------------------
     4. Navigation
     ---------------------------------------------------------------- */

  const state = { page: 0 };
  const bookShadow = document.getElementById('bookShadow');
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

    // the shadow on the table slides with the book
    document.documentElement.style.setProperty('--pan', x.toFixed(1) + 'px');
    if (bookShadow) {
      if (!animate) {
        bookShadow.style.transition = 'none';
        void bookShadow.offsetWidth;
        bookShadow.style.transition = '';
      }
      bookShadow.classList.toggle('narrow', single || sp === 0 || sp === LEAVES);
    }
    updateStatics(sp, animate);
  }

  /* The block of paper under the leaves must not show on a side the book has
     not opened onto yet, or a closed cover sits beside a mysterious blank
     page. Hide it at once; bring it back only once the turning leaf is past
     upright and already covering that half. */
  const statLeft  = book.querySelector('.static-left');
  const statRight = book.querySelector('.static-right');
  let statTimers = [];
  function updateStatics(sp, animate) {
    statTimers.forEach(clearTimeout);
    statTimers = [];
    const delay = animate ? FLIP_MS * 0.6 : 0;
    const set = (el, wanted) => {
      if (!wanted) { el.classList.add('hidden'); return; }
      if (!el.classList.contains('hidden')) return;
      statTimers.push(setTimeout(() => el.classList.remove('hidden'), delay));
    };
    set(statLeft, sp > 0);
    set(statRight, sp < LEAVES);
  }

  /* 70 pages is a lot of paper to keep painted. Every leaf more than a couple
     away from the current spread is completely occluded by the ones in front
     of it, so hide those outright — the stacked page edges drawn on the static
     pages are what the reader actually sees of the depth. This roughly triples
     the frame rate of a turn on a phone. */
  const WINDOW = 3;

  function setZ(flipping) {
    const sp = spreadOf(state.page);
    const lo = Math.min(sp, ...(flipping || [sp])) - WINDOW;
    const hi = Math.max(sp, ...(flipping || [sp])) + WINDOW;
    leafEls.forEach((el, i) => {
      el.style.zIndex = (i < sp) ? String(i + 1) : String(LEAVES - i);
      const near = i >= lo && i <= hi;
      if (near === el.classList.contains('far')) el.classList.toggle('far', !near);
    });
    (flipping || []).forEach(i => { leafEls[i].style.zIndex = String(LEAVES + 6); });
  }

  let turnCount = 0;

  function goToPage(target) {
    target = Math.max(0, Math.min(defs.length - 1, target));
    if (target === state.page) return;

    const fromSpread = spreadOf(state.page);
    state.page = target;
    const toSpread = spreadOf(target);

    const moving = [];
    if (toSpread > fromSpread) for (let i = fromSpread; i < toSpread; i++) moving.push(i);
    if (toSpread < fromSpread) for (let i = fromSpread - 1; i >= toSpread; i--) moving.push(i);

    setZ(moving);

    // a long jump would otherwise riffle two dozen leaves; turn a few, snap the rest
    const SHOW = 4;
    const animated = moving.length <= SHOW ? moving : moving.slice(0, 2).concat(moving.slice(-2));
    const snap = moving.filter(i => animated.indexOf(i) === -1);

    snap.forEach(idx => leafEls[idx].classList.toggle('turned', idx < toSpread));

    animated.forEach((idx, n) => {
      const el = leafEls[idx];
      setTimeout(() => {
        el.classList.add('turning');
        el.classList.toggle('turned', idx < toSpread);
        setTimeout(() => { el.classList.remove('turning'); setZ(); }, FLIP_MS + 40);
      }, Math.min(n * 95, 400));
    });

    if (moving.length) {
      const key = target === 0 || target === closingIndex || target === defs.length - 1;
      burst(toSpread > fromSpread ? 1 : -1, key ? 2.3 : (turnCount % 4 === 3 ? 1.55 : 1));
      turnCount++;
      playTurn();
    } else {
      burst(target > state.page ? 1 : -1, 0.45);
      setZ();
    }

    pan(true);
    updateChrome();
    hideHint();
  }

  const next = () => goToPage(single ? state.page + 1 : 2 * (spreadOf(state.page) + 1));
  const prev = () => goToPage(single ? state.page - 1 : 2 * (spreadOf(state.page) - 1));

  function labelFor(p) {
    const d = defs[p];
    if (!d) return '';
    switch (d.kind) {
      case 'cover':     return 'Cover';
      case 'belongs':   return 'This Book Belongs to';
      case 'welcome':   return 'Welcome';
      case 'contents':  return 'Contents';
      case 'closing':   return 'A Personal Message';
      case 'backboard': return 'Back cover';
      case 'prompt':    return 'Day ' + d.day.n;
      case 'write':     return 'Day ' + d.day.n + (d.part === 2 ? ' · more' : ' · write');
      default:          return '';
    }
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

    const visDays = new Set();
    vis.forEach(p => { const d = defs[p]; if (d && d.day) visDays.add(d.day.n); });

    tabsEl.querySelectorAll('.tab').forEach(t => {
      const pg = parseInt(t.dataset.page, 10);
      const dn = t.dataset.day ? parseInt(t.dataset.day, 10) : null;
      t.classList.toggle('active', vis.indexOf(pg) !== -1 || (dn !== null && visDays.has(dn)));
    });
    const active = tabsEl.querySelector('.tab.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function buildTabs() {
    const items = [{ label: '❦', page: 0, cls: 'tab-cover', title: 'Cover', day: null }];
    JOURNAL.days.forEach(d =>
      items.push({ label: String(d.n), page: pageOfDay[d.n], cls: '', title: 'Day ' + d.n + ': ' + d.title, day: d.n }));
    items.push({ label: '✦', page: closingIndex, cls: 'tab-end', title: 'A Personal Message to You', day: null });

    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab ' + it.cls;
      b.textContent = it.label;
      b.title = it.title;
      b.dataset.page = it.page;
      if (it.day !== null) b.dataset.day = it.day;
      b.addEventListener('click', () => goToPage(it.page));
      tabsEl.appendChild(b);
    });
  }
  buildTabs();

  book.addEventListener('click', e => {
    if (e.target.closest('[data-store]')) return;

    const toc = e.target.closest('[data-goto]');
    if (toc) { goToPage(parseInt(toc.dataset.goto, 10)); return; }

    const act = e.target.closest('[data-act]');
    if (act) { act.dataset.act === 'cover' ? goToPage(0) : prev(); return; }

    if (e.target.closest('.scroller')) return;   // reading, not turning

    const face = e.target.closest('.face');
    if (!face) return;

    if (single) {
      const r = face.getBoundingClientRect();
      ((e.clientX - r.left) / r.width < 0.3) ? prev() : next();
    } else {
      face.classList.contains('back') ? prev() : next();
    }
  });

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  document.addEventListener('keydown', e => {
    if (e.target.hasAttribute && e.target.hasAttribute('data-store')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); prev(); }
    if (e.key === 'Home') { e.preventDefault(); goToPage(0); }
    if (e.key === 'End')  { e.preventDefault(); goToPage(closingIndex); }
  });

  let tx = 0, ty = 0, tActive = false;
  stage.addEventListener('touchstart', e => {
    if (e.target.closest('[data-store]') || e.target.closest('.scroller')) return;
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
  setTimeout(hideHint, 10000);

  /* ----------------------------------------------------------------
     5. Petals and stardust
     ---------------------------------------------------------------- */

  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;

  const petals = [];
  const dust = [];
  const LEVELS = [
    { name: 'On',   ambientPetals: 11, ambientDust: 52, mult: 1 },
    { name: 'Soft', ambientPetals: 5,  ambientDust: 20, mult: 0.4 },
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

  // Real rose-petal sprites, shaded once and then tumbled at runtime. Drawing
  // them as canvas gradients never looked like more than coloured ovals.
  const PETAL_SRC = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const petalImgs = [];
  let petalsReady = 0;
  PETAL_SRC.forEach((n, i) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { petalsReady++; };
    img.src = 'assets/petals/' + n + '.webp';
    petalImgs[i] = img;
  });

  function bookRect() {
    const r = book.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

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
    // sized off the stage so a petal looks the same on a phone as on a laptop
    const unit = Math.max(34, Math.min(ch * 0.10, 96));
    return {
      x: o.x !== undefined ? o.x : Math.random() * cw,
      y: o.y !== undefined ? o.y : -70 - Math.random() * 160,
      vx: o.vx !== undefined ? o.vx : (Math.random() - 0.4) * 0.4,
      vy: o.vy !== undefined ? o.vy : 0.32 + Math.random() * 0.55,
      h: unit * (0.46 + Math.random() * 0.62),
      img: (Math.random() * PETAL_SRC.length) | 0,
      flip: Math.random() < 0.5 ? -1 : 1,
      rot: (Math.random() - 0.5) * 1.6,
      vrot: (Math.random() - 0.5) * 0.028,
      spin: Math.random() * Math.PI * 2,
      vspin: 0.010 + Math.random() * 0.026,
      sway: 0.5 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      alpha: 0,
      target: 0.72 + Math.random() * 0.28,
      drag: 0.986
    };
  }

  function makeDust(o) {
    o = o || {};
    const x = o.x !== undefined ? o.x : Math.random() * cw;
    const y = o.y !== undefined ? o.y : Math.random() * ch;
    return {
      x: x, y: y, px: x, py: y,
      vx: o.vx !== undefined ? o.vx : (Math.random() - 0.5) * 0.25,
      vy: o.vy !== undefined ? o.vy : -0.05 - Math.random() * 0.2,
      size: 0.7 + Math.random() * 1.9,
      flare: Math.random() < 0.28,          // a few get the four-point star
      life: 0,
      maxLife: 900 + Math.random() * 1700,
      twinkle: Math.random() * Math.PI * 2,
      vtwinkle: 0.05 + Math.random() * 0.12,
      warm: Math.random() < 0.82,           // mostly gold, like the reference
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

  let burstJobs = [];
  function burst(dir, intensity) {
    if (!level().mult || !intensity) return;
    const strength = intensity * level().mult;
    const r = bookRect();
    burstJobs.push({
      t: 0, dur: FLIP_MS, dir: dir, rect: r,
      petalsLeft: Math.round(9 * strength),
      dustLeft: Math.round(90 * strength)
    });
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
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * prog);
      const spine = j.rect.x + j.rect.w / 2;
      // cos() traces the free edge from the outer side, through the spine, over
      const useX = spine + j.dir * (j.rect.w / 2) * Math.cos(Math.PI * eased);

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

  /* Particles read as magic against the dark, as clutter over the writing, so
     anything inside the book's footprint is quietened. */
  let box = null, boxAge = 99;
  const overBook = (x, y) =>
    box && x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;

  function drawPetal(p) {
    const img = petalImgs[p.img];
    if (!img || !img.complete || !img.naturalWidth) return;
    // |cos| of the spin fakes the petal turning edge-on as it falls
    const face = Math.abs(Math.cos(p.spin));
    const w = p.h * (img.naturalWidth / img.naturalHeight) * (0.18 + 0.82 * face);
    const dim = overBook(p.x, p.y) ? 0.30 : 1;   // never fight the writing
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha * dim;
    ctx.drawImage(img, -w / 2 * p.flip, -p.h / 2, w * p.flip, p.h);
    ctx.restore();
  }

  function drawDust(d) {
    const t = d.life / d.maxLife;
    const fade = t < 0.14 ? t / 0.14 : (1 - t) / 0.86;
    const a = Math.max(0, Math.min(1, fade)) * (0.42 + 0.4 * Math.sin(d.twinkle))
              * (overBook(d.x, d.y) ? 0.5 : 1);
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

    // the fast ones, thrown out by a turning page, leave a light trail
    const dx = d.x - d.px, dy = d.y - d.py;
    const sp = Math.hypot(dx, dy);
    if (sp > 1.2) {
      const tg = ctx.createLinearGradient(d.px, d.py, d.x, d.y);
      const c = d.warm ? '255,214,140' : '206,226,255';
      tg.addColorStop(0, 'rgba(' + c + ',0)');
      tg.addColorStop(1, 'rgba(' + c + ',' + (a * 0.55).toFixed(3) + ')');
      ctx.strokeStyle = tg;
      ctx.lineWidth = Math.min(r * 0.9, 2.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(d.px - dx * 3, d.py - dy * 3);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    if (d.flare && a > 0.25) {
      const L = r * 7.5;
      const c = d.warm ? '255,226,158' : '214,232,255';
      ctx.strokeStyle = 'rgba(' + c + ',' + (a * 0.5).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.7, r * 0.28);
      ctx.beginPath();
      ctx.moveTo(d.x - L, d.y); ctx.lineTo(d.x + L, d.y);
      ctx.moveTo(d.x, d.y - L); ctx.lineTo(d.x, d.y + L);
      ctx.stroke();
    }
  }

  let last = 0, running = true;
  const MAX_PETALS = 46, MAX_DUST = 340;

  function frame(now) {
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 60) dt = 60;
    const f = dt / 16.667;

    ctx.clearRect(0, 0, cw, ch);
    if (++boxAge > 5) { box = visibleRect(); boxAge = 0; }

    if (level().mult > 0) { seedAmbient(); runBursts(dt); }

    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.phase += 0.012 * f;
      p.vx *= Math.pow(p.drag, f);
      p.vy = p.vy * Math.pow(p.drag, f) + 0.006 * f;
      p.x += (p.vx + Math.sin(p.phase) * 0.28 * p.sway) * f;
      p.y += p.vy * f;
      p.rot += p.vrot * f;
      p.spin += p.vspin * f;
      p.alpha += (p.target - p.alpha) * 0.045 * f;
      if (p.y > ch + 60 || p.x < -80 || p.x > cw + 80) { petals.splice(i, 1); continue; }
      drawPetal(p);
    }
    while (petals.length > MAX_PETALS) petals.shift();

    ctx.globalCompositeOperation = 'lighter';
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life += dt;
      d.px = d.x; d.py = d.y;
      d.twinkle += d.vtwinkle * f;
      d.vx *= Math.pow(d.drag, f);
      d.vy *= Math.pow(d.drag, f);
      d.x += d.vx * f;
      d.y += d.vy * f;
      if (d.life >= d.maxLife || d.x < -40 || d.x > cw + 40 || d.y < -40 || d.y > ch + 40) {
        dust.splice(i, 1); continue;
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
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
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
     7. Keeping it on the device
     ---------------------------------------------------------------- */

  const installBtn   = document.getElementById('installBtn');
  const installSheet = document.getElementById('installSheet');
  const installBody  = document.getElementById('installBody');
  let deferredPrompt = null;

  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  if (!standalone) {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (iOS) installBtn.hidden = false;
  }

  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.hidden = true;
      return;
    }
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    installBody.textContent = iOS
      ? 'Tap the Share button at the bottom of Safari, scroll down and choose “Add to Home Screen”. The journal then opens full screen, straight from your home screen, and works without any internet.'
      : 'In your browser menu choose “Install” or “Add to Home Screen”. The journal then opens in its own window and works without any internet.';
    installSheet.hidden = false;
  });
  document.getElementById('installClose').addEventListener('click', () => { installSheet.hidden = true; });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ----------------------------------------------------------------
     8. Go
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
  setTimeout(() => burst(1, 1.4), 700);

  window.__journal = { goToPage, state, defs, LEAVES };
})();
