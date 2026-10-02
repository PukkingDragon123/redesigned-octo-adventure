// Dialogue typewriter blips: tiny "Animalese"-style syllables.
// One oscillator through a resonant lowpass (F1-ish) and a bandpass (F2) per
// blip — four nodes, cheap enough for ~20 blips/second.
import { rand, pick } from './synth.js';

// f: base pitch (Hz), w: waveform, s: random pitch spread (semitones),
// d: blip length (s), F: vowel formant pairs [F1, F2], c: pitch contour in
// cents across the blip, v: peak level, a: attack.
const VOICES = {
  hank: { f: 116, w: 'sawtooth', s: 3, d: 0.08, F: [[480, 950], [580, 1150], [420, 850]], c: [10, -40, -120], v: 0.2 },
  grandma: { f: 300, w: 'triangle', s: 4, d: 0.085, F: [[620, 1700], [520, 2100], [700, 1300]], c: [0, 35, -15, 30, -20, 20, -40], v: 0.32 },
  reaper: { f: 82, w: 'square', s: 2, d: 0.12, F: [[360, 760], [420, 680]], c: [0, -30, -90], v: 0.26, a: 0.015 },
  gus: { f: 140, w: 'square', s: 3, d: 0.075, F: [[550, 1000], [480, 900]], c: [0, 30, -40], v: 0.18 },
  marie: { f: 360, w: 'triangle', s: 5, d: 0.065, F: [[700, 1800], [450, 2300], [600, 1500]], c: [-80, 120, 180], v: 0.3 },
  doug: { f: 128, w: 'sawtooth', s: 2, d: 0.09, F: [[620, 1050], [560, 980]], c: [0, -20, -60], v: 0.2 },
  birdie: { f: 880, w: 'sine', s: 6, d: 0.05, F: [[1400, 3000]], c: [-200, 300, 450], v: 0.2 },
  ingrid: { f: 330, w: 'triangle', s: 4, d: 0.07, F: [[500, 2000], [650, 1400]], c: [120, 60, -100], v: 0.3 },
  lou: { f: 196, w: 'square', s: 4, d: 0.065, F: [[700, 1700], [600, 1900]], c: [0, 40, 0], v: 0.16 },
  agnes: { f: 270, w: 'sawtooth', s: 3, d: 0.09, F: [[600, 1600], [520, 1900]], c: [0, -30, 25, -25, 20, -35], v: 0.2 },
  kid: { f: 480, w: 'square', s: 5, d: 0.055, F: [[800, 2200], [650, 2600]], c: [-100, 200, 150], v: 0.16 },
  cat: { f: 720, w: 'triangle', s: 4, d: 0.07, F: [[900, 2100]], c: [-150, 250, -100], v: 0.3 },
  narrator: { f: 230, w: 'triangle', s: 2, d: 0.05, F: [[600, 1500], [650, 1400]], c: [0, 0, -30], v: 0.24 },
  ollie: { f: 250, w: 'triangle', s: 4, d: 0.065, F: [[650, 1500], [550, 1900]], c: [-60, 100, 60], v: 0.3 },
};

export const VOICE_NAMES = Object.keys(VOICES);

const contours = new Map();
function contour(name, pts) {
  let c = contours.get(name);
  if (!c) {
    c = Float32Array.from(pts);
    contours.set(name, c);
  }
  return c;
}

/** Schedule one blip on sys.voiceBus. Returns its end time (or 0 if skipped). */
export function blipVoice(sys, name) {
  const ctx = sys.ctx, now = ctx.currentTime;
  if (now - (sys._blipLast || 0) < 0.028) return 0; // throttle runaway callers
  sys._blipLast = now;
  const key = VOICES[name] ? name : 'narrator', V = VOICES[key];
  const t = now + 0.004, d = V.d * rand(0.9, 1.15);
  const f = V.f * Math.pow(2, rand(-V.s, V.s) / 24);
  const [F1, F2] = pick(V.F), fm = rand(0.95, 1.06);

  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = V.w;
  o.frequency.value = f;
  o.detune.setValueCurveAtTime(contour(key, V.c), t, d);
  lp.type = 'lowpass';
  lp.frequency.value = F1 * 1.2 * fm;
  lp.Q.value = 3;
  bp.type = 'bandpass';
  bp.frequency.value = F2 * fm;
  bp.Q.value = 4;
  const a = V.a || 0.006;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(V.v, t + a);
  g.gain.setValueAtTime(V.v, t + Math.max(a, d * 0.45));
  g.gain.exponentialRampToValueAtTime(V.v * 0.002, t + d);
  g.gain.setValueAtTime(0, t + d + 0.005);
  o.connect(lp);
  o.connect(bp);
  lp.connect(g);
  bp.connect(g);
  g.connect(sys.voiceBus);
  o.start(t);
  o.stop(t + d + 0.02);
  o.onended = () => g.disconnect();
  return t + d;
}
