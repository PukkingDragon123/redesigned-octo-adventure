// On-screen controls for phones & tablets. Riding: a big steering wheel on the
// left (drag it round, it springs back), pedal / brake / hop / trick / boost /
// bell on the right. On foot the wheel becomes a stick and the buttons become
// jump / kick / run. A context button shows whatever Hank can do right now.
import { input } from '../core/input.js';
import { el } from './ui.js';
import { iconURL } from '../art/icons.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- pixel art
function pix(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  draw(R, g);
  return c.toDataURL();
}
const INK = '#2a1a22', CREAM = '#fff6e0', GOLD = '#f2c443', RED = '#c8361f', WOOD = '#8a5a32';

// a chunky wooden steering wheel with a red grip and a skull hub
const WHEEL = () => pix(64, 64, (R) => {
  const cx = 32, cy = 32;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > 31) continue;
    if (d > 29) R(x, y, 1, 1, INK);
    else if (d > 24) R(x, y, 1, 1, (Math.atan2(y - cy, x - cx) > -2.2 && Math.atan2(y - cy, x - cx) < -0.9) ? RED : d > 27 ? '#b07a48' : WOOD);
    else if (d > 22.5) R(x, y, 1, 1, INK);
  }
  // spokes
  for (const a of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
    for (let r = 7; r < 24; r++) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      R(x - 2, y - 2, 4, 4, INK);
      R(x - 1, y - 1, 3, 3, WOOD);
    }
  }
  // skull hub
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) if (x * x + y * y <= 64) R(cx + x, cy + y, 1, 1, x * x + y * y > 49 ? INK : CREAM);
  R(cx - 4, cy - 2, 3, 3, INK); R(cx + 1, cy - 2, 3, 3, INK); R(cx - 1, cy + 2, 2, 1, INK);
  R(cx - 3, cy + 4, 6, 1, INK);
  R(cx - 3, cy - 1, 1, 1, GOLD); R(cx + 2, cy - 1, 1, 1, GOLD);
});

const ICONS = {
  pedal: () => pix(24, 24, (R) => { R(10, 4, 4, 16, INK); R(11, 5, 2, 14, '#9aa0a8'); R(4, 2, 10, 5, INK); R(5, 3, 8, 3, '#3a3a40'); R(10, 17, 10, 5, INK); R(11, 18, 8, 3, '#3a3a40'); R(9, 9, 6, 6, INK); R(10, 10, 4, 4, GOLD); }),
  brake: () => pix(24, 24, (R) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const d = Math.hypot(x - 11.5, y - 11.5); if (d < 10.5) R(x, y, 1, 1, d > 9 ? INK : RED); } R(5, 10, 14, 4, CREAM); }),
  jump: () => pix(24, 24, (R) => { for (let k = 0; k < 8; k++) R(12 - k, 3 + k, 1 + k * 2, 1, CREAM); R(9, 11, 6, 9, CREAM); R(4, 21, 16, 2, '#e8c8a0'); }),
  trick: () => pix(24, 24, (R) => { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI * 2; const r = k % 2 ? 4.5 : 10.5; pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]); } for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { let inside = false; for (let i = 0, j = 9; i < 10; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } if (inside) R(x, y, 1, 1, GOLD); } R(9, 9, 2, 2, INK); R(13, 9, 2, 2, INK); }),
  kick: () => pix(24, 24, (R) => { R(6, 4, 7, 11, '#ecdcbc'); R(6, 13, 15, 6, INK); R(7, 14, 13, 4, '#6a4a3a'); R(19, 12, 4, 2, CREAM); R(20, 9, 3, 2, CREAM); }),
  run: () => pix(24, 24, (R) => { R(3, 8, 8, 2, CREAM); R(1, 12, 9, 2, CREAM); R(4, 16, 6, 2, CREAM); R(12, 10, 10, 7, INK); R(13, 11, 8, 5, RED); R(12, 17, 11, 2, CREAM); }),
  photo: () => pix(24, 24, (R) => { R(2, 7, 20, 13, INK); R(3, 8, 18, 11, '#4a4a54'); R(7, 4, 8, 4, INK); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const d = Math.hypot(x - 12, y - 13.5); if (d < 4.5) R(x, y, 1, 1, d > 3.2 ? CREAM : '#3a6ab0'); } R(17, 9, 3, 2, GOLD); }),
  journal: () => pix(24, 24, (R) => { R(4, 3, 16, 19, INK); R(5, 4, 14, 17, '#7a3a2a'); R(7, 4, 12, 17, '#9a4a32'); R(9, 8, 8, 2, CREAM); R(9, 12, 6, 1, '#e8c8a0'); R(5, 4, 2, 17, GOLD); }),
  map: () => pix(24, 24, (R) => { R(2, 4, 20, 16, INK); R(3, 5, 6, 14, '#ecdcb6'); R(9, 5, 6, 14, '#d8c498'); R(15, 5, 6, 14, '#ecdcb6'); R(11, 9, 3, 3, RED); R(5, 13, 3, 1, '#5a8a4a'); R(17, 8, 2, 6, '#5a7ab8'); }),
};

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.root = el('div');
    this.root.id = 'touch';
    document.getElementById('ui').appendChild(this.root);
    this.wheelAngle = 0;

    // ---- the steering wheel / walking stick (left)
    this.wheel = el('div', 'twheel', `<img class="wimg" src="${WHEEL()}"><div class="knob"></div>`);
    this.wheelImg = this.wheel.querySelector('.wimg');
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
        // a free stick for walking
        const len = Math.hypot(dx, dy);
        const k = len > 1 ? 1 / len : 1;
        this.knob.style.transform = `translate(calc(-50% + ${dx * k * 70}%), calc(-50% + ${dy * k * 70}%))`;
        input.touch.steer = clamp(dx * 1.3, -1, 1);
        input.touch.stickThrottle = clamp(-dy * 1.3, 0, 1);
        input.touch.stickBrake = clamp(dy * 1.3, 0, 1);
        input.touch.run = len > 0.85;
        return;
      }
      // turn the wheel: angular drag, plus a little horizontal drag for quick flicks
      let da = angleOf(e) - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.wheelAngle = clamp(base + da, -2.1, 2.1);
      input.touch.steer = clamp(this.wheelAngle / 1.6, -1, 1);
    };
    const endWheel = () => {
      wid = null;
      input.touch.steer = 0;
      input.touch.stickThrottle = input.touch.stickBrake = 0;
      input.touch.run = false;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.wheel.classList.remove('held');
    };
    this.wheel.addEventListener('pointerdown', (e) => {
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

    // ---- buttons: [id, label, action, icon, right, bottom, size, mode]
    const B = [
      ['pedal', 'PEDAL', 'pedal', 'pedal', 6, 8, 32, 'ride'],
      ['brake', 'BRAKE', 'brake', 'brake', 42, 5, 21, 'ride'],
      ['jump', 'HOP', 'jump', 'jump', 10, 46, 23, 'ride'],
      ['trick', 'TRICK', 'drift', 'trick', 38, 32, 21, 'ride'],
      ['boost', null, 'boost', null, 64, 16, 18, 'ride', 'cola'],
      ['bell', null, 'bell', null, 64, 38, 16, 'ride', 'bell'],
      ['fjump', 'JUMP', 'jump', 'jump', 8, 10, 30, 'foot'],
      ['kick', 'KICK', 'boost', 'kick', 40, 6, 22, 'foot'],
      ['photo', 'SNAP', 'camera', 'photo', 40, 32, 20, 'foot'],
    ];
    this.buttons = {};
    for (const [id, label, action, icon, right, bottom, size, mode, atlasIcon] of B) {
      const img = icon ? ICONS[icon]() : iconURL(atlasIcon);
      const b = el('div', `tbtn t-${id} m-${mode}`, `<img src="${img}">${label ? `<span>${label}</span>` : ''}`);
      b.style.right = `calc(var(--u) * ${right})`;
      b.style.bottom = `calc(var(--u) * ${bottom})`;
      b.style.width = b.style.height = `calc(var(--u) * ${size})`;
      this.bindButton(b, action);
      this.root.appendChild(b);
      this.buttons[id] = b;
    }
    // context action: a paper tag that says what it'll do
    this.talk = el('div', 'tbtn t-talk', '<span class="ink-key">E</span><span class="tt"></span>');
    this.talkText = this.talk.querySelector('.tt');
    this.bindButton(this.talk, 'interact');
    this.root.appendChild(this.talk);
    // journal & map in the top corner
    this.pause = el('div', 'tbtn t-pause', `<img src="${ICONS.journal()}">`);
    this.bindButton(this.pause, 'pause');
    this.root.appendChild(this.pause);
    this.mapBtn = el('div', 'tbtn t-map', `<img src="${ICONS.map()}">`);
    this.bindButton(this.mapBtn, 'map');
    this.root.appendChild(this.mapBtn);

    window.addEventListener('touchstart', () => this.enable(true), { passive: true });
    window.addEventListener('keydown', () => this.enable(false));
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable(true);
  }

  bindButton(b, action) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      navigator.vibrate?.(8);
      if (action === 'pedal') input.touch.throttle = 1;
      else if (action === 'brake') input.touch.brake = 1;
      else {
        input.touch.buttons.add(action);
        input.tapAction(action);
        if (action === 'drift') input.touch.trick = true;
      }
    };
    const up = () => {
      b.classList.remove('down');
      if (action === 'pedal') input.touch.throttle = 0;
      else if (action === 'brake') input.touch.brake = 0;
      else {
        input.touch.buttons.delete(action);
        if (action === 'drift') input.touch.trick = false;
      }
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  enable(on) {
    if (on === this.on) return;
    this.on = on;
    document.getElementById('ui').classList.toggle('touchmode', on);
    if (on) input.lastDevice = 'touch';
  }

  update(dt = 1 / 60) {
    const g = this.game;
    const show = this.on && (g.mode === 'ride') && !g.ui.dialogueTick && !g.ui.menuStack.length;
    this.root.classList.toggle('on', show);
    if (!show) return;
    const foot = !!g.onFoot;
    this.root.classList.toggle('foot', foot);
    // the wheel springs back to centre when let go
    if (!this.wheel.classList.contains('held')) this.wheelAngle *= Math.exp(-10 * dt);
    this.wheelImg.style.transform = `rotate(${foot ? 0 : this.wheelAngle}rad)`;
    const p = g.ui.prompted;
    this.talk.classList.toggle('lit', !!p);
    if (this.talkText.textContent !== (p || '')) this.talkText.textContent = p || '';
    this.buttons.boost.style.display = g.bike.stats.boostCharges > 0 ? '' : 'none';
    this.buttons.photo.style.display = g.state.hasCamera ? '' : 'none';
  }
}
