// The pumpkin carving mini-game at Hank's table on the contest's west end (once Gus has
// invited him, once a day). First Gus makes a request (a spooky, funny or cute face for a
// style bonus, or a copy of his own design off a little card for a likeness bonus, or
// just carve away), then a quick warm-up: the lid's off and Hank scoops out the guts and
// seeds with a few drags, flicking them into a bowl. Then the clock starts and he carves
// a big pixel-art pumpkin by dragging (mouse or finger), a knife sprite under the
// pointer sawing up and down: "shhk, shhk" (quicker and higher the faster he saws),
// chunks of rind and flesh popping out and bouncing on the table. The gouge takes big
// bites; cut a ring round a bit and it drops in. Undo, a faint stencil to follow if
// wanted, 75 seconds on the clock, and "Done!". Then the big moment: the lights go down,
// Hank lowers a candle in, strikes a match, and the face flickers into a warm glow that
// spills across the table while the whole street goes "ooooh". Gus and Dr. Ingrid come
// round, lean in and have their say (src/game/carveScore.js does the judging: eyes,
// mouth, nose, symmetry, how much is cut, style, Gus's request; cut it in half and it
// caves in), Gus announces the ribbon through his megaphone, the street cheers and the
// ribbon lands in a flurry of leaves.
//
// The face is kept in the save (state.carving: a 32 x 32 bit mask, the day, the score and
// ribbon, the ribbons won so far) and stands on Hank's table as a carved voxel pumpkin
// (CM.carvedPumpkin) glowing from inside, with its prize rosette beside it.
// Test entry point: ?scene=carve (Story.carve).
import * as THREE from 'three';
import { el, kRibbon, kBar, onScale, snapBox } from '../ui/kit.js';
import { input } from '../core/input.js';
import * as CS from './carveScore.js';
import * as CM from '../voxel/models/contest.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { CONTEST } from '../world/contest.js';
import { leaves } from '../ui/leaves.js';
import '../ui/carving.css';

const { N, CX, CY, RX, RY, CARVABLE, RIBBONS } = CS;
const PI = Math.PI;
const hyp = Math.hypot;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const TIME = 75; // seconds on the clock (once the guts are out)
const CELL = 4, PAD = 4, SIZE = N * CELL + PAD * 2; // the canvas: 4 x 4 art pixels a cell

// ---------------------------------------------------------------- palettes (ABGR for the ImageData)
const abgr = (c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const PAL = (arr) => arr.map(abgr);
const SKIN = PAL([0x4a1a08, 0x6e260c, 0x963a14, 0xb84c18, 0xd2601c, 0xe2762a, 0xee9040]);
const SKIN_N = PAL([0x24100a, 0x3a1608, 0x58220c, 0x72300f, 0x8a3c12, 0x9c4a18, 0xac5a22]);
const GLOW = PAL([0xfffbe0, 0xfff0a8, 0xffe070, 0xffcc48, 0xffb43a, 0xf89a30]);
const FLESH = PAL([0xffda92, 0xf8b452, 0xdc8430, 0xb45c1c]); // the cut wall: top, side, shaded side, bottom
const STEM = PAL([0x2a2410, 0x4e4a1c, 0x6e6a2a, 0x8a8a3a]);
const WOOD = PAL([0x2e1a0e, 0x4a2c18, 0x553420, 0x603c24]);
const WOOD_N = PAL([0x120a06, 0x1e120a, 0x24160c, 0x2a1a10]);
const CANDLE = PAL([0xf6ecd0, 0xd8ccae]);
const BURNT = abgr(0x5a2008), MARK = abgr(0x3a1608), HOVER = abgr(0xfff0c0);
// the inside before the candle catches: down through the glow to the dark
const GLOW_X = [...GLOW, ...PAL([0xd8701e, 0x9a4412, 0x5a220a, 0x2a0e06])];
const FLESH_N = PAL([0x8a5a2a, 0x6e4220, 0x5a3418, 0x42240e]); // the cut walls, unlit
const WOOD_GLOW = PAL([0x6a3a1e, 0x8a4a22, 0xa85a26, 0xc8702c]); // the table, in the candle's light
const BOWL = PAL([0x6a6e78, 0x2a2a30, 0xb8bec8]); // the gut bowl: its side, its empty inside, its rim
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);

// the pumpkin's skin shading and the stem, worked out once (they never change)
let ART = null;
function art() {
  if (ART) return ART;
  const shade = new Uint8Array(SIZE * SIZE).fill(255), stem = new Uint8Array(SIZE * SIZE).fill(255);
  const cell = (p) => (p - PAD + 0.5) / CELL;
  const inBody = (px, py) => { const dx = (cell(px) - CX) / RX, dy = (cell(py) - CY) / RY; return dx * dx + dy * dy <= 1; };
  const stemX = (gy) => CX - 0.4 + (4.6 - gy) * 0.22;
  const inStem = (px, py) => { const gx = cell(px), gy = cell(py); return gy > 0.7 && gy < 4.8 && Math.abs(gx - stemX(gy)) < 0.95; };
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const o = py * SIZE + px;
    if (!inBody(px, py)) {
      if (!inStem(px, py)) continue;
      const edge = !inStem(px - 1, py) || !inStem(px + 1, py) || !inStem(px, py - 1);
      const u = cell(px) - stemX(cell(py));
      stem[o] = edge ? 0 : cell(py) < 1.1 ? 1 : u < -0.35 ? 3 : u > 0.4 ? 1 : 2;
      continue;
    }
    if (!inBody(px - 1, py) || !inBody(px + 1, py) || !inBody(px, py - 1) || !inBody(px, py + 1)) { shade[o] = 0; continue; }
    const dx = (cell(px) - CX) / RX, dy = (cell(py) - CY) / RY;
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    let l = -0.42 * dx - 0.5 * dy + 0.76 * nz; // lit from the upper left, in front
    // the ribs: grooves running top to bottom, a little shine on each bulge
    const u = Math.max(-1, Math.min(1, dx / Math.sqrt(Math.max(1e-4, 1 - dy * dy))));
    const ph = Math.asin(u) / (PI / 5) + 0.5, f = Math.abs(ph - Math.round(ph));
    if (f < 0.1 && Math.abs(u) < 0.97) l -= 0.32;
    else l += (f - 0.3) * 0.25;
    const s = 0.5 + l * 0.55;
    shade[o] = Math.max(1, Math.min(6, Math.round(s * 5.5 + 0.5 + BAYER[(py & 3) * 4 + (px & 3)] * 0.9)));
  }
  // the table: planks with seams and a little grain, the pumpkin's shadow
  const wood = new Uint8Array(SIZE * SIZE);
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const b = Math.floor((py + 3) / 11);
    let w = (py + 3) % 11 === 0 ? 0 : 1 + (b % 2);
    const h = ((px * 73 + b * 151) ^ (px >> 3) * 29) % 37;
    if (w && h === 0) w = 3;
    const dx = (cell(px) - CX) / (RX * 1.08), dy = (cell(py) - (CY + RY - 0.6)) / 2.4;
    if (w && dx * dx + dy * dy < 1) w = Math.max(0, w - 1);
    wood[py * SIZE + px] = w;
  }
  ART = { shade, stem, wood };
  return ART;
}

// ---------------------------------------------------------------- Gus's requests (the picker before carving)
export const REQUESTS = [
  { id: 'spooky', label: 'Spooky', line: 'Make it SPOOKY. Scare the gulls off the wharf.' },
  { id: 'funny', label: 'Funny', line: 'Make me laugh. Nobody makes me laugh.' },
  { id: 'cute', label: 'Cute', line: 'Something cute. For the kids. ...And me.' },
  { id: 'copy', label: "Gus's design", line: 'Copy my design off the card. Line for line.' },
  { id: 'free', label: 'Free carve', line: 'Carve what ya like, bones.' },
];

// ---------------------------------------------------------------- little sprites (art pixels; '.' clear)
const SPR_COL = {
  o: abgr(0x1e1418), h: abgr(0x5a3420), H: abgr(0x8a5432), g: abgr(0x6a707a), b: abgr(0xa8b0ba), B: abgr(0xeef2f6),
  m: abgr(0x8a909a), M: abgr(0xd8dde4), y: abgr(0xe8862a), s: abgr(0xf6ecd0),
};
const sprite = (rows) => ({ w: rows[0].length, h: rows.length, rows });
// the carving knife, tip at the bottom (the pointer)
const KNIFE = sprite([
  '.ooo.',
  'oHHho',
  'oHhho',
  'oHHho',
  'oHhho',
  'oHHho',
  'ogggo',
  '.oBbo',
  '.oBbo',
  '.oBbo',
  '.oBbo',
  '.oBo.',
  '.oBo.',
  '..o..',
]);
// the gouge (big bites), a loop at the bottom
const GOUGE = sprite([
  '.ooo.',
  'oHHho',
  'oHhho',
  'oHHho',
  '.omo.',
  '.omo.',
  '.omo.',
  'oMmMo',
  'oM.Mo',
  'oM.Mo',
  '.ooo.',
]);
// the scoop for the guts, dripping
const SPOON = sprite([
  '..ooo..',
  '..oHo..',
  '..oho..',
  '..oHo..',
  '..omo..',
  '..omo..',
  '.oMMMo.',
  'oMyyyMo',
  'oMysyMo',
  'oMyyyMo',
  '.oMMMo.',
  '..ooo..',
]);
const CANDLE_W = 0.9;

// ---------------------------------------------------------------- the top of the pumpkin, lid off (the scoop step)
const TOPC = { x: 68, y: 70 }, TOPR = 61, HOLE = { x: 68, y: 66, rx: 33, ry: 29 };
const TOP_SKIN = PAL([0x6e260c, 0x963a14, 0xb84c18, 0xd2601c, 0xe2762a, 0xee9040, 0xf6a850]);
const HOLE_IN = PAL([0x1a0804, 0x2a0e06, 0x3e1608, 0x52200c]);
const GOO = PAL([0x8a3a12, 0xc85e1a, 0xe8862a, 0xf0a040]);
const SEEDC = abgr(0xf6ecd0), SEEDS = abgr(0xd8c8a0);
let TOP = null;
function topArt() {
  if (TOP) return TOP;
  const shade = new Uint8Array(SIZE * SIZE).fill(255);
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const dx = (px + 0.5 - TOPC.x) / TOPR, dy = (py + 0.5 - TOPC.y) / (TOPR * 0.93);
    const r = Math.hypot(dx, dy);
    if (r > 1) continue;
    const hx = (px + 0.5 - HOLE.x) / HOLE.rx, hy = (py + 0.5 - HOLE.y) / HOLE.ry;
    const hr = Math.hypot(hx, hy);
    if (hr < 1) { shade[py * SIZE + px] = hr > 0.88 ? 100 + (hy < 0 ? 0 : 1) : 200; continue; } // the cut wall, the inside
    // ribs running out from the stem hole, lit from the upper left
    const a = Math.atan2(dy, dx), f = Math.abs(((a / (PI / 5)) % 1 + 1) % 1 - 0.5);
    let l = 0.62 - dx * 0.35 - dy * 0.4 - r * r * 0.35 + (f < 0.08 ? -0.3 : (0.5 - f) * 0.25);
    if (r > 0.95) l -= 0.3;
    shade[py * SIZE + px] = Math.max(0, Math.min(6, Math.round(l * 6 + BAYER[(py & 3) * 4 + (px & 3)] * 0.9)));
  }
  TOP = { shade };
  return TOP;
}
const GW = Math.ceil((HOLE.rx * 2) / 2), GH = Math.ceil((HOLE.ry * 2) / 2); // goo cells, 2 x 2 art pixels each
const GX0 = Math.round(HOLE.x - HOLE.rx), GY0 = Math.round(HOLE.y - HOLE.ry);
const SCOOP_R = 8; // how wide a scoop is (art pixels)

// ---------------------------------------------------------------- the mini-game screen
class CarveGame {
  constructor(g, { request = null, suggest = 'spooky' } = {}) {
    this.g = g;
    this.mask = CS.emptyMask();
    this.undoStack = [];
    this.toolName = 'knife';
    this.stencil = null;
    this.left = TIME;
    this.flick = 0;
    this.night = false;
    this.glowK = 1;
    this.candleOff = 0;
    this.dirty = true;
    this.split = false;
    this.finished = false;
    this.ptr = null;
    this.hover = null;
    this.last = null;
    this.cutT = 0;
    this.phase = request ? 'scoop' : 'pick';
    this.request = request;
    this.suggest = suggest;
    this.parts = []; // flying bits: { x, y, vx, vy, c, life, s, floor }
    this.t = 0;
    this.base = new Uint32Array(SIZE * SIZE);
    this.goo = null;
    this.btn = {};
    this.candleOn = false; // (the candle goes in for the big moment at the end)
  }
  sfx(name, o) {
    this.g.sound.play(name, o);
  }

  open() {
    const g = this.g, ui = g.ui;
    return new Promise((resolve) => {
      this.resolve = resolve;
      const { p, body } = g.menus.sheet('Carve a Pumpkin', { cls: 'carve-sheet', onClose: () => this.back() });
      this.panel = p;
      body.classList.add('carve-body');
      const top = el('div', 'carve-top');
      this.clock = el('div', 'k-plate k-dark carve-clock', '');
      this.bar = kBar(1, 'heat', 'carve-time');
      top.append(this.clock, this.bar);
      const main = el('div', 'carve-main');
      this.board = el('div', 'carve-board');
      const cv = (this.cv = document.createElement('canvas'));
      cv.className = 'carve-cv';
      cv.width = cv.height = SIZE;
      this.ctx = cv.getContext('2d');
      this.img = this.ctx.createImageData(SIZE, SIZE);
      this.px = new Uint32Array(this.img.data.buffer);
      this.msgEl = el('div', 'carve-msg k-shadow', '');
      this.board.append(cv, this.msgEl);
      const side = el('div', 'carve-side');
      this.tools = el('div', 'carve-tools');
      // Gus's design, on a little card (the "copy my design" request)
      this.card = el('div', 'carve-card k-plate k-parchment');
      this.cardCv = document.createElement('canvas');
      this.cardCv.className = 'carve-card-cv';
      this.cardCv.width = this.cardCv.height = N + 4;
      this.card.append(el('div', 'carve-card-t', "Gus's design"), this.cardCv);
      this.card.style.display = 'none';
      side.append(this.tools, this.card);
      main.append(this.board, side);
      this.main = main;
      this.side = side;
      this.hintEl = el('div', 'carve-hint', '');
      body.append(top, main, this.hintEl);
      this.m = ui.openOverlay(p, { onBack: () => this.back(), items: [] });
      this.bindPointer();
      this.onKey = (e) => {
        if (this.finished || this.phase !== 'carve') return;
        if (e.code === 'Digit1') this.tool('knife');
        else if (e.code === 'Digit2') this.tool('gouge');
        else if (e.code === 'KeyZ') this.undo();
        else if (e.code === 'KeyT') this.cycleStencil();
      };
      window.addEventListener('keydown', this.onKey);
      this.offScale = onScale(() => this.fit());
      this.onResize = () => this.fit();
      window.addEventListener('resize', this.onResize);
      if (this.phase === 'pick') this.showPick();
      else this.startScoop();
      this.fit();
      this.t0 = performance.now();
      this.lastT = this.t0;
      const loop = (now) => {
        if (!this.m) return;
        this.raf = requestAnimationFrame(loop);
        this.tick(Math.min(0.1, (now - this.lastT) / 1000), now);
        this.lastT = now;
      };
      this.raf = requestAnimationFrame(loop);
    });
  }

  // the tools column for each step (only the buttons that are there can be picked)
  setTools(list) {
    const ui = this.g.ui;
    this.tools.replaceChildren();
    this.btn = {};
    for (const [key, label, fn, o] of list) {
      const b = ui.button(label, fn, o);
      this.tools.appendChild(b);
      this.btn[key] = b;
    }
    if (this.m) ui.refreshItems(this.m);
    this.fit();
  }
  hint(touch, keys) {
    this.hintEl.textContent = this.g.touch?.on || input.lastDevice === 'touch' ? touch : keys;
  }

  // ------------------------------------------------------------ 1. what Gus would like to see
  showPick() {
    this.phase = 'pick';
    this.clock.textContent = '-:--';
    this.bar.set(1);
    const sug = REQUESTS.find((r) => r.id === this.suggest) || REQUESTS[0];
    const order = [sug, ...REQUESTS.filter((r) => r !== sug)];
    this.setTools(order.map((r) => [r.id, r.label, () => this.pick(r.id), { face: r === sug ? 'green' : '' }]));
    this.say(`Gus: "${sug.line}"`, 60000);
    this.hint("Pick Gus's request (the green one is his idea). A request is worth bonus points.", "Pick Gus's request (the green one is his idea). A request is worth bonus points.");
    this.dirty = true;
  }
  pick(id) {
    if (this.phase !== 'pick') return;
    this.request = id;
    this.sfx('paper', { volume: 0.5 });
    const r = REQUESTS.find((q) => q.id === id);
    if (id !== this.suggest && r) this.say(`Gus: "${r.line}"`, 2400);
    this.startScoop();
  }

  // ------------------------------------------------------------ 2. scoop the guts out (a quick warm-up)
  startScoop() {
    this.phase = 'scoop';
    this.board.classList.add('tooled');
    this.clock.textContent = 'Guts!';
    this.bar.set(1);
    // the goo: thickest round the walls, seeds all through it
    const goo = (this.goo = new Uint8Array(GW * GH));
    this.seeds = new Uint8Array(GW * GH);
    let total = 0;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = GX0 + i * 2 + 1, y = GY0 + j * 2 + 1;
      const hr = Math.hypot((x - HOLE.x) / (HOLE.rx - 3), (y - HOLE.y) / (HOLE.ry - 3));
      if (hr > 1) continue;
      const n = Math.sin(i * 1.7 + j * 0.9) + Math.sin(i * 0.6 - j * 1.3) * 0.7;
      const a = hr > 0.6 ? 3 : n > 0.4 ? 3 : n > -0.5 ? 2 : 1;
      goo[j * GW + i] = a;
      total += a;
      if (a >= 2 && (i * 7 + j * 13) % 9 === 0) this.seeds[j * GW + i] = 1;
    }
    this.gooTotal = total;
    this.gooLeft = total;
    this.bowl = 0;
    this.setTools([['skip', 'Skip', () => this.endScoop(true), { small: true }]]);
    this.say('First, scoop out the guts!', 2400);
    this.hint('Drag inside the pumpkin to scoop out the seeds and goo.', 'Drag inside the pumpkin to scoop out the seeds and goo.');
    this.sfx('squish', { volume: 0.4, pitch: 0.8 });
    this.dirty = true;
  }
  scoopStroke(a, b) {
    const n = Math.max(1, Math.ceil(hyp(b.x - a.x, b.y - a.y) / 3));
    let took = 0, seedsOut = 0;
    const now = performance.now();
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n, y = a.y + ((b.y - a.y) * s) / n;
      const i0 = Math.floor((x - SCOOP_R - GX0) / 2), i1 = Math.floor((x + SCOOP_R - GX0) / 2);
      const j0 = Math.floor((y - SCOOP_R - GY0) / 2), j1 = Math.floor((y + SCOOP_R - GY0) / 2);
      for (let j = Math.max(0, j0); j <= Math.min(GH - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(GW - 1, i1); i++) {
        const k = j * GW + i;
        if (!this.goo[k]) continue;
        const cx = GX0 + i * 2 + 1, cy = GY0 + j * 2 + 1;
        if (hyp(cx - x, cy - y) > SCOOP_R) continue;
        if ((this.gooT?.[k] || 0) > now) continue;
        (this.gooT || (this.gooT = new Float64Array(GW * GH)))[k] = now + 90;
        const bite = Math.min(this.goo[k], 2); // a good big scoopful
        this.goo[k] -= bite;
        took += bite;
        if (this.seeds[k] && !this.goo[k]) { this.seeds[k] = 0; seedsOut++; }
        if (Math.random() < 0.35) this.flingGoo(cx, cy, this.seeds[k] || Math.random() < 0.2);
      }
    }
    if (!took) return;
    this.gooLeft -= took;
    this.bowl += took;
    this.dirty = true;
    if (now - this.cutT > 140) {
      this.cutT = now;
      this.sfx('goo_scoop', { volume: 0.45, pitch: 0.85 + Math.random() * 0.35 });
    }
    void seedsOut;
    this.bar.set(Math.max(0, this.gooLeft / this.gooTotal));
    if (this.gooLeft / this.gooTotal < 0.2) this.endScoop(false);
  }
  // a dollop of goo (or a seed) flicked into the bowl
  flingGoo(x, y, seed) {
    const bx = 121 + rnd(-7, 7), by = 117 + rnd(-2, 3);
    const T = rnd(0.45, 0.7);
    this.spark(x, y, (bx - x) / T, (by - y - 150 * T * T) / T, seed ? SEEDC : GOO[1 + ((Math.random() * 3) | 0)], T + 0.12, seed ? 1 : 2, by);
  }
  endScoop(skipped) {
    if (this.phase !== 'scoop') return;
    this.phase = 'lid';
    this.ptr = null;
    this.say(skipped ? 'Guts can wait. Lid on!' : 'All clean! Lid back on...', 1600);
    this.sfx(skipped ? 'paper' : 'item_get', { volume: 0.5 });
    this.lidT = 0;
    this.setTools([]);
  }

  // ------------------------------------------------------------ 3. carve!
  startCarve() {
    this.phase = 'carve';
    this.dirty = true;
    this.setTools([
      ['knife', 'Knife', () => this.tool('knife')],
      ['gouge', 'Gouge', () => this.tool('gouge')],
      ['undo', 'Undo', () => this.undo()],
      ['stencil', 'Stencil: off', () => this.cycleStencil()],
      ['done', 'Done!', () => this.finish('done'), { face: 'green' }],
    ]);
    this.tool('knife');
    if (this.request === 'copy') {
      this.design = CS.DESIGNS[pickOf(CS.DESIGN_NAMES)];
      this.card.style.display = '';
      this.drawCard();
      this.fit();
    }
    this.hint('Drag on the pumpkin to carve. Cut all the way round a bit and it drops in!', 'Drag on the pumpkin to carve. [1] knife, [2] gouge, [Z] undo, [T] stencil.');
    const r = REQUESTS.find((q) => q.id === this.request);
    this.say(this.request === 'copy' ? "Copy Gus's design! Mind the clock." : r && r.id !== 'free' ? `Make it ${r.label.toUpperCase()}! Mind the clock.` : 'Carve away! Mind the clock.');
    this.sfx('carve_cut', { volume: 0.4, pitch: 0.8 });
    this.carveT0 = performance.now();
  }
  // biggest crisp size that fits: a whole number of device pixels per art pixel
  fit() {
    const cv = this.cv;
    if (!cv?.isConnected) return;
    cv.style.width = cv.style.height = '64px';
    const pr = this.panel.getBoundingClientRect(), br = this.board.getBoundingClientRect();
    const mr = this.main.getBoundingClientRect(), tr = this.side.getBoundingClientRect();
    // tools beside the board (landscape) or under it (portrait: the main row wraps to a column)
    const below = tr.top >= br.bottom - 1;
    const pad = br.height - 64;
    const availH = window.innerHeight - (pr.height - mr.height) - (below ? tr.height + 8 : 0) - pad - 48;
    const availW = window.innerWidth - (pr.width - mr.width) - (below ? 0 : tr.width + 12) - pad - 16;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor((Math.min(availH, availW) * dpr) / SIZE));
    const css = (SIZE * k) / dpr;
    cv.style.width = cv.style.height = `${css}px`;
    // Gus's card: the same art pixel size, or half of it if that won't fit beside the tools
    const kc = Math.max(1, below ? k : Math.min(k, Math.floor((tr.width * dpr) / (N + 4))));
    this.cardCv.style.width = this.cardCv.style.height = `${((N + 4) * kc) / dpr}px`;
    requestAnimationFrame(() => { snapBox(this.panel); snapBox(cv); });
  }

  close() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.offScale?.();
    if (this.m) this.g.ui.closeOverlay(this.m);
    this.m = null;
  }

  say(text, ms = 2200) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('on');
    void this.msgEl.offsetWidth;
    this.msgEl.classList.add('on');
    this.msgT = ms / 1000;
  }

  tool(name) {
    this.toolName = name;
    this.btn.knife?.classList.toggle('on', name === 'knife');
    this.btn.gouge?.classList.toggle('on', name === 'gouge');
    this.dirty = true;
  }
  cycleStencil() {
    if (!this.btn.stencil) return;
    const names = [null, ...CS.STENCIL_NAMES];
    this.stencil = names[(names.indexOf(this.stencil) + 1) % names.length];
    this.btn.stencil.querySelector('.k-lbl').textContent = `Stencil: ${this.stencil || 'off'}`;
    this.sfx('paper', { volume: 0.4 });
    this.dirty = true;
  }

  // ------------------------------------------------------------ the pointer
  bindPointer() {
    const cv = this.cv;
    const art = (e) => {
      const r = cv.getBoundingClientRect();
      return { ax: ((e.clientX - r.left) / r.width) * SIZE, ay: ((e.clientY - r.top) / r.height) * SIZE };
    };
    const cellOf = (p) => ({ x: (p.ax - PAD) / CELL, y: (p.ay - PAD) / CELL, ax: p.ax, ay: p.ay });
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.finished || this.ptr != null || (this.phase !== 'carve' && this.phase !== 'scoop')) return;
      this.ptr = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const c = cellOf(art(e));
      this.cursor = c;
      this.pressed = true;
      this.lastMove = performance.now();
      this.speed = 0;
      if (this.phase === 'scoop') { this.last = c; this.scoopStroke({ x: c.ax, y: c.ay }, { x: c.ax, y: c.ay }); return; }
      this.undoStack.push(this.mask.slice());
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.changed = 0;
      this.last = c;
      this.sfx('carve_cut', { volume: 0.35, pitch: 0.9 + Math.random() * 0.25 });
      this.stroke(this.last, this.last);
    });
    cv.addEventListener('pointermove', (e) => {
      const c = cellOf(art(e));
      if (e.pointerType === 'mouse' || e.pointerId === this.ptr) this.cursor = c;
      if (e.pointerId === this.ptr) {
        const now = performance.now(), dt = Math.max(1, now - this.lastMove);
        const v = (hyp(c.ax - this.last.ax, c.ay - this.last.ay) / dt) * 1000; // art px a second
        this.speed += (v - this.speed) * 0.4;
        this.lastMove = now;
        if (this.phase === 'scoop') this.scoopStroke({ x: this.last.ax, y: this.last.ay }, { x: c.ax, y: c.ay });
        else this.stroke(this.last, c);
        this.last = c;
      } else if (e.pointerType === 'mouse') {
        this.hover = c;
        this.dirty = true;
      }
    });
    const end = (e) => {
      if (e.pointerId !== this.ptr) return;
      this.ptr = null;
      this.pressed = false;
      if (e.pointerType !== 'mouse') this.cursor = null;
      if (this.phase === 'carve') this.endStroke();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { this.hover = null; if (this.ptr == null) this.cursor = null; this.dirty = true; }
    });
  }
  // the cells a cut at (x, y) takes out
  brush(x, y, out) {
    if (this.toolName === 'knife') {
      const i = Math.floor(x), j = Math.floor(y);
      if (CS.inFace(i, j)) out.push(j * N + i);
      return out;
    }
    for (let j = Math.floor(y) - 2; j <= Math.floor(y) + 2; j++) for (let i = Math.floor(x) - 2; i <= Math.floor(x) + 2; i++) {
      if (CS.inFace(i, j) && hyp(i + 0.5 - x, j + 0.5 - y) <= 1.6) out.push(j * N + i);
    }
    return out;
  }
  stroke(a, b) {
    if (this.finished || this.phase !== 'carve') return;
    const n = Math.max(1, Math.ceil(hyp(b.x - a.x, b.y - a.y) / 0.35));
    let fresh = 0;
    const cells = [];
    for (let s = 0; s <= n; s++) this.brush(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, cells);
    for (const k of cells) {
      if (this.mask[k]) continue;
      this.mask[k] = 1;
      fresh++;
      // a chunk of pumpkin pops out (rind and flesh), a seed now and then
      if (fresh <= 3 || Math.random() < 0.3) this.chunk(k);
    }
    if (!fresh) return;
    this.changed += fresh;
    this.dirty = true;
    const now = performance.now();
    // "shhk, shhk": quicker and higher the faster the knife saws
    const sp = this.speed || 0;
    const gap = this.toolName === 'knife' ? Math.max(55, 120 - sp * 0.25) : 150;
    if (now - this.cutT > gap) {
      this.cutT = now;
      if (this.toolName === 'knife') this.sfx('carve_shhk', { volume: 0.4 + Math.min(0.25, sp * 0.0015), pitch: 0.85 + Math.min(0.55, sp * 0.0022) + Math.random() * 0.1 });
      else this.sfx('squish', { volume: 0.35, pitch: 1.1 + Math.random() * 0.3 });
    }
  }
  chunk(k) {
    const i = k % N, j = (k / N) | 0;
    const x = PAD + i * CELL + rnd(0.5, 3.5), y = PAD + j * CELL + rnd(0.5, 3.5);
    const floor = SIZE - rnd(2, 6);
    const r = Math.random();
    const c = r < 0.45 ? FLESH[(Math.random() * 3) | 0] : r < 0.85 ? SKIN[3 + ((Math.random() * 3) | 0)] : SEEDC;
    this.spark(x, y, rnd(-55, 55), rnd(-110, -40), c, rnd(0.55, 1.1), Math.random() < 0.35 ? 2 : 1, floor);
  }
  // one flying bit (art pixels, art pixels a second)
  spark(x, y, vx, vy, c, life, s = 1, floor = SIZE - 3) {
    if (this.parts.length > 260) this.parts.shift();
    this.parts.push({ x, y, vx, vy, c, life, t: 0, s, floor });
  }
  endStroke() {
    if (!this.changed) { this.undoStack.pop(); return; }
    const before = this.mask.slice();
    const fell = CS.dropLoose(this.mask);
    if (fell) {
      this.sfx('pumpkin_bonk', { volume: 0.35, pitch: 1.4 });
      this.say(fell > 12 ? 'Plop! A big bit fell in.' : 'Plop! A bit fell in.', 1600);
      // the piece tumbles in: a little shower of rind
      let n = 0;
      for (let k = 0; k < N * N && n < 14; k++) if (this.mask[k] && !before[k] && Math.random() < 0.5) { this.chunk(k); n++; }
    }
    const split = CS.isSplit(this.mask);
    if (split && !this.split) {
      this.sfx('tree_creak', { volume: 0.4, pitch: 1.6 });
      this.say("Uh oh... it's coming apart! (Undo?)", 2600);
      this.shake();
    } else if (!split && CS.countCarved(this.mask) / CS.CARVABLE_N > 0.42 && !this.flimsy) {
      this.flimsy = true;
      this.say("Careful! It's getting flimsy...", 2200);
    }
    this.split = split;
    this.dirty = true;
  }
  undo() {
    if (this.finished || !this.undoStack.length) return;
    this.mask = this.undoStack.pop();
    this.split = CS.isSplit(this.mask);
    this.dirty = true;
  }
  shake() {
    this.board.classList.remove('shake');
    void this.board.offsetWidth;
    this.board.classList.add('shake');
  }

  // ------------------------------------------------------------ the clock, the end
  tick(dt, now) {
    this.t += dt;
    if (this.phase === 'carve' && !this.finished) {
      const before = Math.ceil(this.left);
      this.left = Math.max(0, this.left - dt);
      const s = Math.ceil(this.left);
      if (s !== before && s <= 10 && s > 0) {
        this.sfx('clock_tick', { volume: s <= 5 ? 0.7 : 0.45, pitch: s <= 5 ? 1.25 : 1 });
        if (s === 10) this.say('Ten seconds!', 1400);
      }
      this.panel.classList.toggle('hurry', this.left <= 10);
      this.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.bar.set(this.left / TIME);
      const noUndo = !this.undoStack.length;
      if (this.btn.undo && this.btn.undo.disabled !== noUndo) this.btn.undo.disabled = noUndo;
      if (this.left <= 0) this.finish('time');
    }
    // the lid goes back on, and it's time to carve
    if (this.phase === 'lid') { this.dirty = true; if ((this.lidT += dt) > 0.9) this.startCarve(); }
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.msgEl.classList.remove('on');
    // the candle flickers (a dozen times a second is plenty)
    if (now - (this.flickT || 0) > 85) {
      this.flickT = now;
      const f = Math.sin(now * 0.011) * 0.5 + Math.sin(now * 0.0237 + 1) * 0.35 + (Math.random() - 0.5) * 0.3;
      if (Math.abs(f - this.flick) > 0.2) { this.flick = f; this.dirty = true; }
    }
    if (this.anim) this.anim(dt);
    if (this.dirty && !this.squashing) this.draw();
    this.composite(dt);
  }
  back() {
    if (this.finished) return;
    if (this.phase !== 'carve' || !CS.countCarved(this.mask)) {
      // nothing cut yet: walk away, no harm done (the day's go isn't used up)
      this.finished = true;
      this.close();
      this.resolve(null);
      return;
    }
    this.finish('done');
  }
  finish(why) {
    if (this.finished || this.phase !== 'carve') return;
    this.finished = true;
    this.ptr = null;
    this.hover = null;
    this.cursor = null;
    this.board.classList.remove('tooled');
    for (const b of Object.values(this.btn)) b.disabled = true;
    const frac = CS.countCarved(this.mask) / CS.CARVABLE_N;
    const collapse = CS.isSplit(this.mask) || frac > 0.5;
    let t = 0;
    const done = () => {
      this.anim = null;
      this.close();
      this.resolve({ mask: this.mask, timeUp: why === 'time', request: this.request, design: this.design || null });
    };
    if (collapse) {
      // ...and it caves in
      this.say(why === 'time' ? "Time's up! ...Oh no." : 'Oh no...', 2400);
      this.sfx('tree_creak', { volume: 0.5, pitch: 1.4 });
      this.off = this.off || Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      this.draw(true);
      this.squashing = true;
      this.anim = (dt) => {
        t += dt;
        const k = Math.min(1, Math.max(0, (t - 0.5) / 0.35));
        if (t > 0.5 && !this.smashed) {
          this.smashed = true;
          this.sfx('pumpkin_smash', { volume: 0.7 });
          this.shake();
          for (let i = 0; i < 40; i++) this.spark(SIZE / 2 + rnd(-40, 40), SIZE - 30 + rnd(-10, 10), rnd(-90, 90), rnd(-140, -40), Math.random() < 0.5 ? FLESH[(Math.random() * 3) | 0] : SKIN[4], rnd(0.6, 1.2), 2);
        }
        this.drawSquash(1 + k * 0.35, 1 - k * 0.52, t < 0.5 ? Math.sin(t * 40) * 1.2 : 0);
        if (t > 2.0) done();
      };
      return;
    }
    // the big moment: lights out... Hank lowers a candle in... strikes a match... and the
    // face lights up, flickering, while the whole street goes "oooooh"
    this.say(why === 'time' ? "Time's up! Lights out..." : 'Lights out...', 1500);
    this.sfx('lantern_whoomp', { volume: 0.5, pitch: 0.7 });
    this.night = true;
    this.glowK = 0;
    this.candleOff = -40;
    this.candleOn = true;
    this.board.classList.add('lit');
    this.dirty = true;
    let lit = false, ooh = false;
    this.anim = (dt) => {
      t += dt;
      // the candle comes down into the pumpkin (seen through the holes as it goes)
      if (t > 0.5 && t < 1.4) { this.candleOff = -40 + Math.min(1, (t - 0.5) / 0.8) * 40; this.dirty = true; }
      if (t > 1.5 && !lit) {
        lit = true;
        this.candleOff = 0;
        this.sfx('match_strike', { volume: 0.7 });
        this.say('*scritch*', 900);
      }
      if (lit && this.glowK < 1) { this.glowK = Math.min(1, this.glowK + dt / 0.7); this.dirty = true; }
      if (t > 2.3 && !ooh) {
        ooh = true;
        this.sfx('crowd_ooh', { volume: 0.8 });
        this.say('Ooooooooh!', 1800);
        this.board.classList.add('glow');
        // a few embers up out of the lid
        for (let i = 0; i < 10; i++) this.spark(PAD + CX * CELL + rnd(-6, 6), PAD + 8, rnd(-12, 12), rnd(-60, -25), GLOW[(Math.random() * 3) | 0], rnd(0.6, 1.2), 1, -99);
      }
      if (t > 3.9) done();
    };
  }

  // ------------------------------------------------------------ drawing
  // the board (when something changed) into this.base; composite() adds what moves
  draw(pumpkinOnly = false) {
    this.dirty = false;
    if (this.phase === 'pick' || this.phase === 'scoop' || (this.phase === 'lid' && this.lidT < 0.45)) {
      if (this.phase === 'pick') this.drawFront(false);
      else this.drawTop();
    } else this.drawFront(pumpkinOnly);
    if (pumpkinOnly) this.off.getContext('2d').putImageData(this.img, 0, 0);
    this.base.set(this.px);
    this.needPut = true;
  }
  drawFront(pumpkinOnly) {
    const A = art(), D = this.px, m = this.mask, night = this.night;
    const skin = night ? SKIN_N : SKIN, wood = night ? WOOD_N : WOOD;
    const st = this.stencil ? CS.STENCILS[this.stencil] : null;
    let hov = null;
    if (this.hover && !this.finished && this.phase === 'carve') hov = new Set(this.brush(this.hover.x, this.hover.y, []));
    const gk = this.glowK;
    const flick = this.flick * 0.9 * gk - (night ? 1.1 * gk : 0) + (1 - gk) * 7;
    const candleX = CX, candleY = CY + 7.5 + this.candleOff / CELL;
    const glowOn = gk > 0.05;
    for (let py = 0; py < SIZE; py++) {
      const cj = Math.floor((py - PAD) / CELL), sy = py - PAD - cj * CELL;
      for (let px = 0; px < SIZE; px++) {
        const o = py * SIZE + px;
        const s = A.shade[o];
        if (s === 255) {
          const t = A.stem[o];
          if (t !== 255) { D[o] = STEM[t]; continue; }
          if (pumpkinOnly) { D[o] = 0; continue; }
          let w = A.wood[o];
          // the candlelight spills out onto the table round the pumpkin
          if (night && glowOn) {
            const d = hyp((px - (PAD + CX * CELL)) / 1.25, py - (PAD + (CY + RY) * CELL)) / 70;
            const l = (1 - d) * gk + BAYER[(py & 3) * 4 + (px & 3)] * 0.35;
            if (l > 0.55) { D[o] = WOOD_GLOW[Math.min(3, Math.floor((l - 0.55) * 8))]; continue; }
            if (l > 0.3) w = Math.min(3, w + 1);
          }
          D[o] = wood[w];
          continue;
        }
        const ci = Math.floor((px - PAD) / CELL), sx = px - PAD - ci * CELL;
        const k = ci >= 0 && cj >= 0 && ci < N && cj < N ? cj * N + ci : -1;
        let c;
        if (k >= 0 && m[k]) {
          const up = m[k - N], dn = m[k + N], lf = m[k - 1], rt = m[k + 1];
          const wall = (n) => (glowOn ? FLESH[n] : FLESH_N[n]);
          if (!up && sy < 2) c = sy === 0 ? wall(0) : wall(1);
          else if (!lf && sx === 0) c = wall(1);
          else if (!rt && sx === 3) c = wall(2);
          else if (!dn && sy === 3) c = wall(3);
          else {
            const gx = (px - PAD + 0.5) / CELL, gy = (py - PAD + 0.5) / CELL;
            if (this.candleOn && Math.abs(gx - candleX) < CANDLE_W && gy > candleY + 1 && gy < candleY + 3.6) c = CANDLE[gx > candleX + 0.4 ? 1 : 0];
            else if (this.candleOn && glowOn && Math.abs(gx - candleX) < 0.4 + (gy - candleY + 0.6) * 0.25 && gy > candleY - 0.6 - this.flick * 0.3 && gy <= candleY + 1) c = GLOW[0];
            else {
              const d = hyp(gx - candleX, (gy - candleY) * 1.2);
              const gi = Math.floor(d / 4 + flick + BAYER[(py & 3) * 4 + (px & 3)] * 0.8);
              c = GLOW_X[gi < 0 ? 0 : gi > 9 ? 9 : gi];
            }
          }
        } else {
          c = skin[s];
          if (s > 0 && k >= 0) {
            // a scorched rim round the holes; the stencil's dotted marker lines
            if ((sx === 3 && m[k + 1]) || (sx === 0 && m[k - 1]) || (sy === 3 && m[k + N]) || (sy === 0 && m[k - N])) c = BURNT;
            else if (st && st[k] && ((px + py) & 1) === 0 && ((sx === 0 && !st[k - 1]) || (sx === 3 && !st[k + 1]) || (sy === 0 && !st[k - N]) || (sy === 3 && !st[k + N]))) c = MARK;
          }
        }
        // where the cut would go (mouse only)
        if (hov && k >= 0 && hov.has(k) && ((px + py) & 1) && ((sx === 0 && !hov.has(k - 1)) || (sx === 3 && !hov.has(k + 1)) || (sy === 0 && !hov.has(k - N)) || (sy === 3 && !hov.has(k + N)))) c = HOVER;
        D[o] = c;
      }
    }
  }
  // the pumpkin from above with its lid off: goo, seeds and the bowl
  drawTop() {
    const A = art(), T = topArt(), D = this.px;
    const goo = this.goo;
    for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
      const o = py * SIZE + px;
      const s = T.shade[o];
      if (s === 255) { D[o] = WOOD[A.wood[o]]; continue; }
      if (s < 100) { D[o] = TOP_SKIN[s]; continue; }
      if (s === 100) { D[o] = FLESH[0]; continue; }
      if (s === 101) { D[o] = FLESH[2]; continue; }
      // inside: goo where there's still goo, else the dark hollow
      const i = (px - GX0) >> 1, j = (py - GY0) >> 1;
      const k = i >= 0 && j >= 0 && i < GW && j < GH ? j * GW + i : -1;
      const a = k >= 0 && goo ? goo[k] : 0;
      if (a) {
        if (this.seeds[k] && ((px - GX0) & 1) === 0) { D[o] = (py & 1) ? SEEDS : SEEDC; continue; }
        const strand = ((px * 3 + py * 5) & 7) === 0;
        D[o] = GOO[Math.min(3, a - (strand ? 1 : 0) + (((px + py) & 3) === 0 ? 1 : 0))];
      } else {
        const d = hyp((px - HOLE.x) / HOLE.rx, (py - HOLE.y) / HOLE.ry);
        D[o] = HOLE_IN[Math.max(0, Math.min(3, Math.floor((1 - d) * 4 + BAYER[(py & 3) * 4 + (px & 3)])))];
      }
    }
    // the bowl of guts in the corner, filling up
    const bx = 121, by = 120, fill = Math.min(1, (this.bowl || 0) / Math.max(1, this.gooTotal * 0.85));
    for (let py = by - 10; py <= by + 9; py++) for (let px = bx - 13; px <= bx + 13; px++) {
      if (px >= SIZE || py >= SIZE) continue;
      const dx = (px - bx) / 13, dy = (py - by) / 9;
      const r = dx * dx + dy * dy;
      if (r > 1) continue;
      const o = py * SIZE + px;
      if (r > 0.72) D[o] = py < by ? BOWL[2] : BOWL[0];
      else if (dy < -0.4 + (1 - fill) * 0.9 && dy < 0.2) D[o] = BOWL[1];
      else D[o] = ((px + py) & 3) === 0 && fill > 0.2 ? SEEDC : GOO[1 + ((px * 7 + py * 3) % 3)];
    }
  }
  // the moving bits on top of the board: flying chunks and goo, the knife (sawing away)
  stepParts(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; }
    }
  }
  composite(dt) {
    const P = this.parts, D = this.px;
    this.stepParts(dt);
    if (this.squashing) return;
    const moving = P.length > 0 || !!this.cursor;
    if (!moving && !this.wasMoving && !this.needPut) return;
    this.wasMoving = moving;
    this.needPut = false;
    D.set(this.base);
    // flying bits: arc, bounce on the table, blink out
    for (const p of P) {
      if (p.life - p.t < 0.2 && ((p.t * 20) | 0) & 1) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      for (let yy = 0; yy < p.s; yy++) for (let xx = 0; xx < p.s; xx++) {
        const X = x + xx, Y = y + yy;
        if (X >= 0 && Y >= 0 && X < SIZE && Y < SIZE) D[Y * SIZE + X] = p.c;
      }
    }
    // the tool under the pointer: tip on the spot; sawing up and down while it cuts
    const c = this.cursor;
    if (c && !this.finished && (this.phase === 'carve' || this.phase === 'scoop')) {
      const spr = this.phase === 'scoop' ? SPOON : this.toolName === 'knife' ? KNIFE : GOUGE;
      const saw = this.pressed ? [0, -1, -2, -1][Math.floor(this.t * 22) % 4] : -3;
      const jig = this.pressed && this.phase === 'carve' ? Math.floor(this.t * 22) % 2 : 0;
      const x0 = Math.round(c.ax) - (spr.w >> 1) + jig, y0 = Math.round(c.ay) - spr.h + 1 + saw + (this.phase === 'scoop' ? 6 : 0);
      for (let y = 0; y < spr.h; y++) {
        const row = spr.rows[y];
        for (let x = 0; x < spr.w; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          const X = x0 + x, Y = y0 + y;
          if (X >= 0 && Y >= 0 && X < SIZE && Y < SIZE) D[Y * SIZE + X] = SPR_COL[ch];
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
  // Gus's design on his little card (one art pixel a cell, cut cells in marker)
  drawCard() {
    const cv = this.cardCv, ctx = cv.getContext('2d'), W = N + 4;
    const img = ctx.createImageData(W, W), D = new Uint32Array(img.data.buffer);
    const paper = abgr(0xf2e6c8), line = abgr(0xd8c8a0), ink = abgr(0x3a1608), skin = abgr(0xe2762a);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = x - 2, j = y - 2;
      let c = (y % 4 === 3) ? line : paper;
      if (i >= 0 && j >= 0 && i < N && j < N) {
        const k = j * N + i;
        if (CS.BODY[k]) c = this.design[k] ? ink : skin;
      }
      D[y * W + x] = c;
    }
    ctx.putImageData(img, 0, 0);
  }
  // the collapse: the pumpkin (drawn once into this.off) squashed onto the table
  drawSquash(sx, sy, wob) {
    const A = art(), D = this.px, wood = WOOD;
    for (let o = 0; o < SIZE * SIZE; o++) D[o] = wood[A.wood[o]];
    const c = this.ctx;
    c.putImageData(this.img, 0, 0);
    c.imageSmoothingEnabled = false;
    const w = SIZE * sx, h = SIZE * sy;
    const base = PAD + (CY + RY) * CELL; // the pumpkin's bottom stays on the table
    c.drawImage(this.off, Math.round((SIZE - w) / 2 + wob), Math.round(base - base * sy), Math.round(w), Math.round(h));
    // (the bits flying off are drawn over the top)
    const P = this.parts;
    for (const p of P) {
      if (p.t >= p.life) continue;
      c.fillStyle = `#${((p.c & 0xff) << 16 | (p.c & 0xff00) | ((p.c >> 16) & 0xff)).toString(16).padStart(6, '0')}`;
      c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
  }
}

// ---------------------------------------------------------------- Hank's table, the judging
export class Carving {
  constructor(g, contest) {
    this.g = g;
    this.contest = contest;
    this.group = null;
    this.key = null;
    this.busy = false;
  }
  get st() {
    return this.g.state;
  }
  spot() {
    return this.g.world.voxel?.contestHank || null;
  }
  hasCarving() {
    return !!this.st?.carving?.mask;
  }
  doneToday() {
    const c = this.st?.carving;
    return !!c && c.day === this.st.day;
  }

  // the prompt at Hank's table
  action(p, slow) {
    const g = this.g, T = this.spot();
    if (!T || !slow || this.busy || !this.st?.flags?.village1 || g.interior?.active) return null;
    if (hyp(p.x - T.x, p.z - T.z) > 2.3 || Math.abs(p.y - T.y) > 2.5) return null;
    if (this.doneToday()) return { text: 'Admire my pumpkin', fn: () => this.admire() };
    return { text: 'Carve a pumpkin', fn: () => this.start() };
  }
  admire() {
    const c = this.st.carving;
    const r = RIBBONS[c.ribbon] || RIBBONS.part;
    const won = Object.entries(c.ribbons || {}).filter(([, n]) => n).map(([k, n]) => `${n} x ${RIBBONS[k].name}`).join(', ');
    this.g.ui.pop(c.collapsed
      ? `My pumpkin... is resting. *${r.name}* though! One go a day: back tomorrow. (So far: ${won}.)`
      : `Look at it glow! *${r.name}*, ${c.score} points. One go a day: back tomorrow! (So far: ${won}.)`, { expr: c.collapsed ? 'sheepish' : 'sparkle', ms: 5000 });
  }

  // ------------------------------------------------------------ playing
  async start({ intro = true, invited = false } = {}) {
    const g = this.g;
    if (this.busy) return;
    this.busy = true;
    try {
      if (intro && !this.st.flags.carveIntro) await this.intro();
      g.openMenu(() => {});
      g.ui.prompt(null);
      // what Gus would like to see today (the first time, something to impress him with)
      const suggest = invited ? pickOf(['spooky', 'funny', 'cute', 'copy']) : pickOf(['spooky', 'funny', 'cute', 'copy', 'copy', 'free']);
      const game = (this.current = new CarveGame(g, { suggest })); // (tests poke at it)
      const out = await game.open();
      this.current = null;
      if (!out) { g.resumeFromMenu(); return; }
      const res = CS.scoreCarving(out.mask, { theme: CS.THEMES[out.request] ? out.request : null, target: out.request === 'copy' ? out.design : null });
      const st = this.st;
      const c = (st.carving = st.carving || {});
      c.day = st.day;
      c.mask = CS.encodeMask(out.mask);
      c.score = res.score;
      c.ribbon = res.ribbon;
      c.collapsed = !!res.collapse;
      c.ribbons = c.ribbons || {};
      c.ribbons[res.ribbon] = (c.ribbons[res.ribbon] || 0) + 1;
      c.best = Math.max(c.best || 0, res.score);
      c.entries = (c.entries || 0) + 1;
      c.request = out.request || null;
      this.sync(true);
      g.save();
      g.resumeFromMenu();
      await this.judgeScene(res);
      g.save();
    } finally {
      this.busy = false;
    }
  }

  // story scenes take a villager over for a while (back to their day afterwards)
  borrow(S, keys) {
    const out = {};
    for (const k of keys) {
      const a = this.g.villagers?.get(k);
      if (!a) continue;
      a.scripted = true;
      a.path = null;
      a.onArrive = null;
      a.lookAt(null);
      a.brain?.setShown?.(true);
      out[k] = a;
    }
    S.temp.push({ remove: () => { for (const a of Object.values(out)) { a.scripted = false; a.path = null; a.lookAt(null); a.play('idle', 'neutral'); } } });
    return out;
  }
  place(a, x, z, yaw) {
    const y = this.g.physics.groundAt(x, z, (this.spot()?.y ?? 0) + 1).h;
    a.pos.set(x, y, z);
    a.yaw = a.targetYaw = yaw;
  }
  // Hank stands behind his table for these scenes (the rider is hidden meanwhile)
  hankAt(S) {
    const g = this.g, T = CONTEST.hank.stand;
    g.rider.visible = false;
    S.temp.push({ remove: () => { g.rider.visible = true; } });
    const H = S.actor('hank', T.x, T.z, T.yaw, 'idle');
    return H;
  }

  // the first time: Gus's verdict on a skeleton entering a carving contest
  async intro() {
    const g = this.g;
    this.st.flags.carveIntro = true;
    await g.story.scene(async (S) => {
      const T = CONTEST.hank, y = (this.spot()?.y ?? 0.8) - 0.8;
      const H = this.hankAt(S);
      const { gus } = this.borrow(S, ['gus']);
      if (gus) { this.place(gus, T.x + 0.5, T.z - 1.35, 0.15); gus.play('hostWalk', 'neutral'); }
      await S.cam(V(T.x - 2.8, y + 1.7, T.z - 4.2), V(T.x, y + 0.9, T.z - 0.4), 0, 46);
      H.play('wave', 'happy');
      await S.say('hank', 'Mind if I have a go? I used to whittle. Mostly canoe paddles.', { actor: H, expr: 'happy' });
      H.play('idle', 'happy');
      if (gus) {
        gus.play('inspect', 'neutral');
        gus.showEmote('question', 2);
        await S.say('gus', 'A skeleton... carving a face?', { actor: gus, expr: 'surprised' });
        gus.react('shake');
        await S.say('gus', 'Well, it IS a fair contest.', { actor: gus, expr: 'smug' });
        gus.faceTowards(CONTEST.x, CONTEST.z);
        gus.play('announce', 'laugh');
        S.sfx('megaphone', { volume: 0.6 });
        await S.cam(V(gus.pos.x + 2.6, y + 1.65, gus.pos.z - 0.6), V(gus.pos.x, y + 1.45, gus.pos.z + 0.15), 0.6, 44);
        await S.say('gus', 'FOLKS! WE GOT A LATE ENTRY!', { actor: gus, expr: 'laugh' });
        this.contest.cheer(1, { force: true });
        await S.wait(1.2);
        gus.face(0.15);
        gus.play('hostWalk', 'neutral');
        await S.cam(V(T.x - 2.8, y + 1.7, T.z - 4.2), V(T.x, y + 0.9, T.z - 0.4), 0.6, 46);
        await S.say('gus', `One pumpkin a day, ${TIME} seconds on the clock. Go on, bones. Impress me.`, { actor: gus, expr: 'neutral' });
      }
    });
  }

  // what the judges make of it
  verdict(r) {
    if (r.empty) return { gus: 'Did you... start?', ingrid: 'A pristine, untouched specimen. Very... minimalist.', hank: "It's called *Pumpkin*. It's about restraint." };
    if (r.collapse) return { gus: "...And it's soup.", ingrid: 'Time of death: just now.', hank: "It's a *modern* piece. It's about... gravity." };
    const gus = !r.eyes ? "It can't see, son. The poor thing can't SEE."
      : r.wink ? 'A wink! Cheeky. I like it.'
      : r.eyes === 1 ? "One eye. A pirate pumpkin! Birdie'll love it."
      : !r.mouth ? "No mouth? How's it gonna eat its candy?"
      : r.teeth ? 'Look at them CHOPPERS! Ha!'
      : r.area > 0.32 ? "More hole than pumpkin. But it holds. Barely."
      : r.area < 0.06 ? "Delicate. Real... delicate. You gotta squint."
      : r.sym < 0.4 ? 'Lopsided. Like my barn. I like my barn.'
      : r.ribbon === 'first' ? "Now THAT there is a real jack-o'-lantern."
      : 'Hmph. Good clean cuts.';
    const ingrid = r.sym >= 0.8 ? 'Bilateral symmetry! Like a healthy ribcage.'
      : r.nose ? 'And a nose! Anatomically ambitious.'
      : r.sym < 0.4 ? 'Asymmetrical. Expressive. Possibly a medical condition.'
      : 'Steady hands, for someone with no tendons.';
    const hank = { first: "FIRST PRIZE?! Nana's putting this on the fridge!", second: 'Second prize! The silver medal of squash!', third: 'Third! A *bronze* bone! I\'ll take it!', part: "Honourable mention! Honour! For me!" }[r.ribbon];
    return { gus, ingrid, hank, request: this.requestLine(r) };
  }
  // and what Gus makes of it, against what he asked for
  requestLine(r) {
    const q = r.request;
    if (!q || r.empty || r.collapse) return null;
    if (q.kind === 'copy') {
      return q.sim >= 0.75 ? "Line for line! Ya copied it better than I drew it." : q.sim >= 0.45 ? 'Close enough to my design. Close enough.' : "...That's not my design. That's not ANYBODY's design.";
    }
    const L = {
      spooky: ["I asked for spooky... and now I'm sleepin' with the lights on.", 'Spooky-ish. I\'ll allow it.', "That's not spooky. That's a pumpkin with a head cold."],
      funny: ['HA! HAHA! ...Ahem. I did not laugh. Write that down.', 'Heh. Mildly amusing.', "Funny? I've seen funnier tax forms."],
      cute: ["Aww. Look at its little face. ...Don't tell anybody I said 'aww'.", 'Cute enough. For a pumpkin.', "Cute? It looks like it owes me money."],
    }[q.theme];
    return L ? L[q.pts >= 7 ? 0 : q.pts >= 3 ? 1 : 2] : null;
  }

  async judgeScene(r) {
    const g = this.g;
    const T = CONTEST.hank;
    const P = this.spot();
    if (!P) return;
    const y = P.y - 0.8;
    const say = this.verdict(r);
    const R = RIBBONS[r.ribbon] || RIBBONS.part;
    await g.story.scene(async (S) => {
      const H = this.hankAt(S);
      const { gus, ingrid } = this.borrow(S, ['gus', 'ingrid']);
      if (gus) { this.place(gus, T.x + 3.8, T.z - 2.4, -PI / 2); gus.play('hostWalk', 'neutral'); }
      if (ingrid) { this.place(ingrid, T.x - 3.2, T.z - 2.2, PI / 2); ingrid.play('clipboard', 'neutral'); }
      const pumpkin = this.pumpkin;
      if (this.rosette) this.rosette.visible = false; // (pinned on when Gus announces it)
      S.temp.push({ remove: () => { if (this.rosette) this.rosette.visible = true; } });
      if (r.collapse && pumpkin) pumpkin.scale.set(1, 1, 1);
      // Hank presents his work
      await S.cam(V(T.x - 3.4, y + 2.0, T.z - 4.4), V(T.x, y + 0.95, T.z - 0.3), 0, 46);
      H.play('present', 'proud');
      await S.say('hank', r.collapse ? 'Ta-daaa! Behold my...' : 'Ta-daaa! Behold!', { actor: H, expr: 'proud' });
      if (r.collapse && pumpkin) {
        // ...it caves in
        S.sfx('tree_creak', { volume: 0.5, pitch: 1.5 });
        await S.wait(0.5);
        S.sfx('pumpkin_smash', { volume: 0.7 });
        g.effects.poof?.(P.x, P.y + 0.2, P.z, { scale: 0.6, count: 6, color: [1, 0.6, 0.25] });
        await S.anim(0.35, (k) => pumpkin.scale.set(1 + k * 0.18, 1 - k * 0.5, 1 + k * 0.18));
        H.play('idle', 'shock');
        H.showEmote('sweat', 2);
        await S.wait(0.6);
      }
      // the judges come round for a close look
      const GJ = [T.x + 0.45, T.z - 1.2], IJ = [T.x - 0.55, T.z - 1.25];
      if (gus) gus.walkTo([GJ], 1.6, 'hostWalk');
      if (ingrid) ingrid.walkTo([IJ], 1.5, 'walk');
      await S.wait(2.6);
      if (gus) { gus.path = null; this.place(gus, GJ[0], GJ[1], 0); gus.play('inspect', 'neutral'); gus.showEmote('note', 1.6); S.sfx('hum_hmm', { volume: 0.5 }); }
      if (ingrid) { ingrid.path = null; this.place(ingrid, IJ[0], IJ[1], 0); ingrid.play('judge', 'neutral'); S.sfx('pencil_scribble', { volume: 0.5 }); }
      H.play('idle', r.collapse ? 'sheepish' : 'worried');
      // from behind Hank, the judges leaning in over the pumpkin
      await S.cam(V(T.x + 1.0, y + 1.75, T.z + 1.7), V(T.x - 0.1, y + 1.15, T.z - 1.0), 0.8, 44);
      await S.wait(1.4);
      if (gus) {
        await S.faceShot(gus, { dist: 2.2, side: 0.9, dur: 0.5 });
        if (!r.collapse && !r.empty) gus.play('hostPoint', 'happy');
        await S.say('gus', say.gus, { actor: gus, expr: r.collapse || r.empty ? 'sheepish' : 'smug' });
        if (say.request) {
          gus.play('inspect', 'neutral');
          await S.say('gus', say.request, { actor: gus, expr: (r.request?.pts || 0) >= 7 ? 'laugh' : (r.request?.pts || 0) >= 3 ? 'smug' : 'grumpy' });
        }
      }
      if (ingrid) {
        await S.faceShot(ingrid, { dist: 2.2, side: -0.8, dur: 0.5 });
        await S.say('ingrid', say.ingrid, { actor: ingrid, expr: r.collapse ? 'sad' : 'surprised' });
      }
      // Gus turns to the street, megaphone up (his face, from the street side)
      if (gus) {
        gus.faceTowards(CONTEST.x, CONTEST.z);
        gus.play('announce', 'happy');
        await S.cam(V(gus.pos.x + 2.6, y + 1.65, gus.pos.z - 0.6), V(gus.pos.x, y + 1.45, gus.pos.z + 0.15), 0.6, 42);
        S.sfx('megaphone', { volume: 0.7 });
        await S.say('gus', `FOLKS! The skeleton's pumpkin takes...`, { actor: gus, expr: 'happy' });
        await S.wait(0.4);
        await S.say('gus', r.ribbon === 'part' ? (r.collapse ? 'HONOURABLE MENTION! For... ambition!' : 'HONOURABLE MENTION!') : `${R.name.toUpperCase()}!`, { actor: gus, expr: 'laugh' });
      }
      // the street goes wild (looking down the street from behind Hank's table)
      await S.cam(V(T.x - 3.6, y + 2.4, T.z - 1.6), V(T.x + 9, y + 1.0, T.z - 3.6), 0, 52);
      const cheered = this.contest.cheer(r.ribbon === 'first' || r.ribbon === 'second' ? 2 : 1, { force: true });
      if (!cheered) S.sfx('applause', { volume: 0.6 });
      if (ingrid) ingrid.react('clap');
      S.sfx(r.ribbon === 'part' ? 'quest_done' : 'upgrade', { volume: 0.7 });
      this.award(r);
      if (this.rosette) this.rosette.visible = true;
      if (r.ribbon !== 'part') g.effects.confetti(P.x, P.y + 1.2, P.z - 0.4, r.ribbon === 'first' ? 60 : 36);
      H.play(r.ribbon === 'part' ? 'shrug' : 'cheer', r.ribbon === 'part' ? 'sheepish' : 'laugh');
      if (r.ribbon !== 'part') H.react('yay');
      await S.wait(1.6);
      // Hank, over the judges' heads
      await S.cam(V(T.x - 0.3, y + 2.5, T.z - 2.7), V(T.x, y + 1.3, T.z + 1.1), 0.6, 44);
      await S.wait(0.4);
      await S.say('hank', say.hank, { actor: H, expr: r.ribbon === 'part' ? 'sheepish' : 'sparkle' });
      await S.wait(0.6);
    });
  }
  // the ribbon, pinned on the screen for a moment
  award(r) {
    const g = this.g;
    const R = RIBBONS[r.ribbon] || RIBBONS.part;
    const box = el('div', 'carve-award');
    const rib = kRibbon(R.name, R.kit);
    box.appendChild(rib);
    box.appendChild(el('div', 'k-plate k-parchment carve-score', `${r.score} points`));
    const q = r.request;
    if (q?.pts) box.appendChild(el('div', 'k-plate k-dark carve-bonus', q.kind === 'copy' ? `+${q.pts} likeness to Gus's design` : `+${q.pts} for ${CS.THEMES[q.theme]?.name || q.theme}`));
    g.ui.root.appendChild(box);
    // the ribbon lands in a flurry of leaves
    requestAnimationFrame(() => leaves.burstFrom(rib, r.ribbon === 'part' ? 6 : 14));
    g.wait(4.2).then(() => box.remove());
  }

  // ------------------------------------------------------------ the pumpkin on the table
  // (re)build when the saved carving changes; shown only when the contest is in view
  sync(force = false) {
    const T = this.spot();
    if (!T) return;
    const c = this.st?.carving;
    const key = c?.mask ? `${c.mask}|${c.ribbon}|${c.collapsed ? 1 : 0}` : 'plain';
    if (key === this.key && !force) return;
    this.key = key;
    if (this.group) {
      this.g.scene.remove(this.group);
      this.group.traverse((o) => o.geometry?.dispose());
    }
    const mask = c?.mask ? CS.decodeMask(c.mask) : null;
    const grp = (this.group = new THREE.Group());
    grp.position.set(T.x, T.y, T.z);
    grp.rotation.y = T.yaw;
    const res = CM.carvedPumpkin({ mask });
    const m = voxMesh(meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true }), sharedVoxelMaterial());
    if (c?.collapsed) m.scale.set(1.18, 0.5, 1.18);
    grp.add(m);
    this.pumpkin = m;
    this.rosette = null;
    if (mask && c.ribbon) {
      const rr = CM.prizeRosette({ color: (RIBBONS[c.ribbon] || RIBBONS.part).color });
      const rm = (this.rosette = voxMesh(meshVox(rr.vox, { size: rr.size, origin: rr.origin }), sharedVoxelMaterial(), { cast: false }));
      rm.position.set(0.5, 0.005, 0.2);
      rm.rotation.y = 0.4;
      grp.add(rm);
    }
    this.g.scene.add(grp);
    if (T.light) T.light.on = !!mask && !c.collapsed;
  }
  update(dt, near) {
    // (built in idle time, so riding into the contest never hitches)
    if (near && !this.pending) {
      const c = this.st?.carving;
      const key = c?.mask ? `${c.mask}|${c.ribbon}|${c.collapsed ? 1 : 0}` : 'plain';
      if (key !== this.key) {
        this.pending = true;
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
        idle(() => { this.pending = false; this.sync(); }, { timeout: 1200 });
      }
    }
    if (this.group) this.group.visible = near;
  }

  // (test entry point: ?scene=carve) Hank at his table at mid-morning, the crowd friendly
  async debug() {
    const g = this.g, st = this.st, T = CONTEST.hank.stand;
    st.flags.village1 = true;
    st.flags.contestScream = true;
    st.flags.carveIntro = !g.params?.has('intro');
    if (st.carving) st.carving.day = -1;
    g.world.atmosphere.hour = 10.5;
    for (const b of g.villagers.brains) g.villagers.force(b.char, 50, true);
    g.villagers.syncState();
    g.parkBike(T.x - 1.9, T.z + 0.3, -PI / 2);
    g.chase.snap(g.bike);
    await g.wait(0.4);
    if (g.mode === 'cutscene') g.mode = 'ride';
    await this.start();
  }
}

