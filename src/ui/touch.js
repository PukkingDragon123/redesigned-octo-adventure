// On-screen controls for phones & tablets, drawn as chunky pixel-art buttons.
// Riding: a wooden steering wheel on the left (drag it round, it springs back);
// pedal, brake, hop, drift and the two lean hold-buttons (wheelie / stoppie) on
// the right. On foot the wheel becomes a stick and the buttons become jump /
// kick / snap. A paper tag shows whatever Hank can do right now; tap it.
//
// Buttons are hit-tested from every finger on the screen, and neighbouring
// buttons' hit circles overlap a little, so a thumb can roll from PEDAL onto
// LEAN BACK (or sit between them and press both) without lifting.
import { input } from '../core/input.js';
import { el, scale, onScale } from './kit.js';
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
// the steering wheel at an angle: rim, red grip, three spokes and a skull hub (72x72)
function wheelArt(ang) {
  const S = 72, cx = 36, cy = 36;
  const p = new Pix(S, S);
  const wood = RAMP.wood.map((c, i) => [0xd8a060, 0xb87a44, 0x9a5e30, 0x74421c, 0x4a2810][i]);
  const L = [-0.55, -0.83];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > 34 || d < 25) continue;
    const t = ((d - 25) / 9) * 2 - 1;
    const a = Math.atan2(dy, dx) - ang;
    const lit = (dx / d) * t * L[0] + (dy / d) * t * L[1] + Math.sqrt(Math.max(0, 1 - t * t)) * 0.45;
    let w = Math.atan2(Math.sin(a), Math.cos(a));
    const grip = w > -2.15 && w < -0.99;
    const R = grip ? RAMP.red : wood;
    let c = R[lit > 0.62 ? 0 : lit > 0.28 ? 1 : lit > -0.15 ? 2 : lit > -0.5 ? 3 : 4];
    // leather wrap stitches on the grip, wood grain elsewhere
    if (grip && Math.round((w + 3) * 9) % 2 === 0 && Math.abs(t) < 0.5) c = R[3];
    if (!grip && Math.round((w + 3) * 14) % 7 === 0 && t > -0.2) c = wood[3];
    p.set(x, y, c);
  }
  // spokes
  for (const s of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
    const a = s + ang;
    for (let r = 9; r < 26; r += 0.5) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const nx = -Math.sin(a), ny = Math.cos(a);
      for (let k = -2; k <= 2; k++) {
        const px = Math.floor(x + nx * k * 0.9), py = Math.floor(y + ny * k * 0.9);
        p.set(px, py, k <= -1 ? 0xb8b8c4 : k >= 2 ? 0x5a5a66 : 0x8a8a98);
      }
    }
  }
  // skull hub
  paintMetal(p, S, S, (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= 10.5, RAMP.cream);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const T = (x, y) => [Math.round(cx + x * ca - y * sa), Math.round(cy + x * sa + y * ca)];
  for (const [x, y] of [[-4, -2], [-3, -2], [-4, -1], [-3, -1], [-5, -1], [3, -2], [4, -2], [3, -1], [4, -1], [5, -1], [-1, 2], [0, 2], [-3, 5], [-1, 5], [1, 5], [3, 5], [-3, 4], [3, 4]]) { const [a, b] = T(x, y); p.set(a, b, C.ink); }
  for (const [x, y] of [[-4, -2], [4, -2]]) { const [a, b] = T(x, y); p.set(a, b, 0xffd84a); }
  p.outline(C.ink);
  return p;
}
const WHEEL_STEPS = 21, WHEEL_MAX = 2.1;
// the walking stick: a dark ring and a gold knob
function stickArt() {
  const S = 72, p = new Pix(S, S);
  const f = field(S, S, (x, y) => { const d = Math.hypot(x + 0.5 - 36, y + 0.5 - 36); return d <= 34 && d >= 22; }, 4);
  paintBands(p, f, [() => C.ink, (l) => (l > 0.3 ? 0x6a4a36 : 0x3a2418), () => 0x2a1810]);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; p.rect(Math.round(36 + Math.cos(a) * 28) - 1, Math.round(36 + Math.sin(a) * 28) - 1, 3, 3, C.goldL); }
  return p;
}
function knobArt() {
  const p = new Pix(26, 26);
  paintMetal(p, 26, 26, (x, y) => Math.hypot(x + 0.5 - 13, y + 0.5 - 13) <= 12.5, RAMP.gold);
  for (const [x, y] of [[8, 7], [9, 6], [7, 8]]) p.set(x, y, 0xffffff);
  return p;
}

// [id, label, action, icon, face, size, right, bottom, mode]
const BUTTONS = [
  ['pedal', 'PEDAL', 'pedal', 't_pedal', 'green', 48, 8, 16, 'ride'],
  ['brake', 'BRAKE', 'brake', 't_brake', 'red', 40, 62, 14, 'ride'],
  ['back', 'WHEELIE', 'leanBack', 't_back', 'gold', 36, 14, 78, 'ride'],
  ['fwd', 'STOPPIE', 'leanFwd', 't_fwd', 'gold', 36, 64, 70, 'ride'],
  ['jump', 'HOP', 'jump', 't_hop', 'blue', 40, 112, 24, 'ride'],
  ['trick', 'DRIFT', 'drift', 't_trick', 'purple', 36, 112, 80, 'ride'],
  ['bell', '', 'bell', 't_bell', 'cream', 28, 8, 128, 'ride'],
  ['fjump', 'JUMP', 'jump', 't_hop', 'blue', 46, 10, 18, 'foot'],
  ['kick', 'KICK', 'boost', 't_kick', 'red', 40, 66, 16, 'foot'],
  ['photo', 'SNAP', 'camera', 't_photo', 'cream', 36, 22, 80, 'foot'],
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.root = el('div');
    this.root.id = 'touch';
    this.root.className = 'k-text';
    document.getElementById('ui').appendChild(this.root);
    this.wheelAngle = 0;
    this.art = null;

    // ---- the steering wheel / walking stick (left)
    this.wheel = el('div', 'twheel', '<img class="wimg"><img class="stick"><img class="knob">');
    this.wheelImg = this.wheel.querySelector('.wimg');
    this.stickImg = this.wheel.querySelector('.stick');
    this.knob = this.wheel.querySelector('.knob');
    this.root.appendChild(this.wheel);
    let wid = null, a0 = 0, base = 0;
    const angleOf = (e) => {
      const r = this.wheel.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    const moveWheel = (e) => {
      const r = this.wheel.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      if (this.game.onFoot) {
        // a free stick for walking; the knob moves in whole art pixels
        const len = Math.hypot(dx, dy);
        const k = len > 1 ? 1 / len : 1;
        const u = scale.u;
        this.knob.style.transform = `translate(${Math.round(dx * k * 22) * u}px, ${Math.round(dy * k * 22) * u}px)`;
        input.touch.steer = clamp(dx * 1.3, -1, 1);
        input.touch.stickThrottle = clamp(-dy * 1.3, 0, 1);
        input.touch.stickBrake = clamp(dy * 1.3, 0, 1);
        input.touch.run = len > 0.85;
        return;
      }
      // turn the wheel: angular drag
      let da = angleOf(e) - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.wheelAngle = clamp(base + da, -WHEEL_MAX, WHEEL_MAX);
      input.touch.steer = clamp(this.wheelAngle / 1.6, -1, 1);
    };
    const endWheel = () => {
      wid = null;
      input.touch.steer = 0;
      input.touch.stickThrottle = input.touch.stickBrake = 0;
      input.touch.run = false;
      this.knob.style.transform = '';
      this.wheel.classList.remove('held');
    };
    this.wheel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      wid = e.pointerId;
      this.wheel.setPointerCapture(e.pointerId);
      a0 = angleOf(e);
      base = this.wheelAngle;
      this.wheel.classList.add('held');
      moveWheel(e);
      e.preventDefault();
    });
    this.wheel.addEventListener('pointermove', (e) => e.pointerId === wid && moveWheel(e));
    this.wheel.addEventListener('pointerup', endWheel);
    this.wheel.addEventListener('pointercancel', endWheel);

    // ---- buttons
    this.buttons = {};
    for (const [id, label, action, icon, face, size, right, bottom, mode] of BUTTONS) {
      const b = el('div', `tbtn t-${id} m-${mode}`, `<img class="ti">${label ? `<span class="tl">${label}</span>` : ''}`);
      b.dataset.size = size;
      b.style.setProperty('--sz', size);
      b.style.right = `calc(var(--u) * ${right} + var(--safe-r))`;
      b.style.bottom = `calc(var(--u) * ${bottom} + var(--safe-b))`;
      this.root.appendChild(b);
      this.buttons[id] = { el: b, action, icon, face, size, mode, img: b.querySelector('.ti'), held: false };
    }
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
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.updateHeld();
      e.preventDefault();
    };
    const drop = (e) => {
      this.pointers.delete(e.pointerId);
      this.updateHeld();
    };
    this.root.addEventListener('pointerdown', (e) => { this.root.setPointerCapture?.(e.pointerId); track(e); });
    this.root.addEventListener('pointermove', (e) => this.pointers.has(e.pointerId) && track(e));
    this.root.addEventListener('pointerup', drop);
    this.root.addEventListener('pointercancel', drop);

    this.paint();
    onScale(() => { this.rects = null; });
    window.addEventListener('resize', () => { this.rects = null; });
    window.addEventListener('touchstart', () => this.enable(true), { passive: true });
    window.addEventListener('keydown', () => this.enable(false));
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable(true);
  }

  // build the button and wheel images once (cheap: a few dozen small canvases)
  paint() {
    if (this.art) return;
    this.art = { wheel: [] };
    for (const b of Object.values(this.buttons)) {
      if (b.plate) continue;
      b.up = toURL(buttonArt(b.size, b.face, b.icon, false));
      b.down = toURL(buttonArt(b.size, b.face, b.icon, true));
      b.img.src = b.up;
    }
    this.wheelFrames = [];
    for (let i = 0; i < WHEEL_STEPS; i++) this.wheelFrames.push(null);
    this.stickImg.src = toURL(stickArt());
    this.knob.src = toURL(knobArt());
    this.setWheel(0);
  }
  setWheel(a) {
    const i = Math.round(((a + WHEEL_MAX) / (WHEEL_MAX * 2)) * (WHEEL_STEPS - 1));
    if (i === this.wheelIdx) return;
    this.wheelIdx = i;
    // pixel art can't be rotated without resampling, so each angle is drawn for real
    if (!this.wheelFrames[i]) this.wheelFrames[i] = toURL(wheelArt((i / (WHEEL_STEPS - 1)) * WHEEL_MAX * 2 - WHEEL_MAX));
    this.wheelImg.src = this.wheelFrames[i];
  }

  updateHeld() {
    if (!this.rects) {
      this.rects = [];
      for (const [id, b] of Object.entries(this.buttons)) {
        const r = b.el.getBoundingClientRect();
        if (!r.width) continue;
        this.rects.push({ id, b, cx: r.left + r.width / 2, cy: r.top + (b.plate ? r.height / 2 : r.width / 2), rad: b.plate ? 0 : (r.width / 2) * 1.16, r });
      }
    }
    const wheelR = this.wheel.getBoundingClientRect();
    const held = new Set();
    for (const p of this.pointers.values()) {
      if (p.x >= wheelR.left && p.x <= wheelR.right && p.y >= wheelR.top && p.y <= wheelR.bottom) continue;
      for (const R of this.rects) {
        if (!R.b.el.offsetParent) continue;
        const hit = R.b.plate ? p.x >= R.r.left && p.x <= R.r.right && p.y >= R.r.top && p.y <= R.r.bottom : Math.hypot(p.x - R.cx, p.y - R.cy) <= R.rad;
        if (hit) held.add(R.id);
      }
    }
    for (const [id, b] of Object.entries(this.buttons)) {
      const on = held.has(id);
      if (on === b.held) continue;
      b.held = on;
      b.el.classList.toggle('down', on);
      if (b.img && b.up) b.img.src = on ? b.down : b.up;
      if (on) {
        navigator.vibrate?.(8);
        if (b.action === 'pedal') input.touch.throttle = 1;
        else if (b.action === 'brake') input.touch.brake = 1;
        else {
          input.touch.buttons.add(b.action);
          input.tapAction(b.action);
          if (b.action === 'drift') input.touch.trick = true;
        }
      } else {
        if (b.action === 'pedal') input.touch.throttle = 0;
        else if (b.action === 'brake') input.touch.brake = 0;
        else {
          input.touch.buttons.delete(b.action);
          if (b.action === 'drift') input.touch.trick = false;
        }
      }
    }
  }

  enable(on) {
    if (on === this.on) return;
    this.on = on;
    document.getElementById('ui').classList.toggle('touchmode', on);
    if (on) input.lastDevice = 'touch';
    this.rects = null;
  }

  update(dt = 1 / 60) {
    const g = this.game;
    const show = this.on && g.mode === 'ride' && !g.ui.dialogueTick && !g.ui.menuStack.length;
    if (this.root.classList.contains('on') !== show) {
      this.root.classList.toggle('on', show);
      this.rects = null;
      if (!show) { this.pointers.clear(); this.updateHeld(); }
    }
    if (!show) return;
    const foot = !!g.onFoot;
    if (this.root.classList.contains('foot') !== foot) { this.root.classList.toggle('foot', foot); this.rects = null; }
    // the wheel springs back to centre when let go
    if (!this.wheel.classList.contains('held')) this.wheelAngle *= Math.exp(-10 * dt);
    this.setWheel(foot ? 0 : this.wheelAngle);
    const p = g.ui.prompted;
    if (this.talk.classList.contains('lit') !== !!p) { this.talk.classList.toggle('lit', !!p); this.rects = null; }
    if (this.talkText.textContent !== (p || '')) { this.talkText.textContent = p || ''; this.rects = null; }
    const cam = !!g.state?.hasCamera;
    if (this.buttons.photo.el.classList.contains('off') === cam) { this.buttons.photo.el.classList.toggle('off', !cam); this.rects = null; }
  }
}
