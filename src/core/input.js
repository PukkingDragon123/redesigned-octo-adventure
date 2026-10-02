// Keyboard + gamepad + touch input with edge-triggered "pressed" queries.

const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  drift: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter'],
  boost: ['KeyF', 'KeyQ'],
  bell: ['KeyR'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  keepsakes: ['Tab', 'KeyI'],
  camera: ['KeyC'],
  confirm: ['Space', 'Enter', 'KeyE'],
  back: ['Escape', 'Backspace'],
  shiftUp: ['KeyX'],
  shiftDown: ['KeyZ'],
};

// standard gamepad mapping
const PAD = {
  jump: [0], // A
  drift: [5, 7], // RB, RT? (RT used for pedal below)
  interact: [2], // X
  boost: [1], // B
  bell: [3], // Y
  pause: [9], // start
  map: [8], // back/select
  keepsakes: [8],
  confirm: [0],
  back: [1],
  shiftUp: [5],
  shiftDown: [4],
  camera: [11],
};

class Input {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since the last update (so quick taps on slow frames still count)
    this.prev = new Set();
    this.now = new Set();
    this.pad = null;
    this.touch = { steer: 0, throttle: 0, brake: 0, stickThrottle: 0, stickBrake: 0, buttons: new Set() };
    this.tappedActions = new Set(); // on-screen button taps, latched like key taps
    this.lastDevice = 'keyboard';
    this.enabled = true;
    this.mouse = { dx: 0, dy: 0, down: false };
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space' && e.target === document.body) e.preventDefault();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.tapped.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.tapped.clear();
    });
    window.addEventListener('mousemove', (e) => {
      if (this.mouse.down) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.button === 1) this.mouse.down = true;
    });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update() {
    this.prev = this.now;
    this.now = new Set();
    // a fresh keydown always counts as a press, even if the key looked held last frame
    this.fresh = new Set();
    for (const [action, codes] of Object.entries(BINDINGS)) {
      if (codes.some((c) => this.keys.has(c) || this.tapped.has(c))) this.now.add(action);
      if (codes.some((c) => this.tapped.has(c))) this.fresh.add(action);
    }
    this.tapped.clear();
    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const p of pads) if (p && p.connected) { this.pad = p; break; }
    if (this.pad) {
      const b = this.pad.buttons;
      for (const [action, idx] of Object.entries(PAD)) {
        if (idx.some((i) => b[i] && b[i].pressed)) {
          this.now.add(action);
          this.lastDevice = 'gamepad';
        }
      }
      const ax = this.pad.axes[0] || 0;
      if (Math.abs(ax) > 0.5) this.lastDevice = 'gamepad';
      if (b[12]?.pressed) this.now.add('up');
      if (b[13]?.pressed) this.now.add('down');
      if (b[14]?.pressed) this.now.add('left');
      if (b[15]?.pressed) this.now.add('right');
      if ((this.pad.axes[1] || 0) < -0.6) this.now.add('menuUp');
      if ((this.pad.axes[1] || 0) > 0.6) this.now.add('menuDown');
    }
    for (const t of this.touch.buttons) this.now.add(t);
    for (const a of this.tappedActions) {
      this.now.add(a);
      this.fresh.add(a);
    }
    this.tappedActions.clear();
    if (!this.enabled) this.now.clear();
  }

  tapAction(action) {
    this.tappedActions.add(action);
  }

  down(action) {
    return this.now.has(action);
  }
  pressed(action) {
    if (!this.enabled) return false;
    return this.fresh?.has(action) || (this.now.has(action) && !this.prev.has(action));
  }
  released(action) {
    return !this.now.has(action) && this.prev.has(action);
  }

  // analog steering -1..1 (left negative)
  steer() {
    let s = 0;
    if (this.now.has('left')) s -= 1;
    if (this.now.has('right')) s += 1;
    if (this.pad) {
      const ax = this.pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) s = Math.sign(ax) * (Math.abs(ax) - 0.12) / 0.88;
    }
    if (Math.abs(this.touch.steer) > 0.05) s = this.touch.steer;
    return Math.max(-1, Math.min(1, s));
  }
  throttle() {
    let t = this.now.has('up') ? 1 : 0;
    if (this.pad) {
      const rt = this.pad.buttons[7]?.value || 0;
      t = Math.max(t, rt);
      const ay = this.pad.axes[1] || 0;
      if (ay < -0.3) t = Math.max(t, Math.min(1, -ay));
    }
    t = Math.max(t, this.touch.throttle, this.touch.stickThrottle);
    return this.enabled ? t : 0;
  }
  brake() {
    let t = this.now.has('down') ? 1 : 0;
    if (this.pad) {
      const lt = this.pad.buttons[6]?.value || 0;
      t = Math.max(t, lt);
      const ay = this.pad.axes[1] || 0;
      if (ay > 0.5) t = Math.max(t, ay);
    }
    t = Math.max(t, this.touch.brake, this.touch.stickBrake);
    return this.enabled ? t : 0;
  }
  // right stick / mouse for camera orbit
  look() {
    let x = 0, y = 0;
    if (this.pad) {
      const rx = this.pad.axes[2] || 0, ry = this.pad.axes[3] || 0;
      if (Math.abs(rx) > 0.15) x = rx;
      if (Math.abs(ry) > 0.15) y = ry;
    }
    x += this.mouse.dx * 0.004;
    y += this.mouse.dy * 0.004;
    this.mouse.dx = this.mouse.dy = 0;
    return { x, y };
  }
}

export const input = new Input();
