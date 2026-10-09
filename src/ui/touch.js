// On-screen controls for phones & tablets, drawn as chunky pixel-art wood and brass.
// Riding: the left thumb steers with a floating stick (put your thumb down anywhere on
// the left and slide; it has a dead zone, a gentle response curve and springs back to
// centre). Pull it down to lean back (wheelie / manual / backflip), push it up to lean
// forward (stoppie / nose / frontflip). On the right the thumb pedals by turning the
// crank (ui/crank.js: drag round the chainring; backwards is a coaster brake), with the
// brake, hop, the bell and one TRICK button round it: hold TRICK to drift (or strike a
// pose in the air) and slide your thumb off it to pick a direction from the little radial.
// On foot the stick walks (a gentle push ambles, half way walks briskly, all the way out
// jogs), with JUMP and a SPRINT button to hold for a flat-out run; a paper tag shows whatever
// Hank can do right here (talk, hop on, kick the pumpkin...): tap it.
//
// Buttons are hit-tested from every finger on the screen, and neighbouring buttons'
// hit circles overlap a little, so a thumb can roll from one onto the next without lifting.
// Every finger is tracked by its pointer id from the window, so lifting it anywhere lets
// go; and because a browser can lose a pointerup (a system gesture, the app going to the
// background), anything still held is let go as soon as no finger is on the glass, when
// a first finger lands, when the page loses focus or turns, and when a menu takes over.
import { input } from '../core/input.js';
import { el, scale, onScale } from './kit.js';
import { CrankHUD } from './crank.js';
import { field, paintBands, paintMetal, RAMP, C } from './kitart.js';
import { iconAt } from '../art/icons.js';
import { Pix } from '../art/pixel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toURL = (p) => {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c.toDataURL();
};

// ---------------------------------------------------------------- pixel art
const FACES = {
  green: RAMP.green, red: RAMP.red, gold: RAMP.gold, blue: RAMP.blue, cream: RAMP.cream,
  leather: RAMP.leather, purple: [0xd8b0ff, 0xa878e8, 0x7c4ab8, 0x52307e, 0x2e1a4a],
};
const WOOD = [0xd8a060, 0xb87a44, 0x9a5e30, 0x74421c, 0x4a2810];
// a round button: gold rim, domed coloured face, icon; pressed sinks 2px into its lip
function buttonArt(size, face, icon, pressed) {
  const S = size, H = size + 4;
  const p = new Pix(S, H);
  const R = FACES[face] || FACES.leather;
  const r = S / 2 - 0.5;
  const top = pressed ? 3 : 0;
  // lip (the button's side)
  const lip = (x, y) => Math.hypot(x + 0.5 - S / 2, y + 0.5 - (S / 2 + (pressed ? 3 : 4))) <= r;
  const faceM = (x, y) => Math.hypot(x + 0.5 - S / 2, y + 0.5 - (S / 2 + top)) <= r;
  const fl = field(S, H, lip, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) if (fl.D[y * S + x] && !faceM(x, y)) p.set(x, y, fl.D[y * S + x] < 1.5 ? C.ink : C.goldDD);
  const f = field(S, H, faceM, 6);
  const cx = S / 2, cy = S / 2 + top;
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.45 ? C.goldHi : l > -0.2 ? C.goldL : C.goldD),
    (l) => (l > 0.2 ? C.goldD : C.gold),
    () => C.ink,
    (l, x, y) => {
      // domed face: lit from the top left
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = -dx * 0.6 - dy * 0.75;
      const k = pressed ? d - 0.35 : d;
      return R[k > 0.55 ? 0 : k > 0.1 ? 1 : k > -0.45 ? 2 : 3];
    },
  ]);
  if (icon) {
    const ic = iconAt(icon, Math.round(S * 0.62 / 2) * 2);
    p.blit(ic, Math.round((S - ic.w) / 2), Math.round((S - ic.h) / 2) + top);
  }
  return p;
}

// the riding stick's base: a turned wooden plate in a brass ring, a brass slot for steering,
// carved arrows top (lean forward) and bottom (lean back), four brass nails (72x72)
function plateArt(lit = 0) {
  const S = 72, c = 36;
  const p = new Pix(S, S);
  const f = field(S, S, (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= 35.5, 7);
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.4 ? C.goldHi : l > -0.2 ? C.goldL : C.goldD),
    (l) => (l > 0.1 ? C.gold : C.goldD),
    () => C.goldDD,
    () => C.ink,
    (l, x, y) => {
      // turned wood: rings round the centre, a soft bowl shading, grain flecks
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const ring = Math.sin(d * 1.3 + Math.sin(Math.atan2(y - c, x - c) * 3) * 0.6);
      const bowl = ((x - c) * 0.5 + (y - c) * 0.7) / 30; // dished: dark top left, lit bottom right
      const k = bowl + ring * 0.18 + (((x * 7 + y * 13) % 17) === 0 ? -0.25 : 0);
      return WOOD[k > 0.45 ? 0 : k > 0.05 ? 1 : k > -0.35 ? 2 : 3];
    },
  ]);
  // the steering slot: a dark groove with a brass lip
  for (let x = 13; x <= 58; x++) {
    p.set(x, 33, C.goldD);
    p.set(x, 34, C.ink);
    p.set(x, 35, WOOD[4]);
    p.set(x, 36, WOOD[4]);
    p.set(x, 37, WOOD[3]);
    p.set(x, 38, C.goldL);
  }
  for (const x of [12, 59]) for (let y = 33; y <= 38; y++) p.set(x, y, C.ink);
  // carved arrows: up = lean forward, down = lean back (lit while leaning)
  const arrow = (cy, dir, on) => {
    for (let k = 0; k < 6; k++) {
      const y = cy + dir * k;
      for (let x = c - 6 + k; x <= c + 5 - k; x++) p.set(x, y, on ? (k < 2 ? C.goldHi : C.goldL) : k < 2 ? WOOD[4] : WOOD[3]);
      p.set(c - 7 + k, y, C.ink);
      p.set(c + 6 - k, y, C.ink);
    }
  };
  arrow(13, 1, lit < 0);
  arrow(58, -1, lit > 0);
  for (const [x, y] of [[13, 13], [58, 13], [13, 58], [58, 58]]) {
    p.rect(x - 1, y - 1, 3, 3, C.ink);
    p.set(x, y, C.goldL);
    p.set(x - 1, y - 1, C.goldHi);
  }
  return p;
}
// the walking stick's base: a dark ring with four gold studs
function stickArt() {
  const S = 72, p = new Pix(S, S);
  const f = field(S, S, (x, y) => { const d = Math.hypot(x + 0.5 - 36, y + 0.5 - 36); return d <= 34 && d >= 22; }, 4);
  paintBands(p, f, [() => C.ink, (l) => (l > 0.3 ? 0x6a4a36 : 0x3a2418), () => 0x2a1810]);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; p.rect(Math.round(36 + Math.cos(a) * 28) - 1, Math.round(36 + Math.sin(a) * 28) - 1, 3, 3, C.goldL); }
  return p;
}
// the thumb knob: a brass dome with a leather cap
function knobArt() {
  const p = new Pix(28, 28);
  paintMetal(p, 28, 28, (x, y) => Math.hypot(x + 0.5 - 14, y + 0.5 - 14) <= 13.5, RAMP.gold);
  const cap = field(28, 28, (x, y) => Math.hypot(x + 0.5 - 14, y + 0.5 - 14) <= 7.5, 3);
  paintBands(p, cap, [() => C.goldDD, (l) => (l > 0.2 ? RAMP.leather[1] : RAMP.leather[2]), () => RAMP.leather[2]]);
  for (const [x, y] of [[8, 7], [9, 6], [7, 8]]) p.set(x, y, 0xffffff);
  return p;
}

// [id, label, action, icon, face, size, right, bottom, mode]
// (riding, the crank sits in the bottom right corner: 88 x 68, its chainring ~32 in from the right)
const BUTTONS = [
  ['brake', 'BRAKE', 'brake', 't_brake', 'red', 42, 96, 8, 'ride'],
  ['jump', 'HOP', 'jump', 't_hop', 'blue', 44, 12, 90, 'ride'],
  ['trick', 'TRICK', 'drift', 't_trick', 'purple', 38, 66, 76, 'ride'],
  ['bell', '', 'bell', 't_bell', 'cream', 26, 8, 146, 'ride'],
  ['fjump', 'JUMP', 'jump', 't_hop', 'blue', 50, 12, 18, 'foot'],
  ['sprint', 'SPRINT', 'sprint', 't_run', 'gold', 44, 68, 18, 'foot'],
  ['photo', 'SNAP', 'camera', 't_photo', 'cream', 32, 74, 84, 'foot'],
];
const DEAD = 0.08; // riding stick dead zone (fraction of its throw)
const KNOB = 22; // how far (art pixels) the walking knob travels before it sits on the ring
const WALK_DEAD = 0.1; // walking stick dead zone (round, a fraction of the knob's throw)
const WALK_FULL = 0.94; // ...and where the push counts as all the way out (a jog)
const LEAN_AT = 0.55; // how far up / down the stick goes before Hank leans
const PETAL_AT = 12; // art pixels the thumb slides off TRICK to pick a direction

const CSS = `
#touch { --tc-lift: 0; }
.k-portrait #touch { --tc-lift: 22; }
#touch { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
#touch .tc-zone { position: absolute; left: 0; bottom: 0; width: 46%; height: 72%; pointer-events: auto; touch-action: none; }
.k-portrait #touch .tc-zone { width: 52%; height: 48%; }
#touch .tc-stick { position: absolute; left: calc(var(--u) * 6 + var(--safe-l)); bottom: calc(var(--u) * 6 + var(--safe-b)); width: calc(var(--u) * 72); height: calc(var(--u) * 72); pointer-events: none; opacity: 0.92; }
#touch .tc-stick.held { opacity: 1; }
#touch .tc-stick img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
#touch .tc-stick .knob { left: calc(var(--u) * 22); top: calc(var(--u) * 22); width: calc(var(--u) * 28); height: calc(var(--u) * 28); }
#touch .tc-stick .walk { display: none; }
#touch.foot .tc-stick .walk { display: block; }
#touch.foot .tc-stick .plate { display: none; }
#touch .tc-radial { position: absolute; pointer-events: none; display: none; }
#touch .tc-radial.on { display: block; }
#touch .tc-pet { position: absolute; white-space: nowrap; padding: 0 calc(var(--u) * 3); height: calc(var(--u) * 14); display: flex; align-items: center; color: var(--k-cream2, #e8d8b0); opacity: 0.85; }
#touch .tc-pet.sel { color: var(--k-gold, #ffdc52); opacity: 1; }
#touch .tc-pet.off { display: none; }
#touch .t-trick.down .tl { visibility: hidden; }
`;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.root = el('div');
    this.root.id = 'touch';
    this.root.className = 'k-text';
    document.getElementById('ui').appendChild(this.root);
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.art = null;

    // ---- the floating stick (left): the zone catches the thumb, the plate jumps under it
    this.zone = el('div', 'tc-zone');
    this.root.appendChild(this.zone);
    this.stick = el('div', 'tc-stick', '<img class="plate"><img class="walk"><img class="knob">');
    this.plateImg = this.stick.querySelector('.plate');
    this.walkImg = this.stick.querySelector('.walk');
    this.knob = this.stick.querySelector('.knob');
    this.root.appendChild(this.stick);
    this.stickId = null;
    this.zone.addEventListener('pointerdown', (e) => {
      // a first finger on the glass: anything we still think is held is long gone
      if (e.pointerType === 'touch' && e.isPrimary) this.releaseAll();
      // a second finger never steals (or freezes) the stick
      if (this.stickId != null) return;
      e.stopPropagation();
      e.preventDefault();
      this.stickId = e.pointerId;
      try { this.zone.setPointerCapture(e.pointerId); } catch { /* synthetic or already gone */ }
      const r = this.stick.getBoundingClientRect();
      // centre on the thumb (unless it landed on the plate already), kept on screen
      const rest = this.restRect || (this.restRect = { x: r.left + r.width / 2 - (this.shift?.x || 0), y: r.top + r.height / 2 - (this.shift?.y || 0), rad: r.width / 2 });
      const onPlate = Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < rest.rad * 0.9;
      const R = rest.rad;
      const cx = onPlate ? rest.x : clamp(e.clientX, R, window.innerWidth - R);
      const cy = onPlate ? rest.y : clamp(e.clientY, R, window.innerHeight - R);
      this.centre = { x: cx, y: cy, R };
      this.shift = { x: cx - rest.x, y: cy - rest.y };
      const u = scale.u;
      this.stick.style.transform = `translate(${Math.round(this.shift.x / u) * u}px, ${Math.round(this.shift.y / u) * u}px)`;
      this.stick.classList.add('held');
      this.moveStick(e);
    });
    // followed from the window by its pointer id, so it doesn't matter where the finger goes
    // (or whether the browser kept the capture)
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      // slid right off the edge of the screen: that's a let-go
      if (e.clientX < -2 || e.clientY < -2 || e.clientX > window.innerWidth + 2 || e.clientY > window.innerHeight + 2) this.endStick();
      else this.moveStick(e);
    }, { passive: true });
    const end = (e) => e.pointerId === this.stickId && this.endStick();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // ---- buttons
    this.buttons = {};
    for (const [id, label, action, icon, face, size, right, bottom, mode] of BUTTONS) {
      const b = el('div', `tbtn t-${id} m-${mode}`, `<img class="ti">${label ? `<span class="tl">${label}</span>` : ''}`);
      b.dataset.size = size;
      b.style.setProperty('--sz', size);
      b.style.right = `calc(var(--u) * ${right} + var(--safe-r))`;
      b.style.bottom = `calc(var(--u) * (${bottom} + var(--tc-lift)) + var(--safe-b))`;
      this.root.appendChild(b);
      this.buttons[id] = { el: b, action, icon, face, size, mode, img: b.querySelector('.ti'), held: false };
    }
    // the trick radial: four little plates round the TRICK button
    this.radial = el('div', 'tc-radial');
    this.petals = {};
    for (const d of ['up', 'down', 'left', 'right', 'mid']) {
      const pt = el('div', `k-plate k-dark tc-pet tc-${d}`);
      this.radial.appendChild(pt);
      this.petals[d] = pt;
    }
    this.root.appendChild(this.radial);
    this.trickPtr = null;
    this.trickDir = null;
    this.trickT = 0;
    // context action: a plate that says what it'll do
    this.talk = el('div', 'k-plate k-dark t-talk', '<span class="k-key">E</span><span class="tt"></span>');
    this.talkText = this.talk.querySelector('.tt');
    this.root.appendChild(this.talk);
    this.buttons.talk = { el: this.talk, action: 'interact', held: false, plate: true };
    // journal & map either side of the compass
    for (const [id, action, icon] of [['pause', 'pause', 't_journal'], ['map', 'map', 't_map']]) {
      const b = el('div', `tbtn tsq t-${id}`, '<img class="ti">');
      this.root.appendChild(b);
      this.buttons[id] = { el: b, action, icon, face: 'leather', size: 28, mode: 'any', img: b.querySelector('.ti'), held: false };
    }

    // every finger is hit-tested against every visible button
    this.pointers = new Map();
    const track = (e) => {
      if (e.pointerType === 'mouse' && e.buttons === 0 && e.type === 'pointermove') return;
      if (e.type === 'pointerdown' && e.pointerType === 'touch' && e.isPrimary) this.releaseAll();
      if (e.pointerId === this.stickId) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.updateHeld();
      e.preventDefault();
    };
    const drop = (e) => {
      this.pointers.delete(e.pointerId);
      this.updateHeld();
    };
    // fingers start on a button, then are followed anywhere on the page (so lifting off
    // to the side, or sliding onto the next button, always registers)
    this.root.addEventListener('pointerdown', track);
    window.addEventListener('pointermove', (e) => this.pointers.has(e.pointerId) && track(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.pointers.has(e.pointerId) && drop(e));
    window.addEventListener('pointercancel', (e) => this.pointers.has(e.pointerId) && drop(e));

    // ---- the camera: one finger dragged on the open picture orbits, two pinch to zoom
    this.camPtrs = new Map();
    const openScreen = (t) => t instanceof HTMLCanvasElement || t?.id === 'stage' || t?.id === 'ui' || t === document.body;
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.root.classList.contains('on') || !openScreen(e.target)) return;
      if (e.pointerType === 'touch' && e.isPrimary) this.releaseAll();
      if (this.camPtrs.size >= 2) return;
      this.camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = null;
    });
    window.addEventListener('pointermove', (e) => {
      const p = this.camPtrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.camPtrs.size === 1) {
        // screen size independent: a thumb sweep across a third of the width is ~ a quarter turn
        const k = 900 / Math.max(320, Math.min(window.innerWidth, window.innerHeight * 2));
        input.mouse.dx += dx * 0.45 * k;
        input.mouse.dy += dy * 0.3 * k;
      } else {
        const [a, b] = [...this.camPtrs.values()];
        const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
        if (this.pinch) input.zoomLog -= Math.log(d / this.pinch);
        this.pinch = d;
      }
    }, { passive: true });
    const camEnd = (e) => { if (this.camPtrs.delete(e.pointerId)) this.pinch = null; };
    window.addEventListener('pointerup', camEnd);
    window.addEventListener('pointercancel', camEnd);

    // the crank (bottom right while riding, on every device)
    this.crank = new CrankHUD(game);

    // turning the phone or resizing moves everything: let go and measure again (a browser bar
    // sliding in and out only re-measures)
    this.size = { w: window.innerWidth, h: window.innerHeight };
    const relayout = () => {
      this.rects = null;
      this.restRect = null;
      const w = window.innerWidth, h = window.innerHeight, S = this.size;
      if (Math.abs(w - S.w) > 40 || Math.abs(h - S.h) > 90 || (w > h) !== (S.w > S.h)) this.releaseAll();
      S.w = w;
      S.h = h;
    };
    onScale(relayout);
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => { relayout(); this.releaseAll(); });
    // safety nets for a lost pointerup: no fingers left on the glass, or the page went away
    const noTouches = (e) => e.touches.length === 0 && this.releaseAll();
    window.addEventListener('touchend', noTouches, { passive: true });
    window.addEventListener('touchcancel', noTouches, { passive: true });
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('pagehide', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll());
    window.addEventListener('touchstart', () => this.enable(true), { passive: true });
    window.addEventListener('keydown', () => this.enable(false));
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable(true);
  }

  // ---------------------------------------------------------------- the stick
  moveStick(e) {
    const C0 = this.centre;
    if (!C0) return;
    let dx = (e.clientX - C0.x) / C0.R, dy = (e.clientY - C0.y) / C0.R;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const u = scale.u;
    const T = input.touch;
    if (this.game.onFoot) {
      // a free stick for walking. The knob follows the thumb one to one out to its stop on the
      // ring (KNOB art pixels) and the push is measured against that same throw, so what you
      // see is what you get: about half way walks briskly, the knob against the ring jogs
      // (walker.js), a round dead zone in the middle. Sprinting is the SPRINT button.
      let wx = (e.clientX - C0.x) / (KNOB * u), wy = (e.clientY - C0.y) / (KNOB * u);
      const m = Math.hypot(wx, wy);
      if (m > 1) { wx /= m; wy /= m; }
      this.knob.style.transform = `translate(${Math.round(wx * KNOB) * u}px, ${Math.round(wy * KNOB) * u}px)`;
      const k = m < WALK_DEAD ? 0 : Math.min(1, (m - WALK_DEAD) / (WALK_FULL - WALK_DEAD)) / Math.min(1, m);
      T.walkX = wx * k;
      T.walkY = -wy * k;
      T.steer = T.walkX;
      T.leanBack = T.leanFwd = 0;
      return;
    }
    T.walkX = T.walkY = 0;
    // riding: the knob rides in the slot sideways, and dips toward the arrows when leaning.
    // A dead zone, then a gentle curve: small slides for small corrections, full lock at the rim
    const ax = Math.abs(dx);
    const s = ax < DEAD ? 0 : Math.pow((ax - DEAD) / (1 - DEAD), 1.3);
    T.steer = Math.sign(dx) * s;
    T.leanBack = dy > LEAN_AT ? clamp((dy - LEAN_AT) / 0.3, 0.4, 1) : 0;
    T.leanFwd = dy < -LEAN_AT ? clamp((-dy - LEAN_AT) / 0.3, 0.4, 1) : 0;
    const ky = T.leanBack || T.leanFwd ? dy * 22 : dy * 6;
    this.knob.style.transform = `translate(${Math.round(dx * 24) * u}px, ${Math.round(ky) * u}px)`;
    this.setPlate(T.leanBack ? 1 : T.leanFwd ? -1 : 0);
  }
  endStick() {
    const id = this.stickId;
    this.stickId = null;
    try { if (id != null && this.zone.hasPointerCapture?.(id)) this.zone.releasePointerCapture(id); } catch { /* gone */ }
    this.centre = null;
    const T = input.touch;
    T.steer = 0;
    T.walkX = T.walkY = 0;
    T.leanBack = T.leanFwd = 0;
    this.knob.style.transform = '';
    this.stick.style.transform = '';
    this.shift = null;
    this.stick.classList.remove('held');
    this.setPlate(0);
  }
  setPlate(lit) {
    if (!this.art || lit === this.plateLit) return;
    this.plateLit = lit;
    this.plateImg.src = this.art.plate[lit + 1];
  }

  // short buzzes on bumps and crashes (phones that can)
  buzz(pattern) {
    if (!this.on || this.game.settings?.haptics === false) return;
    try { navigator.vibrate?.(pattern); } catch { /* not allowed yet */ }
  }

  // let go of everything: the stick, every button, the trick, the camera drag, the crank
  releaseAll() {
    if (this.stickId != null) this.endStick();
    const T = input.touch;
    T.steer = T.walkX = T.walkY = 0;
    T.leanBack = T.leanFwd = 0;
    T.brake = 0;
    T.radSteer = T.radUp = T.radDown = 0;
    if (this.pointers?.size) this.pointers.clear();
    this.camPtrs?.clear();
    this.pinch = null;
    if (this.buttons) this.updateHeld();
    this.crank?.letGo();
  }

  // build the button and stick images once (cheap: a few dozen small canvases)
  paint() {
    if (this.art) return;
    this.art = { plate: [toURL(plateArt(-1)), toURL(plateArt(0)), toURL(plateArt(1))] };
    for (const b of Object.values(this.buttons)) {
      if (b.plate) continue;
      b.up = toURL(buttonArt(b.size, b.face, b.icon, false));
      b.down = toURL(buttonArt(b.size, b.face, b.icon, true));
      b.img.src = b.up;
    }
    this.walkImg.src = toURL(stickArt());
    this.knob.src = toURL(knobArt());
    this.plateLit = null;
    this.setPlate(0);
  }

  // ---------------------------------------------------------------- buttons
  updateHeld() {
    if (!this.rects) {
      this.rects = [];
      for (const [id, b] of Object.entries(this.buttons)) {
        const r = b.el.getBoundingClientRect();
        if (!r.width) continue;
        this.rects.push({ id, b, cx: r.left + r.width / 2, cy: r.top + (b.plate ? r.height / 2 : r.width / 2), rad: b.plate ? 0 : (r.width / 2) * 1.16, r });
      }
    }
    const held = new Set();
    for (const [pid, p] of this.pointers) {
      // the finger holding TRICK stays on it while it slides out to pick a direction
      if (pid === this.trickPtr) { held.add('trick'); continue; }
      for (const R of this.rects) {
        if (!R.b.el.offsetParent) continue;
        const hit = R.b.plate ? p.x >= R.r.left && p.x <= R.r.right && p.y >= R.r.top && p.y <= R.r.bottom : Math.hypot(p.x - R.cx, p.y - R.cy) <= R.rad;
        if (hit) {
          held.add(R.id);
          if (R.id === 'trick' && this.trickPtr == null) this.trickPtr = pid;
        }
      }
    }
    if (this.trickPtr != null && !this.pointers.has(this.trickPtr)) this.trickPtr = null;
    for (const [id, b] of Object.entries(this.buttons)) {
      const on = held.has(id);
      if (on === b.held) continue;
      b.held = on;
      b.el.classList.toggle('down', on);
      if (on) this.buzz(8);
      if (b.img && b.up) b.img.src = on ? b.down : b.up;
      if (b.action === 'brake') input.touch.brake = on ? 1 : 0;
      else if (b.action === 'drift') this.trickHeld(on);
      else if (on) {
        input.touch.buttons.add(b.action);
        input.tapAction(b.action);
      } else input.touch.buttons.delete(b.action);
    }
    this.updateTrick();
  }

  // TRICK: drift at once on the ground; in the air wait until the thumb picks a direction
  // (or a moment passes) so the pose comes from where it slid to
  trickHeld(on) {
    this.trickT = 0;
    this.trickDir = null;
    this.radial.classList.toggle('on', on);
    if (on) {
      const r = this.buttons.trick.el.getBoundingClientRect();
      this.trickC = { x: r.left + r.width / 2, y: r.top + r.width / 2 };
      const ro = this.root.getBoundingClientRect();
      // whole device pixels throughout (a half-pixel offset blurs the pixel art)
      const dpr = devicePixelRatio || 1, snap = (v) => Math.round(v * dpr) / dpr;
      this.radial.style.left = `${snap(this.trickC.x - ro.left)}px`;
      this.radial.style.top = `${snap(this.trickC.y - ro.top)}px`;
      const u = scale.u, D = 30 * u;
      for (const [d, x, y] of [['up', 0, -D], ['down', 0, D], ['left', -D * 1.25, 0], ['right', D * 1.25, 0]]) {
        const P = this.petals[d];
        // centred on its spot by its own size (not a -50% transform)
        P.style.left = `${snap(x - P.offsetWidth / 2)}px`;
        P.style.top = `${snap(y - P.offsetHeight / 2)}px`;
      }
      this.petals.mid.style.display = 'none';
    } else {
      this.trickPtr = null;
      this.setTrick(false);
    }
  }
  updateTrick() {
    const T = input.touch;
    T.radSteer = T.radUp = T.radDown = 0;
    if (this.trickPtr == null || !this.trickC) return;
    const p = this.pointers.get(this.trickPtr);
    if (!p) return;
    const u = scale.u;
    const dx = (p.x - this.trickC.x) / u, dy = (p.y - this.trickC.y) / u;
    let dir = null;
    if (Math.hypot(dx, dy) > PETAL_AT) dir = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : dx < 0 ? 'left' : 'right';
    this.trickDir = dir;
    const air = !this.game.bike?.grounded;
    // on the ground up/down lean (stoppie / wheelie while drifting off); in the air they pick poses
    if (air) {
      if (dir === 'up') T.radUp = 1;
      if (dir === 'down') T.radDown = 1;
      if (dir === 'left') T.radSteer = -1;
      if (dir === 'right') T.radSteer = 1;
    }
    T.leanFwd = !air && dir === 'up' ? 1 : this.stickId == null ? 0 : T.leanFwd;
    T.leanBack = !air && dir === 'down' ? 1 : this.stickId == null ? 0 : T.leanBack;
    for (const d of ['up', 'down', 'left', 'right']) this.petals[d].classList.toggle('sel', d === dir);
  }
  setTrick(on) {
    const T = input.touch;
    if (on === T.trick) return;
    T.trick = on;
    if (on) input.touch.buttons.add('drift');
    else {
      input.touch.buttons.delete('drift');
      T.radSteer = T.radUp = T.radDown = 0;
      if (this.stickId == null) T.leanBack = T.leanFwd = 0;
    }
  }

  enable(on) {
    if (on === this.on) return;
    this.on = on;
    document.getElementById('ui').classList.toggle('touchmode', on);
    if (on) { input.lastDevice = 'touch'; this.paint(); }
    this.rects = null;
    this.restRect = null;
  }

  update(dt = 1 / 60) {
    const g = this.game;
    this.crank.update(dt);
    // (menus, talks and cutscenes hide the controls, and let go of everything as they open)
    const show = this.on && g.mode === 'ride' && !g.ui.dialogueTick && !g.ui.menuStack.length;
    if (this.root.classList.contains('on') !== show) {
      this.root.classList.toggle('on', show);
      this.rects = null;
      this.restRect = null;
      this.releaseAll();
    }
    if (!show) return;
    const foot = !!g.onFoot;
    if (this.root.classList.contains('foot') !== foot) {
      this.root.classList.toggle('foot', foot);
      this.rects = null;
      if (this.stickId != null) this.endStick();
      if (foot) this.trickHeld(false);
    }
    // trick: the radial's labels follow what the move would be right now
    if (this.trickPtr != null) {
      this.trickT += dt;
      const air = !g.bike.grounded;
      this.setTrick(!air || this.trickDir != null || this.trickT > 0.22);
      const L = air ? { up: 'SUPERMAN', down: 'NO HANDER', left: 'CAN-CAN', right: "NOTHIN'" } : { up: 'STOPPIE', down: 'WHEELIE', left: '', right: '' };
      for (const [d, t] of Object.entries(L)) {
        if (this.petals[d].textContent !== t) this.petals[d].textContent = t;
        this.petals[d].classList.toggle('off', !t);
      }
      this.updateTrick();
    }
    const p = g.ui.prompted;
    if (this.talk.classList.contains('lit') !== !!p) { this.talk.classList.toggle('lit', !!p); this.rects = null; }
    if (this.talkText.textContent !== (p || '')) { this.talkText.textContent = p || ''; this.rects = null; }
    const cam = !!g.state?.hasCamera;
    if (this.buttons.photo.el.classList.contains('off') === cam) { this.buttons.photo.el.classList.toggle('off', !cam); this.rects = null; }
  }
}
