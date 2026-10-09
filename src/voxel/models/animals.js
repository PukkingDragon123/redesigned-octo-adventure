// Voxel wildlife: deer, fawns, bucks, moose, foxes, raccoons, rabbits, squirrels,
// chipmunks, mice, songbirds, crows, gulls, geese, ducks, owls, bats, frogs, trout,
// salmon, butterflies, dragonflies, beavers (and the raccoon's bin). Each creature
// is a few separate voxel parts on a fixed skeleton per body plan ("arch") so the
// game can pose and animate it (game/critterAnim.js) and draw all of a species in
// one instanced call (render/voxelRig.js).
//
// A builder returns { arch, size, parts: { bone: { vox, origin } }, at: { bone: [x, y, z] }, meta }:
// voxel units, +z is the front, y up; `origin` is the part's pivot inside its own
// model and `at` the pivot's place in the parent bone's frame. Every species stands
// with its feet on y = 0 in the rest pose.
import { Vox, EMIT, tone, vhash } from '../vox.js';

const INK = 0x1e1418;
const GLINT = 0xfff4e0;

// body plans: bone order and parents (the animation code indexes bones by these)
export const LAYOUT = {
  quad: [['body', null], ['neck', 'body'], ['head', 'neck'], ['earL', 'head'], ['earR', 'head'], ['tail', 'body'], ['tail2', 'tail'],
    ['FLu', 'body'], ['FRu', 'body'], ['HLu', 'body'], ['HRu', 'body'], ['FLl', 'FLu'], ['FRl', 'FRu'], ['HLl', 'HLu'], ['HRl', 'HRu']],
  hopper: [['body', null], ['head', 'body'], ['earL', 'head'], ['earR', 'head'], ['nut', 'head'], ['tail', 'body'], ['tail2', 'tail'],
    ['foreL', 'body'], ['foreR', 'body'], ['hindL', 'body'], ['hindR', 'body']],
  bird: [['body', null], ['neck', 'body'], ['head', 'neck'], ['lids', 'head'], ['wingL', 'body'], ['wingR', 'body'], ['wingL2', 'wingL'], ['wingR2', 'wingR'],
    ['tail', 'body'], ['legs', 'body']],
  frog: [['body', null], ['throat', 'body'], ['foreL', 'body'], ['foreR', 'body'], ['thighL', 'body'], ['thighR', 'body'], ['shinL', 'thighL'], ['shinR', 'thighR']],
  fish: [['body', null], ['mid', 'body'], ['tail', 'mid']],
  bug: [['body', null], ['wingL', 'body'], ['wingR', 'body'], ['wingL2', 'body'], ['wingR2', 'body']],
  swim: [['body', null], ['head', 'body'], ['tail', 'body']],
  bin: [['can', null], ['lid', 'can']],
};
// bone name -> index, per plan
export const BONE = {};
for (const [k, L] of Object.entries(LAYOUT)) BONE[k] = Object.fromEntries(L.map(([n], i) => [n, i]));

// species -> rig definition for RigSpecies ({ size, bones })
export function rigDef(r) {
  const L = LAYOUT[r.arch];
  const idx = BONE[r.arch];
  return {
    size: r.size,
    bones: L.map(([name, parent]) => ({ name, parent: parent ? idx[parent] : -1, at: r.at[name] || [0, 0, 0], part: r.parts[name] || null })),
  };
}

// ---------------------------------------------------------------- helpers
const lerp = (a, b, t) => a + (b - a) * t;
// mirror a part left <-> right
function flip({ vox, origin }) {
  const v = new Vox(vox.w, vox.h, vox.d);
  for (let z = 0; z < vox.d; z++) for (let y = 0; y < vox.h; y++) for (let x = 0; x < vox.w; x++) {
    const c = vox.data[vox.idx(x, y, z)];
    if (c) v.data[v.idx(vox.w - 1 - x, y, z)] = c;
  }
  return { vox: v, origin: [vox.w - origin[0], origin[1], origin[2]] };
}
// outermost solid voxel column on side s (+1 / -1) at (y, z)
function sideX(v, s, y, z) {
  y = Math.round(y); z = Math.round(z);
  if (s > 0) { for (let x = v.w - 1; x >= 0; x--) if (v.get(x, y, z)) return x; }
  else for (let x = 0; x < v.w; x++) if (v.get(x, y, z)) return x;
  return -1;
}
function dotSide(v, s, y, z, c) {
  const x = sideX(v, s, y, z);
  if (x >= 0) v.set(x, y, z, c);
}
// frontmost solid voxel at (x, y)
function frontZ(v, x, y) {
  x = Math.round(x); y = Math.round(y);
  for (let z = v.d - 1; z >= 0; z--) if (v.get(x, y, z)) return z;
  return -1;
}
function dotFront(v, x, y, c) {
  const z = frontZ(v, x, y);
  if (z >= 0) v.set(x, y, z, c);
}
// a glossy eye painted on both sides of a head: n x n dark with a glint in the upper front corner
function eyes(v, y, z, n = 2, iris = INK, ring = 0) {
  for (const s of [-1, 1]) {
    if (ring) for (let j = -1; j <= n; j++) for (let k = -1; k <= n; k++) dotSide(v, s, y + j, z + k, ring);
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) dotSide(v, s, y + j, z + k, iris);
    if (n > 1 && iris !== INK) dotSide(v, s, y, z + n - 1, INK); // a pupil in a coloured eye
    if (n > 1) dotSide(v, s, y + n - 1, z + n - 1, GLINT);
  }
}
// a tapered tube along a polyline of [x, y, z] points with radii
function tube(v, pts, radii, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n, r = lerp(radii[i], radii[i + 1], t);
      v.ellipsoid(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), r, r, r, col);
    }
  }
}
// a straight leg hanging from its pivot: len voxels, w wide; col(t) with t = 0 at the top, 1 at the foot.
// `above` voxels carry on up past the pivot: a stub buried in the parent (the body at the hip, the
// thigh at the knee) so however far the leg swings, its top never opens a gap at the joint
function leg(len, w, col, round = false, above = 0) {
  const v = new Vox(w, len + above, w);
  for (let y = 0; y < len + above; y++) {
    const t = Math.max(0, 1 - y / Math.max(1, len - 1));
    for (let z = 0; z < w; z++) for (let x = 0; x < w; x++) {
      // (round legs keep square corners in their last two voxels: a knuckle the shin tucks into)
      if (round && w > 2 && (x === 0 || x === w - 1) && (z === 0 || z === w - 1) && t > 0.35 && y > 1) continue;
      v.set(x, y, z, typeof col === 'function' ? col(t, x, z) : col);
    }
  }
  return { vox: v, origin: [w / 2, len, w / 2] };
}
// a leaf-shaped ear standing up from its pivot (front face inner colour)
function ear(h, w, outer, inner, tip = 0) {
  const v = new Vox(w, h, 2);
  const c = (w - 1) / 2;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const half = (w / 2) * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) + 0.15;
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - c) > half) continue;
      const edge = Math.abs(x - c) > half - 1 || y === h - 1;
      v.set(x, y, 0, tip && t > 0.75 ? tip : outer);
      v.set(x, y, 1, tip && t > 0.75 ? tip : edge || y < 1 ? outer : inner);
    }
  }
  return { vox: v, origin: [w / 2, 0, 1] };
}
const wing = (span, chord, col) => {
  const v = new Vox(span, 1, chord);
  for (let z = 0; z < chord; z++) for (let x = 0; x < span; x++) {
    const c = col(x / Math.max(1, span - 1), z / Math.max(1, chord - 1), x, z);
    if (c) v.set(x, 0, z, c);
  }
  return v;
};

// ---------------------------------------------------------------- deer, moose, fox, raccoon
// Where a leg of width w hangs from the body voxels bv (centre cx, cy, cz) at z: the lowest,
// widest pivot (no higher than the body's middle, no lower than the old fixed hips at -H * k)
// at which the leg's whole top stays buried in the body as it swings through a stride, snapped
// so the leg's voxels line up with the body's. Returns [x, y, z] from the body centre.
function hipIn(bv, cx, cy, cz, z, w, W, H, k = 0.2) {
  const inside = (x, y, zz) => !!bv.get(Math.floor(x + cx + 0.5), Math.floor(y + cy + 0.5), Math.floor(zz + cz + 0.5));
  const snap = (v, c, odd) => Math.round(v + c - (odd ? 0 : 0.5)) - c + (odd ? 0 : 0.5);
  const odd = w % 2 === 1;
  const hz = snap(z, cz, odd);
  const r = w / 2 - 0.25;
  const fits = (hx, hy) => {
    for (let a = -0.8; a <= 0.81; a += 0.2) {
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const px of [-r, 0, r]) for (const pz of [-r, 0, r]) for (const py of [-0.25, -1]) {
        if (!inside(hx + px, hy + py * ca - pz * sa, hz + py * sa + pz * ca)) return false;
      }
    }
    return true;
  };
  const y0 = snap(-H * k, cy - 0.5, true);
  for (let hy = y0; hy <= 0.5; hy += 1) {
    for (let hx = snap(W / 2 - w / 2 - 0.3, cx, odd); hx >= w / 2 + 0.4; hx -= 1) if (fits(hx, hy)) return [hx, hy, hz];
  }
  return [snap(W / 2 - w / 2 - 1, cx, odd), 0.5, hz];
}

// o: L, H, W body (voxels); neck, neckR; headLen, headW; legU, legL, legW; colours...
function quad(o) {
  const { L, H, W } = o;
  const parts = {}, at = {};
  // body
  const bv = new Vox(W + 3, H + 5 + (o.hump || 0), L + 3);
  const cx = (bv.w - 1) / 2, cy = H / 2 + 1, cz = (bv.d - 1) / 2;
  const coat = (x, y, z) => {
    const ny = (y - cy) / (H / 2), nz = (z - cz) / (L / 2);
    if (ny < -0.45 + (o.bellyUp || 0)) return o.belly;
    if (o.rump && nz < -0.8 && ny > -0.55 && ny < 0.55) return o.rump;
    if (o.bib && nz > 0.7 && ny < 0.25) return o.bib;
    if (ny > 0.62) return o.dark;
    if (o.spots && ny > 0 && nz > -0.75 && nz < 0.65 && vhash(x >> 1, y >> 1, z >> 1, 5) < 0.3 && ((x + z) & 1) === 0) return o.spots;
    return vhash(x, y, z, 11) < 0.12 ? tone(o.coat, -0.07) : o.coat;
  };
  bv.ellipsoid(cx, cy, cz, W / 2, H / 2, L / 2, coat);
  bv.ellipsoid(cx, cy + 0.4, cz + L * 0.27, W / 2, H / 2 + 0.4, L * 0.22, coat); // shoulders
  bv.ellipsoid(cx, cy + 0.7, cz - L * 0.27, W / 2 + 0.3, H / 2 + 0.7, L * 0.24, coat); // haunches
  if (o.hump) bv.ellipsoid(cx, cy + H * 0.42, cz + L * 0.24, W / 2 - 1.2, o.hump + 1.5, L * 0.2, o.dark);
  if (o.ringBack) bv.paint((x, y, z, c) => (y > cy + H * 0.3 && c === o.coat ? o.dark : undefined));
  parts.body = { vox: bv, origin: [cx + 0.5, cy + 0.5, cz + 0.5] };
  const s = o.size;
  // legs: the hips are buried in the body, found from its voxels (below), and the thigh reaches
  // down from there to a knee at the height the leg was drawn with, so the stance is unchanged
  const legW = o.legW || 2;
  const hipF = hipIn(bv, cx, cy, cz, L * 0.3, legW, W, H), hipH = hipIn(bv, cx, cy, cz, -L * 0.3, legW, W, H, 0.05);
  const uF = o.legU + hipF[1] + H * 0.2, uH = o.legU + hipH[1] + H * 0.15; // hip to knee, per pair
  const upper = (u, hy) => leg(u + 1, legW, (t, x, z) => (o.legHi && t > 0.6 ? o.legHi : t < 0.4 ? o.coat : o.legC || o.coat), true, Math.max(1, Math.min(3, Math.floor(H / 2 - hy - 2.5))));
  const lower = leg(o.legL, Math.min(2, legW), (t) => (t > 0.86 ? o.hoof : o.sock && t > (o.sockHi ?? 0.25) ? o.sock : o.legLo || o.legC || o.coat), false, 1);
  parts.FLu = parts.FRu = upper(uF, hipF[1]);
  parts.HLu = parts.HRu = upper(uH, hipH[1]);
  parts.FLl = parts.FRl = parts.HLl = parts.HRl = lower;
  at.FLu = [hipF[0], hipF[1], hipF[2]]; at.FRu = [-hipF[0], hipF[1], hipF[2]];
  at.HLu = [hipH[0], hipH[1], hipH[2]]; at.HRu = [-hipH[0], hipH[1], hipH[2]];
  at.FLl = at.FRl = [0, -uF, 0];
  at.HLl = at.HRl = [0, -uH, 0];
  // neck: rises up and forward from the shoulders
  const nl = o.neck, nr = o.neckR;
  const nv = new Vox(Math.ceil(nr * 2) + 3, nl + Math.ceil(nr * 2) + 3, nl + Math.ceil(nr * 2) + 3);
  const ncx = (nv.w - 1) / 2, nb = nr + 0.5;
  const ntop = [ncx, nb + nl * o.neckUp, nb + nl * (1 - o.neckUp * 0.6)];
  const slope = (ntop[2] - nb) / (ntop[1] - nb);
  tube(nv, [[ncx, nb, nb], ntop], [nr, nr * 0.82], (x, y, z) => {
    const fy = (y - nb) / (nl * o.neckUp), front = (z - (nb + (y - nb) * slope)) / Math.hypot(1, slope);
    if (o.collar && fy > 0.12 && fy < 0.3) return Math.abs(x - ncx) < 0.6 && front > nr * 0.6 ? 0xf2c443 : o.collar;
    if (o.bib && front > nr * 0.1 && fy > -0.2) return o.bib;
    if (o.throat && front > nr * 0.35 && fy > 0.55) return o.throat;
    return y > ntop[1] - 1 && o.mane ? o.mane : o.neckC || o.coat;
  });
  if (o.mane) tube(nv, [[ncx, nb + nr * 0.7, nb - nr * 0.5], [ncx, ntop[1] + nr * 0.4, ntop[2] - nr * 0.6]], [nr * 0.5, nr * 0.45], o.mane);
  parts.neck = { vox: nv, origin: [ncx + 0.5, nb + 0.5, nb + 0.5] };
  at.neck = [0, H * 0.25, L * 0.38];
  // head
  const head = quadHead(o);
  parts.head = head.part;
  at.head = [0, ntop[1] - nb, ntop[2] - nb];
  Object.assign(at, head.at);
  if (head.ear) { parts.earL = head.ear; parts.earR = flip(head.ear); }
  // tail (modelled pointing back; the pose droops it)
  const t = tail(o);
  parts.tail = t.tail;
  if (t.tail2) parts.tail2 = t.tail2;
  at.tail = [0, H * 0.28, -L / 2 + 0.6];
  at.tail2 = [0, 0, -t.len];
  // stand: legs nearly straight
  const standV = (o.legU + o.legL) * 0.96 + H * 0.18;
  at.body = [0, standV, 0];
  return {
    arch: 'quad', size: s, parts, at,
    meta: {
      // L1 hip to knee (front, hind), L2 knee to hoof; legLen the leg as drawn below the body (gait sizes)
      kind: o.kind, L1: uF * s, L1h: uH * s, L2: o.legL * s, legLen: (o.legU + o.legL) * s, standH: standV * s,
      hipF: hipF.map((v) => v * s), hipH: hipH.map((v) => v * s), bodyLen: L * s, bodyH: H * s,
      earSplay: o.earSplay ?? 0.55, earTilt: o.earTilt ?? 0, tailDroop: o.tailDroop ?? 1.2, headH: (standV + H * 0.3 + nl) * s,
      radius: Math.max(L, standV + nl) * 0.6 * s,
    },
  };
}

function quadHead(o) {
  const hl = o.headLen, hw = o.headW;
  const ant = o.antlers === 'moose' ? 26 : o.antlers ? 16 : 0;
  const v = new Vox(Math.max(hw + 4, ant + 4), hw + 5 + (o.antlers ? 14 : 0), hl + 5);
  const x0 = (v.w - 1) / 2;
  const sy = hw / 2 + 1.5, sz = hw * 0.5 + 0.5; // skull centre
  const muz = o.muzzle || tone(o.coat, 0.12);
  const headC = (x, y, z) => {
    if (o.mask && z > sz - 1.5 && z < sz + hw * 0.55 && y > sy - 1.2 && y < sy + 1.4) return o.mask;
    if (o.brow && z > sz && y >= sy + 1.4 && y < sy + 2.6) return o.brow;
    if (o.cheek && y < sy - 0.3 && z > sz - 1) return o.cheek;
    return o.headC || o.coat;
  };
  v.ellipsoid(x0, sy, sz, hw / 2, hw * 0.47, hw * 0.48, headC);
  // the muzzle: long for deer and moose, pointy for the fox
  const ml = hl - hw * 0.5;
  const mr = o.pointy ? hw * 0.24 : hw * 0.32;
  tube(v, [[x0, sy - hw * 0.12, sz + 0.5], [x0, sy - hw * 0.2 - (o.droop || 0) * 0.5, sz + ml * 0.6], [x0, sy - hw * 0.26 - (o.droop || 0), sz + ml]],
    [hw * 0.4, mr * 1.25, mr], (x, y, z) => (z > sz + ml * 0.55 ? muz : y < sy - hw * 0.28 && o.cheek ? o.cheek : o.headC || o.coat));
  if (o.droop) v.ellipsoid(x0, sy - hw * 0.22 - o.droop, sz + ml + 0.2, mr * 1.1, mr * 1.05, 1.6, muz); // the moose's big floppy nose
  // nose and mouth line
  const nz = frontZ(v, Math.round(x0), Math.round(sy - hw * 0.2 - (o.droop || 0)));
  for (const dx of [-0.5, 0.5]) dotFront(v, x0 + dx, sy - hw * 0.2 - (o.droop || 0) * 0.9, o.nose || INK);
  if (nz > 0 && !o.pointy) v.set(Math.round(x0), Math.round(sy - hw * 0.36 - (o.droop || 0)), nz - 1, tone(muz, -0.25));
  // eyes, high on the sides of the skull
  eyes(v, Math.round(sy), Math.round(sz + hw * 0.12), o.eye ?? 2, o.iris || INK, o.eyeRing || 0);
  if (o.cheek && o.pointy) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) dotSide(v, s, Math.round(sy - 1), Math.round(sz + 1 + k), o.cheek);
  // a moose's bell under the chin
  if (o.dewlap) tube(v, [[x0, sy - hw * 0.4, sz + 1], [x0, sy - hw * 0.4 - o.dewlap, sz + 1.5]], [1.2, 0.9], tone(o.coat, -0.1));
  if (o.antlers === 'deer') {
    for (const sd of [-1, 1]) {
      const bx = x0 + sd * 1.6, by = sy + hw * 0.4;
      const a = (k) => 0xd8c8a0 - (k ? 0x080808 : 0);
      v.line(bx, by, sz - 0.5, bx + sd * 3, by + 4, sz - 1.5, a(0), 0.55);
      v.line(bx + sd * 3, by + 4, sz - 1.5, bx + sd * 4.5, by + 8, sz + 0.5, a(0), 0.55);
      v.line(bx + sd * 4.5, by + 8, sz + 0.5, bx + sd * 4, by + 11, sz + 2.5, a(1), 0.5);
      v.line(bx + sd * 3.4, by + 5, sz - 1, bx + sd * 2.6, by + 8.5, sz + 0.5, a(1), 0.5); // tines
      v.line(bx + sd * 4.4, by + 8, sz + 0.5, bx + sd * 6.2, by + 10, sz + 0.5, a(1), 0.5);
    }
  } else if (o.antlers === 'moose') {
    for (const sd of [-1, 1]) {
      const bx = x0 + sd * 2, by = sy + hw * 0.35;
      v.line(bx, by, sz - 0.5, bx + sd * 4, by + 1.5, sz - 0.5, 0xc8b490, 0.8);
      // the palm: a broad, dished paddle reaching out to the side, tines along its rim
      for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
        if ((i > 6 || i < 1) && (j === 0 || j === 6)) continue; // rounded corners
        const px = bx + sd * (4 + i), py = by + 1.5 + i * 0.45 + (j - 3) * (j - 3) * 0.12, pz = sz - 3.5 + j;
        v.set(px, py, pz, (i * 3 + j) % 5 ? 0xd8c8a0 : 0xc8b490);
        v.set(px, py + 1, pz, 0xe0d2ae);
      }
      for (let j = 0; j < 7; j += 2) v.line(bx + sd * 12.5, by + 5.6 + (j - 3) * (j - 3) * 0.12, sz - 3.5 + j, bx + sd * 13.5, by + 8 + (j - 3) * (j - 3) * 0.12, sz - 3.5 + j, 0xe8dcbc);
      v.line(bx + sd * 4.5, by + 3, sz + 2.5, bx + sd * 4.5, by + 5, sz + 3.5, 0xe8dcbc); // a brow tine
    }
  }
  const origin = [x0 + 0.5, sy - hw * 0.35, sz - hw * 0.25];
  const at = {
    earL: [hw * 0.36, sy + hw * 0.32 - origin[1], sz - 0.8 - origin[2]],
    earR: [-hw * 0.36, sy + hw * 0.32 - origin[1], sz - 0.8 - origin[2]],
  };
  const e = o.ear ? ear(o.ear[0], o.ear[1], o.earC || o.coat, o.earIn || tone(o.coat, 0.25), o.earTip || 0) : null;
  return { part: { vox: v, origin }, at, ear: e };
}

function tail(o) {
  const T = o.tail;
  if (T === 'deer') {
    const v = new Vox(4, 2, 5);
    v.fill(0, 1, 0, 3, 1, 4, o.coat); v.fill(0, 0, 0, 3, 0, 4, o.rump || 0xf6f0e6); // white underneath, flashed when flagging
    v.clear(0, 0, 0, 0, 1, 0); v.clear(3, 0, 0, 3, 1, 0);
    return { tail: { vox: v, origin: [2, 1, 5] }, len: 5 };
  }
  if (T === 'moose') {
    const v = new Vox(3, 2, 3);
    v.fill(0, 0, 0, 2, 1, 2, o.dark);
    return { tail: { vox: v, origin: [1.5, 1, 3] }, len: 3 };
  }
  // bushy two-part tails: fox (white tip), raccoon (rings)
  const len = o.tailLen, r = o.tailR;
  const seg = (k) => {
    const v = new Vox(Math.ceil(r * 2) + 3, Math.ceil(r * 2) + 3, len + 3);
    const c = (v.w - 1) / 2;
    const col = (x, y, z) => {
      const u = (len + 1 - z) / len + k; // 0 at the base of the tail, 2 at the tip
      if (o.tail === 'coon') return Math.floor(u * 3) % 2 ? o.ring : o.dark;
      if (u > 1.55) return o.tailTip || o.coat;
      return y > c + r * 0.4 ? o.dark : o.coat;
    };
    const r0 = k ? r * 1.05 : r * 0.7, r1 = k ? r * 0.5 : r * 1.05;
    tube(v, [[c, c, len + 1], [c, c, len * 0.4 + 1], [c, c, 1]], [r0, lerp(r0, r1, 0.4) + 0.3, r1], col);
    return { vox: v, origin: [c + 0.5, c + 0.5, len + 1.5] };
  };
  return { tail: seg(0), tail2: seg(1), len: len - 0.5 };
}

const DEER = { kind: 'deer', L: 22, H: 10, W: 9, neck: 8, neckR: 2.2, neckUp: 0.78, headLen: 9, headW: 5, legU: 7, legL: 8, legW: 3, coat: 0xa86c40, dark: 0x8a5432, belly: 0xf0e0c8, rump: 0xf4ece0, throat: 0xf0e4d0, muzzle: 0xe8d8c0, nose: 0x2e2224, hoof: 0x3a2a22, legLo: 0xb8804c, ear: [6, 4], earIn: 0xe0a898, earSplay: 0.75, tail: 'deer', tailDroop: 1.25, eyeRing: 0 };
export function deer() {
  return quad({ ...DEER, size: 0.05 });
}
export function fawn() {
  return quad({ ...DEER, kind: 'fawn', size: 0.036, L: 19, H: 10, W: 8, neck: 7, neckR: 2, headLen: 9, headW: 6, legU: 7, legL: 9, coat: 0xbe6e36, dark: 0xa45a2a, spots: 0xf6ecd8, legLo: 0xc8844a, ear: [7, 4], earSplay: 0.85 });
}
export function buck() {
  return quad({ ...DEER, kind: 'buck', size: 0.053, neckR: 2.7, coat: 0x9a6034, dark: 0x7a4a2c, legLo: 0xa87040, antlers: 'deer', ear: [5, 4], earSplay: 0.95 });
}
export function moose() {
  return quad({
    kind: 'moose', size: 0.07, L: 24, H: 13, W: 11, hump: 3, neck: 6, neckR: 3.2, neckUp: 0.55, headLen: 13, headW: 6, droop: 1.6, dewlap: 4,
    legU: 9, legL: 10, legW: 3, coat: 0x4a3020, dark: 0x3a2418, belly: 0x5a3a28, muzzle: 0x5a3a2a, nose: 0x1e1418, hoof: 0x2a1e18,
    legC: 0x6a5040, legLo: 0x9a8a72, ear: [5, 3], earIn: 0x6a4a3a, earSplay: 1.15, antlers: 'moose', tail: 'moose', tailDroop: 1.3, mane: 0x342016,
  });
}
export function fox() {
  return quad({
    kind: 'fox', size: 0.026, L: 20, H: 8, W: 7, neck: 5, neckR: 2.1, neckUp: 0.7, headLen: 9, headW: 6, pointy: true, legU: 6, legL: 6, legW: 2,
    coat: 0xd8662a, dark: 0xb8501e, belly: 0xf6ecd8, bib: 0xf6ecd8, cheek: 0xf6ecd8, muzzle: 0xd8662a, nose: 0x1e1418, hoof: 0x1e1418, sock: 0x2e2222, sockHi: 0,
    ear: [6, 4], earC: 0x2e2222, earIn: 0xf6ecd8, earSplay: 0.3, tail: 'fox', tailLen: 9, tailR: 2.6, tailTip: 0xf6f0e4, tailDroop: 0.55,
  });
}
export function raccoon() {
  return quad({
    kind: 'raccoon', size: 0.026, L: 17, H: 11, W: 11, neck: 3, neckR: 3, neckUp: 0.6, headLen: 8, headW: 8, legU: 4, legL: 5, legW: 2,
    coat: 0x8a8482, dark: 0x5e585a, belly: 0xb4aea8, mask: 0x262024, brow: 0xf0ece4, cheek: 0xf0ece4, muzzle: 0xf0ece4, nose: 0x1e1418, hoof: 0x2e2a2c,
    sock: 0x3a3436, sockHi: 0.5, ear: [4, 4], earIn: 0xf0ece4, earSplay: 0.6, tail: 'coon', tailLen: 7, tailR: 2.2, ring: 0xc4beb6, tailDroop: 0.25, ringBack: true,
  });
}

// the village pets: Agnes's cat Duchess and Gus's dog Biscuit
export function cat(o = {}) {
  return quad({
    kind: 'cat', size: 0.026, L: 15, H: 7, W: 6, neck: 3, neckR: 2, neckUp: 0.75, headLen: 6, headW: 6, legU: 4, legL: 5, legW: 2,
    coat: 0xf0ece4, dark: 0xe0d8d0, belly: 0xfff8f0, cheek: 0xfff8f0, muzzle: 0xfff8f0, nose: 0xe87890, hoof: 0xf6e6e6, iris: 0x6ab8e8,
    ear: [4, 3], earIn: 0xf0a8b0, earSplay: 0.35, tail: 'fox', tailLen: 8, tailR: 1.15, tailDroop: -1.1, ...o,
  });
}
export function dog() {
  return quad({
    kind: 'dog', size: 0.028, L: 16, H: 9, W: 8, neck: 4, neckR: 2.4, neckUp: 0.7, headLen: 8, headW: 6, legU: 5, legL: 5, legW: 2,
    coat: 0xc8904a, dark: 0xb07838, belly: 0xf2e2c4, bib: 0xf2e2c4, muzzle: 0xf2e2c4, nose: 0x1e1418, hoof: 0x8a5a2e, legLo: 0xd8a466,
    ear: [5, 3], earC: 0xa8743a, earIn: 0xb88048, earSplay: 2.45, collar: 0xc8302a, tail: 'fox', tailLen: 6, tailR: 1.2, tailTip: 0xf2e2c4, tailDroop: -0.9,
  });
}

// ---------------------------------------------------------------- rabbits, squirrels, chipmunks, mice
function hopper(o) {
  const parts = {}, at = {};
  const { L, H, W } = o;
  const bv = new Vox(W + 2, H + 3, L + 3);
  const cx = (bv.w - 1) / 2, cy = H / 2 + 0.5, cz = (bv.d - 1) / 2;
  const coat = (x, y, z) => {
    const ny = (y - cy) / (H / 2), nx = (x - cx) / (W / 2);
    if (ny < -0.35 && (z - cz) > -L * 0.3) return o.belly;
    if (o.stripes && ny > 0.1) {
      const ax = Math.abs(nx);
      if (ax < 0.16 || (ax > 0.42 && ax < 0.62)) return o.stripe;
      if (ax < 0.42) return o.stripe2;
    }
    return vhash(x, y, z, 7) < 0.12 ? tone(o.coat, -0.08) : o.coat;
  };
  // a pear: round haunches at the back, narrower chest
  bv.ellipsoid(cx, cy, cz - L * 0.12, W / 2, H / 2, L * 0.38, coat);
  bv.ellipsoid(cx, cy - H * 0.05, cz + L * 0.22, W / 2 - 0.8, H / 2 - 1, L * 0.3, coat);
  // haunch thighs (part of the body) for the big hind feet to hang from
  for (const s of [-1, 1]) bv.ellipsoid(cx + s * (W / 2 - 1.2), cy - H * 0.12, cz - L * 0.22, 1.6, H * 0.36, L * 0.24, coat);
  parts.body = { vox: bv, origin: [cx + 0.5, cy + 0.5, cz + 0.5] };
  // head
  const hs = o.head;
  const hv = new Vox(hs + 3, hs + 3, hs + 4);
  const hx = (hv.w - 1) / 2, hy = hs / 2 + 1, hz = hs / 2 + 1;
  hv.ellipsoid(hx, hy, hz, hs / 2, hs * 0.46, hs / 2, (x, y, z) => (o.faceStripe && y > hy - 0.5 && y < hy + 1.5 && z > hz - 1 ? o.stripe : o.coat));
  hv.ellipsoid(hx, hy - hs * 0.12, hz + hs * 0.38, hs * 0.32, hs * 0.28, hs * 0.26, o.muzzle); // muzzle & cheeks
  if (o.cheeks) for (const s of [-1, 1]) hv.ellipsoid(hx + s * hs * 0.3, hy - hs * 0.2, hz + hs * 0.15, hs * 0.22, hs * 0.22, hs * 0.22, o.muzzle);
  dotFront(hv, hx - 0.5, hy - hs * 0.02, o.nose); dotFront(hv, hx + 0.5, hy - hs * 0.02, o.nose);
  eyes(hv, Math.round(hy), Math.round(hz + hs * 0.1), o.eye ?? 2, INK, o.eyeRing || 0);
  parts.head = { vox: hv, origin: [hx + 0.5, hy - hs * 0.3, hz - hs * 0.2] };
  at.head = [0, H * 0.32, L * 0.36];
  // ears
  if (o.ear) {
    const e = ear(o.ear[0], o.ear[1], o.coat, o.earIn, o.earTip || 0);
    parts.earL = e; parts.earR = flip(e);
    at.earL = [hs * 0.26, hs * 0.62, -hs * 0.05]; at.earR = [-hs * 0.26, hs * 0.62, -hs * 0.05];
  }
  // an acorn to nibble (shown only while eating)
  if (o.nut) {
    const n = new Vox(3, 4, 3);
    n.ellipsoid(1, 1.2, 1, 1.2, 1.4, 1.2, 0xa8743a); n.fill(0, 2, 0, 2, 3, 2, 0x6a4a2a); n.set(1, 3, 1, 0x4a3420);
    parts.nut = { vox: n, origin: [1.5, 1, 1.5] };
    at.nut = [0, -hs * 0.2, hs * 0.75];
  }
  // tail: a cotton ball, or a big bushy two-part plume curling up the back
  if (o.tail === 'cotton') {
    const t = new Vox(4, 4, 4);
    t.ellipsoid(1.5, 1.5, 1.5, 1.7, 1.7, 1.6, o.tailC);
    parts.tail = { vox: t, origin: [2, 2, 3] };
    at.tail = [0, H * 0.1, -L * 0.48];
  } else if (o.tail === 'plume') {
    const tl = o.tailLen, tr = o.tailR;
    const seg = (k) => {
      const v = new Vox(Math.ceil(tr * 2) + 3, tl + 3, Math.ceil(tr * 2) + 3);
      const c = (v.w - 1) / 2;
      const r0 = k ? tr : tr * 0.6, r1 = k ? tr * 0.75 : tr;
      tube(v, [[c, 1, c], [c, tl * 0.5 + 1, c], [c, tl + 1, c]], [r0, (r0 + r1) / 2 + 0.3, r1], (x, y, z) => {
        const edge = Math.hypot(x - c, z - c) > tr * 0.75;
        return edge ? o.tailEdge : vhash(x, y, z, 3) < 0.2 ? tone(o.tailC, -0.08) : o.tailC;
      });
      return { vox: v, origin: [c + 0.5, 1, c + 0.5] };
    };
    parts.tail = seg(0); parts.tail2 = seg(1);
    at.tail = [0, -H * 0.05, -L * 0.45]; at.tail2 = [0, tl - 0.5, 0];
  } else if (o.tail === 'string') {
    const t = new Vox(1, 1, o.tailLen);
    t.fill(0, 0, 0, 0, 0, o.tailLen - 1, o.tailC);
    parts.tail = { vox: t, origin: [0.5, 0.5, o.tailLen] };
    at.tail = [0, -H * 0.15, -L * 0.42];
  }
  // legs: short forepaws, long hind feet
  const fore = leg(o.foreLen, o.legW, (t) => (t > 0.75 ? o.paw : o.coat));
  parts.foreL = fore; parts.foreR = fore;
  at.foreL = [W * 0.22, -H * 0.15, L * 0.32]; at.foreR = [-W * 0.22, -H * 0.15, L * 0.32];
  const hf = o.footLen;
  const hv2 = new Vox(o.legW, o.hindLen, hf + 1);
  hv2.fill(0, 0, 0, o.legW - 1, o.hindLen - 1, 1, o.coat);
  hv2.fill(0, 0, 0, o.legW - 1, 0, hf, o.paw); // the long flat foot, pointing forward
  hv2.fill(0, 1, 0, o.legW - 1, 1, Math.max(1, hf - 2), o.coat);
  parts.hindL = parts.hindR = { vox: hv2, origin: [o.legW / 2, o.hindLen, 1] };
  at.hindL = [W / 2 - 1, -H * 0.15, -L * 0.2]; at.hindR = [-(W / 2 - 1), -H * 0.15, -L * 0.2];
  const standV = H * 0.15 + Math.max(o.foreLen, o.hindLen) * 0.95;
  at.body = [0, standV, 0];
  const s = o.size;
  return {
    arch: 'hopper', size: s, parts, at,
    meta: { kind: o.kind, standH: standV * s, bodyLen: L * s, bodyH: H * s, foreLen: o.foreLen * s, hindLen: o.hindLen * s, headH: (standV + H * 0.32 + hs * 0.5) * s, radius: Math.max(L, H + hs) * 0.7 * s, earBack: o.earBack ?? 0.25 },
  };
}
export function rabbit() {
  return hopper({ kind: 'rabbit', size: 0.02, L: 14, H: 10, W: 9, head: 7, coat: 0x8e7058, belly: 0xe2c8a0, muzzle: 0xe8d4b4, nose: 0xd87080, ear: [9, 3], earIn: 0xe8a0a0, earTip: 0x6a5240, earBack: 0.35,
    tail: 'cotton', tailC: 0xf6f0e6, foreLen: 4, hindLen: 4, footLen: 5, legW: 2, paw: 0xd8c4a4 });
}
export function squirrel() {
  return hopper({ kind: 'squirrel', size: 0.016, L: 12, H: 8, W: 7, head: 6, coat: 0xb85a2a, belly: 0xf2dcb8, muzzle: 0xc8703a, nose: 0x2a1a14, ear: [4, 2], earIn: 0xd8783a, earTip: 0x8a3a1a,
    eyeRing: 0xf2dcb8, eye: 1, tail: 'plume', tailLen: 8, tailR: 2.6, tailC: 0xc8642e, tailEdge: 0xe8884a, foreLen: 4, hindLen: 4, footLen: 4, legW: 1, paw: 0x8a4a22, nut: true, earBack: 0.1 });
}
export function chipmunk() {
  return hopper({ kind: 'chipmunk', size: 0.013, L: 12, H: 8, W: 7, head: 6, coat: 0xa8744a, belly: 0xf2dcb8, muzzle: 0xe8c8a0, nose: 0x2a1a14, ear: [3, 2], earIn: 0xd8a070,
    stripes: true, stripe: 0x3a2620, stripe2: 0xf0dcbc, faceStripe: true, cheeks: true, eye: 1, tail: 'plume', tailLen: 7, tailR: 1.6, tailC: 0x8a5a36, tailEdge: 0x6a4228,
    foreLen: 4, hindLen: 4, footLen: 4, legW: 1, paw: 0x6a4a2a, nut: true, earBack: 0.1 });
}
export function mouse() {
  return hopper({ kind: 'mouse', size: 0.009, L: 10, H: 6, W: 6, head: 5, coat: 0x8a7a6a, belly: 0xe8dcc8, muzzle: 0x9a8a7a, nose: 0xe88a9a, ear: [3, 3], earIn: 0xe8a0a8, eye: 1,
    tail: 'string', tailLen: 9, tailC: 0xd89a9a, foreLen: 3, hindLen: 3, footLen: 3, legW: 1, paw: 0xe8b0b0 });
}

// ---------------------------------------------------------------- birds (and the bat)
// o: L, H, W body; head; colours: back, belly, headC, cap, cheek, bib, beak; span, chord (wing), outer (second wing segment)
function bird(o) {
  const parts = {}, at = {};
  const { L, H, W } = o;
  const bv = new Vox(W + 2, H + 3, L + 3);
  const cx = (bv.w - 1) / 2, cy = H / 2 + 0.5, cz = (bv.d - 1) / 2;
  const bodyC = (x, y, z) => {
    const ny = (y - cy) / (H / 2), nz = (z - cz) / (L / 2);
    if (o.breast && ny < 0.25 && nz > -0.2) return o.breast;
    if (ny < -0.1 && nz > -0.5) return o.belly;
    if (o.under && nz < -0.55 && ny < 0) return o.under;
    if (o.mottle && vhash(x, y, z, 9) < 0.25) return o.mottle;
    if (o.streak && (x + z * 2) % 5 === 0 && ny > -0.1) return o.streak;
    return o.back;
  };
  bv.ellipsoid(cx, cy, cz, W / 2, H / 2, L / 2, bodyC);
  if (o.flatBottom) bv.carve((x, y, z) => y < cy - H * 0.32);
  parts.body = { vox: bv, origin: [cx + 0.5, cy + 0.5, cz + 0.5] };
  // neck (geese)
  if (o.neck) {
    const nv = new Vox(5, o.neck + 3, 5);
    tube(nv, [[2, 1, 2], [2, o.neck + 1, 2.5]], [o.neckR, o.neckR * 0.85], o.neckC);
    parts.neck = { vox: nv, origin: [2.5, 1, 2.5] };
  }
  at.neck = o.headAt || (o.neck ? [0, H * 0.25, L * 0.4] : [0, H * 0.28, L * 0.36]);
  // head
  const hs = o.head;
  const hv = new Vox(hs + 3, hs + 4 + (o.crest || 0) + (o.tufts ? 4 : 0), hs + 3 + o.beak);
  const hx = (hv.w - 1) / 2, hy = hs / 2 + 1, hz = hs / 2 + 1;
  const headC = (x, y, z) => {
    const ny = (y - hy) / (hs / 2), nz = (z - hz) / (hs / 2);
    if (o.cap && ny > 0.3) return o.cap;
    if (o.disc && nz > 0.2) return o.disc;
    if (o.bib && ny < -0.25 && nz > -0.3) return o.bib;
    if (o.cheek && ny > -0.45 && ny <= 0.3 && Math.abs(x - hx) > hs * 0.3 && nz > -0.4) return o.cheek;
    if (o.chin && ny < -0.1 && nz > 0 && Math.abs(x - hx) > hs * 0.15) return o.chin;
    return o.headC;
  };
  hv.ellipsoid(hx, hy, hz, hs / 2, hs * 0.48, hs / 2, headC);
  if (o.crest) tube(hv, [[hx, hy + hs * 0.4, hz], [hx, hy + hs * 0.4 + o.crest, hz - 2]], [1.2, 0.5], o.cap || o.headC);
  if (o.tufts) for (const s of [-1, 1]) hv.line(hx + s * hs * 0.32, hy + hs * 0.35, hz - 0.5, hx + s * hs * 0.42, hy + hs * 0.35 + 3.5, hz - 1, o.headC, 0.5);
  // beak
  const by = hy - (o.flatBill ? hs * 0.12 : hs * 0.05);
  for (let k = 0; k < o.beak; k++) {
    const z = Math.round(hz + hs / 2 - 0.5 + k);
    const w = o.flatBill ? (k < o.beak - 1 ? 1 : 0) : 0;
    for (let dx = -w; dx <= w; dx++) {
      hv.set(Math.round(hx) + dx, Math.round(by), z, o.beakC);
      if (k < o.beak * 0.5 || o.flatBill) hv.set(Math.round(hx) + dx, Math.round(by) - (o.flatBill ? 0 : 1), z, o.flatBill ? o.beakC : tone(o.beakC, -0.1));
      if (o.beakSpot && k === o.beak - 2) hv.set(Math.round(hx) + dx, Math.round(by) - 1, z, 0xd8483a);
    }
  }
  if (o.disc && o.glow) {
    // owl: big glowing eyes on the facial disc
    for (const s of [-1, 1]) {
      const ex = Math.round(hx + s * hs * 0.24), ey = Math.round(hy + 0.5);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (Math.abs(i) + Math.abs(j) < 2 || o.big) dotFront(hv, ex + i, ey + j, o.glow | EMIT);
      dotFront(hv, ex, ey, INK);
    }
  } else eyes(hv, Math.round(hy + hs * 0.08), Math.round(hz + hs * 0.12), o.eye ?? 1, INK, o.eyeRing || 0);
  parts.head = { vox: hv, origin: [hx + 0.5, hy - hs * 0.3, hz - hs * 0.15] };
  at.head = o.neck ? [0, o.neck - 0.5, 0.5] : [0, 0, 0];
  // owl eyelids (scaled to nothing until it blinks), just in front of the eyes
  if (o.disc && o.glow) {
    const lv = new Vox(hv.w, 3, 1);
    const ey = Math.round(hy + 0.5);
    let fz = 0;
    for (const s of [-1, 1]) {
      const ex = Math.round(hx + s * hs * 0.24);
      lv.fill(ex - 1, 0, 0, ex + 1, 2, 0, o.lidC || o.headC);
      fz = Math.max(fz, frontZ(hv, ex, ey));
    }
    parts.lids = { vox: lv, origin: [hx + 0.5, 3, -0.2] };
    at.lids = [0, ey + 2 - (hy - hs * 0.3), fz - (hz - hs * 0.15)];
  }
  // wings: modelled spread out along +x, leading edge forward; the pose folds them
  const sp = o.span, ch = o.chord;
  const wcol = (u, v, x, z) => {
    if (o.membrane) return v < 0.15 || (x % 3 === 2 && v < 0.9) ? o.bone : v > 0.9 && x % 3 !== 1 ? 0 : o.wing;
    if (v < 0.25) return o.covert || o.back;
    if (o.bar && v < 0.45 && v >= 0.25) return o.bar;
    if (o.speculum && v > 0.5 && v < 0.75 && u > 0.3) return o.speculum;
    return u > (o.outer ? 2 : 0.7) || v > 0.8 ? o.tip : o.wing;
  };
  const w1 = { vox: wing(sp, ch, wcol), origin: [0, 0.5, ch - 0.5] };
  parts.wingL = w1; parts.wingR = flip(w1);
  at.wingL = [W / 2 - 0.8, H * 0.22, L * 0.18]; at.wingR = [-(W / 2 - 0.8), H * 0.22, L * 0.18];
  if (o.outer) {
    const oc = Math.max(3, Math.round(ch * (o.membrane ? 0.95 : 0.8)));
    const w2 = { vox: wing(o.outer, oc, (u, v, x, z) => {
      if (o.membrane) return wcol(u, v, x, z);
      if (o.fingers && u > 0.6 && z % 2 === 0 && x > o.outer - 3) return 0;
      if (o.mirror && u > 0.75 && v > 0.3 && v < 0.6) return o.mirror;
      return u > 0.45 || v > 0.75 ? o.tip : o.wing;
    }), origin: [0, 0.5, oc - 0.5] };
    parts.wingL2 = w2; parts.wingR2 = flip(w2);
    at.wingL2 = [sp - 0.5, 0, 0]; at.wingR2 = [-(sp - 0.5), 0, 0];
  }
  // tail fan, pointing back
  if (o.tailLen) {
    const tw = o.tailW, tl = o.tailLen;
    const tv = new Vox(tw, 1, tl);
    for (let z = 0; z < tl; z++) for (let x = 0; x < tw; x++) {
      const narrow = z > tl * 0.6 && (x === 0 || x === tw - 1);
      if (!narrow || o.fan) tv.set(x, 0, z, o.tailTip && z < 2 ? o.tailTip : o.tailC);
    }
    if (o.curl) { tv.set((tw - 1) >> 1, 0, tl - 1, 0); }
    parts.tail = { vox: tv, origin: [tw / 2, 0.5, tl] };
    at.tail = [0, H * 0.12, -L / 2 + 1];
  }
  // legs
  if (o.legLen) {
    const lv = new Vox(W, o.legLen + 1, 4);
    for (const s of [-1, 1]) {
      const x = Math.round((W - 1) / 2 + s * Math.max(1, W * 0.18));
      lv.fill(x, 1, 1, x, o.legLen, 1, o.legC);
      lv.fill(x, 0, 0, x, 0, 3, o.legC); // toes
      if (o.webbed) lv.fill(x - 1, 0, 1, x + 1, 0, 3, o.legC);
    }
    parts.legs = { vox: lv, origin: [W / 2, o.legLen + 1, 1.5] };
  }
  const legY = o.legY ?? -H * 0.3;
  at.legs = [0, legY, L * 0.02];
  const standV = -legY + (o.legLen ? o.legLen + 1 : 0) + (o.sit ?? 0);
  at.body = [0, standV, 0];
  const s = o.size;
  return {
    arch: 'bird', size: s, parts, at,
    meta: {
      kind: o.kind, standH: standV * s, bodyLen: L * s, bodyH: H * s, span: (sp + (o.outer || 0)) * s, flapHz: o.flapHz, upright: o.upright || 0,
      headH: (standV + at.neck[1] + hs * 0.5) * s, wingAt: at.wingL.map((v) => v * s), radius: Math.max(L, (sp + (o.outer || 0)) * 2) * 0.6 * s, hop: !!o.hop, swim: !!o.swim,
    },
  };
}
const SONG = { hop: true, L: 10, H: 8, W: 7, head: 6, beak: 2, eye: 1, span: 8, chord: 6, tailLen: 6, tailW: 3, legLen: 3, legC: 0x5a4438, flapHz: 13 };
export function robin() {
  return bird({ ...SONG, kind: 'robin', size: 0.015, back: 0x6e5e54, belly: 0xe0682a, breast: 0xe0682a, under: 0xf0e4d4, headC: 0x342e32, eyeRing: 0xf0e8dc, beakC: 0xe8b030, wing: 0x6a5a50, tip: 0x4a3e38, tailC: 0x342e32 });
}
export function chickadee() {
  return bird({ ...SONG, kind: 'chickadee', size: 0.011, back: 0x8e8e94, belly: 0xe8dcc4, under: 0xd8b890, headC: 0xf0f0ec, cap: 0x2a262e, bib: 0x2a262e, cheek: 0xf6f4ee, beakC: 0x2e2a2c, wing: 0x7e7e86, tip: 0x5a5a62, bar: 0xd8d8d8, tailC: 0x6a6a72 });
}
export function bluejay() {
  return bird({ ...SONG, kind: 'bluejay', size: 0.016, back: 0x4a7ad0, belly: 0xf0f0ec, headC: 0x4a7ad0, chin: 0xf0f0ec, bib: 0x2a262e, crest: 3, cap: 0x4a7ad0, beakC: 0x2e2a2c, wing: 0x4a7ad0, tip: 0x2e4c96, bar: 0x2a262e, tailC: 0x3e6ac0, tailTip: 0xf0f0ec });
}
export function sparrow() {
  return bird({ ...SONG, kind: 'sparrow', size: 0.012, back: 0x8a6440, streak: 0x5c3e24, belly: 0xe8dcc4, headC: 0x9a9a98, cap: 0x9a4a2a, cheek: 0x9a9a98, beakC: 0x3a3230, wing: 0x8a6440, tip: 0x5c3e24, bar: 0xe8dcc4, tailC: 0x6a4a30 });
}
export function crow() {
  return bird({ kind: 'crow', hop: true, size: 0.02, L: 14, H: 10, W: 9, head: 7, beak: 4, eye: 1, back: 0x2a2832, belly: 0x2a2832, headC: 0x262430, beakC: 0x1e1a22, wing: 0x2e2c38, covert: 0x3a3a4a, tip: 0x1e1c26,
    span: 10, chord: 8, outer: 9, fingers: true, tailLen: 8, tailW: 5, fan: true, tailC: 0x24222c, legLen: 4, legC: 0x1e1a22, flapHz: 4.5 });
}
export function gull() {
  return bird({ kind: 'gull', size: 0.022, L: 15, H: 10, W: 9, head: 7, beak: 4, eye: 1, back: 0xa8b2bc, belly: 0xf0f0ec, under: 0xf0f0ec, headC: 0xf2f2ee, beakC: 0xf0c040, beakSpot: true,
    wing: 0xa8b2bc, covert: 0xb8c2ca, tip: 0x2a262e, mirror: 0xf0f0ec, span: 11, chord: 7, outer: 11, tailLen: 6, tailW: 6, fan: true, tailC: 0xf0f0ec, legLen: 4, legC: 0xe0a0a0, webbed: true, flapHz: 3 });
}
export function goose() {
  return bird({ kind: 'goose', size: 0.032, L: 20, H: 11, W: 11, head: 6, neck: 9, neckR: 1.6, neckC: 0x2a262e, beak: 3, eye: 1, flatBill: false, back: 0x8a7660, belly: 0xe2d6c0, breast: 0xd8ccb4, under: 0xf6f2ea,
    headC: 0x2a262e, chin: 0xf6f2ea, beakC: 0x2a262e, wing: 0x7a6650, covert: 0x8a7660, tip: 0x4a3e34, span: 13, chord: 9, outer: 13, tailLen: 5, tailW: 6, tailC: 0x2a262e, legLen: 5, legC: 0x2a262e, webbed: true, flapHz: 2.4 });
}
export function mallard() {
  return bird({ kind: 'mallard', swim: true, size: 0.019, L: 16, H: 9, W: 10, head: 6, beak: 3, flatBill: true, eye: 1, back: 0xa49c94, belly: 0xc8c0b8, breast: 0x7a3a2a, under: 0x2a262e, headC: 0x1e7a46, chin: 0x1e7a46,
    beakC: 0xe8c040, wing: 0x8a8278, tip: 0x5e4e40, speculum: 0x3a5ac8, span: 10, chord: 7, tailLen: 4, tailW: 4, curl: true, tailC: 0x2a262e, legLen: 3, legC: 0xf08a28, webbed: true, flatBottom: true, flapHz: 7, sit: -1.5 });
}
export function duckHen() {
  return bird({ kind: 'duckHen', swim: true, size: 0.018, L: 16, H: 9, W: 10, head: 6, beak: 3, flatBill: true, eye: 1, back: 0x9a7248, mottle: 0x6a4a2c, belly: 0xb48e60, headC: 0x9a7a52, cap: 0x6a4a2c,
    beakC: 0xd88a30, wing: 0x8a6440, tip: 0x5e4e40, speculum: 0x3a5ac8, span: 10, chord: 7, tailLen: 4, tailW: 4, tailC: 0x7a5a38, legLen: 3, legC: 0xf08a28, webbed: true, flatBottom: true, flapHz: 7, sit: -1.5 });
}
export function owl() {
  return bird({ kind: 'owl', size: 0.019, L: 12, H: 18, W: 13, head: 12, beak: 1, upright: 1, headAt: [0, 18 * 0.4, 0.5], legY: -18 * 0.45, back: 0x8a6a4a, mottle: 0x5a4232, belly: 0xc0a07a, breast: 0xc0a07a, headC: 0x8a6a4a, disc: 0xc8843e,
    glow: 0xf2c030, big: true, lidC: 0x7a5a3e, tufts: true, beakC: 0x3a3230, wing: 0x7a5a3e, covert: 0x8a6a4a, tip: 0x5a4232, span: 11, chord: 9, outer: 10, tailLen: 6, tailW: 6, tailC: 0x6a4e36,
    legLen: 2, legC: 0xb89a70, flapHz: 2.6 });
}
export function bat() {
  return bird({ kind: 'bat', size: 0.011, L: 8, H: 6, W: 6, head: 5, beak: 0, eye: 1, back: 0x6a5262, belly: 0x86707c, headC: 0x6a5262, tufts: true, membrane: true, wing: 0x58405a, bone: 0x3e2c3a, tip: 0x58405a,
    span: 8, chord: 7, outer: 10, flapHz: 9 });
}

// ---------------------------------------------------------------- frog
export function frog() {
  const parts = {}, at = {};
  const c = 0x5a9a3a, d = 0x2e5a24, b = 0xe8e0a0;
  const v = new Vox(13, 9, 14);
  v.ellipsoid(6, 4, 6.5, 5.5, 3.2, 6, (x, y, z) => (y < 3 ? b : vhash(x >> 1, y, z >> 1, 4) < 0.18 ? d : c));
  v.ellipsoid(6, 5, 10, 4.5, 2.6, 3.2, c); // wide flat head
  for (const s of [-1, 1]) {
    v.ellipsoid(6 + s * 3, 7.2, 10.2, 1.5, 1.5, 1.5, 0xc8a83a); // bulging golden eyes
    v.set(6 + s * 3, 8, 11, INK); v.set(6 + s * 3, 7, 11.5, INK); v.set(6 + s * 4, 7.5, 11, INK);
  }
  v.fill(3, 4, 13, 9, 4, 13, d); // the long grin
  parts.body = { vox: v, origin: [6.5, 3, 7] };
  at.body = [0, 3.2, 0];
  const th = new Vox(5, 3, 4);
  th.ellipsoid(2, 1, 2, 2.2, 1.4, 1.8, 0xf0e8b8);
  parts.throat = { vox: th, origin: [2.5, 2, 1] };
  at.throat = [0, -1.5, 5];
  const fore = leg(3, 1, (t) => (t > 0.7 ? b : c));
  parts.foreL = parts.foreR = fore;
  at.foreL = [3.5, -1, 4.5]; at.foreR = [-3.5, -1, 4.5];
  // big hind legs folded along the body: thigh forward, shin back
  const thigh = new Vox(3, 2, 6);
  thigh.fill(0, 0, 0, 2, 1, 5, (x, y, z) => (y === 0 ? b : (x + z) % 3 === 0 ? d : c));
  parts.thighL = parts.thighR = { vox: thigh, origin: [1.5, 1, 0.5] };
  at.thighL = [4.2, -0.8, -4]; at.thighR = [-4.2, -0.8, -4];
  const shin = new Vox(2, 2, 9);
  shin.fill(0, 0, 3, 1, 1, 8, c); shin.fill(0, 0, 0, 1, 0, 3, b); // shin back from the knee, then the long webbed foot
  parts.shinL = parts.shinR = { vox: shin, origin: [1, 1, 8.5] };
  at.shinL = [0.8, 0, 5]; at.shinR = [-0.8, 0, 5];
  return { arch: 'frog', size: 0.011, parts, at, meta: { kind: 'frog', standH: 3.2 * 0.011, radius: 0.12 } };
}

// ---------------------------------------------------------------- trout & salmon
function fish(o) {
  const parts = {}, at = {};
  const col = (x, y, z, cy) => {
    if (y > cy + 1.2) return vhash(x, y, z, 2) < 0.2 ? o.spot : o.back;
    if (y > cy - 0.2) return o.stripe;
    return o.belly;
  };
  const a = new Vox(7, 9, 12);
  a.ellipsoid(3, 4, 6, 2.6, 3.6, 6, (x, y, z) => col(x, y, z, 4));
  for (const s of [-1, 1]) { a.set(3 + s * 3, 5, 9, INK); a.set(3 + s * 3, 5, 10, GLINT); }
  a.fill(3, 7, 4, 3, 8, 6, o.back); // dorsal fin
  parts.body = { vox: a, origin: [3.5, 4.5, 1] };
  const m = new Vox(7, 9, 8);
  m.ellipsoid(3, 4, 4, 2.2, 3, 4.5, (x, y, z) => col(x, y, z, 4));
  parts.mid = { vox: m, origin: [3.5, 4.5, 7.5] };
  at.mid = [0, 0, 0];
  const t = new Vox(5, 11, 8);
  t.ellipsoid(2, 5, 4, 1.4, 1.8, 4, (x, y, z) => col(x, y, z, 5));
  for (let k = 0; k < 4; k++) t.fill(2, 5 - 2 - k * 0.8, k - 0.5, 2, 5 + 2 + k * 0.8, k - 0.5, o.fin); // forked tail fin
  parts.tail = { vox: t, origin: [2.5, 5.5, 7.5] };
  at.tail = [0, 0, -7];
  at.body = [0, 0, 0];
  return { arch: 'fish', size: o.size, parts, at, meta: { kind: o.kind, radius: 0.25 } };
}
export function trout() {
  return fish({ kind: 'trout', size: 0.016, back: 0x5a7066, spot: 0x2e3a34, stripe: 0xd85a5a, belly: 0xe8dcd0, fin: 0x768e80 });
}
export function salmon() {
  return fish({ kind: 'salmon', size: 0.019, back: 0x4a5a5a, spot: 0x2a3434, stripe: 0xd8483a, belly: 0xe8d8c8, fin: 0x8a4a4a });
}

// ---------------------------------------------------------------- butterflies & dragonflies
function butterfly(o) {
  const parts = {}, at = {};
  const b = new Vox(1, 2, 9);
  b.fill(0, 0, 0, 0, 0, 8, 0x2a2228); b.fill(0, 1, 6, 0, 1, 8, 0x2a2228);
  parts.body = { vox: b, origin: [0.5, 0.5, 4.5] };
  // fore and hind wing as one plate per side
  const w = wing(10, 11, (u, v, x, z) => {
    const fore = z >= 5, r = fore ? Math.hypot(x - 1, (z - 5) * 1.25) : Math.hypot(x - 0.5, (5 - z) * 1.5);
    if (r > (fore ? 10.2 : 8)) return 0;
    if (r > (fore ? 8.6 : 6.6)) return o.edge && (x + z) % 3 === 0 ? o.dots : o.edge;
    if (o.veins && (x === z - 2 || x === 7 - z || x === Math.round(z * 0.6) + 3)) return o.veins;
    return fore && x > 6 && z > 8 && o.tipC ? o.tipC : o.wing;
  });
  const wl = { vox: w, origin: [0, 0.5, 5.5] };
  parts.wingL = wl; parts.wingR = flip(wl);
  at.wingL = [0.5, 0.5, 0.5]; at.wingR = [-0.5, 0.5, 0.5];
  at.body = [0, 0, 0];
  return { arch: 'bug', size: o.size, parts, at, meta: { kind: o.kind, radius: 0.1 } };
}
export function monarch() {
  return butterfly({ kind: 'monarch', size: 0.0085, wing: 0xee8a22, edge: 0x2a2228, dots: 0xf6f0e4, veins: 0x2a2228, tipC: 0xf6a040 });
}
export function sulphur() {
  return butterfly({ kind: 'sulphur', size: 0.0075, wing: 0xf2d850, edge: 0xe8b830, dots: 0xf2d850, tipC: 0xf6e480 });
}
export function dragonfly() {
  const parts = {}, at = {};
  const b = new Vox(3, 3, 17);
  b.fill(1, 1, 0, 1, 1, 11, (x, y, z) => (z % 3 === 0 ? 0x1a6a86 : 0x2a9ab8)); // long abdomen
  b.ellipsoid(1, 1, 13, 1.2, 1.2, 1.6, 0x2a9ab8);
  b.ellipsoid(1, 1.3, 15.5, 1.4, 1.2, 1, 0x48bcd4); // big eyes
  parts.body = { vox: b, origin: [1.5, 1.5, 13] };
  const glass = (u, v, x) => (v < 0.2 ? 0x8ab0c0 : x === 6 && v > 0.4 ? 0x5a7a8a : 0xd8ecf2);
  const w = { vox: wing(9, 2, glass), origin: [0, 0.5, 1] };
  parts.wingL = w; parts.wingR = flip(w); parts.wingL2 = w; parts.wingR2 = flip(w);
  at.wingL = [1, 1, 1]; at.wingR = [-1, 1, 1]; at.wingL2 = [1, 1, -1.5]; at.wingR2 = [-1, 1, -1.5];
  at.body = [0, 0, 0];
  return { arch: 'bug', size: 0.0085, parts, at, meta: { kind: 'dragonfly', radius: 0.1 } };
}

// ---------------------------------------------------------------- beaver
export function beaver() {
  const parts = {}, at = {};
  const v = new Vox(12, 10, 16);
  v.ellipsoid(5.5, 4.5, 7.5, 5, 4, 7, (x, y, z) => ((x + y * 2 + z) % 5 === 0 ? 0x5a3a24 : y < 2 ? 0x7a5436 : 0x6a4428));
  parts.body = { vox: v, origin: [6, 4.5, 8] };
  const h = new Vox(9, 8, 9);
  h.ellipsoid(4, 4, 4, 3.6, 3.2, 3.6, 0x6a4428);
  h.ellipsoid(4, 3, 6.5, 2.4, 2, 1.8, 0x7a5436);
  h.fill(4, 1, 8, 4, 2, 8, 0xf6e8b0); // buck teeth
  dotFront(h, 3.5, 4, INK); dotFront(h, 4.5, 4, INK);
  eyes(h, 5, 5, 1);
  for (const s of [-1, 1]) h.set(4 + s * 3, 7, 3, 0x5a3a24); // little ears
  parts.head = { vox: h, origin: [4.5, 2.5, 1] };
  at.head = [0, 3.5, 6.5];
  const t = new Vox(7, 1, 10);
  t.ellipsoid(3, 0, 5, 3.4, 0.5, 5, (x, y, z) => ((x + z) % 2 ? 0x2a2a30 : 0x3a3a40)); // the flat, scaly paddle
  parts.tail = { vox: t, origin: [3.5, 0.5, 10] };
  at.tail = [0, -1, -6.5];
  at.body = [0, 0, 0];
  return { arch: 'swim', size: 0.035, parts, at, meta: { kind: 'beaver', radius: 0.5 } };
}

// ---------------------------------------------------------------- the bin the raccoon raids
export function bin() {
  const parts = {}, at = {};
  const can = 0x6e7a74, dark = 0x4e5854, rim = 0x8e9a92;
  const v = new Vox(13, 15, 13);
  v.cylinder(6, 0, 6, 5.6, 14, (x, y, z) => (y % 4 === 1 ? dark : y > 12 ? rim : can), 'y', 6);
  v.carve((x, y, z) => y >= 4 && Math.hypot(x - 6, z - 6) < 4.6); // hollow, so the raccoon has something to dig in
  v.cylinder(6, 8, 6, 4.4, 4, (x, y, z) => (vhash(x, y, z, 2) < 0.3 ? 0xe8c840 : vhash(x, y, z, 5) < 0.5 ? 0x8a7a5a : 0x5a6a3a)); // rubbish
  for (const s of [-1, 1]) v.fill(6 + s * 6, 10, 5, 6 + s * 6, 11, 7, dark); // handles
  parts.can = { vox: v, origin: [6.5, 0, 6.5] };
  const l = new Vox(15, 3, 15);
  l.cylinder(7, 0, 7, 6.8, 1, rim);
  l.cylinder(7, 1, 7, 6, 1, can);
  l.fill(6, 2, 7, 8, 2, 7, dark); // handle
  parts.lid = { vox: l, origin: [7.5, 0, 1] };
  at.lid = [0, 14, -5.5];
  at.can = [0, 0, 0];
  return { arch: 'bin', size: 0.045, parts, at, meta: { kind: 'bin', radius: 0.5 } };
}

// every species, by the name the game spawns it as
export const SPECIES = {
  deer, fawn, buck, moose, fox, raccoon, rabbit, squirrel, chipmunk, mouse, duchess: () => cat(), biscuit: dog,
  robin, chickadee, bluejay, sparrow, crow, gull, goose, mallard, duckHen, owl, bat,
  frog, trout, salmon, monarch, sulphur, dragonfly, beaver, bin,
};

// voxpreview: each species as one model in its rest pose (wings spread)
function assemble(r) {
  const D = rigDef(r);
  const pos = D.bones.map(() => [0, 0, 0]);
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  const pts = [];
  D.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? pos[b.parent] : [0, 0, 0];
    pos[i] = [p[0] + b.at[0], p[1] + b.at[1], p[2] + b.at[2]];
    if (!b.part) return;
    const { vox, origin } = b.part;
    for (let z = 0; z < vox.d; z++) for (let y = 0; y < vox.h; y++) for (let x = 0; x < vox.w; x++) {
      const c = vox.data[vox.idx(x, y, z)];
      if (!c) continue;
      const X = Math.round(pos[i][0] + x + 0.5 - origin[0] - 0.5), Y = Math.round(pos[i][1] + y - origin[1]), Z = Math.round(pos[i][2] + z + 0.5 - origin[2] - 0.5);
      pts.push(X, Y, Z, c);
      x0 = Math.min(x0, X); y0 = Math.min(y0, Y); z0 = Math.min(z0, Z); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); z1 = Math.max(z1, Z);
    }
  });
  const v = new Vox(x1 - x0 + 1, y1 - Math.min(0, y0) + 1, z1 - z0 + 1);
  for (let k = 0; k < pts.length; k += 4) v.set(pts[k] - x0, pts[k + 1] - Math.min(0, y0), pts[k + 2] - z0, pts[k + 3]);
  return { vox: v, size: r.size, origin: [-x0, -Math.min(0, y0), -z0] };
}
export const PREVIEW = Object.fromEntries(Object.entries(SPECIES).map(([k, f]) => [k, () => assemble(f())]));
