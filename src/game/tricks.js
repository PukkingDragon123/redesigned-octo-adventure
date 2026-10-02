// Bike tricks: while airborne, hold Shift (or the trick button) and a direction
// to strike a pose. Land clean to bank it; land mid-pose and Hank bails (and
// falls apart, obviously). Spins, hoop shots and mid-air pumpkin smashes are
// trick shots that stack into combos.
import { input } from '../core/input.js';
import { wrapAngle } from '../core/math.js';
import { POSES } from './vchar.js';

const S = Math.sin;
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

export class Tricks {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.done = [];
    this.combo = 0;
    this.comboT = 0;
    this.spin = 0;
    this.lastYaw = 0;
    this.air = false;
    this.score = 0;
  }

  update(dt) {
    const g = this.game;
    if (g.onFoot || g.mode !== 'ride') { this.clear(); return; }
    const b = g.bike;
    const ch = g.rider.ch;
    const airborne = !b.grounded && b.crash <= 0 && b.airTime > 0.12;
    if (airborne) {
      if (!this.air) { this.air = true; this.spin = 0; this.lastYaw = b.yaw; this.done = []; }
      this.spin += wrapAngle(b.yaw - this.lastYaw);
      this.lastYaw = b.yaw;
      // pick a trick
      const trickBtn = input.down('drift') || input.touch?.trick;
      if (trickBtn && !this.active && b.airTime > 0.18) {
        const up = input.throttle() > 0.5, down = input.brake() > 0.5, st = input.steer();
        const id = up ? 'superman' : down ? 'nohander' : st < -0.5 ? 'cancan' : st > 0.5 ? 'nothin' : 'skull';
        this.start(id);
      }
      if (this.active) {
        this.active.t += dt;
        if (!trickBtn && this.active.t > 0.35) this.finishPose();
      }
    } else if (this.air && (b.grounded || b.crash > 0)) {
      this.land(b.crash > 0);
    }
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.bank();
    // drive the rider pose
    const A = this.active;
    ch.trickPose = A ? (c, t, T) => TRICKS[A.id].f(c, A.t, T) : null;
    ch.trickArms = !!(A && TRICKS[A.id].arms);
    ch.trickLegs = !!(A && TRICKS[A.id].legs);
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
    if (this.active.t > 0.3) this.done.push(T);
    this.active = null;
  }

  land(crashed) {
    const g = this.game;
    this.air = false;
    // still mid-pose on touchdown = bail
    if (this.active) {
      const late = this.active.t > 0.25;
      this.active = null;
      if (!crashed && late) {
        g.bike.startCrash(8, 'bail');
        const ev = g.bike.events.pop();
        for (const l of g.listeners) l(ev || { type: 'crash', impact: 8, why: 'bail' });
        this.combo = 0;
        this.say('BAIL!', 'bail');
        return;
      }
    }
    if (crashed) { this.combo = 0; this.done = []; return; }
    const spins = Math.floor(Math.abs(this.spin) / (Math.PI * 1.75));
    const list = [...this.done];
    if (spins >= 1) list.push({ name: spins >= 2 ? '720!' : '360', pts: spins >= 2 ? 300 : 150 });
    if (g.bike.airTime > 1.6 || list.length) {
      if (!list.length) list.push({ name: 'BIG AIR', pts: 50 });
      let pts = 0;
      for (const t of list) pts += t.pts;
      this.combo += list.length;
      this.score += pts * Math.max(1, this.combo);
      this.comboT = 2.2;
      g.sound.play('trick_land');
      g.sound.play('combo_ding', { pitch: 1 + Math.min(8, this.combo) * 0.06 });
      this.say(list.map((t) => t.name).join(' + ') + (this.combo > 1 ? `  x${this.combo}` : ''), 'land');
      g.rider.ch.react('yay');
      g.state.stats.tricks = (g.state.stats.tricks || 0) + list.length;
      g.quests?.event('trick', { list, combo: this.combo });
    }
    this.done = [];
  }

  // flying through a flaming hoop
  hoop(h) {
    const g = this.game;
    this.combo++;
    this.comboT = 2.5;
    this.score += 250 * this.combo;
    g.sound.play('lantern_whoomp');
    g.sound.play('crowd_cheer', { volume: 0.6 });
    g.effects.confetti(g.bike.pos.x, g.bike.pos.y + 1.5, g.bike.pos.z, 30);
    this.say(`HOOP SHOT!${this.combo > 1 ? `  x${this.combo}` : ''}`, 'shot');
    g.quests?.event('hoop', h);
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
    const ch = this.game.rider?.ch;
    if (ch) { ch.trickPose = null; ch.trickArms = ch.trickLegs = false; }
  }
}

export { POSES };
