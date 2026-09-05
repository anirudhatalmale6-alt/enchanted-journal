/* ------------------------------------------------------------------
   The Journey to Me — the 3D scene.

   A real three-dimensional space: a walnut table, a candle burning at
   the back of it, and the journal lying open in the light.  Nothing here
   is a picture of a book — the covers, the page block and every leaf you
   turn are geometry, and the candle is a light source, so the shadow
   under the book and the shine along the gold are worked out fresh every
   frame from wherever the flame happens to be.

   The page turn is the part worth reading.  A page is not a card that
   flips: it is a strip that bends.  `shapeLeaf` walks along the page from
   the spine to the outer edge, curving a little more with every step,
   and drops each vertex wherever that walk lands it.
------------------------------------------------------------------- */

import * as THREE from 'three';
import { OrbitControls } from './lib/controls/OrbitControls.js';
import { EffectComposer } from './lib/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/postprocessing/OutputPass.js';
import { buildPages, paintPage, isWritable, dayPage, PAGE_W, PAGE_H } from './pages.js';

/* ------------------------------------------------------------ the book */

const PW = 0.206;                 // page width, metres
const PH = PW * 1.370;            // the straight-on cover's ratio
const OVER = 0.007;               // how far the boards overhang the pages
const CW = PW + OVER, CH = PH + OVER * 2;
const COVER_T = 0.005;            // board thickness
const BLOCK_T = 0.030;            // the whole page block

const PAGES = buildPages();
const NLEAF = (PAGES.length - 1) / 2;
const LEAF_T = BLOCK_T / NLEAF;

const SPINE_Y = COVER_T + BLOCK_T / 2;      // the hinge line, mid-height
const COVER_OFF = (COVER_T + BLOCK_T) / 2;  // board's offset from that hinge

const STORE = 'journey-to-me-3d';

// One real candle, roughly a candela, thirty centimetres from the book.  Every
// other light in the scene is a fraction of it.
const CANDLE = 1.9;

/* --------------------------------------------------------------- state */

const state = {
  coverOpen: 0,          // 0 closed, 1 open
  leaf: 0,               // leaves already turned
  turn: null,            // {from, to, t, dir, leaf}
  entries: JSON.parse(localStorage.getItem(STORE) || '{}'),
  focus: null,
  caretOn: true,
  ready: false
};

/* ------------------------------------------------------------ renderer */

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.10;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0406);
scene.fog = new THREE.FogExp2(0x0d0507, 1.35);

const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 12);
// 0.96 rad off vertical — inside the downward-only limit set below
camera.position.set(0.020, 0.370, 0.508);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.030, 0.000);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 0.28;
controls.maxDistance = 1.10;
/* The client asked to look at the book only from above: no glimpse of its
   underside and no swinging up into the room behind it.

   The number that decides that is the TOP of the frame, not the camera. With a
   34 degree field of view the top edge sits 17 degrees above the view axis, so
   at the old limit of 1.36 rad — 12.4 degrees of elevation — the top of the
   frame was 4.6 degrees ABOVE the horizon and the far wall came into shot. At
   1.02 rad the elevation is 31.5 degrees and the top edge is still 14 degrees
   below the horizon, so the frame holds nothing but book and table. */
controls.minPolarAngle = 0.22;
controls.maxPolarAngle = 1.02;
// The client does not want to look around the room, but does want to see the
// book from different angles — so the orbit is wide enough to walk round to
// either side of it, and stops there.
controls.minAzimuthAngle = -1.05;
controls.maxAzimuthAngle = 1.05;
controls.rotateSpeed = 0.55;

/* ------------------------------------------------------------ textures */

const loader = new THREE.TextureLoader();
let pending = 0;
function tex(url, srgb, repeat) {
  pending++;
  const t = loader.load(url, () => { if (--pending === 0) state.ready = true; },
    undefined, () => { if (--pending === 0) state.ready = true; });
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

const woodMap = tex('assets/wood.webp', true, 3);
const woodNrm = tex('assets/wood_n.webp', false, 3);
const woodRgh = tex('assets/wood_r.webp', false, 3);
const leatherNrm = tex('assets/leather_n.webp', false, 3);
const leatherRgh = tex('assets/leather_r.webp', false, 3);
const coverMap = tex('../assets/cover.webp', true);
const petalMaps = [1, 2, 3, 4, 5, 6].map(n => tex(`assets/petal${n}.webp`, true));
const petalNrm = tex('assets/petal_n.webp', false);

// The paper and cover bitmaps are also wanted as plain images, for painting
// pages onto 2D canvases.
const paperImg = new Image(); paperImg.src = '../assets/paper.webp';
const coverImg = new Image(); coverImg.src = '../assets/cover.webp';

/* Fine horizontal lines, so the cut edge of the page block reads as paper
   rather than as a cream-coloured brick. */
function edgeTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#e6d8bd';
  x.fillRect(0, 0, 4, 512);
  for (let i = 0; i < 512; i += 2) {
    x.fillStyle = `rgba(120,96,64,${0.10 + Math.random() * 0.20})`;
    x.fillRect(0, i, 4, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const edgeMap = edgeTexture();

/* ------------------------------------------------------- page textures */

/* Only six or seven page faces can be on screen at once, so six or seven
   canvases are kept and recycled.  Painting all ninety would cost a few
   hundred megabytes of texture memory for nothing. */
const POOL = 8;
const pool = [];
const live = new Map();        // page index -> pool slot
let clock = 0;

for (let i = 0; i < POOL; i++) {
  const c = document.createElement('canvas');
  c.width = PAGE_W; c.height = PAGE_H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  pool.push({ canvas: c, ctx: c.getContext('2d'), tex: t, idx: -1, used: -1 });
}

function paint(slot, idx) {
  paintPage(slot.ctx, PAGES[idx], {
    paperImg, coverImg,
    entries: state.entries,
    caretOn: state.caretOn,
    focus: state.focus
  });
  slot.tex.needsUpdate = true;
}

function pageTexture(idx) {
  if (idx < 0 || idx >= PAGES.length) return null;
  let slot = live.get(idx);
  if (!slot) {
    slot = pool.reduce((a, b) => (a.used <= b.used ? a : b));
    if (slot.idx >= 0) live.delete(slot.idx);
    slot.idx = idx;
    live.set(idx, slot);
    paint(slot, idx);
  }
  slot.used = ++clock;
  return slot.tex;
}

function repaint(idx) {
  const slot = live.get(idx);
  if (slot) paint(slot, idx);
}

/* ---------------------------------------------------------- the table */

const table = new THREE.Mesh(
  new THREE.BoxGeometry(2.4, 0.05, 1.5),
  new THREE.MeshStandardMaterial({
    map: woodMap, normalMap: woodNrm, roughnessMap: woodRgh,
    roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(0.32, 0.32)
  })
);
table.position.y = -0.025;
table.receiveShadow = true;
scene.add(table);

/* Something dark behind the table so the petals and the dust have a wall to
   fall against, rather than fading into the clear colour. */
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 3),
  new THREE.MeshStandardMaterial({ color: 0x2a0f14, roughness: 1, metalness: 0 })
);
backdrop.position.set(0, 0.9, -1.05);
scene.add(backdrop);

/* ------------------------------------------------------------- lights */

const warmAmbient = new THREE.AmbientLight(0x4a2218, 0.30);
scene.add(warmAmbient);

/* The flame: two crossed billboards with a soft additive gradient, so it has
   some body from every angle without needing a particle system. */
function flameTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 78, 2, 64, 70, 60);
  g.addColorStop(0.00, 'rgba(255,255,246,1)');
  g.addColorStop(0.22, 'rgba(255,224,150,0.95)');
  g.addColorStop(0.52, 'rgba(255,150,44,0.55)');
  g.addColorStop(1.00, 'rgba(120,40,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(64, 72, 30, 56, 0, 0, 7);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flameMat = new THREE.MeshBasicMaterial({
  map: flameTexture(), transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.95
});

const waxMat = new THREE.MeshStandardMaterial({
  color: 0xf2e2c4, roughness: 0.5, metalness: 0,
  emissive: 0xa85c1c, emissiveIntensity: 0.16       // wax glows from within
});
const brassMat = new THREE.MeshStandardMaterial({
  color: 0x9a6a2a, roughness: 0.34, metalness: 0.85
});

// What the shadow-casting spot points at: the book, at the origin.
const aim = new THREE.Object3D();
aim.position.set(0, 0.02, 0);
scene.add(aim);

/* A candle has to stand taller than the book, or it lights nothing but the
   fore edge — which is exactly how the first pass of this scene went wrong. */
function makeCandle(h, r, power, shadows) {
  const g = new THREE.Group();

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.1, r * 2.4, 0.006, 30), brassMat);
  dish.position.y = 0.003;
  dish.castShadow = false;
  dish.receiveShadow = true;
  g.add(dish);

  const wax = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 28), waxMat);
  wax.position.y = 0.006 + h / 2;
  wax.castShadow = false;
  wax.receiveShadow = true;
  g.add(wax);

  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0011, 0.0011, 0.009, 6),
    new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 1 })
  );
  wick.position.y = 0.006 + h + 0.003;
  g.add(wick);

  const flame = new THREE.Group();
  flame.position.y = 0.006 + h + 0.019;
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.019, 0.033), flameMat);
    m.rotation.y = i * Math.PI / 2;
    flame.add(m);
  }
  g.add(flame);

  const light = new THREE.PointLight(0xffb474, power * (shadows ? 0.45 : 1), 4, 2);
  light.position.y = flame.position.y;
  g.add(light);

  scene.add(g);
  const c = { group: g, flame, light, power, spot: null };

  /* Shadows come from a spot, not from the point light.

     A shadow-casting point light renders a cube map, and the seam between two
     of its faces fell straight down the open page as a hard vertical line —
     half the spread a stop darker than the other half, with a crisp edge.  A
     spot has one map and no seams, and aimed from the flame it throws the
     same shadow. */
  if (shadows) {
    const spot = new THREE.SpotLight(0xffb474, power * 0.80, 4, 1.20, 0.62, 2);
    spot.position.copy(light.position);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0009;
    spot.shadow.normalBias = 0.0035;
    spot.shadow.camera.near = 0.02;
    spot.shadow.camera.far = 2.0;
    spot.shadow.focus = 1;
    g.add(spot);
    spot.target = aim;
    c.spot = spot;
  }
  return c;
}

// The tall one at the back right does the work, and casts the shadow.
const candle = makeCandle(0.205, 0.0135, CANDLE, true);
candle.group.position.set(0.395, 0, -0.315);

// A shorter one back left, so the far edge of the book is not a silhouette.
const candle2 = makeCandle(0.140, 0.0125, CANDLE * 0.46, false);
candle2.group.position.set(-0.375, 0, -0.335);

const candles = [candle, candle2];

// Warmth from off-frame, low and to the front — a hearth, or the rest of the
// room.  It only exists to stop the near edge going to pure black.
const hearth = new THREE.PointLight(0xff7a34, 0.30, 2.6, 2);
hearth.position.set(-0.44, 0.17, 0.52);
scene.add(hearth);

// A rose-coloured rim from behind the book — the only light here that is not
// candle-orange, and the reason a falling petal reads against the dark.
const rim = new THREE.PointLight(0xff3d78, 0.58, 1.9, 2);
rim.position.set(-0.06, 0.30, -0.52);
scene.add(rim);

// A whisper from the front, so the cut edge of the page block is paper rather
// than a black slot.
const front = new THREE.PointLight(0xffc190, 0.075, 1.6, 2);
front.position.set(0.02, 0.115, 0.42);
scene.add(front);

// And a low bounce off the table itself, keeping the undersides alive.
const bounce = new THREE.PointLight(0xff8a3c, 0.028, 1.3, 2);
bounce.position.set(0.04, 0.015, 0.14);
scene.add(bounce);

/* ------------------------------------------------- the daylight sky rig

   The client asked for a light blue sky with clouds on the storybook version,
   then chose this one.  Rather than guess which she wants here, the scene is
   built twice and switched: the candlelit table above, and below a daytime sky
   with the book resting on a sea of cloud.

   Everything is generated, not photographed — the same sky and cloud plates the
   storybook version uses.  A photographed sky brings its own sun with it, and
   the moment the book's shadow disagrees with that sun the whole thing reads as
   a cut-out. */

const dayRig = new THREE.Group();
dayRig.visible = false;
scene.add(dayRig);

const skyMap    = tex('../assets/sky.webp', true);
const cloudFar  = tex('../assets/clouds-far.webp', true);
const cloudNear = tex('../assets/clouds-near.webp', true);
const cloudSeaMap = tex('../assets/clouds-sea.webp', true);
cloudSeaMap.wrapS = cloudSeaMap.wrapT = THREE.RepeatWrapping;
// 14m of plane. At 11 tiles the whole visible foreground was a quarter of one
// puff, which renders as flat card; 48 puts a cloud top at roughly two thirds
// the width of the book, which is the scale that reads as a cloud sea.
cloudSeaMap.repeat.set(48, 48);
cloudFar.wrapS  = THREE.RepeatWrapping;  cloudFar.repeat.set(4, 1);
cloudNear.wrapS = cloudNear.wrapT = THREE.RepeatWrapping;
cloudNear.repeat.set(4, 1);

/* The dome. BackSide, unlit, and NOT tone mapped.
   ACES is doing the right thing to the leather and the paper, but run a flat
   sky colour through it and the blue comes back as grey — the camera only ever
   sees the pale band near the horizon, which is exactly the part ACES
   desaturates hardest. A sky is the light in the scene, not a surface lit by
   it, so it opts out. */
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(7, 40, 24),
  new THREE.MeshBasicMaterial({
    map: skyMap, side: THREE.BackSide, fog: false, toneMapped: false
  })
);
dayRig.add(skyDome);

/* A band of cloud around the horizon rather than a full sphere: the plate's
   alpha closes at its own top and bottom, so wrapped over a whole dome it would
   leave a bare ring of sky at the zenith. */
const cloudBand = new THREE.Mesh(
  new THREE.SphereGeometry(6.4, 40, 20, 0, Math.PI * 2, 0.62, 0.76),
  new THREE.MeshBasicMaterial({
    map: cloudFar, side: THREE.BackSide, transparent: true,
    depthWrite: false, fog: false, toneMapped: false, opacity: 0.95
  })
);
dayRig.add(cloudBand);

/* What the book rests on. Fog is what sells it: the plane runs out to 14m, and
   without fog its far edge is a hard horizon line across the sky. */
const seaGeom = new THREE.PlaneGeometry(14, 14, 90, 90);
{
  /* Roll the surface gently, or it is a printed carpet rather than cloud. The
     displacement is damped to nothing within 0.45m of the origin, because the
     book has to lie flat on it — a book resting on a slope reads as a mistake
     long before it reads as weather. */
  const p = seaGeom.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const r = Math.hypot(x, y);
    const damp = Math.min(1, Math.max(0, (r - 0.32) / 0.7));
    const h = Math.sin(x * 9.1) * Math.cos(y * 7.7) * 0.012
            + Math.sin(x * 3.3 + 1.7) * Math.sin(y * 2.9) * 0.030
            + Math.sin(x * 1.1 + 0.6) * Math.cos(y * 0.9) * 0.055;
    p.setZ(i, h * damp);
  }
  seaGeom.computeVertexNormals();
}
const cloudSea = new THREE.Mesh(
  seaGeom,
  new THREE.MeshStandardMaterial({
    map: cloudSeaMap, roughness: 1, metalness: 0,
    bumpMap: cloudSeaMap, bumpScale: 0.5
  })
);
cloudSea.rotation.x = -Math.PI / 2;
cloudSea.position.y = -0.004;
cloudSea.receiveShadow = true;
dayRig.add(cloudSea);

const skyAmbient = new THREE.HemisphereLight(0xdcecff, 0xffffff, 0.85);
dayRig.add(skyAmbient);

// One sun, high and a little to the left, matching the glow painted into the
// sky plate — so the book's shadow falls the way the sky says it should.
const sun = new THREE.DirectionalLight(0xfff6e6, 1.95);
sun.position.set(-0.62, 1.35, 0.52);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.0030;
sun.shadow.camera.near = 0.05;
sun.shadow.camera.far = 4;
sun.shadow.camera.left = -0.6;
sun.shadow.camera.right = 0.6;
sun.shadow.camera.top = 0.6;
sun.shadow.camera.bottom = -0.6;
dayRig.add(sun);
dayRig.add(sun.target);

// A cool fill from the opposite side, so the shaded board is sky-blue rather
// than black — outdoors, the shadow side is lit by the sky itself.
const skyFill = new THREE.DirectionalLight(0xbcd8f4, 0.55);
skyFill.position.set(0.75, 0.45, -0.55);
dayRig.add(skyFill);

/* ------------------------------------------------------- switching rigs */

const candleRig = [table, backdrop, warmAmbient, candle.group, candle2.group,
                   hearth, rim, front, bounce];

const MODE_KEY = 'journey-to-me-3d-mode';
let mode = localStorage.getItem(MODE_KEY) === 'day' ? 'day' : 'candle';

const CANDLE_BG = new THREE.Color(0x0a0406);
const candleFog = new THREE.FogExp2(0x0d0507, 1.35);
// The fog has to be the colour of the sky where it meets the cloud sea, or the
// far edge of the sea shows up as a band of the wrong blue along the horizon.
/* Density is a balance, not a taste: FogExp2 fades by 1 - exp(-(density*d)^2),
   so at 0.95 the book itself — only 0.6m away — was 28% hazed. At 0.62 the book
   keeps 87% of itself while the cloud sea is 80% gone by two metres, which is
   what puts blue sky behind it instead of a floor of cloud to the horizon. */
const dayFog    = new THREE.FogExp2(0xa8d2f5, 0.62);

function setMode(next) {
  mode = next === 'day' ? 'day' : 'candle';
  const day = mode === 'day';

  candleRig.forEach(o => { o.visible = !day; });
  dayRig.visible = day;

  // In daylight the dome IS the background, and it is drawn without tone
  // mapping — leaving a background colour behind it only risks a mismatch
  // showing through at the poles.
  scene.background = day ? null : CANDLE_BG;
  scene.fog = day ? dayFog : candleFog;

  // Bloom that reads as candleglow against black turns a bright sky to milk.
  bloom.strength = day ? 0.10 : 0.34;
  bloom.threshold = day ? 0.94 : 0.86;
  /* ACES is applied by the OutputPass, to the whole frame — a per-material
     toneMapped:false never reaches it. So the sky cannot opt out, and the only
     way to keep it blue rather than grey is to sit it lower on the curve:
     drop the exposure and put the light back with the sun and the sky fill.
     At 1.10 the sky came out the colour of wet concrete. */
  renderer.toneMappingExposure = day ? 0.86 : 1.10;

  // Petals lit for a candle are nearly black in daylight, and the stardust is
  // a warm glow that only exists because the room is dark.
  petals.forEach(p => { p.material.emissiveIntensity = day ? 0.06 : 0.30; });
  dustMat.uniforms.uDay.value = day ? 1 : 0;

  document.body.classList.toggle('day', day);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', day ? '#a8d2f5' : '#0a0406');
  const line = document.getElementById('bootLine');
  if (line) line.textContent = day ? 'opening the sky' : 'lighting the candle';

  modeCandleBtn.classList.toggle('on', !day);
  modeDayBtn.classList.toggle('on', day);
  localStorage.setItem(MODE_KEY, mode);
  reframe();
}

/* ------------------------------------------------------------ the book */

const book = new THREE.Group();
scene.add(book);

const leatherMat = new THREE.MeshStandardMaterial({
  color: 0x4a1220, roughness: 1, metalness: 0.04,
  normalMap: leatherNrm, roughnessMap: leatherRgh,
  normalScale: new THREE.Vector2(0.7, 0.7)
});
/* The inside of the boards.  When the book is open this is half of what you
   are looking at, and a flat colour there reads as an unfinished model. */
function endpaperTexture() {
  const c = document.createElement('canvas');
  c.width = 620; c.height = 828;
  const x = c.getContext('2d');
  x.fillStyle = '#5c1526';
  x.fillRect(0, 0, 620, 828);

  // Marbled paper: overlapping soft blooms, no two the same.
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * 620, py = Math.random() * 828;
    const r = 18 + Math.random() * 90;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const warm = Math.random() > 0.45;
    g.addColorStop(0, warm ? 'rgba(140,32,54,0.24)' : 'rgba(46,8,20,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }

  x.strokeStyle = 'rgba(196,152,84,0.62)';
  x.lineWidth = 3;
  x.strokeRect(42, 42, 620 - 84, 828 - 84);
  x.lineWidth = 1;
  x.strokeRect(52, 52, 620 - 104, 828 - 104);

  x.fillStyle = 'rgba(214,172,98,0.72)';
  x.textAlign = 'center';
  x.font = 'italic 34px Didot,"Bodoni MT",Georgia,serif';
  x.fillText('The Journey to Me', 310, 424);
  x.save();
  x.translate(310, 456);
  x.rotate(Math.PI / 4);
  x.fillRect(-5, -5, 10, 10);
  x.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const endpaperMat = new THREE.MeshStandardMaterial({
  map: endpaperTexture(), roughness: 0.95, metalness: 0
});

const flippedEndpaper = endpaperTexture();
flippedEndpaper.center.set(0.5, 0.5);
flippedEndpaper.rotation = Math.PI;
const endpaperFlippedMat = new THREE.MeshStandardMaterial({
  map: flippedEndpaper, roughness: 0.95, metalness: 0
});
const coverArtMat = new THREE.MeshStandardMaterial({
  map: coverMap, roughness: 0.62, metalness: 0.22,
  normalMap: leatherNrm, normalScale: new THREE.Vector2(0.35, 0.35)
});

function board() {
  const g = new THREE.BoxGeometry(CW, COVER_T, CH);
  const m = new THREE.Mesh(g, [
    leatherMat, leatherMat, coverArtMat, endpaperFlippedMat, leatherMat, leatherMat
  ]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Back board — never moves.  The pages sit on it.
const backBoard = board();
backBoard.material = [leatherMat, leatherMat, endpaperMat, leatherMat, leatherMat, leatherMat];
backBoard.position.set(CW / 2, COVER_T / 2, 0);
book.add(backBoard);

// Front board — hinges about the spine and swings all the way over.
const coverPivot = new THREE.Group();
coverPivot.position.set(0, SPINE_Y, 0);
book.add(coverPivot);
const frontBoard = board();
frontBoard.position.set(CW / 2, COVER_OFF, 0);
coverPivot.add(frontBoard);

// The spine, which stands tall when the book is shut and folds into the
// gutter as it opens.
const spine = new THREE.Mesh(new THREE.BoxGeometry(1, 1, CH), leatherMat);
spine.castShadow = spine.receiveShadow = true;
book.add(spine);

// The two stacks of pages.  Boxes, scaled every frame as leaves move across.
const blockMat = new THREE.MeshStandardMaterial({
  map: edgeMap, color: 0xcdbb9c, roughness: 0.96, metalness: 0
});
edgeMap.repeat.set(1, 24);

function stack() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blockMat);
  m.castShadow = m.receiveShadow = true;
  book.add(m);
  return m;
}
const stackR = stack(), stackL = stack();

/* --------------------------------------------------------------- leaves */

const SEG_X = 48, SEG_Z = 8;

function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, SEG_X, SEG_Z);
  g.rotateX(-Math.PI / 2);           // lie flat, front face up
  return g;
}

function leafMeshes(geom) {
  // The emissive colour is fixed here rather than assigned later: changing a
  // colour is a uniform update, but introducing one to a material that had
  // none forces the shader to be rebuilt, and that stutters mid-turn.
  const opts = {
    roughness: 0.93, metalness: 0,
    emissive: new THREE.Color(0xffcf9a), emissiveIntensity: 0
  };
  const front = new THREE.Mesh(geom, new THREE.MeshStandardMaterial(
    { ...opts, side: THREE.FrontSide }));
  const back = new THREE.Mesh(geom, new THREE.MeshStandardMaterial(
    { ...opts, side: THREE.BackSide }));
  front.castShadow = back.castShadow = true;
  front.receiveShadow = back.receiveShadow = true;
  book.add(front); book.add(back);
  return { geom, front, back };
}

const topR = leafMeshes(leafGeometry());   // the right-hand page you are reading
const topL = leafMeshes(leafGeometry());   // the left-hand page
const flying = leafMeshes(leafGeometry()); // the one in the air, mid-turn

/* Shape one leaf.

   `phi` is how far it has swung: 0 lying on the right, PI lying on the left.
   The leaf is walked from the spine outwards in SEG_X steps.  At each step the
   direction of travel has turned a little further — that accumulating turn is
   the whole trick, and it is why the page bows up off the stack in the middle
   of a turn and then settles flat at either end instead of scything through
   the paper below it.

   `lift` is the height difference between where the leaf starts and where it
   lands; it rides around the hinge with the leaf so the ends line up exactly
   with the two stacks. */
const BEND = 1.22;
/* How deeply a resting page dips into the gutter.  This has to stay smaller
   than the clearance between the page and the block beneath it — at 7.5mm the
   page sank into the block near the spine and the block's cream top face
   showed through, which read as a hard vertical band down the middle of every
   spread and looked exactly like a shadow bug. */
const GUTTER = 0.0022;
const LIE = 0.0006;              // how far a resting page floats above its stack

function shapeLeaf(obj, phi, pivotY, lift, t) {
  const pos = obj.geom.attributes.position;
  const uv = obj.geom.attributes.uv;
  const sinP = Math.sin(phi), cosP = Math.cos(phi);
  const K = BEND * sinP;

  // Walk the page: integrate the direction of travel along its length.
  const N = SEG_X;
  const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
  let ax = 0, ay = 0;
  for (let i = 1; i <= N; i++) {
    const s = (i - 0.5) / N;
    const th = phi + K * Math.pow(s, 1.25);
    ax += Math.cos(th) / N;
    ay += Math.sin(th) / N;
    xs[i] = ax; ys[i] = ay;
  }

  const droop = GUTTER * cosP * cosP;
  const ripple = 0.0028 * sinP;

  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const k = Math.min(N, Math.round(u * N));
    const z = (0.5 - v) * PH;

    let x = xs[k] * PW - lift * sinP;
    let y = pivotY + ys[k] * PW + lift * cosP;

    y -= droop * Math.exp(-u * 6.5);                       // pages dip into the gutter
    y += ripple * Math.sin(u * Math.PI) * Math.cos(v * 7.0 + t * 1.7);

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  obj.geom.computeVertexNormals();
  obj.geom.computeBoundingSphere();
}

/* ---------------------------------------------------------- petals */

function petalGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 8, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // A saddle, so a petal never looks like a sticker even edge-on.
    p.setZ(i, (x * x * 0.9 - y * y * 0.45) * 0.34);
  }
  g.computeVertexNormals();
  return g;
}
const petalGeom = petalGeometry();

/* "No floating flowers on the page."  A petal used to be allowed to fall
   through the open spread and settle on it.  Now none of them ever start over
   the book: the footprint is kept clear with enough margin for the sway the
   animation adds (±0.055 in x, ±0.035 in z) and for the petal's own size, so a
   petal that begins outside stays outside all the way down. */
const KEEP_X = CW + 0.10;          // open, the book runs from -CW to +CW
const KEEP_Z = CH / 2 + 0.09;

function petalStart() {
  let x = (Math.random() - 0.5) * 1.30;
  const z = -0.55 + Math.random() * 0.85;
  /* Not just the footprint: anything nearer the camera than the book's far edge
     passes IN FRONT of the open spread and lands on the page in screen space,
     however correct it is in three dimensions. Only petals clearly BEHIND the
     book may cross the middle of the frame, and those read as depth. */
  if (Math.abs(x) < KEEP_X && z > -KEEP_Z) {
    const side = x < 0 ? -1 : 1;
    x = side * (KEEP_X + Math.random() * 0.34);
  }
  return { x, z };
}

const petals = [];
for (let i = 0; i < 34; i++) {
  const m = new THREE.Mesh(petalGeom, new THREE.MeshStandardMaterial({
    map: petalMaps[i % petalMaps.length],
    normalMap: petalNrm, normalScale: new THREE.Vector2(0.5, 0.5),
    transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.62, metalness: 0,
    emissive: 0x8c1230, emissiveIntensity: 0.30
  }));
  const sc = 0.016 + Math.random() * 0.017;
  m.scale.set(sc, sc * 1.25, sc);
  m.userData = {
    ...petalStart(),
    y: Math.random() * 1.0,
    fall: 0.035 + Math.random() * 0.055,
    sway: 0.4 + Math.random() * 1.5,
    phase: Math.random() * 9,
    spin: (Math.random() - 0.5) * 1.7,
    tumble: 0.6 + Math.random() * 1.6
  };
  m.castShadow = false;
  scene.add(m);
  petals.push(m);
}

/* Some have already fallen.  They never move again — they are here so the
   table does not look freshly swept. */
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(petalGeom, petals[i].material);
  const sc = 0.019 + (i % 4) * 0.004;
  m.scale.set(sc, sc * 1.25, sc);
  m.rotation.x = -Math.PI / 2 + 0.05;
  m.receiveShadow = true;
  g.add(m);
  // Clear of the book, or they are simply buried under it and never seen.
  const a = (i / 9) * Math.PI * 2 + 0.7;
  const r = 0.30 + ((i * 7) % 5) * 0.055;
  g.position.set(Math.cos(a) * r, 0.0009, Math.sin(a) * r * 0.80 + 0.05);
  g.rotation.y = a * 1.7;
  scene.add(g);
}

/* ------------------------------------------------------------ stardust */

function dustTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.3, 'rgba(255,206,124,0.55)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DUST = 1400;
const dustGeom = new THREE.BufferGeometry();
{
  const p = new Float32Array(DUST * 3);
  const ph = new Float32Array(DUST);
  const sz = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    // Gathered around the book, thinning out towards the edges of the frame.
    const r = Math.pow(Math.random(), 0.6);
    const a = Math.random() * Math.PI * 2;
    p[i * 3] = Math.cos(a) * r * 0.85;
    p[i * 3 + 1] = Math.random() * 0.75;
    p[i * 3 + 2] = Math.sin(a) * r * 0.6 - 0.05;
    ph[i] = Math.random() * 100;
    sz[i] = 0.9 + Math.random() * 2.6;
  }
  dustGeom.setAttribute('position', new THREE.BufferAttribute(p, 3));
  dustGeom.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  dustGeom.setAttribute('psize', new THREE.BufferAttribute(sz, 1));
}

const dustMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uMap: { value: dustTexture() },
    uScale: { value: 1 },
    uDay: { value: 0 }
  },
  vertexShader: `
    attribute float phase;
    attribute float psize;
    uniform float uTime;
    uniform float uScale;
    varying float vTwinkle;
    void main() {
      vec3 p = position;
      /* Dust drifts: it rises slowly on the heat of the candle and wanders. */
      p.y += mod(uTime * 0.012 + phase * 0.01, 0.85);
      p.x += sin(uTime * 0.28 + phase) * 0.018;
      p.z += cos(uTime * 0.21 + phase * 1.7) * 0.018;
      vTwinkle = pow(0.5 + 0.5 * sin(uTime * 2.6 + phase * 6.0), 3.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = min(psize * uScale * (0.09 / -mv.z) * 26.0 * (0.35 + vTwinkle), 9.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D uMap;
    uniform float uDay;
    varying float vTwinkle;
    void main() {
      vec4 c = texture2D(uMap, gl_PointCoord);
      /* Added light on a black room is a spark; added light on a bright sky is
         barely a smudge, so in daylight the dust is fewer, harder glints —
         weight the twinkle instead of the base so only the peaks show. */
      float a = c.a * mix(0.10 + 0.90 * vTwinkle,
                          0.62 * pow(vTwinkle, 1.6), uDay);
      gl_FragColor = vec4(c.rgb, a);
      if (gl_FragColor.a < 0.01) discard;
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
scene.add(new THREE.Points(dustGeom, dustMat));

/* ----------------------------------------------------------- post */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.55, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* How far back the camera has to stand for the whole book to fit.

   Open, the book is twice the width it is shut, and on a phone held upright
   there is barely half the width to put it in — a fixed camera runs the
   spread straight off both sides of the screen.  So the distance is worked
   out from the book's actual size and the camera's actual field of view,
   every time either of them changes. */
function fitDistance() {
  const wide = CW + PW * Math.min(1, state.coverOpen * 1.6);
  // More room above and below than at the sides: filling the width is what
  // makes the book read, but cropping the candles out of the top of the frame
  // loses the whole point of a candlelit table.
  //
  // These numbers are deliberately unchanged — the client said she likes how
  // close up this already is, so daylight is framed exactly as candlelight is.
  // A closer daylight frame was tried and it clipped the fore edge; "cropped"
  // is the one word this client has used about every draft.
  const halfW = wide * 0.5 * 1.30;
  const halfH = CH * 0.5 * 1.75;
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dW = halfW / Math.tan(hFov / 2);
  // Lying flat and seen from a low angle, the book's depth foreshortens.
  const dH = halfH * 0.70 / Math.tan(vFov / 2);
  return Math.max(dW, dH);
}

const off = new THREE.Vector3();
let wasPortrait = null;
let dustScale = 1;
function reframe() {
  const d = THREE.MathUtils.clamp(fitDistance(), controls.minDistance, controls.maxDistance);
  off.copy(camera.position).sub(controls.target);
  if (off.lengthSq() < 1e-9) off.set(0.02, 0.288, 0.548);
  camera.position.copy(controls.target).add(off.setLength(d));
  camera.lookAt(controls.target);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  const portrait = w / h < 0.95;
  camera.fov = portrait ? 50 : 34;
  camera.updateProjectionMatrix();
  dustScale = Math.min(h / 760, 1.6);
  controls.maxDistance = Math.max(1.10, fitDistance() * 1.3);

  /* Upright on a phone the frame is tall and the book is wide, so it is looked
     at from higher up — that is the only way to spend the height on anything
     but bare table. */
  if (portrait !== wasPortrait) {
    wasPortrait = portrait;
    camera.position.copy(controls.target).add(
      portrait ? new THREE.Vector3(0.02, 0.62, 0.42) : new THREE.Vector3(0.02, 0.574, 0.819));
    document.body.classList.toggle('portrait', portrait);
  }
  reframe();
}
addEventListener('resize', resize);

/* ------------------------------------------------------- book updating */

function leafFront(j) { return 1 + 2 * j; }
function leafBack(j) { return 2 + 2 * j; }

function updateBook(t) {
  const open = state.coverOpen;
  const turn = state.turn;

  // How far each stack has grown.  During a turn the leaf in the air belongs
  // to neither, and its thickness is shared out as it crosses.
  let kL = state.leaf, kR = NLEAF - state.leaf;
  if (turn) {
    const p = turn.t;
    if (turn.dir > 0) { kL = state.leaf + p; kR = NLEAF - state.leaf - p; }
    else { kL = state.leaf - p; kR = NLEAF - state.leaf + p; }
  }
  const tL = Math.max(0.0002, kL * LEAF_T);
  const tR = Math.max(0.0002, kR * LEAF_T);

  // The cover swings; everything else waits for it to be out of the way.
  coverPivot.rotation.z = open * Math.PI;
  book.position.x = -(CW / 2) * (1 - open);

  // Shut, the spine stands the full height of the book; open, it lies down.
  const shut = 1 - open;
  const spineH = COVER_T * 2 + BLOCK_T * shut;
  spine.scale.set(0.010, spineH, 1);
  spine.position.set(-0.004, spineH / 2, 0);

  // The stacks are trimmed a shade under the pages, and their tops sit just
  // below the lowest point of the page lying on them, so a page can dip into
  // the gutter without ever cutting through the block.
  const SINK = GUTTER - LIE + 0.0002;
  const hR = Math.max(0.0002, tR - SINK), hL = Math.max(0.0002, tL - SINK);

  stackR.visible = kR > 0.02;
  stackR.scale.set(PW - 0.0024, hR, PH - 0.0024);
  stackR.position.set(PW / 2, COVER_T + hR / 2, 0);

  stackL.visible = open > 0.5 && kL > 0.02;
  stackL.scale.set(PW - 0.0024, hL, PH - 0.0024);
  stackL.position.set(-PW / 2, COVER_T + hL / 2, 0);

  // While the cover is still coming over, the pages underneath stay hidden.
  const showPages = open > 0.62;

  const rightIdx = leafFront(state.leaf + (turn && turn.dir > 0 ? 1 : 0));
  const leftIdx = leafBack(state.leaf - 1 - (turn && turn.dir < 0 ? 1 : 0));

  topR.front.visible = topR.back.visible = false;
  topL.front.visible = topL.back.visible = false;
  flying.front.visible = flying.back.visible = false;

  if (showPages) {
    const rt = pageTexture(rightIdx);
    if (rt) {
      topR.front.material.map = rt;
      topR.front.material.needsUpdate = true;
      topR.front.visible = true;
      shapeLeaf(topR, 0, COVER_T + tR + LIE, 0, t);
    }
    const lt = pageTexture(leftIdx);
    if (lt && leftIdx >= 1) {
      const m = topL.back.material;
      m.map = lt;
      m.needsUpdate = true;
      topL.back.visible = true;
      shapeLeaf(topL, Math.PI, COVER_T + tL + LIE, 0, t);
    }
  }

  if (turn && showPages) {
    const phi = turn.from + (turn.to - turn.from) * ease(turn.t);
    // A leaf at rest on the right sits at `yStart`; on the left, at `yEnd`.
    // Both ends of the swing must meet their stack exactly, in either
    // direction, which is what the pivot and the lift are solving for.
    const yStart = COVER_T + tR + LIE + 0.0004;
    const yEnd = COVER_T + tL + LIE + 0.0004;
    shapeLeaf(flying, phi, (yStart + yEnd) / 2, (yStart - yEnd) / 2, t);

    const f = pageTexture(leafFront(turn.leaf));
    const b = pageTexture(leafBack(turn.leaf));
    if (f) { flying.front.material.map = f; flying.front.material.needsUpdate = true; flying.front.visible = true; }
    if (b) { flying.back.material.map = b; flying.back.material.needsUpdate = true; flying.back.visible = true; }

    // Held up against the candle, paper glows.  A real page is translucent;
    // this is the cheap version of that, and it only shows mid-swing.
    const glow = Math.sin(turn.t * Math.PI) * 0.13;
    flying.front.material.emissiveIntensity = glow;
    flying.back.material.emissiveIntensity = glow;
  }
}

function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/* ---------------------------------------------------- mirrored backsides */

// Back faces are read from behind, so their picture has to run the other way.
for (const o of [topL, topR, flying]) {
  o.back.material.onBeforeCompile = s => {
    // Guarded: the material is compiled once before it has ever been given a
    // page, and vMapUv does not exist until it has one.
    s.vertexShader = s.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv.x = 1.0 - vMapUv.x;\n#endif'
    );
  };
}

/* ------------------------------------------------------------ turning */

const TURN_MS = 1050;
const COVER_MS = 1400;

const isOpen = () => state.coverOpen > 0.999;
function canTurn() { return isOpen() && !state.turn; }

function next() {
  if (!isOpen()) { openCover(); return; }
  if (!canTurn() || state.leaf >= NLEAF - 1) return;
  state.turn = { from: 0, to: Math.PI, t: 0, dir: 1, leaf: state.leaf, ms: TURN_MS };
  blur();
}

function prev() {
  if (isOpen() && state.leaf === 0) { closeCover(); return; }
  if (!canTurn() || state.leaf <= 0) return;
  state.turn = { from: Math.PI, to: 0, t: 0, dir: -1, leaf: state.leaf - 1, ms: TURN_MS };
  blur();
}

let coverAnim = null;
function openCover() {
  if (coverAnim || isOpen()) return;
  coverAnim = { from: state.coverOpen, to: 1, t: 0 };
  hint(false);
}
function closeCover() {
  if (coverAnim || state.coverOpen === 0) return;
  coverAnim = { from: state.coverOpen, to: 0, t: 0 };
  blur();
}

/* ------------------------------------------------------------- writing */

const input = document.getElementById('keys');

function focusPage(idx) {
  if (state.focus === idx) return;
  const was = state.focus;
  state.focus = idx;
  if (was !== null) repaint(was);
  if (idx !== null) {
    input.value = state.entries[idx] || '';
    input.focus({ preventScroll: true });
    repaint(idx);
  }
  document.body.classList.toggle('writing', idx !== null);
}
function blur() {
  if (state.focus === null) return;
  const was = state.focus;
  state.focus = null;
  input.blur();
  repaint(was);
  document.body.classList.remove('writing');
}

input.addEventListener('input', () => {
  if (state.focus === null) return;
  state.entries[state.focus] = input.value;
  localStorage.setItem(STORE, JSON.stringify(state.entries));
  repaint(state.focus);
});
input.addEventListener('keydown', e => {
  if (e.key === 'Escape') { blur(); e.preventDefault(); }
});

/* --------------------------------------------------------- interaction */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;

canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6) return;                     // that was a drag, not a click

  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);

  if (!isOpen()) {
    const hit = ray.intersectObject(frontBoard, false);
    if (hit.length) openCover();
    return;
  }

  const targets = [];
  if (topR.front.visible) targets.push(topR.front);
  if (topL.back.visible) targets.push(topL.back);
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) { blur(); return; }

  const onRight = hit.object === topR.front;
  const u = hit.uv ? (onRight ? hit.uv.x : 1 - hit.uv.x) : 0.5;

  // The outer eighth of a page is its corner: that is where you turn it.
  if (u > 0.88) { onRight ? next() : prev(); return; }

  const idx = onRight ? leafFront(state.leaf) : leafBack(state.leaf - 1);
  if (isWritable(PAGES[idx])) focusPage(idx); else blur();
});

addEventListener('keydown', e => {
  if (state.focus !== null && e.key !== 'Escape') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { next(); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
});

document.getElementById('next').onclick = next;
document.getElementById('prev').onclick = prev;

function hint(show) {
  document.getElementById('hint').classList.toggle('gone', !show);
}

/* ---------------------------------------------------------------- loop */

const clk = new THREE.Clock();
let caretT = 0;
let simT = 0;             // the scene's own clock, so it can be driven by hand

/* One tick.  Split out from the animation loop so a recording can advance the
   scene by an exact fixed step and render one frame at a time — a screen
   capture of a loop running at whatever frame rate this machine manages would
   show the page turn stuttering, which is a lie about the animation. */
function step(dt) {
  simT += dt;
  const t = simT;

  // Candle flicker.  Three waves at frequencies that share no common multiple,
  // so the light never settles into a visible beat — one sine on its own reads
  // as a pulsing lamp, not a flame.
  candles.forEach((c, i) => {
    const o = i * 3.1;
    const fl = 0.82
      + 0.10 * Math.sin(t * 2.7 + o)
      + 0.05 * Math.sin(t * 6.1 + o * 1.7)
      + 0.04 * Math.sin(t * 13.7 + o * 0.6);
    c.light.intensity = c.power * (c.spot ? 0.45 : 1) * fl;
    if (c.spot) c.spot.intensity = c.power * 0.80 * fl;
    c.flame.scale.set(0.92 + fl * 0.13, 0.84 + fl * 0.24, 1);
    c.flame.position.x = Math.sin(t * 5.3 + o) * 0.0011;
    c.light.position.x = Math.sin(t * 5.3 + o) * 0.004;
    c.light.position.z = Math.cos(t * 3.9 + o) * 0.004;
    if (i === 0) bounce.intensity = 0.028 * fl;
  });

  if (coverAnim) {
    coverAnim.t = Math.min(1, coverAnim.t + dt * 1000 / COVER_MS);
    state.coverOpen = coverAnim.from + (coverAnim.to - coverAnim.from) * ease(coverAnim.t);
    if (coverAnim.t >= 1) { state.coverOpen = coverAnim.to; coverAnim = null; reframe(); }
  }

  if (state.turn) {
    state.turn.t += dt * 1000 / state.turn.ms;
    if (state.turn.t >= 1) {
      state.leaf += state.turn.dir;
      state.turn = null;
    }
  }

  caretT += dt;
  if (caretT > 0.5) {
    caretT = 0;
    if (state.focus !== null) {
      state.caretOn = !state.caretOn;
      repaint(state.focus);
    }
  }

  for (const p of petals) {
    const d = p.userData;
    d.y -= d.fall * dt;
    if (d.y < 0.004) {
      d.y = 0.95 + Math.random() * 0.25;
      Object.assign(d, petalStart());
    }
    p.position.set(
      d.x + Math.sin(t * d.sway + d.phase) * 0.055,
      d.y,
      d.z + Math.cos(t * d.sway * 0.7 + d.phase) * 0.035
    );
    p.rotation.set(
      t * d.tumble + d.phase,
      t * d.spin,
      Math.sin(t * d.sway + d.phase) * 0.6
    );
  }

  dustMat.uniforms.uTime.value = t;
  dustMat.uniforms.uScale.value = dustScale *
    THREE.MathUtils.clamp(0.58 / camera.position.distanceTo(controls.target), 0.45, 1.2);

  updateBook(t);
  syncTabs();
  controls.update();
  composer.render();
}

let running = true;
function frame() {
  if (running) requestAnimationFrame(frame);
  step(Math.min(clk.getDelta(), 0.1));
}

/* ------------------------------------------------- day tabs and the switch */

const modeCandleBtn = document.getElementById('modeCandle');
const modeDayBtn = document.getElementById('modeDay');
modeCandleBtn.addEventListener('click', () => setMode('candle'));
modeDayBtn.addEventListener('click', () => setMode('day'));

/* The numbered tabs from the storybook version, which the client asked for by
   name. Each one jumps to the leaf that shows that day's inspiration. */
const tabsEl = document.getElementById('tabs');
const tabEls = [];

function leafOfPage(p) {
  // leaf j shows page 1+2j on its front, so the leaf that opens onto page p is
  // the one whose front is p when p is odd, and whose back is p when it is even
  return Math.max(0, Math.min(NLEAF - 1, Math.floor((p - 1) / 2)));
}

function goToPage(p) {
  const target = leafOfPage(p);
  if (!isOpen()) { openCover(); }
  state.turn = null;
  state.leaf = target;
  blur();
  updateTabs();
}

{
  const cover = document.createElement('div');
  cover.className = 'tab';
  cover.textContent = '❦';
  cover.title = 'The cover';
  cover.addEventListener('click', () => { closeCover(); state.leaf = 0; updateTabs(); });
  tabsEl.appendChild(cover);
  tabEls.push({ el: cover, day: null });

  JOURNAL.days.forEach(d => {
    const t = document.createElement('div');
    t.className = 'tab';
    t.textContent = String(d.n);
    t.title = 'Day ' + d.n + ' — ' + d.title;
    t.addEventListener('click', () => goToPage(dayPage(d.n)));
    tabsEl.appendChild(t);
    tabEls.push({ el: t, day: d.n });
  });
}

/* Called every frame, but the DOM is only touched when something has actually
   changed — restyling 22 tabs at 60fps for nothing is a real cost on a phone. */
let tabKey = '';
function syncTabs() {
  const k = state.leaf + '|' + (state.coverOpen > 0.999 ? 1 : 0);
  if (k === tabKey) return;
  tabKey = k;
  updateTabs();
}

/* Which tab is lit: whichever days are on the two pages currently facing the
   reader. Reading it off PAGES rather than off the day arithmetic means it
   cannot drift if the page list changes again. */
function updateTabs() {
  const open = isOpen();
  const shown = new Set();
  if (open) {
    // At rest the right page is leafFront(leaf) and the left is
    // leafBack(leaf - 1) — 1 + 2L and 2L. Taking 2 + 2L would light the tab
    // for the page hidden UNDER the leaf you are looking at.
    for (const p of [2 * state.leaf, 1 + 2 * state.leaf]) {
      const pg = PAGES[p];
      if (pg && pg.day) shown.add(pg.day.n);
    }
  }
  tabEls.forEach(t => {
    t.el.classList.toggle('active', t.day === null ? !open : shown.has(t.day));
  });
}

/* -------------------------------------------------------------- start */

setMode(mode);
updateTabs();
resize();
frame();

// Pages painted before the handwriting font arrives are painted in a serif;
// repaint whatever is already on screen once it lands.
if (document.fonts && document.fonts.load) {
  document.fonts.load('40px Caveat').then(() => {
    live.forEach((slot, idx) => paint(slot, idx));
  }).catch(() => {});
}

// Wait for the cover art before showing anything, or the book opens on a
// blank red board.
const boot = setInterval(() => {
  if (coverImg.complete && paperImg.complete && pending === 0) {
    clearInterval(boot);
    document.body.classList.add('loaded');
  }
}, 120);
setTimeout(() => { clearInterval(boot); document.body.classList.add('loaded'); }, 8000);

// Handy for a demo: jump straight to a day.
window.goToDay = n => {
  const target = Math.floor((dayPage(n) - 1) / 2);
  state.leaf = Math.max(0, Math.min(NLEAF - 1, target));
  state.coverOpen = 1;
  state.turn = null;
};
window.__scene = {
  state, PAGES, NLEAF, camera, controls, pool, live, renderer, scene,
  candles, topL, topR, flying,
  next, prev, openCover, closeCover, focusPage, blur, repaint,
  // Hand control, for recording a walkthrough at an exact frame rate.
  capture(on) { running = !on; if (!on) { clk.getDelta(); requestAnimationFrame(frame); } },
  step,
  write(text) {
    if (state.focus === null) return;
    state.entries[state.focus] = text;
    input.value = text;
    repaint(state.focus);
  }
};
