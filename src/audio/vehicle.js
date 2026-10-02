// Continuous vehicle layers: the old bicycle and the putt-putt motorbike.
// Nodes are built lazily on first use and torn down after a few seconds of
// silence. A watchdog silences everything if the game stops calling set*().
import { clamp, rand, glide } from './synth.js';

// hiss = rolling noise level, hf/hq = its band centre/Q (hs: Hz per m/s),
// cr/cf = crunchy crackle level/band, plank = boardwalk thump modulation.
const SURF = {
  road: { hiss: 0.55, hf: 900, hq: 0.5, hs: 70, cr: 0.06, cf: 2600, plank: 0 },
  dirt: { hiss: 0.4, hf: 650, hq: 0.6, hs: 40, cr: 0.75, cf: 1600, plank: 0 },
  grass: { hiss: 0.45, hf: 2600, hq: 0.8, hs: 60, cr: 0.18, cf: 4200, plank: 0 },
  wood: { hiss: 0.35, hf: 420, hq: 0.9, hs: 20, cr: 0.3, cf: 1100, plank: 0.85 },
  water: { hiss: 0.7, hf: 1300, hq: 1.3, hs: 50, cr: 0.5, cf: 3200, plank: 0.3 },
  snow: { hiss: 0.3, hf: 1900, hq: 0.9, hs: 40, cr: 0.8, cf: 3600, plank: 0 },
};

function kitOf(sys) {
  const ctx = sys.ctx;
  return {
    ctx,
    loop(buf, rate = 1) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(ctx.currentTime, Math.random() * buf.duration);
      return s;
    },
    osc(type, f) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    },
    bq(type, f, q = 0.7) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    },
    gain(v = 0) {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    },
  };
}

const wire = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); };

function stopAll(list) {
  for (const s of list) { try { s.stop(); } catch (e) { /* already stopped */ } }
}

// ===================================================================== bike

export class Bike {
  constructor(sys) {
    this.sys = sys;
    this.n = null;
    this.p = { speed: 0, cadence: 0, surface: 'road', grounded: true, drifting: false, freewheel: false };
    this.last = -10;
    this.stale = true;
    this.quietSince = 0;
    this.nextTick = 0;
    this.nextSqueak = 0;
    this.nextRattle = 0;
    this.nextGust = 0;
  }

  set(p) {
    if (!p || typeof p !== 'object') return;
    const q = this.p, now = this.sys.ctx.currentTime;
    // every call describes the full state; missing fields fall back to "at rest"
    q.speed = clamp(Number.isFinite(p.speed) ? p.speed : 0, 0, 40);
    q.cadence = clamp(Number.isFinite(p.cadence) ? p.cadence : 0, 0, 1);
    if (typeof p.surface === 'string') q.surface = SURF[p.surface] ? p.surface : 'road';
    q.grounded = p.grounded === undefined ? true : !!p.grounded;
    q.drifting = !!p.drifting;
    q.freewheel = !!p.freewheel;
    this.last = now;
    this.stale = false;
    if (!this.n && q.speed > 0.05) this.build();
    if (this.n) this.apply(now);
  }

  build() {
    const sys = this.sys, K = kitOf(sys), k = sys.kit, n = {};
    n.out = K.gain(1);
    n.out.connect(sys.sfxBus);
    n.pink = K.loop(k.pink);
    n.white = K.loop(k.white);
    n.crSrc = K.loop(k.crackle);
    // tyre roll: hiss + crunch, amplitude-modulated for boardwalk planks
    n.tyre = K.gain(0);
    n.am = K.gain(1);
    n.hissF = K.bq('bandpass', 900, 0.5);
    n.hissG = K.gain(0.5);
    n.crF = K.bq('bandpass', 2600, 0.8);
    n.crG = K.gain(0);
    wire(n.pink, n.hissF, n.hissG, n.am);
    wire(n.crSrc, n.crF, n.crG, n.am);
    wire(n.am, n.tyre, n.out);
    n.plankLfo = K.osc('triangle', 10);
    n.amDepth = K.gain(0);
    wire(n.plankLfo, n.amDepth);
    n.amDepth.connect(n.am.gain);
    // chain whir: breathy band of noise pulsing with the cranks + faint hum
    n.chainG = K.gain(0);
    n.chainF = K.bq('bandpass', 2600, 2.5);
    n.chainAM = K.gain(0.55);
    n.crank = K.osc('sine', 1.5);
    n.crankG = K.gain(0.45);
    wire(n.crank, n.crankG);
    n.crankG.connect(n.chainAM.gain);
    wire(n.white, n.chainF, n.chainAM, n.chainG, n.out);
    n.whir = K.osc('triangle', 60);
    n.whirF = K.bq('lowpass', 700);
    n.whirG = K.gain(0.3);
    wire(n.whir, n.whirF, n.whirG, n.chainG);
    // drift scrape
    n.skidG = K.gain(0);
    n.skidF = K.bq('bandpass', 1400, 1.1);
    n.skidHi = K.bq('highpass', 2500);
    wire(n.white, n.skidF, n.skidG, n.out);
    wire(n.crSrc, n.skidHi, n.skidG);
    // wind rush (+ airy top at speed)
    n.windF = K.bq('lowpass', 400, 0.6);
    n.windMod = K.gain(1);
    n.windG = K.gain(0);
    wire(n.pink, n.windF, n.windMod, n.windG, n.out);
    n.airF = K.bq('highpass', 3200);
    n.airG = K.gain(0);
    wire(n.white, n.airF, n.airG, n.out);
    // freewheel ratchet bus (ticks scheduled in update)
    n.rat = K.gain(0.06);
    n.rat.connect(n.out);
    n.srcs = [n.pink, n.white, n.crSrc, n.plankLfo, n.crank, n.whir];
    this.n = n;
    this.quietSince = 0;
  }

  teardown() {
    const n = this.n;
    if (!n) return;
    this.n = null;
    stopAll(n.srcs);
    try { n.out.disconnect(); } catch (e) { /* noop */ }
  }

  apply(now) {
    const q = this.p, n = this.n, S = SURF[q.surface] || SURF.road, sp = q.speed;
    const roll = Math.pow(clamp(sp / 9, 0, 1), 0.8) * (q.grounded ? 1 : 0);
    glide(n.tyre.gain, roll * 0.16, now, q.grounded ? 0.06 : 0.04);
    glide(n.hissG.gain, S.hiss, now, 0.12);
    glide(n.hissF.frequency, S.hf + sp * S.hs, now, 0.1);
    glide(n.hissF.Q, S.hq, now, 0.1);
    glide(n.crG.gain, S.cr * clamp(sp / 4, 0.3, 1.2), now, 0.12);
    glide(n.crF.frequency, S.cf, now, 0.1);
    glide(n.crSrc.playbackRate, clamp(0.6 + sp / 10, 0.6, 2.2), now, 0.1);
    glide(n.am.gain, 1 - S.plank * 0.5, now, 0.1);
    glide(n.amDepth.gain, S.plank * 0.5, now, 0.1);
    glide(n.plankLfo.frequency, clamp(sp / 0.3, 1, 40), now, 0.05);
    const pedal = q.cadence * clamp(sp / 2, 0, 1);
    glide(n.chainG.gain, pedal * 0.05, now, 0.08);
    glide(n.crank.frequency, clamp(0.8 + sp * 0.22, 0.8, 3.2), now, 0.2);
    glide(n.whir.frequency, 45 + sp * 9, now, 0.1);
    const skid = q.drifting && q.grounded ? clamp(sp / 5, 0, 1) : 0;
    glide(n.skidG.gain, skid * 0.2, now, skid ? 0.03 : 0.08);
    glide(n.skidF.frequency, S.cf * 0.55, now, 0.05);
    const w = Math.pow(clamp((sp - 1.5) / 26, 0, 1), 1.4);
    glide(n.windG.gain, w * 0.26, now, 0.15);
    glide(n.windF.frequency, 250 + sp * 45, now, 0.15);
    glide(n.airG.gain, w * w * 0.12, now, 0.15);
    glide(n.rat.gain, 0.05 + clamp(sp / 10, 0, 1) * 0.03, now, 0.1);
  }

  tick(t) {
    const ctx = this.sys.ctx, s = ctx.createBufferSource();
    s.buffer = this.sys.kit.tick;
    s.playbackRate.value = rand(0.93, 1.07);
    s.connect(this.n.rat);
    s.start(t);
  }

  rattle(t, v) { // loose basket / thermos on rough ground
    const ctx = this.sys.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this.sys.kit.tick;
    s.playbackRate.value = rand(0.35, 0.55);
    g.gain.value = v;
    s.connect(g);
    g.connect(this.n.out);
    s.onended = () => g.disconnect();
    s.start(t);
  }

  squeak(t) { // the old frame complains when you stomp the pedals
    const ctx = this.sys.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    const f0 = rand(1700, 2100);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.18, t + 0.06);
    o.frequency.linearRampToValueAtTime(f0 * 1.05, t + 0.14);
    f.type = 'bandpass';
    f.frequency.value = f0 * 1.1;
    f.Q.value = 3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.15);
    wire(o, f, g, this.n.out);
    o.start(t);
    o.stop(t + 0.17);
    o.onended = () => g.disconnect();
  }

  update(now) {
    if (!this.n) return;
    const q = this.p;
    if (!this.stale && now - this.last > 0.3) { // game stopped calling setBike
      this.stale = true;
      q.speed = 0;
      q.cadence = 0;
      q.drifting = false;
      q.freewheel = false;
      this.apply(now);
    }
    const moving = q.speed > 0.3;
    const rate = q.freewheel && moving ? clamp(q.speed * 9, 2, 42) : 0;
    if (rate > 0) {
      if (this.nextTick < now) this.nextTick = now + 0.01;
      while (this.nextTick < now + 0.12) {
        this.tick(this.nextTick);
        this.nextTick += (1 / rate) * rand(0.92, 1.08);
      }
    } else this.nextTick = 0;
    if (moving && q.grounded) {
      if (q.cadence > 0.55 && now > this.nextSqueak) {
        if (this.nextSqueak > 0 && Math.random() < 0.6) this.squeak(now + 0.02);
        this.nextSqueak = now + rand(2.5, 6);
      }
      const rough = q.surface === 'dirt' || q.surface === 'wood' || q.surface === 'snow';
      if (rough && q.speed > 3 && now > this.nextRattle) {
        this.rattle(now + 0.01, rand(0.015, 0.04));
        this.nextRattle = now + rand(0.08, 0.4) * (8 / Math.max(4, q.speed));
      }
    }
    if (q.speed > 4 && now > this.nextGust) { // flutter in the wind
      glide(this.n.windMod.gain, rand(0.7, 1.05), now, 0.25);
      this.nextGust = now + rand(0.3, 0.8);
    }
    if (q.speed < 0.05) {
      if (!this.quietSince) this.quietSince = now;
      else if (now - this.quietSince > 3) this.teardown();
    } else this.quietSince = 0;
  }
}

// ==================================================================== motor

const pulseAt = (x, c, tau) => { const d = (x - c + 1) % 1; return Math.exp(-d / tau); };

export class Motor {
  constructor(sys) {
    this.sys = sys;
    this.n = null;
    this.on = false;
    this.rpm = 0;
    this.thr = 0;
    this.jit = 1;
    this.last = -10;
    this.quietSince = 0;
    this.nextJit = 0;
  }

  set(p) {
    if (!p || typeof p !== 'object') return;
    const now = this.sys.ctx.currentTime;
    this.on = !!p.active;
    this.rpm = clamp(Number.isFinite(p.rpm) ? p.rpm : 0, 0, 1);
    this.thr = clamp(Number.isFinite(p.throttle) ? p.throttle : 0, 0, 1);
    this.last = now;
    if (this.on && !this.n) this.build();
    if (this.n) this.apply(now);
  }

  build() {
    const sys = this.sys, K = kitOf(sys), k = sys.kit, n = {};
    // one cycle = a strong and a weaker firing: lumpy old single-cylinder charm
    const wave = k.wave('motor', (x) => pulseAt(x, 0, 0.02) + 0.55 * pulseAt(x, 0.5, 0.02), 200);
    n.fire = sys.ctx.createOscillator();
    n.fire.setPeriodicWave(wave);
    n.fire.frequency.value = 4.5;
    n.fire.start();
    n.mix = K.gain(1);
    n.bodyLP = K.bq('lowpass', 500, 3);
    n.shape = sys.ctx.createWaveShaper();
    n.shape.curve = k.shaper(2.2);
    n.bodyG = K.gain(0.55);
    wire(n.fire, n.bodyLP, n.shape, n.bodyG, n.mix);
    n.noise = K.loop(k.white);
    n.exBP = K.bq('bandpass', 800, 0.9);
    n.exAM = K.gain(0.08);
    n.exG = K.gain(0.9);
    wire(n.noise, n.exBP, n.exAM, n.exG, n.mix);
    n.amDepth = K.gain(0.8);
    wire(n.fire, n.amDepth);
    n.amDepth.connect(n.exAM.gain);
    n.hp = K.bq('highpass', 35);
    n.out = K.gain(0);
    wire(n.mix, n.hp, n.out, sys.sfxBus);
    n.srcs = [n.fire, n.noise];
    this.n = n;
    this.quietSince = 0;
  }

  teardown() {
    const n = this.n;
    if (!n) return;
    this.n = null;
    stopAll(n.srcs);
    try { n.out.disconnect(); } catch (e) { /* noop */ }
  }

  apply(now) {
    const n = this.n, on = this.on;
    glide(n.fire.frequency, (4.5 + this.rpm * 22) * this.jit, now, 0.06);
    glide(n.bodyLP.frequency, 300 + this.thr * 700 + this.rpm * 500, now, 0.08);
    glide(n.exBP.frequency, 600 + this.thr * 700 + this.rpm * 400, now, 0.08);
    glide(n.out.gain, on ? 0.1 + this.thr * 0.08 + this.rpm * 0.05 : 0, now, on ? 0.08 : 0.25);
  }

  update(now) {
    if (!this.n) return;
    if (this.on && now - this.last > 0.4) { // watchdog
      this.on = false;
      this.apply(now);
    }
    if (now > this.nextJit) { // lumpy, wandering idle
      this.jit = 1 + rand(-0.05, 0.05) * (1 - this.rpm * 0.7);
      this.nextJit = now + rand(0.08, 0.16);
      this.apply(now);
    }
    if (!this.on) {
      if (!this.quietSince) this.quietSince = now;
      else if (now - this.quietSince > 2.5) this.teardown();
    } else this.quietSince = 0;
  }
}
