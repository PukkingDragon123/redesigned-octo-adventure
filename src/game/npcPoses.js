// Everyday-life and fright poses for the villagers of Maple Cove: cowering,
// peeking round corners and out of doors, praying, hiding behind their hands,
// fainting, whistling, fleeing with their arms up, jogging, reading the paper,
// fishing, carrying groceries, umbrellas, a mum hauling her kids away... plus
// one-shot reactions (double-takes, screams, throwing a boot) and their props.
// Registered through extendVChar; also adds Josée, Pip & Pop's mum.
import { extendVChar, POSE_KIT, REACT, CHARACTERS } from './vchar.js';
import * as LORE from '../voxel/models/lore.js';
import * as FOOD from '../voxel/models/food.js';
import { Vox, tone } from '../voxel/vox.js';
import './lorePoses.js'; // chop (with the axe), kneel, brolly... are used by the routines

const { arm, leg, idleArms, POSES } = POSE_KIT;
const S = Math.sin;
const ease = (k) => k * k * (3 - 2 * k);
const c01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const tremble = (t, T, k = 1) => { T.tilt += S(t * 47) * 0.02 * k; T.twist += S(t * 41) * 0.018 * k; };

// ---------------------------------------------------------------- props
// a folded broadsheet, front page facing out
function newspaper() {
  const v = new Vox(13, 10, 2);
  v.fill(0, 0, 0, 12, 9, 1, 0xe8e2d2);
  for (let y = 1; y < 8; y += 2) v.fill(1, y, 0, 11, y, 0, 0xb8b2a4); // columns of print on the reader's side
  v.fill(1, 7, 1, 11, 8, 1, 0x2a2630); // headline
  v.fill(1, 2, 1, 5, 5, 1, 0x8a8478); // photo
  for (let y = 2; y < 6; y += 1.5) v.fill(7, Math.round(y), 1, 11, Math.round(y), 1, 0xa8a294);
  v.fill(6, 0, 0, 6, 9, 1, 0xd8d2c2); // the fold
  return { vox: v, size: 0.04, origin: [3.5, 3.5, -2] };
}
// a paper grocery bag with a baguette and some greens
function groceryBag() {
  const v = new Vox(8, 13, 6);
  v.fill(0, 0, 0, 7, 7, 5, (x, y, z) => (y === 7 ? 0xb88a54 : (x + y) % 5 === 0 ? 0xc89a62 : 0xd4a670));
  v.fill(1, 8, 2, 2, 12, 3, (x, y) => (y > 10 ? 0xe8c890 : 0xd8a860)); // baguette
  v.fill(4, 8, 1, 6, 10, 3, (x, y, z) => ((x + z) % 2 ? 0x4a8a3a : 0x5aa04a)); // greens
  v.set(5, 11, 2, 0x6ab85a);
  v.fill(3, 8, 3, 3, 9, 4, 0xe8402a); // apple
  return { vox: v, size: 0.045, origin: [2, 6, 3] };
}
// a fishing rod held out over the water, line dangling
function fishingRod() {
  const v = new Vox(3, 40, 42);
  for (let i = 0; i <= 40; i++) v.set(1, Math.round(i * 0.55) + 1, i, i < 6 ? 0x6a4224 : i < 9 ? 0x2a2a30 : 0x9a7a4a);
  v.fill(0, 2, 3, 2, 4, 5, 0x8a8a92); // reel
  for (let y = 0; y < 22; y++) v.set(1, 22 - y, 41, 0xf6f2ea); // line
  v.set(1, 0, 41, 0xe8402a); // bobber
  return { vox: v, size: 0.04, origin: [1.5, 2, 0.5] };
}
// a ball of yarn with needles
function knitting() {
  const v = new Vox(9, 6, 5);
  v.ellipsoid(4, 2.5, 2, 2.4, 2.3, 2.2, (x, y, z) => ((x + y + z) % 2 ? 0x7a5aa8 : 0x9a7ac8));
  v.line(0, 5, 2, 8, 2, 2, 0xd8c8a0);
  return { vox: v, size: 0.045, origin: [4.5, 2.5, 2.5] };
}
// a big muddy boot (Gus and Birdie throw these)
export function bootVox(color = 0x3a2a1e) {
  const v = new Vox(5, 8, 9);
  v.fill(0, 0, 0, 4, 7, 4, (x, y) => (y === 7 ? tone(color, 0.15) : color));
  v.fill(0, 0, 4, 4, 2, 8, color);
  v.fill(0, 0, 0, 4, 0, 8, 0x1e1418); // sole
  v.fill(1, 3, 4, 3, 3, 4, tone(color, -0.2));
  return { vox: v, size: 0.045, origin: [2.5, 4, 4.5] };
}

// umbrellas in each villager's colour
export const UMBRELLA_COLORS = { marie: 0xc8261e, agnes: 0x8a5ac8, ingrid: 0x3a6ab8, josee: 0x2f8a5a, mo: 0xf2c430, pop: 0xe86a1e, pip: 0x2a5aa8, ollie: 0x24222c };

// ---------------------------------------------------------------- poses
extendVChar({
  poses: {
    // crouched in a ball, arms over the head, shaking
    cower(c, t, T) {
      leg(T, 'L', 1.25, 0.22, 2.0); leg(T, 'R', 1.25, 0.22, 2.0);
      T.bodyY -= c.P.hipH * 0.47;
      T.lean += 0.55;
      arm(T, 'L', 2.45, 0.35, 2.0, 0.7); arm(T, 'R', 2.45, 0.35, 2.0, 0.7);
      T.headX += 0.4; T.shUp = 0.02;
      tremble(t, T, 1.2);
    },
    // crouched behind something low, hands on top of it, eyes just over the edge
    peekLow(c, t, T) {
      leg(T, 'L', 1.15, 0.2, 1.8); leg(T, 'R', 1.15, 0.2, 1.8);
      T.bodyY -= c.P.hipH * 0.42;
      T.lean += 0.3;
      arm(T, 'L', 1.55, 0.2, 1.0, 0.3); arm(T, 'R', 1.55, 0.2, 1.0, 0.3);
      T.headX -= 0.3;
      tremble(t, T, 0.6);
    },
    // flat against a wall, palms on the bricks
    wallHide(c, t, T) {
      arm(T, 'L', -0.2, 0.5, 0.25); arm(T, 'R', -0.2, 0.5, 0.25);
      T.lean -= 0.1; T.headX -= 0.08; T.shUp = 0.02;
      leg(T, 'L', 0, 0.08, 0.05); leg(T, 'R', 0, 0.08, 0.05);
      tremble(t, T, 0.8);
    },
    // leaning sideways round a corner / a tree to sneak a look (c.peekSide: +1 = own left)
    peek(c, t, T) {
      const s = c.peekSide || 1, k = ease(c01(t * 2.5));
      const near = s > 0 ? 'L' : 'R', far = s > 0 ? 'R' : 'L';
      T.tilt -= 0.42 * s * k; T.headZ += 0.22 * s * k;
      T.bodyY -= 0.03 * k;
      arm(T, near, 1.1, 0.45 * k + 0.1, 1.2, 0.2);
      arm(T, far, 0.9, 0.05, 1.9, 0.8);
      leg(T, near, 0.05, 0.28 * k, 0.15); leg(T, far, 0.1, 0.02, 0.25);
      tremble(t, T, 0.5);
    },
    // a nervous look out of a door left ajar, one hand on the frame
    peekDoor(c, t, T) {
      const s = c.peekSide || 1, k = ease(c01(t * 3));
      const near = s > 0 ? 'L' : 'R', far = s > 0 ? 'R' : 'L';
      T.tilt -= 0.3 * s * k; T.lean += 0.12 * k;
      arm(T, near, 1.25, 0.5, 0.85, 0.2);
      arm(T, far, 1.0, 0.05, 2.0, 0.9);
      leg(T, near, 0.25, 0.1, 0.35); leg(T, far, -0.05, 0.05, 0.1);
      tremble(t, T, 0.4);
    },
    // on their knees, hands together
    pray(c, t, T) {
      leg(T, 'L', 1.5, 0.08, 1.6); leg(T, 'R', -0.15, 0.08, 1.9);
      T.bodyY -= c.P.hipH * 0.42;
      arm(T, 'L', 1.4, -0.12, 2.1, 0.95); arm(T, 'R', 1.4, -0.12, 2.1, 0.95);
      T.lean += 0.12 + S(t * 3.2) * 0.07; T.headX += 0.28;
      tremble(t, T, 0.5);
    },
    // hiding behind their hands, peeking through the fingers now and then
    eyes(c, t, T) {
      const peek = S(t * 1.3) > 0.82 ? 1 : 0;
      arm(T, 'L', 1.8, 0.28, 2.4, 0.5); arm(T, 'R', 1.8 - peek * 0.45, 0.28, 2.4 - peek * 0.4, 0.5);
      T.headX += 0.3 - peek * 0.25; T.lean += 0.1; T.shUp = 0.025;
      leg(T, 'L', 0.15, 0.05, 0.3); leg(T, 'R', 0.15, 0.05, 0.3);
      tremble(t, T, 1);
    },
    // Constable Doug: whistle in one hand, the other pointing
    whistle(c, t, T) {
      const blow = Math.abs(S(t * 9)) > 0.5 ? 1 : 0;
      arm(T, 'L', 1.6, 0.18, 2.45, 0.75);
      arm(T, 'R', 1.5, 0.12, 0.05);
      T.lean -= 0.04; T.sq = 1 + blow * 0.02; T.bodyY += blow * 0.01;
      leg(T, 'L', 0.2, 0.1, 0.25); leg(T, 'R', -0.15, 0.1, 0.1);
    },
    // falls back in a dead faint and stays down (play another pose to get up)
    swoon(c, t, T) {
      const k = t < 0.55 ? 0 : ease(c01((t - 0.55) / 0.45));
      if (t < 0.55) { T.tilt += S(t * 22) * 0.07; arm(T, 'R', 1.8, 0.3, 2.4, 0.5); arm(T, 'L', 0.3, 0.6, 0.3); T.headX -= 0.2; }
      else { arm(T, 'L', 0.2, 0.9 * k + 0.2, 0.3); arm(T, 'R', 0.3, 1.1 * k + 0.2, 0.4); }
      T.bodyRx -= 1.5 * k; T.bodyY -= (c.P.hipH - 0.12) * k;
      leg(T, 'L', 0.1, 0.22 * k, 0.1); leg(T, 'R', 0.25 * k, 0.2 * k, 0.4 * k);
      T.headY += 0.4 * k;
    },
    // running away with both arms up
    flee(c, t, T) {
      const w = S(t * 15);
      arm(T, 'L', 2.3 + w * 0.35, 0.55, 0.5 + w * 0.3); arm(T, 'R', 2.3 - w * 0.35, 0.55, 0.5 - w * 0.3);
      T.headX -= 0.08; T.lean += 0.12;
    },
    // creeping in, low and slow, one hand reaching out
    sneak(c, t, T) {
      T.bodyY -= 0.07; T.lean += 0.32;
      arm(T, 'R', 1.25, 0.12, 0.35); arm(T, 'L', 1.0, 0.05, 2.0, 0.9);
      T.headX -= 0.15;
      tremble(t, T, 0.6);
    },
    jog(c, t, T) {
      const s = S(c.phase || 0);
      arm(T, 'L', 0.25 - s * 0.6, 0.14, 1.65); arm(T, 'R', 0.25 + s * 0.6, 0.14, 1.65);
      T.lean += 0.1;
    },
    carryBag(c, t, T) {
      arm(T, 'L', 0.75, 0.32, 1.6, 1.0); arm(T, 'R', 0.75, 0.32, 1.6, 1.0);
      T.lean -= 0.05;
    },
    paper(c, t, T) {
      const turn = (t % 7) > 6.2 ? 1 : 0;
      arm(T, 'L', 1.05, 0.15, 1.05, 0.55); arm(T, 'R', 1.05 + turn * 0.3, 0.15 + turn * 0.4, 1.05, 0.55);
      T.headX += 0.22 + S(t * 0.4) * 0.05; T.headY += S(t * 0.9) * 0.1;
    },
    sitPaper(c, t, T) { POSES.sit(c, t, T); POSES.paper(c, t, T); },
    sitSip(c, t, T) { POSES.sit(c, t, T); POSES.sip(c, t, T); },
    sitKnit(c, t, T) { POSES.sit(c, t, T); POSES.knit(c, t, T); },
    fish(c, t, T) {
      const tug = S(t * 0.7) > 0.93 ? 1 : 0;
      arm(T, 'R', 0.9 + tug * 0.35, 0.1, 0.7, 0.2); arm(T, 'L', 0.75, 0.05, 1.1, 0.7);
      T.lean += 0.05 - tug * 0.12; T.headX += 0.1;
      leg(T, 'L', 0.15, 0.1, 0.2); leg(T, 'R', -0.1, 0.1, 0.1);
    },
    // on the knees, patting the soil of the flower bed
    garden(c, t, T) {
      leg(T, 'L', 1.5, 0.12, 1.6); leg(T, 'R', 1.5, 0.12, 1.6);
      T.bodyY -= c.P.hipH * 0.45;
      const k = S(t * 4);
      arm(T, 'L', 1.1 + k * 0.2, 0.15, 0.3); arm(T, 'R', 1.1 - k * 0.2, 0.15, 0.3);
      T.lean += 0.55; T.headX += 0.3;
    },
    // a hand shading the eyes, scanning the horizon
    lookout(c, t, T) {
      idleArms(c, t, T, 'hips');
      arm(T, 'R', 1.45, 0.55, 2.45, 0.35);
      T.headY += S(t * 0.45) * 0.45; T.headX -= 0.06;
    },
    clap(c, t, T) {
      const k = Math.abs(S(t * 8));
      arm(T, 'L', 1.2, 0.08 + k * 0.38, 1.15, 0.85); arm(T, 'R', 1.2, 0.08 + k * 0.38, 1.15, 0.85);
      T.bodyY += k * 0.01; T.headX -= 0.06;
    },
    // a kid jumping up and down with excitement
    excited(c, t, T) {
      const h = Math.abs(S(t * 9));
      arm(T, 'L', 0.3 + h * 0.3, 2.3 + S(t * 9) * 0.3, 0.4); arm(T, 'R', 0.3 + h * 0.3, 2.3 - S(t * 9) * 0.3, 0.4);
      T.bodyY += h * 0.12; T.sq = 1 + (h - 0.5) * 0.1;
      leg(T, 'L', 0.2 * h, 0.12, 0.45 * h); leg(T, 'R', 0.2 * h, 0.12, 0.45 * h);
      T.headX -= 0.12;
    },
    shoo(c, t, T) {
      const k = S(t * 10);
      arm(T, 'L', 1.25 + k * 0.35, 0.3, 0.55 + k * 0.35, 0.3); arm(T, 'R', 1.25 - k * 0.35, 0.3, 0.55 - k * 0.35, 0.3);
      T.lean += 0.12;
    },
    // a mum hurrying off, one hand hauling a kid along
    pull(c, t, T) {
      arm(T, 'R', -0.55, 0.35, 0.1); arm(T, 'L', 0.35 + S(t * 9) * 0.3, 0.15, 0.4);
      T.lean += 0.22; T.twist -= 0.12; T.headY -= 0.35;
    },
    // ...and the kid being hauled, waving back over the shoulder
    dragged(c, t, T) {
      arm(T, 'L', 1.95, 0.35, 0.15); arm(T, 'R', 0.3, 2.45, 0.3, S(t * 12) * 0.5);
      T.lean -= 0.12; T.twist += 0.2; T.headY += 0.5;
    },
    umbrella(c, t, T) {
      idleArms(c, t, T, c.persona.idle === 'hips' ? 'loose' : c.persona.idle);
      arm(T, 'R', 0.85, 0.12, 1.55, 0.35);
      T.headX += 0.06;
    },
  },
  held: {
    paper: { fn: newspaper, scale: 1, upright: true },
    sitPaper: { fn: newspaper, scale: 1, upright: true },
    carryBag: { fn: groceryBag, scale: 1, upright: true },
    fish: { fn: fishingRod, scale: 1, upright: true },
    sitSip: { fn: FOOD.cocoaClassic, scale: 1, upright: true },
    sitKnit: { fn: knitting, scale: 1, upright: true },
    umbrella: { fn: () => LORE.umbrella({ color: 0x24222c }), scale: 0.85, upright: true },
  },
  persona: {
    josee: { idle: 'cross', walk: 'normal', bounce: 1.0, gest: 1.3, fidgets: ['look', 'watch', 'hair', 'tap'] },
  },
  loco: ['flee', 'sneak', 'jog', 'carryBag', 'paper', 'pull', 'dragged', 'umbrella', 'eyes', 'shoo'],
});

// ---------------------------------------------------------------- one-shot reactions
Object.assign(REACT, {
  // looks... looks away... LOOKS BACK
  doubletake: {
    d: 1.25,
    start(c) { c._dt2 = false; },
    f(c, t, T) {
      const away = t < 0.32 ? 0 : t < 0.6 ? ease((t - 0.32) / 0.28) : t < 0.7 ? 1 - (t - 0.6) / 0.1 : 0;
      T.headY += away * 1.0 * (c.seed > 5 ? 1 : -1);
      if (t >= 0.6 && !c._dt2) {
        c._dt2 = true;
        c.kick('headS', 0.75); c.kick('headUp', 0.18); c.kick('sq', 1.45);
        c.hopV = 3.4;
        c.tempExpr('shock', 1.4);
        c.sfx('pop', { volume: 0.5, pitch: 1.6 });
      }
      if (t > 0.6) { arm(T, 'L', 0.5, 1.5, 0.4); arm(T, 'R', 0.5, 1.5, 0.4); T.jaw = 0.5; T.lean -= 0.14; }
    },
  },
  scream: {
    d: 1.3, expr: 'shock',
    start(c) { c.hopV = 3.4; c.kick('sq', 1.4); c.kick('headS', 0.3); },
    f(c, t, T) {
      const w = S(t * 30);
      arm(T, 'L', 0.3 + w * 0.15, 2.5, 0.3); arm(T, 'R', 0.3 - w * 0.15, 2.5, 0.3);
      T.jaw = 0.6; T.headX -= 0.25; T.tilt += S(t * 45) * 0.05;
    },
  },
  // wind up and fling something (c.onThrow fires at the release)
  throw: {
    d: 1.0,
    start(c) { c._thrown = false; },
    f(c, t, T) {
      if (t < 0.36) {
        const k = ease(t / 0.36);
        arm(T, 'R', -0.9 * k, 0.35, 1.6 * k); T.lean -= 0.15 * k; T.twist += 0.35 * k;
        leg(T, 'R', -0.25 * k, 0.1, 0.2); leg(T, 'L', 0.25 * k, 0.1, 0.3);
      } else {
        const k = ease(c01((t - 0.36) / 0.16));
        arm(T, 'R', -0.9 + 3.2 * k, 0.35 - 0.2 * k, 1.6 - 1.4 * k); T.lean += -0.15 + 0.4 * k; T.twist += 0.35 - 0.75 * k;
        if (t > 0.44 && !c._thrown) { c._thrown = true; c.onThrow?.(); }
      }
      arm(T, 'L', 0.6, 0.45, 0.5);
    },
  },
  // a friendly wave layered over whatever they are doing
  hi: {
    // a big, whole-arm wave on tiptoes, with a happy bounce
    d: 1.7, expr: 'excited',
    start(c) { c.hopV = 1.6; c.kick('sq', 1.25); },
    f(c, t, T) {
      const k = Math.sin(c01(t / 1.7) * Math.PI) > 0.15 ? 1 : 0;
      if (k) arm(T, 'R', 0.15, 2.75, 0.25, S(t * 13) * 0.85);
      arm(T, 'L', 0.2, 0.5 + Math.max(0, S(t * 6.5)) * 0.4, 0.4);
      T.headZ += 0.16 + S(t * 6.5) * 0.08; T.tilt += S(t * 6.5) * 0.04; T.lean -= 0.08;
      T.bodyY += Math.abs(S(t * 6.5)) * 0.04;
    },
  },
  clap: { d: 1.4, expr: 'excited', start(c) { c.hopV = 2; c.kick('sq', 1.2); }, f(c, t, T) { POSES.clap(c, t, T); T.bodyY += Math.abs(S(t * 8)) * 0.04; } },
  // bend down and pick something up
  pickup: {
    d: 1.1,
    f(c, t, T) {
      const k = Math.sin(c01(t / 1.1) * Math.PI);
      T.lean += k * 0.85; T.bodyY -= k * 0.08;
      arm(T, 'R', 0.6 + k * 0.6, 0.1, 0.1); arm(T, 'L', 0.3, 0.3, 0.4);
      leg(T, 'L', 0.35 * k, 0.1, 0.55 * k); leg(T, 'R', 0.35 * k, 0.1, 0.55 * k);
    },
  },
  // a little "eep!": hop with the hands to the mouth
  eep: {
    d: 0.7, expr: 'scared',
    start(c) { c.hopV = 2.4; c.kick('sq', 1.2); },
    f(c, t, T) { arm(T, 'L', 1.6, 0.2, 2.25, 0.6); arm(T, 'R', 1.6, 0.2, 2.25, 0.6); T.lean -= 0.1; },
  },
});

// ---------------------------------------------------------------- Josée, Pip & Pop's mum
if (!CHARACTERS.josee) {
  CHARACTERS.josee = {
    name: 'Josée', skin: 0x9c6844, head: { w: 11, h: 11, d: 10 }, torso: { w: 10, h: 12, d: 7 },
    arm: { len: 12, t: 3 }, leg: { len: 15, t: 3 },
    hair: { style: 'braid', color: 0x2a1a14 }, hat: { type: 'toque', color: 0x2f6e4a, band: 0xf2c443, pom: 0xf2c443 },
    top: { type: 'coat', color: 0xc8501e, accent: 0xf2e6cc }, legs: { color: 0x2a3a52 }, shoes: 0x5a3420, boots: true,
    eyes: 'lash', blush: true, voice: 'marie',
  };
}

export { LORE };
