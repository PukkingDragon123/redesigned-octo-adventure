// One-shot SFX, part 2: critters, characters, magic and musical stingers.
import { T, N, vox, rand, randi, mtof, pluck, piano, pad, bell, chip, flute } from './synth.js';
import { pent, setWet } from './sfx.js';

const trans = (c) => Math.round(12 * Math.log2(c.p || 1));
const upto = (c, end) => { if (end > c.end) c.end = end; };

/** Great horned owl "hoo, h'hoo, hoo, hoo". Exported for the night ambience. */
export function owlCall(c) {
  const f = rand(360, 400);
  const hoo = (t, d, v, fm = 1) => {
    T(c, { t, dur: d, f: f * fm * 1.04, f2: f * fm * 0.94, v, a: d * 0.35, h: d * 0.2, lp: 900 });
    N(c, { t, dur: d, bp: f * fm * 2, q: 3, v: v * 0.3, a: d * 0.35 });
  };
  hoo(0, 0.42, 0.32);
  hoo(0.62, 0.2, 0.26, 1.03);
  hoo(0.86, 0.36, 0.32);
  hoo(1.36, 0.42, 0.28, 0.97);
  setWet(c, 0.4);
}

export const SFX2 = {
  meow(c) {
    const d = rand(0.5, 0.65), f = rand(480, 560);
    vox(c, {
      dur: d, fc: [f * 0.9, f * 1.25, f * 1.42, f * 1.3, f * 1.05, f * 0.85], vib: 6, vd: 15, a: 0.05, h: d * 0.5, v: 0.4,
      F: [[[350, 700, 900, 800, 600, 450], 5, 1.2], [[2200, 1900, 1500, 1200, 1000, 900], 7, 0.9], [3200, 6, 0.3]], br: 0.05, lp: 4000,
    });
    setWet(c, 0.12);
  },

  meow_sad(c) {
    const d = rand(0.85, 1.0), f = rand(520, 580);
    vox(c, {
      dur: d, fc: [f * 1.05, f * 1.12, f, f * 0.85, f * 0.72, f * 0.62], vib: 5, vd: 30, a: 0.08, h: d * 0.55, v: 0.38,
      F: [[[400, 650, 750, 600, 480, 420], 5, 1.2], [[1900, 1600, 1300, 1100, 950, 850], 7, 0.8]], br: 0.06, lp: 3500,
    });
    setWet(c, 0.15);
  },

  purr(c) {
    N(c, { dur: 0.7, buf: 'pink', a: 0.15, h: 0.35, lp: 500, v: 0.35, am: [27, 0.85, 'triangle'] }); // inhale
    T(c, { dur: 0.7, type: 'sawtooth', f: 54, v: 0.1, a: 0.15, h: 0.35, lp: 300, am: [27, 0.85, 'triangle'] });
    N(c, { t: 0.72, dur: 0.8, buf: 'pink', a: 0.12, h: 0.45, lp: 420, v: 0.45, am: [23, 0.9, 'triangle'] }); // exhale
    T(c, { t: 0.72, dur: 0.8, type: 'sawtooth', f: 48, v: 0.13, a: 0.12, h: 0.45, lp: 280, am: [23, 0.9, 'triangle'] });
    setWet(c, 0.05);
  },

  scream(c) {
    const d = rand(0.85, 1.0), f = rand(330, 420);
    vox(c, {
      dur: d, fc: [f * 0.8, f * 1.6, f * 1.75, f * 1.7, f * 1.6, f * 1.35, f * 1.05], vib: 8, vd: 45, a: 0.04, h: d * 0.6, v: 0.5, sh: 1.5,
      F: [[[600, 850, 900, 900, 880, 850, 800], 5, 1.4], [[1700, 1300, 1250, 1250, 1220, 1200, 1150], 6, 1.0], [2600, 7, 0.45]], br: 0.1,
    });
    setWet(c, 0.2);
  },

  gasp(c) {
    N(c, { dur: 0.32, a: 0.05, h: 0.06, bp: 700, bp2: 1100, q: 2.2, v: 0.4, sw: 0.1 });
    N(c, { dur: 0.3, a: 0.05, h: 0.05, bp: 1800, bp2: 2300, q: 3, v: 0.25, sw: 0.1 });
    T(c, { dur: 0.12, a: 0.03, f: 420, f2: 520, v: 0.05, lp: 1200 });
  },

  brrr(c) {
    let t = 0;
    while (t < 0.9) { // chattering teeth
      N(c, { t, dur: 0.015, bp: rand(2500, 3600), q: 2, v: rand(0.1, 0.2) });
      t += rand(0.05, 0.075);
    }
    T(c, { dur: 0.95, type: 'sawtooth', f: 150, f2: 135, v: 0.18, a: 0.04, h: 0.6, lp: 900, am: [28, 0.8, 'square'] }); // lip trill
    N(c, { dur: 0.9, buf: 'pink', bp: 700, q: 1, v: 0.1, a: 0.05, h: 0.6, am: [28, 0.7, 'square'] });
  },

  reaper(c) {
    N(c, { dur: 1.6, a: 0.5, bp: 300, bp2: 1800, q: 1.4, v: 0.3, sw: 0.9 });
    N(c, { t: 0.9, dur: 1.1, a: 0.1, bp: 1800, bp2: 350, q: 1.4, v: 0.2, sw: 1.0 });
    for (const m of [38, 45, 50, 57]) { // low "ooh" choir
      const f = mtof(m) * rand(0.995, 1.005);
      vox(c, {
        dur: 2.0, fc: [f * 0.98, f, f, f * 0.97], vib: 4.5 + Math.random(), vd: 12, a: 0.6, h: 0.8, v: 0.12,
        F: [[[400, 450, 420, 380], 4, 1.5], [[800, 900, 850, 750], 5, 0.8]],
      });
    }
    T(c, { t: 0.3, dur: 1.4, f: 880, f2: 520, v: 0.04, vib: 5.5, vd: 40, a: 0.3, h: 0.5 }); // ghostly whistle
    setWet(c, 0.5);
  },

  magic(c) {
    for (let i = 0; i < 20; i++) {
      const idx = Math.floor(i * 0.7) + randi(0, 2);
      T(c, { t: i * 0.075 + rand(0, 0.02), dur: 0.5, f: mtof(pent(idx, 79)), v: 0.06 + (i % 3 === 0 ? 0.03 : 0), a: 0.002 });
    }
    for (const m of [72, 76, 79, 84]) T(c, { dur: 2.0, f: mtof(m), v: 0.04, a: 0.5, h: 0.6, am: [rand(5, 7), 0.4] });
    N(c, { dur: 1.8, a: 0.6, hp: 5000, v: 0.08, h: 0.4 });
    setWet(c, 0.45);
  },

  chirp(c) {
    let t = 0;
    for (let i = 0, n = randi(2, 3); i < n; i++) {
      const f = rand(3200, 4800);
      T(c, { t, dur: rand(0.05, 0.08), f, f2: f * rand(0.6, 0.8), v: 0.18, a: 0.004 });
      T(c, { t: t + 0.05, dur: 0.05, f: f * 0.75, f2: f * 1.1, v: 0.12 });
      t += rand(0.11, 0.16);
    }
    setWet(c, 0.2);
  },

  goose(c) {
    const honk = (t, f, d, v) => vox(c, {
      t, dur: d, fc: [f * 0.9, f * 1.08, f * 1.12, f * 0.95], a: 0.012, h: d * 0.5, v, sh: 2.5,
      F: [[750, 4, 1.4], [1800, 6, 0.9], [2600, 6, 0.4]], am: [55, 0.35], br: 0.05,
    });
    honk(0, rand(360, 400), 0.2, 0.4);
    honk(0.26, rand(420, 460), 0.28, 0.45);
    setWet(c, 0.2);
  },

  moose(c) {
    const f = rand(95, 110);
    vox(c, {
      dur: 1.6, fc: [f * 0.85, f * 1.15, f * 1.3, f * 1.25, f * 1.05, f * 0.8, f * 0.65], a: 0.12, h: 1.0, v: 0.5, sh: 2,
      F: [[[500, 650, 700, 650, 520, 400, 350], 4, 1.6], [[900, 1100, 1150, 1050, 900, 750, 700], 5, 0.9]], am: [31, 0.25], br: 0.04, lp: 1400,
    });
    setWet(c, 0.3);
  },

  deer(c) {
    N(c, { dur: 0.28, a: 0.01, h: 0.04, bp: 900, q: 1.4, v: 0.4, am: [42, 0.5] });
    N(c, { dur: 0.22, buf: 'pink', lp: 600, v: 0.25, a: 0.01 });
    N(c, { t: 0.02, dur: 0.15, hp: 2500, v: 0.06 });
  },

  crow(c) {
    const caw = (t, f, d) => vox(c, {
      t, dur: d, fc: [f * 1.1, f * 1.2, f, f * 0.82], a: 0.015, h: d * 0.45, v: 0.45, sh: 3,
      F: [[1100, 3.5, 1.4], [1750, 4, 1], [2600, 5, 0.4]], am: [72, 0.45], br: 0.08,
    });
    caw(0, rand(560, 640), 0.3);
    caw(0.38, rand(520, 600), 0.32);
    setWet(c, 0.25);
  },

  owl: owlCall,

  rooster(c) {
    const syl = [[0, 0.13, 520, 640], [0.15, 0.09, 600, 600], [0.27, 0.16, 700, 820], [0.45, 0.11, 760, 740], [0.58, 0.7, 860, 640]];
    for (const [t, d, f1, f2] of syl) {
      const long = d > 0.3;
      vox(c, {
        t, dur: d, fc: [f1, ((f1 + f2) / 2) * 1.06, f2], a: 0.015, h: d * 0.55, v: 0.4, sh: 2.2, vib: 7, vd: long ? 40 : 10,
        F: [[long ? [900, 700, 500] : 850, 4, 1.3], [long ? [1500, 1100, 900] : 1450, 5, 0.9], [2800, 6, 0.4]], br: 0.06,
      });
    }
    setWet(c, 0.3);
  },

  snore(c) {
    T(c, { dur: 0.8, type: 'sawtooth', f: 68, f2: 78, v: 0.32, a: 0.5, h: 0.15, lp: 650, am: [31, 0.7] }); // snork in
    N(c, { dur: 0.8, buf: 'pink', bp: 500, q: 1.4, v: 0.3, a: 0.5, h: 0.15, am: [31, 0.6] });
    T(c, { t: 0.85, dur: 0.65, f: 950, f2: 620, v: 0.1, a: 0.08, h: 0.3, vib: 5, vd: 20 }); // whistle out
    N(c, { t: 0.85, dur: 0.65, buf: 'pink', bp: 1200, q: 1.5, v: 0.14, a: 0.1, h: 0.3 });
  },

  // ------------------------------------------------ musical stingers

  upgrade(c) {
    const { k, out, t } = c, tr = trans(c);
    [72, 76, 79, 84].forEach((m, i) => {
      upto(c, pluck(k, out, t + i * 0.07, m + tr, 0.35, 'harp'));
      upto(c, chip(k, out, t + i * 0.07, m + 12 + tr, 0.06, 0.035, 0.25));
    });
    for (const m of [84, 88, 91]) {
      upto(c, bell(k, out, t + 0.3, m + tr, 0.1, 'glock'));
      upto(c, pluck(k, out, t + 0.3, m - 12 + tr, 0.22, 'harp'));
    }
    upto(c, chip(k, out, t + 0.3, 96 + tr, 0.5, 0.03, 0.125));
    N(c, { t: 0.3, dur: 0.9, hp: 6000, v: 0.05, a: 0.1 });
    setWet(c, 0.3);
  },

  delivered(c) {
    const { k, out, t } = c, tr = trans(c);
    [[0, 67], [0.12, 72], [0.24, 76]].forEach(([d, m]) => upto(c, piano(k, out, t + d, m + tr, 0.35, 0.3)));
    for (const m of [72, 76, 79]) upto(c, piano(k, out, t + 0.4, m + tr, 0.26, 0.7));
    upto(c, piano(k, out, t + 0.4, 48 + tr, 0.3, 0.7));
    upto(c, bell(k, out, t + 0.4, 84 + tr, 0.12, 'musicbox'));
    upto(c, bell(k, out, t + 0.52, 91 + tr, 0.06, 'musicbox'));
    setWet(c, 0.3);
  },

  collect(c) {
    const { k, out, t } = c, tr = trans(c);
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) => upto(c, bell(k, out, t + i * 0.035, 84 + s + tr, 0.06, 'glock')));
    for (const [d, m, len] of [[0.32, 76, 0.12], [0.46, 79, 0.12], [0.6, 84, 0.7]]) {
      upto(c, pluck(k, out, t + d, m + tr, 0.35, 'harp'));
      upto(c, chip(k, out, t + d, m + tr, len, 0.035, 0.5));
    }
    upto(c, pad(k, out, t + 0.6, [72 + tr, 76 + tr, 79 + tr], 0.5, 0.06, { attack: 0.08, release: 0.6, cutoff: 2400 }));
    upto(c, bell(k, out, t + 0.62, 96 + tr, 0.06, 'glock'));
    setWet(c, 0.35);
  },

  day_start(c) {
    const { k, out, t } = c, tr = trans(c);
    for (const [d, m, len] of [[0, 67, 0.3], [0.28, 71, 0.3], [0.56, 74, 0.3], [0.84, 79, 0.6], [1.3, 78, 0.25], [1.5, 79, 0.9]]) {
      upto(c, flute(k, out, t + d, m + tr, len, 0.12));
    }
    [[0, [55, 59, 62, 67]], [0.84, [48, 55, 60, 64]], [1.5, [55, 62, 67, 71]]].forEach(([d, ns]) => {
      ns.forEach((m, i) => upto(c, pluck(k, out, t + d + i * 0.06, m + tr, 0.22, 'guitar')));
    });
    for (let i = 0; i < 2; i++) { // a bird answers
      const f = rand(3600, 4200);
      T(c, { t: 2.1 + i * 0.14, dur: 0.07, f, f2: f * 0.7, v: 0.05 });
    }
    setWet(c, 0.3);
  },

  day_end(c) {
    const { k, out, t } = c, tr = trans(c);
    [[0, [53, 57, 60]], [0.75, [55, 59, 62]], [1.5, [48, 55, 60, 64]]].forEach(([d, ns], i) => {
      upto(c, pad(k, out, t + d, ns.map((n) => n + 12 + tr), i < 2 ? 0.75 : 1.3, 0.05, { attack: 0.3, release: 0.9, cutoff: 1200 }));
      upto(c, pluck(k, out, t + d, ns[0] - 12 + tr, 0.25, 'guitar'));
    });
    for (const [d, m] of [[0, 77], [0.375, 76], [0.75, 74], [1.125, 71], [1.5, 72]]) {
      upto(c, bell(k, out, t + d, m + 12 + tr, d < 1.5 ? 0.16 : 0.2, 'musicbox'));
    }
    setWet(c, 0.35);
  },
};
