// One-shot SFX, part 1: bike, UI, impacts, mechanical, liquids, weather.
// Every entry is fn(c) with c = { k, ctx, out, wet, t, p, end } (see synth.js).
import { T, N, B, rand, randi, clamp, mtof } from './synth.js';

// ------------------------------------------------------------ shared pieces

const PENT = [0, 2, 4, 7, 9];
export const pent = (i, base) => base + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
export const setWet = (c, v) => { if (c.wet) c.wet.gain.value = v; };

/** Bicycle bell: thumb flicks = bursts of fast clapper strikes on a bright dome. */
export function bikeBell(c, t0, f0, rings, vol = 1) {
  const ctx = c.ctx, sum = ctx.createGain(), g = sum.gain, at = c.t + t0;
  sum.connect(c.out);
  g.setValueAtTime(0, at);
  let tt = at;
  for (let r = 0; r < rings; r++) {
    for (let h = 0; h < 5; h++) {
      const ht = tt + h * 0.031 + rand(-0.003, 0.003);
      const pk = (1 - h * 0.14) * (r ? 0.85 : 1) * 0.3 * vol;
      g.setTargetAtTime(pk, ht, 0.0015);
      g.setTargetAtTime(pk * 0.45, ht + 0.007, 0.018);
    }
    tt += 0.23;
  }
  const lastHit = tt - 0.23 + 4 * 0.031 + 0.01;
  g.setTargetAtTime(0, lastHit, 0.2);
  const end = lastHit + 1.4, f = f0 * c.p;
  for (const [r, a] of [[1, 0.5], [1.0068, 0.42], [2.43, 0.2], [3.94, 0.1], [5.56, 0.05]]) {
    const o = ctx.createOscillator(), pg = ctx.createGain();
    o.frequency.value = f * r;
    pg.gain.value = a;
    o.connect(pg);
    pg.connect(sum);
    o.start(at);
    o.stop(end);
  }
  if (end > c.end) c.end = end;
}

/** Stick-slip wood/metal creak: jittery saw through narrow resonances. */
export function creak(c, t, dur, v, base = 80) {
  const fc = [];
  let f = base;
  for (let i = 0; i < 28; i++) {
    f = clamp(f * rand(0.86, 1.17), base * 0.55, base * 1.9);
    fc.push(f);
  }
  T(c, { t, dur, type: 'sawtooth', fc, v, a: 0.03, h: dur * 0.55, bp: 950, q: 6 });
  T(c, { t, dur, type: 'sawtooth', fc, v: v * 0.6, a: 0.03, h: dur * 0.55, bp: 2300, q: 7 });
}

/** Wooden bar strike (bones, rattles). */
export function xylo(c, t, f, v) {
  T(c, { t, dur: 0.2, f, v, a: 0.001, fixed: true });
  T(c, { t, dur: 0.07, f: f * 3.93, v: v * 0.3, a: 0.001, fixed: true });
  N(c, { t, dur: 0.015, bp: 2800, q: 1, v: v * 0.45 });
}

function honk(c, t, dur, f, f2, v) {
  for (const det of [0, 11]) T(c, { t, dur, type: 'sawtooth', f, f2, det, v, a: 0.02, h: dur * 0.55, bp: 620, q: 2.2, sh: 2.4 });
  T(c, { t, dur, type: 'sawtooth', f, f2, v: v * 0.5, a: 0.02, h: dur * 0.55, bp: 1650, q: 4 });
  T(c, { t, dur, type: 'square', f: f / 2, f2: f2 / 2, v: v * 0.4, a: 0.02, h: dur * 0.55, lp: 600 });
}

function clank(c, t, v, f) {
  N(c, { t, dur: 0.05, bp: f * 1.6, q: 1.4, v: v * 0.6 });
  for (const r of [1, 1.47, 2.09, 2.81]) {
    T(c, { t, dur: rand(0.08, 0.26), f: f * r * rand(0.98, 1.02), v: (v * 0.22) / r, a: 0.001 });
  }
}

function knock(c, t) {
  T(c, { t, dur: 0.12, f: 190, f2: 120, g: 0.08, v: 0.42 });
  N(c, { t, dur: 0.06, bp: 520, q: 1.5, v: 0.4 });
  N(c, { t, dur: 0.015, bp: 2000, q: 1, v: 0.12 });
}

function gear(c, m) {
  N(c, { dur: 0.035, bp: 1300 * m, q: 2, v: 0.3 });
  T(c, { dur: 0.05, type: 'triangle', f: 420 * m, f2: 260 * m, v: 0.25 });
  T(c, { dur: 0.06, f: 3100 * m, v: 0.06, a: 0.001 });
  B(c, 'tick', 0.05, 0.25, 0.9 * m * c.p);
  B(c, 'tick', 0.085, 0.16, 1.05 * m * c.p);
}

function putt(c, t, v, f = 1) {
  T(c, { t, dur: 0.07, type: 'triangle', f: 105 * f, f2: 55 * f, v, sh: 3 });
  N(c, { t, dur: 0.06, buf: 'brown', lp: 700 * f, v: v * 0.9 });
  N(c, { t, dur: 0.03, bp: 1200 * f, q: 1.2, v: v * 0.25 });
}

// ------------------------------------------------------------ library

export const SFX = {
  bell(c) {
    bikeBell(c, 0, rand(2800, 2900), 2);
    setWet(c, 0.18);
  },

  horn_moose(c) {
    honk(c, 0, 0.24, 215, 200, 0.2);
    honk(c, 0.3, 0.5, 200, 150, 0.22);
  },

  coin(c) {
    T(c, { dur: 0.08, type: 'square', f: 1318.5, v: 0.1, lp: 5000, a: 0.002, h: 0.03 });
    T(c, { t: 0.07, dur: 0.5, type: 'square', f: 1760, v: 0.11, lp: 5200, a: 0.002, h: 0.05 });
    T(c, { t: 0.07, dur: 0.6, f: 3520, v: 0.05 });
    T(c, { dur: 0.15, f: 5274, v: 0.025 });
    T(c, { t: 0.11, dur: 0.25, f: rand(6000, 7000), v: 0.02 });
    setWet(c, 0.15);
  },

  cash(c) {
    N(c, { dur: 0.025, hp: 2500, v: 0.25 });
    T(c, { t: 0.05, dur: 0.07, type: 'triangle', f: 300, f2: 160, v: 0.25 });
    N(c, { t: 0.05, dur: 0.14, buf: 'crackle', bp: 2400, q: 0.9, v: 0.35 });
    const f = 1680;
    for (const [r, a, d] of [[1, 0.13, 1.2], [1.006, 0.08, 0.9], [2.02, 0.08, 0.7], [2.98, 0.06, 0.5], [4.16, 0.04, 0.35], [5.43, 0.025, 0.2]]) {
      T(c, { t: 0.15, dur: d, f: f * r, v: a, a: 0.002 });
    }
    T(c, { t: 0.17, dur: 0.3, f: 5040, v: 0.03 });
    setWet(c, 0.15);
  },

  jump(c) {
    T(c, { dur: 0.24, type: 'triangle', f: 250, f2: 700, g: 0.14, v: 0.32, vib: 26, vd: 70, vdd: 10, lp: 2600 });
    T(c, { dur: 0.16, f: 500, f2: 1400, g: 0.12, v: 0.08 });
    N(c, { dur: 0.16, bp: 900, bp2: 2400, q: 0.9, v: 0.05, a: 0.03 });
  },

  land(c) {
    T(c, { dur: 0.2, f: 125, f2: 48, g: 0.12, v: 0.5 });
    N(c, { dur: 0.14, buf: 'brown', lp: 420, v: 0.45 });
    N(c, { dur: 0.08, buf: 'crackle', bp: 2200, q: 0.8, v: 0.08 });
  },

  land_hard(c) {
    T(c, { dur: 0.34, f: 105, f2: 36, g: 0.22, v: 0.6 });
    N(c, { dur: 0.3, buf: 'brown', lp: 700, lp2: 180, v: 0.55 });
    N(c, { dur: 0.1, buf: 'crackle', bp: 2600, q: 0.9, v: 0.16 });
    creak(c, 0.07, 0.36, 0.1, 85);
    for (let i = 0; i < 5; i++) B(c, 'tick', 0.03 + i * 0.05 + rand(0, 0.015), 0.12 - i * 0.02, rand(0.5, 0.8) * c.p);
  },

  crash(c) {
    T(c, { dur: 0.28, f: 95, f2: 38, v: 0.5 });
    N(c, { dur: 0.35, buf: 'brown', lp: 900, lp2: 250, v: 0.5 });
    for (let i = 0; i < 9; i++) clank(c, i ? rand(0.02, 0.5) * (0.4 + i / 9) : 0, rand(0.18, 0.32) * (1 - i / 12), rand(700, 2600));
    N(c, { t: 0.05, dur: 0.4, buf: 'crackle', bp: 3000, q: 0.7, v: 0.2 });
    bikeBell(c, rand(0.15, 0.3), rand(2600, 3000), 1, 0.6);
    let tt = 0.65, iv = 0.032; // the wheel spins down: tick... tick...
    while (tt < 1.75) {
      B(c, 'tick', tt, 0.09, rand(0.9, 1.1));
      tt += iv;
      iv *= 1.11;
    }
  },

  bones(c) {
    let t = 0;
    const n = 15;
    for (let i = 0; i < n; i++) {
      const idx = Math.round(12 - (i / n) * 11 + randi(-2, 2));
      xylo(c, t, mtof(pent(idx, 64)) * c.p, 0.2 * (1 - (i / n) * 0.5));
      t += rand(0.025, 0.075) * (1 + i * 0.06);
    }
    T(c, { t: t + 0.05, dur: 0.12, type: 'triangle', f: 420, f2: 300, v: 0.22 }); // skull clonk
    N(c, { t: t + 0.05, dur: 0.05, buf: 'brown', lp: 600, v: 0.25 });
  },

  reassemble(c) {
    N(c, { dur: 0.78, a: 0.72, bp: 500, bp2: 3200, q: 1.3, v: 0.16 }); // reversed swell
    let t = 0.02, iv = 0.11;
    for (let i = 0; i < 13; i++) {
      xylo(c, t, mtof(pent(i + randi(0, 1), 64)) * c.p, 0.08 + i * 0.011);
      t += iv;
      iv *= 0.86;
    }
    T(c, { t: 0.8, dur: 0.14, f: 360, f2: 1150, g: 0.05, v: 0.42 });
    N(c, { t: 0.8, dur: 0.025, hp: 2200, v: 0.22 });
    [0, 4, 7, 12].forEach((s, i) => T(c, { t: 0.84 + i * 0.05, dur: 0.35, f: mtof(91 + s), v: 0.05 }));
    setWet(c, 0.25);
  },

  ui_click(c) {
    T(c, { dur: 0.05, type: 'triangle', f: 1300, f2: 800, g: 0.02, v: 0.2 });
    N(c, { dur: 0.012, bp: 3500, q: 1.2, v: 0.12 });
    setWet(c, 0.04);
  },

  ui_hover(c) {
    T(c, { dur: 0.045, f: rand(1150, 1250), v: 0.07, a: 0.003 });
    setWet(c, 0.04);
  },

  ui_open(c) {
    T(c, { dur: 0.12, type: 'triangle', f: 660, v: 0.18 });
    T(c, { t: 0.07, dur: 0.22, type: 'triangle', f: 990, v: 0.18 });
    N(c, { dur: 0.2, bp: 800, bp2: 2600, q: 1, v: 0.04, a: 0.08 });
    setWet(c, 0.08);
  },

  ui_close(c) {
    T(c, { dur: 0.1, type: 'triangle', f: 990, v: 0.16 });
    T(c, { t: 0.06, dur: 0.2, type: 'triangle', f: 660, v: 0.16 });
    N(c, { dur: 0.16, bp: 2400, bp2: 700, q: 1, v: 0.035, a: 0.05 });
    setWet(c, 0.08);
  },

  ui_error(c) {
    T(c, { dur: 0.13, type: 'square', f: 311, v: 0.09, lp: 1400, h: 0.06 });
    T(c, { t: 0.15, dur: 0.2, type: 'square', f: 233, v: 0.09, lp: 1200, h: 0.08 });
    setWet(c, 0.05);
  },

  gear_up(c) { gear(c, 1.22); },
  gear_down(c) { gear(c, 0.82); },

  splash(c) {
    N(c, { dur: 0.5, bp: 1600, bp2: 500, q: 0.8, v: 0.45, a: 0.006 });
    N(c, { dur: 0.25, buf: 'brown', lp: 500, v: 0.3 });
    for (let i = 0; i < 9; i++) {
      const f = rand(300, 900);
      T(c, { t: rand(0.03, 0.45), dur: rand(0.02, 0.05), f, f2: f * rand(1.5, 2.4), v: rand(0.03, 0.07) });
    }
    for (let i = 0; i < 4; i++) {
      const f = rand(1400, 2800);
      T(c, { t: rand(0.35, 0.75), dur: 0.06, f, f2: f * 0.7, v: rand(0.02, 0.05) });
    }
  },

  pop(c) {
    T(c, { dur: 0.1, f: 320, f2: 1300, g: 0.03, v: 0.42 });
    N(c, { dur: 0.018, hp: 1800, v: 0.22 });
  },

  boost(c) {
    N(c, { dur: 1.2, a: 0.08, h: 0.35, bp: 380, bp2: 2600, q: 1.1, v: 0.32, sw: 0.9 });
    N(c, { dur: 1.1, buf: 'brown', a: 0.05, h: 0.4, lp: 220, v: 0.4 });
    N(c, { dur: 1.2, buf: 'fizz', a: 0.04, h: 0.5, hp: 2800, v: 0.35 });
    T(c, { dur: 0.7, type: 'triangle', f: 180, f2: 620, v: 0.07, lp: 1500, vib: 14, vd: 40 });
    for (let i = 0; i < 14; i++) {
      const f = rand(1800, 4200);
      T(c, { t: rand(0.05, 1.0), dur: 0.03, f, f2: f * 1.5, v: rand(0.02, 0.05) });
    }
  },

  fizz(c) {
    N(c, { dur: 0.02, bp: 2200, q: 2, v: 0.35 });
    T(c, { dur: 0.03, type: 'triangle', f: 900, f2: 500, v: 0.12 });
    N(c, { t: 0.015, dur: 0.6, a: 0.012, h: 0.08, hp: 2600, hp2: 4500, v: 0.32 });
    N(c, { t: 0.04, dur: 0.75, buf: 'fizz', a: 0.03, h: 0.2, hp: 3000, v: 0.3 });
  },

  cup(c) {
    const f = rand(2350, 2550);
    for (const [r, a, d] of [[1, 0.2, 0.45], [2.32, 0.12, 0.3], [4.25, 0.07, 0.18], [6.63, 0.04, 0.1]]) {
      T(c, { dur: d, f: f * r, v: a, a: 0.001 });
    }
    N(c, { dur: 0.01, hp: 3000, v: 0.15 });
    setWet(c, 0.16);
  },

  pour(c) {
    N(c, { dur: 0.85, a: 0.06, h: 0.6, bp: 380, bp2: 1150, q: 7, v: 0.6, sw: 0.8 });
    N(c, { dur: 0.85, buf: 'pink', a: 0.05, h: 0.6, lp: 900, v: 0.12 });
    for (let i = 0; i < 16; i++) {
      const tt = rand(0.05, 0.8), f = (380 + tt * 900) * rand(0.9, 1.4);
      T(c, { t: tt, dur: 0.04, f, f2: f * 1.6, v: rand(0.03, 0.07) });
    }
  },

  door(c) {
    knock(c, 0);
    knock(c, 0.17);
    creak(c, 0.42, 0.7, 0.14, 62);
    N(c, { t: 1.1, dur: 0.12, buf: 'brown', lp: 400, v: 0.25 });
    setWet(c, 0.18);
  },

  gun_cock(c) {
    N(c, { dur: 0.05, bp: 2600, q: 1.5, v: 0.4 });
    T(c, { dur: 0.06, f: 1900, v: 0.08, a: 0.001 });
    N(c, { t: 0.02, dur: 0.07, buf: 'crackle', bp: 3200, q: 1, v: 0.2 });
    N(c, { t: 0.17, dur: 0.08, bp: 1200, q: 1.3, v: 0.45 });
    T(c, { t: 0.17, dur: 0.12, type: 'triangle', f: 260, f2: 140, v: 0.35 });
    T(c, { t: 0.17, dur: 0.1, f: 1250, v: 0.07, a: 0.001 });
    T(c, { t: 0.17, dur: 0.08, f: 2870, v: 0.04, a: 0.001 });
  },

  glider(c) {
    for (let i = 0; i < 3; i++) N(c, { t: i * 0.06, dur: 0.05, bp: 1300 - i * 200, q: 1.2, v: 0.12 + i * 0.04, am: [22, 0.5] });
    N(c, { t: 0.18, dur: 0.45, a: 0.05, bp: 380, bp2: 900, q: 0.8, v: 0.45, sw: 0.1 });
    T(c, { t: 0.18, dur: 0.35, f: 95, f2: 55, v: 0.35, a: 0.03 });
    N(c, { t: 0.22, dur: 0.4, bp: 1600, q: 0.9, v: 0.06, a: 0.05, am: [17, 0.6] });
  },

  engine_start(c) {
    N(c, { dur: 0.05, bp: 900, q: 1.5, v: 0.35 }); // kick lever
    T(c, { dur: 0.25, type: 'triangle', f: 330, f2: 290, v: 0.08, vib: 30, vd: 60 }); // spring twang
    for (const [t, v] of [[0.32, 0.28], [0.55, 0.22], [0.66, 0.3], [0.86, 0.2], [0.94, 0.33], [1.02, 0.25]]) {
      putt(c, t, v, rand(0.9, 1.1));
    }
    let t = 1.12, i = 0; // catches, settles into a lumpy idle
    while (t < 2.25) {
      putt(c, t, (i % 2 ? 0.2 : 0.3) * (1 - (t - 1.12) * 0.25), 1);
      t += (i % 2 ? 0.075 : 0.055) + rand(-0.006, 0.006);
      i++;
    }
  },

  plate(c) {
    const f = rand(1400, 1700);
    let t = 0, iv = 0.13, v = 0.24;
    for (let i = 0; i < 9; i++) { // wobbling plate settles faster and faster
      for (const [r, a] of [[1, 1], [2.13, 0.6], [3.47, 0.35], [5.2, 0.2]]) {
        T(c, { t, dur: 0.18, f: f * r * rand(0.99, 1.01), v: v * a * 0.5, a: 0.001 });
      }
      N(c, { t, dur: 0.012, hp: 2500, v: v * 0.5 });
      t += iv;
      iv *= 0.78;
      v *= 0.8;
    }
    for (let i = 0; i < 3; i++) T(c, { t: rand(0.02, 0.2), dur: 0.12, f: rand(3000, 4200), v: 0.04, a: 0.001 });
    setWet(c, 0.15);
  },

  food_fall(c) {
    T(c, { dur: 0.62, f: 1500, f2: 280, g: 0.6, v: 0.2, vib: 6, vd: 25, a: 0.03, h: 0.4 }); // slide whistle
    N(c, { dur: 0.6, bp: 1500, bp2: 300, q: 4, v: 0.08, a: 0.05, h: 0.4 });
    N(c, { t: 0.62, dur: 0.28, buf: 'pink', lp: 1300, lp2: 300, v: 0.5, a: 0.003 }); // splat
    T(c, { t: 0.62, dur: 0.14, f: 260, f2: 70, v: 0.4 });
    N(c, { t: 0.63, dur: 0.12, buf: 'crackle', bp: 1600, q: 0.8, v: 0.25 });
    for (let i = 0; i < 4; i++) {
      const f = rand(500, 900);
      T(c, { t: 0.7 + rand(0, 0.25), dur: 0.05, f, f2: f * 1.8, v: 0.04 });
    }
  },

  footstep(c) {
    N(c, { dur: 0.08, buf: 'brown', lp: rand(320, 450), v: 0.4, a: 0.004 });
    N(c, { t: 0.01, dur: 0.05, buf: 'crackle', bp: rand(1800, 3000), q: 0.8, v: 0.1 });
    T(c, { dur: 0.06, f: rand(90, 120), f2: 60, v: 0.18 });
    setWet(c, 0.05);
  },

  wobble(c) {
    T(c, { dur: 0.75, type: 'triangle', f: 210, f2: 260, v: 0.3, vib: 9, vd: 260, vdd: 20, lp: 1800, a: 0.01, h: 0.15 });
    T(c, { dur: 0.6, f: 420, f2: 520, v: 0.07, vib: 9, vd: 260, vdd: 20 });
  },

  drift_boost(c) {
    N(c, { dur: 0.28, bp: 500, bp2: 3500, q: 1.6, v: 0.32, a: 0.01, sw: 0.18 });
    T(c, { dur: 0.22, type: 'sawtooth', f: 300, f2: 1400, g: 0.16, v: 0.07, lp: 2500 });
    T(c, { t: 0.14, dur: 0.25, f: 2637, v: 0.06 });
    T(c, { t: 0.18, dur: 0.25, f: 3520, v: 0.05 });
  },

  whoosh(c) {
    const u = rand(0.9, 1.1);
    N(c, { dur: 0.42, a: 0.15, bp: 450 * u, bp2: 1800 * u, q: 1.3, v: 0.36, sw: 0.2 });
    N(c, { dur: 0.42, buf: 'pink', a: 0.14, lp: 600, v: 0.15 });
  },

  sip(c) {
    N(c, { dur: 0.5, a: 0.04, h: 0.3, bp: 800, bp2: 2000, q: 4, v: 0.5, sw: 0.45, am: [23, 0.7] });
    N(c, { dur: 0.45, buf: 'fizz', a: 0.03, h: 0.25, bp: 2500, q: 1, v: 0.25 });
    T(c, { t: 0.58, dur: 0.08, f: 320, f2: 150, v: 0.28 }); // gulp
    N(c, { t: 0.58, dur: 0.06, buf: 'brown', lp: 500, v: 0.2 });
  },

  squish(c) {
    N(c, { dur: 0.12, buf: 'pink', lp: 900, v: 0.45, a: 0.003 });
    T(c, { dur: 0.1, f: 300, f2: 110, v: 0.35 });
    T(c, { t: 0.06, dur: 0.4, type: 'triangle', f: 170, f2: 330, g: 0.12, v: 0.25, vib: 14, vd: 120, vdd: 5, lp: 1500 });
  },

  paper(c) {
    for (let i = 0; i < 3; i++) {
      const t = i * 0.12 + rand(0, 0.04);
      N(c, { t, dur: 0.12, buf: 'crackle', bp: rand(3000, 5000), q: 0.8, v: 0.3, a: 0.02, rate: rand(0.8, 1.3) });
      N(c, { t, dur: 0.1, bp: rand(1800, 2600), q: 1.2, v: 0.12, a: 0.03 });
    }
  },

  dirt(c) {
    N(c, { dur: 0.15, bp: 1300, bp2: 700, q: 1.1, v: 0.35, a: 0.02 }); // shovel scrape
    N(c, { dur: 0.12, buf: 'crackle', bp: 1800, q: 0.9, v: 0.2 });
    for (let i = 0; i < 12; i++) { // clods crumbling
      N(c, { t: 0.12 + i * rand(0.025, 0.05), dur: rand(0.02, 0.05), buf: 'brown', lp: rand(500, 1000), v: rand(0.15, 0.35) * (1 - i / 14) });
    }
  },

  thunder(c) {
    N(c, { dur: 3.3, buf: 'brown', a: 0.25, h: 0.6, lp: 380, lp2: 120, v: 0.6, sw: 3, am: [rand(3, 5), 0.35] });
    N(c, { t: 0.05, dur: 1.2, buf: 'pink', a: 0.08, lp: 1400, lp2: 300, v: 0.25, sw: 1 });
    N(c, { t: 0.1, dur: 0.6, buf: 'crackle', lp: 1500, v: 0.25, a: 0.02 });
    for (let i = 0; i < 4; i++) {
      N(c, { t: rand(0.4, 2.0), dur: rand(0.5, 1.0), buf: 'brown', a: 0.15, lp: rand(200, 320), v: rand(0.2, 0.35) });
    }
    setWet(c, 0.35);
  },
};
