// Extra poses and held props for the prologue: chopping, yelling TIMBER, flexing,
// yawning, mourning, crying, holding an umbrella, preaching, kneeling.
import { extendVChar, POSE_KIT } from './vchar.js';
import * as LORE from '../voxel/models/lore.js';

const { arm, leg, idleArms, wob } = POSE_KIT;
const S = Math.sin;

// one chop cycle (seconds); c.chopT is advanced by the pose so scenes can sync hits
export const CHOP_CYCLE = 1.15;
export const CHOP_HIT = 0.56; // the moment the blade bites

const ease = (k) => k * k * (3 - 2 * k);

extendVChar({
  poses: {
    chop(c, t, T) {
      const p = (t % CHOP_CYCLE) / CHOP_CYCLE;
      // windup over the right shoulder, a whipping swing, a little recoil
      let f, tw, ln;
      if (p < 0.42) { const k = ease(p / 0.42); f = 0.6 + k * 2.1; tw = 0.55 * k; ln = -0.12 * k; }
      else if (p < 0.5) { const k = (p - 0.42) / 0.08; f = 2.7 - k * 1.9; tw = 0.55 - k * 0.95; ln = -0.12 + k * 0.42; }
      else { const k = ease(Math.min(1, (p - 0.5) / 0.5)); f = 0.8 - Math.sin(k * Math.PI) * 0.12 - k * 0.2 + k * 0.0; tw = -0.4 + k * 0.4; ln = 0.3 - k * 0.3; }
      arm(T, 'R', f, 0.05, 0.35, 0.55);
      arm(T, 'L', f - 0.12, 0.0, 0.55, 0.7);
      T.twist += tw;
      T.lean += ln;
      leg(T, 'L', 0.3, 0.12, 0.35);
      leg(T, 'R', -0.25, 0.12, 0.15);
      T.bodyY -= 0.03;
      // a grunt face at the hit
      if (p > 0.44 && p < 0.6) T.jaw = 0.25;
    },
    timber(c, t, T) {
      // hands cupped round the mouth, leaning back to bellow
      arm(T, 'L', 1.35, -0.25, 2.2, 0.85);
      arm(T, 'R', 1.35, -0.25, 2.2, 0.85);
      T.lean -= 0.22 + S(t * 9) * 0.03;
      T.headX -= 0.25;
      T.jaw = 0.55;
      T.sq = 1.04;
    },
    flex(c, t, T) {
      const k = Math.min(1, t * 4);
      arm(T, 'L', 0.25, 1.45 * k, 1.9 * k, 0, 0.3);
      arm(T, 'R', 0.25, 1.45 * k, 1.9 * k, 0, 0.3);
      T.sq = 1 + 0.06 * k + S(t * 8) * 0.01;
      T.lean -= 0.08;
      T.bodyY += Math.abs(S(t * 4)) * 0.02;
    },
    yawn(c, t, T) {
      const k = Math.min(1, t * 1.5);
      arm(T, 'L', 0.3, 2.8 * k, 0.4); arm(T, 'R', 0.3, 2.8 * k, 0.4);
      T.lean -= 0.2 * k; T.headX -= 0.35 * k; T.jaw = 0.6 * k; T.sq = 1 + 0.07 * k;
    },
    snooze(c, t, T) {
      // flat on his back in the leaves, belly rising and falling with each snore
      T.bodyRx -= 1.52; T.bodyY = -c.P.hipH + 0.14;
      arm(T, 'L', 0.0, 0.5, 1.8, 1.2); arm(T, 'R', 0.0, 0.5, 1.8, 1.2); // hands behind the head
      leg(T, 'L', 0.05, 0.12, 0.1); leg(T, 'R', 0.25, 0.1, 0.6);
      T.sq = 1 + (S(t * 1.6) + 1) * 0.025;
      T.headY += 0.25; T.jaw = (S(t * 1.6) + 1) * 0.18;
    },
    mourn(c, t, T) {
      idleArms(c, t, T, 'clasp');
      T.headX += 0.42; T.lean += 0.08; T.tilt += wob(t, 0.5, c.seed) * 0.02;
    },
    cry(c, t, T) {
      // one arm wiping the eyes, shoulders heaving
      idleArms(c, t, T, 'loose');
      arm(T, 'R', 1.55 + S(t * 7) * 0.08, 0.15, 2.45, 0.9);
      arm(T, 'L', 0.35, 0.1, 1.2, 0.5);
      T.headX += 0.3; T.shUp = Math.max(0, S(t * 9)) * 0.02; T.bodyY += Math.abs(S(t * 9)) * 0.01;
    },
    brolly(c, t, T) {
      idleArms(c, t, T, 'clasp');
      arm(T, 'R', 0.85, 0.12, 1.55, 0.35);
      T.headX += 0.2;
    },
    preach(c, t, T) {
      arm(T, 'L', 0.95, 0.05, 1.6, 0.6); // the book
      arm(T, 'R', 0.7 + S(t * 1.7) * 0.25, 0.35 + S(t * 1.1) * 0.15, 0.9, 0.2); // gesturing
      T.headX += 0.12 + S(t * 0.9) * 0.05;
    },
    kneel(c, t, T) {
      leg(T, 'L', 1.5, 0.08, 1.6); leg(T, 'R', -0.15, 0.08, 1.9);
      T.bodyY -= c.P.hipH * 0.42;
      arm(T, 'L', 0.9, 0.05, 0.4); arm(T, 'R', 0.75, 0.05, 0.5);
      T.lean += 0.45; T.headX += 0.25;
    },
    lower(c, t, T) {
      // paying out a rope hand over hand
      const k = S(t * 3);
      arm(T, 'L', 0.9 + k * 0.25, 0.05, 0.6, 0.4); arm(T, 'R', 0.9 - k * 0.25, 0.05, 0.6, 0.4);
      T.lean += 0.25; leg(T, 'L', 0.25, 0.1, 0.35); leg(T, 'R', -0.1, 0.1, 0.2);
    },
  },
  held: {
    chop: { fn: LORE.axe, scale: 1 },
    timber: null,
    flex: null,
    brolly: { fn: () => LORE.umbrella(), scale: 1, upright: true },
    preach: { fn: LORE.hymnBook, scale: 1.1 },
  },
  persona: {
    hankAlive: { idle: 'hips', walk: 'lumber', bounce: 1.0, gest: 1.2, fidgets: ['look', 'stretch', 'scratch'] },
    pastor: { idle: 'clasp', walk: 'slow', bounce: 0.7, gest: 0.9, fidgets: ['look', 'glasses'] },
  },
});

export { LORE };
