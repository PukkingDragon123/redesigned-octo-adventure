// Pedalling input: every device turns the same crank, and nothing turns it on its own.
//
//   strokes  keys (W / Up and S / Down) and the gamepad triggers (RT and LT) are the two
//            feet: each time the other foot goes down the crank is wound on half a turn,
//            delivered smoothly at the cadence the strokes are coming in at. The same foot
//            twice, or a key held down, does nothing.
//   drags    touch, the mouse and the gamepad's right stick report how far they went round
//            the chainring (radians; clockwise on screen is forward, backwards back-pedals).
//
// update(dt) returns how far the crank was wound this frame (radians, + forward) and keeps
// a running total (angle) that the on-screen crank draws. When the strokes stop, the last
// half turn finishes and the crank stops. There's no speed limit worth the name: the faster
// the feet come down (or the thumb goes round) the faster it spins; what that's worth on the
// road is up to the gear and Hank's legs (bike.js).
const HALF = Math.PI;
const SEQ = 1.1; // seconds: a stroke this soon after the last one keeps the rhythm going
const MAX_RATE = 90; // rad/s (~14 turns a second): only there so a glitchy key repeat can't fling it
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PedalFeed {
  constructor() {
    this.t = 0;
    this.angle = 0; // every turn handed out, summed (the on-screen crank)
    this.reset();
  }

  // forget strokes and drags in flight (getting off the bike, a menu opening)
  reset() {
    this.pending = 0; // stroke turn not handed out yet
    this.rate = 0; // rad/s the strokes are coming in at
    this.lastFoot = 0; // 1: W / Up / RT, -1: S / Down / LT
    this.lastT = -9;
    this.drag = 0;
    this.out = 0;
    this.strokes = 0;
  }

  // still in a pedalling rhythm (a stroke not long ago)?
  get rolling() {
    return this.t - this.lastT < SEQ;
  }
  // which foot goes down next (for the key hints): 1, -1, or 0 for either (W starts)
  get nextFoot() {
    return this.rolling ? -this.lastFoot : 1;
  }

  // a foot pressed down: returns true if it wound the crank on. Starting from rest (or a
  // coast) it has to be the first foot: S / LT on its own is the brake.
  stroke(foot) {
    const iv = this.t - this.lastT;
    const seq = iv < SEQ;
    if (seq && foot === this.lastFoot) {
      // the same foot again: nothing, but it's still waiting for the other one (mashing one
      // key never adds up to pedalling)
      this.lastT = this.t;
      return false;
    }
    if (!seq && foot !== 1) return false;
    // the cadence: a half turn per stroke interval (a deliberate first push from rest)
    this.rate = seq ? clamp(HALF / Math.max(iv, 0.03), 3, MAX_RATE) : HALF / 0.3;
    // strokes can bank a little ahead, never more than two halves
    this.pending = Math.min(this.pending + HALF, HALF * 2);
    this.lastFoot = foot;
    this.lastT = this.t;
    this.strokes++;
    return true;
  }

  // touch / mouse / stick went round the chainring by dA radians
  turn(dA) {
    if (Number.isFinite(dA)) this.drag += clamp(dA, -3, 3);
  }

  update(dt) {
    this.t += dt;
    let out = this.drag;
    this.drag = 0;
    if (this.pending > 0) {
      // hand the stroke out at the rate it came in (a little quicker when falling behind)
      const rate = this.rate * (1 + Math.max(0, this.pending - HALF) / HALF);
      const d = Math.min(this.pending, rate * dt);
      this.pending -= d;
      out += d;
    }
    this.out = out;
    this.angle += out;
    return out;
  }
}
