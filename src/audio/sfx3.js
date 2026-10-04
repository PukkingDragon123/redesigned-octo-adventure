// One-shot SFX, part 3: pumpkins & bones, shop & paperwork, garden, tricks,
// crowds, spooky critters, footsteps, quest stingers and the cocoa kitchen.
// Every entry is fn(c) with c = { k, ctx, out, wet, t, p, end } (see synth.js).
import { T, N, B, vox, rand, randi, pick, mtof, pluck, strum, piano, pad, bell, chip } from './synth.js';
import { pent, setWet, creak, xylo } from './sfx.js';

const trans = (c) => Math.round(12 * Math.log2(c.p || 1));
const upto = (c, end) => { if (end > c.end) c.end = end; };

// ------------------------------------------------------------ shared pieces

/** T() that drops tones a high pitch factor would push past ~16 kHz (no aliasing / clamp warnings). */
const Th = (c, o) => (Math.max(o.f || 0, o.f2 || 0) * (o.fixed ? 1 : c.p) > 16000 ? null : T(c, o));
/** Base frequency for sfx.js xylo(), capped so its 3.93x partial stays below ~16 kHz. */
const xf = (f) => Math.min(f, 4000);

/** Struck metal/glass: sine partials [ratio, gain, decay], skipping any past ~16 kHz. */
function partials(c, t, f, list, v = 1) {
  for (const [r, a, d] of list) {
    if (f * r * c.p > 16000) continue;
    T(c, { t, dur: d, f: f * r, v: v * a, a: 0.0015 });
  }
}

const BRASS = [[1, 1, 1.3], [1.0045, 0.6, 1.1], [2.71, 0.35, 0.5], [5.12, 0.15, 0.22], [8.3, 0.06, 0.1]];
const BIKE = [[1, 1, 0.7], [1.0068, 0.8, 0.6], [2.43, 0.35, 0.35], [3.94, 0.18, 0.2]];
const TILL = [[1, 1, 1], [1.006, 0.6, 0.8], [2.02, 0.5, 0.6], [2.98, 0.4, 0.4], [4.16, 0.25, 0.3]];

/** Knuckles on a wooden door. */
function rap(c, t, v) {
  const f = rand(180, 200);
  T(c, { t, dur: 0.12, f, f2: f * 0.62, g: 0.07, v: 0.42 * v });
  N(c, { t, dur: 0.07, bp: 540, q: 2.5, v: 0.5 * v });
  N(c, { t, dur: 0.012, bp: 2200, q: 1, v: 0.16 * v });
  T(c, { t, dur: 0.09, type: 'triangle', f: 330, f2: 300, v: 0.08 * v }); // panel ring
}

/** One hand clap. */
function clap(c, t, v) {
  N(c, { t, dur: 0.045, bp: rand(900, 1600), q: 1.3, v, a: 0.001 });
  N(c, { t, dur: 0.02, hp: 2500, v: v * 0.5, a: 0.001 });
}

/** Soft brassy note (two detuned saws), tuned in MIDI so it sits with plucks. */
function brass(c, t, m, dur, v) {
  const f = mtof(m);
  for (const det of [-6, 6]) {
    T(c, { t, dur: dur + 0.15, type: 'sawtooth', f, det, v, a: 0.025, h: dur, lp: 1400, lp2: 2400, sw: 0.05, fixed: true, vib: 5.5, vd: 8 });
  }
}

// ------------------------------------------------------------ library

export const SFX3 = {
  kick(c) {
    T(c, { dur: 0.18, f: 150, f2: 55, g: 0.07, v: 0.5 });
    N(c, { dur: 0.1, buf: 'brown', lp: 600, v: 0.45, a: 0.002 });
    N(c, { dur: 0.04, bp: 1400, q: 1.1, v: 0.14 }); // leather scuff
    T(c, { dur: 0.06, type: 'triangle', f: 260, f2: 170, v: 0.12 });
    setWet(c, 0.06);
  },

  // ------------------------------------------------ pumpkins

  pumpkin_bonk(c) {
    const f = rand(230, 260);
    T(c, { dur: 0.32, f: f * 1.35, f2: f, g: 0.04, v: 0.42 });
    T(c, { dur: 0.16, type: 'triangle', f: f * 2.6, f2: f * 2.3, g: 0.03, v: 0.1 });
    N(c, { dur: 0.22, bp: f * 2, q: 9, v: 0.5 }); // hollow cavity ring
    N(c, { dur: 0.03, bp: 1800, q: 1, v: 0.14 }); // knuckle tap
    setWet(c, 0.12);
  },

  pumpkin_roll(c) {
    N(c, { dur: 0.75, buf: 'brown', a: 0.05, h: 0.35, lp: 520, lp2: 260, v: 0.4, am: [8, 0.55, 'triangle'] });
    N(c, { dur: 0.7, buf: 'crackle', a: 0.04, h: 0.3, bp: 1400, q: 0.8, v: 0.1, rate: 0.6 }); // leaves underneath
    let t = 0, iv = 0.09;
    for (let i = 0; i < 7; i++) { // hollow thumps as it tumbles
      const f = rand(150, 190), v = 1 - i / 9;
      T(c, { t, dur: 0.12, f: f * 1.3, f2: f, g: 0.03, v: 0.22 * v });
      N(c, { t, dur: 0.08, bp: f * 2.1, q: 6, v: 0.18 * v });
      t += iv;
      iv *= 1.12;
    }
  },

  pumpkin_smash(c) {
    N(c, { dur: 0.09, buf: 'crackle', bp: 2600, q: 0.7, v: 0.55, rate: 1.2 }); // rind cracks
    N(c, { dur: 0.05, bp: 1600, q: 1.2, v: 0.35 });
    T(c, { dur: 0.08, type: 'triangle', f: 520, f2: 190, v: 0.22 });
    T(c, { t: 0.01, dur: 0.22, f: 170, f2: 55, g: 0.12, v: 0.42 }); // thud
    N(c, { t: 0.02, dur: 0.35, buf: 'pink', lp: 1400, lp2: 280, v: 0.5, a: 0.004 }); // wet squelch
    N(c, { t: 0.03, dur: 0.3, bp: 900, bp2: 380, q: 3, v: 0.25, am: [24, 0.6] }); // goop
    T(c, { t: 0.06, dur: 0.3, type: 'triangle', f: 210, f2: 120, g: 0.2, v: 0.14, vib: 16, vd: 140, vdd: 10, lp: 1200 });
    for (let i = 0; i < 14; i++) { // seeds skitter away
      const tt = 0.07 + rand(0, 0.5) * (0.3 + i / 14), f = rand(2400, 4200);
      Th(c, { t: tt, dur: 0.025, f, f2: f * 0.8, v: rand(0.03, 0.07) * (1 - i / 20), a: 0.001 });
      if (i % 3 === 0) B(c, 'tick', tt + 0.01, 0.08, rand(0.9, 1.4) * c.p);
    }
    for (let i = 0; i < 5; i++) { // drips
      const f = rand(400, 800);
      T(c, { t: rand(0.1, 0.45), dur: 0.05, f, f2: f * 1.8, v: 0.05 });
    }
    setWet(c, 0.1);
  },

  // ------------------------------------------------ bones

  bones_scatter(c) {
    for (let b = 0; b < 5; b++) { // five bones, each bouncing to rest
      let t = b * rand(0.03, 0.07), iv = rand(0.09, 0.14), v = 0.18;
      const idx = randi(2, 12);
      for (let i = 0; i < 4; i++) {
        xylo(c, t, xf(mtof(pent(idx + randi(-1, 1), 62)) * c.p * rand(0.99, 1.01)), v);
        t += iv;
        iv *= 0.62;
        v *= 0.62;
      }
    }
    for (let i = 0; i < 6; i++) B(c, 'tick', rand(0, 0.35), rand(0.05, 0.1), rand(0.5, 0.8) * c.p);
    N(c, { dur: 0.05, buf: 'brown', lp: 700, v: 0.18 });
    setWet(c, 0.15);
  },

  bones_assemble(c) {
    const tr = trans(c);
    let t = 0, iv = 0.07;
    for (let i = 0; i < 8; i++) { // bones click up into place
      xylo(c, t, xf(mtof(pent(i + 3, 62)) * c.p), 0.09 + i * 0.014);
      B(c, 'tick', t, 0.06, (0.7 + i * 0.05) * c.p);
      t += iv;
      iv *= 0.86;
    }
    const tc = t + 0.03; // the skull snaps on
    T(c, { t: tc, dur: 0.12, type: 'triangle', f: 1250, f2: 820, g: 0.012, v: 0.35 });
    T(c, { t: tc, dur: 0.16, f: 300, f2: 180, g: 0.05, v: 0.3 });
    N(c, { t: tc, dur: 0.03, bp: 3000, q: 1.2, v: 0.3 });
    [0, 4, 7, 12].forEach((s, i) => upto(c, bell(c.k, c.out, c.t + tc + 0.04 + i * 0.045, 91 + s + tr, 0.06, 'glock')));
    N(c, { t: tc + 0.03, dur: 0.6, hp: 6000, v: 0.05, a: 0.05 });
    setWet(c, 0.25);
  },

  bone_rattle(c) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i * 0.024 + rand(0, 0.006), e = Math.sin((Math.PI * (i + 0.5)) / n);
      xylo(c, t, xf(rand(900, 1500) * c.p), 0.07 * e + 0.02);
      B(c, 'tick', t, 0.05 * e, rand(0.6, 0.9) * c.p);
    }
    setWet(c, 0.1);
  },

  jaw_chatter(c) {
    let t = 0;
    for (let i = 0; i < 9; i++) {
      const f = (i % 2 ? 1500 : 1750) * rand(0.97, 1.03);
      T(c, { t, dur: 0.04, type: 'triangle', f, f2: f * 0.7, v: 0.2, a: 0.001 });
      N(c, { t, dur: 0.018, bp: 3200, q: 1.5, v: 0.22 });
      T(c, { t, dur: 0.06, f: 520, f2: 420, v: 0.1, a: 0.001 }); // skull body
      t += 0.058 + rand(-0.006, 0.006);
    }
    setWet(c, 0.1);
  },

  // ------------------------------------------------ camera

  camera_shutter(c) {
    N(c, { dur: 0.02, bp: 3800, q: 1.3, v: 0.45 }); // shutter opens
    T(c, { dur: 0.03, type: 'triangle', f: 2200, f2: 1400, v: 0.12, a: 0.001 });
    B(c, 'tick', 0, 0.3, 1.1 * c.p);
    N(c, { t: 0.055, dur: 0.03, bp: 2400, q: 1.4, v: 0.4 }); // ...and closes
    T(c, { t: 0.055, dur: 0.05, type: 'triangle', f: 700, f2: 380, v: 0.18 });
    B(c, 'tick', 0.055, 0.25, 0.8 * c.p);
    T(c, { t: 0.13, dur: 0.38, type: 'sawtooth', f: 150, f2: 210, v: 0.1, a: 0.02, h: 0.24, bp: 1100, q: 2, am: [55, 0.6, 'square'] }); // film advance
    N(c, { t: 0.13, dur: 0.38, bp: 2600, q: 1.5, v: 0.08, a: 0.02, h: 0.24, am: [55, 0.7, 'square'] });
    B(c, 'tick', 0.5, 0.2, c.p);
    setWet(c, 0.08);
  },

  flash_pop(c) {
    Th(c, { dur: 0.16, f: 2400, f2: 6500, v: 0.025, a: 0.1 }); // charge whine
    const t = 0.15;
    N(c, { t, dur: 0.05, hp: 1500, v: 0.4, a: 0.001 });
    T(c, { t, dur: 0.09, f: 900, f2: 180, v: 0.35 });
    N(c, { t, dur: 0.12, buf: 'brown', lp: 900, v: 0.3 });
    N(c, { t: t + 0.01, dur: 0.4, buf: 'fizz', hp: 3500, v: 0.18, a: 0.01 }); // bulb fizzle
    Th(c, { t: t + 0.02, dur: 0.35, f: 4200, f2: 3600, v: 0.03 });
    setWet(c, 0.15);
  },

  // ------------------------------------------------ shop

  shop_bell(c) {
    for (const [t, f, v] of [[0, 1960, 1], [0.09, 2470, 0.7], [0.2, 1960, 0.55], [0.34, 2470, 0.35], [0.5, 1960, 0.22]]) {
      partials(c, t, f * rand(0.995, 1.005), BRASS, v * 0.16);
      N(c, { t, dur: 0.008, hp: 4000, v: v * 0.1 });
    }
    for (let i = 0; i < 4; i++) B(c, 'tick', rand(0.02, 0.4), 0.05, rand(1.2, 1.6) * c.p); // spring
    setWet(c, 0.28);
  },

  register(c) {
    N(c, { dur: 0.02, bp: 2600, q: 1.2, v: 0.3 }); // key press
    T(c, { dur: 0.05, type: 'triangle', f: 640, f2: 380, v: 0.18 });
    for (let i = 0; i < 5; i++) B(c, 'tick', 0.03 + i * 0.022, 0.18 - i * 0.02, (0.8 + i * 0.04) * c.p); // ratchet
    N(c, { t: 0.14, dur: 0.16, bp: 900, bp2: 1800, q: 1.4, v: 0.25, a: 0.02 }); // drawer slides out
    N(c, { t: 0.14, dur: 0.14, buf: 'crackle', bp: 2000, q: 0.8, v: 0.2 });
    T(c, { t: 0.29, dur: 0.1, f: 200, f2: 110, v: 0.32 });
    N(c, { t: 0.29, dur: 0.06, buf: 'brown', lp: 600, v: 0.3 });
    partials(c, 0.27, 2093, TILL, 0.12); // cha-
    partials(c, 0.36, 2637, TILL.map(([r, a, d]) => [r, a, d * 1.4]), 0.12); // -ching
    for (let i = 0; i < 5; i++) Th(c, { t: rand(0.32, 0.5), dur: 0.12, f: rand(4200, 6000), v: 0.02, a: 0.001 }); // coins
    setWet(c, 0.16);
  },

  // ------------------------------------------------ paperwork

  page_flip(c) {
    N(c, { dur: 0.22, a: 0.06, bp: 1400, bp2: 3800, q: 1.1, v: 0.45, sw: 0.2, am: [rand(26, 34), 0.45] });
    N(c, { dur: 0.18, buf: 'crackle', a: 0.04, bp: 4200, q: 0.8, v: 0.36, rate: rand(0.9, 1.2) });
    N(c, { t: 0.17, dur: 0.06, buf: 'pink', lp: 1600, v: 0.4, a: 0.003 }); // flap
    setWet(c, 0.05);
  },

  book_open(c) {
    creak(c, 0, 0.22, 0.07, 140); // leather spine
    N(c, { dur: 0.18, buf: 'crackle', bp: 2400, q: 0.8, v: 0.18, rate: 0.7, a: 0.03 });
    N(c, { t: 0.16, dur: 0.18, a: 0.05, bp: 900, bp2: 2200, q: 1, v: 0.16, sw: 0.15 }); // cover swings
    T(c, { t: 0.3, dur: 0.12, f: 160, f2: 85, v: 0.32 }); // ...and lands
    N(c, { t: 0.3, dur: 0.1, buf: 'pink', lp: 900, v: 0.35, a: 0.003 });
    N(c, { t: 0.33, dur: 0.16, buf: 'crackle', bp: 4000, q: 0.8, v: 0.1, a: 0.02 }); // pages settle
    setWet(c, 0.1);
  },

  book_close(c) {
    N(c, { dur: 0.12, a: 0.08, bp: 700, bp2: 1600, q: 1.1, v: 0.16, sw: 0.1 }); // air pushed out
    const t = 0.11;
    T(c, { t, dur: 0.16, f: 150, f2: 60, g: 0.08, v: 0.45 });
    N(c, { t, dur: 0.1, buf: 'pink', lp: 1300, v: 0.45, a: 0.002 });
    N(c, { t, dur: 0.05, bp: 520, q: 1.4, v: 0.3 });
    N(c, { t: t + 0.02, dur: 0.35, hp: 4500, v: 0.025, a: 0.05 }); // dust puff
    setWet(c, 0.12);
  },

  paper_unfold(c) {
    [0, 0.11, 0.2, 0.36].forEach((t, i) => {
      N(c, { t, dur: 0.1 + i * 0.02, buf: 'crackle', bp: rand(2600, 4500), q: 0.8, v: 0.28, a: 0.015, rate: rand(0.7, 1.2) });
      N(c, { t, dur: 0.08, bp: rand(1500, 2500), q: 1.2, v: 0.08, a: 0.02 });
    });
    N(c, { t: 0.36, dur: 0.035, bp: 1800, q: 1.6, v: 0.3 }); // snaps taut
    N(c, { t: 0.4, dur: 0.18, a: 0.04, bp: 2400, bp2: 1200, q: 0.9, v: 0.1 }); // smoothed flat
    setWet(c, 0.05);
  },

  pencil_scribble(c) {
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const d = rand(0.06, 0.1), f = i % 2 ? 3400 : 4400;
      N(c, { t, dur: d, a: d * 0.35, bp: f * rand(0.9, 1.1), bp2: f * rand(0.8, 1.25), q: 1.6, v: 0.2 * rand(0.7, 1) });
      N(c, { t, dur: d, buf: 'fizz', a: d * 0.3, bp: 5000, q: 0.9, v: 0.12 }); // graphite grain
      t += d + rand(0.005, 0.02);
    }
    setWet(c, 0.04);
  },

  stamp(c) {
    N(c, { dur: 0.04, a: 0.03, bp: 1200, bp2: 500, q: 1, v: 0.1 }); // swing in
    const t = 0.04;
    T(c, { t, dur: 0.18, f: 190, f2: 70, g: 0.07, v: 0.5 });
    N(c, { t, dur: 0.08, buf: 'brown', lp: 700, v: 0.45, a: 0.002 });
    N(c, { t, dur: 0.035, bp: 900, q: 1.3, v: 0.3 }); // desk
    T(c, { t, dur: 0.07, type: 'triangle', f: 420, f2: 300, v: 0.12 });
    T(c, { t: 0.24, dur: 0.06, f: 500, f2: 1300, g: 0.03, v: 0.16 }); // sticky peel
    N(c, { t: 0.24, dur: 0.03, bp: 2500, q: 1.5, v: 0.08 });
    setWet(c, 0.08);
  },

  // ------------------------------------------------ doors & treats

  knock(c) {
    for (const [t, v] of [[0, 1], [0.17, 0.85], [0.34, 0.95]]) rap(c, t + rand(0, 0.016), v);
    setWet(c, 0.2);
  },

  door_creak(c) {
    creak(c, 0, 0.6, 0.6, 66);
    creak(c, 0.42, 0.75, 0.55, 92);
    T(c, { t: 0.1, dur: 0.9, type: 'triangle', f: 760, f2: 540, v: 0.15, a: 0.15, h: 0.4, vib: 7, vd: 35, bp: 900, q: 2 }); // hinge squeal
    setWet(c, 0.25);
  },

  candy_rattle(c) {
    for (let s = 0; s < 3; s++) { // three shakes of the bag
      const t0 = s * 0.15;
      N(c, { t: t0, dur: 0.1, buf: 'crackle', bp: 3800, q: 0.8, v: 0.16, a: 0.02 }); // wrappers
      for (let i = 0; i < 7; i++) {
        const t = t0 + rand(0, 0.09), f = rand(2600, 4200);
        Th(c, { t, dur: 0.035, f, v: rand(0.03, 0.06), a: 0.001 });
        Th(c, { t, dur: 0.02, f: f * 2.3, v: 0.02, a: 0.001 });
        if (i % 2) B(c, 'tick', t, rand(0.06, 0.12), rand(1.0, 1.4) * c.p);
      }
    }
    setWet(c, 0.1);
  },

  // ------------------------------------------------ garden

  plant_dig(c) {
    N(c, { dur: 0.13, bp: 1500, bp2: 650, q: 1.2, v: 0.3, a: 0.015 }); // spade bites in
    N(c, { dur: 0.12, buf: 'crackle', bp: 1700, q: 0.9, v: 0.22 });
    T(c, { dur: 0.1, f: 140, f2: 70, v: 0.28 });
    N(c, { dur: 0.1, buf: 'brown', lp: 600, v: 0.3 });
    for (let i = 0; i < 6; i++) {
      N(c, { t: 0.12 + i * rand(0.025, 0.04), dur: rand(0.02, 0.04), buf: 'brown', lp: rand(600, 1000), v: rand(0.12, 0.25) * (1 - i / 8) });
    }
    T(c, { t: 0.36, dur: 0.1, f: 330, f2: 1200, g: 0.035, v: 0.35 }); // pop!
    N(c, { t: 0.36, dur: 0.015, hp: 1800, v: 0.15 });
    setWet(c, 0.1);
  },

  water_pour(c) {
    N(c, { dur: 1.2, a: 0.15, h: 0.65, lp: 7000, hp: 2600, v: 0.12 }); // spray from the rose
    N(c, { dur: 1.2, buf: 'fizz', a: 0.12, h: 0.65, lp: 6500, bp: 3000, q: 0.8, v: 0.3 }); // droplets
    N(c, { dur: 1.15, a: 0.1, h: 0.6, bp: 650, q: 2.5, v: 0.22, am: [9, 0.3] }); // can gurgle
    for (let i = 0; i < 22; i++) { // drops on leaves
      const t = rand(0.1, 1.05), f = rand(900, 2200);
      T(c, { t, dur: 0.035, f, f2: f * rand(1.3, 1.8), v: rand(0.02, 0.05) });
    }
    setWet(c, 0.12);
  },

  sapling_grow(c) {
    const { k, out, t } = c, tr = trans(c);
    for (let i = 0; i < 9; i++) {
      const m = pent(i, 67) + tr;
      upto(c, bell(k, out, t + i * 0.07, m + 12, 0.07, 'glock', 0.6));
      if (i % 2 === 0) upto(c, pluck(k, out, t + i * 0.07, m, 0.22, 'harp'));
    }
    T(c, { dur: 0.8, f: 400, f2: 1600, v: 0.05, a: 0.3, h: 0.2, vib: 6, vd: 20 }); // growth swell
    N(c, { dur: 0.7, a: 0.4, bp: 600, bp2: 2400, q: 1, v: 0.08 });
    N(c, { t: 0.55, dur: 0.25, buf: 'crackle', bp: 3000, q: 0.8, v: 0.08, a: 0.04 }); // leaves unfurl
    for (const m of [79, 83, 86]) upto(c, bell(k, out, t + 0.66, m + tr, 0.06, 'musicbox'));
    N(c, { t: 0.62, dur: 0.8, hp: 6000, v: 0.04, a: 0.05 });
    setWet(c, 0.35);
  },

  // ------------------------------------------------ autumn leaves (UI transitions)

  // a gust of wind sweeping a drift of dry leaves across the screen
  leaf_gust(c) {
    N(c, { dur: 0.95, a: 0.38, bp: 260, bp2: 1500, q: 0.9, v: 0.42, sw: 0.7 });
    N(c, { dur: 0.9, buf: 'pink', a: 0.32, lp: 500, lp2: 1200, v: 0.22, sw: 0.6 });
    N(c, { t: 0.12, dur: 0.75, buf: 'crackle', a: 0.2, bp: 3200, q: 0.7, v: 0.16 }); // the leaves themselves
    for (let i = 0; i < 6; i++) N(c, { t: 0.15 + i * 0.09 + rand(0, 0.05), dur: 0.035, bp: rand(2400, 4800), q: 3, v: 0.05 });
    setWet(c, 0.2);
    upto(c, 1.1);
  },
  // a handful of leaves fluttering loose
  leaf_rustle(c) {
    N(c, { dur: 0.32, buf: 'crackle', a: 0.03, bp: 3600, q: 0.8, v: 0.14 });
    N(c, { dur: 0.3, a: 0.08, bp: 900, bp2: 2200, q: 1.2, v: 0.08, sw: 0.25 });
    for (let i = 0; i < 3; i++) N(c, { t: 0.04 + i * 0.07, dur: 0.03, bp: rand(2600, 4600), q: 3, v: 0.05 });
    upto(c, 0.45);
  },

  // ------------------------------------------------ bike tricks

  trick_whoosh(c) {
    for (let i = 0; i < 2; i++) { // two spins
      const t = i * 0.16, u = 1 + i * 0.15;
      N(c, { t, dur: 0.2, a: 0.08, bp: 600 * u, bp2: 2600 * u, q: 1.6, v: 0.64, sw: 0.1 });
      N(c, { t: t + 0.1, dur: 0.12, bp: 2600 * u, bp2: 900 * u, q: 1.6, v: 0.36, sw: 0.1 });
    }
    N(c, { dur: 0.4, buf: 'pink', a: 0.1, lp: 700, v: 0.2 });
    T(c, { dur: 0.32, type: 'triangle', f: 500, f2: 900, v: 0.06, a: 0.08, vib: 12, vd: 80 });
    setWet(c, 0.1);
  },

  trick_land(c) {
    const { k, out, t } = c, tr = trans(c);
    T(c, { dur: 0.2, f: 130, f2: 48, g: 0.12, v: 0.5 });
    N(c, { dur: 0.14, buf: 'brown', lp: 450, v: 0.42 });
    N(c, { dur: 0.06, buf: 'crackle', bp: 2200, q: 0.8, v: 0.08 });
    upto(c, strum(k, out, t + 0.06, [60, 64, 67, 72].map((m) => m + tr), 0.22, true, 0.02, 'harp'));
    for (const m of [72, 76, 79]) upto(c, piano(k, out, t + 0.06, m + tr, 0.16, 0.4));
    upto(c, bell(k, out, t + 0.12, 91 + tr, 0.06, 'glock'));
    setWet(c, 0.22);
  },

  combo_ding(c) { // pass a rising opts.pitch for each step of a combo
    const f = 1046.5;
    partials(c, 0, f, [[1, 0.2, 0.55], [2, 0.07, 0.3], [3, 0.05, 0.18], [4.2, 0.03, 0.1]]);
    T(c, { dur: 0.06, type: 'square', f: f * 2, v: 0.04, lp: 6000, a: 0.002 });
    T(c, { t: 0.05, dur: 0.3, type: 'triangle', f: f * 1.5, v: 0.06, a: 0.002 }); // fifth
    setWet(c, 0.18);
  },

  // ------------------------------------------------ crowds

  crowd_cheer(c) {
    N(c, { dur: 1.5, a: 0.12, h: 0.55, bp: 1100, q: 0.7, v: 0.16, am: [rand(5, 7), 0.3] }); // crowd breath
    N(c, { dur: 1.4, buf: 'pink', a: 0.1, h: 0.5, bp: 600, q: 0.9, v: 0.18 });
    for (let i = 0; i < 7; i++) { // a handful of "yaaay"s
      const f = pick([150, 180, 210, 260, 320, 380]) * rand(0.95, 1.05), t = rand(0, 0.18), d = rand(0.7, 1.1);
      vox(c, {
        t, dur: d, fc: [f * 0.8, f * 1.3, f * 1.45, f * 1.4, f * 1.2, f * 0.9], vib: rand(5, 7), vd: 25, a: 0.06, h: d * 0.45, v: 0.07,
        F: [[[700, 850, 800, 650, 500], 4, 1.3], [[1200, 1500, 1800, 2000, 2000], 6, 0.8], [2800, 7, 0.3]], br: 0.06, lp: 3500,
      });
    }
    T(c, { t: 0.25, dur: 0.5, f: 1800, f2: 2700, g: 0.18, v: 0.04, a: 0.03, h: 0.15 }); // whistle
    T(c, { t: 0.55, dur: 0.4, f: 2700, f2: 2000, v: 0.035, a: 0.02 });
    for (let i = 0; i < 12; i++) clap(c, rand(0.05, 1.3), rand(0.05, 0.12));
    setWet(c, 0.3);
  },

  applause(c) {
    N(c, { dur: 2.0, a: 0.25, h: 0.7, bp: 1300, q: 0.6, v: 0.2, am: [rand(11, 14), 0.4] });
    for (let i = 0; i < 70; i++) {
      const x = Math.pow(Math.random(), 1.4), t = x * 1.8;
      clap(c, t, rand(0.12, 0.28) * Math.min(1, t / 0.25) * (1 - x * 0.7) + 0.04);
    }
    setWet(c, 0.3);
  },

  // ------------------------------------------------ spooky critters

  ghost_ooo(c) {
    const f = rand(330, 370), d = 1.2;
    vox(c, {
      dur: d, type: 'triangle', fc: [f * 0.85, f, f * 1.25, f * 1.32, f * 1.2, f * 0.95, f * 0.75], vib: 5.5, vd: 45, a: 0.18, h: d * 0.45, v: 0.5,
      F: [[[320, 340, 360, 340, 320], 4, 1.6], [[780, 820, 860, 820, 760], 6, 0.6]], br: 0.04, lp: 2000,
    });
    T(c, { dur: d, fc: [f * 1.7, f * 2, f * 2.5, f * 2.64, f * 2.4, f * 1.9, f * 1.5], vib: 5.5, vd: 45, v: 0.035, a: 0.2, h: d * 0.45 });
    N(c, { dur: d, a: 0.3, h: 0.4, bp: 900, q: 3, v: 0.05 }); // airy
    setWet(c, 0.45);
  },

  witch_cackle(c) {
    const base = rand(600, 680);
    let t = 0;
    for (let i = 0; i < 7; i++) { // hee-hee-hee... heeee!
      const f = base * (1 - i * 0.045), last = i === 6, d = last ? 0.32 : 0.085;
      vox(c, {
        t, dur: d, fc: [f * 0.9, f * 1.15, f * 1.05, f * 0.85], a: 0.008, h: d * 0.4, v: 0.3, sh: 1.6, vib: 9, vd: last ? 60 : 10,
        F: [[[500, 380, 350], 5, 1.2], [[2100, 2400, 2300], 7, 1.0], [3200, 7, 0.35]], br: 0.12, lp: 4500,
      });
      t += 0.105 + rand(-0.008, 0.008);
    }
    setWet(c, 0.25);
  },

  bat_flutter(c) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t = i * 0.062 + rand(0, 0.01), e = Math.sin((Math.PI * (i + 0.5)) / n);
      N(c, { t, dur: 0.05, buf: 'pink', a: 0.012, bp: rand(700, 1000), q: 1.1, v: 1.0 * e + 0.15 });
      N(c, { t, dur: 0.03, a: 0.008, bp: 2600, q: 1.2, v: 0.24 * e });
    }
    for (const t of [0.12, 0.38]) { // squeaks
      const f = rand(5200, 6400);
      Th(c, { t, dur: 0.04, f, f2: f * 1.25, v: 0.08, a: 0.003 });
      Th(c, { t: t + 0.045, dur: 0.035, f: f * 1.1, f2: f * 0.9, v: 0.06 });
    }
    setWet(c, 0.2);
  },

  cauldron_bubble(c) {
    N(c, { dur: 0.7, buf: 'brown', a: 0.08, h: 0.3, lp: 380, v: 0.16 }); // simmer
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const f = rand(160, 320) * (1 + i * 0.04);
      T(c, { t, dur: rand(0.06, 0.1), f, f2: f * rand(2.2, 3), g: 0.05, v: rand(0.18, 0.3), a: 0.004 });
      N(c, { t, dur: 0.04, buf: 'pink', lp: 700, v: 0.12 });
      t += rand(0.05, 0.12);
    }
    T(c, { t, dur: 0.12, f: 260, f2: 900, g: 0.05, v: 0.3 }); // big plop
    N(c, { t: t + 0.05, dur: 0.02, hp: 2000, v: 0.08 });
    setWet(c, 0.22);
  },

  lantern_whoomp(c) {
    N(c, { dur: 0.45, a: 0.06, buf: 'brown', lp: 300, lp2: 1100, v: 0.5, sw: 0.12 }); // whoomp
    N(c, { dur: 0.4, a: 0.05, bp: 400, bp2: 1400, q: 1.2, v: 0.25, sw: 0.15 });
    T(c, { dur: 0.3, f: 70, f2: 110, g: 0.08, v: 0.32, a: 0.04 });
    N(c, { t: 0.08, dur: 0.8, buf: 'crackle', bp: 2200, q: 0.7, v: 0.22, a: 0.03, h: 0.2 }); // catches
    N(c, { t: 0.15, dur: 0.75, buf: 'pink', lp: 700, v: 0.08, a: 0.1, h: 0.3, am: [7, 0.5] }); // flame flutter
    setWet(c, 0.15);
  },

  spooky_chime(c) {
    const { k, out, t } = c, tr = trans(c), notes = [69, 72, 76, 77, 81, 84]; // A minor + a sour b6
    let tt = 0;
    for (let i = 0; i < 7; i++) {
      const m = pick(notes) + tr;
      upto(c, bell(k, out, t + tt, m, rand(0.06, 0.1) * (1 - i * 0.08), 'glock', 1.3));
      upto(c, bell(k, out, t + tt + 0.003, m + 0.12, 0.03, 'musicbox', 1.2)); // beating partner tube
      tt += rand(0.09, 0.22);
    }
    N(c, { dur: 1.0, a: 0.3, bp: 900, q: 0.8, v: 0.04 }); // breeze
    setWet(c, 0.45);
  },

  // ------------------------------------------------ bike on foot

  bike_mount(c) {
    creak(c, 0, 0.28, 0.1, 120); // saddle springs
    T(c, { t: 0.02, dur: 0.22, type: 'triangle', f: 380, f2: 330, v: 0.05, vib: 28, vd: 60 });
    N(c, { t: 0.04, dur: 0.06, buf: 'brown', lp: 500, v: 0.25 });
    for (let i = 0; i < 4; i++) B(c, 'tick', 0.06 + i * 0.03 + rand(0, 0.01), 0.12 - i * 0.02, rand(0.6, 0.8) * c.p); // chain
    partials(c, 0.18, 2850, BIKE, 0.09); // the bell gets bumped
    N(c, { t: 0.18, dur: 0.006, hp: 4000, v: 0.07 });
    setWet(c, 0.12);
  },

  bike_dismount(c) {
    N(c, { dur: 0.06, bp: 1200, q: 1, v: 0.12, a: 0.01 }); // foot scuff
    T(c, { t: 0.04, dur: 0.12, type: 'triangle', f: 900, f2: 1500, v: 0.04, vib: 40, vd: 80 }); // spring zing
    const t = 0.12; // kickstand clacks down
    N(c, { t, dur: 0.03, bp: 2600, q: 1.4, v: 0.4 });
    for (const [r, a] of [[1, 0.12], [1.48, 0.08], [2.1, 0.05], [2.9, 0.03]]) T(c, { t, dur: rand(0.12, 0.22), f: 1180 * r, v: a, a: 0.001 });
    T(c, { t, dur: 0.08, type: 'triangle', f: 340, f2: 200, v: 0.22 });
    B(c, 'tick', t + 0.05, 0.15, 0.7 * c.p);
    N(c, { t: t + 0.03, dur: 0.06, buf: 'brown', lp: 500, v: 0.2 });
    setWet(c, 0.1);
  },

  // ------------------------------------------------ footsteps

  footstep_wood(c) {
    const f = rand(130, 160);
    T(c, { dur: 0.1, f, f2: f * 0.65, g: 0.05, v: 0.3 });
    N(c, { dur: 0.07, bp: rand(440, 560), q: 2.5, v: 0.32 }); // plank
    N(c, { dur: 0.012, bp: 2000, q: 1, v: 0.08 });
    if (Math.random() < 0.3) creak(c, 0.03, 0.12, 0.04, rand(150, 190));
    setWet(c, 0.08);
  },

  footstep_grass(c) {
    N(c, { dur: 0.13, a: 0.012, buf: 'crackle', bp: rand(3000, 4500), q: 0.7, v: 0.36, rate: rand(0.8, 1.1) });
    N(c, { dur: 0.12, a: 0.015, bp: rand(2600, 3400), q: 0.8, v: 0.13 });
    N(c, { dur: 0.07, buf: 'brown', lp: rand(260, 340), v: 0.45, a: 0.006 });
    setWet(c, 0.03);
  },

  footstep_stone(c) {
    N(c, { dur: 0.035, bp: rand(2200, 2900), q: 1.1, v: 0.22 });
    T(c, { dur: 0.03, type: 'triangle', f: rand(900, 1100), f2: 600, v: 0.06 });
    N(c, { dur: 0.06, buf: 'brown', lp: 380, v: 0.25, a: 0.003 });
    N(c, { t: 0.008, dur: 0.06, buf: 'crackle', bp: rand(3000, 4000), q: 0.9, v: 0.12 }); // grit
    setWet(c, 0.1);
  },

  jump_foot(c) {
    N(c, { dur: 0.04, buf: 'brown', lp: 500, v: 0.2 }); // push-off
    N(c, { dur: 0.03, bp: 1500, q: 1, v: 0.06 });
    T(c, { t: 0.01, dur: 0.2, type: 'triangle', f: 330, f2: 620, g: 0.09, v: 0.22, vib: 30, vd: 90, vdd: 8, lp: 2400 });
    T(c, { t: 0.01, dur: 0.12, f: 660, f2: 1240, g: 0.08, v: 0.04 });
  },

  land_foot(c) {
    T(c, { dur: 0.13, f: 140, f2: 60, g: 0.08, v: 0.38 });
    N(c, { dur: 0.09, buf: 'brown', lp: 450, v: 0.32, a: 0.003 });
    N(c, { t: 0.01, dur: 0.06, buf: 'crackle', bp: 2600, q: 0.8, v: 0.07 });
    setWet(c, 0.05);
  },

  splash_small(c) {
    T(c, { dur: 0.08, f: 280, f2: 900, g: 0.03, v: 0.2 }); // plop
    N(c, { dur: 0.32, h: 0.03, bp: 1900, bp2: 600, q: 0.9, v: 0.3, a: 0.004 });
    N(c, { dur: 0.2, hp: 3200, v: 0.08, a: 0.003 });
    for (let i = 0; i < 6; i++) {
      const f = rand(700, 1600);
      T(c, { t: rand(0.04, 0.32), dur: rand(0.025, 0.045), f, f2: f * rand(1.5, 2.2), v: rand(0.03, 0.06) });
    }
  },

  // ------------------------------------------------ quest stingers

  quest_new(c) {
    const { k, out, t } = c, tr = trans(c);
    for (const [d, m] of [[0, 67], [0.1, 72], [0.2, 76]]) {
      upto(c, pluck(k, out, t + d, m + tr, 0.3, 'harp'));
      upto(c, bell(k, out, t + d, m + 12 + tr, 0.07, 'musicbox'));
    }
    upto(c, bell(k, out, t + 0.34, 86 + tr, 0.09, 'musicbox')); // open-ended lift
    upto(c, pad(k, out, t + 0.05, [60 + tr, 64 + tr, 67 + tr], 0.4, 0.04, { attack: 0.08, release: 0.5, cutoff: 1800 }));
    setWet(c, 0.3);
  },

  quest_done(c) {
    const { k, out, t } = c, tr = trans(c);
    for (const [d, m, len] of [[0, 67, 0.07], [0.11, 67, 0.07], [0.22, 67, 0.07], [0.34, 72, 0.5]]) {
      brass(c, d, m + tr, len, 0.05);
      upto(c, pluck(k, out, t + d, m + tr, 0.25, 'harp'));
    }
    for (const m of [60, 64, 67, 72]) upto(c, piano(k, out, t + 0.34, m + tr, 0.12, 0.6));
    upto(c, piano(k, out, t + 0.34, 48 + tr, 0.16, 0.6));
    [0, 4, 7, 12].forEach((s, i) => upto(c, bell(k, out, t + 0.38 + i * 0.05, 84 + s + tr, 0.06, 'glock')));
    N(c, { t: 0.34, dur: 0.8, hp: 6000, v: 0.04, a: 0.08 });
    setWet(c, 0.3);
  },

  item_get(c) {
    const { k, out, t } = c, tr = trans(c);
    [0, 4, 7, 12, 16].forEach((s, i) => upto(c, bell(k, out, t + i * 0.04, 84 + s + tr, 0.07, 'glock', 0.7)));
    upto(c, chip(k, out, t, 72 + tr, 0.06, 0.04, 0.25));
    upto(c, chip(k, out, t + 0.07, 79 + tr, 0.2, 0.04, 0.25));
    T(c, { dur: 0.25, f: 1200, f2: 2400, v: 0.04, a: 0.02 });
    N(c, { t: 0.05, dur: 0.5, hp: 6500, v: 0.05, a: 0.04 });
    for (let i = 0; i < 6; i++) Th(c, { t: 0.15 + rand(0, 0.35), dur: 0.08, f: rand(4000, 7000), v: 0.015, a: 0.002 }); // glints
    setWet(c, 0.3);
  },

  // ------------------------------------------------ cat

  cat_meow_happy(c) {
    const f = rand(560, 640);
    vox(c, { // mrrp
      dur: 0.14, fc: [f * 0.8, f * 0.95, f * 1.05], a: 0.01, h: 0.06, v: 0.28, am: [32, 0.6],
      F: [[[500, 650, 700], 5, 1.2], [[1600, 1700, 1800], 7, 0.8]], br: 0.04, lp: 3500,
    });
    const d = 0.34;
    vox(c, { // ...mew!
      t: 0.16, dur: d, fc: [f * 1.05, f * 1.3, f * 1.45, f * 1.55, f * 1.62], vib: 7, vd: 18, a: 0.03, h: d * 0.5, v: 0.4,
      F: [[[450, 800, 950, 900, 850], 5, 1.2], [[2300, 2000, 1800, 1900, 2100], 7, 0.9], [3300, 6, 0.3]], br: 0.04, lp: 4200,
    });
    setWet(c, 0.12);
  },

  cat_hiss(c) {
    N(c, { dur: 0.03, bp: 2500, q: 1, v: 0.2 }); // spit
    N(c, { dur: 0.6, a: 0.02, h: 0.3, lp: 6500, bp: 4000, bp2: 3200, q: 1.1, v: 0.3 });
    N(c, { dur: 0.55, a: 0.03, h: 0.25, hp: 2400, v: 0.06, am: [22, 0.3] });
    T(c, { dur: 0.6, type: 'sawtooth', f: 110, f2: 95, v: 0.05, a: 0.05, h: 0.3, lp: 500, am: [26, 0.8, 'square'] }); // growl
    setWet(c, 0.1);
  },

  // ------------------------------------------------ money & kitchen

  cash_coins(c) {
    let t = 0;
    for (let i = 0; i < 16; i++) {
      const f = rand(2600, 3800), v = 0.07 * (1 - i / 22);
      for (const [r, a, d] of [[1, 1, 0.16], [1.83, 0.6, 0.1], [2.71, 0.35, 0.07]]) Th(c, { t, dur: d * rand(0.8, 1.3), f: f * r, v: v * a, a: 0.001 });
      N(c, { t, dur: 0.006, hp: 4000, v: v * 1.2 });
      t += rand(0.015, 0.05) * (1 + i * 0.05);
    }
    N(c, { t: 0.05, dur: 0.18, buf: 'pink', lp: 700, v: 0.18, a: 0.01 }); // purse bulges
    N(c, { t: 0.35, dur: 0.12, buf: 'pink', lp: 600, v: 0.12, a: 0.01 });
    setWet(c, 0.12);
  },

  cook_sizzle(c) {
    N(c, { dur: 0.12, buf: 'brown', lp: 500, v: 0.18 }); // food meets pan
    N(c, { dur: 1.05, a: 0.01, h: 0.35, lp: 7500, hp: 2600, v: 0.16 });
    N(c, { dur: 1.05, buf: 'fizz', a: 0.02, h: 0.4, bp: 4200, q: 0.7, v: 0.35 });
    N(c, { dur: 1.0, buf: 'crackle', a: 0.02, h: 0.4, hp: 1800, v: 0.3 }); // fat spits
    setWet(c, 0.06);
  },

  oven_ding(c) {
    B(c, 'tick', 0, 0.15, 0.9 * c.p); // timer trips
    partials(c, 0.02, 1568, [[1, 0.22, 1.4], [1.003, 0.12, 1.2], [2.76, 0.07, 0.5], [5.4, 0.035, 0.22], [8.93, 0.015, 0.1]]);
    N(c, { t: 0.02, dur: 0.01, hp: 3500, v: 0.15 });
    setWet(c, 0.22);
  },

  pour_cocoa(c) {
    N(c, { dur: 1.0, a: 0.08, h: 0.65, bp: 300, bp2: 820, q: 6, v: 0.55, sw: 0.9, am: [11, 0.25] }); // thick stream, cup filling
    N(c, { dur: 1.0, buf: 'brown', a: 0.06, h: 0.65, lp: 600, v: 0.18 });
    N(c, { dur: 0.95, buf: 'pink', a: 0.06, h: 0.6, bp: 1600, q: 1.2, v: 0.06 });
    for (let i = 0; i < 10; i++) {
      const tt = rand(0.1, 0.9), f = (260 + tt * 500) * rand(0.9, 1.25);
      T(c, { t: tt, dur: 0.05, f, f2: f * 1.5, v: rand(0.04, 0.08) });
    }
    T(c, { t: 0.98, dur: 0.08, f: 300, f2: 520, v: 0.12 }); // last drip
    setWet(c, 0.1);
  },

  slurp(c) {
    N(c, { dur: 0.45, a: 0.05, h: 0.25, bp: 500, bp2: 2600, q: 5, v: 0.55, sw: 0.4, am: [32, 0.6] });
    N(c, { dur: 0.42, buf: 'fizz', a: 0.04, h: 0.22, bp: 2200, q: 1, v: 0.25 });
    T(c, { dur: 0.42, type: 'triangle', f: 420, f2: 900, v: 0.05, a: 0.06, h: 0.2, am: [32, 0.6] });
    N(c, { t: 0.46, dur: 0.12, bp: 1400, bp2: 2600, q: 3, v: 0.25, a: 0.01 }); // final sip
    T(c, { t: 0.58, dur: 0.06, f: 700, f2: 300, v: 0.12 }); // lip smack
    setWet(c, 0.06);
  },
};
