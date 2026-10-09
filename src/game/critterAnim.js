// Procedural animation for the voxel wildlife (models in voxel/models/animals.js).
// The critter AI (critters.js) only moves a creature and names what it is doing
// (c.anim: 'walk', 'graze', 'hop', 'fly'...); everything else is worked out here
// from how it actually moves: gaits come from its measured speed (walk, trot,
// gallop and bound, feet planted with two-bone IK on the terrain under each
// hoof), wings flap or glide from its climb and turn rate, and every state
// change is a damped blend so nothing pops. Heads turn to look at Hank, ears and
// tails flick, chests breathe.
//
// poseCritter(c, dt, W) fills c.P (local bone offsets / rotations / scales, see
// render/voxelRig.js); W = { px, py, pz (Hank's head), h(x, z) ground height }.
import { BONE } from '../voxel/models/animals.js';
import { PS, restPose } from '../render/voxelRig.js';

const TAU = Math.PI * 2;
const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const frac = (v) => v - Math.floor(v);
// a smooth 0 -> 1 -> 0 bump over k in [0, 1]
const bump = (k) => (k > 0 && k < 1 ? Math.sin(k * PI) : 0);

// bone setters
function R(P, b, rx, ry, rz) { const o = b * PS; P[o + 3] += rx; P[o + 4] += ry; P[o + 5] += rz; }
function T(P, b, x, y, z) { const o = b * PS; P[o] += x; P[o + 1] += y; P[o + 2] += z; }
function S(P, b, x, y, z) { const o = b * PS; P[o + 6] *= x; P[o + 7] *= y; P[o + 8] *= z; }

// ---------------------------------------------------------------- shared senses
// how the creature is really moving (speed, climb, turn rate), smoothed
function sense(c, dt) {
  if (c.lx === undefined || dt <= 0) {
    c.lx = c.x; c.ly = c.y; c.lz = c.z; c.lyaw = c.yaw;
    c.mspd = 0; c.mvy = 0; c.myr = 0;
    if (dt <= 0) return;
  }
  const idt = 1 / dt;
  c.mspd = damp(c.mspd, Math.min(16, Math.hypot(c.x - c.lx, c.z - c.lz) * idt), 10, dt);
  c.mvy = damp(c.mvy, clamp((c.y - c.ly) * idt, -15, 15), 8, dt);
  c.myr = damp(c.myr, clamp(wrap(c.yaw - c.lyaw) * idt, -6, 6), 5, dt);
  c.lx = c.x; c.ly = c.y; c.lz = c.z; c.lyaw = c.yaw;
}
// head turn (yaw) and tilt (pitch) towards Hank, weighted by interest (0..1)
function look(c, W, dt, want, lim, headH, speed = 4) {
  let ty = 0, tp = 0;
  if (want > 0.01) {
    const dx = W.px - c.x, dz = W.pz - c.z;
    ty = clamp(wrap(Math.atan2(dx, dz) - c.yaw), -lim, lim) * want;
    tp = clamp(-Math.atan2(W.py - (c.y + headH), Math.hypot(dx, dz) + 0.1), -0.6, 0.5) * want;
  }
  c.lkY = damp(c.lkY || 0, ty, speed, dt);
  c.lkP = damp(c.lkP || 0, tp, speed, dt);
}
// random little twitches: ears, tails, blinks, glances
function twitch(c, dt) {
  c.earT = (c.earT ?? Math.random() * 3) - dt;
  if (c.earT < 0) { c.earT = 1.2 + Math.random() * 4; c.earK = 1; c.earS = Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? 1 : -1; }
  c.earK = Math.max(0, (c.earK || 0) - dt * 4);
  c.tailT = (c.tailT ?? Math.random() * 4) - dt;
  if (c.tailT < 0) { c.tailT = 1.5 + Math.random() * 5; c.tailK = 1; }
  c.tailK = Math.max(0, (c.tailK || 0) - dt * 2.5);
  c.glT = (c.glT ?? Math.random() * 2) - dt;
  if (c.glT < 0) { c.glT = 0.6 + Math.random() * 2.2; c.glY = (Math.random() - 0.5) * 1.6; c.glP = (Math.random() - 0.5) * 0.4; }
}
// nose-up / nose-down of the ground under a small creature (near ones only), smoothed
function slope(c, W, dt, half) {
  let p = 0;
  if (c.near && W.h && !c.air) {
    const sx = Math.sin(c.yaw) * half, sz = Math.cos(c.yaw) * half;
    p = clamp(-Math.atan2(W.h(c.x + sx, c.z + sz) - W.h(c.x - sx, c.z - sz), 2 * half), -0.5, 0.5);
  }
  c.A.sp = damp(c.A.sp || 0, p, 6, dt);
  return c.A.sp;
}
// Hank close and the creature calm enough to stare
const interest = (c, W, r) => 1 - sstep(r * 0.6, r, Math.hypot(W.px - c.x, W.pz - c.z));

// ---------------------------------------------------------------- quadrupeds
const Q = BONE.quad;
const LEGS = [[Q.FLu, Q.FLl, 1, 1], [Q.FRu, Q.FRl, -1, 1], [Q.HLu, Q.HLl, 1, 0], [Q.HRu, Q.HRl, -1, 0]];
const QEARS = [[Q.earL, 1], [Q.earR, -1]];
// gaits: phase offsets (FL, FR, HL, HR), duty factor, foot lift (x leg length), stride (x leg length)
const WALK = [0.25, 0.75, 0, 0.5, 0.62, 0.16, 1.5];
const TROT = [0, 0.5, 0.5, 0, 0.42, 0.22, 2.3];
const GALLOP = [0.55, 0.63, 0, 0.08, 0.28, 0.3, 3.6];
const _g = new Float32Array(7);
const _ft = new Float32Array(12); // foot targets x, y, z per leg
const _go = new Float32Array(4); // ground offset per foot
const LEAP = { deer: 0.42, fawn: 0.45, buck: 0.4, moose: 0.08, fox: 0.2, raccoon: 0.1 };
const GRAZE = { deer: 1.9, fawn: 1.9, buck: 1.85, moose: 1.3, fox: 1.0, raccoon: 0.8 };

// two-bone leg IK in the body's side plane; front knees bend forward, hind hocks back
function leg2(P, bu, bl, dy, dz, L1, L2, front) {
  let d = Math.hypot(dy, dz);
  const dmax = (L1 + L2) * 0.998, dmin = (L1 + L2) * 0.3;
  if (d > dmax || d < dmin) { const k = (d > dmax ? dmax : dmin) / (d || 1e-6); dy *= k; dz *= k; d = d > dmax ? dmax : dmin; }
  const a = Math.atan2(-dz, -dy);
  const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const kn = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  if (front) { P[bu * PS + 3] += a - al; P[bl * PS + 3] += kn; }
  else { P[bu * PS + 3] += a + al; P[bl * PS + 3] -= kn; }
}

function poseQuad(c, dt, W) {
  const P = c.P, m = c.sp.meta, A = c.A, kind = m.kind;
  const L = m.legLen, L1 = m.L1, L1h = m.L1h ?? m.L1, L2 = m.L2;
  const anim = c.anim;
  // ---- state weights
  A.graze = damp(A.graze || 0, anim === 'graze' ? 1 : 0, 3.5, dt);
  A.alert = damp(A.alert || 0, anim === 'alert' || anim === 'freeze' ? 1 : 0, 6, dt);
  A.sit = damp(A.sit || 0, anim === 'sit' ? 1 : 0, 4, dt);
  A.listen = damp(A.listen || 0, anim === 'listen' ? 1 : 0, 4, dt);
  A.crouch = damp(A.crouch || 0, anim === 'crouch' ? 1 : 0, 9, dt);
  A.pounce = damp(A.pounce || 0, anim === 'pounce' ? 1 : 0, 14, dt);
  A.rear = damp(A.rear || 0, anim === 'rummage' ? 1 : 0, 5, dt);
  // the pets: a hissing arched cat, a barking dog, both delighted to see Hank once he's a friend
  A.angry = damp(A.angry || 0, anim === 'angry' ? 1 : 0, 9, dt);
  A.happy = damp(A.happy || 0, anim === 'friend' ? 1 : 0, 5, dt);
  const arch = kind === 'cat' ? A.angry : 0, bark = kind === 'dog' ? A.angry * Math.pow(Math.max(0, Math.sin(c.t * 9.5)), 4) : 0;
  const v = Math.max(c.mspd, Math.abs(c.myr) * m.bodyLen * 0.3); // turning on the spot shuffles the feet too
  const vn = v / L;
  A.g = damp(A.g || 0, clamp((vn - 2) / 2, 0, 1) + clamp((vn - 6.5) / 2.5, 0, 1), 3, dt);
  const g = A.g;
  const g1 = Math.min(1, g), g2 = Math.max(0, g - 1);
  for (let k = 0; k < 7; k++) _g[k] = g2 > 0 ? lerp(TROT[k], GALLOP[k], g2) : lerp(WALK[k], TROT[k], g1);
  const duty = _g[4], lift = _g[5] * L, stride = _g[6] * L;
  const freq = clamp(v / stride, 0.55, 6.5);
  c.ph = frac((c.ph || 0) + freq * dt);
  const ph = c.ph;
  const mv = sstep(0.04, 0.4, v) * (1 - A.pounce);
  const sl = Math.min((v * duty) / freq, L * 1.4) * mv;
  const wWalk = Math.max(0, 1 - g) * mv, wTrot = Math.max(0, 1 - Math.abs(g - 1)) * mv, wGal = Math.max(0, g - 1) * mv;
  twitch(c, dt);
  const calm = 1 - Math.max(wGal, A.pounce, A.crouch);
  look(c, W, dt, interest(c, W, kind === 'moose' ? 35 : 28) * calm * (1 - A.graze * 0.8) * (anim === 'walk' ? 0.4 : 1), kind === 'raccoon' ? 1.1 : 1.3, m.headH, 3.5);
  // ---- where each foot is in its step (animal space), and the ground right under it (near creatures only)
  const hipF = m.hipF, hipH = m.hipH;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const stomp = c.stompK ? bump(c.stompK) : 0;
  for (let i = 0; i < 4; i++) {
    const isF = i < 2, hip = isF ? hipF : hipH;
    const hx = i & 1 ? -hip[0] : hip[0];
    const u = frac(ph + _g[i]);
    let fz, fy;
    if (u < duty) { fz = sl * (0.5 - u / duty); fy = 0; }
    else { const k = (u - duty) / (1 - duty); fz = sl * (-0.5 + sstep(0, 1, k)); fy = lift * Math.sin(k * PI) * mv; }
    // sitting tucks the hind feet forward under the hips; crouching gathers all four
    if (!isF) fz += L * 0.32 * A.sit + L * 0.12 * A.crouch;
    else fz -= L * 0.08 * A.crouch;
    if (isF && i === 0) fy += L * 0.22 * stomp;
    const z = hip[2] + fz;
    _ft[i * 3] = hx; _ft[i * 3 + 1] = fy; _ft[i * 3 + 2] = z;
    if (c.near && W.h) {
      // (a body rolled on a side slope swings its hanging feet sideways, downhill)
      const fx = hx + (m.standH + hip[1]) * Math.sin(A.sr || 0);
      const wx = c.x + fx * cy + z * sy, wz = c.z - fx * sy + z * cy;
      _go[i] = clamp(W.h(wx, wz) - c.y, -0.45 * L, 0.45 * L);
    } else _go[i] = 0;
  }
  const front = (_go[0] + _go[1]) * 0.5, hind = (_go[2] + _go[3]) * 0.5;
  A.sp = damp(A.sp || 0, -Math.atan2(front - hind, hipF[2] - hipH[2]), 8, dt);
  A.sr = damp(A.sr || 0, Math.atan2((_go[0] + _go[2]) - (_go[1] + _go[3]), 4 * hipF[0]) * 0.6, 8, dt);
  A.gy = damp(A.gy || 0, (front + hind) * 0.5, 8, dt);
  // ---- body: height, gait bob, leap arc, pitch
  let by = A.gy, bz = 0, bp = A.sp, br = A.sr, bw = 0;
  by -= L * 0.025 * (0.5 - 0.5 * Math.cos(ph * 2 * TAU)) * wWalk;
  br += 0.03 * Math.sin(ph * TAU) * wWalk;
  by -= L * 0.05 * (0.5 + 0.5 * Math.cos(ph * 2 * TAU)) * wTrot;
  const arc = bump((ph - 0.26) / 0.34) + 0.3 * bump((ph - 0.86) / 0.16);
  by += L * (LEAP[kind] ?? 0.15) * arc * wGal;
  bp += -0.2 * Math.sin(TAU * (ph - 0.1)) * wGal;
  const stretch = 1 + 0.06 * Math.sin(TAU * (ph - 0.2)) * wGal;
  // breathing and idle weight shifts
  const breathe = Math.sin(c.t * TAU * 0.3) * (1 - mv) * (anim === 'freeze' ? 0 : 1);
  bw += Math.sin(c.t * 0.37) * 0.03 * (1 - mv);
  // grazing dips the shoulders a touch, alert lifts the head end
  bp += 0.07 * A.graze - 0.06 * A.alert;
  // sitting (fox): haunches down, chest up; crouch (before a pounce): low and coiled
  by -= L * 0.55 * A.sit + L * 0.32 * A.crouch;
  const sitP = -0.55 * A.sit - 1.15 * A.rear + 0.1 * A.crouch;
  bp += sitP;
  // pounce: nose up on the spring, nose down into the grass
  const pk = c.pK || 0;
  bp += lerp(-0.55, 1.15, sstep(0.15, 0.85, pk)) * A.pounce;
  // rear up and sit around the hind hips so the haunches stay put
  if (A.sit + A.rear > 0.001) {
    const p = sitP, yh = hipH[1], zh = hipH[2];
    by += yh - (yh * Math.cos(p) - zh * Math.sin(p));
    bz += zh - (yh * Math.sin(p) + zh * Math.cos(p));
  }
  // crouched butt wiggle before the leap
  bw += Math.sin(c.t * 24) * 0.09 * A.crouch * sstep(0.2, 0.6, c.crK || 0);
  // an arched cat stands tall and stiff, trembling; a barking dog bounces its front end; a happy dog bounces
  by += L * 0.2 * arch + Math.abs(Math.sin(c.t * 9)) * L * 0.1 * A.happy * (kind === 'dog' ? 1 : 0);
  br += Math.sin(c.t * 40) * 0.035 * arch;
  bp -= 0.22 * bark;
  T(P, Q.body, 0, by, bz);
  R(P, Q.body, bp, bw, br);
  S(P, Q.body, 1 + breathe * 0.012 - arch * 0.06, 1 + breathe * 0.02 + arch * 0.16, stretch - arch * 0.06);
  // ---- legs: IK in the body frame from each hip to its foot target (on the ground under it)
  const cp = Math.cos(bp), sp2 = Math.sin(bp), cr = Math.cos(br), sr = Math.sin(br);
  for (let i = 0; i < 4; i++) {
    const [bu, bl, , isF] = LEGS[i];
    const hip = isF ? hipF : hipH;
    // hip in animal space: body origin + R(bp, br) * hip (rolling lifts one side's hips)
    const hy0 = hip[1], hz0 = hip[2];
    const hy = m.standH + by + (hy0 * cp - hz0 * sp2) * cr + _ft[i * 3] * sr * cp, hz = bz + hy0 * sp2 + hz0 * cp;
    // foot relative to hip, rotated back into the body frame (undo pitch, then roll)
    let dy = _ft[i * 3 + 1] + _go[i] - hy, dz = _ft[i * 3 + 2] - hz;
    const ry = dy * cp + dz * sp2, rz = -dy * sp2 + dz * cp;
    dy = ry / cr; dz = rz; // (rolled, the leg hangs aslant: a longer reach for the same drop)
    leg2(P, bu, bl, dy, dz, isF ? L1 : L1h, L2, isF);
  }
  // pounce and rummage override the legs: reach out with the front paws
  if (A.pounce > 0.01) {
    const w = A.pounce, k = pk;
    for (const [bu, bl, , isF] of LEGS) {
      const o = bu * PS + 3, ol = bl * PS + 3;
      if (isF) { P[o] = lerp(P[o], -1.5 + 0.6 * sstep(0.6, 1, k), w); P[ol] = lerp(P[ol], 0.15, w); }
      else { P[o] = lerp(P[o], 1.25 * bump(Math.min(1, k * 1.3)) + 0.2, w); P[ol] = lerp(P[ol], -0.25, w); }
    }
  }
  if (A.rear > 0.01) {
    const w = A.rear, dig = 0.5 + 0.5 * Math.sin(c.t * 2.3);
    for (const [bu, bl, side, isF] of LEGS) {
      if (!isF) continue;
      const o = bu * PS + 3, ol = bl * PS + 3;
      const scrab = Math.sin(c.t * 9 + side * 1.7) * 0.25 * dig;
      P[o] = lerp(P[o], 1.2 - 2.4 + scrab, w); P[ol] = lerp(P[ol], 0.5, w);
    }
  }
  // ---- neck & head
  const nod = 0.06 * Math.sin(ph * 2 * TAU) * wWalk + 0.05 * Math.sin(ph * 2 * TAU) * wTrot;
  const gz = A.graze * (GRAZE[kind] ?? 1.2);
  const chew = Math.sin(c.t * 9) * 0.05 * A.graze;
  const lkY = c.lkY || 0, lkP = c.lkP || 0;
  // idle glances when nobody is about
  A.gl = damp(A.gl || 0, (c.glY || 0) * (1 - Math.abs(lkY) * 2) * (1 - mv) * (1 - A.graze), 3, dt);
  const neckP = nod + gz + 0.45 * arch - 0.3 * bark - 0.25 * A.alert - bp * 0.5 * (1 - A.rear) + 0.25 * A.crouch + 0.15 * A.pounce + (0.6 + 0.3 * Math.sin(c.t * 2.3)) * A.rear * 0.8 + 0.15 * wGal;
  R(P, Q.neck, neckP, (lkY + A.gl) * 0.4, 0);
  const tilt = A.listen * 0.4 * Math.sin(c.t * 0.9 + 1) + 0.12 * A.alert * Math.sin(c.t * 0.5);
  R(P, Q.head, A.graze * 0.55 + chew + lkP - 0.25 * arch - 0.2 * bark + 0.35 * A.listen + 0.3 * A.crouch + 0.2 * A.pounce + (c.glP || 0) * (1 - mv) * 0.5, (lkY + A.gl) * 0.6, tilt);
  // ---- ears: splayed, perked forward when alert, pinned back at speed, flicking
  const ek = bump(c.earK);
  const eb = 0.6 * wGal + 0.4 * A.pounce - 0.2 * A.alert - 0.3 * A.listen + 1.1 * arch + (kind === 'dog' ? 0.25 * Math.sin(c.t * 9) * A.happy : 0);
  for (const [b, s] of QEARS) {
    const fl = c.earS === 0 || c.earS === s ? ek : 0;
    R(P, b, -eb - fl * 0.5 + (m.earTilt || 0), s * (0.2 + fl * 0.4), s * -(m.earSplay - 0.25 * A.alert + 0.3 * A.graze));
  }
  // ---- tail
  const tk = bump(c.tailK);
  const flag = kind === 'deer' || kind === 'fawn' || kind === 'buck' ? Math.max(wGal, A.alert * 0.4) : 0;
  A.flag = damp(A.flag || 0, flag, 6, dt);
  let tx = -m.tailDroop + A.flag * (m.tailDroop + 1.5), tyw = 0, t2 = 0;
  let t2y = 0;
  const pet = kind === 'cat' || kind === 'dog';
  if (kind === 'fox' || kind === 'raccoon' || pet) {
    tx += 0.4 * wGal + 0.25 * A.alert + 0.5 * A.pounce + 0.25 * A.crouch;
    tyw = Math.sin(ph * TAU) * 0.18 * (wWalk + wTrot) + Math.sin(c.t * 1.3) * 0.12 * (1 - mv) + tk * 0.35 + Math.sin(c.t * 16) * 0.2 * A.crouch;
    t2 = -0.25 + 0.15 * Math.sin(ph * TAU - 1) * mv + 0.25 * wGal;
    t2y = tyw * 0.6;
    if (pet) {
      // a cat's tail is a question mark (bolt upright and bushy when cross); a dog's wags
      tx += 0.45 * A.angry - 0.5 * wGal;
      tyw += kind === 'dog' ? 0.8 * Math.sin(c.t * 19) * A.happy + 0.3 * Math.sin(c.t * 14) * A.angry : 0.15 * Math.sin(c.t * 0.9) * (1 - arch);
      t2 = kind === 'cat' ? 0.6 * (1 - arch) + 0.12 * Math.sin(c.t * 1.7) : 0.15;
      t2y = tyw * 0.4;
      S(P, Q.tail, 1 + 0.7 * arch, 1 + 0.7 * arch, 1);
    }
    // sitting or rearing: the brush lies along the ground and curls round the feet
    const low = Math.max(A.sit, A.rear);
    if (low > 0.001) {
      tx = lerp(tx, -sitP - 0.15, low); tyw = lerp(tyw, 1.15 * A.sit + 0.1 * Math.sin(c.t * 1.1), low);
      t2 = lerp(t2, 0.12, low); t2y = lerp(t2y, 0.85 * A.sit + 0.06 * Math.sin(c.t * 1.4), low);
    }
  } else tyw = tk * 0.5 * Math.sin(c.t * 30) + Math.sin(ph * TAU) * 0.1 * mv;
  R(P, Q.tail, tx, tyw, 0);
  R(P, Q.tail2, t2, t2y, 0);
  // the stomp: a nervous deer lifts a forehoof and slams it down
  if (anim === 'alert' && !c.stompK && Math.random() < dt * 0.35) c.stompK = 0.001;
  if (c.stompK) { c.stompK += dt * 2.2; if (c.stompK >= 1) c.stompK = 0; }
}

// ---------------------------------------------------------------- rabbits, squirrels, chipmunks, mice
const H = BONE.hopper;
const HEARS = [[H.earL, 1], [H.earR, -1]];
// one bound of a hopping gait at k in [0, 1], amount a
function bound(P, k, a, m) {
  const st = Math.sin(k * PI);
  const q = bump((k - 0.8) / 0.2);
  R(P, H.body, -0.35 * Math.sin(k * TAU) * a, 0, 0);
  S(P, H.body, 1 + 0.06 * q * a, 1 - (0.1 * st + 0.14 * q) * a, 1 + 0.2 * st * a);
  R(P, H.foreL, -0.95 * st * a, 0, 0); R(P, H.foreR, -0.95 * st * a, 0, 0);
  const kick = 1.05 * bump(Math.min(1, k * 1.6)) * a;
  R(P, H.hindL, kick, 0, 0); R(P, H.hindR, kick, 0, 0);
  R(P, H.earL, -0.5 * st * a, 0, 0); R(P, H.earR, -0.5 * st * a, 0, 0);
  return st * m.bodyH * 0.4 * a;
}
function poseHopper(c, dt, W) {
  const P = c.P, m = c.sp.meta, A = c.A, kind = m.kind;
  const anim = c.anim;
  twitch(c, dt);
  const climbing = anim === 'climb' || anim === 'perch';
  A.climb = damp(A.climb || 0, climbing ? 1 : 0, 12, dt);
  A.alert = damp(A.alert || 0, anim === 'alert' ? 1 : 0, 7, dt);
  A.eat = damp(A.eat || 0, anim === 'eat' || anim === 'nibble' ? 1 : 0, 5, dt);
  A.sitUp = damp(A.sitUp || 0, kind === 'rabbit' ? 0 : anim === 'idle' ? 0.55 : anim === 'eat' ? 0.95 : 0, 5, dt);
  A.run = damp(A.run || 0, anim === 'run' || anim === 'climb' ? 1 : 0, 8, dt);
  A.hop = damp(A.hop || 0, anim === 'hop' ? 1 : 0, 14, dt);
  const v = c.mspd;
  // running: a continuous bounding gait
  const freq = clamp(v / (m.bodyLen * 2.4), 2.5, 9);
  c.ph = frac((c.ph || 0) + freq * dt * (A.run > 0.05 ? 1 : 0));
  let lift = 0;
  if (A.run > 0.01) lift += bound(P, c.ph, A.run * (anim === 'climb' ? 0.8 : 1), m);
  if (A.hop > 0.01) bound(P, c.hopK || 0, A.hop, m); // the AI lifts the body for hops (c.bob)
  look(c, W, dt, interest(c, W, 18) * (1 - A.run) * (1 - A.hop) * (1 - A.climb), 1.2, m.headH, 6);
  // body posture: sit up (around the hind feet), nibble low, breathe
  const breathe = Math.sin(c.t * TAU * 0.9) * (1 - A.run);
  const up = -0.95 * Math.max(A.alert, A.sitUp) - 0.12 * (1 - A.run) * (kind === 'rabbit' ? 1 : 0) + 0.12 * A.eat * (kind === 'rabbit' ? 1 : 0);
  const zh = -m.bodyLen * 0.25, yh = -m.bodyH * 0.2;
  let by = lift + (yh - (yh * Math.cos(up) - zh * Math.sin(up)));
  let bz = zh - (yh * Math.sin(up) + zh * Math.cos(up));
  let bp = up + slope(c, W, dt, m.bodyLen * 0.5) * (1 - A.climb);
  // climbing a trunk: nose up, belly on the bark (the AI faces it at the tree)
  if (A.climb > 0.001) {
    const w = A.climb;
    by = lerp(by, -m.standH + (anim === 'perch' ? 0 : lift * 0.3), w);
    bz = lerp(bz, -m.bodyH * 0.55, w);
    bp = lerp(bp, -PI / 2 + (anim === 'perch' ? 0.18 : 0), w);
  }
  T(P, H.body, 0, by, bz);
  R(P, H.body, bp, 0, 0);
  S(P, H.body, 1 + breathe * 0.025, 1 + breathe * 0.035, 1);
  // head: keep it level when sitting up; nibbling and looking
  const sniff = Math.sin(c.t * 15) * 0.03 * (Math.sin(c.t * 0.7) > 0.3 ? 1 : 0) * (1 - A.run);
  const nib = Math.sin(c.t * 14) * 0.08 * A.eat;
  A.gl = damp(A.gl || 0, (c.glY || 0) * (1 - A.run) * (1 - A.eat), 6, dt);
  const level = -bp * (1 - A.climb) * 0.85;
  if (A.climb > 0.5) R(P, H.head, -0.45 * (anim === 'perch' ? 1 : 0.3), 0, Math.sin(c.t * 0.8) * 0.6 * (anim === 'perch' ? 1 : 0));
  else R(P, H.head, level + (c.lkP || 0) + 0.45 * A.eat * (kind === 'rabbit' ? 1 : 0.2) + nib + 0.2 * A.run, (c.lkY || 0) + A.gl * 0.7, 0);
  S(P, H.head, 1, 1, 1 + sniff);
  // ears: up when alert, laid back when nibbling or running, flicking
  const ek = bump(c.earK);
  for (const [b, s] of HEARS) {
    const fl = c.earS === 0 || c.earS === s ? ek : 0;
    R(P, b, -m.earBack * (1 - A.alert) - 0.5 * A.eat * (kind === 'rabbit' ? 1 : 0) - 0.35 * A.run + fl * 0.4, s * (0.15 + fl * 0.5), s * -(0.18 - 0.12 * A.alert));
  }
  // forepaws to the mouth when eating (with the acorn), tucked when sitting up
  const paws = -1.25 * A.eat * (kind === 'rabbit' ? 0 : 1) - 0.6 * Math.max(A.alert, A.sitUp) * (1 - A.eat);
  R(P, H.foreL, paws, 0, 0); R(P, H.foreR, paws, 0, 0);
  const nutOn = kind !== 'rabbit' && anim === 'eat' ? 1 : 0.001;
  S(P, H.nut, nutOn, nutOn, nutOn);
  // hind feet stay flat on the ground when sitting up
  if (A.run < 0.5 && A.hop < 0.5) { R(P, H.hindL, -bp * 0.9 * (1 - A.climb), 0, 0); R(P, H.hindR, -bp * 0.9 * (1 - A.climb), 0, 0); }
  // tail: plume curled up the back with flicks, streaming when running, hanging when climbing
  const tk = bump(c.tailK);
  if (kind === 'squirrel' || kind === 'chipmunk') {
    const fl = tk * Math.sin(c.tailK * 18) * 0.5;
    const tx = lerp(lerp(-0.25 - bp * 0.6, -1.25 + 0.15 * Math.sin(c.ph * TAU), A.run), -1.6, A.climb);
    R(P, H.tail, tx + fl * 0.4, 0, 0);
    R(P, H.tail2, lerp(0.85, 0.25 * Math.sin(c.ph * TAU - 1.2), Math.max(A.run, A.climb)) + fl, 0, 0);
  } else if (kind === 'mouse') R(P, H.tail, 0.15 * Math.sin(c.t * 3) - 0.1, Math.sin(c.t * 7) * 0.4, 0);
  else R(P, H.tail, tk * 0.5, tk * Math.sin(c.tailK * 20) * 0.3, 0);
}

// ---------------------------------------------------------------- birds (and bats)
const B = BONE.bird;
const WINGS = [[B.wingL, B.wingL2, 1], [B.wingR, B.wingR2, -1]];
function poseBird(c, dt, W) {
  const P = c.P, m = c.sp.meta, A = c.A, kind = m.kind;
  const anim = c.anim;
  twitch(c, dt);
  const flying = anim === 'fly' || anim === 'glide' || kind === 'bat';
  A.fly = damp(A.fly || 0, flying ? 1 : 0, flying ? 7 : 5, dt);
  A.glide = damp(A.glide || 0, anim === 'glide' || c.glide ? 1 : 0, 3, dt);
  A.dab = damp(A.dab || 0, anim === 'dabble' ? 1 : 0, 2.5, dt);
  A.hop = damp(A.hop || 0, anim === 'hop' ? 1 : 0, 16, dt);
  const fly = A.fly, up = m.upright;
  // ---- flapping: phase from the species' wingbeat; songbirds flap in bursts and dip (bounding flight)
  const burst = m.hop && !up && kind !== 'crow' ? (frac(c.t * 1.4 + (c.id || 0) * 0.37) < 0.62 ? 1 : 0) : 1;
  A.burst = damp(A.burst ?? 1, burst, 12, dt);
  const flap = (1 - A.glide) * A.burst;
  c.fph = frac((c.fph || 0) + m.flapHz * dt * (0.7 + 0.3 * flap) * (flying ? 1 : 0.6));
  const f = c.fph * TAU + 0.35 * Math.sin(c.fph * TAU); // a quick downstroke and a slower recovery
  const amp = kind === 'bat' ? 1.05 : kind === 'goose' || kind === 'gull' ? 0.75 : 0.9;
  const wz = lerp(0.12, 0.15 + amp * Math.sin(f), flap);
  const wz2 = lerp(-0.06, amp * 0.55 * Math.sin(f - 0.9) - (kind === 'bat' ? 0.25 : 0), flap);
  const sweep = lerp(0, 0.18 * Math.cos(f), flap);
  // ---- body attitude in the air: climb pitch, bank into turns, bob against the beat
  const hs = Math.max(1, c.mspd);
  const climb = clamp(-Math.atan2(c.mvy, hs) * 0.7, -0.6, 0.6);
  const bank = clamp(-c.myr * 0.35, -0.75, 0.75) + (c.bankAdd || 0);
  const flyBob = -Math.sin(f) * m.bodyH * 0.12 * flap;
  // ---- on the ground: posture, pecks, hops, head snaps, tail flicks
  const peck = anim === 'peck' ? Math.pow(Math.max(0, Math.sin(c.t * 7.5 + (c.id || 0))), 6) : 0;
  const caw = c.cawK > 0 ? bump(c.cawK) : 0;
  if (c.cawK > 0) c.cawK = Math.max(0, c.cawK - dt * 2.5);
  const standP = kind === 'crow' || kind === 'gull' || kind === 'goose' ? -0.12 : m.hop ? -0.28 : 0;
  // ducks tip up to feed
  const dab = A.dab;
  const swim = m.swim ? 1 - fly : 0;
  const bob = swim * (0.04 * Math.sin(c.t * 2.1) + 0.03 * Math.sin(c.t * 1.3 + 1));
  let bp = lerp(standP + 0.45 * peck + 0.25 * caw + (m.swim ? 0 : slope(c, W, dt, m.bodyLen * 0.5)), climb, fly) + dab * 1.75 * swim + bob * 0.5;
  // take-off: a steep, flappy climb for a moment
  bp -= 0.45 * fly * (1 - sstep(0, 0.6, c.flyT ?? 9)) * (flying ? 1 : 0);
  if (up) bp += 1.2 * fly;
  let br = bank * fly + swim * 0.04 * Math.sin(c.t * 1.7 + 2);
  let by = flyBob;
  if (swim) by += -m.standH + m.bodyH * 0.12 + Math.sin(c.t * 2.4) * 0.008 + dab * m.bodyH * 0.25;
  T(P, B.body, 0, by, 0);
  R(P, B.body, bp, 0, br);
  const fluff = c.fluffK > 0 ? bump(c.fluffK) : 0;
  if (c.fluffK > 0) c.fluffK = Math.max(0, c.fluffK - dt * 1.5);
  else if (up && Math.random() < dt * 0.05) c.fluffK = 1;
  const breathe = Math.sin(c.t * TAU * 0.8) * 0.02 * (1 - fly);
  S(P, B.body, 1 + breathe + fluff * 0.12, 1 + breathe + fluff * 0.08, 1 - fluff * 0.03);
  // ---- head: owls stare and turn all the way round; songbirds snap between glances
  const lim = up ? 2.6 : 1.4;
  look(c, W, dt, interest(c, W, up ? 30 : 16) * (1 - fly) * (1 - dab), lim, m.headH, up ? 3 : 9);
  const snap = m.hop && !fly ? 22 : 5;
  A.hy = damp(A.hy || 0, (c.glY || 0) * (1 - fly) * (up ? 0.3 : 1), snap, dt);
  A.hp = damp(A.hp || 0, (c.glP || 0) * (1 - fly), snap, dt);
  const owlBob = up ? Math.sin(c.t * 1.9) * 0.22 * interest(c, W, 18) : 0;
  const neckF = kind === 'goose' ? 1.3 * fly : 0;
  R(P, B.neck, neckF + 0.15 * caw, 0, 0);
  R(P, B.head, -bp * (1 - dab * swim) * 0.75 - neckF + (c.lkP || 0) + A.hp + 0.4 * peck + 0.2 * caw, (c.lkY || 0) + A.hy, owlBob);
  if (kind === 'mallard' || kind === 'duckHen') T(P, B.head, 0, 0, Math.sin(c.t * 4.2) * 0.008 * swim * (1 - dab));
  // owls blink (sometimes twice)
  if (up) {
    c.blT = (c.blT ?? 2) - dt;
    if (c.blT < 0) { c.blT = Math.random() < 0.25 ? 0.25 : 2 + Math.random() * 4; c.blK = 1; }
    c.blK = Math.max(0, (c.blK || 0) - dt * 7);
    const lid = Math.max(0.001, bump(c.blK));
    S(P, B.lids, 1, lid, 1);
  }
  // ---- wings
  const hopK = c.hopK || 0;
  const flick = 0.5 * bump(hopK) * A.hop + 0.25 * caw;
  for (const [b, b2, s] of WINGS) {
    // folded: span back along the flank (or down the side of an upright owl), arm tucked
    const fx = up ? 0 : PI / 2, fy = up ? 0 : -PI / 2, fz = up ? -PI / 2 : 0;
    // songbirds tuck their wings between bursts of flapping
    const open = fly * lerp(0.3, 1, A.burst);
    R(P, b, lerp(fy, 0, open), s * lerp(fx, sweep, open), s * lerp(fz + flick, wz, open));
    T(P, b, s * m.bodyH * 0.06 * (1 - open), 0, 0);
    const tuck = lerp(0.4, 1, open);
    S(P, b, tuck, 1, 1);
    R(P, b2, 0, 0, s * lerp(0, wz2, open));
    S(P, b2, 1 / tuck, 1, 1);
  }
  // ---- tail: flicks on the ground, fans out to glide and steer
  const tk = bump(c.tailK);
  R(P, B.tail, (up ? -1.25 : 0.1) + tk * 0.45 * Math.sin(c.tailK * 12) * (1 - fly) + 0.15 * peck - 0.3 * dab + 0.12 * fly, bank * 0.3 * fly + Math.sin(c.t * 11) * 0.35 * dab, 0);
  S(P, B.tail, 1 + 0.45 * Math.max(A.glide, Math.abs(bank) * 0.6) * fly, 1, 1);
  // ---- legs: tucked back in flight, springy on hops, paddling when tipped up
  R(P, B.legs, 1.25 * fly + (m.swim ? 0.7 * Math.sin(c.t * 9) * dab : 0), 0, 0);
  S(P, B.legs, 1, 1 - 0.3 * (bump(hopK / 0.2) + bump((hopK - 0.8) / 0.2)) * A.hop, 1);
}

// ---------------------------------------------------------------- frog
const F = BONE.frog;
const FLEGS = [[F.thighL, F.shinL, F.foreL, 1], [F.thighR, F.shinR, F.foreR, -1]];
function poseFrog(c, dt, W) {
  const P = c.P, A = c.A;
  A.leap = damp(A.leap || 0, c.anim === 'leap' ? 1 : 0, 18, dt);
  const k = c.lK || 0, w = A.leap;
  const ext = sstep(0, 0.18, k) * (1 - sstep(0.7, 1, k)) * w;
  // croaking: the throat balloons in little runs
  c.crT = (c.crT ?? Math.random() * 5) - dt;
  if (c.crT < -1.4) c.crT = 3 + Math.random() * 6;
  const puff = c.crT < 0 ? Math.max(0, Math.sin(c.t * 10)) : 0;
  const breathe = Math.sin(c.t * TAU * 1.1) * 0.03;
  R(P, F.body, -0.25 - 0.5 * Math.sin(k * TAU) * w * 0.6 + 0.1 * (1 - w), 0, 0);
  S(P, F.body, 1 - 0.05 * ext, 1 + breathe - 0.1 * bump((k - 0.82) / 0.18) * w, 1 + 0.18 * ext);
  S(P, F.throat, 1 + 0.5 * puff, 1 + 0.7 * puff + breathe * 2, 1 + 0.4 * puff);
  for (const [th, sh, fo, s] of FLEGS) {
    R(P, th, 0.25 + 0.3 * ext, s * (0.35 + 2.2 * ext), 0);
    R(P, sh, 0, -s * (0.2 + 2.5 * ext), 0);
    R(P, fo, 0.3 - 1.2 * ext, 0, s * -0.15);
  }
}

// ---------------------------------------------------------------- trout & salmon
const FI = BONE.fish;
function poseFish(c, dt) {
  const P = c.P;
  const w = Math.sin(c.t * 17), w2 = Math.sin(c.t * 17 - 1.2);
  R(P, FI.body, -Math.atan2(c.vy || 0, Math.hypot(c.vx || 0, c.vz || 0) + 0.01), 0, Math.sin(c.t * 4) * 0.25);
  R(P, FI.mid, -0.16, 0.3 * w, 0);
  R(P, FI.tail, -0.22, 0.5 * w2, 0);
}

// ---------------------------------------------------------------- butterflies & dragonflies
const BG = BONE.bug;
const DWINGS = [[BG.wingL, 1, 0], [BG.wingR, -1, 0], [BG.wingL2, 1, 1.6], [BG.wingR2, -1, 1.6]];
function poseBug(c, dt) {
  const P = c.P, A = c.A, kind = c.sp.meta.kind;
  if (kind === 'dragonfly') {
    const a = c.t * TAU * 21;
    const dart = c.state === 'dart' ? 1 : 0;
    A.dart = damp(A.dart || 0, dart, 8, dt);
    R(P, BG.body, 0.18 * A.dart - 0.05 + Math.sin(c.t * 3) * 0.04, 0, Math.sin(c.t * 2.2) * 0.06);
    for (const [b, s, o] of DWINGS) R(P, b, 0, s * (o ? -0.25 : 0.2), s * (0.1 + 0.32 * Math.sin(a + o)));
    return;
  }
  const rest = c.state === 'rest' ? 1 : 0;
  A.rest = damp(A.rest || 0, rest, 6, dt);
  c.fph = frac((c.fph || 0) + dt * (7 + Math.sin(c.t * 0.9) * 2) * (1 - A.rest));
  // flap-glide: a few beats, then a short sail with the wings held up
  const sail = frac(c.t * 0.45 + (c.id || 0) * 0.3) > 0.78 ? 1 : 0;
  A.sail = damp(A.sail || 0, sail, 10, dt);
  const beat = 0.5 + 0.5 * Math.sin(c.fph * TAU);
  const fly = lerp(beat * 1.45 - 0.15, 0.45, A.sail);
  const perch = 1.35 - 0.55 * (0.5 + 0.5 * Math.sin(c.t * 1.6));
  const a = lerp(fly, perch, A.rest);
  R(P, BG.body, -0.25 * (1 - A.rest) + 0.1 * Math.sin(c.fph * TAU) * (1 - A.rest), 0, 0);
  T(P, BG.body, 0, -0.012 * beat * (1 - A.rest) * (1 - A.sail), 0);
  R(P, BG.wingL, 0, 0.1, a); R(P, BG.wingR, 0, -0.1, -a);
}

// ---------------------------------------------------------------- beaver
const SW = BONE.swim;
function poseSwim(c, dt) {
  const P = c.P;
  const s = c.slapK > 0 ? 1 - c.slapK : 0; // 0 -> 1 through a tail slap
  const raise = s < 0.55 ? sstep(0, 0.55, s) : 1 - sstep(0.55, 0.68, s);
  T(P, SW.body, 0, -0.1 + Math.sin(c.t * 1.8) * 0.01 - 0.05 * raise, 0);
  R(P, SW.body, 0.06 * Math.sin(c.t * 1.8) - 0.12 * raise, 0, 0);
  R(P, SW.head, -0.25 + Math.sin(c.t * 1.8 + 0.6) * 0.06, Math.sin(c.t * 0.5) * 0.25, 0);
  R(P, SW.tail, 1.4 * raise + 0.08 * Math.sin(c.t * 3), 0.25 * Math.sin(c.t * 2.6) * (1 - raise), 0);
}

// ---------------------------------------------------------------- the raccoon's bin
const BN = BONE.bin;
function poseBin(c, dt) {
  const P = c.P, A = c.A;
  A.rum = damp(A.rum || 0, c.rum ? 1 : 0, 4, dt);
  const r = A.rum;
  R(P, BN.can, 0, 0, Math.sin(c.t * 11) * 0.025 * r * (Math.sin(c.t * 1.7) > 0 ? 1 : 0.3));
  R(P, BN.lid, -(0.35 + 0.12 * Math.sin(c.t * 6)) * r - (c.tipped || 0) * 1.6, 0, 0);
}

const POSERS = { quad: poseQuad, hopper: poseHopper, bird: poseBird, frog: poseFrog, fish: poseFish, bug: poseBug, swim: poseSwim, bin: poseBin };

export function poseCritter(c, dt, W) {
  restPose(c.P);
  sense(c, dt);
  POSERS[c.sp.arch](c, dt, W);
}
