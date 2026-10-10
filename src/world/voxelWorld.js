// Puts the voxel art into Maple Cove: every building as a detailed voxel model
// with hand-lettered signs, the town clutter as voxel props (merged per area),
// harvest pumpkins as kickable physics props, and the fall-fair extras (lawn
// bowling on the green, Nana's porch TV...).
import * as THREE from 'three';
import BuildWorker from './buildWorker.js?worker&inline';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import { buildVoxelBuilding, lowDetail } from '../voxel/models/buildings.js';
import * as PR from '../voxel/models/props.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial, createFlatMaterial } from '../render/voxelMaterial.js';
import { PhysProps } from './physprops.js';
import { Vox } from '../voxel/vox.js';
import { dressPlaces } from './places.js';
import { placeDeco2D } from './deco2d.js';
import { dressContest } from './contest.js';
import { buildingSpecPure } from './foundations.js';
import { Fences3D } from './fences3d.js';
import { Doors } from './doors.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CHUNK = 48;
function freeArray() {
  this.array = null;
}

export class VoxelWorld {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.terrain = world.terrain;
    this.cache = new Map();
    this.chunks = new Map();
    this.meshes = [];
    this.spots = []; // interactable things: { x, z, r, text, fn }
    this.lights = [];
    this.lodDist = 48;
    // the front doors swing only while the near models (which have them cut out) can show
    this.doors = world.doors = new Doors(world, { active: () => this.lodDist > 0 });
  }

  // cached builder result + geometry
  model(key, fn) {
    let r = this.cache.get(key);
    if (!r) {
      r = fn();
      r.geometry = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: r.jitter ?? 0, ao: r.ao });
      this.cache.set(key, r);
    }
    return r;
  }

  ground(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // static voxel geometry, merged per 48 m chunk (96 m out in the backcountry, where it's sparse)
  addStatic(r, x, y, z, yaw = 0, scale = 1) {
    const C = x < -236 || z > 236 || z < -236 ? CHUNK * 2 : CHUNK;
    const key = `${C === CHUNK ? '' : 'b'}${Math.floor(x / C)},${Math.floor(z / C)}`;
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = []));
    _q.setFromAxisAngle(UP, yaw);
    _s.setScalar(scale);
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), _s.clone());
    c.push({ geo: r.geometry, m: M });
    // lettering painted on the prop (STOP signs, stands)
    for (const sg of r.meta?.signs || []) this.sign(sg, M, {});
    // lights from the model meta
    for (const l of r.meta?.lights || []) {
      _p.set(l.x, l.y, l.z).multiplyScalar(scale).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, y, z));
      this.lights.push({ pos: _p.clone(), color: l.color, radius: l.radius || 4, kind: 'lamp' });
    }
  }

  buildStatic() {
    this.buildSigns();
    const mat = sharedVoxelMaterial();
    for (const [key, list] of this.chunks) {
      const geos = list.map(({ geo, m }) => {
        const g = geo.clone();
        g.applyMatrix4(m);
        return g;
      });
      // merge in batches so index buffers stay sane
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      // nothing reads a merged chunk back on the CPU: let its arrays go once they're on the GPU
      for (const a of [...Object.values(merged.attributes), merged.index]) a?.onUpload(freeArray);
      const mesh = voxMesh(merged, mat);
      mesh.name = `decor:${key}`;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      (this.decorChunks ||= []).push({ mesh, c: merged.boundingSphere.center, r: merged.boundingSphere.radius });
    }
    this.chunks.clear();
  }

  // The merged clutter is small stuff: past a few hundred metres (deep in the haze) a chunk is
  // skipped altogether, which keeps the far side of the bigger map from costing draw calls.
  updateFar(camPos, far = 380) {
    const L2 = this._farAt;
    if (L2 && Math.abs(L2.x - camPos.x) + Math.abs(L2.z - camPos.z) < 8) return;
    this._farAt = { x: camPos.x, z: camPos.z };
    for (const d of this.decorChunks || []) {
      const dist = Math.hypot(d.c.x - camPos.x, d.c.z - camPos.z) - d.r;
      d.mesh.visible = dist < far;
    }
  }

  // ------------------------------------------------------------ buildings
  // builds every building's voxel model; yields to the browser now and then so the page stays alive
  async buildings(placed, yieldFn = null) {
    const mat = sharedVoxelMaterial();
    const pre = this.world.buildingJobs; // models already being built in workers (see startBuildingJobs)
    let last = performance.now();
    for (const b of L.BUILDINGS) {
      if (yieldFn && performance.now() - last > 120) { await yieldFn(); last = performance.now(); }
      const at = placed[b.id];
      if (!at) continue;
      const yaw = b.facing || 0;
      const y = at.y0;
      let geoHi = null, geoLo, r;
      const job = pre ? await pre.get(b.id) : null;
      if (job && !job.error) {
        geoLo = geometryOf(job.lo);
        r = { meta: job.meta };
      } else {
        if (job?.error) console.warn('worker building failed', b.id, job.error);
        try {
          r = buildVoxelBuilding(buildingSpec(b, this.terrain));
        } catch (e) {
          console.warn('voxel building failed', b.id, e);
          continue;
        }
        geoHi = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0, compact: true });
        const lr = lowDetail(r);
        geoLo = meshVox(lr.vox, { size: lr.size, origin: lr.origin, jitter: 0, compact: true });
      }
      // near: the 1/16 m model; past a few dozen metres the 1/8 m one (see setBuildingDetail).
      // Worker-built buildings start with the far model only; the near one streams in later.
      const mesh = new THREE.LOD();
      mesh.addLevel(lodMesh(geoLo, mat), 0, 0.1);
      mesh.userData.id = b.id;
      if (geoHi) this.attachNear(mesh, geoHi);
      mesh.position.set(b.x, y, b.z);
      mesh.rotation.y = yaw;
      mesh.name = `building:${b.id}`;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      (this.lods ||= []).push(mesh);
      (this.lodById ||= {})[b.id] = mesh;
      const M = mesh.matrix;
      const meta = r.meta || {};
      for (const s of meta.signs || []) this.sign(s, M, b);
      for (const sm of meta.smoke || []) this.world.ctx.smoke.push(new THREE.Vector3(sm.x, sm.y, sm.z).applyMatrix4(M));
      // a few of the building's own lights (the closest-to-the-door ones)
      const ls = (meta.lights || []).slice().sort((a, b2) => (a.kind === 'porch' ? -1 : 0) - (b2.kind === 'porch' ? -1 : 0)).slice(0, 3);
      for (const l of ls) this.lights.push({ pos: new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(M), color: l.color, radius: Math.min(9, l.radius || 6), kind: l.kind === 'beacon' ? 'beacon' : 'lamp' });
      at.voxel = { mesh, meta, M };
      // the hinged front doors (only with worker-built models: their near meshes have the doorways cut)
      if (job && !job.error && meta.doors?.length) this.doors.add(b.id, M, yaw, meta, at.walls);
      // the voxel houses' porch decks and stoops are walked on at floor height (not down in the yard)
      if (!at.generic) {
        for (const d of meta.porch || []) {
          const c = new THREE.Vector3((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2).applyMatrix4(M);
          this.world.physics.addPlatform({ x: c.x, z: c.z, yaw, w: d.x1 - d.x0, l: d.z1 - d.z0, y0: c.y, surface: 'wood', kind: 'deck' });
        }
      }
      // voxel-only kinds bring their own walkable decks, posts and extra solids
      if (at.generic) {
        const PH = this.world.physics;
        const wp = (x, yy, z) => new THREE.Vector3(x, yy, z).applyMatrix4(M);
        for (const d of meta.porch || []) {
          const c = wp((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
          PH.addPlatform({ x: c.x, z: c.z, yaw, w: d.x1 - d.x0, l: d.z1 - d.z0, y0: c.y, surface: 'wood', kind: 'deck' });
        }
        for (const q of meta.posts || []) {
          const c = wp(q.x, 0, q.z);
          PH.addCircle({ x: c.x, z: c.z, r: q.r ?? 0.15, y0: y - 1, y1: y + 6, kind: 'post' });
        }
        for (const q of meta.solids || []) {
          if (!q.collide) continue;
          const c = wp((q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2);
          PH.addBox({ x: c.x, z: c.z, yaw, w: q.x1 - q.x0, l: q.z1 - q.z0, y0: y + q.y0 - 0.5, y1: y + q.y1, kind: 'wall' });
        }
      }
    }
      // the near meshes: right away in test runs (and waited for), otherwise once the game has
    // said which detail it wants (setBuildingDetail), or after a moment if it never does
    const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const t0 = this.world.buildingJobs?.t0;
    if (t0) console.log(`buildings: far meshes ready ${(performance.now() - t0).toFixed(0)}ms after the workers started`);
    if (P.has('frames') || P.has('cam')) await this.startNear();
    else setTimeout(() => { if (!this.detailSet) this.setBuildingDetail('high'); }, 2000);
  }

  // the full-detail mesh joins a building's LOD (the far one moves out to lodDist)
  attachNear(lod, geo) {
    if (lod.userData.near) return;
    const far = lod.levels[lod.levels.length - 1];
    far.distance = this.lodDist;
    const near = lodMesh(geo, sharedVoxelMaterial());
    lod.addLevel(near, 0);
    lod.userData.near = true;
    this.doors.attach(lod.userData.id, near);
  }

  // Stream the 1/16 m meshes in from workers, nearest to the player's start first. Test runs
  // (?frames / ?cam) wait for all of them so screenshots are complete.
  startNear() {
    if (this.nearStarted || !this.world.buildingJobs?.near) return this.nearDone;
    this.nearStarted = true;
    const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const sp = (P.get('spawn') || P.get('cam') || '').split(',').map(Number);
    // the title menu opens on the village (its close shot is the contest at the west end of
    // Main Street), so a plain start streams from there, after the homestead's few buildings
    const title = !['start', 'scene', 'auto', 'spawn', 'cam'].some((k) => P.has(k));
    const from = sp.length >= 2 && !isNaN(sp[0]) ? { x: sp[0], z: P.get('cam') ? sp[2] : sp[1] } : title ? { x: 140, z: 50 } : L.POI.cabin;
    const C = L.POI.cabin;
    const home = (b) => (title && Math.hypot(b.x - C.x, b.z - C.z) < 60 ? 0 : 1);
    const ids = L.BUILDINGS.filter((b) => this.lodById?.[b.id] && !this.lodById[b.id].userData.near)
      .sort((a, b) => home(a) - home(b) || Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z)).map((b) => b.id);
    const tn = performance.now();
    this.nearDone = this.world.buildingJobs.near(ids, (id, data) => {
      const lod = this.lodById[id];
      if (lod && data.hi) this.attachNear(lod, geometryOf(data.hi));
    }).then(() => console.log(`buildings: near meshes streamed in ${(performance.now() - tn).toFixed(0)}ms`));
    return this.nearDone;
  }

  // Building detail by graphics quality: how far out the full-resolution models are used
  // ('low' always shows the 1/8 m ones).
  setBuildingDetail(q = 'high') {
    this.detailSet = true;
    this.lodDist = q === 'low' ? 0 : q === 'medium' ? 30 : 48;
    for (const l of this.lods || []) if (l.levels.length > 1) l.levels[l.levels.length - 1].distance = this.lodDist;
    if (q !== 'low') this.startNear();
  }

  // hand-lettered signs: queued here, painted into a shared atlas and merged into a few meshes by
  // buildSigns() (64 px per metre so the lettering stays crisp at HD)
  sign(s, M, b) {
    const text = s.text || b.sign || '';
    if (!text) return;
    const PPM = 64;
    const chalk = s.kind === 'chalk';
    const n = new THREE.Vector3(...(s.normal ? [s.normal[0] ?? s.normal.x, s.normal[1] ?? s.normal.y, s.normal[2] ?? s.normal.z] : [0, 0, 1]));
    const pos = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(M);
    const nw = n.clone().transformDirection(M);
    const o = new THREE.Object3D();
    o.position.copy(pos);
    o.lookAt(pos.clone().add(nw));
    o.updateMatrix();
    (this.signQueue ||= []).push({
      text, chalk, w: s.w, h: s.h, matrix: o.matrix.clone(), normal: nw,
      W: Math.max(16, Math.round(s.w * PPM)), H: Math.max(12, Math.round(s.h * PPM)),
      bg: chalk ? '#2a3a32' : toCss(s.bg ?? 0xf2e6c8), fg: chalk ? '#f2efe2' : toCss(s.fg ?? 0x3a2418),
    });
  }

  buildSigns() {
    const list = this.signQueue || [];
    if (!list.length) return;
    // shelf-pack into atlases 2048 px wide
    const AW = 2048, PAD = 3;
    const atlases = [];
    let cur = null;
    const sorted = list.slice().sort((a, b) => b.H - a.H);
    for (const sg of sorted) {
      const w = Math.min(AW - PAD * 2, sg.W), h = sg.H;
      if (!cur || cur.x + w + PAD * 2 > AW) {
        if (cur) { cur.y += cur.shelf; cur.x = 0; cur.shelf = 0; }
        if (!cur || cur.y + h + PAD * 2 > AW) { cur = { x: 0, y: 0, shelf: 0, items: [] }; atlases.push(cur); }
      }
      sg.ax = cur.x + PAD; sg.ay = cur.y + PAD; sg.aw = w;
      cur.x += w + PAD * 2;
      cur.shelf = Math.max(cur.shelf, h + PAD * 2);
      cur.items.push(sg);
    }
    for (const at of atlases) {
      const c = document.createElement('canvas');
      c.width = AW;
      c.height = Math.max(16, at.y + at.shelf);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const draw = () => { for (const sg of at.items) drawSign(g, sg, PAD); };
      draw();
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      // one merged mesh of quads per atlas
      const n = at.items.length;
      const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
      const v = new THREE.Vector3();
      at.items.forEach((sg, i) => {
        const hw = sg.w / 2, hh = sg.h / 2;
        const u0 = sg.ax / AW, u1 = (sg.ax + sg.aw) / AW, v1 = 1 - sg.ay / c.height, v0 = 1 - (sg.ay + sg.H) / c.height;
        [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]].forEach(([x, y, uu, vv], k) => {
          v.set(x, y, 0).applyMatrix4(sg.matrix);
          pos.set([v.x, v.y, v.z], (i * 4 + k) * 3);
          nor.set([sg.normal.x, sg.normal.y, sg.normal.z], (i * 4 + k) * 3);
          uv.set([uu, vv], (i * 4 + k) * 2);
        });
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, createFlatMaterial(tex));
      mesh.receiveShadow = true;
      mesh.name = 'signs';
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      // fonts may arrive after the first paint
      document.fonts?.load?.('16px BoldPixels').then(() => { draw(); tex.needsUpdate = true; });
    }
    this.signQueue = [];
  }

  // ------------------------------------------------------------ old prop placements -> voxel props
  decor(list, physprops) {
    let seed = 1;
    for (const d of list) {
      seed++;
      const yaw = d.yaw ?? (seed * 2.399) % (Math.PI * 2);
      switch (d.type) {
        case 'pumpkin': {
          const kind = d.s < 0.22 ? 'small' : d.s < 0.33 ? 'medium' : seed % 3 ? 'big' : 'squat';
          const v = seed % 6;
          const r = this.model(`pumpkin:${kind}:${v}`, () => PR.pumpkin({ kind, seed: v + 10, color: v === 5 ? 'white' : v === 4 ? 'amber' : 'orange' }));
          physprops.add(r, d.x, d.y, d.z, { yaw, kind: 'pumpkin', hp: kind === 'small' ? 2 : 3, mass: kind === 'big' ? 2.2 : kind === 'small' ? 0.6 : 1.2, lights: false });
          break;
        }
        case 'hay':
          this.addStatic(this.model(`hay:${seed % 3}`, () => PR.hayBale({ seed: seed % 3 })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        case 'bench':
          this.addStatic(this.model(`bench:${seed % 2}`, () => PR.parkBench({ color: seed % 2 ? 'green' : 'wood', seed: seed % 2 })), d.x, d.y, d.z, d.yaw ?? 0);
          this.spot(d.x, d.z, 1.4, 'Sit on the bench', 'sit', { yaw: d.yaw ?? 0, y: d.y });
          break;
        case 'crates':
          for (let i = 0; i < (d.n || 2); i++) this.addStatic(this.model(`crate:${i % 3}`, () => PR.crate({ stamp: ['mug', 'pumpkin', 'none'][i % 3], seed: i })), d.x + (i % 2) * 0.62 * Math.cos(d.yaw || 0), d.y + Math.floor(i / 2) * 0.6, d.z - (i % 2) * 0.62 * Math.sin(d.yaw || 0), (d.yaw || 0) + i * 0.3);
          break;
        case 'barrel':
          this.addStatic(this.model(`barrel:${seed % 3}`, () => PR.barrel({ contents: ['lid', 'apples', 'water'][seed % 3], seed })), d.x, d.y, d.z, yaw);
          break;
        case 'lamp':
          this.addStatic(this.model('lamp', () => PR.streetLamp({ variant: 'hook', lit: true })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        case 'rocker':
          this.addStatic(this.model('rocker', () => PR.rockingChair({ blanket: true })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        case 'tomb': {
          const variants = ['rounded', 'cross', 'obelisk', 'cracked', 'leaning', 'mossy', 'cute'];
          const v = variants[d.v ?? seed % variants.length];
          this.addStatic(this.model(`tomb:${v}:${seed % 3}`, () => PR.tombstone({ variant: v, seed: seed % 3, stone: ['grey', 'slate', 'sand', 'marble'][seed % 4] })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        }
        case 'mailbox':
          this.addStatic(this.model('mailbox:nana', () => PR.mailbox({ variant: 'house', flag: 'up', number: 1 })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        case 'wheelbarrow':
          this.addStatic(this.model('wheelbarrow', () => PR.wheelbarrow({ contents: 'pumpkins' })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        case 'bridge':
          this.addStatic(this.model('coveredBridge', () => buildVoxelBuilding({ id: 'bridge', kind: 'coveredBridge', w: d.w, d: d.len })), d.x, d.y, d.z, d.yaw);
          break;
        case 'ramp':
          this.addStatic(this.model(`ramp:${d.len}:${d.h}`, () => PR.jumpRamp({ len: d.len, h: d.h, w: d.w })), d.x, d.y, d.z, d.yaw);
          break;
        case 'picnic':
          this.addStatic(this.model(`picnic:${seed % 2}`, () => PR.picnicTable({ cloth: seed % 2 === 0 })), d.x, d.y, d.z, d.yaw ?? 0);
          break;
        default:
          break;
      }
    }
  }

  spot(x, z, r, text, action, extra = {}) {
    this.spots.push({ x, z, r, text, action, ...extra });
  }

  // a fixed fence (kind picket | rail) from (ax, az) to (bx, bz), drawn by fences3d.js
  fenceRun(kind, ax, az, bx, bz) {
    (this.fenceRuns ||= []).push({ kind, ax, az, bx, bz });
  }

  // ------------------------------------------------------------ fall-fair extras
  dress(physprops) {
    const P = L.POI;
    const gy = (x, z) => this.ground(x, z);
    const S = (key, fn, x, z, yaw = 0, dy = 0, scale = 1) => this.addStatic(this.model(key, fn), x, gy(x, z) + dy, z, yaw, scale);
    // the green: a friendly scarecrow minding the hay bales
    const p = P.plaza;
    S('scarecrow', () => PR.scarecrow({ crow: true }), p.x - 8, p.z + 2.5, 1.2);
    // lawn bowling down the green's gravel path: six pins and a ball to kick at them
    const lane = L.BOWLING;
    for (const [i, j] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2]]) {
      const x = lane.x + i * 0.32, z = lane.z - 6 - j * 0.38;
      physprops.add(this.model('pin', () => PR.bowlingPin({})), x, gy(x, z), z, { kind: 'pin', hp: 99, mass: 0.35, round: false, respawn: 25 });
    }
    physprops.add(this.model('bowlball', () => PR.bowlingBall({})), lane.x, gy(lane.x, lane.z + 1.2), lane.z + 1.2, { kind: 'ball', hp: 99, mass: 1.1, respawn: 20 });
    // the cemetery: flowers left on the graves (nothing within ~8 m of Hank's grave: the funeral is staged there)
    const g = P.graveyard;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9 + 0.6, d = 6 + (i % 3) * 2.5;
      const x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
      if (Math.hypot(x - P.grave.x, z - P.grave.z) < 8.5) continue;
      S(`flowerpot:${i % 3}`, () => PR.flowerPot({ color: ['orange', 'burgundy', 'yellow'][i % 3], seed: i % 3 }), x, z, i);
    }
    // homestead: a garden gnome, a pink flamingo, the birdhouse and the well
    const c = P.cabin;
    S('gnome', () => PR.gardenGnome({}), c.x + 6, c.z - 9, 1.2);
    S('flamingo', () => PR.lawnFlamingo({ hat: false }), c.x + 9, c.z - 11, 2.0);
    S('birdhouse', () => PR.birdhouse({}), c.x + 14, c.z + 6, 0.8);
    S('well', () => PR.well({}), c.x - 14, c.z + 12, 0.3);
    // a basket of apples on a little table by the porch steps
    S('carvetable', () => PR.cafeTable({ color: 'wood' }), -166.2, 63.4, 0.4);
    S('applebasket:p', () => PR.appleBasket({ seed: 2 }), -166.2, 63.4, 0.3, 0.8, 0.9);
    this.world.physics.addCircle({ x: c.x - 14, z: c.z + 12, r: 1.1, kind: 'post' });
    // Nana's TV on the porch (news, weather and who needs a hand)
    {
      const x = -171.4, z = 70.4, yaw = Math.PI / 2 - 0.25;
      const ty = this.world.physics.groundAt(x, z, 100).h;
      const r = this.model('tv', tvVox);
      this.addStatic(r, x, ty, z, yaw);
      const c = document.createElement('canvas');
      c.width = 80; c.height = 48;
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.4), createFlatMaterial(tex));
      plane.position.set(x, ty + 0.6, z).add(new THREE.Vector3(0.025, 0, 0.32).applyAxisAngle(UP, yaw));
      plane.rotation.y = yaw;
      this.scene.add(plane);
      this.tv = { c, g: c.getContext('2d'), tex, t: 0, x, z };
      this.spot(x + Math.sin(yaw) * 1.2, z + Math.cos(yaw) * 1.2, 1.4, 'Watch Maple Cove TV', 'tv');
    }
    // planting spots (side quest): dirt mounds waiting for saplings
    this.plantSpots = [];
    for (const [x, z] of L.PLANT_SPOTS) {
      this.plantSpots.push({ x, z, y: gy(x, z), planted: false });
      S(`mound:${x % 2}`, () => PR.dirtMound({ stage: 'hole', seed: Math.abs(x) % 3 }), x + 0.7, z + 0.4, x * 0.3);
    }
    // more kickable harvest pumpkins scattered along roads and porches
    L.LOOSE_PUMPKINS.forEach(([x, z], i) => {
      const r = this.model(`pumpkin:medium:${i % 6}`, () => PR.pumpkin({ kind: 'medium', seed: i + 30, color: i % 7 === 3 ? 'white' : i % 5 === 2 ? 'amber' : 'orange' }));
      physprops.add(r, x, gy(x, z), z, { yaw: i * 1.3, kind: 'pumpkin', hp: 3, mass: 1.2, lights: false });
    });
    // the rest of the remade map: streets, green, harbour, farm, beach, campground...
    dressPlaces(this, physprops);
    // the pumpkin carving contest at the west end of Main Street
    dressContest(this, physprops);
    // and the 2D street clutter (bins, stalls...), fitted around everything above
    this.world.deco2d = placeDeco2D(this);
    // the fences (the knockable ones placed with the clutter, the fixed runs above) as voxel geometry
    const fences = new Fences3D(this.world, { items: this.world.deco2d.items, runs: this.fenceRuns || [] });
    this.scene.add(fences.group);
    this.world.fences = fences;
  }

  // (older name, kept for callers that still use it)
  halloween(physprops) {
    return this.dress(physprops);
  }
}

// The spec a building's voxel model is built from (floor height, stilts, the ground around it)
export function buildingSpec(b, terrain) {
  return buildingSpecPure(b, terrain);
}

// Start building every voxel building in Web Workers (in parallel with the forest on the main
// thread). Returns a Map id -> Promise<{ pos, nor, col, idx, meta } | { error }>, or null.
export function startBuildingJobs(terrain) {
  if (typeof Worker === 'undefined') return null;
  const cores = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const specs = new Map(L.BUILDINGS.map((b) => [b.id, buildingSpec(b, terrain)]));
  // run a list of jobs on a fresh pool; onMsg(data) per result, onFail(id, err) for jobs a broken worker owned
  const run = (ids, near, onMsg, onFail) => {
    let workers;
    try {
      workers = Array.from({ length: Math.min(cores, ids.length) }, () => new BuildWorker());
    } catch {
      return false;
    }
    const lists = workers.map(() => []);
    ids.forEach((id, i) => lists[i % workers.length].push({ id, spec: specs.get(id) }));
    let left = ids.length;
    workers.forEach((w, k) => {
      w.onmessage = (e) => {
        onMsg(e.data);
        if (--left === 0) for (const ww of workers) ww.terminate();
      };
      w.onerror = (e) => {
        for (const j of lists[k]) onFail(j.id, e.message || 'worker failed');
        e.preventDefault?.();
      };
      w.postMessage({ jobs: lists[k], near });
    });
    return true;
  };
  const waiting = new Map(), jobs = new Map();
  for (const b of L.BUILDINGS) jobs.set(b.id, new Promise((res) => waiting.set(b.id, res)));
  jobs.t0 = performance.now();
  // far meshes first (the loading screen waits for these), biggest first so the workers finish together
  const order = L.BUILDINGS.slice().sort((a, b) => b.w * b.d * (b.floors || 1) - a.w * a.d * (a.floors || 1)).map((b) => b.id);
  const ok = run(order, false, (d) => waiting.get(d.id)?.(d), (id, err) => waiting.get(id)?.({ id, error: err }));
  if (!ok) return null;
  // then the near meshes, in the order asked for; resolves when all have arrived
  jobs.near = (ids, onMesh) => new Promise((done) => {
    if (!ids.length) return done();
    let left = ids.length;
    const one = () => { if (--left === 0) done(); };
    const started = run(ids, true, (d) => { if (!d.error) onMesh(d.id, d); else console.warn('near mesh failed', d.id, d.error); one(); }, (id) => one());
    if (!started) done();
  });
  return jobs;
}

// a worker's mesh arrays -> geometry (compact meshes: Int16 grid positions, see meshVox)
function geometryOf(a) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3, !(a.nor instanceof Float32Array)));
  geo.setAttribute('color4', new THREE.BufferAttribute(a.col, 4, !(a.col instanceof Float32Array)));
  if (a.det) geo.setAttribute('detail', new THREE.BufferAttribute(a.det, 4));
  geo.setIndex(new THREE.BufferAttribute(a.idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.scale = a.scale ?? 1;
  return geo;
}
function lodMesh(geo, mat) {
  const m = voxMesh(geo, mat);
  m.scale.setScalar(geo.userData.scale ?? 1);
  return m;
}

// Nana's old TV on the porch: Maple Cove TV with the weather and town news
function tvVox() {
  const v = new Vox(18, 22, 14);
  const wood = 0x7a4a2a, dark = 0x4a2a18;
  v.fill(1, 6, 1, 16, 18, 12, (x, y, z) => (y === 18 || x === 1 || x === 16 ? dark : wood));
  v.fill(3, 8, 12, 12, 16, 12, 0x1e1a1e); // screen bezel (the picture is a separate plane)
  v.fill(14, 13, 13, 14, 14, 13, 0xd8c8a0); v.fill(14, 10, 13, 14, 11, 13, 0xd8c8a0); // knobs
  for (const [x, z] of [[2, 2], [15, 2], [2, 11], [15, 11]]) v.fill(x, 0, z, x, 5, z, dark); // legs
  v.line(8, 19, 6, 4, 21, 5, 0x9aa0a8); v.line(9, 19, 6, 13, 21, 5, 0x9aa0a8); // rabbit ears
  return { vox: v, size: 0.05, origin: [9, 0, 7] };
}

// redraw the TV picture (called by the game about twice a second)
export function drawTV(tv, info) {
  const { g, c } = tv;
  tv.t++;
  g.imageSmoothingEnabled = false;
  // glow alpha (~0.5) marks the picture as emissive in the flat material
  g.globalAlpha = 1;
  g.fillStyle = 'rgb(30, 60, 90)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgb(255, 240, 200)';
  g.font = '8px BoldPixels';
  g.fillText('MCTV', 3, 9);
  g.fillStyle = 'rgb(255, 120, 60)';
  g.fillRect(30, 3, 3, 3);
  g.fillStyle = 'rgb(255, 250, 230)';
  g.font = '12px Monogram';
  g.fillText(info.time || '', 40, 10);
  // weather doodle
  const w = info.weather || 'clear';
  g.fillStyle = w === 'rain' || w === 'overcast' || w === 'misty' ? 'rgb(220, 230, 240)' : 'rgb(255, 210, 60)';
  if (w === 'clear' || w === 'breezy') { g.beginPath(); g.arc(14, 24, 6, 0, Math.PI * 2); g.fill(); }
  else { g.fillRect(6, 20, 16, 6); g.fillRect(9, 17, 9, 4); if (w === 'rain') { g.fillStyle = 'rgb(120, 180, 255)'; for (let k = 0; k < 4; k++) g.fillRect(8 + k * 4, 28 + ((tv.t + k) % 3), 1, 3); } }
  g.fillStyle = 'rgb(255, 250, 230)';
  g.fillText(String(w).toUpperCase(), 28, 28);
  // scrolling news ticker
  const news = (info.news || []).join('   ·   ') || 'Have a cozy autumn day, Maple Cove!';
  g.fillStyle = 'rgb(20, 20, 30)';
  g.fillRect(0, 36, c.width, 12);
  g.fillStyle = 'rgb(255, 220, 120)';
  const wpx = g.measureText(news).width + 40;
  g.fillText(news, c.width - ((tv.t * 4) % (wpx + c.width)), 46);
  // scanlines
  g.fillStyle = 'rgb(0, 0, 0)';
  for (let y = (tv.t % 2); y < 36; y += 4) g.fillRect(0, y, c.width, 1);
  // the whole picture glows: mark every pixel as emissive paint (alpha ~0.5)
  const id = g.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < id.data.length; i += 4) id.data[i] = 128;
  g.putImageData(id, 0, 0);
  tv.tex.needsUpdate = true;
}

// paint one sign board into an atlas canvas at (sg.ax, sg.ay)
function drawSign(g, sg, pad) {
  const { ax, ay, aw: W, H, bg, fg, chalk, text } = sg;
  g.fillStyle = bg;
  g.fillRect(ax - pad, ay - pad, W + pad * 2, H + pad * 2);
  if (!chalk && H >= 24) {
    g.fillStyle = fg;
    g.globalAlpha = 0.5;
    g.fillRect(ax + 3, ay + 3, W - 6, 2); g.fillRect(ax + 3, ay + H - 5, W - 6, 2); g.fillRect(ax + 3, ay + 3, 2, H - 6); g.fillRect(ax + W - 5, ay + 3, 2, H - 6);
    g.globalAlpha = 1;
  }
  let lines = chalk ? text.split(/\s*\n\s*|(?<=JOUR)\s/) : [text];
  const fits = (ls, size) => {
    g.font = `${size}px BoldPixels`;
    return Math.max(...ls.map((l) => g.measureText(l).width)) <= W - 12 && size * ls.length * 1.05 <= H - 8;
  };
  const sizes = [56, 48, 40, 32, 28, 24, 20, 16, 12, 10, 8];
  let size = sizes.find((z) => fits(lines, z)) ?? 8;
  if (!chalk && lines.length === 1 && text.includes(' ')) {
    const words = text.split(' ');
    const mid = Math.ceil(words.length / 2);
    const two = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    const size2 = sizes.find((z) => fits(two, z)) ?? 8;
    if (size2 > size * 1.3) { lines = two; size = size2; }
  }
  g.font = `${size}px BoldPixels`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const lh = size * 1.05;
  g.save();
  g.beginPath();
  g.rect(ax, ay, W, H);
  g.clip();
  lines.forEach((l, i) => {
    const x = Math.round(ax + W / 2), y = Math.round(ay + H / 2 + (i - (lines.length - 1) / 2) * lh);
    const sh = Math.max(1, Math.round(size / 16));
    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.fillText(l, x + sh, y + sh);
    g.fillStyle = fg;
    g.fillText(l, x, y);
  });
  g.restore();
}

function toCss(c) {
  if (typeof c === 'string') return c; // models hand over '#rrggbb' already
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}
