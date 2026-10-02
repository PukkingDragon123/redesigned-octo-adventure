// Shared DSP toolkit for the procedural audio system.
// Math helpers, generated buffers (noise, crackle, impulse response,
// Karplus-Strong plucks), SFX building blocks and the instrument voices used
// by both the music engine and the jingle-style sound effects.
// Nothing in here touches `window`; everything takes an explicit context.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- params

const lastTarget = new WeakMap();
/** Smoothly steer an AudioParam, skipping redundant per-frame updates. */
export function glide(param, value, now, tc = 0.05) {
  if (!Number.isFinite(value)) return;
  const prev = lastTarget.get(param);
  if (prev !== undefined && Math.abs(prev - value) <= 1e-4 * Math.max(1, Math.abs(value))) return;
  lastTarget.set(param, value);
  param.setTargetAtTime(value, now, tc);
}

/** Attack / optional hold / exponential decay to silence. Returns end time. */
export function env(p, t, a, peak, dur, hold = 0) {
  a = Math.max(0.001, a);
  const end = Math.max(t + a + hold + 0.02, t + dur);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  p.exponentialRampToValueAtTime(Math.max(1e-5, peak * 1e-3), end);
  p.setValueAtTime(0, end + 0.005);
  return end + 0.005;
}

// ---------------------------------------------------------------- buffers

function noiseBuffer(ctx, seconds, color) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr), fade = Math.floor(0.05 * sr);
  const tmp = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < tmp.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.12;
      b6 = w * 0.115926;
    } else if (color === 'brown') {
      br = (br + 0.02 * w) / 1.02;
      tmp[i] = br * 3.5;
    } else tmp[i] = w;
  }
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  d.set(tmp.subarray(0, n));
  // crossfade the overhang into the start so the loop is seamless
  for (let i = 0; i < fade; i++) { const x = i / fade; d[i] = tmp[i] * x + tmp[n + i] * (1 - x); }
  return buf;
}

/** Sparse decaying micro-impulses: crackle, gravel, fizz, rain ticks. */
function crackleBuffer(ctx, seconds, density, tail) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const count = Math.floor(seconds * density);
  for (let k = 0; k < count; k++) {
    const pos = (Math.random() * n) | 0;
    const amp = Math.pow(Math.random(), 2.2) * (Math.random() < 0.5 ? -1 : 1);
    const f = 1500 + Math.random() * 5000, len = Math.max(4, Math.floor(sr * tail * (0.4 + Math.random())));
    const w = (2 * Math.PI * f) / sr, tau = len * 0.25;
    for (let i = 0; i < len; i++) d[(pos + i) % n] += amp * Math.exp(-i / tau) * Math.cos(w * i);
  }
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
  return buf;
}

/** Tiny metallic click used for freewheel ratchets and rattles. */
function tickBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(0.014 * sr);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = ((Math.random() * 2 - 1) * Math.exp(-t / 0.0005) * 0.45 +
      Math.sin(2 * Math.PI * 3300 * t) * Math.exp(-t / 0.0019) * 0.45 +
      Math.sin(2 * Math.PI * 5150 * t) * Math.exp(-t / 0.0009) * 0.25) * Math.min(1, i / 6) * (1 - i / n);
  }
  return buf;
}

/** Warm stereo room/hall impulse (~2.2 s), darker as it decays. */
export function impulse(ctx, dur = 2.2) {
  const sr = ctx.sampleRate, len = Math.floor(dur * sr), pre = Math.floor(0.011 * sr);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const k1 = Math.exp(-2.4 / sr), k2 = Math.exp(-3.2 / sr), span = len - pre;
    let e1 = 1, e2 = 1;
    for (let i = pre; i < len; i++) {
      lp += (0.07 + 0.6 * e1) * (Math.random() * 2 - 1 - lp); // brighter early, darker tail
      d[i] = lp * e2 * (1 - (i - pre) / span);
      e1 *= k1;
      e2 *= k2;
    }
    for (let r = 0; r < 10; r++) {
      const at = pre + Math.floor(sr * rand(0.004, 0.075));
      d[at] += (Math.random() < 0.5 ? -1 : 1) * rand(0.15, 0.45) * (1 - r / 12);
    }
  }
  return buf;
}

// Karplus-Strong timbres: excitation brightness, pluck position, decay.
const TIMBRES = {
  guitar: { len: 1.8, t60: 2.0, bright: 0.42, pos: 0.21, gain: 0.55 },
  banjo: { len: 0.9, t60: 0.75, bright: 0.85, pos: 0.09, gain: 0.5 },
  pizz: { len: 0.75, t60: 0.42, bright: 0.2, pos: 0.3, gain: 0.65 },
  harp: { len: 2.2, t60: 2.4, bright: 0.3, pos: 0.48, gain: 0.55 },
};

/** Per-AudioContext resource cache. Buffers other than white noise are built on first use (or by warm-up). */
export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.white = noiseBuffer(ctx, 2.5, 'white');
    this._b = {};
    this._ks = new Map();
    this._curves = new Map();
    this._waves = new Map();
  }
  get pink() { return this._b.pink || (this._b.pink = noiseBuffer(this.ctx, 3.1, 'pink')); }
  get brown() { return this._b.brown || (this._b.brown = noiseBuffer(this.ctx, 3.7, 'brown')); }
  get crackle() { return this._b.crackle || (this._b.crackle = crackleBuffer(this.ctx, 3.3, 120, 0.004)); }
  get fizz() { return this._b.fizz || (this._b.fizz = crackleBuffer(this.ctx, 2.1, 1300, 0.0011)); }
  get tick() { return this._b.tick || (this._b.tick = tickBuffer(this.ctx)); }

  /** Small jobs for AudioSys to run a few per frame after init (no first-use hitches). */
  warmJobs() {
    const jobs = ['pink', 'brown', 'crackle', 'tick', 'fizz'].map((n) => () => this[n]);
    jobs.push(() => this.pulse(0.25), () => this.pulse(0.125), () => this.pulse(0.5));
    for (const m of [72, 76, 79, 84]) jobs.push(() => this.pluck(m, 'harp'));
    for (const m of [36, 41, 43, 48, 55, 59, 60, 62, 64, 67, 71]) jobs.push(() => this.pluck(m, 'guitar'));
    return jobs;
  }

  /** Cached tanh soft-saturation curve. */
  shaper(drive = 2) {
    const key = Math.round(drive * 100);
    let c = this._curves.get(key);
    if (!c) {
      c = new Float32Array(1025);
      const n = Math.tanh(drive);
      for (let i = 0; i < 1025; i++) c[i] = Math.tanh(drive * (i / 512 - 1)) / n;
      this._curves.set(key, c);
    }
    return c;
  }

  /** Cached PeriodicWave from Fourier coefficients: coef(k) -> [cos term, sin term]. */
  wave(key, harmonics, coef) {
    let w = this._waves.get(key);
    if (w) return w;
    const re = new Float32Array(harmonics + 1), im = new Float32Array(harmonics + 1);
    for (let k = 1; k <= harmonics; k++) [re[k], im[k]] = coef(k);
    w = this.ctx.createPeriodicWave(re, im);
    this._waves.set(key, w);
    return w;
  }

  /** Band-limited pulse wave with the given duty cycle (closed-form series). */
  pulse(duty = 0.25) {
    const w = 2 * Math.PI * duty;
    return this.wave('pulse' + duty, 48, (k) => [(2 * Math.sin(w * k)) / (Math.PI * k), (2 * (1 - Math.cos(w * k))) / (Math.PI * k)]);
  }

  /** Lazily rendered, LRU-cached Karplus-Strong pluck for a MIDI note. */
  pluck(midi, timbre = 'guitar') {
    const m = Math.round(midi), key = timbre + m;
    const hit = this._ks.get(key);
    if (hit) {
      this._ks.delete(key);
      this._ks.set(key, hit);
      return hit;
    }
    const T = TIMBRES[timbre] || TIMBRES.guitar;
    const f = mtof(m);
    const sr = Math.max(22050, Math.round(this.sr / 2)); // half rate: plenty for plucks, half the memory
    const N = Math.max(4, Math.round(sr / f - 0.5));
    const fks = sr / (N + 0.5);
    const len = Math.floor(T.len * sr);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      lp += T.bright * (Math.random() * 2 - 1 - lp);
      d[i] = lp;
      mean += lp;
    }
    mean /= N;
    for (let i = 0; i < N; i++) d[i] -= mean;
    const P = Math.max(1, Math.round(N * T.pos)); // pluck-position comb
    for (let i = N - 1; i >= P; i--) d[i] -= 0.85 * d[i - P];
    const t60 = clamp(T.t60 * Math.pow(196 / f, 0.4), 0.15, T.len * 1.5);
    const g = Math.pow(0.001, 1 / (t60 * fks)) * 0.5;
    d[N] = g * d[0];
    for (let i = N + 1; i < len; i++) d[i] = g * (d[i - N] + d[i - N - 1]);
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    const sc = pk > 0 ? T.gain / pk : 0, fin = 16, fout = Math.floor(len * 0.12);
    for (let i = 0; i < len; i++) {
      let v = d[i] * sc;
      if (i < fin) v *= i / fin;
      else if (i > len - fout) v *= (len - i) / fout;
      d[i] = v;
    }
    const entry = { buf, rate: f / fks };
    this._ks.set(key, entry);
    if (this._ks.size > 80) this._ks.delete(this._ks.keys().next().value);
    return entry;
  }
}

// ---------------------------------------------------------------- SFX blocks
// SFX functions receive c = { k, ctx, out, wet, t, p, end }. Options use
// relative start `t`, `dur`, attack `a`, hold `h`, peak `v`; filters lp/bp/hp
// (with optional sweep targets lp2/bp2/hp2 and `q`); all frequencies are
// multiplied by the pitch factor c.p. Each helper extends c.end.

function curveOf(arr, mul) {
  const out = new Float32Array(Math.max(2, arr.length));
  for (let i = 0; i < out.length; i++) out[i] = Math.max(1, arr[Math.min(i, arr.length - 1)] * mul);
  return out;
}

function filt(ctx, input, type, f, q, t, f2, sweep) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.Q.value = q;
  b.frequency.setValueAtTime(clamp(f, 20, 20000), t);
  if (f2) b.frequency.exponentialRampToValueAtTime(clamp(f2, 20, 20000), t + Math.max(0.01, sweep));
  input.connect(b);
  return b;
}

function chain(c, node, o, t, dur, p) {
  const ctx = c.ctx, sw = o.sw ?? dur;
  if (o.lp) node = filt(ctx, node, 'lowpass', o.lp * p, o.lq ?? o.q ?? 0.7, t, o.lp2 && o.lp2 * p, sw);
  if (o.bp) node = filt(ctx, node, 'bandpass', o.bp * p, o.q ?? 1, t, o.bp2 && o.bp2 * p, sw);
  if (o.hp) node = filt(ctx, node, 'highpass', o.hp * p, o.hq ?? 0.7, t, o.hp2 && o.hp2 * p, sw);
  if (o.sh) {
    const s = ctx.createWaveShaper();
    s.curve = c.k.shaper(o.sh);
    node.connect(s);
    node = s;
  }
  if (o.am) { // [rate, depth, type]
    const g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
    g.gain.value = 1 - o.am[1];
    l.type = o.am[2] || 'sine';
    l.frequency.value = o.am[0];
    lg.gain.value = o.am[1];
    l.connect(lg);
    lg.connect(g.gain);
    l.start(t);
    l.stop(t + dur + 0.1);
    node.connect(g);
    node = g;
  }
  return node;
}

function finish(c, src, node, o, t, dur) {
  const g = c.ctx.createGain();
  const end = env(g.gain, t, o.a ?? 0.004, o.v ?? 0.3, dur, o.h || 0);
  node.connect(g);
  g.connect(o.to || c.out);
  src.stop(end + 0.02);
  src.onended = () => g.disconnect();
  if (end > c.end) c.end = end;
  return end;
}

/** Enveloped oscillator. f/f2 glide over `g` (default dur), or freq curve `fc`. */
export function T(c, o) {
  const ctx = c.ctx, t = c.t + (o.t || 0), dur = o.dur || 0.2, p = o.fixed ? 1 : c.p;
  const osc = ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave);
  else osc.type = o.type || 'sine';
  if (o.fc) osc.frequency.setValueCurveAtTime(curveOf(o.fc, p), t, o.fcd || dur);
  else {
    osc.frequency.setValueAtTime(o.f * p, t);
    if (o.f2) {
      const gt = t + Math.max(0.005, o.g ?? dur);
      if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2 * p, gt);
      else osc.frequency.exponentialRampToValueAtTime(o.f2 * p, gt);
    }
  }
  if (o.det) osc.detune.setValueAtTime(o.det, t);
  if (o.vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = o.vib;
    lg.gain.setValueAtTime(o.vd ?? 25, t);
    if (o.vdd) lg.gain.exponentialRampToValueAtTime(o.vdd, t + dur); // decaying wobble
    l.connect(lg);
    lg.connect(osc.detune);
    l.start(t);
    l.stop(t + dur + 0.1);
  }
  const node = chain(c, osc, o, t, dur, p);
  osc.start(t);
  finish(c, osc, node, o, t, dur);
  return osc;
}

/** Enveloped, filtered noise burst from one of the kit buffers. */
export function N(c, o) {
  const ctx = c.ctx, t = c.t + (o.t || 0), dur = o.dur || 0.2, p = o.fixed ? 1 : c.p;
  const src = ctx.createBufferSource(), buf = c.k[o.buf || 'white'];
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = o.rate || 1;
  const node = chain(c, src, o, t, dur, p);
  src.start(t, Math.random() * buf.duration * 0.9);
  finish(c, src, node, o, t, dur);
  return src;
}

/** Play a kit buffer once (e.g. the ratchet tick). */
export function B(c, name, t, v, rate = 1, to = null) {
  const ctx = c.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = c.k[name];
  s.playbackRate.value = rate;
  g.gain.value = v;
  s.connect(g);
  g.connect(to || c.out);
  const at = c.t + t;
  s.start(at);
  s.onended = () => g.disconnect();
  const end = at + s.buffer.duration / rate;
  if (end > c.end) c.end = end;
}

/**
 * Formant "voice": oscillator with a pitch curve `fc` through parallel
 * bandpass formants F = [[freq | curve, Q, gain], ...]. Optional breath noise
 * `br`, vibrato `vib`/`vd`, roughness `am`, saturation `sh`.
 */
export function vox(c, o) {
  const ctx = c.ctx, t = c.t + (o.t || 0), dur = o.dur, p = c.p;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sawtooth';
  osc.frequency.setValueCurveAtTime(curveOf(o.fc, p), t, dur);
  if (o.vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = o.vib;
    lg.gain.value = o.vd ?? 30;
    l.connect(lg);
    lg.connect(osc.detune);
    l.start(t);
    l.stop(t + dur + 0.1);
  }
  let src = osc;
  if (o.sh) {
    const s = ctx.createWaveShaper();
    s.curve = c.k.shaper(o.sh);
    osc.connect(s);
    src = s;
  }
  const mix = ctx.createGain();
  let noise = null;
  if (o.br) {
    noise = ctx.createBufferSource();
    noise.buffer = c.k.white;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = o.br;
    noise.connect(ng);
    src = [src, ng];
  }
  for (const [fq, q, gain] of o.F) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    if (Array.isArray(fq)) bp.frequency.setValueCurveAtTime(curveOf(fq, p), t, dur);
    else bp.frequency.setValueAtTime(fq * p, t);
    const fg = ctx.createGain();
    fg.gain.value = gain;
    for (const s of Array.isArray(src) ? src : [src]) s.connect(bp);
    bp.connect(fg);
    fg.connect(mix);
  }
  const node = chain(c, mix, { am: o.am, lp: o.lp }, t, dur, p);
  osc.start(t);
  if (noise) {
    noise.start(t, Math.random() * 2);
    noise.stop(t + dur + 0.05);
  }
  finish(c, osc, node, o, t, dur);
  return osc;
}

// ---------------------------------------------------------------- instruments
// All take the kit, a destination, start time and return the end time.

export function pluck(k, dest, t, midi, vel = 0.5, timbre = 'guitar', dur = 0) {
  const ctx = k.ctx, { buf, rate } = k.pluck(midi, timbre);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const natural = buf.duration / rate;
  let end = t + natural;
  g.gain.setValueAtTime(vel, t);
  if (dur > 0 && dur < natural - 0.1) { // damp the string
    end = t + dur + 0.09;
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.linearRampToValueAtTime(0, end);
  }
  src.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(end + 0.02);
  src.onended = () => g.disconnect();
  return end;
}

export function strum(k, dest, t, midis, vel = 0.3, up = false, spread = 0.012, timbre = 'guitar', dur = 0) {
  const notes = up ? midis.slice().reverse() : midis;
  let end = t;
  for (let i = 0; i < notes.length; i++) {
    const v = vel * (up ? 1 - i * 0.07 : 0.82 + i * 0.05);
    end = Math.max(end, pluck(k, dest, t + i * spread * rand(0.8, 1.2), notes[i], v, timbre, dur));
  }
  return end;
}

/** Soft felt piano: triangle + sine partial, muffled lowpass, quick decay. */
export function piano(k, dest, t, midi, vel = 0.4, dur = 1) {
  const ctx = k.ctx, f = mtof(midi);
  const g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(9000, f * (3 + vel * 5)), t);
  lp.frequency.setTargetAtTime(Math.max(f * 1.6, 520), t + 0.01, 0.3);
  const tau = clamp(0.9 * Math.pow(262 / f, 0.45), 0.25, 2.2);
  const off = t + Math.max(0.2, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.setTargetAtTime(vel * 0.45, t + 0.006, 0.07);
  g.gain.setTargetAtTime(0, t + 0.12, tau);
  g.gain.setTargetAtTime(0, off, 0.07);
  const end = Math.min(off + 0.4, t + 0.12 + tau * 6);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o1.type = 'triangle';
  o1.frequency.value = f;
  o2.type = 'sine';
  o2.frequency.value = f * 2.003;
  g2.gain.value = 0.22;
  o1.connect(lp);
  o2.connect(g2);
  g2.connect(lp);
  lp.connect(g);
  g.connect(dest);
  o1.start(t);
  o2.start(t);
  o1.stop(end);
  o2.stop(end);
  o1.onended = () => g.disconnect();
  if (vel > 0.15) { // felt hammer "thock"
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = k.white;
    nf.type = 'lowpass';
    nf.frequency.value = Math.min(2500, f * 4);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(dest);
    env(ng.gain, t, 0.002, vel * 0.07, 0.04);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.06);
    n.onended = () => ng.disconnect();
  }
  return end;
}

/** Warm pad: two detuned saws per note through a slowly opening lowpass. */
export function pad(k, dest, t, midis, dur, vel = 0.1, o = {}) {
  const ctx = k.ctx, att = o.attack ?? 0.8, rel = o.release ?? 1.2, cut = o.cutoff ?? 900;
  const lp = ctx.createBiquadFilter(), g = ctx.createGain(), mix = ctx.createGain();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(cut * 0.55, t);
  lp.frequency.linearRampToValueAtTime(cut, t + att + dur * 0.3);
  lp.frequency.linearRampToValueAtTime(cut * 0.7, t + dur + rel);
  const sus = Math.max(t + att, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + att);
  g.gain.setValueAtTime(vel, sus);
  g.gain.setTargetAtTime(0, sus, rel / 3.5);
  const end = sus + rel + 0.1;
  mix.gain.value = 1 / Math.sqrt(midis.length * 2);
  mix.connect(lp);
  lp.connect(g);
  g.connect(dest);
  let first = null;
  for (const m of midis) {
    for (const dc of [-8, 7]) {
      const s = ctx.createOscillator();
      s.type = 'sawtooth';
      s.frequency.value = mtof(m);
      s.detune.value = dc + rand(-3, 3);
      s.connect(mix);
      s.start(t + rand(0, 0.03));
      s.stop(end);
      if (!first) first = s;
    }
  }
  if (first) first.onended = () => g.disconnect();
  return end;
}

/** Upright bass: sine + soft octave, envelope into gentle saturation. */
export function bass(k, dest, t, midi, vel = 0.4, dur = 0.6) {
  const ctx = k.ctx, f = mtof(midi);
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  const eg = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.012, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  o2.type = 'triangle';
  o2.frequency.value = f * 2;
  g2.gain.value = 0.16;
  sh.curve = k.shaper(1.8);
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(1600, f * 6);
  lp.Q.value = 0.5;
  const off = t + Math.max(0.1, dur);
  eg.gain.setValueAtTime(0, t);
  eg.gain.linearRampToValueAtTime(1.1, t + 0.007);
  eg.gain.setTargetAtTime(0.5, t + 0.01, 0.13);
  eg.gain.setTargetAtTime(0, off, 0.06);
  g.gain.value = vel;
  const end = off + 0.35;
  o.connect(eg);
  o2.connect(g2);
  g2.connect(eg);
  eg.connect(sh);
  sh.connect(lp);
  lp.connect(g);
  g.connect(dest);
  o.start(t);
  o2.start(t);
  o.stop(end);
  o2.stop(end);
  o.onended = () => g.disconnect();
  return end;
}

function noiseHit(k, dest, t, vel, type, f, q, a, dur) {
  const ctx = k.ctx, n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = k.white;
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  n.connect(fl);
  fl.connect(g);
  g.connect(dest);
  const end = env(g.gain, t, a, vel, dur);
  n.start(t, Math.random() * 2);
  n.stop(end + 0.01);
  n.onended = () => g.disconnect();
  return end;
}

export function kick(k, dest, t, vel = 0.4, f0 = 115, f1 = 46) {
  const ctx = k.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  const end = env(g.gain, t, 0.003, vel, 0.3);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(end);
  o.onended = () => g.disconnect();
  return end;
}
export const brush = (k, dest, t, vel = 0.2, len = 0.17, f = 3200) => noiseHit(k, dest, t, vel, 'bandpass', f, 0.7, 0.014, len);
export const shaker = (k, dest, t, vel = 0.1) => noiseHit(k, dest, t, vel, 'highpass', 6500, 0.7, 0.005, 0.06);

/** Woodblock / spoons / clock tick. */
export function wood(k, dest, t, vel = 0.2, f = 1000) {
  const ctx = k.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f * 1.4, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  const end = env(g.gain, t, 0.001, vel, 0.08);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(end);
  o.onended = () => g.disconnect();
  noiseHit(k, dest, t, vel * 0.3, 'bandpass', f * 3, 1.2, 0.001, 0.015);
  return end;
}

// [ratio, gain, T60 seconds]
const BELLS = {
  musicbox: [[1, 1, 2.2], [3, 0.12, 0.5], [6.27, 0.05, 0.12]],
  glock: [[1, 1, 2.0], [2.76, 0.3, 0.7], [5.4, 0.12, 0.25]],
  xylo: [[1, 1, 0.45], [3.93, 0.28, 0.12], [9.2, 0.07, 0.05]],
};
/** Music box / glockenspiel / xylophone: sine partials with staggered decays. */
export function bell(k, dest, t, midi, vel = 0.25, type = 'musicbox', decay = 1) {
  const ctx = k.ctx, f = mtof(midi), g = ctx.createGain(), parts = BELLS[type] || BELLS.musicbox;
  g.gain.value = vel;
  g.connect(dest);
  const dm = decay * Math.pow(523 / f, 0.3);
  let end = t, first = null;
  for (const [r, a, d] of parts) {
    if (f * r > 15000) continue;
    const o = ctx.createOscillator(), pg = ctx.createGain();
    o.frequency.value = f * r;
    o.connect(pg);
    pg.connect(g);
    const e = env(pg.gain, t, 0.002, a, d * dm);
    o.start(t);
    o.stop(e);
    end = Math.max(end, e);
    if (!first) first = o;
  }
  if (first) first.onended = () => g.disconnect();
  return end;
}

/** Accordion-ish reed: saw + square "musette" pair per note, bellows swell. */
export function reed(k, dest, t, midis, dur, vel = 0.12, vib = null) {
  const ctx = k.ctx, hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), mix = ctx.createGain();
  hp.type = 'highpass';
  hp.frequency.value = 180;
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.Q.value = 0.8;
  const end = t + Math.max(0.08, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.035);
  g.gain.setValueAtTime(vel, Math.max(t + 0.035, end - 0.05));
  g.gain.linearRampToValueAtTime(0, end + 0.05);
  mix.gain.value = 0.5 / Math.sqrt(midis.length);
  mix.connect(hp);
  hp.connect(lp);
  lp.connect(g);
  g.connect(dest);
  const oscs = [];
  for (const m of midis) {
    for (const [type, dc] of [['sawtooth', -7], ['square', 7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      o.detune.value = dc;
      if (vib) vib.connect(o.detune);
      o.connect(mix);
      o.start(t);
      o.stop(end + 0.08);
      oscs.push(o);
    }
  }
  oscs[0].onended = () => {
    if (vib) for (const o of oscs) { try { vib.disconnect(o.detune); } catch (e) { /* already gone */ } }
    g.disconnect();
  };
  return end + 0.08;
}

function delayedVib(ctx, vib, t, target) {
  if (!vib) return null;
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.setValueAtTime(0, t + 0.12);
  vg.gain.linearRampToValueAtTime(1, t + 0.42);
  vib.connect(vg);
  for (const p of target) vg.connect(p);
  return vg;
}

/** Fiddle-ish lead: saw with scoop, delayed vibrato, bandpassed body. */
export function fiddle(k, dest, t, midi, dur, vel = 0.12, vib = null) {
  const ctx = k.ctx, f = mtof(midi);
  const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = f;
  o.detune.setValueAtTime(-28, t);
  o.detune.linearRampToValueAtTime(0, t + 0.07);
  const vg = delayedVib(ctx, vib, t, [o.detune]);
  bp.type = 'bandpass';
  bp.frequency.value = clamp(f * 2.5, 900, 2600);
  bp.Q.value = 0.55;
  lp.type = 'lowpass';
  lp.frequency.value = 4200;
  const end = t + Math.max(0.1, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.06);
  g.gain.setValueAtTime(vel * 0.9, Math.max(t + 0.06, end - 0.08));
  g.gain.linearRampToValueAtTime(0, end + 0.08);
  o.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(end + 0.1);
  o.onended = () => {
    if (vg) { try { vib.disconnect(vg); } catch (e) { /* noop */ } }
    g.disconnect();
  };
  return end + 0.1;
}

/** Breathy flute: sine + touch of triangle, breath noise, delayed vibrato. */
export function flute(k, dest, t, midi, dur, vel = 0.1, vib = null) {
  const ctx = k.ctx, f = mtof(midi);
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain(), g = ctx.createGain();
  o.frequency.value = f;
  o2.type = 'triangle';
  o2.frequency.value = f;
  g2.gain.value = 0.12;
  const vg = delayedVib(ctx, vib, t, [o.detune, o2.detune]);
  const end = t + Math.max(0.12, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.07);
  g.gain.setValueAtTime(vel * 0.85, Math.max(t + 0.07, end - 0.1));
  g.gain.linearRampToValueAtTime(0, end + 0.12);
  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  g.connect(dest);
  o.start(t);
  o2.start(t);
  o.stop(end + 0.14);
  o2.stop(end + 0.14);
  o.onended = () => {
    if (vg) { try { vib.disconnect(vg); } catch (e) { /* noop */ } }
    g.disconnect();
  };
  noiseHit(k, dest, t, vel * 0.18, 'bandpass', Math.min(9000, f * 2), 1.5, 0.03, Math.min(0.5, dur + 0.1));
  return end + 0.14;
}

/** Gentle chiptune pulse. */
export function chip(k, dest, t, midi, dur, vel = 0.05, duty = 0.25) {
  const ctx = k.ctx, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.setPeriodicWave(k.pulse(duty));
  o.frequency.value = mtof(midi);
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.setTargetAtTime(vel * 0.6, t + 0.005, 0.06);
  g.gain.setTargetAtTime(0, end, 0.025);
  o.connect(lp);
  lp.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(end + 0.15);
  o.onended = () => g.disconnect();
  return end + 0.15;
}

/** Persistent portamento sine voice with wide vibrato (spooky theremin). */
export class Theremin {
  constructor(k, dest, t) {
    const ctx = k.ctx;
    this.o = ctx.createOscillator();
    this.o2 = ctx.createOscillator();
    this.o2.type = 'triangle';
    this.g2 = ctx.createGain();
    this.g2.gain.value = 0.14;
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 5.6;
    this.lg = ctx.createGain();
    this.lg.gain.value = 24;
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 2400;
    this.lfo.connect(this.lg);
    this.lg.connect(this.o.detune);
    this.lg.connect(this.o2.detune);
    this.o.connect(this.g);
    this.o2.connect(this.g2);
    this.g2.connect(this.g);
    this.g.connect(this.lp);
    this.lp.connect(dest);
    this.first = true;
    for (const s of [this.o, this.o2, this.lfo]) s.start(t);
  }
  note(t, midi, dur, vel) {
    const f = mtof(midi);
    if (this.first) { // comedic swoop into the first note
      this.first = false;
      this.o.frequency.setValueAtTime(f * 0.7, t);
      this.o2.frequency.setValueAtTime(f * 0.7, t);
    }
    this.o.frequency.setTargetAtTime(f, t, 0.045);
    this.o2.frequency.setTargetAtTime(f, t, 0.045);
    this.g.gain.setTargetAtTime(vel, t, 0.04);
    this.g.gain.setTargetAtTime(vel * 0.75, t + 0.1, 0.25);
    this.g.gain.setTargetAtTime(0, t + dur, 0.09);
  }
  stop(t) {
    this.g.gain.setTargetAtTime(0, t, 0.08);
    for (const s of [this.o, this.o2, this.lfo]) s.stop(t + 0.6);
    this.o.onended = () => this.lp.disconnect();
  }
}
