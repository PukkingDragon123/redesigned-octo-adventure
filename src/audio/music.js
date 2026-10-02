// Generative cozy music: lookahead step scheduler + per-mood arrangements.
// Each mood loops an A A' B A' form (4 bars per section). Melodies are
// generated from the scale: chord tones on strong beats, mostly stepwise
// motion, bar-3 sequences of the bar-1 motif, cadences that resolve. A' reuses
// A's first half and answers it on the tonic; phrases mutate between cycles.
import {
  rand, pick, chance, pluck, strum, piano, pad, bass, kick, brush, shaker, wood,
  bell, reed, fiddle, flute, chip, Theremin,
} from './synth.js';

const LOOKAHEAD = 0.25; // seconds scheduled ahead of currentTime
const XFADE = 2.0; // crossfade seconds
const CAP = 44; // soft polyphony cap (note events still sounding)
const FORM = ['A', 'A2', 'B', 'A2'];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HMINOR = [0, 2, 3, 5, 7, 8, 11];

// One-bar rhythm templates in eighth-note steps.
const R4 = [[2, 2, 2, 2], [2, 1, 1, 2, 2], [3, 1, 2, 2], [2, 2, 4], [1, 1, 2, 2, 2], [4, 2, 2], [2, 2, 2, 1, 1], [3, 3, 2], [2, 1, 1, 4]];
const R4_SLOW = [[4, 4], [2, 2, 4], [6, 2], [4, 2, 2], [3, 1, 4], [2, 6], [2, 2, 2, 2]];
const R4_BUSY = [[1, 1, 1, 1, 2, 2], [2, 1, 1, 2, 1, 1], [1, 1, 2, 1, 1, 2], [2, 2, 1, 1, 2], [1, 1, 1, 1, 1, 1, 2], [3, 1, 2, 2]];
const R3 = [[2, 2, 2], [4, 2], [2, 1, 1, 2], [3, 1, 2], [2, 4], [1, 1, 2, 2]];
const CAD4 = [[4, 4], [2, 2, 4], [8], [2, 6]];
const CAD3 = [[6], [2, 4]];

const mod = (a, n) => ((a % n) + n) % n;
const d2m = (def, d) => def.root + def.scale[mod(d, 7)] + 12 * Math.floor(d / 7);
const place = (m, lo) => lo + mod(m - lo, 12);
const hv = (v) => v * rand(0.88, 1.08);

function isTone(def, d, r) {
  const x = mod(d - r, 7);
  return x === 0 || x === 2 || x === 4 || (def.sevenths && x === 6);
}
function nearestTone(def, x, r) {
  for (let k = 0; k <= 4; k++) {
    const s = chance(0.5) ? 1 : -1;
    if (isTone(def, x + s * k, r)) return x + s * k;
    if (isTone(def, x - s * k, r)) return x - s * k;
  }
  return x;
}
/** The n-th chord tone above (dir=1) or below (dir=-1) degree x. */
function nextTone(def, x, r, dir, n = 1) {
  let d = x;
  for (let i = 0; i < 9; i++) {
    d += dir;
    if (isTone(def, d, r) && --n <= 0) return d;
  }
  return nearestTone(def, x, r);
}
function tonicNear(x, lo, hi) {
  let best = 0, bd = 1e9;
  for (let c = -14; c <= 28; c += 7) {
    if (c < lo - 2 || c > hi + 2) continue;
    if (Math.abs(c - x) < bd) { bd = Math.abs(c - x); best = c; }
  }
  return best;
}

/** One 4-bar phrase over `chords` (scale-degree roots). `base` = copy its first half. */
function genPhrase(def, chords, base, lift = 0) {
  const spb = def.meter * 2, R = def.rhythms || (def.meter === 3 ? R3 : R4), CAD = def.meter === 3 ? CAD3 : CAD4;
  const lo = def.mel[0] + lift, hi = def.mel[1] + lift, strong = def.meter === 3 ? 6 : 4;
  const notes = [];
  let prev = nearestTone(def, Math.round((lo + hi) / 2), chords[0]);
  let dir = chance(0.5) ? 1 : -1, motif = null, startBar = 0;
  if (base) {
    for (const n of base) if (n.step < 2 * spb) notes.push({ ...n });
    if (notes.length) prev = notes[notes.length - 1].deg;
    motif = base.filter((n) => n.step < spb);
    startBar = 2;
  }
  for (let bar = startBar; bar < 4; bar++) {
    const r = chords[bar], final = bar === 3;
    if (bar === 2 && motif && motif.length && chance(0.55)) { // sequence the opening motif
      let sh = mod(r - chords[0] + 3, 7) - 3;
      const degs = motif.map((n) => n.deg);
      if (Math.max(...degs) + sh > hi + 1) sh -= 7;
      else if (Math.min(...degs) + sh < lo - 1) sh += 7;
      if (Math.max(...degs) + sh <= hi + 2 && Math.min(...degs) + sh >= lo - 2) {
        for (const n of motif) notes.push({ step: n.step + 2 * spb, len: n.len, deg: n.deg + sh });
        prev = notes[notes.length - 1].deg;
        continue;
      }
    }
    const rhythm = final ? pick(CAD) : pick(R), bn = [];
    let pos = 0;
    for (let i = 0; i < rhythm.length; i++) {
      const len = rhythm[i], last = final && i === rhythm.length - 1;
      let deg;
      if (last) deg = mod(r, 7) === 0 ? tonicNear(prev, lo, hi) : nearestTone(def, prev, r);
      else if (pos % strong === 0 || len >= 4) { // strong beat: move to a chord tone, rarely stay put
        if (prev + dir * 2 > hi || prev + dir * 2 < lo) dir = -dir;
        const x = Math.random();
        deg = x < 0.14 ? nearestTone(def, prev, r) : nextTone(def, prev, r, dir, x < 0.9 ? 1 : 2);
      } else { // weak beat: mostly stepwise passing/neighbour tones
        const x = Math.random();
        let cand = x < 0.66 ? prev + dir : x < 0.84 ? prev + 2 * dir : x < 0.94 ? prev - dir : prev;
        if (cand > hi) { cand = 2 * hi - cand; dir = -1; } else if (cand < lo) { cand = 2 * lo - cand; dir = 1; }
        deg = cand;
      }
      while (deg > hi + 2) deg -= 7;
      while (deg < lo - 2) deg += 7;
      if (chance(0.22)) dir = -dir;
      if (last || (bar === 0 && i === 0) || !chance(def.rest ?? 0.12)) bn.push({ step: bar * spb + pos, len, deg });
      prev = deg;
      pos += len;
    }
    if (bar === 0) motif = bn;
    notes.push(...bn);
  }
  return notes;
}

// ------------------------------------------------------------------ moods
// arrange(P, s) is called for every eighth-note step. s: { t, sib (step in
// bar), off (offbeat), bar, sec, cycle, deg, nextDeg, mel, sd, barDur }.

const MOODS = {
  title: {
    gain: 1.5, bpm: 92, meter: 3, root: 65, scale: MAJOR, verb: 0.36, mel: [4, 13], rest: 0.12,
    prog: { A: [0, 5, 3, 4], A2: [0, 5, 4, 0], B: [3, 0, 1, 4] },
    arrange(P, s) {
      if (s.sib === 0) {
        P.pluck(P.root(s.deg, 41), s.t, 0.42, 'guitar', s.barDur * 0.95, 1);
        P.pad(P.voice(s.deg, 57), s.t, s.barDur * 0.9, 0.06, { attack: 0.5, release: 1.0, cutoff: 1100 });
      }
      if (s.sib === 2 || s.sib === 4) P.strum(P.voice(s.deg, 55), s.t, 0.2, false, 0.012, 'guitar', s.sd * 1.7);
      if (s.mel) {
        if (s.sec === 'B') {
          P.pluck(s.mel.midi, s.t, 0.3, 'harp', 0, 1);
          P.bell(s.mel.midi + 12, s.t, 0.07, 'musicbox');
        } else P.bell(s.mel.midi, s.t, 0.22, 'musicbox', 1);
      }
      if (s.sec === 'A2' && s.sib === 5 && chance(0.4)) P.chip(pick(P.voice(s.deg, 84)), s.t, s.sd * 0.7, 0.02, 0.125);
    },
  },

  forest: {
    gain: 1.75, bpm: 85, meter: 4, root: 62, scale: LYDIAN, verb: 0.32, mel: [4, 12], rest: 0.3, swing: 0.05,
    rhythms: R4_SLOW.concat([[2, 2, 4], [3, 1, 2, 2]]),
    prog: { A: [0, 1, 0, 1], A2: [0, 1, 4, 0], B: [5, 2, 1, 4] },
    arrange(P, s) {
      const v = P.voice(s.deg, 57), r = P.root(s.deg, 40);
      const travis = [r, v[1], r + 7, v[2], r, v[0] + 12, r + 7, v[1]];
      P.pluck(travis[s.sib], s.t, s.off ? 0.17 : 0.27, 'guitar', s.off ? 0 : s.sd * 2.2);
      if (s.sib === 0) P.pad(P.voice(s.deg, 50), s.t, s.barDur, 0.045, { attack: 1.2, release: 1.6, cutoff: 750 });
      if (s.mel && (s.sec !== 'A' || s.cycle % 2 === 1)) P.flute(s.mel.midi, s.t, s.mel.dur, 0.085);
      if (s.sec === 'B' && s.bar === 3 && s.sib === 4) P.voice(s.deg, 74).forEach((n, i) => P.pluck(n, s.t + i * 0.09, 0.12, 'harp'));
    },
  },

  delivery: {
    gain: 0.65, bpm: 112, meter: 4, root: 67, scale: MAJOR, verb: 0.18, mel: [0, 9], rest: 0.08, swing: 0.07,
    prog: { A: [0, 3, 0, 4], A2: [0, 3, 4, 0], B: [5, 3, 0, 4] },
    arrange(P, s) {
      const st = [1, 0, 1, -1, 0, -1, 1, -1][s.sib]; // D . D U . U D U
      if (st) {
        const v = P.voice(s.deg, 52), notes = [P.root(s.deg, 40), ...v, v[0] + 12];
        if (st > 0) P.strum(notes, s.t, 0.16, false, 0.011, 'guitar', s.sd * 1.7);
        else P.strum(notes.slice(-3), s.t, 0.1, true, 0.007, 'guitar', s.sd * 1.1);
      }
      const r = P.root(s.deg, 38);
      if (s.sib === 0) P.bass(r, s.t, 0.42, s.sd * 1.8);
      else if (s.sib === 4) P.bass(r + 7, s.t, 0.36, s.sd * 1.6);
      else if (s.sib === 6 && chance(0.55)) P.bass(P.root(s.nextDeg + (chance(0.5) ? -1 : 1), 38), s.t, 0.3, s.sd * 1.5);
      if (s.sib === 0 || s.sib === 4) P.kick(s.t, 0.3);
      if (s.sib === 2 || s.sib === 6) P.brush(s.t, 0.12);
      P.shaker(s.t, s.off ? 0.05 : 0.025);
      if (s.mel) {
        P.pluck(s.mel.midi, s.t, 0.3, 'banjo', s.mel.dur + 0.05, 1);
        if (s.sec === 'B') P.chip(s.mel.midi + 12, s.t, s.mel.dur * 0.8, 0.02, 0.25);
      } else if (s.off && chance(0.5)) P.pluck(pick(P.voice(s.deg, 67)), s.t, 0.09, 'banjo');
    },
  },

  village: {
    gain: 0.62, bpm: 100, meter: 4, root: 62, scale: MAJOR, verb: 0.24, mel: [2, 11], rest: 0.05, rhythms: R4_BUSY, vib: 9,
    prog: { A: [0, 0, 3, 4], A2: [0, 0, 4, 0], B: [3, 0, 5, 4] },
    arrange(P, s) {
      const r = P.root(s.deg, 38);
      if (s.sib === 0) P.bass(r, s.t, 0.42, s.sd * 1.7);
      if (s.sib === 4) P.bass(r + 7, s.t, 0.36, s.sd * 1.7);
      if (s.sib === 2 || s.sib === 6) P.reed(P.voice(s.deg, 57), s.t, s.sd * 0.8, 0.06); // oom-PAH
      if (!s.off) P.kick(s.t, s.sib % 4 === 0 ? 0.22 : 0.14, 90, 42); // foot-tapping (podorythmie)
      else P.wood(s.t, 0.035, 1500);
      if (s.mel) {
        if (s.sec === 'B') P.reed([s.mel.midi], s.t, s.mel.dur, 0.085, 1);
        else P.fiddle(s.mel.midi, s.t, s.mel.dur, 0.09);
      }
    },
  },

  cabin: {
    gain: 1.12, bpm: 70, meter: 4, root: 63, scale: MAJOR, verb: 0.3, mel: [3, 11], rest: 0.15, rhythms: R4_SLOW,
    prog: { A: [0, 3, 0, 4], A2: [0, 3, 4, 0], B: [5, 2, 3, 4] },
    arrange(P, s) {
      const r = P.root(s.deg, 39), t10 = P.root(s.deg + 2, r + 12);
      const lh = [r, r + 7, t10, r + 7, r + 12, r + 7, t10, r + 7];
      P.piano(lh[s.sib], s.t, s.sib === 0 ? 0.2 : 0.13, s.sd * 2.5);
      if (s.sib === 0) P.pad(P.voice(s.deg, 55), s.t, s.barDur, 0.03, { attack: 1.0, release: 1.5, cutoff: 800 });
      if (s.mel) {
        P.piano(s.mel.midi, s.t, 0.25, s.mel.dur, 1);
        if (s.sec === 'B' && chance(0.6)) P.bell(s.mel.midi + 12, s.t, 0.05, 'musicbox');
      }
    },
  },

  night: {
    gain: 1.0, bpm: 60, meter: 4, root: 62, scale: DORIAN, verb: 0.5, mel: [7, 14], rest: 0.35, rhythms: R4_SLOW, lift: 1,
    prog: { A: [0, 3, 0, 3], A2: [0, 3, 6, 0], B: [2, 6, 3, 4] },
    arrange(P, s) {
      if (s.sib === 0) {
        P.pad(P.voice(s.deg, 52), s.t, s.barDur, 0.055, { attack: 1.8, release: 2.2, cutoff: 650 });
        P.bass(P.root(s.deg, 38), s.t, 0.16, s.barDur * 0.7);
      }
      if (s.mel) P.bell(s.mel.midi, s.t, 0.17, 'musicbox', 1);
      else if (s.sib === 5 && chance(0.18)) P.bell(pick(P.voice(s.deg, 81)), s.t, 0.05, 'glock');
      if (s.sec === 'B' && s.sib === 4 && chance(0.3)) P.piano(P.root(s.deg, 50) + 12, s.t, 0.06, s.sd * 4);
    },
  },

  spooky: {
    gain: 1.6, bpm: 90, meter: 4, root: 62, scale: HMINOR, verb: 0.3, mel: [5, 12], rest: 0.15,
    prog: { A: [0, 3, 4, 4], A2: [0, 3, 4, 0], B: [3, 0, 5, 4] },
    arrange(P, s) {
      const r = P.root(s.deg, 38);
      const b = [r, 0, r + 7, 0, r + 12, 0, P.root(s.nextDeg, 38) - 1, 0][s.sib]; // creeping chromatic walk
      if (b) P.pluck(b, s.t, s.sib === 0 ? 0.55 : 0.42, 'pizz', 0, 1);
      if (s.sib === 3 || s.sib === 7) P.strum(P.voice(s.deg, 55), s.t, 0.15, false, 0.004, 'pizz');
      if (s.sib === 2 || s.sib === 6) P.wood(s.t, 0.05, s.sib === 2 ? 1250 : 950); // tick... tock...
      if (s.mel) {
        if (s.sec === 'B') P.bell(s.mel.midi, s.t, 0.22, 'xylo', 1); // dancing skeleton xylophone
        else P.theremin(s.mel.midi, s.t, s.mel.dur, 0.12);
      }
    },
  },

  rain: {
    gain: 0.63, bpm: 72, meter: 4, root: 65, scale: MAJOR, verb: 0.34, mel: [4, 12], rest: 0.3, swing: 0.16, sevenths: true, rhythms: R4_SLOW,
    prog: { A: [0, 5, 1, 4], A2: [0, 5, 4, 0], B: [3, 2, 1, 4] },
    arrange(P, s) {
      const v = P.voice(s.deg, 53, 4), r = P.root(s.deg, 36);
      if (s.sib === 0) {
        v.forEach((m, i) => P.piano(m, s.t + i * 0.018, 0.12, s.sd * 5));
        P.pad(v, s.t, s.barDur, 0.03, { attack: 0.9, release: 1.4, cutoff: 900 });
        P.bass(r, s.t, 0.3, s.sd * 3);
        P.kick(s.t, 0.13, 90, 45);
      }
      if (s.sib === 3 && chance(0.6)) v.slice(1).forEach((m, i) => P.piano(m, s.t + i * 0.015, 0.08, s.sd * 2));
      if (s.sib === 5) {
        P.bass(r + 7, s.t, 0.22, s.sd * 2);
        if (chance(0.5)) P.kick(s.t, 0.1, 90, 45);
      }
      if (s.sib === 4) P.brush(s.t, 0.06, 0.2);
      if (s.mel) P.piano(s.mel.midi, s.t, 0.2, s.mel.dur, 1);
    },
  },
};

export const MOOD_NAMES = Object.keys(MOODS).concat('none');

// ------------------------------------------------------------------ player

class Player {
  constructor(music, def) {
    const sys = music.sys, ctx = sys.ctx;
    this.m = music;
    this.sys = sys;
    this.k = sys.kit;
    this.def = def;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(sys.musicBus);
    this.send = ctx.createGain();
    this.send.gain.value = def.verb ?? 0.25;
    this.out.connect(this.send);
    this.send.connect(sys.musicVerb);
    this.lfo = ctx.createOscillator(); // shared vibrato for reeds, fiddle, flute
    this.lfo.frequency.value = 5.3;
    this.vib = ctx.createGain();
    this.vib.gain.value = def.vib ?? 8;
    this.lfo.connect(this.vib);
    this.lfo.start();
    this.sd = 60 / def.bpm / 2;
    this.spb = def.meter * 2;
    this.step = 0;
    this.next = 0;
    this.cycle = -1;
    this.phr = {};
    this.mel = {};
    this.endAt = Infinity;
    this.done = false;
    this.thr = null;
  }

  start(t, fade) {
    const g = this.out.gain;
    g.setValueAtTime(0, t);
    g.setTargetAtTime(this.def.gain ?? 1, t, fade / 3);
    this.next = t + 0.05;
  }

  fadeOut(now, fade) {
    const g = this.out.gain, v = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(v, now);
    g.setTargetAtTime(0, now, fade / 4);
    this.endAt = now + fade;
  }

  stop() {
    if (this.done) return;
    this.done = true;
    const t = this.sys.ctx.currentTime;
    try { this.lfo.stop(t + 0.05); } catch (e) { /* noop */ }
    try { if (this.thr) this.thr.stop(t); } catch (e) { /* noop */ }
    try { this.out.disconnect(); this.send.disconnect(); } catch (e) { /* noop */ }
  }

  tick(now) {
    if (this.done) return;
    if (now > this.endAt + 0.6) { this.stop(); return; }
    if (this.next < now + 0.01) { // fell behind (hidden tab, long frame): skip silently, keep the groove
      const miss = Math.ceil((now + 0.01 - this.next) / this.sd);
      this.step += miss;
      this.next += miss * this.sd;
    }
    const until = Math.min(now + LOOKAHEAD, this.endAt - XFADE * 0.4);
    for (let guard = 0; this.next < until && guard < 24; guard++) {
      this.play(this.step, this.next);
      this.step++;
      this.next += this.sd;
    }
  }

  compose(cycle) {
    const d = this.def;
    this.cycle = cycle;
    if (!this.phr.A || chance(0.35)) this.phr.A = genPhrase(d, d.prog.A, null);
    this.phr.A2 = genPhrase(d, d.prog.A2, this.phr.A);
    if (!this.phr.B || chance(0.6)) this.phr.B = genPhrase(d, d.prog.B, null, d.lift ?? 2);
    for (const s of ['A', 'A2', 'B']) {
      const m = new Map();
      for (const n of this.phr[s]) m.set(n.step, n);
      this.mel[s] = m;
    }
  }

  play(step, t) {
    const d = this.def, spb = this.spb;
    const barAbs = Math.floor(step / spb), sib = step % spb, cycle = Math.floor(barAbs / 16);
    if (cycle !== this.cycle) this.compose(cycle);
    const secIdx = Math.floor(barAbs / 4) % 4, bar = barAbs % 4, sec = FORM[secIdx];
    const prog = d.prog[sec];
    const nextDeg = bar < 3 ? prog[bar + 1] : d.prog[FORM[(secIdx + 1) % 4]][0];
    const off = sib % 2 === 1;
    const n = this.mel[sec].get(bar * spb + sib);
    const s = {
      t: t + (off ? (d.swing || 0) * this.sd * 2 : 0) + rand(0, 0.004),
      sib, off, bar, sec, cycle, deg: prog[bar], nextDeg, sd: this.sd, barDur: this.sd * spb,
      mel: n ? { midi: d2m(d, n.deg), dur: n.len * this.sd * 0.92, len: n.len } : null,
    };
    try { d.arrange(this, s); } catch (e) { /* a bad note must never break the game */ }
  }

  // ---- harmony helpers
  root(deg, lo) { return place(d2m(this.def, deg), lo); }
  voice(deg, lo, n = 3) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(place(d2m(this.def, deg + 2 * i), lo));
    return out.sort((a, b) => a - b);
  }

  // ---- voice-capped instrument wrappers (pri=1: melody/bass, allowed past the soft cap)
  room(pri = 0) {
    const v = this.m.voices, now = this.sys.ctx.currentTime;
    if (v.length >= CAP) {
      let j = 0;
      for (let i = 0; i < v.length; i++) if (v[i] > now) v[j++] = v[i];
      v.length = j;
    }
    return v.length < (pri ? CAP + 16 : CAP);
  }
  add(end) { this.m.voices.push(end); }
  pluck(m, t, v, tim = 'guitar', dur = 0, pri = 0) { if (this.room(pri)) this.add(pluck(this.k, this.out, t, m, hv(v), tim, dur)); }
  strum(ms, t, v, up, sp, tim, dur) { if (this.room()) this.add(strum(this.k, this.out, t, ms, hv(v), up, sp, tim, dur)); }
  piano(m, t, v, dur, pri = 0) { if (this.room(pri)) this.add(piano(this.k, this.out, t, m, hv(v), dur)); }
  pad(ms, t, dur, v, o) { if (this.room(1)) this.add(pad(this.k, this.out, t, ms, dur, v, o)); }
  bass(m, t, v, dur) { if (this.room(1)) this.add(bass(this.k, this.out, t, m, hv(v), dur)); }
  kick(t, v, f0, f1) { if (this.room()) this.add(kick(this.k, this.out, t, hv(v), f0, f1)); }
  brush(t, v, len) { if (this.room()) this.add(brush(this.k, this.out, t, hv(v), len)); }
  shaker(t, v) { if (this.room()) this.add(shaker(this.k, this.out, t, hv(v))); }
  wood(t, v, f) { if (this.room()) this.add(wood(this.k, this.out, t, hv(v), f)); }
  bell(m, t, v, type, pri = 0) { if (this.room(pri)) this.add(bell(this.k, this.out, t, m, hv(v), type)); }
  reed(ms, t, dur, v, pri = 0) { if (this.room(pri)) this.add(reed(this.k, this.out, t, ms, dur, hv(v), this.vib)); }
  fiddle(m, t, dur, v) { if (this.room(1)) this.add(fiddle(this.k, this.out, t, m, dur, hv(v), this.vib)); }
  flute(m, t, dur, v) { if (this.room(1)) this.add(flute(this.k, this.out, t, m, dur, hv(v), this.vib)); }
  chip(m, t, dur, v, duty) { if (this.room()) this.add(chip(this.k, this.out, t, m, dur, v, duty)); }
  theremin(m, t, dur, v) {
    if (!this.thr) this.thr = new Theremin(this.k, this.out, Math.max(this.sys.ctx.currentTime, t - 0.05));
    this.thr.note(t, m, dur, v);
  }
}

// ------------------------------------------------------------------ engine

export class Music {
  constructor(sys) {
    this.sys = sys;
    this.cur = null;
    this.old = [];
    this.mood = 'none';
    this.voices = [];
  }

  set(mood) {
    if (!MOODS[mood]) mood = 'none';
    if (mood === this.mood) return;
    this.mood = mood;
    const now = this.sys.ctx.currentTime;
    if (this.cur) {
      this.cur.fadeOut(now, XFADE);
      this.old.push(this.cur);
      this.cur = null;
    }
    if (mood !== 'none') {
      this.cur = new Player(this, MOODS[mood]);
      this.cur.start(now + 0.06, XFADE * 0.8);
      this.cur.tick(now);
    }
  }

  update(now) {
    if (this.cur) this.cur.tick(now);
    for (let i = this.old.length - 1; i >= 0; i--) {
      const p = this.old[i];
      p.tick(now);
      if (p.done) this.old.splice(i, 1);
    }
  }
}
