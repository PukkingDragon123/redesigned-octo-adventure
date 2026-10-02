// Ambient beds + randomized events, each layer crossfaded by setAmbience().
// Layers build lazily when their level rises above zero and tear themselves
// down after a few seconds at zero. Random events are scheduled from update()
// relative to ctx.currentTime, never as a backlog.
import { clamp, rand, randi, pick, chance, env, glide } from './synth.js';
import { owlCall } from './sfx2.js';

const LEVEL = { forest: 0.85, village: 0.63, river: 0.5, wind: 0.69, rain: 0.5, fire: 0.5, night: 0.6 };
const WET = { forest: 0.25, village: 0.3, river: 0.08, wind: 0.05, rain: 0.1, fire: 0.06, night: 0.3 };
export const AMB_NAMES = Object.keys(LEVEL);

// ------------------------------------------------------------ event voices

function tone(L, dest, t, f1, f2, dur, v, type = 'sine') {
  const ctx = L.sys.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const end = env(g.gain, t, Math.min(0.012, dur * 0.3), v, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(end + 0.01);
  o.onended = () => g.disconnect();
  return end;
}

function burst(L, dest, t, dur, v, type, f, q, buf = 'white') {
  const ctx = L.sys.ctx, s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = L.sys.kit[buf];
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  const end = env(g.gain, t, 0.001, v, dur);
  s.connect(b);
  b.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(end + 0.01);
  s.onended = () => g.disconnect();
  return end;
}

function bird(L, t) {
  const pan = L.panner(rand(-0.85, 0.85)), v = rand(0.04, 0.11), r = Math.random();
  let end = t;
  if (r < 0.22) { // black-capped chickadee "fee-bee"
    const f = rand(3600, 4000);
    tone(L, pan, t, f, f * 0.99, 0.3, v);
    end = tone(L, pan, t + 0.38, f * 0.89, f * 0.87, 0.32, v * 0.9);
  } else if (r < 0.34) { // white-throated sparrow "oh sweet Canada Canada Canada"
    const f = rand(2900, 3200);
    tone(L, pan, t, f, f, 0.42, v);
    tone(L, pan, t + 0.5, f * 1.33, f * 1.33, 0.42, v);
    let tt = t + 1.0;
    for (let i = 0; i < 9; i++) {
      end = tone(L, pan, tt, f * 1.25, f * 1.24, 0.1, v * 0.85);
      tt += i % 3 === 2 ? 0.2 : 0.13;
    }
  } else if (r < 0.7) { // warbling phrase
    let tt = t;
    for (let i = 0, n = randi(3, 6); i < n; i++) {
      const f = rand(2200, 3600), d = rand(0.07, 0.15);
      end = tone(L, pan, tt, f, f * rand(0.75, 1.3), d, v * rand(0.7, 1));
      tt += d + rand(0.03, 0.1);
    }
  } else { // quick chirps
    let tt = t;
    for (let i = 0, n = randi(2, 5); i < n; i++) {
      const f = rand(4000, 6000);
      end = tone(L, pan, tt, f, f * 0.7, rand(0.03, 0.05), v * 0.8);
      tt += rand(0.06, 0.12);
    }
  }
  L.drop(end, pan);
}

function woodpecker(L, t) {
  const pan = L.panner(rand(-0.9, 0.9)), n = randi(10, 18), rate = rand(15, 20);
  let end = t;
  for (let i = 0; i < n; i++) {
    const tt = t + i / rate, v = 0.05 * (1 - (i / n) * 0.5);
    end = tone(L, pan, tt, 900, 600, 0.02, v, 'triangle');
    burst(L, pan, tt, 0.012, v * 0.8, 'bandpass', 1500, 2);
  }
  L.drop(end, pan);
}

function gull(L, t) {
  const ctx = L.sys.ctx, pan = L.panner(rand(-0.8, 0.8)), v = rand(0.035, 0.07), f = rand(1300, 1600);
  const call = (tt, d, ff) => {
    const o = ctx.createOscillator(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueCurveAtTime(Float32Array.from([ff * 0.85, ff * 1.2, ff * 1.05, ff * 0.75]), tt, d);
    b.type = 'bandpass';
    b.frequency.value = 1900;
    b.Q.value = 2.2;
    const e = env(g.gain, tt, 0.02, v, d, d * 0.4);
    o.connect(b);
    b.connect(g);
    g.connect(pan);
    o.start(tt);
    o.stop(e);
    o.onended = () => g.disconnect();
    return e;
  };
  let end = call(t, rand(0.3, 0.42), f);
  for (let i = 0, n = randi(1, 4); i < n; i++) end = call(end + rand(0.04, 0.1), 0.11, f * rand(1.0, 1.15));
  L.drop(end, pan);
}

function dockCreak(L, t) {
  const ctx = L.sys.ctx, pan = L.panner(rand(-0.6, 0.6)), dur = rand(0.4, 0.9), base = rand(55, 90);
  const fc = new Float32Array(24);
  let f = base;
  for (let i = 0; i < fc.length; i++) {
    f = clamp(f * rand(0.86, 1.17), base * 0.55, base * 1.9);
    fc[i] = f;
  }
  const o = ctx.createOscillator(), b = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueCurveAtTime(fc, t, dur);
  b.type = 'bandpass';
  b.frequency.value = rand(800, 1300);
  b.Q.value = 6;
  const end = env(g.gain, t, 0.05, rand(0.025, 0.05), dur, dur * 0.5);
  o.connect(b);
  b.connect(g);
  g.connect(pan);
  o.start(t);
  o.stop(end);
  o.onended = () => g.disconnect();
  L.drop(end, pan);
}

function boatBell(L, t) { // ship's bell, struck twice, far across the water
  const pan = L.panner(rand(-0.7, 0.7)), f = rand(560, 720), v = rand(0.025, 0.045);
  let end = t;
  for (const st of [0, 0.62]) {
    for (const [r, a, d] of [[0.5, 0.5, 3.0], [1, 1, 2.4], [1.2, 0.5, 1.8], [1.5, 0.35, 1.5], [2.0, 0.3, 1.0], [2.66, 0.15, 0.6]]) {
      end = Math.max(end, tone(L, pan, t + st, f * r, f * r * 0.999, d, v * a));
    }
  }
  L.drop(end, pan);
}

function cricket(L, c, t) {
  const ctx = L.sys.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = c.f * rand(0.995, 1.005);
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < c.pulses; i++) {
    const s = t + i * 0.034;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(c.v, s + 0.004);
    g.gain.setValueAtTime(c.v, s + 0.012);
    g.gain.linearRampToValueAtTime(0, s + 0.018);
  }
  o.connect(g);
  g.connect(c.pan);
  o.start(t);
  o.stop(t + c.pulses * 0.034 + 0.02);
  o.onended = () => g.disconnect();
}

// ------------------------------------------------------------ layer recipes
// build(L, now) creates the continuous bed; tick(L, now, level) runs events.

const RECIPES = {
  forest: {
    build(L, now) {
      L.p.rustle = L.chain(L.loop('pink'), L.bq('highpass', 1800), L.bq('lowpass', 7000), L.gain(0.3));
      L.ev = { rustle: 0, bird: now + rand(0.5, 2), pecker: now + rand(20, 40) };
    },
    tick(L, now, lvl) {
      if (now > L.ev.rustle) {
        glide(L.p.rustle.gain, rand(0.12, 0.55), now, rand(0.3, 0.9));
        L.ev.rustle = now + rand(0.4, 1.6);
      }
      if (now > L.ev.bird) {
        bird(L, now + 0.05);
        L.ev.bird = now + rand(0.8, 4) / (0.4 + lvl);
      }
      if (now > L.ev.pecker) {
        woodpecker(L, now + 0.05);
        L.ev.pecker = now + rand(25, 60);
      }
    },
  },

  village: {
    build(L, now) {
      const pk = L.loop('pink'), lpd = L.bq('lowpass', 1500);
      L.chain(lpd, L.gain(0.5));
      L.p.am = [[480, 1.6], [1150, 2]].map(([f, q]) => { // murmuring voices: formant bands with syllabic AM
        const b = L.bq('bandpass', f, q), a = L.gain(0.3);
        pk.connect(b);
        b.connect(a);
        a.connect(lpd);
        return a;
      });
      L.p.vo = [130, 205].map((f) => { // a touch of voiced pitch
        const o = L.osc('sawtooth', f), b = L.bq('bandpass', 650, 2.5), a = L.gain(0);
        o.connect(b);
        b.connect(a);
        a.connect(lpd);
        return { o, a, f, base: f };
      });
      L.p.lap = L.chain(L.loop('brown'), L.bq('lowpass', 450), L.gain(0.1)); // water lapping the stilts
      L.ev = { syl: 0, lap: 0, lapDown: 0, gull: now + rand(2, 6), creak: now + rand(2, 5), bell: now + rand(5, 12) };
    },
    tick(L, now) {
      if (now > L.ev.syl) {
        for (const a of L.p.am) glide(a.gain, chance(0.25) ? 0.02 : rand(0.1, 0.5), now, 0.03);
        for (const v of L.p.vo) {
          v.f = clamp(v.f * rand(0.92, 1.08), v.base * 0.75, v.base * 1.35);
          glide(v.a.gain, chance(0.35) ? 0 : rand(0.02, 0.07), now, 0.035);
          glide(v.o.frequency, v.f, now, 0.06);
        }
        L.ev.syl = now + rand(0.07, 0.22);
      }
      if (now > L.ev.lap) {
        glide(L.p.lap.gain, rand(0.25, 0.6), now, 0.25);
        L.ev.lap = now + rand(1.2, 2.8);
        L.ev.lapDown = now + 0.5;
      }
      if (L.ev.lapDown && now > L.ev.lapDown) {
        glide(L.p.lap.gain, 0.08, now, 0.5);
        L.ev.lapDown = 0;
      }
      if (now > L.ev.gull) {
        gull(L, now + 0.05);
        L.ev.gull = now + rand(4, 13);
      }
      if (now > L.ev.creak) {
        dockCreak(L, now + 0.05);
        L.ev.creak = now + rand(3, 8);
      }
      if (now > L.ev.bell) {
        boatBell(L, now + 0.05);
        L.ev.bell = now + rand(10, 24);
      }
    },
  },

  river: {
    build(L, now) {
      L.chain(L.loop('pink'), L.bq('lowpass', 1200), L.gain(0.5));
      L.p.bp = L.bq('bandpass', 700, 2.5);
      L.p.bg = L.chain(L.loop('white'), L.p.bp, L.gain(0.22));
      L.chain(L.loop('brown'), L.bq('lowpass', 300), L.gain(0.4));
      L.p.pans = [-0.5, 0, 0.5].map((x) => L.panner(x));
      L.ev = { burble: 0, bubble: now };
    },
    tick(L, now, lvl) {
      if (now > L.ev.burble) {
        glide(L.p.bp.frequency, rand(400, 1100), now, 0.08);
        glide(L.p.bg.gain, rand(0.12, 0.3), now, 0.1);
        L.ev.burble = now + rand(0.12, 0.3);
      }
      for (let guard = 0; L.ev.bubble < now + 0.1 && guard < 8; guard++) {
        const t = Math.max(L.ev.bubble, now + 0.01), f = rand(350, 900);
        tone(L, pick(L.p.pans), t, f, f * rand(1.4, 2.0), rand(0.02, 0.05), rand(0.01, 0.035));
        L.ev.bubble = t + rand(0.05, 0.2) / (0.5 + lvl);
      }
    },
  },

  wind: {
    build(L) {
      const pk = L.loop('pink');
      L.p.gbp = L.bq('bandpass', 500, 0.9);
      L.p.gust = L.chain(pk, L.p.gbp, L.gain(0.4));
      L.p.rum = L.chain(L.loop('brown'), L.bq('lowpass', 220), L.gain(0.3));
      L.p.wh = L.bq('bandpass', 1400, 14); // whistling through branches
      L.p.wg = L.chain(pk, L.p.wh, L.gain(0));
      L.ev = { gust: 0 };
    },
    tick(L, now) {
      if (now > L.ev.gust) {
        const s = rand(0.15, 1), tc = rand(0.6, 1.4);
        glide(L.p.gust.gain, s * 0.6, now, tc);
        glide(L.p.gbp.frequency, rand(320, 900), now, tc);
        glide(L.p.rum.gain, 0.15 + s * 0.35, now, tc);
        glide(L.p.wh.frequency, rand(900, 1900), now, 1.5);
        glide(L.p.wg.gain, s * rand(0, 0.6), now, tc);
        L.ev.gust = now + rand(1.2, 4);
      }
    },
  },

  rain: {
    build(L, now) {
      L.chain(L.loop('white'), L.bq('highpass', 3200), L.bq('lowpass', 9000), L.gain(0.3)); // hiss on leaves
      L.chain(L.loop('pink'), L.bq('bandpass', 1100, 0.6), L.gain(0.35)); // patter
      L.p.cr = L.loop('crackle'); // countless small drops
      L.chain(L.p.cr, L.bq('bandpass', 2600, 0.7), L.gain(0.5));
      L.chain(L.loop('brown'), L.bq('lowpass', 350), L.gain(0.25));
      L.p.pans = [-0.6, 0, 0.6].map((x) => L.panner(x));
      L.ev = { drip: now + 0.3, rate: 0 };
    },
    tick(L, now, lvl) {
      if (now > L.ev.rate) {
        glide(L.p.cr.playbackRate, rand(0.8, 1.25), now, 0.5);
        L.ev.rate = now + rand(0.5, 1.5);
      }
      if (now > L.ev.drip) { // bigger drip off a leaf or the eaves
        const f = rand(1300, 3200);
        tone(L, pick(L.p.pans), now + 0.02, f, f * 0.72, rand(0.05, 0.1), rand(0.02, 0.06));
        L.ev.drip = now + rand(0.15, 0.9) / (0.4 + lvl);
      }
    },
  },

  fire: {
    build(L, now) {
      L.p.roar = L.chain(L.loop('brown'), L.bq('lowpass', 280), L.gain(0.5));
      L.chain(L.loop('pink'), L.bq('bandpass', 600, 0.5), L.gain(0.08));
      L.p.cr = L.loop('crackle');
      L.p.cg = L.chain(L.p.cr, L.bq('highpass', 1200), L.gain(0.6));
      L.ev = { roar: 0, rate: 0, pop: now + 0.5 };
    },
    tick(L, now) {
      if (now > L.ev.roar) {
        glide(L.p.roar.gain, rand(0.3, 0.8), now, rand(0.2, 0.6));
        L.ev.roar = now + rand(0.3, 1.0);
      }
      if (now > L.ev.rate) {
        glide(L.p.cr.playbackRate, rand(0.7, 1.3), now, 0.3);
        glide(L.p.cg.gain, rand(0.3, 0.8), now, 0.3);
        L.ev.rate = now + rand(0.4, 1.2);
      }
      if (now > L.ev.pop) {
        const t = now + 0.02, n = chance(0.3) ? randi(2, 4) : 1;
        for (let i = 0; i < n; i++) burst(L, L.bus, t + i * rand(0.01, 0.03), rand(0.004, 0.012), rand(0.05, 0.25), 'bandpass', rand(1500, 4000), 1);
        if (chance(0.06)) { // a log settles
          tone(L, L.bus, t, 90, 50, 0.15, 0.12);
          burst(L, L.bus, t, 0.2, 0.08, 'highpass', 2000, 0.7, 'crackle');
        }
        if (chance(0.08)) burst(L, L.bus, t, 0.25, 0.03, 'highpass', 4000, 0.7); // sap hiss
        L.ev.pop = now + rand(0.25, 2.2);
      }
    },
  },

  night: {
    build(L, now) {
      L.chain(L.loop('brown'), L.bq('lowpass', 180), L.gain(0.25));
      L.p.crickets = [0, 1, 2].map(() => ({
        f: rand(4200, 5200), pan: L.panner(rand(-0.75, 0.75)), iv: rand(0.55, 1.1), pulses: randi(2, 4), next: now + rand(0, 1), v: rand(0.03, 0.06),
      }));
      L.ev = { owl: now + rand(8, 20) };
    },
    tick(L, now) {
      for (const c of L.p.crickets) {
        if (c.next < now) c.next = now + 0.02;
        if (c.next < now + 0.15) {
          cricket(L, c, c.next);
          c.next += c.iv * rand(0.92, 1.08) + (chance(0.06) ? rand(2, 6) : 0);
        }
      }
      if (now > L.ev.owl) {
        const og = L.panner(rand(-0.8, 0.8)), g = L.sys.ctx.createGain();
        g.gain.value = 0.35;
        g.connect(og);
        const c = { k: L.sys.kit, ctx: L.sys.ctx, out: g, wet: null, t: now + 0.05, p: rand(0.95, 1.05), end: now };
        owlCall(c);
        L.drop(c.end, g, og);
        L.ev.owl = now + rand(14, 32);
      }
    },
  },
};

// ------------------------------------------------------------ layer + mixer

class Layer {
  constructor(amb, name) {
    this.amb = amb;
    this.sys = amb.sys;
    this.name = name;
    this.target = 0;
    this.bus = null;
    this.srcs = [];
    this.p = {};
    this.ev = {};
    this.zeroSince = 0;
  }

  ensure(now) {
    if (this.bus) return;
    const ctx = this.sys.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.amb.out);
    this.wet = ctx.createGain();
    this.wet.gain.value = WET[this.name];
    this.bus.connect(this.wet);
    this.wet.connect(this.sys.sfxVerb);
    this.srcs = [];
    this.p = {};
    this.ev = {};
    this.zeroSince = 0;
    RECIPES[this.name].build(this, now);
  }

  teardown() {
    if (!this.bus) return;
    for (const s of this.srcs) { try { s.stop(); } catch (e) { /* noop */ } }
    try { this.bus.disconnect(); this.wet.disconnect(); } catch (e) { /* noop */ }
    this.bus = null;
    this.srcs = [];
  }

  loop(name, rate = 1) {
    const ctx = this.sys.ctx, s = ctx.createBufferSource(), buf = this.sys.kit[name];
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(ctx.currentTime, Math.random() * buf.duration);
    this.srcs.push(s);
    return s;
  }
  osc(type, f) {
    const o = this.sys.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    this.srcs.push(o);
    return o;
  }
  bq(type, f, q = 0.7) {
    const b = this.sys.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  gain(v) {
    const g = this.sys.ctx.createGain();
    g.gain.value = v;
    return g;
  }
  /** Wire nodes in series; a trailing GainNode lands on the layer bus. Returns the last node. */
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    const last = nodes[nodes.length - 1];
    if (last.gain && !last.frequency) last.connect(this.bus); // GainNode
    return last;
  }
  panner(x) {
    const ctx = this.sys.ctx;
    if (!ctx.createStereoPanner) return this.bus;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(x, -1, 1);
    p.connect(this.bus);
    return p;
  }
  /** Disconnect transient event nodes once they're done (bus itself is kept). */
  drop(end, ...nodes) {
    const list = nodes.filter((n) => n && n !== this.bus);
    if (list.length) this.sys.dispose(end + 0.3, ...list);
  }
}

export class Ambience {
  constructor(sys) {
    this.sys = sys;
    this.out = sys.ctx.createGain();
    this.out.connect(sys.ambBus);
    this.layers = {};
    for (const n of AMB_NAMES) this.layers[n] = new Layer(this, n);
  }

  set(o) {
    if (!o || typeof o !== 'object') return;
    const now = this.sys.ctx.currentTime;
    for (const name of AMB_NAMES) {
      if (!(name in o)) continue;
      const v = clamp(Number(o[name]) || 0, 0, 1), L = this.layers[name];
      L.target = v;
      if (v > 0.001) L.ensure(now);
      if (L.bus) glide(L.bus.gain, v * LEVEL[name], now, 0.7);
    }
  }

  update(now) {
    for (const name of AMB_NAMES) {
      const L = this.layers[name];
      if (!L.bus) continue;
      if (L.target > 0.001) {
        L.zeroSince = 0;
        try { RECIPES[name].tick(L, now, L.target); } catch (e) { /* keep the world turning */ }
      } else if (!L.zeroSince) L.zeroSince = now;
      else if (now - L.zeroSince > 5) L.teardown();
    }
  }
}
