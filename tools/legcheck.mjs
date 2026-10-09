// node tools/legcheck.mjs [-v] [kind,...]
// Headless check that the quadrupeds' legs stay attached to their bodies. Every species is
// posed by the game's own animator (game/critterAnim.js) through each of its animations on
// flat ground and on slopes, and for every frame and every leg it measures, in voxels:
//   hip   the top of the upper leg (its whole top face, corners included) is inside the body
//   knee  the top of the lower leg is inside the upper leg (no gap at the knee)
//   back  no leg voxel pokes out through the top of the body
//   foot  standing feet reach the ground (a planted hoof is never left hanging in the air)
// and, first, for every species (not only the quadrupeds), that the drawn puppet is wired the
// way it is posed: each vertex, skinned the way the shader does it (its "bone" attribute picks
// a matrix out of the pose texture), lands where its own part's matrix puts it.
import { SPECIES, rigDef, BONE } from '../src/voxel/models/animals.js';
import { PS, MS, composePose, RigSpecies, restPose } from '../src/render/voxelRig.js';
import { meshVox } from '../src/voxel/mesh.js';
import { poseCritter } from '../src/game/critterAnim.js';

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const only = args.find((a) => !a.startsWith('-'))?.split(',');
const QUADS = (only || ['deer', 'fawn', 'buck', 'moose', 'fox', 'raccoon', 'duchess', 'biscuit']).filter((k) => SPECIES[k]);
const Q = BONE.quad;
const LEGS = [['FLu', 'FLl'], ['FRu', 'FRl'], ['HLu', 'HLl'], ['HRu', 'HRl']];
// [anim, speed (m/s, as the AI moves them), extra]
const ANIMS = [['idle', 0], ['walk', 1.2], ['trot', 3.2], ['run', 9.5], ['graze', 0], ['alert', 0], ['turn', 0, { turn: 2.5 }]];
const EXTRA = {
  fox: [['sit', 0], ['listen', 0], ['crouch', 0, { crK: 1 }], ['pounce', 2.2, { pK: 'sweep' }], ['run', 8]],
  raccoon: [['rummage', 0], ['freeze', 0], ['run', 5]],
  duchess: [['sit', 0], ['angry', 0], ['friend', 1.5], ['run', 5]],
  biscuit: [['sit', 0], ['angry', 0], ['friend', 2], ['run', 6]],
};
const GROUNDS = [
  ['flat', () => 0],
  ['slope up 25deg', (x, z) => z * 0.47],
  ['slope across 25deg', (x, z) => x * 0.47],
  ['bumps', (x, z) => 0.18 * Math.sin(x * 2.1) * Math.cos(z * 1.7)],
];

// a part's solid voxels as a lookup in its own (metre) frame
function solid(part, size) {
  const { vox, origin } = part;
  return {
    vox, origin, size,
    at(lx, ly, lz) {
      const i = Math.floor(lx / size + origin[0]), j = Math.floor(ly / size + origin[1]), k = Math.floor(lz / size + origin[2]);
      return vox.get(i, j, k) !== 0 && i >= 0 && j >= 0 && k >= 0;
    },
  };
}
// apply a 3x4 row-major matrix (bone b of M) / its inverse
function xf(M, b, x, y, z, out) {
  const m = b * MS;
  out[0] = M[m] * x + M[m + 1] * y + M[m + 2] * z + M[m + 3];
  out[1] = M[m + 4] * x + M[m + 5] * y + M[m + 6] * z + M[m + 7];
  out[2] = M[m + 8] * x + M[m + 9] * y + M[m + 10] * z + M[m + 11];
  return out;
}
function inv(M, b, x, y, z, out) {
  const m = b * MS;
  const a = M[m], bb = M[m + 1], c = M[m + 2], d = M[m + 4], e = M[m + 5], f = M[m + 6], g = M[m + 8], h = M[m + 9], i = M[m + 10];
  const px = x - M[m + 3], py = y - M[m + 7], pz = z - M[m + 11];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + bb * B + c * C;
  const r = 1 / det;
  out[0] = (A * px + (c * h - bb * i) * py + (bb * f - c * e) * pz) * r;
  out[1] = (B * px + (a * i - c * g) * py + (c * d - a * f) * pz) * r;
  out[2] = (C * px + (bb * g - a * h) * py + (a * e - bb * d) * pz) * r;
  return out;
}

function species(kind) {
  const r = SPECIES[kind]();
  const def = rigDef(r);
  const nb = def.bones.length;
  const sp = { nb, parent: new Int8Array(nb), rest: new Float32Array(nb * 3), meta: r.meta, arch: r.arch, size: def.size };
  def.bones.forEach((b, i) => {
    sp.parent[i] = b.parent;
    for (let k = 0; k < 3; k++) sp.rest[i * 3 + k] = b.at[k] * def.size;
  });
  sp.parts = def.bones.map((b) => (b.part ? solid(b.part, def.size) : null));
  // the highest solid voxel of the body in each (x, z) column (for "pokes out of the back")
  const bv = sp.parts[Q.body].vox;
  sp.top = new Int16Array(bv.w * bv.d).fill(-1);
  for (let z = 0; z < bv.d; z++) for (let x = 0; x < bv.w; x++) for (let y = bv.h - 1; y >= 0; y--) if (bv.get(x, y, z)) { sp.top[z * bv.w + x] = y; break; }
  // the top of each upper and lower leg: its solid voxels in the layer just under the pivot,
  // sampled at four points a quarter voxel in from each voxel's sides (so a voxel lying on a
  // grid line of its parent isn't decided by rounding)
  sp.faces = {};
  for (const [u, l] of LEGS) {
    for (const name of [u, l]) {
      const p = sp.parts[Q[name]], v = p.vox, o = p.origin;
      const j = Math.min(v.h - 1, Math.ceil(o[1]) - 1);
      const pts = [];
      for (let k = 0; k < v.d; k++) for (let i = 0; i < v.w; i++) {
        if (!v.get(i, j, k)) continue;
        for (const [dx, dz] of [[0.25, 0.25], [0.25, -0.25], [-0.25, 0.25], [-0.25, -0.25]]) pts.push([(i + 0.5 + dx - o[0]) * sp.size, (j + 0.5 - o[1]) * sp.size, (k + 0.5 + dz - o[2]) * sp.size]);
      }
      sp.faces[name] = pts;
    }
  }
  return sp;
}

const _a = [0, 0, 0], _b = [0, 0, 0];
function measure(sp, M, c, ground, stats) {
  const size = sp.size, body = sp.parts[Q.body];
  const bv = body.vox;
  for (const [u, l] of LEGS) {
    const bu = Q[u], bl = Q[l];
    // hip: the top face of the upper leg inside the body
    let hipOut = 0;
    for (const f of sp.faces[u]) {
      xf(M, bu, f[0], f[1], f[2], _a);
      inv(M, Q.body, _a[0], _a[1], _a[2], _b);
      if (!body.at(_b[0], _b[1], _b[2])) hipOut++;
    }
    // knee: the top face of the lower leg inside the upper leg
    let kneeOut = 0;
    for (const f of sp.faces[l]) {
      xf(M, bl, f[0], f[1], f[2], _a);
      inv(M, bu, _a[0], _a[1], _a[2], _b);
      if (!sp.parts[bu].at(_b[0], _b[1], _b[2])) kneeOut++;
    }
    // back: any upper-leg voxel above the body's top surface
    let poke = 0;
    const pv = sp.parts[bu];
    for (let k = 0; k < pv.vox.d; k++) for (let j = 0; j < pv.vox.h; j++) for (let i = 0; i < pv.vox.w; i++) {
      if (!pv.vox.get(i, j, k)) continue;
      xf(M, bu, (i + 0.5 - pv.origin[0]) * size, (j + 0.5 - pv.origin[1]) * size, (k + 0.5 - pv.origin[2]) * size, _a);
      inv(M, Q.body, _a[0], _a[1], _a[2], _b);
      const x = Math.floor(_b[0] / size + body.origin[0]), y = Math.floor(_b[1] / size + body.origin[1]), z = Math.floor(_b[2] / size + body.origin[2]);
      if (x < 0 || z < 0 || x >= bv.w || z >= bv.d) continue;
      const t = sp.top[z * bv.w + x];
      if (t >= 0 && y > t) poke++;
    }
    // foot: the hoof's bottom vs the ground under it (animal space; c.y is the ground at the centre)
    const lp = sp.parts[bl];
    xf(M, bl, 0, -lp.origin[1] * size, 0, _a);
    const wx = c.x + _a[0] * Math.cos(c.yaw) + _a[2] * Math.sin(c.yaw), wz = c.z - _a[0] * Math.sin(c.yaw) + _a[2] * Math.cos(c.yaw);
    const above = (_a[1] + c.y - ground(wx, wz)) / size;
    const key = u;
    const s = stats[key] || (stats[key] = { hipOut: 0, kneeOut: 0, poke: 0, footMin: 1e9, footMax: -1e9, frames: 0 });
    s.hipOut = Math.max(s.hipOut, hipOut);
    s.kneeOut = Math.max(s.kneeOut, kneeOut);
    s.poke = Math.max(s.poke, poke);
    s.footMin = Math.min(s.footMin, above);
    s.footMax = Math.max(s.footMax, above);
    s.frames++;
  }
}

let fails = 0, checks = 0;
// ---- skinning: the pose texture row the shader reads for each vertex is its own part's
for (const kind of only || Object.keys(SPECIES)) {
  const r = SPECIES[kind]();
  const def = rigDef(r);
  const sp = new RigSpecies(kind, def, { max: 1, shadow: false });
  const P = new Float32Array(sp.nb * PS), M = new Float32Array(sp.nb * MS);
  restPose(P);
  // a distinct pose per bone so a mix-up can't hide behind identical matrices
  for (let b = 0; b < sp.nb; b++) { P[b * PS + 3] = 0.1 + b * 0.07; P[b * PS + 4] = 0.05 * b; P[b * PS + 1] = 0.01 * b; }
  composePose(sp, P, M);
  sp.begin();
  sp.push(M, 0, 0, 0, 0, 1, 1);
  const pos = sp.geometry.attributes.position.array, bone = sp.geometry.attributes.bone.array;
  // which part each vertex really belongs to: the parts are merged in bone order
  const owner = new Int16Array(pos.length / 3);
  let v0 = 0;
  def.bones.forEach((b, i) => {
    if (!b.part) return;
    const n = meshVox(b.part.vox, { size: def.size, origin: b.part.origin, jitter: 0, seed: kind.length + i }).attributes.position.count;
    owner.fill(i, v0, v0 + n);
    v0 += n;
  });
  let bad = 0, worst = 0;
  const D = sp.data, out = [0, 0, 0];
  for (let v = 0; v < owner.length; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const t = 4 + Math.round(bone[v]) * 12; // texel 1 + bone * 3, as the vertex shader fetches it
    const sx = D[t] * x + D[t + 1] * y + D[t + 2] * z + D[t + 3];
    const sy = D[t + 4] * x + D[t + 5] * y + D[t + 6] * z + D[t + 7];
    const sz = D[t + 8] * x + D[t + 9] * y + D[t + 10] * z + D[t + 11];
    xf(M, owner[v], x, y, z, out);
    const e = Math.hypot(sx - out[0], sy - out[1], sz - out[2]) || (t + 12 > D.length ? 1 : 0);
    if (e > 1e-4) { bad++; worst = Math.max(worst, e); }
  }
  checks++;
  if (bad) fails++;
  if (bad || verbose) console.log(`${bad ? 'FAIL' : 'ok  '}  ${kind.padEnd(9)} skinning: ${bad ? `${bad}/${owner.length} vertices drawn with another part's matrix (up to ${worst.toFixed(2)} m off)` : `${owner.length} vertices on their own parts`}`);
}

for (const kind of QUADS) {
  const sp = species(kind);
  const list = [...ANIMS, ...(EXTRA[kind] || [])];
  for (const [gname, ground] of GROUNDS) {
    for (const [anim, speed, extra = {}] of list) {
      const c = { kind, x: 0, y: ground(0, 0), z: 0, yaw: 0, anim: anim === 'trot' || anim === 'turn' ? 'walk' : anim, state: anim, t: 0, sp, P: new Float32Array(sp.nb * PS), M: new Float32Array(sp.nb * MS), A: {}, id: 1, bob: 0, near: true };
      const W = { px: 0, py: 1.2, pz: 30, h: ground };
      const stats = {};
      const dt = 1 / 60;
      for (let f = 0; f < 60 * 6; f++) {
        c.t += dt;
        c.z += speed * dt;
        c.yaw += (extra.turn || 0) * dt;
        c.y = ground(c.x, c.z);
        if (extra.crK) c.crK = extra.crK;
        if (extra.pK) { c.pK = (c.t % 1) / 0.75 > 1 ? 1 : (c.t % 1) / 0.75; c.bob = Math.sin(c.pK * Math.PI) * 0.75 * (kind === 'fox' ? 1 : 0); }
        poseCritter(c, dt, W);
        composePose(sp, c.P, c.M);
        if (f > 60) measure(sp, c.M, { x: c.x, y: c.y + c.bob, z: c.z, yaw: c.yaw }, ground, stats);
      }
      // feet: off the ground is fine in the swing phase, in a leap, a pounce, sitting or rearing;
      // the lowest point a foot reaches over the run must touch the ground (within a voxel and a half, a hoof on a 25 degree slope)
      const footFree = anim === 'run' || anim === 'pounce' || anim === 'rummage' || anim === 'sit' || anim === 'angry' || anim === 'friend';
      for (const [u] of LEGS) {
        const s = stats[u];
        const bad = [];
        if (s.hipOut > 0) bad.push(`hip: ${s.hipOut}/${sp.faces[u].length} points of the leg's top outside the body`);
        if (s.kneeOut > 0) bad.push(`knee: ${s.kneeOut}/${sp.faces[LEGS.find((g) => g[0] === u)[1]].length} points of the shin's top outside the upper leg`);
        if (s.poke > 0) bad.push(`${s.poke} voxels through the back`);
        if (!footFree && (s.footMin > 1.5 || s.footMin < -1.5)) bad.push(`foot never reaches the ground (lowest ${s.footMin.toFixed(1)} vox)`);
        checks++;
        if (bad.length) fails++;
        if (bad.length || verbose) console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${kind.padEnd(8)} ${anim.padEnd(8)} ${gname.padEnd(18)} ${u}  ${bad.join('; ') || `foot ${s.footMin.toFixed(1)}..${s.footMax.toFixed(1)} vox`}`);
      }
    }
  }
}
console.log(`\n${checks - fails}/${checks} leg checks passed`);
process.exit(fails ? 1 : 0);
