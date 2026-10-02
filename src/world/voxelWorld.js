// Puts the voxel art into Maple Cove: every building as a detailed voxel model
// with hand-lettered signs, the town clutter as voxel props (merged per area),
// pumpkins & jack-o'-lanterns as kickable physics props, and a pile of extra
// Halloween dressing (bobbleheads, cauldrons, candles, bats, trick hoops...).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import { buildVoxelBuilding } from '../voxel/models/buildings.js';
import * as PR from '../voxel/models/props.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial, createFlatMaterial } from '../render/voxelMaterial.js';
import { PhysProps } from './physprops.js';
import { Vox } from '../voxel/vox.js';
import { nearestRoad } from './terrain.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CHUNK = 48;

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
  }

  // cached builder result + geometry
  model(key, fn) {
    let r = this.cache.get(key);
    if (!r) {
      r = fn();
      r.geometry = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: r.jitter ?? 0 });
      this.cache.set(key, r);
    }
    return r;
  }

  ground(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // static voxel geometry, merged per 48 m chunk
  addStatic(r, x, y, z, yaw = 0, scale = 1) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = []));
    _q.setFromAxisAngle(UP, yaw);
    _s.setScalar(scale);
    c.push({ geo: r.geometry, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), _s.clone()) });
    // lights from the model meta
    for (const l of r.meta?.lights || []) {
      _p.set(l.x, l.y, l.z).multiplyScalar(scale).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, y, z));
      this.lights.push({ pos: _p.clone(), color: l.color, radius: l.radius || 4, kind: 'lamp' });
    }
  }

  buildStatic() {
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
      const mesh = voxMesh(merged, mat);
      mesh.name = `decor:${key}`;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.chunks.clear();
  }

  // ------------------------------------------------------------ buildings
  buildings(placed) {
    const mat = sharedVoxelMaterial();
    for (const b of L.BUILDINGS) {
      const at = placed[b.id];
      if (!at) continue;
      const yaw = b.facing || 0;
      let y = at.y0;
      const opts = { seed: hashStr(b.id) };
      if (b.stilts) {
        // posts reach down to the seabed
        let low = 1e9;
        for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [0, 0]]) {
          const c = Math.cos(yaw), s = Math.sin(yaw);
          low = Math.min(low, this.ground(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
        }
        opts.stilt = Math.max(1.5, y - Math.min(low, -0.4) + 0.6);
      }
      if (b.kind === 'lighthouse') y += 0.3;
      let r;
      try {
        r = buildVoxelBuilding({ ...b, ...opts });
      } catch (e) {
        console.warn('voxel building failed', b.id, e);
        continue;
      }
      const geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
      const mesh = voxMesh(geo, mat);
      mesh.position.set(b.x, y, b.z);
      mesh.rotation.y = yaw;
      mesh.name = `building:${b.id}`;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      const M = mesh.matrix;
      const meta = r.meta || {};
      for (const s of meta.signs || []) this.sign(s, M, b);
      for (const sm of meta.smoke || []) this.world.ctx.smoke.push(new THREE.Vector3(sm.x, sm.y, sm.z).applyMatrix4(M));
      // a few of the building's own lights (the closest-to-the-door ones)
      const ls = (meta.lights || []).slice().sort((a, b2) => (a.kind === 'porch' ? -1 : 0) - (b2.kind === 'porch' ? -1 : 0)).slice(0, 3);
      for (const l of ls) this.lights.push({ pos: new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(M), color: l.color, radius: Math.min(9, l.radius || 6), kind: l.kind === 'beacon' ? 'beacon' : 'lamp' });
      at.voxel = { mesh, meta, M };
    }
  }

  // hand-lettered sign text planes
  sign(s, M, b) {
    const text = s.text || b.sign || '';
    if (!text) return;
    const PPM = 24; // texture pixels per metre (≈ voxel scale)
    const W = Math.max(8, Math.round(s.w * PPM)), H = Math.max(6, Math.round(s.h * PPM));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const chalk = s.kind === 'chalk';
    const bg = chalk ? '#2a3a32' : toCss(s.bg ?? 0xf2e6c8);
    const fg = chalk ? '#f2efe2' : toCss(s.fg ?? 0x3a2418);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const lines = chalk ? text.split(/\s*\n\s*|(?<=JOUR)\s/) : [text];
    let size = 16;
    g.font = `${size}px BoldPixels`;
    const widest = () => Math.max(...lines.map((l) => g.measureText(l).width));
    while ((widest() > W - 4 || size * lines.length > H - 2) && size > 8) {
      size -= size > 12 ? 4 : 2;
      g.font = `${size}px BoldPixels`;
    }
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, Math.round(W / 2), Math.round(H / 2 + (i - (lines.length - 1) / 2) * size)));
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = createFlatMaterial(tex);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    const n = new THREE.Vector3(...(s.normal ? [s.normal[0] ?? s.normal.x, s.normal[1] ?? s.normal.y, s.normal[2] ?? s.normal.z] : [0, 0, 1]));
    const pos = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(M);
    const nw = n.clone().transformDirection(M);
    plane.position.copy(pos);
    plane.lookAt(pos.clone().add(nw));
    plane.receiveShadow = true;
    this.scene.add(plane);
    // fonts may arrive after the first draw
    document.fonts?.load?.('16px BoldPixels').then(() => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.font = `${size}px BoldPixels`;
      g.fillStyle = fg;
      lines.forEach((l, i) => g.fillText(l, Math.round(W / 2), Math.round(H / 2 + (i - (lines.length - 1) / 2) * size)));
      tex.needsUpdate = true;
    });
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
          const jack = seed % 4 === 0;
          const r = jack
            ? this.model(`jack:${kind}:${v}`, () => PR.jackOLantern({ face: PR.JACK_FACES[v % PR.JACK_FACES.length], kind: kind === 'squat' ? 'medium' : kind === 'big' ? 'medium' : 'small', seed: v, hollow: false }))
            : this.model(`pumpkin:${kind}:${v}`, () => PR.pumpkin({ kind, seed: v + 10, color: v === 5 ? 'white' : v === 4 ? 'amber' : 'orange' }));
          physprops.add(r, d.x, d.y, d.z, { yaw, kind: jack ? 'jack' : 'pumpkin', hp: kind === 'small' ? 2 : 3, mass: kind === 'big' ? 2.2 : kind === 'small' ? 0.6 : 1.2, lights: jack });
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

  // ------------------------------------------------------------ extra Halloween dressing
  halloween(physprops) {
    const P = L.POI;
    const gy = (x, z) => this.ground(x, z);
    const S = (key, fn, x, z, yaw = 0, dy = 0, scale = 1) => this.addStatic(this.model(key, fn), x, gy(x, z) + dy, z, yaw, scale);
    // plaza: a giant skeleton bobblehead, the witch's cauldron, candles and a scarecrow
    const p = P.plaza;
    S('bobble', () => PR.skeletonBobblehead({ part: 'all' }), p.x - 4.2, p.z - 5.5, 0.4, 0, 2.2);
    this.spot(p.x - 4.2, p.z - 5.5, 2.2, 'Bonk the bobblehead', 'bobble');
    S('cauldron', () => PR.cauldron({ fire: true }), p.x + 5.5, p.z - 3, -0.6, 0, 1.6);
    this.spot(p.x + 5.5, p.z - 3, 2, 'Stir the cauldron', 'cauldron');
    S('witchhat', () => PR.witchHat({}), p.x + 6.3, p.z - 1.6, 0.3, 0, 1.2);
    S('broom', () => PR.broom({}), p.x + 4.4, p.z - 4.4, 0.9);
    for (let i = 0; i < 4; i++) S(`candles:${i}`, () => PR.candleCluster({ seed: i, count: 3 + (i % 3) }), p.x + Math.cos(i * 1.6 + 0.4) * 5.2, p.z + Math.sin(i * 1.6 + 0.4) * 5.2, i);
    S('scarecrow', () => PR.scarecrow({ crow: true }), p.x - 8, p.z + 2.5, 1.2);
    S('candybowl', () => PR.candyBowl({}), p.x + 1.2, p.z + 3.4, 0);
    S('catstatue', () => PR.blackCatStatue({}), p.x - 2.5, p.z + 3.8, 0.4);
    S('spider', () => PR.spider({}), p.x + 2.6, p.z - 3.8, 2.1);
    // bowling pins for pumpkin bowling down the green's gravel path
    const lane = L.BOWLING;
    for (const [i, j] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2]]) {
      const x = lane.x + i * 0.32, z = lane.z - 6 - j * 0.38;
      physprops.add(this.model('pin', () => PR.bowlingPin({})), x, gy(x, z), z, { kind: 'pin', hp: 99, mass: 0.35, round: false, respawn: 25 });
    }
    S('lane-sign', () => PR.signpost({ arrows: [{ dir: 'front', color: 0xe8701e, len: 8 }] }), lane.x + 2.2, lane.z - 1, Math.PI);
    // trick hoops for the bike, standing over the roads (turned to face along the road)
    this.hoops = [];
    for (const [x, z] of L.HOOPS) {
      const rd = nearestRoad(x, z);
      const yaw = Math.atan2(rd.dx, rd.dz); // the ring faces along the road
      const r = this.model('hoop', () => PR.trickHoop({ flames: true }));
      this.addStatic(r, x, gy(x, z) - 0.1, z, yaw);
      this.hoops.push({ x, z, yaw, y: gy(x, z), ring: r.meta.ring });
      for (const c of r.meta.colliders || []) {
        const lx = c.x ?? c[0], lz = c.z ?? c[2] ?? 0;
        const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        this.world.physics.addCircle({ x: wx, z: wz, r: c.r ?? 0.2, kind: 'post' });
      }
    }
    // graveyard: gargoyles, a coffin, a ghost and crooked crosses
    const g = P.graveyard;
    S('gargoyle', () => PR.gargoyle({}), g.x + 9, g.z + 9, -2.4);
    S('gargoyle', () => PR.gargoyle({}), g.x - 10, g.z + 7, 2.6);
    S('coffin', () => PR.coffin({ open: true }), g.x + 4, g.z - 8, 0.5);
    S('ghostpost', () => PR.ghostPost({}), g.x - 4, g.z - 9, 0.3);
    for (let i = 0; i < 5; i++) S(`cross:${i % 2}`, () => PR.woodenCross({ seed: i % 2 }), g.x - 8 + i * 3.3, g.z + 11 - (i % 2) * 1.5, (i % 3) * 0.2 - 0.2);
    // homestead: Nana's porch decorated, a gnome with a tiny jack, flamingo in a witch hat
    const c = P.cabin;
    S('gnome', () => PR.gardenGnome({ hat: 'witch' }), c.x + 6, c.z - 9, 1.2);
    S('flamingo', () => PR.lawnFlamingo({ hat: true }), c.x + 9, c.z - 11, 2.0);
    S('birdhouse', () => PR.birdhouse({}), c.x + 14, c.z + 6, 0.8);
    S('well', () => PR.well({}), c.x - 14, c.z + 12, 0.3);
    // carving table on the porch steps
    S('carvetable', () => PR.cafeTable({ color: 'wood' }), -166.2, 63.4, 0.4);
    S('carvepumpkin', () => PR.pumpkin({ kind: 'medium', seed: 77 }), -166.2, 63.4, 0, 0.8, 0.8);
    this.spot(-166.2, 63.4, 1.8, 'Carve a pumpkin', 'carve');
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
    // more kickable pumpkins scattered along roads and porches
    const extra = L.LOOSE_PUMPKINS;
    extra.forEach(([x, z], i) => {
      const jack = i % 2 === 0;
      const r = jack ? this.model(`jack:medium:${i % 6}`, () => PR.jackOLantern({ face: PR.JACK_FACES[i % PR.JACK_FACES.length], kind: 'medium', seed: i, hollow: false }))
        : this.model(`pumpkin:medium:${i % 6}`, () => PR.pumpkin({ kind: 'medium', seed: i + 30 }));
      physprops.add(r, x, gy(x, z), z, { yaw: i * 1.3, kind: jack ? 'jack' : 'pumpkin', hp: 3, mass: 1.2, lights: jack });
    });
  }
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
  const news = (info.news || []).join('   ·   ') || 'Have a spooky-cozy day, Maple Cove!';
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

function toCss(c) {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}
function hashStr(s) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
