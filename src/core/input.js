// Keyboard + gamepad + touch input with edge-triggered "pressed" queries.
// Analog values are shaped once a frame (update(dt)): keys ramp in and out instead of
// slamming to +-1, sticks get a dead zone and a gentle response curve (radial for
// walking, so diagonals stay true), touch steering is lightly smoothed between pointer
// events, and the brake bites in over a moment.
//
// Pedalling is a crank you turn yourself (see pedal.js): on the bike, W / Up and S / Down
// (or RT and LT) are your two feet, and each time the other one goes down the crank winds
// on half a turn; the right stick turned in circles, or a thumb or the mouse dragged round
// the on-screen chainring (ui/crank.js), turns it directly. Nothing pedals by itself.
// S / Down held on its own (not in the middle of pedalling) is the brake, and so is LT.
import { PedalFeed } from './pedal.js';

const RAMP_IN = 6.5; // keys: 0 -> full lock in ~0.15 s
const RAMP_OUT = 9; // ...and back to centre a little quicker
const RAMP_FLIP = 14; // left -> right straight through the middle
const PAD_DEAD = 0.15;
const TRIG_ON = 0.55, TRIG_OFF = 0.3; // a trigger counts as pressed past ON until it's back under OFF
const STICK_SPIN = 0.6; // the right stick has to be pushed out this far to turn the crank
const BRAKE_HOLD = 0.3; // seconds S / LT is held after a stroke before it's a brake instead
const moveTo = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
// a key ramp: quicker back to centre, quickest when swapping sides
const ramp = (v, t, dt) => moveTo(v, t, (t === 0 ? RAMP_OUT : v * t < 0 ? RAMP_FLIP : RAMP_IN) * dt);
const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  drift: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter'],
  // on the bike: lean back (wheelie, manual, backflip) and forward (stoppie, nose manual, frontflip).
  // Left Ctrl is left out on purpose: Ctrl+W closes the browser tab mid-wheelie.
  leanBack: ['KeyQ', 'ControlRight'],
  leanFwd: ['KeyF'],
  boost: ['KeyF', 'KeyQ'], // kick, on foot (only next to something kickable)
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
const FOOT_A = ['KeyW', 'ArrowUp'], FOOT_B = ['KeyS', 'ArrowDown'];

// standard gamepad mapping (the triggers are the pedals on the bike, see update())
const PAD = {
  jump: [0], // A
  drift: [5], // RB: drift on the bike, run on foot
  interact: [2], // X
  boost: [1], // B (kick on foot); the left stick's up/down leans on the bike
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
    // touch: the left stick (steer + lean, or walk), the brake button, held buttons and the trick radial (rad*)
    this.touch = {
      steer: 0, brake: 0, walkX: 0, walkY: 0, buttons: new Set(), run: false, trick: false,
      leanBack: 0, leanFwd: 0, radSteer: 0, radUp: 0, radDown: 0,
    };
    this.tappedActions = new Set(); // on-screen button taps, latched like key taps
    // the crank (pedal.js); `riding` is set by the game each frame: strokes only count on the bike
    this.pedal = new PedalFeed();
    this.riding = false;
    this.turnOut = 0;
    this.trig = { A: false, B: false };
    this.stickAng = null;
    this.brakeT = 0; // how long S / LT has been held
    this.brakeStroke = false; // ...and whether its press was a pedal stroke
    // shaped analog values (see shape())
    this.steerS = 0;
    this.moveXS = 0;
    this.moveYS = 0;
    this.brakeS = 0;
    this.runOn = false;
    this.lastDevice = 'keyboard';
    this.enabled = true;
    this.mouse = { dx: 0, dy: 0, down: false };
    this.zoomLog = 0; // camera zoom request (log of the distance factor): wheel and pinch add to it
    if (typeof window === 'undefined') return;
    // the mouse wheel over the game picture (not over menus, which scroll) zooms the camera
    window.addEventListener('wheel', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLCanvasElement) && t?.id !== 'stage' && t !== document.body && t?.id !== 'ui') return;
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.zoomLog += Math.max(-0.5, Math.min(0.5, px * 0.0012));
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space' && e.target === document.body) e.preventDefault();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.tapped.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // keys let go while the page is away never send a keyup: forget them all
    const drop = () => this.release();
    window.addEventListener('blur', drop);
    window.addEventListener('pagehide', drop);
    document.addEventListener('visibilitychange', () => document.hidden && drop());
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

  // let go of everything held (the page lost focus, a menu took over)
  release() {
    this.keys.clear();
    this.tapped.clear();
    this.mouse.down = false;
    this.pedal.reset();
    this.trig.A = this.trig.B = false;
    this.stickAng = null;
  }

  update(dt = 1 / 60) {
    this.prev = this.now;
    this.now = new Set();
    // a fresh keydown always counts as a press, even if the key looked held last frame
    this.fresh = new Set();
    for (const [action, codes] of Object.entries(BINDINGS)) {
      if (codes.some((c) => this.keys.has(c) || this.tapped.has(c))) this.now.add(action);
      if (codes.some((c) => this.tapped.has(c))) this.fresh.add(action);
    }
    // pedal strokes: W / Up and S / Down are the two feet (fresh presses only: holding does nothing)
    const riding = this.riding && this.enabled;
    let footA = FOOT_A.some((c) => this.tapped.has(c)), footB = FOOT_B.some((c) => this.tapped.has(c));
    this.tapped.clear();
    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const p of pads) if (p && p.connected) { this.pad = p; break; }
    let padBrake = 0, footBHeld = FOOT_B.some((c) => this.keys.has(c));
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
      // the triggers are the feet: a press past TRIG_ON is a stroke, it has to come back under
      // TRIG_OFF before it can press again (no creeping from a trigger that rests a bit open)
      const rt = b[7]?.value ?? (b[7]?.pressed ? 1 : 0), lt = b[6]?.value ?? (b[6]?.pressed ? 1 : 0);
      if (!this.trig.A && rt > TRIG_ON) { this.trig.A = true; footA = true; this.lastDevice = 'gamepad'; } else if (this.trig.A && rt < TRIG_OFF) this.trig.A = false;
      if (!this.trig.B && lt > TRIG_ON) { this.trig.B = true; footB = true; this.lastDevice = 'gamepad'; } else if (this.trig.B && lt < TRIG_OFF) this.trig.B = false;
      if (this.trig.B) { footBHeld = true; padBrake = lt; }
      // the right stick turned in circles turns the crank (clockwise is forwards)
      const rx = this.pad.axes[2] || 0, ry = this.pad.axes[3] || 0;
      if (riding && Math.hypot(rx, ry) > STICK_SPIN) {
        const a = Math.atan2(ry, rx);
        if (this.stickAng != null) {
          const d = wrap(a - this.stickAng);
          if (Math.abs(d) < 2.2) this.pedal.turn(d);
        }
        this.stickAng = a;
        this.lastDevice = 'gamepad';
      } else this.stickAng = null;
    }
    for (const t of this.touch.buttons) this.now.add(t);
    for (const a of this.tappedActions) {
      this.now.add(a);
      this.fresh.add(a);
    }
    this.tappedActions.clear();
    if (!this.enabled) this.now.clear();
    dt = Math.min(Math.max(dt, 0), 0.1);
    // ---- the crank: strokes and turns only count on the bike
    if (riding) {
      if (footA) this.pedal.stroke(1);
      if (footB) this.brakeStroke = this.pedal.stroke(-1);
      this.brakeT = footBHeld ? this.brakeT + dt : 0;
      if (!footBHeld) this.brakeStroke = false;
      this.turnOut = this.pedal.update(dt);
    } else {
      this.pedal.reset();
      this.pedal.update(dt);
      this.turnOut = 0;
      this.brakeT = 0;
      this.brakeStroke = false;
    }
    this.shape(dt, footBHeld, padBrake);
  }

  // ---- once a frame: ramp the keys, curve the sticks, smooth the thumbs
  shape(dt, footBHeld = false, padBrake = 0) {
    const T = this.touch, on = this.enabled;
    const kx = (this.now.has('right') ? 1 : 0) - (this.now.has('left') ? 1 : 0);
    const ky = (this.now.has('up') ? 1 : 0) - (this.now.has('down') ? 1 : 0);
    let ax = 0, ay = 0, mx = 0, my = 0, padX = false, padY = false, padMove = false, padMag = 0;
    if (this.pad) {
      ax = this.pad.axes[0] || 0;
      ay = this.pad.axes[1] || 0;
      // steering: a dead zone, then a gentle curve (fine corrections near the middle, full lock at the edge)
      if (Math.abs(ax) > PAD_DEAD) { padX = true; ax = Math.sign(ax) * Math.pow((Math.abs(ax) - PAD_DEAD) / (1 - PAD_DEAD), 1.35); } else ax = 0;
      // walking: a round dead zone, linear beyond it (diagonals stay diagonal)
      const ry = this.pad.axes[1] || 0, rx = this.pad.axes[0] || 0;
      const m = Math.hypot(rx, ry);
      if (m > 0.18) {
        padMove = true;
        padMag = m;
        const k = Math.min(1, (m - 0.18) / 0.72) / m;
        mx = rx * k;
        my = -ry * k;
      }
      padY = Math.abs(ry) > 0.18;
      ay = padY ? -Math.sign(ry) * (Math.abs(ry) - 0.18) / 0.82 : 0;
    }
    // ---- bike steering
    const touchSteer = Math.abs(T.steer) > 0.02 ? T.steer : T.radSteer || 0;
    if (!on) this.steerS = moveTo(this.steerS, 0, RAMP_OUT * dt);
    else if (touchSteer || this.touchSteerT > 0) {
      // between pointer events the thumb's value would sit still then jump: glide it
      this.touchSteerT = touchSteer ? 0.15 : this.touchSteerT - dt;
      this.steerS += (touchSteer - this.steerS) * (1 - Math.exp(-28 * dt));
    } else if (padX) this.steerS += (ax - this.steerS) * (1 - Math.exp(-30 * dt));
    else this.steerS = ramp(this.steerS, kx, dt);
    this.steerS = Math.max(-1, Math.min(1, this.steerS));
    if (Math.abs(this.steerS) < 1e-4) this.steerS = 0;
    // ---- walking (keys ramp too, so a diagonal swings round instead of snapping)
    if (!on) { this.moveXS = moveTo(this.moveXS, 0, RAMP_OUT * dt); this.moveYS = moveTo(this.moveYS, 0, RAMP_OUT * dt); }
    else if (T.walkX || T.walkY) {
      this.moveXS += (T.walkX - this.moveXS) * (1 - Math.exp(-28 * dt));
      this.moveYS += (T.walkY - this.moveYS) * (1 - Math.exp(-28 * dt));
    } else if (padMove) { this.moveXS = mx; this.moveYS = my; }
    else { this.moveXS = ramp(this.moveXS, kx, dt); this.moveYS = ramp(this.moveYS, padY ? ay : ky, dt); }
    if (Math.abs(this.moveXS) < 1e-4) this.moveXS = 0;
    if (Math.abs(this.moveYS) < 1e-4) this.moveYS = 0;
    // ---- running on foot: Shift / RB held, or a stick pushed right out (with a little
    // hysteresis so a wobbly thumb doesn't flicker between a walk and a run)
    const stickRun = padMove && (this.runOn ? padMag > 0.82 : padMag > 0.93);
    this.runOn = on && (this.now.has('drift') || !!T.run || stickRun);
    // ---- brakes bite in over a moment and let go quickly. S / LT held on its own is the brake:
    // pressed in the middle of pedalling it's a stroke, and only brakes if it's held on
    let b = footBHeld && (!this.brakeStroke || this.brakeT > BRAKE_HOLD) ? 1 : 0;
    if (b && padBrake) b = padBrake;
    b = on ? Math.max(b, T.brake) : 0;
    this.brakeS = moveTo(this.brakeS, b, (b > this.brakeS ? 8 : 22) * dt);
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

  // analog steering -1..1 (left negative), shaped in update()
  steer() {
    return this.enabled ? this.steerS : 0;
  }
  // walking sideways -1..1 (right positive), shaped in update()
  moveX() {
    return this.enabled ? Math.max(-1, Math.min(1, this.moveXS)) : 0;
  }
  // how far the crank was wound this frame (radians, + forward): strokes, drags and the stick
  crankTurn() {
    return this.enabled && this.riding ? this.turnOut : 0;
  }
  brake() {
    return this.enabled ? this.brakeS : 0;
  }
  // running on foot
  run() {
    return this.enabled && this.runOn;
  }
  // rider lean 0..1 each: keys, touch hold-buttons, or the left stick pulled down (back) / pushed up (forward)
  lean() {
    let back = Math.max(this.now.has('leanBack') ? 1 : 0, this.touch.leanBack);
    let fwd = Math.max(this.now.has('leanFwd') ? 1 : 0, this.touch.leanFwd);
    if (this.pad) {
      const ay = this.pad.axes[1] || 0;
      if (ay > 0.25) back = Math.max(back, Math.min(1, (ay - 0.25) / 0.6));
      if (ay < -0.25) fwd = Math.max(fwd, Math.min(1, (-ay - 0.25) / 0.6));
    }
    return this.enabled ? { back, fwd } : { back: 0, fwd: 0 };
  }
  // walking: forward/back from keys, the gamepad stick or the touch stick (-1..1), shaped in update()
  moveY() {
    return this.enabled ? Math.max(-1, Math.min(1, this.moveYS)) : 0;
  }
  // camera zoom asked for since the last call (log scale; + is further out)
  takeZoom() {
    const z = this.zoomLog;
    this.zoomLog = 0;
    return z;
  }
  // right stick / mouse for camera orbit (on the bike the right stick turns the crank instead)
  look() {
    let x = 0, y = 0;
    if (this.pad && !this.riding) {
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
