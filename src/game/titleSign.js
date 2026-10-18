// The title menu: a wooden signpost standing in the grass beside Hank on his hill, its
// painted arrow boards pointing off in different directions: Continue (with a little
// "Day 3" plank hanging under it), New Game, Settings, Controls.
//
// Everything is voxels like the rest of Maple Cove (voxel/mesh.js), so the low sun lights
// the boards and they throw their shadows in the grass. Each board is a couple of planks
// painted a different colour, worn back to the wood here and there, with the word raised
// in paint on its face (set in the game's bold pixel face, ui/type.js textMask). The board
// that is chosen lights up (its letters glow like lantern paint and the board warms) and
// gives a little wiggle; picking one swings it round on its nail. A lantern hangs off the
// top of the post.
//
// Signpost is a THREE.Group: its origin is the middle of the boards' stack, +z towards the
// viewer; plant() stands the post down into the ground under it.
import * as THREE from 'three';
import { Vox, EMIT, tone, mixc, vhash } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, createVoxelMaterial } from '../render/voxelMaterial.js';
import { lantern } from '../voxel/models/props.js';
import { textMask } from '../ui/type.js';
import { damp } from '../core/math.js';

export const VS = 0.0115; // metres per voxel
const POST = 9; // the post is POST x POST voxels
const TIP = 15; // the arrow head's length (voxels)
const TAIL = 11; // board behind the post
const PAD = 7; // painted margin round the word
const THICK = 4; // board thickness (voxels), the paint sits one more proud of it
const GAP = 5; // voxels between boards
const SUBH = 34; // room for a little hanging plank under a board (voxels)
const NAIL = 5.5; // where the post's axis crosses a board, from its tail end (voxels)

const WOOD = [0x9a6a3e, 0x8a5a32, 0x7a4c2a, 0x6a4024];
const WOOD_D = 0x4a2c18;
const IRON = 0x3a3438, IRON_L = 0x6a646a;

// paint: board colour, lettering
export const PAINTS = {
  green: [0x4f8a4a, 0xfff2d8],
  red: [0xbf4a32, 0xfff2d8],
  mustard: [0xe2ab3c, 0x3e2414],
  blue: [0x4d6f9a, 0xfff2d8],
  cream: [0xf2e4c4, 0x5a2a18],
};

// one arrow board: { vox, glowVox, len, h } with the tip at +x (dir > 0) or -x (dir < 0);
// x runs along the board, y up, z through it (the face at +z)
function boardVox(label, paint, dir, seed) {
  const [col, ink] = PAINTS[paint] || PAINTS.cream;
  const m = textMask(label, 22, false);
  const h = Math.max(23, m.h + 10) | 1;
  const body = m.w + PAD * 2 + 2;
  const len = TAIL + body + TIP;
  const build = (glow) => {
    const v = new Vox(len, h, THICK + 1);
    const mid = (h - 1) / 2;
    // u: distance along the board from its tail (0) to the tip (len - 1)
    const inside = (u, y) => {
      if (u < 0 || u >= len || y < 0 || y >= h) return false;
      if (u >= len - TIP) {
        const k = (u - (len - TIP) + 1) / (TIP + 1);
        return Math.abs(y - mid) <= mid * (1 - k) + 0.5;
      }
      // a shallow V notch in the tail
      if (u === 0 && Math.abs(y - mid) < 2) return false;
      return true;
    };
    const X = (u) => (dir > 0 ? u : len - 1 - u);
    const plankAt = (y) => (y < mid ? 0 : 1);
    for (let u = 0; u < len; u++) for (let y = 0; y < h; y++) {
      if (!inside(u, y)) continue;
      // the board's edge: a darker band of paint all round
      const edge = !inside(u - 1, y) || !inside(u + 1, y) || !inside(u, y - 1) || !inside(u, y + 1) || u === 0;
      for (let z = 0; z < THICK; z++) {
        const face = z === THICK - 1;
        // worn back to the wood in places (more towards the edges and the tip)
        const wear = vhash(u >> 1, y >> 1, 3, seed) < (edge ? 0.22 : 0.06) || vhash(u, y, 7, seed) < 0.03;
        let c;
        if (!face) c = WOOD[(plankAt(y) + ((u >> 3) & 1)) % 4];
        else if (wear) c = WOOD[plankAt(y)];
        else c = tone(col, (edge ? -0.16 : 0) + (vhash(u, y, 1, seed) - 0.5) * 0.06 + (plankAt(y) ? -0.03 : 0.03));
        // the seam between the two planks
        if (Math.round(mid) === y && !edge && face && vhash(u, 0, 9, seed) < 0.5) c = tone(c, -0.12);
        v.set(X(u), y, z, c);
      }
    }
    // the painted word, raised one voxel off the face, centred on the body (it reads left
    // to right whichever way the arrow points: the body starts after the tip on a left one)
    const tx = (dir > 0 ? TAIL : TIP) + 1 + Math.round((body - 2 - m.w) / 2), ty = Math.round((h - m.h) / 2);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.on(x, y)) continue;
      const xx = tx + x, yy = h - 1 - (ty + y);
      // (glow: the letters shine like lantern paint; else a little brush texture)
      v.set(xx, yy, THICK, glow ? 0xffd25a | EMIT : tone(ink, (vhash(xx, yy, 5, seed) - 0.5) * 0.08));
    }
    // two nails where it's fixed to the post
    for (const yy of [Math.round(mid) - 5, Math.round(mid) + 5]) {
      v.set(X(Math.round(NAIL)), yy, THICK, IRON_L);
      v.set(X(Math.round(NAIL)) + 1, yy, THICK, IRON);
    }
    return v;
  };
  return { vox: build(false), glowVox: build(true), len, h, body };
}

// the post: a square timber with a little peaked cap
function postVox(heightVox, seed) {
  const W = POST + 6;
  const v = new Vox(W, heightVox + 5, W);
  const o = 2;
  for (let y = 0; y < heightVox; y++) for (let x = 0; x < POST; x++) for (let z = 0; z < POST; z++) {
    const edge = x === 0 || z === 0 || x === POST - 1 || z === POST - 1;
    if (!edge) continue;
    const g = vhash(x + z, y >> 2, 0, seed);
    v.set(o + x, y, o + z, y < 3 ? WOOD_D : g < 0.15 ? WOOD[3] : g < 0.5 ? WOOD[1] : WOOD[0]);
  }
  // the cap
  for (let k = 0; k < 4; k++) {
    const a = -1 + k, b = POST - k;
    for (let x = a; x <= b; x++) for (let z = a; z <= b; z++) v.set(o + x, heightVox + k, o + z, k === 0 ? WOOD_D : tone(0x6a3a22, -k * 0.05));
  }
  // an iron arm for the lantern
  for (let x = POST; x < POST + 2; x++) v.set(o + x, heightVox - 6, o + POST / 2, IRON);
  return { vox: v, origin: [o + POST / 2, 0, o + POST / 2] };
}

export class Signpost extends THREE.Group {
  // items: [{ label, paint, dir (+1 points right, -1 left), sub? }], top first
  constructor(items) {
    super();
    this.name = 'titleSign';
    this.items = items;
    this.boards = [];
    this.geos = [];
    this.mats = [];
    let y = 0;
    const built = items.map((it, i) => {
      const b = boardVox(it.label, it.paint, it.dir, 17 + i * 31);
      return { it, b };
    });
    // stack the boards top-down; a hanging plank under one adds its own height
    const heights = built.map(({ it, b }) => b.h + (it.sub ? SUBH : 0));
    const stack = heights.reduce((a, h) => a + h + GAP, -GAP);
    this.stackH = stack * VS;
    this.maxLen = Math.max(...built.map(({ b }) => b.len)) * VS;
    // how far the boards reach to the left and the right of the post (m)
    const reach = (d) => Math.max(0, ...built.filter(({ it }) => it.dir === d).map(({ b }) => b.len - NAIL)) * VS;
    this.reachR = Math.max(reach(1), NAIL * VS);
    this.reachL = Math.max(reach(-1), NAIL * VS);
    y = stack;
    built.forEach(({ it, b }, i) => {
      const mat = createVoxelMaterial();
      this.mats.push(mat);
      const mk = (vox) => {
        // pivot on the post's axis; the board's back against the post's front face
        const geo = meshVox(vox, { size: VS, origin: [it.dir > 0 ? NAIL : b.len - NAIL, b.h / 2, -POST / 2] });
        this.geos.push(geo);
        return voxMesh(geo, mat);
      };
      const plain = mk(b.vox), glow = mk(b.glowVox);
      glow.visible = false;
      const g = new THREE.Group();
      g.add(plain, glow);
      const cy = (y - b.h / 2) * VS;
      g.position.y = cy;
      y -= b.h + GAP;
      // the little plank hanging under it on two wires
      let sub = null;
      if (it.sub) {
        const sb = this.subPlank(it.sub, it.dir);
        sub = new THREE.Group();
        sub.add(sb);
        sub.position.set(it.dir * (TAIL + b.body / 2 - NAIL) * VS, (-b.h / 2 + 1) * VS, (POST / 2 + 1) * VS);
        g.add(sub);
        y -= SUBH;
      }
      this.add(g);
      // a hit box for the pointer: the whole board
      const hit = new THREE.Mesh(new THREE.BoxGeometry(b.len * VS, b.h * VS, 0.08), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(it.dir * (b.len / 2 - NAIL) * VS, 0, (POST / 2 + THICK / 2) * VS);
      hit.userData.board = i;
      g.add(hit);
      this.boards.push({ g, plain, glow, mat, hit, sub, len: b.len * VS, h: b.h * VS, dir: it.dir, yaw0: 0, spin: 0, spinV: 0, wig: 0, wigV: 0, hot: 0, pop: 0, cy });
    });
    this.post = null;
    this.lamp = null;
    this.t = 0;
    this.sel = -1;
  }

  subPlank(text, dir) {
    const m = textMask(text, 22, false);
    const w = m.w + 12, h = m.h + 10;
    const v = new Vox(w, h + 10, 2);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      v.set(x, y, 0, edge ? WOOD[2] : WOOD[0]);
      v.set(x, y, 1, edge ? tone(0xf2e4c4, -0.12) : tone(0xf2e4c4, (vhash(x, y, 2, 3) - 0.5) * 0.05));
    }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.on(x, y)) v.set(6 + x, h - 1 - (5 + y), 1, 0x5a2a18);
    // the two wires up to the board
    for (const x of [3, w - 4]) for (let y = h; y < h + 10; y++) v.set(x, y, 0, IRON);
    const geo = meshVox(v, { size: VS, origin: [w / 2, h + 10, 1] });
    this.geos.push(geo);
    return voxMesh(geo, this.mats[this.mats.length - 1]);
  }

  // stand the post with its foot groundDrop (m) below the bottom of the boards (the
  // boards' stack is centred on this group's origin), a lantern hanging off its top
  plant(groundDrop) {
    if (this.post) {
      this.post.geometry.dispose();
      this.post.removeFromParent();
      this.lamp?.removeFromParent();
    }
    const below = Math.max(0.3, groundDrop);
    const total = this.stackH + below + 0.42;
    const hv = Math.round(total / VS);
    const { vox, origin } = postVox(hv, 3);
    const geo = meshVox(vox, { size: VS, origin });
    this.postMat ||= createVoxelMaterial();
    const post = voxMesh(geo, this.postMat);
    post.position.y = -below - this.stackH / 2;
    this.add(post);
    this.post = post;
    for (const b of this.boards) b.g.position.y = b.cy - this.stackH / 2;
    // the lantern on its arm, just under the cap
    if (!this.lampModel) {
      const L = lantern({ color: 'red', lit: true });
      this.lampGeo = meshVox(L.vox, { size: L.size, origin: L.origin });
      this.lampModel = L;
    }
    const lamp = new THREE.Group();
    const lm = voxMesh(this.lampGeo, this.postMat);
    const k = 0.5;
    lm.scale.setScalar(k);
    lm.position.y = -(this.lampModel.meta?.handleTop ?? 0.5) * k;
    lamp.add(lm);
    lamp.position.set((POST / 2 + 3) * VS, post.position.y + (hv - 8) * VS, 0);
    this.add(lamp);
    this.lamp = lamp;
  }

  // which board a ray hits (or -1)
  pick(ray) {
    const hits = ray.intersectObjects(this.boards.map((b) => b.hit), false);
    return hits.length ? hits[0].object.userData.board : -1;
  }

  // a board swung round on its nail (picked), or nudged (selected)
  swing(i, k = 1) {
    const b = this.boards[i];
    if (!b) return;
    b.spinV += 5.5 * k * b.dir;
    b.wigV += 3 * k;
  }
  nudge(i) {
    const b = this.boards[i];
    if (b) b.wigV += 2.2;
  }

  // the direction a board points, in world space (a unit vector)
  pointing(i, out = new THREE.Vector3()) {
    const b = this.boards[i];
    out.set(b.dir, 0, 0).applyQuaternion(b.g.getWorldQuaternion(new THREE.Quaternion()));
    out.y = 0;
    return out.normalize();
  }

  // the boards' resting directions (radians about the post, per board)
  setFan(yaws) {
    yaws.forEach((a, i) => { if (this.boards[i]) this.boards[i].yaw0 = a; });
  }

  update(dt, sel) {
    this.t += dt;
    const t = this.t;
    if (sel !== this.sel) {
      if (sel >= 0) this.nudge(sel);
      this.sel = sel;
    }
    this.boards.forEach((b, i) => {
      const on = i === sel;
      b.hot = damp(b.hot, on ? 1 : 0, 10, dt);
      b.pop = damp(b.pop, on ? 1 : 0, 9, dt);
      // springs: the swing round the post and the little wiggle
      b.spinV += (-b.spin * 40 - b.spinV * 3.2) * dt;
      b.spin += b.spinV * dt;
      b.wigV += (-b.wig * 90 - b.wigV * 6) * dt;
      b.wig += b.wigV * dt;
      // a breath of wind keeps them all moving a little
      const breeze = Math.sin(t * 1.3 + i * 1.7) * 0.012 + Math.sin(t * 2.9 + i) * 0.006;
      b.g.rotation.set(0, b.yaw0 + b.spin * 0.6 + breeze, b.wig * 0.12 * b.dir + Math.sin(t * 7 + i) * 0.01 * b.hot);
      b.g.position.z = b.pop * 0.03;
      b.plain.visible = b.hot < 0.5;
      b.glow.visible = !b.plain.visible;
      b.mat.uniforms.uHighlight.value = b.hot * 0.45;
      if (b.sub) b.sub.rotation.z = Math.sin(t * 1.7 + 0.5) * 0.05 - b.wig * 0.3 * b.dir;
    });
    if (this.lamp) this.lamp.rotation.z = Math.sin(t * 1.4) * 0.06;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.post?.geometry.dispose();
    this.lampGeo?.dispose();
    for (const m of this.mats) m.dispose();
    this.postMat?.dispose();
    for (const b of this.boards) b.hit.geometry.dispose();
    this.removeFromParent();
  }
}
