// One-shot SFX, part 4: Hank's prologue. Axe bites, a creaking, crashing tree,
// shovels of dirt, a coffin settling, the cemetery bell and a mighty snore.
// Every entry is fn(c) with c = { k, ctx, out, wet, t, p, end } (see synth.js).
import { T, N, rand } from './synth.js';
import { setWet, creak } from './sfx.js';

const upto = (c, end) => { if (end > c.end) c.end = end; };

export const SFX4 = {
  axe_chop(c) {
    // the blade bites (a woody thock) and chips fly
    const f = rand(150, 180);
    T(c, { dur: 0.16, f, f2: f * 0.55, g: 0.09, v: 0.6 });
    T(c, { dur: 0.05, type: 'triangle', f: 620, f2: 380, v: 0.18 });
    N(c, { dur: 0.09, bp: 900, q: 1.6, v: 0.55, a: 0.001 });
    N(c, { t: 0.02, dur: 0.18, buf: 'brown', lp: 500, v: 0.35 });
    for (let i = 0; i < 3; i++) N(c, { t: 0.04 + i * 0.03, dur: 0.02, bp: rand(2500, 4200), q: 3, v: 0.12 });
    setWet(c, 0.18);
    upto(c, 0.45);
  },
  tree_creak(c) {
    creak(c, 0, 1.4, 0.55, 70);
    creak(c, 0.5, 1.1, 0.4, 95);
    N(c, { dur: 1.6, buf: 'brown', lp: 260, v: 0.18, a: 0.4 });
    setWet(c, 0.25);
    upto(c, 2.0);
  },
  tree_fall(c) {
    // a rushing whoosh through the leaves, then the trunk slams down
    N(c, { dur: 0.9, bp: 1600, q: 0.6, v: 0.25, a: 0.5 });
    T(c, { t: 0.85, dur: 0.6, f: 70, f2: 32, g: 0.4, v: 0.9 });
    N(c, { t: 0.85, dur: 0.7, buf: 'brown', lp: 420, v: 0.85, a: 0.002 });
    N(c, { t: 0.86, dur: 0.25, bp: 1200, q: 0.9, v: 0.35 });
    for (let i = 0; i < 8; i++) N(c, { t: 0.95 + i * 0.07, dur: 0.05, bp: rand(1800, 5000), q: 2, v: 0.08 }); // twigs
    T(c, { t: 1.2, dur: 0.3, f: 55, f2: 40, v: 0.35 }); // bounce
    setWet(c, 0.3);
    upto(c, 2.2);
  },
  shovel_dirt(c) {
    N(c, { dur: 0.12, bp: 2200, q: 1.2, v: 0.25, a: 0.001 }); // blade into soil
    N(c, { t: 0.18, dur: 0.35, buf: 'brown', lp: 900, v: 0.55, a: 0.01 }); // dirt pouring
    for (let i = 0; i < 6; i++) N(c, { t: 0.2 + i * 0.04, dur: 0.03, bp: rand(1200, 2600), q: 2, v: 0.1 });
    setWet(c, 0.1);
    upto(c, 0.7);
  },
  coffin_thud(c) {
    T(c, { dur: 0.4, f: 95, f2: 50, g: 0.3, v: 0.7 });
    N(c, { dur: 0.3, buf: 'brown', lp: 600, v: 0.55 });
    T(c, { dur: 0.25, type: 'triangle', f: 210, f2: 160, v: 0.12 }); // hollow box ring
    setWet(c, 0.25);
    upto(c, 0.7);
  },
  funeral_bell(c) {
    // a slow, deep church bell (inharmonic partials, long decay)
    const f = 196;
    for (const [r, a, d] of [[0.5, 0.5, 4.5], [1, 0.8, 3.5], [1.19, 0.4, 2.8], [1.5, 0.35, 2.2], [2.0, 0.3, 1.8], [2.74, 0.18, 1.2], [3.96, 0.08, 0.8]]) {
      T(c, { dur: d, f: f * r, v: 0.3 * a, a: 0.004 });
    }
    N(c, { dur: 0.04, bp: 1500, q: 2, v: 0.1 });
    setWet(c, 0.55);
    upto(c, 4.8);
  },
  big_snore(c) {
    // a cartoon log-saw snore: rattling inhale, whistling exhale
    T(c, { dur: 0.9, type: 'sawtooth', f: 62, f2: 78, g: 0.9, v: 0.16, lp: 420, vib: 26, vd: 40, a: 0.15 });
    N(c, { dur: 0.9, buf: 'brown', lp: 300, v: 0.3, a: 0.2 });
    T(c, { t: 1.05, dur: 0.7, f: 1300, f2: 900, v: 0.06, a: 0.08 });
    setWet(c, 0.12);
    upto(c, 1.9);
  },
  dramatic_sting(c) {
    // dun dun DUNNN
    for (const [t, f] of [[0, 147], [0.32, 139], [0.64, 110]]) {
      T(c, { t, dur: t > 0.6 ? 1.4 : 0.3, type: 'sawtooth', f, v: 0.12, lp: 900, a: 0.01, fixed: true });
      T(c, { t, dur: t > 0.6 ? 1.4 : 0.3, type: 'sawtooth', f: f * 1.5, det: 6, v: 0.07, lp: 900, a: 0.01, fixed: true });
    }
    setWet(c, 0.35);
    upto(c, 2.2);
  },
  // village life: a constable's pea whistle (two blasts) and a door slammed in fright
  whistle(c) {
    for (const [t, d] of [[0, 0.22], [0.3, 0.55]]) {
      T(c, { t, dur: d, f: 2750, f2: 2700, v: 0.16, a: 0.01, am: [34, 0.75, 'square'] });
      T(c, { t, dur: d, f: 2950, v: 0.05, a: 0.01, am: [34, 0.7, 'square'] });
      N(c, { t, dur: d, bp: 2800, q: 3, v: 0.12, a: 0.01 });
    }
    setWet(c, 0.15);
    upto(c, 1.0);
  },
  door_slam(c) {
    T(c, { dur: 0.32, f: 120, f2: 48, g: 0.09, v: 0.8 });
    N(c, { dur: 0.25, buf: 'brown', lp: 600, v: 0.8, a: 0.001 });
    N(c, { dur: 0.06, bp: 1400, q: 1.2, v: 0.3 });
    for (let i = 0; i < 4; i++) N(c, { t: 0.08 + i * 0.045, dur: 0.03, bp: rand(2200, 3600), q: 4, v: 0.08 }); // the latch and the window panes rattling
    setWet(c, 0.25);
    upto(c, 0.9);
  },
};
