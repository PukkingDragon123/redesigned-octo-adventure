// Voxel characters: a jointed rig of voxel parts with springy procedural
// animation, expressive pixel faces, cloth scarves/capes, held items, big
// cartoon reactions, bike-riding IK and (for Hank) falling apart into bones.
// The API mirrors the old sprite Actor so cutscenes can drive either.
import * as THREE from 'three';
import { CHARACTERS, VS, buildHead, buildJaw, buildTorso, buildLimb, buildSkirt, hipVoxels } from '../voxel/models/characters.js';
import { meshVox } from '../voxel/mesh.js';
import { Vox, tone } from '../voxel/vox.js';
import { createVoxelMaterial, createFlatMaterial } from '../render/voxelMaterial.js';
import { FaceTex } from '../voxel/faces.js';
import { Cloth, scarfTexture, capeTexture } from '../render/cloth.js';
import { clamp, angleDamp, wrapAngle } from '../core/math.js';
import * as PR from '../voxel/models/props.js';
import * as FOOD from '../voxel/models/food.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

// ---------------------------------------------------------------- held props per pose
function stick(len, col, blade) {
  const v = new Vox(3, len + 2, blade ? 8 : 3);
  v.fill(1, 2, 1, 1, len + 1, 1, col);
  if (blade === 'hockey') v.fill(0, 0, 1, 2, 1, 7, 0x2a2a30);
  if (blade === 'shovel') v.fill(0, 0, 0, 2, 3, 3, 0x9aa0a8), v.fill(0, len + 1, 1, 2, len + 1, 1, 0x3a2418);
  return { vox: v, size: 0.05, origin: [1.5, len + 1, 1.5] };
}
function popgun() {
  const v = new Vox(3, 4, 10);
  v.fill(0, 0, 0, 2, 3, 3, 0x3a3a46); v.fill(1, 2, 3, 1, 3, 9, 0x5a5a68); v.set(1, 3, 9, 0xf2c443); v.fill(1, 0, 1, 1, 1, 2, 0x8a5a32);
  return { vox: v, size: 0.05, origin: [1.5, 3, 1.5] };
}
function yarn() {
  const v = new Vox(5, 5, 5);
  v.ellipsoid(2, 2, 2, 2.2, 2.2, 2.2, (x, y, z) => ((x + y + z) % 2 ? 0xc84a6a : 0xe86a8a));
  v.line(2, 4, 2, 2, 4, 4, 0xd8c8a0);
  return { vox: v, size: 0.05, origin: [2.5, 2.5, 2.5] };
}
const HELD = {
  lantern: { fn: () => PR.lantern({ color: 'brass', lit: true }), scale: 0.55, upright: true, hang: true },
  sip: { fn: FOOD.cocoaClassic, scale: 1, upright: true },
  eat: { fn: FOOD.cocoaMaple, scale: 1, upright: true },
  offer: { fn: FOOD.cocoaTakeaway, scale: 1, upright: true },
  clipboard: { fn: () => PR.letter({}), scale: 1.2 },
  photo: { fn: () => PR.camera(), scale: 1, upright: true },
  water: { fn: () => PR.wateringCan({}), scale: 0.8, upright: true },
  hockey: { fn: () => stick(18, 0x8a5a32, 'hockey'), scale: 1 },
  dig: { fn: () => stick(16, 0x8a5a32, 'shovel'), scale: 1 },
  sweep: { fn: () => PR.broom({}), scale: 0.7 },
  aim: { fn: popgun, scale: 1 },
  gun: { fn: popgun, scale: 1 },
  knit: { fn: yarn, scale: 1, upright: true },
};
const HELD_CACHE = new Map();
function heldMesh(name) {
  const H = HELD[name];
  let geo = HELD_CACHE.get(name);
  if (!geo) {
    const r = H.fn();
    geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 });
    HELD_CACHE.set(name, geo);
  }
  const m = voxMesh(geo, sharedVoxelMaterial());
  m.scale.setScalar(H.scale);
  m.userData.held = name;
  m.userData.upright = H.upright;
  return m;
}

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();

// ---------------------------------------------------------------- personalities
const PERSONA = {
  hank: { idle: 'loose', walk: 'bouncy', bounce: 1.2, gest: 1.1, fidgets: ['look', 'stretch', 'jawpop', 'tap', 'scratch'] },
  hankBuried: { idle: 'loose', walk: 'shamble', bounce: 0.8, gest: 0.8, fidgets: ['look'] },
  grandma: { idle: 'clasp', walk: 'waddle', bounce: 1.3, gest: 1.0, fidgets: ['look', 'hum', 'glasses', 'tap'] },
  gus: { idle: 'hips', walk: 'lumber', bounce: 0.9, gest: 0.7, fidgets: ['look', 'scratch', 'stretch'] },
  marie: { idle: 'cross', walk: 'strut', bounce: 1.0, gest: 1.5, fidgets: ['look', 'hair', 'tap', 'watch'] },
  doug: { idle: 'behind', walk: 'march', bounce: 0.8, gest: 0.8, fidgets: ['look', 'salute', 'tap'] },
  birdie: { idle: 'hips', walk: 'waddle', bounce: 1.0, gest: 1.0, fidgets: ['look', 'pipe', 'scratch'] },
  ingrid: { idle: 'cross', walk: 'normal', bounce: 0.9, gest: 1.1, fidgets: ['look', 'glasses', 'watch'] },
  lou: { idle: 'hips', walk: 'lumber', bounce: 0.8, gest: 0.9, fidgets: ['look', 'stretch', 'scratch'] },
  agnes: { idle: 'clasp', walk: 'waddle', bounce: 1.2, gest: 1.3, fidgets: ['look', 'glasses', 'hum'] },
  pip: { idle: 'loose', walk: 'skip', bounce: 1.6, gest: 1.4, fidgets: ['look', 'hop', 'spin', 'tap'] },
  pop: { idle: 'loose', walk: 'skip', bounce: 1.6, gest: 1.4, fidgets: ['look', 'hop', 'spin', 'scratch'] },
  ollie: { idle: 'behind', walk: 'slow', bounce: 0.7, gest: 0.7, fidgets: ['look', 'scratch', 'stretch'] },
  mo: { idle: 'hips', walk: 'lumber', bounce: 1.0, gest: 1.1, fidgets: ['look', 'hum', 'scratch'] },
  reaper: { idle: 'float', walk: 'glide', bounce: 0.6, gest: 0.8, fidgets: ['look'] },
};

// ---------------------------------------------------------------- shared part geometry
const CACHE = new Map();
function partsFor(id) {
  let P = CACHE.get(id);
  if (P) return P;
  const spec = CHARACTERS[id];
  if (!spec) throw new Error(`unknown character ${id}`);
  const geo = (r, seed) => meshVox(r.vox, { size: VS, origin: r.origin, jitter: 0.035, seed });
  const skull = spec.kind === 'skeleton' || spec.kind === 'reaper';
  const head = buildHead(spec);
  const torso = buildTorso(spec);
  const limbs = {};
  for (const k of ['upperArm', 'forearm', 'thigh', 'shin']) limbs[k] = buildLimb(spec, k);
  P = {
    spec, skull, head, torso, limbs,
    geo: {
      head: geo(head, 1),
      torso: geo(torso, 2),
      upperArm: geo(limbs.upperArm, 3),
      forearm: geo(limbs.forearm, 4),
      thigh: geo(limbs.thigh, 5),
      shin: geo(limbs.shin, 6),
    },
  };
  if (skull) { P.jaw = buildJaw(spec); P.geo.jaw = geo(P.jaw, 7); }
  if (spec.skirt) { P.skirt = buildSkirt(spec); P.geo.skirt = geo(P.skirt, 8); }
  if (spec.scarf) { P.scarf = buildScarfRing(spec); P.geo.scarf = geo(P.scarf, 9); }
  // rig measurements (metres)
  P.thighL = limbs.thigh.len;
  P.shinL = limbs.shin.len;
  P.footH = 3 * VS;
  P.hipH = hipVoxels(spec) * VS;
  P.upperL = limbs.upperArm.len;
  P.foreL = limbs.forearm.len;
  P.torsoH = spec.torso.h * VS;
  P.neckY = spec.kind === 'skeleton' ? (spec.torso.h + 2) * VS : spec.kind === 'reaper' ? (spec.torso.h + 0.5) * VS : (spec.torso.h + 1) * VS;
  const w = spec.torso.w, t = spec.arm.t;
  P.shoulderX = (spec.kind === 'skeleton' ? w / 2 + 1 : w / 2 + t / 2) * VS;
  P.shoulderY = (spec.torso.h - (spec.kind === 'skeleton' ? 1 : 0.5)) * VS;
  P.hipX = (spec.kind === 'skeleton' ? 2.5 : Math.max(spec.leg.t / 2 + 0.5, w / 4)) * VS;
  P.headH = (spec.head.h + (spec.hat ? 4 : spec.hair ? 1.5 : 0)) * VS;
  P.height = P.hipH + P.neckY + P.headH;
  P.bodyR = (Math.max(w, spec.torso.d + (spec.torso.belly || 0)) / 2) * VS;
  CACHE.set(id, P);
  return P;
}

// a chunky knitted scarf wrapped around the neck, knot on the left
function buildScarfRing(spec) {
  const S = spec.scarf;
  const skel = spec.kind === 'skeleton';
  const w = skel ? 8 : Math.min(spec.torso.w, spec.head.w) - 1;
  const d = skel ? 7 : spec.torso.d + 1;
  const v = new Vox(w + 4, 5, d + 4);
  const cx = (w + 4) / 2 - 0.5, cz = (d + 4) / 2 - 0.5;
  const knit = (x, y, z) => ((x + y + z) % 2 ? S.color : tone(S.color, -0.1));
  for (let y = 0; y < 3; y++) for (let z = 0; z < d + 4; z++) for (let x = 0; x < w + 4; x++) {
    const dx = (x - cx) / (w / 2 + 0.6), dz = (z - cz) / (d / 2 + 0.6);
    const r = dx * dx + dz * dz;
    if (r > 1 || r < 0.38) continue;
    v.set(x, y, z, y === 1 && S.stripe !== S.color ? S.stripe : knit(x, y, z));
  }
  // knot
  const kx = Math.round(cx + w * 0.22), kz = Math.round(cz + d / 2);
  v.fill(kx - 1, 0, kz, kx + 1, 2, kz + 1, (x, y, z) => ((x + y) % 2 ? tone(S.color, 0.06) : S.color));
  return { vox: v, origin: [cx + 0.5, 0, cz + 0.5], size: VS, knot: [(kx - cx - 0.5) * VS, 0.5 * VS, (kz + 1.5 - cz - 0.5) * VS] };
}

// ---------------------------------------------------------------- pose system
const REST = {
  bodyY: 0, bodyZ: 0, bodyRx: 0, bodyRz: 0, bodyRy: 0, lean: 0, tilt: 0, twist: 0,
  headX: 0, headY: 0, headZ: 0, headS: 1, headUp: 0, jaw: 0, shUp: 0,
  aFL: 0, aOL: 0.1, aTL: 0, eBL: 0.18, eIL: 0, aFR: 0, aOR: 0.1, aTR: 0, eBR: 0.18, eIR: 0,
  lFL: 0, lOL: 0.02, kBL: 0.04, lFR: 0, lOR: 0.02, kBR: 0.04, sq: 1, skirt: 0,
};
const KEYS = Object.keys(REST);
const ARM_KEYS = { L: ['aFL', 'aOL', 'aTL', 'eBL', 'eIL'], R: ['aFR', 'aOR', 'aTR', 'eBR', 'eIR'] };
const LEG_KEYS = { L: ['lFL', 'lOL', 'kBL'], R: ['lFR', 'lOR', 'kBR'] };

const S = Math.sin, C = Math.cos;
const wob = (t, f, ph = 0) => S(t * f + ph);
const arm = (T, side, f, o, e, i = 0, tw = 0) => {
  T['aF' + side] = f; T['aO' + side] = o; T['eB' + side] = e; T['eI' + side] = i; T['aT' + side] = tw;
};
const leg = (T, side, f, o, k) => { T['lF' + side] = f; T['lO' + side] = o; T['kB' + side] = k; };

// idle arm styles
function idleArms(c, t, T, style) {
  const br = wob(t, 1.9) * 0.03;
  switch (style) {
    case 'clasp': arm(T, 'L', 0.42 + br, -0.05, 1.15, 0.55); arm(T, 'R', 0.42 + br, -0.05, 1.15, 0.55); break;
    case 'hips': arm(T, 'L', -0.1, 0.55, 0.25, 1.15); arm(T, 'R', -0.1, 0.55, 0.25, 1.15); break;
    case 'cross': arm(T, 'L', 0.28, 0.05, 1.5, 1.15); arm(T, 'R', 0.22, 0.05, 1.6, 1.2); break;
    case 'behind': arm(T, 'L', -0.38, 0.12, 0.7, 0.7); arm(T, 'R', -0.38, 0.12, 0.7, 0.7); break;
    case 'float': arm(T, 'L', 0.55 + wob(t, 1.3) * 0.08, 0.25, 0.9); arm(T, 'R', 0.55 + wob(t, 1.3, 1) * 0.08, 0.25, 0.9); break;
    default: arm(T, 'L', wob(t, 1.1) * 0.04, 0.12 + br, 0.2); arm(T, 'R', wob(t, 1.1, 2) * 0.04, 0.12 + br, 0.2);
  }
}

// full poses: fn(c, t, T) writes targets. Flags: legs = keeps locomotion legs, arms = keeps locomotion arms
const POSES = {
  idle(c, t, T) {
    idleArms(c, t, T, c.persona.idle);
    T.tilt += wob(t, 0.55, c.seed) * 0.025;
    T.bodyY += wob(t, 1.9) * 0.004;
    T.headZ += wob(t, 0.7, c.seed) * 0.03;
    if (c.persona.idle === 'float') { T.bodyY += 0.12 + wob(t, 1.6) * 0.05; T.lean += 0.08; }
  },
  walk() {},
  talk(c, t, T) {
    POSES.idle(c, t, T);
  },
  wave(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 0.25, 2.55, 0.35, wob(t, 11) * 0.55);
    T.headZ += 0.12; T.tilt -= 0.05;
    T.bodyY += Math.abs(wob(t, 5.5)) * 0.015;
  },
  cheer(c, t, T) {
    const hop = Math.abs(S(t * 7));
    arm(T, 'L', 0.2 + hop * 0.2, 2.6, 0.3); arm(T, 'R', 0.2 + hop * 0.2, 2.6, 0.3);
    T.bodyY += hop * 0.1 * c.persona.bounce;
    T.sq = 1 + (hop - 0.5) * 0.12;
    leg(T, 'L', 0.1 * hop, 0.15, 0.3 * hop); leg(T, 'R', 0.1 * hop, 0.15, 0.3 * hop);
    T.headX -= 0.15;
  },
  scared(c, t, T) {
    arm(T, 'L', 1.35, 0.2, 2.1, 0.3); arm(T, 'R', 1.35, 0.2, 2.1, 0.3);
    leg(T, 'L', 0.35, 0.12, 0.75); leg(T, 'R', 0.35, 0.12, 0.75);
    T.bodyY -= 0.06; T.lean += 0.12; T.headX -= 0.08;
    T.tilt += S(t * 55) * 0.03; T.twist += S(t * 47) * 0.03;
    T.shUp = 0.02;
  },
  handsup(c, t, T) {
    arm(T, 'L', 0.12, 2.85, 0.12); arm(T, 'R', 0.12, 2.85, 0.12);
    T.tilt += S(t * 40) * 0.02; T.shUp = 0.02;
    T.bodyY += Math.abs(S(t * 3)) * 0.01;
  },
  point(c, t, T) {
    idleArms(c, t, T, 'hips');
    arm(T, 'R', 1.5, 0.12, 0.04);
    T.lean += 0.06; T.twist -= 0.12;
  },
  shrug(c, t, T) {
    arm(T, 'L', 0.35, 0.55, 1.5, -0.6); arm(T, 'R', 0.35, 0.55, 1.5, -0.6);
    T.shUp = 0.035; T.headZ += 0.18; T.headX -= 0.05;
  },
  sit(c, t, T) {
    leg(T, 'L', 1.5, 0.08, 1.5); leg(T, 'R', 1.5, 0.08, 1.5);
    T.bodyY -= c.P.thighL * 0.98;
    arm(T, 'L', 0.75, 0.12, 0.55); arm(T, 'R', 0.75, 0.12, 0.55);
    T.lean += 0.04 + wob(t, 1.7) * 0.01;
  },
  ride(c, t, T) {
    const st = c.rideStyle || 'pedal';
    leg(T, 'L', 1.2, 0.1, 1.4); leg(T, 'R', 1.2, 0.1, 1.4);
    arm(T, 'L', 1.15, 0.2, 0.35); arm(T, 'R', 1.15, 0.2, 0.35);
    T.lean += st === 'stand' ? 0.55 : st === 'brake' ? 0.08 : st === 'coast' || st === 'idle' ? 0.2 : st === 'drift' ? 0.4 : 0.32;
    if (st === 'stand') T.bodyY += 0.09 + Math.abs(S(c.rideCrank || 0)) * 0.03, T.tilt += S(c.rideCrank || 0) * 0.08;
    if (st === 'pedal') T.tilt += S(c.rideCrank || 0) * 0.04, T.bodyY += Math.abs(S(c.rideCrank || 0)) * 0.01;
    if (st === 'drift') { T.tilt -= (c.rideLean || 0) * 0.5; T.headZ += (c.rideLean || 0) * 0.3; }
    if (st === 'brake') T.headX -= 0.1;
    if (st === 'air') { T.headX -= 0.18; T.bodyY += 0.04; }
    if (st === 'glide') { arm(T, 'L', 0.2, 2.75, 0.2); arm(T, 'R', 0.2, 2.75, 0.2); leg(T, 'L', 0.3 + S(t * 6) * 0.25, 0.1, 0.4); leg(T, 'R', 0.3 - S(t * 6) * 0.25, 0.1, 0.4); T.lean = 0.05; }
    if (st === 'motor') { leg(T, 'L', 1.35, 0.25, 1.35); leg(T, 'R', 1.35, 0.25, 1.35); arm(T, 'L', 1.3, 0.35, 0.5); arm(T, 'R', 1.3, 0.35, 0.5); T.lean += 0.05; }
    if (c.trickPose) c.trickPose(c, t, T);
  },
  hold(c, t, T) {
    arm(T, 'L', 0.95, 0.04, 1.15, 0.25); arm(T, 'R', 0.95, 0.04, 1.15, 0.25);
  },
  carry(c, t, T) { POSES.hold(c, t, T); T.lean -= 0.06; },
  lantern(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 1.15 + wob(t, 2) * 0.03, 0.1, 0.85);
  },
  kick(c, t, T) {
    // wind-up then a big swing
    const k = t < 0.18 ? t / 0.18 : 1;
    const sw = t < 0.18 ? -0.7 * k : t < 0.42 ? -0.7 + ((t - 0.18) / 0.24) * 2.3 : 1.6 - Math.min(1, (t - 0.42) / 0.4) * 1.6;
    leg(T, 'R', sw, 0.05, t < 0.18 ? 1.2 * k : t < 0.42 ? 0.3 : 0.1);
    leg(T, 'L', -0.05, 0.05, 0.25);
    arm(T, 'L', -0.4, 0.9, 0.5); arm(T, 'R', 0.6, 0.6, 0.6);
    T.lean -= sw * 0.12; T.bodyY -= 0.02;
  },
  dance(c, t, T) {
    const b = S(t * 8);
    T.tilt += b * 0.14; T.bodyY += Math.abs(b) * 0.04; T.twist += S(t * 4) * 0.25;
    arm(T, 'L', 0.4, 1.4 + b * 0.9, 0.6); arm(T, 'R', 0.4, 1.4 - b * 0.9, 0.6);
    leg(T, 'L', 0.15 + b * 0.15, 0.1, 0.25 + Math.max(0, b) * 0.4); leg(T, 'R', 0.15 - b * 0.15, 0.1, 0.25 + Math.max(0, -b) * 0.4);
    T.headZ += b * 0.18;
  },
  laugh(c, t, T) {
    arm(T, 'L', 0.55, 0.15, 1.5, 0.5); arm(T, 'R', 0.55, 0.15, 1.5, 0.5);
    T.lean -= 0.22; T.headX -= 0.3;
    T.bodyY += Math.abs(S(t * 16)) * 0.025; T.sq = 1 + S(t * 16) * 0.03;
    T.jaw = 0.25 + Math.abs(S(t * 16)) * 0.25;
  },
  facepalm(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 1.85, 0.35, 2.35, 0.45);
    T.headX += 0.38; T.lean += 0.08; T.headY += 0.1;
  },
  sip(c, t, T) {
    idleArms(c, t, T, 'loose');
    const up = (S(t * 1.3) > 0.2) ? 1 : 0.6;
    arm(T, 'R', 1.1 * up + 0.2, 0.3, 2.05 * up, 0.55);
    T.headX -= 0.15 * up;
  },
  eat(c, t, T) {
    arm(T, 'L', 0.8, 0.05, 1.3, 0.4);
    const b = Math.max(0, S(t * 5));
    arm(T, 'R', 0.9 + b * 0.6, 0.25, 1.5 + b * 0.6, 0.5);
    T.headX += 0.1 - b * 0.15; T.jaw = b * 0.3;
  },
  knit(c, t, T) {
    arm(T, 'L', 0.8 + S(t * 9) * 0.06, 0.05, 1.35, 0.55); arm(T, 'R', 0.8 + S(t * 9 + 2) * 0.06, 0.05, 1.35, 0.55);
    T.headX += 0.22;
  },
  aim(c, t, T) {
    arm(T, 'L', 1.42, -0.25, 0.25, 0.2); arm(T, 'R', 1.45, -0.18, 0.1);
    T.lean += 0.12; leg(T, 'L', 0.25, 0.12, 0.3); leg(T, 'R', -0.2, 0.08, 0.15);
    T.tilt += S(t * 30) * 0.008;
  },
  gun(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 0.75, 0.08, 1.2, 0.25);
  },
  think(c, t, T) {
    arm(T, 'L', 0.5, 0.0, 1.65, 1.0); arm(T, 'R', 1.25, 0.25, 2.3, 0.65);
    T.headZ += 0.16; T.headX -= 0.12; T.headY += wob(t, 0.8) * 0.15;
  },
  sleep(c, t, T) {
    idleArms(c, t, T, c.persona.idle === 'cross' ? 'cross' : 'loose');
    T.headX += 0.5; T.lean += 0.12 + S(t * 1.1) * 0.03; T.bodyY += S(t * 1.1) * 0.006;
    T.headZ += S(t * 0.55) * 0.1;
  },
  crawl(c, t, T) {
    const ph = t * 4;
    T.bodyRx += 1.2; T.bodyY -= c.P.hipH * 0.5;
    arm(T, 'L', 2.1 + S(ph) * 0.35, 0.15, 0.4); arm(T, 'R', 2.1 - S(ph) * 0.35, 0.15, 0.4);
    leg(T, 'L', 0.4 - S(ph) * 0.3, 0.1, 1.5); leg(T, 'R', 0.4 + S(ph) * 0.3, 0.1, 1.5);
    T.headX -= 0.8;
  },
  shiver(c, t, T) {
    arm(T, 'L', 0.55, -0.1, 2.05, 1.05); arm(T, 'R', 0.6, -0.1, 2.0, 1.05);
    leg(T, 'L', 0.05, -0.06, 0.2); leg(T, 'R', 0.05, -0.06, 0.2);
    T.twist += S(t * 52) * 0.05; T.tilt += S(t * 43) * 0.025; T.headX += 0.12; T.shUp = 0.03;
    T.jaw = Math.abs(S(t * 30)) * 0.18;
  },
  offer(c, t, T) {
    arm(T, 'L', 0.95, 0.12, 0.55, -0.2); arm(T, 'R', 0.95, 0.12, 0.55, -0.2);
    T.lean += 0.14; T.headX += 0.06;
  },
  hug(c, t, T) {
    arm(T, 'L', 1.25, 0.65, 0.85, 0.4); arm(T, 'R', 1.25, 0.65, 0.85, 0.4);
    T.lean += 0.1; T.headZ += 0.15;
  },
  angry(c, t, T) {
    idleArms(c, t, T, 'hips');
    T.lean += 0.16; T.headX -= 0.08;
    const st = Math.max(0, S(t * 9));
    leg(T, 'R', st * 0.5, 0.05, st * 0.9);
    T.sq = 1 - (st < 0.05 ? 0.04 : 0);
  },
  sad(c, t, T) {
    arm(T, 'L', 0.05, 0.03, 0.15); arm(T, 'R', 0.05, 0.03, 0.15);
    T.lean += 0.18; T.headX += 0.45; T.shUp = -0.015; T.tilt += S(t * 0.8) * 0.03;
  },
  hockey(c, t, T) {
    arm(T, 'L', 0.65, 0.1, 1.0, 0.4); arm(T, 'R', 0.85, 0.05, 0.75, 0.5);
    T.lean += 0.3; leg(T, 'L', 0.35, 0.12, 0.5); leg(T, 'R', 0.35, 0.12, 0.5); T.bodyY -= 0.04;
    T.twist += S(t * 2) * 0.1;
  },
  float(c, t, T) {
    arm(T, 'L', 0.65 + wob(t, 1.3) * 0.1, 0.3, 0.9); arm(T, 'R', 0.65 + wob(t, 1.3, 1) * 0.1, 0.3, 0.9);
    T.bodyY += 0.15 + wob(t, 1.6) * 0.06; T.lean += 0.06;
    leg(T, 'L', 0.2, 0, 0.6); leg(T, 'R', 0.3, 0, 0.7);
  },
  clipboard(c, t, T) {
    arm(T, 'L', 0.95, 0.0, 1.6, 0.55);
    arm(T, 'R', 0.85 + S(t * 13) * 0.04, 0.05, 1.7, 0.75 + S(t * 9) * 0.06);
    T.headX += 0.28;
  },
  photo(c, t, T) {
    arm(T, 'L', 1.45, 0.05, 2.0, 0.75); arm(T, 'R', 1.45, 0.05, 2.0, 0.75);
    T.headX -= 0.05; T.lean += 0.05;
  },
  dig(c, t, T) {
    const s = (S(t * 4) + 1) / 2;
    arm(T, 'L', 0.6 + s * 0.6, 0.1, 1.1, 0.3); arm(T, 'R', 0.9 + s * 0.4, 0.05, 0.9 - s * 0.4, 0.3);
    T.lean += 0.35 + s * 0.2; leg(T, 'L', 0.3, 0.1, 0.4); leg(T, 'R', -0.15, 0.1, 0.2);
  },
  water(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 0.95, 0.15, 0.4, 0.1, 0.4 + S(t * 2) * 0.1);
    T.lean += 0.08;
  },
  sweep(c, t, T) {
    const s = S(t * 4);
    arm(T, 'L', 0.75, 0.05, 1.0, 0.4); arm(T, 'R', 0.5, 0.1, 0.8, 0.4);
    T.twist += s * 0.35; T.lean += 0.15;
  },
  air(c, t, T) {
    leg(T, 'L', 1.0, 0.15, 1.5); leg(T, 'R', 0.7, 0.15, 1.2);
    arm(T, 'L', 0.4, 1.3, 0.4); arm(T, 'R', 0.4, 1.3, 0.4);
  },
  flail(c, t, T) {
    arm(T, 'L', S(t * 16) * 2, 1.2, 0.5); arm(T, 'R', S(t * 16 + 3) * 2, 1.2, 0.5);
    leg(T, 'L', S(t * 13) * 0.7, 0.2, 0.6); leg(T, 'R', -S(t * 13) * 0.7, 0.2, 0.6);
    T.headX -= 0.2;
  },
  push(c, t, T) {
    arm(T, 'L', 1.45, 0.25, 0.3); arm(T, 'R', 1.45, 0.25, 0.3);
    T.lean += 0.35; leg(T, 'L', 0.4, 0.1, 0.5); leg(T, 'R', -0.4, 0.1, 0.1);
  },
  lie(c, t, T) {
    T.bodyRx -= 1.52; T.bodyY = -c.P.hipH + 0.12;
    arm(T, 'L', 0.2, 1.1, 0.3); arm(T, 'R', 0.2, 1.1, 0.3);
    leg(T, 'L', 0.1, 0.2, 0.1); leg(T, 'R', 0.05, 0.25, 0.1);
    T.headY += 0.5;
  },
  bow(c, t, T) {
    idleArms(c, t, T, 'clasp');
    T.lean += Math.min(1, t * 3) * 0.75 * (t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) * 3));
  },
  stretch(c, t, T) {
    arm(T, 'L', 0.3, 2.9, 0.2); arm(T, 'R', 0.3, 2.9, 0.2);
    T.lean -= 0.18; T.headX -= 0.3; T.sq = 1.06; T.jaw = 0.3;
  },
  knock(c, t, T) {
    idleArms(c, t, T, 'loose');
    const k = Math.max(0, S(t * 14));
    arm(T, 'R', 1.25 + k * 0.25, 0.1, 1.6 - k * 0.5, 0.3);
  },
  salute(c, t, T) {
    idleArms(c, t, T, 'loose');
    arm(T, 'R', 0.6, 1.25, 2.3, 0.9);
  },
  reassemble(c, t, T) { POSES.cheer(c, t, T); },
};
// aliases for old sprite animations and Hank gags
const ALIAS = {
  collect: 'offer', cash: 'cheer', delivered: 'wave', cup: 'sip', fizz: 'handsup', boost: 'handsup', crash: 'lie',
  land: 'idle', jump: 'air', bones: 'lie', glider: 'handsup', upgrade: 'cheer', squish: 'idle', splash: 'scared', wobble: 'idle',
  coast: 'ride', pedal: 'ride', stand: 'ride',
};
const LOCO_OK = new Set(['idle', 'walk', 'talk', 'hold', 'carry', 'lantern', 'gun', 'shiver', 'sip', 'wave', 'clipboard', 'photo', 'water', 'scared', 'angry', 'sad', 'think', 'knit', 'point', 'float', 'facepalm']);
const LOCO_ARMS = new Set(['idle', 'walk', 'talk', 'angry', 'sad']);

// one-shot reactions layered over any pose: fn(c, t, T) -> done?
const REACT = {
  jump: { d: 0.6, start(c) { c.hopV = 3.2; c.kick('sq', 0.75); }, f(c, t, T) { if (c.hop > 0) { leg(T, 'L', 0.6, 0.1, 1.0); leg(T, 'R', 0.6, 0.1, 1.0); arm(T, 'L', 0.3, 1.5, 0.3); arm(T, 'R', 0.3, 1.5, 0.3); } } },
  shock: {
    d: 1.1, expr: 'shock',
    start(c) { c.hopV = 4.2; c.kick('sq', 1.45); c.kick('headS', 0.45); c.kick('headUp', 0.12); c.sfx('boing'); },
    f(c, t, T) { arm(T, 'L', 0.4, 2.2, 0.4); arm(T, 'R', 0.4, 2.2, 0.4); T.jaw = 0.55; T.lean -= 0.18; leg(T, 'L', 0.3, 0.25, 0.5); leg(T, 'R', 0.3, 0.25, 0.5); },
  },
  gasp: { d: 0.9, expr: 'surprised', start(c) { c.kick('headS', 0.25); }, f(c, t, T) { arm(T, 'L', 1.6, 0.2, 2.2, 0.6); arm(T, 'R', 1.6, 0.2, 2.2, 0.6); T.lean -= 0.15; T.jaw = 0.35; } },
  laugh: { d: 1.4, expr: 'laugh', f(c, t, T) { POSES.laugh(c, t, T); } },
  nod: { d: 0.7, f(c, t, T) { T.headX += S(t * 18) * 0.28 * (1 - t / 0.7); } },
  shake: { d: 0.8, f(c, t, T) { T.headY += S(t * 20) * 0.45 * (1 - t / 0.8); } },
  angry: {
    d: 1.0, expr: 'angry', start(c) { c.flash(0xff3020, 0.35); c.kick('sq', 0.8); c.sfx('stomp'); },
    f(c, t, T) { POSES.angry(c, t * 1.5, T); T.tilt += S(t * 40) * 0.03; },
  },
  love: { d: 1.6, expr: 'love', f(c, t, T) { T.headZ += S(t * 4) * 0.2; T.tilt += S(t * 4) * 0.06; arm(T, 'L', 0.7, 0.1, 1.9, 0.9); arm(T, 'R', 0.7, 0.1, 1.9, 0.9); T.bodyY += Math.abs(S(t * 4)) * 0.03; } },
  spin: { d: 0.7, expr: 'happy', start(c) { c.hopV = 2.6; }, f(c, t, T) { T.bodyRy += (t / 0.7) * TAU; arm(T, 'L', 0.2, 1.6, 0.2); arm(T, 'R', 0.2, 1.6, 0.2); } },
  yay: { d: 0.9, expr: 'happy', start(c) { c.hopV = 3.6; c.kick('sq', 1.3); }, f(c, t, T) { arm(T, 'L', 0.25, 2.6, 0.2); arm(T, 'R', 0.25, 2.6, 0.2); if (t > 0.45 && c.hop <= 0 && !c._yay2) { c._yay2 = true; c.hopV = 2.6; } } },
  bounce: { d: 0.3, start(c) { c.kick('sq', 0.7); } },
  flinch: { d: 0.5, expr: 'scared', start(c) { c.kick('sq', 0.8); }, f(c, t, T) { arm(T, 'L', 1.4, 0.3, 2.2, 0.3); arm(T, 'R', 1.4, 0.3, 2.2, 0.3); T.lean += 0.25; T.bodyY -= 0.05; } },
  faint: {
    d: 2.6, expr: 'ko',
    f(c, t, T) {
      const k = t < 0.5 ? 0 : t < 0.85 ? (t - 0.5) / 0.35 : t < 2.0 ? 1 : 1 - (t - 2.0) / 0.6;
      T.bodyRx -= 1.5 * Math.pow(k, 1.5); T.bodyY -= (c.P.hipH - 0.12) * k;
      arm(T, 'L', 0.1, 0.4 + k * 0.6, 0.2); arm(T, 'R', 0.1, 0.4 + k * 0.6, 0.2);
      if (t < 0.5) T.tilt += S(t * 30) * 0.05;
    },
  },
  sneeze: {
    d: 1.3, start() {},
    f(c, t, T) {
      if (t < 0.8) { T.lean -= t * 0.35; T.headX -= t * 0.5; T.jaw = t * 0.4; c.tempExpr('surprised', 0.1); }
      else { T.lean += 0.4; T.headX += 0.5; T.jaw = 0.1; if (!c._sneezed) { c._sneezed = true; c.kick('sq', 0.7); c.sfx('sneeze'); c.tempExpr('sleepy', 0.5); } }
    },
  },
  trip: { d: 1.0, expr: 'shock', start(c) { c.kick('sq', 0.85); }, f(c, t, T) { POSES.flail(c, t, T); T.lean += 0.4 * Math.sin(Math.min(1, t / 0.8) * Math.PI); } },
  shiver: { d: 1.2, expr: 'scared', f(c, t, T) { POSES.shiver(c, t, T); } },
  headpop: {
    // the skull pops off the neck, spins and lands back on
    d: 1.0, expr: 'surprised', start(c) { c.sfx('bone_rattle'); },
    f(c, t, T) { const k = Math.sin(Math.min(1, t / 0.8) * Math.PI); T.headUp += k * 0.35; T.headY += (t / 0.8) * TAU * (t < 0.8 ? 1 : 0); T.jaw = 0.4 * k; },
  },
};

// ---------------------------------------------------------------- the character
let SEED = 1;
export class VoxelCharacter {
  constructor(game, charId, { x = 0, z = 0, y = null, yaw = 0, anim = 'idle', expr = 'neutral', shadow = true, cloth = true, parent = null } = {}) {
    this.game = game;
    this._char = charId;
    this.P = partsFor(charId);
    this.spec = this.P.spec;
    this.persona = PERSONA[charId] || PERSONA.hank;
    this.seed = (SEED++ * 1.618) % 10;
    this.mat = createVoxelMaterial();
    this.pos = new THREE.Vector3(x, y ?? 0, z);
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.anim = ALIAS[anim] || anim;
    this.animT = 0;
    this._initHold = true;
    this.expr = expr;
    this.t = Math.random() * 10;
    this.groundSnap = y == null;
    this.visible = true;
    this.speed = 0;
    this.speedOverride = null;
    this.phase = 0;
    this.hop = 0;
    this.hopV = 0;
    this.talking = 0;
    this.blinkT = 1 + Math.random() * 3;
    this.lookTarget = null;
    this.lookAtCamera = false;
    this.reaction = null;
    this.tmpExpr = null;
    this.fidgetT = 4 + Math.random() * 6;
    this.fidget = null;
    this.held = { L: null, R: null };
    this.yOffset = 0;
    this.floatY = 0;
    this.path = null;
    this.ride = null;
    this.broken = null;
    this.flashT = 0;
    this.J = { ...REST };
    this.V = Object.fromEntries(KEYS.map((k) => [k, 0]));
    this.T = { ...REST };
    this.stiff = 240;
    this.zeta = 0.5;
    this.lastPos = this.pos.clone();
    this.parentObj = parent || game?.scene;
    this.buildRig(shadow);
    if (cloth) this.buildCloth();
    if (HELD[this.anim]) this.autoHold(this.anim);
    this.parentObj?.add(this.root);
    for (const cl of this.cloths) this.parentObj?.add(cl.group);
    this.snapGround();
    this.apply();
  }

  get char() { return this._char; }
  set char(id) { if (id !== this._char) this.rebuild(id); }
  // swap to another character spec in place (e.g. muddy Hank -> clean Hank)
  rebuild(id) {
    const parent = this.root.parent;
    const held = this.held;
    this.remove();
    this.mat.dispose(); this.faceMat.dispose(); this.faceTex.tex.dispose();
    for (const c of this.cloths) c.dispose();
    this._char = id;
    this.P = partsFor(id);
    this.spec = this.P.spec;
    this.persona = PERSONA[id] || PERSONA.hank;
    this.mat = createVoxelMaterial();
    this.buildRig(true);
    this.buildCloth();
    this.held = { L: null, R: null };
    for (const s of ['L', 'R']) if (held[s]) this.hold(held[s], s);
    parent?.add(this.root);
    for (const cl of this.cloths) parent?.add(cl.group);
    this.apply();
  }

  // ------------------------------------------------------------ construction
  buildRig(shadow) {
    const P = this.P, G = P.geo;
    const mk = (geo, parent, mirror = false) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.customDepthMaterial = this.mat.userData.depth;
      if (mirror) m.scale.x = -1;
      parent.add(m);
      return m;
    };
    const root = (this.root = new THREE.Group());
    root.name = `vchar:${this.char}`;
    this.mesh = root; // Actor compatibility
    this.squashG = new THREE.Group();
    root.add(this.squashG);
    this.body = new THREE.Group();
    this.squashG.add(this.body);
    this.spine = new THREE.Group();
    this.body.add(this.spine);
    this.torso = mk(G.torso, this.spine);
    // neck & head
    this.neck = new THREE.Group();
    this.neck.position.set(0, P.neckY, 0);
    this.spine.add(this.neck);
    this.headJ = new THREE.Group();
    this.neck.add(this.headJ);
    this.headPiece = new THREE.Group();
    this.headJ.add(this.headPiece);
    this.head = mk(G.head, this.headPiece);
    // face decal
    const fr = P.head.face, o = P.head.origin;
    this.faceTex = new FaceTex(this.spec, fr);
    this.faceMat = createFlatMaterial(this.faceTex.tex);
    const fw = (fr.x1 - fr.x0) * VS, fh = (fr.y1 - fr.y0) * VS;
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), this.faceMat);
    fm.position.set(((fr.x0 + fr.x1) / 2 - o[0]) * VS, ((fr.y0 + fr.y1) / 2 - o[1]) * VS, (fr.z - o[2]) * VS + 0.003);
    fm.receiveShadow = true;
    this.headPiece.add(fm);
    this.faceMesh = fm;
    if (P.jaw) {
      this.jawJ = new THREE.Group();
      this.jawJ.position.set(0, 0, (3 - this.spec.head.d / 2) * VS);
      this.headPiece.add(this.jawJ);
      this.jaw = mk(G.jaw, this.jawJ);
    }
    // arms
    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const sh = new THREE.Group();
      sh.position.set(s * P.shoulderX, P.shoulderY, 0);
      sh.rotation.order = 'XZY';
      this.spine.add(sh);
      const upper = mk(G.upperArm, sh, s < 0);
      const elbow = new THREE.Group();
      elbow.position.y = -P.upperL;
      elbow.rotation.order = 'XZY';
      sh.add(elbow);
      const fore = mk(G.forearm, elbow, s < 0);
      const hand = new THREE.Group();
      hand.position.set(0, -P.foreL - 1.5 * VS, 0.5 * VS);
      elbow.add(hand);
      this.arms[side] = { sh, upper, elbow, fore, hand, s };
    }
    // legs
    this.legs = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const hip = new THREE.Group();
      hip.position.set(s * P.hipX, 0, 0);
      hip.rotation.order = 'XZY';
      this.body.add(hip);
      const thigh = mk(G.thigh, hip, s < 0);
      const knee = new THREE.Group();
      knee.position.y = -P.thighL;
      hip.add(knee);
      const shin = mk(G.shin, knee, s < 0);
      this.legs[side] = { hip, thigh, knee, shin, s };
      if (this.spec.kind === 'reaper') { thigh.visible = shin.visible = false; }
    }
    if (G.skirt) this.skirt = mk(G.skirt, this.body);
    if (G.scarf) {
      this.scarfRing = mk(G.scarf, this.spine);
      this.scarfRing.position.y = P.torsoH - (this.spec.kind === 'skeleton' ? 1 : 0.5) * VS;
    }
    this.breakables = [this.legs.L.shin, this.legs.R.shin, this.legs.L.thigh, this.legs.R.thigh, this.torso, this.arms.L.upper, this.arms.R.upper, this.arms.L.fore, this.arms.R.fore, this.scarfRing, this.jaw, this.headPiece].filter(Boolean);
  }

  buildCloth() {
    this.cloths = [];
    const S = this.spec, P = this.P;
    const ground = this.game?.physics ? (x, z) => this.game.physics.groundAt(x, z, this.pos.y + 1).h : () => this.pos.y;
    const colliders = [{ obj: this.torso, offset: new THREE.Vector3(0, P.torsoH * 0.5, 0), r: P.bodyR * 1.15 }];
    if (S.scarf && this.scarfRing) {
      const k = P.scarf.knot;
      const tex = scarfTexture(S.scarf.color, S.scarf.stripe);
      const long = S.scarf.short ? 0.28 : 0.5;
      const a = new Cloth({ cols: 2, rows: 7, width: 0.11, length: long, map: tex, anchor: this.scarfRing, pins: [new THREE.Vector3(k[0] - 0.05, k[1], k[2]), new THREE.Vector3(k[0] + 0.05, k[1], k[2])], dir: [0.15, -1, 0.35], colliders, ground, drag: 0.04 });
      const b = new Cloth({ cols: 2, rows: 6, width: 0.1, length: long * 0.75, map: tex, anchor: this.scarfRing, pins: [new THREE.Vector3(k[0] + 0.02, k[1], k[2] - 0.02), new THREE.Vector3(k[0] + 0.1, k[1], k[2] - 0.04)], dir: [0.6, -1, -0.2], colliders, ground, drag: 0.04 });
      this.cloths.push(a, b);
    }
    if (S.cape) {
      const W = S.torso.w * VS * 0.95;
      const len = S.cape.long ? P.hipH + P.torsoH * 0.85 : P.hipH * 0.75 + P.torsoH * 0.6;
      const zb = -((S.torso.d / 2) + 0.6) * VS;
      const yTop = P.torsoH - 0.5 * VS;
      const pins = [];
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1) - 0.5;
        pins.push(new THREE.Vector3(u * W, yTop - Math.abs(u) * 0.04, zb + Math.abs(u) * 0.05));
      }
      const outer = capeTexture(S.cape.color, null, { star: this.char === 'pip' });
      const inner = capeTexture(S.cape.inner ?? S.cape.color);
      const cape = new Cloth({ cols, rows: 8, width: W, length: len, map: outer, innerMap: inner, anchor: this.torso, pins, dir: [0, -1, -0.15], colliders: [...colliders, { obj: this.torso, offset: new THREE.Vector3(0, -P.hipH * 0.4, 0), r: P.bodyR * 1.05 }], ground, drag: 0.05 });
      this.cloths.push(cape);
    }
  }

  // ------------------------------------------------------------ Actor-compatible API
  play(anim, expr) {
    anim = ALIAS[anim] || anim;
    if (anim !== this.anim) {
      this.anim = anim;
      this.animT = 0;
      this.autoHold(anim);
    }
    if (expr) this.expr = expr === 'blink' ? 'neutral' : expr;
    return this;
  }
  setExpr(e) { this.expr = e; return this; }
  // old sprite Actor compatibility (cutscenes poke these)
  get bb() {
    const self = this;
    return { set fade(v) { self.setFade(v); }, get fade() { return self.mat.uniforms.uFade.value; } };
  }
  get lockView() { return null; }
  set lockView(v) {}
  tempExpr(e, s = 1.2) { this.tmpExpr = { e, t: s }; }
  face(yaw) { this.targetYaw = yaw; return this; }
  faceTowards(x, z) { this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z); return this; }
  say(seconds = 2) { this.talking = Math.max(this.talking, seconds); }
  lookAt(target) { this.lookTarget = target; return this; }
  bounce(amount = 0.7) { this.kick('sq', amount); }
  jump(v = 3) { this.hopV = v; this.kick('sq', 1.25); }
  kick(key, value) { this.J[key] = value; this.V[key] = 0; }
  react(name) {
    const R = REACT[name];
    if (!R) return this;
    this.reaction = { name, R, t: 0 };
    this._yay2 = this._sneezed = false;
    if (R.expr) this.tempExpr(R.expr, R.d + 0.3);
    R.start?.(this);
    return this;
  }
  showEmote(name, seconds = 2) {
    const map = { alert: 'shock', question: null, heart: 'love', anger: 'angry', sweat: 'flinch', zzz: null, note: 'spin', star: 'yay', coin: 'yay', cold: 'shiver', skull: 'gasp', dots: null };
    if (map[name]) this.react(map[name]);
    if (name === 'question') this.tempExpr('worried', seconds), this.react('shake');
    if (name === 'zzz') this.tempExpr('sleepy', seconds);
    if (name === 'sweat') this.tempExpr('sheepish', seconds);
    this.game?.emotes?.show?.(this, name, seconds);
  }
  walkTo(points, speed = 1.4, anim = 'walk') {
    this.path = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
    this.walkSpeed = speed;
    const base = anim.startsWith('walk+') ? anim.slice(5) : anim === 'walk' ? (LOCO_OK.has(this.anim) ? this.anim : 'idle') : anim;
    this.play(base);
    return new Promise((res) => (this.onArrive = res));
  }
  // props that come with a pose (Nana's lantern, a mug for sipping, Pip's hockey stick...)
  autoHold(anim) {
    const cur = this.held.R;
    if (cur && !cur.userData.held) return; // something scripted is held; leave it
    if (cur?.userData.held === anim) return;
    if (cur) this.hold(null, 'R');
    if (HELD[anim]) this.hold(heldMesh(anim), 'R');
  }
  hold(obj, side = 'R') {
    const prev = this.held[side];
    if (prev) this.arms[side].hand.remove(prev);
    this.held[side] = obj;
    if (obj) this.arms[side].hand.add(obj);
    return this;
  }
  flash(color = 0xffffff, dur = 0.25) {
    this.mat.uniforms.uFlashColor.value.set(color);
    this.faceMat.uniforms.uFlashColor.value.set(color);
    this.flashT = dur;
    this.flashDur = dur;
  }
  setFade(v) {
    this.mat.uniforms.uFade.value = v;
    this.faceMat.uniforms.uFade.value = v;
    for (const c of this.cloths) for (const m of c.materials) m.uniforms.uFade.value = v;
  }
  setHighlight(v) { this.mat.uniforms.uHighlight.value = v; }
  sfx(name, opts) { this.game?.sound?.play?.(name, { pos: this.pos, ...opts }); }
  get headTop() { return this.pos.y + this.hop + this.P.height + this.J.bodyY; }
  headWorld(out = new THREE.Vector3()) {
    this.headPiece.updateWorldMatrix(true, false);
    return out.set(0, this.P.headH, 0).applyMatrix4(this.headPiece.matrixWorld);
  }
  remove() {
    this.root.parent?.remove(this.root);
    for (const c of this.cloths) c.group.parent?.remove(c.group);
    if (this.broken) for (const p of this.broken.parts) p.node.parent?.remove(p.node);
  }
  dispose() {
    this.remove();
    this.mat.dispose(); this.faceMat.dispose(); this.faceTex.tex.dispose();
    for (const c of this.cloths) c.dispose();
  }
  snapGround() {
    if (!this.groundSnap || !this.game?.physics || this.ride) return;
    this.pos.y = this.game.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5).h;
  }

  // ride a bike: anchors are Object3Ds on the bike model; pass null to get off
  mount(r) {
    this.ride = r ? { ikW: 1, ...r } : null;
    if (r) this.play('ride');
    else if (this.anim === 'ride') this.play('idle');
  }

  // ------------------------------------------------------------ fall apart!
  explode(vel = new THREE.Vector3(), { scatter = 2.5, hold = 1.1 } = {}) {
    if (this.broken) return;
    const scene = this.root.parent;
    if (!scene) return;
    this.root.updateMatrixWorld(true);
    const parts = [];
    for (const node of this.breakables) {
      const rec = { node, parent: node.parent, lp: node.position.clone(), lq: node.quaternion.clone(), ls: node.scale.clone() };
      scene.attach(node);
      rec.v = new THREE.Vector3((Math.random() - 0.5) * scatter, 2.2 + Math.random() * 3, (Math.random() - 0.5) * scatter).addScaledVector(vel, 0.5 + Math.random() * 0.6);
      rec.w = new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      node.geometry?.computeBoundingSphere?.();
      rec.r = node.geometry ? Math.max(0.03, node.geometry.boundingSphere.radius * 0.35) : 0.15;
      parts.push(rec);
    }
    this.broken = { t: 0, hold, parts, phase: 'scatter' };
    this.tempExpr('dizzy', 3);
    this.sfx('bones_scatter');
  }
  reassemble() {
    if (!this.broken || this.broken.phase !== 'scatter') return;
    this.broken.phase = 'gather';
    this.broken.t = 0;
    this.play('idle');
    this.root.updateMatrixWorld(true);
    for (const p of this.broken.parts) { p.sp = p.node.position.clone(); p.sq = p.node.quaternion.clone(); }
    this.sfx('bones_assemble');
  }
  updateBroken(dt) {
    const B = this.broken;
    B.t += dt;
    const ground = (x, z) => (this.game?.physics ? this.game.physics.groundAt(x, z, this.pos.y + 2).h : this.pos.y);
    if (B.phase === 'scatter') {
      for (const p of B.parts) {
        const n = p.node;
        p.v.y -= 16 * dt;
        n.position.addScaledVector(p.v, dt);
        _q.setFromEuler(_e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt));
        n.quaternion.premultiply(_q);
        const g = ground(n.position.x, n.position.z) + p.r;
        if (n.position.y < g) {
          n.position.y = g;
          if (p.v.y < -2.5) this.sfx('bone_rattle', { volume: Math.min(0.6, -p.v.y * 0.08) });
          p.v.y = -p.v.y * 0.35;
          p.v.x *= 0.65; p.v.z *= 0.65; p.w.multiplyScalar(0.6);
          if (Math.abs(p.v.y) < 0.4) p.v.y = 0;
        }
      }
      if (B.auto !== false && B.t > B.hold) this.reassemble();
      return;
    }
    // gather: parts arc back to their joints, feet first, head last
    this.root.updateMatrixWorld(true);
    let done = true;
    B.parts.forEach((p, i) => {
      const k = clamp((B.t - i * 0.055) / 0.42, 0, 1);
      if (k < 1) done = false;
      const e = k * k * (3 - 2 * k);
      _m.compose(p.lp, p.lq, p.ls).premultiply(p.parent.matrixWorld);
      _m.decompose(_v, _q, _w);
      p.node.position.lerpVectors(p.sp, _v, e);
      p.node.position.y += Math.sin(k * Math.PI) * 0.7;
      p.node.quaternion.slerpQuaternions(p.sq, _q, e);
      if (k >= 1 && !p.home) {
        p.home = true;
        p.parent.add(p.node);
        p.node.position.copy(p.lp); p.node.quaternion.copy(p.lq); p.node.scale.copy(p.ls);
        if (i % 3 === 0) this.sfx('bone_rattle', { volume: 0.25, pitch: 1 + i * 0.05 });
      }
    });
    if (done) {
      this.broken = null;
      this.react('yay');
      this.tempExpr('sparkle', 1.2);
      this.kick('sq', 1.35);
      this.onReassembled?.();
    }
  }

  // ------------------------------------------------------------ per-frame
  update(dt, camPos) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.animT += dt;
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = this.blinkT < -0.13 ? 2 + Math.random() * 3.5 : this.blinkT;
    if (this.talking > 0) this.talking -= dt;
    if (this.tmpExpr && (this.tmpExpr.t -= dt) <= 0) this.tmpExpr = null;
    this.followPath(dt);
    // locomotion speed from movement
    if (dt > 0) {
      const mv = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / dt;
      const sp = this.speedOverride ?? (mv > 20 ? 0 : mv);
      this.speed += (sp - this.speed) * (1 - Math.exp(-12 * dt));
    }
    this.lastPos.copy(this.pos);
    if (!this.ride) this.yaw = angleDamp(this.yaw, this.targetYaw, 10, dt);
    // hop
    if (this.hopV !== 0 || this.hop > 0) {
      this.hopV -= 15 * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        if (this.hopV < -1.5) this.kick('sq', 0.72);
        this.hopV = 0;
      }
    }
    this.snapGround();
    this.computeTargets(dt);
    this.springs(dt);
    this.apply();
    if (this.ride) this.solveRide(dt);
    // upright held things (mugs, lanterns) stay level whatever the arm does
    for (const s of ['L', 'R']) {
      const h = this.held[s];
      if (!h?.userData.upright) continue;
      this.arms[s].hand.updateWorldMatrix(true, false);
      this.arms[s].hand.getWorldQuaternion(_q).invert();
      h.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
    }
    this.updateFace(dt, camPos);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / this.flashDur) * 0.65;
      this.mat.uniforms.uFlash.value = f;
      this.faceMat.uniforms.uFlash.value = f;
    }
    this.root.visible = this.visible;
    if (this.broken) this.updateBroken(dt);
    for (const c of this.cloths) { c.setVisible(this.visible); if (this.visible) c.update(dt); }
  }

  followPath(dt) {
    if (!this.path || !this.path.length) return;
    const tgt = this.path[0];
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) {
      this.path.shift();
      if (!this.path.length) {
        this.path = null;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      }
      return;
    }
    const step = Math.min(d, this.walkSpeed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.targetYaw = Math.atan2(dx, dz);
  }

  computeTargets(dt) {
    const T = this.T;
    Object.assign(T, REST);
    const P = this.P, per = this.persona;
    // chunky characters hold their arms further out
    const out = 0.1 + (this.spec.torso.belly || 0) * 0.06;
    T.aOL = T.aOR = out;
    const anim = this.anim;
    const fn = POSES[anim] || POSES.idle;
    const v = this.speed;
    const moving = v > 0.12 && !this.ride && LOCO_OK.has(anim);
    // idle fidgets
    if (anim === 'idle' && !moving && this.talking <= 0 && !this.reaction) {
      this.fidgetT -= dt;
      if (this.fidgetT < 0 && !this.fidget) {
        const list = per.fidgets;
        this.fidget = { name: list[Math.floor(Math.random() * list.length)], t: 0 };
        this.fidgetT = 5 + Math.random() * 8;
      }
    } else this.fidget = null;
    fn(this, this.animT, T);
    if (this.fidget) this.applyFidget(dt, T);
    if (this.talking > 0 && (anim === 'idle' || anim === 'talk')) this.talkGestures(T);
    if (moving) this.locomotion(dt, T, v, LOCO_ARMS.has(anim) && !this.held.R && !this.held.L);
    else this.phase = 0;
    // reactions
    if (this.reaction) {
      const r = this.reaction;
      r.t += dt;
      r.R.f?.(this, r.t, T);
      if (r.t >= r.R.d) this.reaction = null;
    }
    // look at a target / the camera
    const lt = this.lookTarget?.isVector3 ? this.lookTarget : this.lookTarget?.pos ? _w.copy(this.lookTarget.pos).setY(this.lookTarget.pos.y + (this.lookTarget.P?.neckY ?? 1.2) + (this.lookTarget.P?.hipH ?? 0)) : null;
    this.look = [0, 0];
    if (lt && !this.broken) {
      const dx = lt.x - this.pos.x, dz = lt.z - this.pos.z;
      const rel = wrapAngle(Math.atan2(dx, dz) - this.yaw - T.bodyRy);
      const yawH = clamp(rel, -1.25, 1.25);
      const headY = this.pos.y + P.hipH + P.neckY + P.headH * 0.5;
      const pitch = clamp(-Math.atan2(lt.y - headY, Math.hypot(dx, dz)), -0.45, 0.4);
      T.headY += yawH * 0.75; T.twist += yawH * 0.25; T.headX += pitch * 0.8;
      this.look = [clamp(yawH * 1.2, -1, 1), clamp(pitch * 2, -1, 1)];
    }
  }

  locomotion(dt, T, v, armsToo) {
    const P = this.P, per = this.persona;
    const legL = P.hipH;
    const style = per.walk;
    const stepLen = legL * (style === 'waddle' ? 0.55 : style === 'lumber' ? 0.7 : 0.8);
    const sps = clamp(v / stepLen, 0, style === 'waddle' ? 5.2 : 4.4);
    this.phase += sps * Math.PI * dt;
    const ph = this.phase;
    const sn = S(ph), cs = C(ph);
    const wk = clamp(v / 0.5, 0, 1);
    const run = clamp((v - 2.4) / 1.4, 0, 1);
    const A = clamp(Math.asin(clamp(stepLen / 2 / legL, 0, 0.9)), 0.2, 0.62) * wk * (1 + run * 0.35);
    if (style === 'glide') {
      T.lean += 0.12 * wk; T.bodyY += 0.12 + S(this.t * 1.6) * 0.05; T.tilt += sn * 0.03;
      return;
    }
    // legs
    const kneeA = (0.55 + run * 0.9) * wk;
    T.lFL = A * sn; T.lFR = -A * sn;
    T.kBL = 0.08 + kneeA * Math.max(0, cs); T.kBR = 0.08 + kneeA * Math.max(0, -cs);
    if (style === 'march') { T.kBL += Math.max(0, cs) * 0.5 * wk; T.kBR += Math.max(0, -cs) * 0.5 * wk; T.lFL *= 1.2; T.lFR *= 1.2; }
    // body bob & squash
    const bounce = per.bounce * (style === 'skip' ? 1.8 : style === 'bouncy' ? 1.3 : 1);
    const bob = (0.018 + v * 0.012) * bounce * wk;
    T.bodyY += (Math.abs(cs) - 0.5) * bob * 2 + run * 0.02;
    T.sq = 1 + (Math.abs(cs) - 0.5) * 0.06 * bounce * wk;
    // waddle: short legs rock side to side
    const sway = style === 'waddle' ? 0.13 : style === 'lumber' ? 0.08 : style === 'strut' ? 0.06 : 0.035;
    T.tilt += sn * sway * wk;
    T.bodyRz += sn * sway * 0.3 * wk;
    T.twist += sn * (style === 'strut' ? 0.2 : 0.1) * wk;
    T.headZ -= sn * sway * 0.6 * wk;
    T.lean += run * 0.28 + (style === 'lumber' ? 0.06 : 0) + (style === 'shamble' ? 0.25 : 0);
    if (style === 'strut') T.headX -= 0.1;
    if (style === 'slow') T.lean += 0.12;
    // arms swing opposite to legs
    if (armsToo) {
      const aa = (0.35 + run * 0.6) * wk * (style === 'march' ? 1.6 : 1);
      T.aFL = -aa * sn; T.aFR = aa * sn;
      T.eBL = 0.25 + run * 1.2 + Math.max(0, -sn) * 0.3 * wk; T.eBR = 0.25 + run * 1.2 + Math.max(0, sn) * 0.3 * wk;
      if (style === 'shamble') { T.aFL = T.aFR = 1.4; T.eBL = T.eBR = 0.1; T.aFL += sn * 0.1; T.aFR -= sn * 0.1; }
    }
    // footsteps
    const step = Math.floor(ph / Math.PI);
    if (step !== this._step) {
      this._step = step;
      this.onStep?.(this, v);
    }
  }

  talkGestures(T) {
    const t = this.t, g = this.persona.gest;
    const beat = S(t * 3.1 + this.seed) * 0.5 + S(t * 5.3) * 0.5;
    if (this.persona.idle !== 'hips' || g > 1) {
      arm(T, 'R', 0.45 + Math.max(0, beat) * 0.55 * g, 0.2 + Math.max(0, beat) * 0.3 * g, 1.25 + beat * 0.3, 0.1);
      if (g > 1.2) arm(T, 'L', 0.4 + Math.max(0, -beat) * 0.5 * g, 0.2 + Math.max(0, -beat) * 0.3, 1.2 - beat * 0.3, 0.1);
    }
    T.headX += S(t * 7.2) * 0.04 * g;
    T.headZ += S(t * 2.3) * 0.06 * g;
    T.tilt += S(t * 2.3) * 0.02 * g;
  }

  applyFidget(dt, T) {
    const f = this.fidget;
    f.t += dt;
    const t = f.t;
    const env = Math.sin(clamp(t / 1.8, 0, 1) * Math.PI);
    switch (f.name) {
      case 'look': T.headY += Math.sin(t * 1.8) * 0.8 * env; T.headX -= 0.08 * env; this.look = [Math.sin(t * 1.8), 0]; break;
      case 'stretch': if (t < 1.8) { arm(T, 'L', 0.3, 2.6 * env, 0.3); arm(T, 'R', 0.3, 2.6 * env, 0.3); T.lean -= 0.15 * env; T.jaw = 0.35 * env; } break;
      case 'scratch': arm(T, 'R', 1.0 * env + 0.2, 1.3 * env, 2.4 * env, 0.6 * env + Math.sin(t * 25) * 0.15 * env); T.headZ -= 0.15 * env; break;
      case 'tap': { const k = Math.max(0, Math.sin(t * 12)); leg(T, 'R', 0.2, 0.05, 0.1 + k * 0.25 * env); break; }
      case 'hum': T.headZ += Math.sin(t * 4) * 0.12 * env; T.tilt += Math.sin(t * 4) * 0.03 * env; break;
      case 'glasses': arm(T, 'R', 1.6 * env, 0.25, 2.5 * env, 0.6 * env); break;
      case 'hair': arm(T, 'L', 1.4 * env, 1.0 * env, 2.5 * env, 0.4); T.headZ += 0.12 * env; break;
      case 'watch': arm(T, 'L', 1.1 * env, 0.2, 1.8 * env, 0.8 * env); T.headX += 0.3 * env; T.headY += 0.25 * env; break;
      case 'salute': arm(T, 'R', 0.6 * env, 1.25 * env, 2.3 * env, 0.9 * env); break;
      case 'pipe': arm(T, 'R', 1.2 * env, 0.4, 2.2 * env, 0.5); break;
      case 'jawpop': T.jaw = Math.sin(clamp(t / 0.6, 0, 1) * Math.PI) * 0.45; if (t > 0.6 && t < 0.62) this.sfx('jaw_chatter', { volume: 0.3 }); break;
      case 'hop': if (t < 0.02) this.hopV = 2.4; break;
      case 'spin': T.bodyRy += clamp(t / 0.8, 0, 1) * TAU; break;
      default: break;
    }
    if (t > 1.9) this.fidget = null;
  }

  springs(dt) {
    const J = this.J, V = this.V, T = this.T;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const K = this.stiff, Cd = 2 * this.zeta * Math.sqrt(K);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < KEYS.length; i++) {
        const k = KEYS[i];
        const kk = k === 'sq' || k === 'headS' ? K * 1.4 : k === 'bodyRy' ? K * 2 : K;
        const cc = k === 'sq' || k === 'headS' ? Cd * 0.7 : Cd;
        V[k] += (kk * (T[k] - J[k]) - cc * V[k]) * h;
        J[k] += V[k] * h;
      }
    }
  }

  apply() {
    const J = this.J, P = this.P;
    const r = this.root;
    if (this.ride?.seat) {
      this.ride.seat.updateWorldMatrix(true, false);
      this.ride.seat.matrixWorld.decompose(r.position, r.quaternion, _w);
      this.pos.copy(r.position);
    } else {
      r.position.set(this.pos.x, this.pos.y + this.hop + this.yOffset + this.floatY, this.pos.z);
      r.rotation.set(0, this.yaw, 0);
    }
    const sq = Math.max(0.4, J.sq);
    this.squashG.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.body.position.set(0, (this.ride ? 0 : P.hipH) + J.bodyY, J.bodyZ);
    this.body.rotation.set(J.bodyRx, J.bodyRy, J.bodyRz);
    this.spine.rotation.set(J.lean, J.twist, J.tilt);
    this.neck.position.y = P.neckY + J.headUp;
    this.headJ.rotation.set(J.headX, J.headY, J.headZ);
    const hs = Math.max(0.3, J.headS);
    this.headPiece.scale.set(hs, hs, hs);
    if (this.jawJ) this.jawJ.rotation.x = Math.max(0, J.jaw + (this.mouthOpen || 0) * 0.32);
    for (const side of ['L', 'R']) {
      const a = this.arms[side], s = a.s;
      a.sh.position.y = P.shoulderY + J.shUp;
      a.sh.rotation.set(-J['aF' + side], J['aT' + side] * s, s * J['aO' + side]);
      a.elbow.rotation.set(-Math.max(0, J['eB' + side]), 0, -s * J['eI' + side]);
      const l = this.legs[side];
      l.hip.rotation.set(-J['lF' + side], 0, s * J['lO' + side]);
      l.knee.rotation.x = Math.max(0, J['kB' + side]);
    }
    if (this.skirt) {
      // the skirt flares with leg motion
      const sw = (J.lFL - J.lFR) * 0.15;
      this.skirt.rotation.set(-Math.abs(J.lFL + J.lFR) * 0.25, 0, sw);
    }
  }

  // two-bone IK onto the bike's grips and pedals
  solveRide(dt) {
    const R = this.ride;
    if (!R || this.broken) return;
    const wA = (R.ikW ?? 1) * (R.armW ?? 1), wL = (R.ikW ?? 1) * (R.legW ?? 1);
    if (wA <= 0 && wL <= 0) return;
    this.root.updateMatrixWorld(true);
    const P = this.P;
    const solve = (parent, joint, target, l1, l2, isArm, s, side) => {
      if (!target) return;
      const w = isArm ? wA : wL;
      if (w <= 0) return;
      target.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(target.matrixWorld);
      if (!isArm) _v.y += 2.5 * VS;
      parent.worldToLocal(_v);
      _v.sub(joint.position);
      let L = _v.length();
      L = clamp(L, (l1 + l2) * 0.25, (l1 + l2) * 0.995);
      const base = Math.atan2(_v.z, -_v.y);
      const outA = Math.atan2(_v.x * s, Math.hypot(_v.y, _v.z));
      const bend = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - L * L) / (2 * l1 * l2), -1, 1));
      const a1 = Math.acos(clamp((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1));
      if (isArm) {
        const f = base - a1 * 0.6, o = outA + a1 * 0.4;
        joint.rotation.set(lerpA(joint.rotation.x, -f, w), joint.rotation.y, lerpA(joint.rotation.z, s * o, w));
        const el = this.arms[side].elbow;
        el.rotation.set(lerpA(el.rotation.x, -bend, w), 0, lerpA(el.rotation.z, -s * bend * 0.35, w));
      } else {
        joint.rotation.set(lerpA(joint.rotation.x, -(base + a1), w), 0, lerpA(joint.rotation.z, s * outA, w));
        const kn = this.legs[side].knee;
        kn.rotation.x = lerpA(kn.rotation.x, bend, w);
      }
    };
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      solve(this.spine, this.arms[side].sh, R['grip' + side], P.upperL, P.foreL + 1.5 * VS, true, s, side);
      solve(this.body, this.legs[side].hip, R['pedal' + side], P.thighL, P.shinL, false, s, side);
    }
  }

  updateFace(dt, camPos) {
    // expression priority: temporary > base
    let expr = this.tmpExpr?.e || this.expr || 'neutral';
    if (this.broken) expr = 'dizzy';
    const blink = this.blinkT < 0 && expr === 'neutral' ? 1 : 0;
    // talk mouth: syllable-ish noise
    let talk = 0;
    if (this.talking > 0) {
      const n = S(this.t * 17.3) + S(this.t * 11.1 + 1.3) * 0.7 + S(this.t * 5.3) * 0.4;
      talk = n > 0.9 ? 1 : n > 0.2 ? 0.67 : n > -0.4 ? 0.33 : 0;
    }
    this.mouthOpen = this.P.skull ? talk : 0;
    this.faceTex.update({ expr, blink, talk: this.P.skull ? 0 : talk, look: this.look || [0, 0], t: this.t });
  }
}

const lerpA = (a, b, t) => a + (b - a) * t;

// handy: preload part geometry for a list of characters (avoid a hitch on first spawn)
export function preloadCharacters(ids) {
  for (const id of ids) partsFor(id);
}
export { CHARACTERS, POSES, REACT };
