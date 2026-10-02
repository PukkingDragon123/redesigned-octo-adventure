// Bike tricks and combos. In the air: hold Shift (or the trick button) with a direction
// to strike a pose; let go before touchdown or Hank bails. Spins (A/D), flips
// (lean back / forward), wheelie drops, long jumps and perfect landings all score, and
// ground moves (wheelies, manuals, stoppies, nose manuals, drifts) keep a combo alive,
// so a run can chain hop -> 360 -> manual -> hop -> backflip -> hoop.
import { input } from '../core/input.js';
import { POSES } from './vchar.js';

const arm = (T, s, f, o, e, i = 0) => { T['aF' + s] = f; T['aO' + s] = o; T['eB' + s] = e; T['eI' + s] = i; };
const leg = (T, s, f, o, k) => { T['lF' + s] = f; T['lO' + s] = o; T['kB' + s] = k; };

// pose overrides layered on the ride pose (arms/legs released from IK as needed)
export const TRICKS = {
  superman: { name: 'SUPERMAN', pts: 120, arms: false, legs: true, f(c, t, T) { leg(T, 'L', -1.4, 0.15, 0.1); leg(T, 'R', -1.4, 0.15, 0.1); T.bodyRx = -0.2; T.lean = 0.9; T.bodyZ = -0.15; T.headX = -0.4; } },
  nohander: { name: 'NO HANDER', pts: 100, arms: true, legs: false, f(c, t, T) { arm(T, 'L', 0.3, 2.7, 0.2); arm(T, 'R', 0.3, 2.7, 0.2); T.lean = -0.1; T.headX = -0.3; } },
  cancan: { name: 'CAN-CAN', pts: 110, arms: false, legs: true, f(c, t, T) { leg(T, 'L', 1.5, 1.1, 0.1); T.tilt = -0.15; } },
  nothin: { name: "NOTHIN'", pts: 160, arms: true, legs: true, f(c, t, T) { arm(T, 'L', 0.6, 1.6, 0.3); arm(T, 'R', 0.6, 1.6, 0.3); leg(T, 'L', 0.4, 0.9, 0.3); leg(T, 'R', 0.4, 0.9, 0.3); T.bodyY = 0.12; } },
  skull: {
    name: 'SKULL TOSS', pts: 140, arms: true, legs: false,
    f(c, t, T) {
      // Hank tosses his own head up and catches it
      const k = Math.sin(Math.min(1, t / 0.7) * Math.PI);
      T.headUp = k * 0.9; T.headY = (t / 0.7) * Math.PI * 2;
      arm(T, 'L', 1.0 + k * 1.2, 0.3, 0.6); arm(T, 'R', 1.0 + k * 1.2, 0.3, 0.6); T.jaw = 0.3 + k * 0.3;
    },
  },
};

const SPIN_PTS = { 180: 80, 360: 180, 540: 300, 720: 450, 900: 650 };
const COMBO_TIME = 2.4;

export class Tricks {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.done = [];
    this.combo = 0;
    this.comboT = 0;
    this.chain = [];
    this.air = false;
    this.score = 0;
    this.poseFn = null;
    this.poseArms = this.poseLegs = false;
  }

  update(dt) {
    const g = this.game;
    const b = g.bike;
    if (g.onFoot || g.mode !== 'ride') { this.clear(); return; }
    const c = g.ctl || {};
    const airborne = !b.grounded && b.crash <= 0 && b.airTime > 0.12;
    if (airborne) {
      if (!this.air) { this.air = true; this.done = []; }
      // strike a pose: trick button + direction (picked the moment you press it)
      const trickBtn = c.trick ?? (input.down('drift') || input.touch?.trick);
      if (trickBtn && !this.active && !this.held && b.airTime > 0.18) {
        const up = c.throttle > 0.5, down = c.brake > 0.5, st = c.steer || 0;
        this.start(up ? 'superman' : down ? 'nohander' : st < -0.5 ? 'cancan' : st > 0.5 ? 'nothin' : 'skull');
      }
      if (b.airTime > 0.18) this.held = !!trickBtn;
      if (this.active) {
        this.active.t += dt;
        if (!trickBtn && this.active.t > 0.35) this.finishPose();
      }
    } else {
      if (this.air && b.crash > 0) this.air = false;
      this.held = false;
      if (b.grounded) this.air = false;
      this.active = null;
    }
    b.posing = this.active ? this.active.t : 0;
    if (this.comboT > 0 && b.grounded && b.wheelie < 0.1 && b.stoppie < 0.08 && !b.drifting && (this.comboT -= dt) <= 0) this.bank();
    // the rider pose (rider3d layers this over its own bike-move pose)
    const A = this.active;
    this.poseFn = A ? (ch, t, T) => TRICKS[A.id].f(ch, A.t, T) : null;
    this.poseArms = !!(A && TRICKS[A.id].arms);
    this.poseLegs = !!(A && TRICKS[A.id].legs);
  }

  start(id) {
    this.active = { id, t: 0 };
    const g = this.game;
    g.sound.play('trick_whoosh', { pitch: 0.9 + Math.random() * 0.2 });
    g.rider.ch.setExpr('sparkle');
    if (id === 'skull') g.sound.play('bone_rattle');
  }

  finishPose() {
    if (!this.active) return;
    const T = TRICKS[this.active.id];
    if (this.active.t > 0.3) this.done.push({ ...T, id: this.active.id });
    this.active = null;
  }

  onBikeEvent(e) {
    switch (e.type) {
      case 'land': this.landed(e); break;
      case 'bail': this.bailed(e); break;
      case 'wheelieEnd':
        if (e.time >= 1.5 || (this.comboT > 0 && e.time >= 0.6)) this.add([{ name: `${e.manual ? 'MANUAL' : 'WHEELIE'} ${e.time.toFixed(1)}s`, pts: Math.round(30 + e.time * 25) }], 'ground');
        break;
      case 'stoppieEnd':
        if (e.time >= 0.8 || (this.comboT > 0 && e.time >= 0.4)) this.add([{ name: `${e.nose ? 'NOSE MANUAL' : 'STOPPIE'} ${e.time.toFixed(1)}s`, pts: Math.round(40 + e.time * 40) }], 'ground');
        break;
      case 'driftEnd':
        if (e.time >= 1.5 || (this.comboT > 0 && e.time >= 0.8)) this.add([{ name: `DRIFT ${e.time.toFixed(1)}s`, pts: Math.round(20 + e.time * 20) }], 'ground');
        break;
    }
  }

  landed(e) {
    const g = this.game;
    this.air = false;
    if (this.active) this.finishPose();
    const list = [...this.done];
    for (const t of this.done) g.skills?.event({ type: 'trick', id: t.id });
    this.done = [];
    if (e.spin >= 180) list.push({ name: String(e.spin), pts: SPIN_PTS[e.spin] || 650 + (e.spin - 900) });
    if (e.flips) {
      const n = Math.abs(e.flips), back = e.flips > 0;
      list.push({ name: `${n > 1 ? (n > 2 ? 'TRIPLE ' : 'DOUBLE ') : ''}${back ? 'BACKFLIP' : 'FRONTFLIP'}`, pts: (back ? 300 : 360) * n * (n > 1 ? 1.5 : 1) });
    }
    if (e.wheelieDrop) list.push({ name: 'WHEELIE DROP', pts: 120 });
    if (e.dist > 12 && e.airTime > 0.8) list.push({ name: `LONG JUMP ${Math.round(e.dist)}m`, pts: Math.round(60 + (e.dist - 12) * 12) });
    if (!list.length && e.airTime > 1.4) list.push({ name: 'BIG AIR', pts: 50 });
    if (list.length) {
      const mult = e.perfect ? 1.5 : e.sketchy ? 0.6 : 1;
      if (e.perfect) list.push({ name: 'PERFECT', pts: 0 });
      else if (e.sketchy) list.push({ name: 'SKETCHY', pts: 0 });
      this.add(list, 'land', mult);
    } else if (e.perfect) {
      // a clean landing on its own still gets a little stamp, and keeps a combo going
      if (this.comboT > 0) this.comboT = COMBO_TIME;
      this.say(this.game.bike.perfectStreak > 1 ? `PERFECT x${this.game.bike.perfectStreak}` : 'PERFECT!', 'shot');
    }
  }

  bailed(e) {
    this.active = null;
    this.done = [];
    this.air = false;
    if (this.combo > 1) this.say(`COMBO LOST x${this.combo}`, 'bail');
    this.combo = 0;
    this.comboT = 0;
    this.chain = [];
    void e;
  }

  // add moves to the running combo and stamp them over the bike
  add(list, kind = 'land', mult = 1) {
    const g = this.game;
    let pts = 0;
    for (const t of list) pts += t.pts;
    const n = list.filter((t) => t.pts > 0).length;
    this.combo += n;
    this.chain.push(...list.filter((t) => t.pts > 0).map((t) => t.name));
    this.score += Math.round(pts * mult * Math.max(1, this.combo));
    this.comboT = COMBO_TIME;
    if (kind === 'land') g.sound.play('trick_land');
    g.sound.play('combo_ding', { pitch: 1 + Math.min(8, this.combo) * 0.06 });
    this.say(list.map((t) => t.name).join(' + ') + (this.combo > 1 ? `  x${this.combo}` : ''), kind === 'ground' ? 'shot' : 'land');
    if (kind === 'land') g.rider.ch.tempExpr('sparkle', 1);
    g.state.stats.tricks = (g.state.stats.tricks || 0) + n;
    g.quests?.event('trick', { list, combo: this.combo });
    g.skills?.event({ type: 'combo', count: this.combo });
  }

  // flying through a flaming hoop
  hoop(h) {
    const g = this.game;
    this.combo++;
    this.comboT = COMBO_TIME + 0.3;
    this.score += 250 * this.combo;
    g.sound.play('lantern_whoomp');
    g.sound.play('crowd_cheer', { volume: 0.6 });
    g.effects.confetti(g.bike.pos.x, g.bike.pos.y + 1.5, g.bike.pos.z, 30);
    this.say(`HOOP SHOT!${this.combo > 1 ? `  x${this.combo}` : ''}`, 'shot');
    g.quests?.event('hoop', h);
    g.skills?.event({ type: 'combo', count: this.combo });
  }

  bank() {
    const g = this.game;
    if (this.combo >= 2) {
      const tip = Math.min(25, Math.round(this.combo * 2.5));
      g.state.money += tip;
      g.ui.toast(`Trick combo x${this.combo}! The crowd tossed you <b>$${tip}</b>`, 'star', 2200);
      g.sound.play('cash_coins');
    }
    this.combo = 0;
    this.chain = [];
  }

  say(text, kind) {
    const g = this.game;
    const p = g.bike.pos.clone();
    p.y += 2.6;
    g.ui.tag(`trick${kind}`, text, p, 1500, `trick-${kind}`);
  }

  clear() {
    this.active = null;
    this.air = false;
    this.poseFn = null;
    this.poseArms = this.poseLegs = false;
    if (this.game.bike) this.game.bike.posing = 0;
  }
}

export { POSES };
