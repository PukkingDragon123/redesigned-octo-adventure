// The pumpkin carving mini-game at Hank's table on the contest's west end (once the
// village has met him, once a day): a big pixel-art pumpkin on the table, carved by
// dragging (mouse or finger). The knife cuts thin lines, the scoop takes big bites; cut a
// ring round a bit and it drops in. Every cut shows the candle-lit inside, glowing warm,
// with the pumpkin's wall showing round the edges. Undo, a faint stencil to follow if
// wanted, 75 seconds on the clock, and "Done!". Then Gus and Dr. Ingrid come round,
// lean in, have their say (src/game/carveScore.js does the judging: eyes, mouth, nose,
// symmetry, how much is cut, style; cut it in half and it caves in), Gus announces the
// ribbon through his megaphone and the street cheers.
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
import '../ui/carving.css';

const { N, CX, CY, RX, RY, CARVABLE, RIBBONS } = CS;
const PI = Math.PI;
const hyp = Math.hypot;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const TIME = 75; // seconds on the clock
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

// ---------------------------------------------------------------- the mini-game screen
class CarveGame {
  constructor(g) {
    this.g = g;
    this.mask = CS.emptyMask();
    this.undoStack = [];
    this.toolName = 'knife';
    this.stencil = null;
    this.left = TIME;
    this.flick = 0;
    this.night = false;
    this.dirty = true;
    this.split = false;
    this.finished = false;
    this.ptr = null;
    this.hover = null;
    this.last = null;
    this.cutT = 0;
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
      const tools = el('div', 'carve-tools');
      const B = (label, fn, o) => { const b = ui.button(label, fn, o); tools.appendChild(b); return b; };
      this.btn = {
        knife: B('Knife', () => this.tool('knife')),
        scoop: B('Scoop', () => this.tool('scoop')),
        undo: B('Undo', () => this.undo()),
        stencil: B('Stencil: off', () => this.cycleStencil()),
        done: B('Done!', () => this.finish('done'), { face: 'green' }),
      };
      main.append(this.board, tools);
      this.main = main;
      this.tools = tools;
      const hint = el('div', 'carve-hint', g.touch?.on || input.lastDevice === 'touch'
        ? 'Drag your finger on the pumpkin to carve. Cuts glow!'
        : 'Drag on the pumpkin to carve. [1] knife, [2] scoop, [Z] undo, [T] stencil.');
      body.append(top, main, hint);
      this.m = ui.openOverlay(p, { onBack: () => this.back(), items: Object.values(this.btn) });
      this.tool('knife');
      this.bindPointer();
      this.onKey = (e) => {
        if (this.finished) return;
        if (e.code === 'Digit1') this.tool('knife');
        else if (e.code === 'Digit2') this.tool('scoop');
        else if (e.code === 'KeyZ') this.undo();
        else if (e.code === 'KeyT') this.cycleStencil();
      };
      window.addEventListener('keydown', this.onKey);
      this.offScale = onScale(() => this.fit());
      this.onResize = () => this.fit();
      window.addEventListener('resize', this.onResize);
      this.fit();
      this.say('Carve away! Mind the clock.');
      this.sfx('squish', { volume: 0.4, pitch: 0.8 });
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

  // biggest crisp size that fits: a whole number of device pixels per art pixel
  fit() {
    const cv = this.cv;
    if (!cv?.isConnected) return;
    cv.style.width = cv.style.height = '64px';
    const pr = this.panel.getBoundingClientRect(), br = this.board.getBoundingClientRect();
    const mr = this.main.getBoundingClientRect(), tr = this.tools.getBoundingClientRect();
    // tools beside the board (landscape) or under it (portrait: the main row wraps to a column)
    const below = tr.top >= br.bottom - 1;
    const pad = br.height - 64;
    const availH = window.innerHeight - (pr.height - mr.height) - (below ? tr.height + 8 : 0) - pad - 48;
    const availW = window.innerWidth - (pr.width - mr.width) - (below ? 0 : tr.width + 12) - pad - 16;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor((Math.min(availH, availW) * dpr) / SIZE));
    const css = (SIZE * k) / dpr;
    cv.style.width = cv.style.height = `${css}px`;
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
    this.btn.knife.classList.toggle('on', name === 'knife');
    this.btn.scoop.classList.toggle('on', name === 'scoop');
    this.dirty = true;
  }
  cycleStencil() {
    const names = [null, ...CS.STENCIL_NAMES];
    this.stencil = names[(names.indexOf(this.stencil) + 1) % names.length];
    this.btn.stencil.querySelector('.k-lbl').textContent = `Stencil: ${this.stencil || 'off'}`;
    this.sfx('paper', { volume: 0.4 });
    this.dirty = true;
  }

  // ------------------------------------------------------------ carving
  bindPointer() {
    const cv = this.cv;
    const at = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (((e.clientX - r.left) / r.width) * SIZE - PAD) / CELL, y: (((e.clientY - r.top) / r.height) * SIZE - PAD) / CELL };
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.finished || this.ptr != null) return;
      this.ptr = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.undoStack.push(this.mask.slice());
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.changed = 0;
      this.last = at(e);
      this.stroke(this.last, this.last);
    });
    cv.addEventListener('pointermove', (e) => {
      const c = at(e);
      if (e.pointerId === this.ptr) {
        this.stroke(this.last, c);
        this.last = c;
      } else if (e.pointerType === 'mouse') {
        this.hover = c;
        this.dirty = true;
      }
    });
    const end = (e) => {
      if (e.pointerId !== this.ptr) return;
      this.ptr = null;
      this.endStroke();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.hover) { this.hover = null; this.dirty = true; }
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
    if (this.finished) return;
    const n = Math.max(1, Math.ceil(hyp(b.x - a.x, b.y - a.y) / 0.35));
    let fresh = 0;
    const cells = [];
    for (let s = 0; s <= n; s++) this.brush(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, cells);
    for (const k of cells) if (!this.mask[k]) { this.mask[k] = 1; fresh++; }
    if (!fresh) return;
    this.changed += fresh;
    this.dirty = true;
    const now = performance.now();
    if (now - this.cutT > (this.toolName === 'knife' ? 70 : 140)) {
      this.cutT = now;
      if (this.toolName === 'knife') this.sfx('carve_cut', { volume: 0.5, pitch: 0.9 + Math.random() * 0.3 });
      else this.sfx('squish', { volume: 0.35, pitch: 1.1 + Math.random() * 0.3 });
    }
  }
  endStroke() {
    if (!this.changed) { this.undoStack.pop(); return; }
    const fell = CS.dropLoose(this.mask);
    if (fell) {
      this.sfx('pumpkin_bonk', { volume: 0.35, pitch: 1.4 });
      this.say(fell > 12 ? 'Plop! A big bit fell in.' : 'Plop! A bit fell in.', 1600);
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
    if (!this.finished) {
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
      if (this.btn.undo.disabled !== noUndo) this.btn.undo.disabled = noUndo;
      if (this.left <= 0) this.finish('time');
    }
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.msgEl.classList.remove('on');
    // the candle flickers (a dozen times a second is plenty)
    if (now - (this.flickT || 0) > 85) {
      this.flickT = now;
      const f = Math.sin(now * 0.011) * 0.5 + Math.sin(now * 0.0237 + 1) * 0.35 + (Math.random() - 0.5) * 0.3;
      if (Math.abs(f - this.flick) > 0.2) { this.flick = f; this.dirty = true; }
    }
    if (this.anim) this.anim(dt);
    else if (this.dirty) this.draw();
  }
  back() {
    if (this.finished) return;
    if (!CS.countCarved(this.mask)) {
      // nothing cut yet: walk away, no harm done (the day's go isn't used up)
      this.finished = true;
      this.close();
      this.resolve(null);
      return;
    }
    this.finish('done');
  }
  finish(why) {
    if (this.finished) return;
    this.finished = true;
    this.ptr = null;
    this.hover = null;
    for (const b of Object.values(this.btn)) b.disabled = true;
    const frac = CS.countCarved(this.mask) / CS.CARVABLE_N;
    const collapse = CS.isSplit(this.mask) || frac > 0.5;
    let t = 0;
    const done = () => {
      this.anim = null;
      this.close();
      this.resolve({ mask: this.mask, timeUp: why === 'time' });
    };
    if (collapse) {
      // ...and it caves in
      this.say(why === 'time' ? "Time's up! ...Oh no." : 'Oh no...', 2400);
      this.sfx('tree_creak', { volume: 0.5, pitch: 1.4 });
      this.off = this.off || Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      this.draw(true);
      this.anim = (dt) => {
        t += dt;
        const k = Math.min(1, Math.max(0, (t - 0.5) / 0.35));
        if (t > 0.5 && !this.smashed) { this.smashed = true; this.sfx('pumpkin_smash', { volume: 0.7 }); this.shake(); }
        this.drawSquash(1 + k * 0.35, 1 - k * 0.52, t < 0.5 ? Math.sin(t * 40) * 1.2 : 0);
        if (t > 2.0) done();
      };
      return;
    }
    // lights out: the street goes dark and the face glows
    this.say(why === 'time' ? "Time's up! Lights out..." : 'Lights out...', 2000);
    this.sfx('lantern_whoomp', { volume: 0.6 });
    this.night = true;
    this.board.classList.add('lit');
    this.dirty = true;
    this.anim = (dt) => {
      t += dt;
      if (this.dirty) this.draw();
      if (t > 1.7) done();
    };
  }

  // ------------------------------------------------------------ drawing
  draw(pumpkinOnly = false) {
    this.dirty = false;
    const A = art(), D = this.px, m = this.mask, night = this.night;
    const skin = night ? SKIN_N : SKIN, wood = night ? WOOD_N : WOOD;
    const st = this.stencil ? CS.STENCILS[this.stencil] : null;
    let hov = null;
    if (this.hover && !this.finished) hov = new Set(this.brush(this.hover.x, this.hover.y, []));
    const flick = this.flick * 0.9 - (night ? 1.1 : 0);
    const candleX = CX, candleY = CY + 7.5;
    for (let py = 0; py < SIZE; py++) {
      const cj = Math.floor((py - PAD) / CELL), sy = py - PAD - cj * CELL;
      for (let px = 0; px < SIZE; px++) {
        const o = py * SIZE + px;
        const s = A.shade[o];
        if (s === 255) {
          const t = A.stem[o];
          D[o] = t !== 255 ? STEM[t] : pumpkinOnly ? 0 : wood[A.wood[o]];
          continue;
        }
        const ci = Math.floor((px - PAD) / CELL), sx = px - PAD - ci * CELL;
        const k = ci >= 0 && cj >= 0 && ci < N && cj < N ? cj * N + ci : -1;
        let c;
        if (k >= 0 && m[k]) {
          const up = m[k - N], dn = m[k + N], lf = m[k - 1], rt = m[k + 1];
          if (!up && sy < 2) c = sy === 0 ? FLESH[0] : FLESH[1];
          else if (!lf && sx === 0) c = FLESH[1];
          else if (!rt && sx === 3) c = FLESH[2];
          else if (!dn && sy === 3) c = FLESH[3];
          else {
            const gx = (px - PAD + 0.5) / CELL, gy = (py - PAD + 0.5) / CELL;
            if (Math.abs(gx - candleX) < 0.9 && gy > candleY + 1 && gy < candleY + 3.6) c = CANDLE[gx > candleX + 0.4 ? 1 : 0];
            else if (Math.abs(gx - candleX) < 0.4 + (gy - candleY + 0.6) * 0.25 && gy > candleY - 0.6 && gy <= candleY + 1) c = GLOW[0];
            else {
              const d = hyp(gx - candleX, (gy - candleY) * 1.2);
              const gi = Math.floor(d / 4 + flick + BAYER[(py & 3) * 4 + (px & 3)] * 0.8);
              c = GLOW[gi < 0 ? 0 : gi > 5 ? 5 : gi];
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
    if (pumpkinOnly) this.off.getContext('2d').putImageData(this.img, 0, 0);
    else this.ctx.putImageData(this.img, 0, 0);
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
  async start({ intro = true } = {}) {
    const g = this.g;
    if (this.busy) return;
    this.busy = true;
    try {
      if (intro && !this.st.flags.carveIntro) await this.intro();
      g.openMenu(() => {});
      g.ui.prompt(null);
      const out = await new CarveGame(g).open();
      if (!out) { g.resumeFromMenu(); return; }
      const res = CS.scoreCarving(out.mask);
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
    return { gus, ingrid, hank };
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
    box.appendChild(kRibbon(R.name, R.kit));
    box.appendChild(el('div', 'k-plate k-parchment carve-score', `${r.score} points`));
    g.ui.root.appendChild(box);
    g.wait(3.8).then(() => box.remove());
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
    if (mask && c.ribbon) {
      const rr = CM.prizeRosette({ color: (RIBBONS[c.ribbon] || RIBBONS.part).color });
      const rm = voxMesh(meshVox(rr.vox, { size: rr.size, origin: rr.origin }), sharedVoxelMaterial());
      rm.position.set(0.5, 0.005, 0.2);
      rm.rotation.y = 0.4;
      grp.add(rm);
    }
    this.g.scene.add(grp);
    if (T.light) T.light.on = !!mask && !c.collapsed;
  }
  update(dt, near) {
    if (near) this.sync();
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

