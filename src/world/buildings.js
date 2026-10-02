// Procedural buildings for Maple Cove and the homestead, built from atlas tiles.
import * as THREE from 'three';
import * as L from './layout.js';
import { decor } from './decor.js';

const TM = 2.5; // metres per wall/roof tile
const TRIM = 0xf2ece0;
const DOORS = { red: 0x3a6a4a, teal: 0xb03e2a, blue: 0xf0e6d0, yellow: 0x3a5a8a, white: 0x2e5a7a, green: 0xc8a050, log: 0x3a6a4a, weathered: 0x6a4a2a };
const SHUTTERS = { red: null, teal: 0xf0e6d0, blue: 0x2a3a5a, yellow: 0x3a6a4a, white: 0x2e5a7a, green: 0xf0e6d0, log: null, weathered: null };
const ROOF = { dark: 'roof_dark', red: 'roof_red', green: 'roof_green', moss: 'roof_moss', rust: 'roof_rust' };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function buildingMatrix(x, y, z, yaw) {
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), _s);
}

// world position of a building-local point
export function toWorld(M, x, y, z) {
  return new THREE.Vector3(x, y, z).applyMatrix4(M);
}

function footprintHeights(terrain, b) {
  const c = Math.cos(b.facing || 0), s = Math.sin(b.facing || 0);
  let mn = Infinity, mx = -Infinity;
  for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [0, 0]]) {
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
    const h = terrain.heightAt(x, z);
    mn = Math.min(mn, h);
    mx = Math.max(mx, h);
  }
  return { mn, mx };
}

// ---------------------------------------------------------------- shared parts
function gableRoof(B, M, w, d, H, { tile = 'roof_dark', pitch = 0.8, oh = 0.4, ridgeAlong = 'z', gableTile = null } = {}) {
  const T = 0.14;
  if (ridgeAlong === 'z') {
    const rise = (w / 2) * pitch;
    const th = Math.atan2(rise, w / 2);
    const half = w / 2 + oh;
    const sl = half / Math.cos(th);
    for (const sgn of [-1, 1]) {
      const cx = (sgn * half) / 2, cy = H + rise - (half / 2) * Math.tan(th);
      B.box([cx, cy + T / 2, 0], [sl, T, d + oh * 2], { tile, tileMeters: TM }, [0, 0, -sgn * th], M);
    }
    B.box([0, H + rise + 0.06, 0], [0.22, 0.14, d + oh * 2 + 0.02], { color: 0x4a3a34 }, null, M);
    if (gableTile) {
      B.poly([[-w / 2, H, d / 2], [w / 2, H, d / 2], [0, H + rise, d / 2]], { tile: gableTile, tileMeters: TM }, M);
      B.poly([[w / 2, H, -d / 2], [-w / 2, H, -d / 2], [0, H + rise, -d / 2]], { tile: gableTile, tileMeters: TM }, M);
    }
    // fascia trim along the gable edges
    for (const sz of [-1, 1]) {
      for (const sgn of [-1, 1]) {
        const a = [sgn * half, H - oh * Math.tan(th), sz * (d / 2 + oh)], b2 = [0, H + rise, sz * (d / 2 + oh)];
        B.tube(a, b2, 0.07, 0.07, { color: TRIM }, 4, M);
      }
    }
    return rise;
  }
  // ridge along x: eaves on front/back
  const rise = (d / 2) * pitch;
  const th = Math.atan2(rise, d / 2);
  const half = d / 2 + oh;
  const sl = half / Math.cos(th);
  for (const sgn of [-1, 1]) {
    const cz = (sgn * half) / 2, cy = H + rise - (half / 2) * Math.tan(th);
    B.box([0, cy + T / 2, cz], [w + oh * 2, T, sl], { tile, tileMeters: TM }, [sgn * th, 0, 0], M);
  }
  B.box([0, H + rise + 0.06, 0], [w + oh * 2 + 0.02, 0.14, 0.22], { color: 0x4a3a34 }, null, M);
  if (gableTile) {
    B.poly([[w / 2, H, d / 2], [w / 2, H, -d / 2], [w / 2, H + rise, 0]], { tile: gableTile, tileMeters: TM }, M, [0, 0, -1]);
    B.poly([[-w / 2, H, -d / 2], [-w / 2, H, d / 2], [-w / 2, H + rise, 0]], { tile: gableTile, tileMeters: TM }, M, [0, 0, 1]);
  }
  return rise;
}

function windowAt(B, M, x, y, z, face, { tile = 'window', w = 1.0, h = 1.25, shutters = null, box = true } = {}) {
  // face: 'front' (+z), 'back' (-z), 'left' (-x), 'right' (+x)
  const rot = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[face];
  const local = buildingMatrix(x, y, z, rot);
  const MM = M.clone().multiply(local);
  B.box([0, 0, 0.03], [w, h, 0.07], { tile, keepUV: true, emissive: 1 }, null, MM);
  // trim
  B.box([0, h / 2 + 0.06, 0.05], [w + 0.24, 0.1, 0.1], { color: TRIM }, null, MM);
  if (shutters) {
    for (const sx of [-1, 1]) {
      B.box([sx * (w / 2 + 0.22), 0, 0.04], [0.36, h, 0.06], { color: shutters }, null, MM);
      for (let k = -2; k <= 2; k++) B.box([sx * (w / 2 + 0.22), k * 0.2, 0.08], [0.3, 0.04, 0.02], { color: shutters === 0xf0e6d0 ? 0xc8bca8 : 0x1e2a3a }, null, MM);
    }
  }
  if (box) {
    // flower box under the window
    B.box([0, -h / 2 - 0.12, 0.18], [w + 0.1, 0.22, 0.3], { color: 0x6a4428 }, null, MM);
    const flowers = [0xe84a5a, 0xf2c443, 0xf6f0e8, 0xc860c8, 0xe86a2a];
    for (let i = 0; i < 5; i++) {
      B.box([-w / 2 + 0.15 + i * (w - 0.3) / 4, -h / 2 + 0.05, 0.2], [0.16, 0.16, 0.16], { color: flowers[(i * 3 + Math.round(x * 7)) % flowers.length] }, null, MM);
      B.box([-w / 2 + 0.1 + i * (w - 0.2) / 4, -h / 2 - 0.02, 0.22], [0.2, 0.1, 0.2], { color: 0x4a7a32 }, null, MM);
    }
  }
}

function doorAt(B, M, x, y, z, face, color, { canopy = true } = {}) {
  const rot = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[face];
  const MM = M.clone().multiply(buildingMatrix(x, y, z, rot));
  B.box([0, 1.05, 0.04], [1.1, 2.1, 0.08], { tile: 'door', keepUV: true, color, emissive: 1 }, null, MM);
  B.box([0, 2.2, 0.06], [1.35, 0.12, 0.12], { color: TRIM }, null, MM);
  for (const sx of [-1, 1]) B.box([sx * 0.62, 1.05, 0.06], [0.12, 2.2, 0.1], { color: TRIM }, null, MM);
  if (canopy) {
    B.box([0, 2.55, 0.55], [1.7, 0.08, 1.2], { tile: 'roof_dark', tileMeters: TM }, [0.35, 0, 0], MM);
    for (const sx of [-1, 1]) B.tube([sx * 0.7, 2.25, 0.08], [sx * 0.7, 2.55, 0.95], 0.04, 0.04, { color: TRIM }, 4, MM);
  }
  // porch lamp
  B.box([0.85, 1.9, 0.12], [0.16, 0.22, 0.16], { tile: 'lamp', keepUV: true, emissive: 2 }, null, MM);
  B.box([0.85, 2.04, 0.12], [0.2, 0.06, 0.2], { color: 0x2a2a2e }, null, MM);
}

function stilts(B, M, w, d, y0, terrain, Mworld, { extraFront = 0 } = {}) {
  const xs = [], zs = [];
  const nx = Math.max(2, Math.round(w / 2.4) + 1), nz = Math.max(2, Math.round((d + extraFront) / 2.4) + 1);
  for (let i = 0; i < nx; i++) xs.push(-w / 2 + 0.2 + (i * (w - 0.4)) / (nx - 1));
  for (let j = 0; j < nz; j++) zs.push(-d / 2 + 0.2 + (j * (d - 0.4 + extraFront)) / (nz - 1));
  for (const x of xs) for (const z of zs) {
    const wp = toWorld(Mworld, x, 0, z);
    const g = Math.min(terrain.heightAt(wp.x, wp.z), 0) - 1.2;
    const bottom = Math.min(g, terrain.heightAt(wp.x, wp.z)) - y0;
    B.box([x, bottom / 2 - 0.15, z], [0.28, -bottom, 0.28], { tile: 'woodDark', tileMeters: 1.25, tileMetersV: 2.5 }, null, M);
  }
  // cross bracing between outer stilts
  for (const z of [zs[0], zs[zs.length - 1]]) {
    for (let i = 0; i < xs.length - 1; i++) {
      B.tube([xs[i], -0.4, z], [xs[i + 1], -2.2, z], 0.06, 0.06, { color: 0x4a3426 }, 4, M);
    }
  }
}

// ---------------------------------------------------------------- building types
function house(ctx, B, b) {
  const { terrain, physics } = ctx;
  const fh = footprintHeights(terrain, b);
  const y0 = b.stilts ? L.BOARDWALK[0].h + 0.02 : fh.mx + 0.35;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const w = b.w, d = b.d, H = b.floors * 2.7 + 0.3;
  const sid = `siding_${b.color}`;
  // walls
  B.box([0, H / 2, 0], [w, H, d], { tile: sid, tileMeters: TM }, null, M);
  // trim: corners + skirt
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box([sx * (w / 2), H / 2, sz * (d / 2)], [0.2, H + 0.02, 0.2], { color: TRIM }, null, M);
  B.box([0, 0.08, 0], [w + 0.12, 0.18, d + 0.12], { color: TRIM }, null, M);
  if (b.floors > 1) B.box([0, 2.85, 0], [w + 0.08, 0.14, d + 0.08], { color: TRIM }, null, M);
  // roof (gable towards the front, Telegraph Cove style)
  const rise = gableRoof(B, M, w, d, H, { tile: ROOF[b.roof] || 'roof_dark', ridgeAlong: 'z', gableTile: sid, pitch: 0.85 });
  // gable window
  windowAt(B, M, 0, H + rise * 0.38, d / 2, 'front', { tile: 'windowCream', w: 0.7, h: 0.8, box: false });
  // foundation
  if (!b.stilts) {
    const depth = y0 - fh.mn + 0.4;
    B.box([0, -depth / 2, 0], [w + 0.3, depth, d + 0.3], { tile: 'stone', tileMeters: 2 }, null, M);
  } else {
    stilts(B, M, w, d, y0, terrain, M, { extraFront: 0 });
    // floor deck + front porch joining the boardwalk
    B.box([0, -0.12, 0], [w + 0.2, 0.24, d + 0.2], { tile: 'planksDark', tileMeters: 2.5 }, null, M);
  }
  // front: door + windows
  const shut = SHUTTERS[b.color];
  const doorX = b.sign ? 0 : -w / 4;
  doorAt(B, M, doorX, 0, d / 2, 'front', DOORS[b.color] ?? 0x3a6a4a);
  const nW = Math.max(1, Math.floor((w - 1.5) / 2.6));
  for (let f = 0; f < b.floors; f++) {
    for (let i = 0; i < nW + 1; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / (nW + 1);
      if (f === 0 && Math.abs(x - doorX) < 1.3) continue;
      const shop = f === 0 && b.sign && b.kind === 'house' && ['cafe', 'store'].includes(b.id);
      windowAt(B, M, x, 1.55 + f * 2.7, d / 2, 'front', { tile: shop ? 'windowShop' : 'window', w: shop ? 1.6 : 1.0, shutters: shop ? null : shut, box: f === 0 && !shop });
    }
  }
  // sides & back windows
  for (const face of ['left', 'right']) {
    const n = Math.max(1, Math.floor(d / 3));
    for (let f = 0; f < b.floors; f++) for (let i = 0; i < n; i++) {
      const z = -d / 2 + ((i + 0.5) * d) / n;
      windowAt(B, M, face === 'left' ? -w / 2 : w / 2, 1.55 + f * 2.7, z, face, { tile: (i + f) % 2 ? 'windowBlue' : 'window', box: false });
    }
  }
  for (let f = 0; f < b.floors; f++) windowAt(B, M, 0, 1.55 + f * 2.7, -d / 2, 'back', { box: false });
  // sign over the door
  if (b.sign) {
    const t = TILESIZE(`sign:${b.sign}`);
    const sc = Math.min(2.0, (w * 0.7) / (t.w / 25.6));
    B.box([0, H - 0.65, d / 2 + 0.08], [(t.w / 25.6) * sc, (t.h / 25.6) * sc, 0.06], { tile: `sign:${b.sign}`, keepUV: true }, null, M);
    B.box([0, H - 0.65, d / 2 + 0.05], [(t.w / 25.6) * sc + 0.16, (t.h / 25.6) * sc + 0.16, 0.04], { color: 0x2a1a12 }, null, M);
  }
  if (b.id === 'cafe') {
    // chalkboard menu + outdoor table on the porch
    B.box([w / 2 - 0.9, 0.55, d / 2 + 0.9], [0.9, 0.7, 0.06], { tile: 'chalk', keepUV: true }, [-0.25, 0, 0], M);
  }
  // chimney with smoke
  if (b.floors >= 1 && (b.id === 'cafe' || b.id === 'agnes' || b.id === 'gus' || b.id === 'kids' || b.id === 'clinic' || b.id === 'birdie')) {
    const cx = w / 4, cz = -d / 4;
    B.box([cx, H + rise * 0.6, cz], [0.7, rise + 1.2, 0.7], { tile: 'brick', tileMeters: 2 }, null, M);
    ctx.smoke.push(toWorld(M, cx, H + rise * 0.6 + rise / 2 + 0.7, cz));
  }
  // lights
  ctx.lights.push({ pos: toWorld(M, doorX + 0.85, 1.9, d / 2 + 0.3), color: [1.0, 0.7, 0.35], radius: 7, kind: 'lamp' });
  // collision
  physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 0.3, l: d + 0.3, y0: y0 - 0.5, y1: y0 + H + rise });
  // porch platform for stilt houses (between house and boardwalk)
  if (b.stilts) {
    const pz = d / 2 + 1.25;
    const pc = toWorld(M, 0, 0, pz);
    B.box([0, -0.12, pz], [Math.min(w, 5), 0.24, 2.6], { tile: 'planks', tileMeters: 2.5 }, null, M);
    physics.addPlatform({ x: pc.x, z: pc.z, yaw: b.facing || 0, w: Math.min(w, 5), l: 2.6, y0: y0, surface: 'wood' });
  }
  return { M, y0, H, rise };
}

function cabin(ctx, B, b) {
  const { terrain, physics } = ctx;
  const fh = footprintHeights(terrain, b);
  const y0 = fh.mx + 0.45;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const w = b.w, d = b.d, H = 3.0;
  // log walls + protruding corner log ends
  B.box([0, H / 2, 0], [w, H, d], { tile: 'logs', tileMeters: TM }, null, M);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const y = 0.17 + k * 0.32;
      B.box([sx * (w / 2 + 0.05), y, sz * (d / 2)], [0.5, 0.26, 0.28], { tile: 'logs', tileMeters: TM }, null, M);
      B.box([sx * (w / 2), y + 0.16, sz * (d / 2 + 0.05)], [0.28, 0.26, 0.5], { tile: 'logs', tileMeters: TM }, null, M);
    }
  }
  const rise = gableRoof(B, M, w, d, H, { tile: ROOF[b.roof] || 'roof_moss', ridgeAlong: 'x', gableTile: 'logs', pitch: 0.9, oh: 0.55 });
  // foundation stones
  const depth = y0 - fh.mn + 0.4;
  B.box([0, -depth / 2, 0], [w + 0.2, depth, d + 0.2], { tile: 'stone', tileMeters: 2 }, null, M);
  // door & windows (front is +z)
  const doorColor = DOORS[b.color] ?? 0x3a6a4a;
  doorAt(B, M, 0, 0, d / 2, 'front', doorColor, { canopy: !b.porch });
  for (const x of [-w / 3, w / 3]) windowAt(B, M, x, 1.5, d / 2, 'front', { tile: 'windowCream', shutters: 0x3a6a4a, box: true });
  windowAt(B, M, -w / 2, 1.5, 0, 'left', { tile: 'windowCream', box: false });
  windowAt(B, M, 0, 1.5, -d / 2, 'back', { tile: 'windowCream', box: false });
  // exterior stone chimney on the right gable end
  if (b.chimney || b.id === 'gus' || b.id === 'trapperHut') {
    const cx = w / 2 + 0.55;
    B.box([cx, (H + rise + 1.2 - (y0 - fh.mn)) / 2, -d * 0.15], [1.1, H + rise + 1.2 + (y0 - fh.mn), 1.3], { tile: 'stone', tileMeters: 2 }, null, M);
    B.box([cx, H + rise + 1.25, -d * 0.15], [1.3, 0.15, 1.5], { tile: 'stone', tileMeters: 2 }, null, M);
    ctx.smoke.push(toWorld(M, cx, H + rise + 1.5, -d * 0.15));
  }
  physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 1.2, l: d + 0.4, y0: y0 - 1, y1: y0 + H + rise });
  if (b.porch) {
    // wide porch with railing, posts and a shed roof
    const pd = 2.8;
    const pz = d / 2 + pd / 2;
    B.box([0, -0.1, pz], [w + 0.6, 0.2, pd], { tile: 'planks', tileMeters: 2.5 }, null, M);
    B.box([0, -(y0 - fh.mn) / 2 - 0.2, pz], [w + 0.6, y0 - fh.mn, pd - 0.2], { tile: 'woodDark', tileMeters: 1.25 }, null, M);
    for (let i = 0; i <= 4; i++) {
      const x = -w / 2 - 0.2 + (i * (w + 0.4)) / 4;
      B.box([x, 1.25, d / 2 + pd - 0.15], [0.22, 2.5, 0.22], { tile: 'logs', tileMeters: TM }, null, M);
      if (i < 4 && i !== 2) {
        const x2 = -w / 2 - 0.2 + ((i + 1) * (w + 0.4)) / 4;
        for (const ry of [0.45, 0.9]) B.box([(x + x2) / 2, ry, d / 2 + pd - 0.15], [x2 - x, 0.1, 0.1], { color: 0x8a5a30 }, null, M);
      }
    }
    // porch roof
    B.box([0, H - 0.25, d / 2 + pd / 2 + 0.1], [w + 1.0, 0.12, pd + 0.6], { tile: ROOF[b.roof] || 'roof_moss', tileMeters: TM }, [0.28, 0, 0], M);
    // steps
    for (let k = 0; k < 3; k++) B.box([0, -0.2 - k * 0.18, d / 2 + pd + 0.2 + k * 0.32], [1.6, 0.18, 0.34], { tile: 'planks', tileMeters: 2.5 }, null, M);
    // sign hanging from the porch beam
    if (b.id === 'nana') {
      const t = TILESIZE("sign:NANA'S COCOA");
      // hung low enough that the sloped porch roof doesn't clip the lettering
      B.box([0, 1.92, d / 2 + pd - 0.05], [(t.w / 25.6) * 1.45, (t.h / 25.6) * 1.45, 0.06], { tile: "sign:NANA'S COCOA", keepUV: true }, null, M);
      for (const sx of [-1.6, 1.6]) B.tube([sx, 2.28, d / 2 + pd - 0.05], [sx, 2.5, d / 2 + pd - 0.1], 0.015, 0.015, { color: 0x2a2a2a }, 3, M);
      // rocking chair, quilt, pumpkins, lantern
      rockingChair(B, M, -w / 3, 0, d / 2 + 1.1);
      B.box([w / 3, 0.45, d / 2 + 0.5], [1.6, 0.08, 0.5], { color: 0x8a5a30 }, null, M);
      B.box([w / 3, 0.52, d / 2 + 0.5], [1.4, 0.06, 0.45], { tile: 'quilt', keepUV: true }, null, M);
      for (const [px, s] of [[1.0, 0.32], [1.5, 0.24], [-1.2, 0.28]]) pumpkin(B, M, px, s, d / 2 + pd - 0.5, s);
      B.box([0.9, 2.0, d / 2 + 0.15], [0.2, 0.28, 0.2], { tile: 'lamp', keepUV: true, emissive: 2 }, null, M);
      ctx.lights.push({ pos: toWorld(M, 0.9, 2.0, d / 2 + 0.6), color: [1.0, 0.68, 0.32], radius: 9, kind: 'lamp', always: false });
    }
    const pc = toWorld(M, 0, 0, pz);
    physics.addPlatform({ x: pc.x, z: pc.z, yaw: b.facing || 0, w: w + 0.6, l: pd, y0: y0, surface: 'wood' });
  }
  // warm firelight inside
  ctx.lights.push({ pos: toWorld(M, 0, 1.5, d / 2 + 1.0), color: [1.0, 0.55, 0.25], radius: 6, kind: 'window' });
  return { M, y0, H };
}

function shed(ctx, B, b) {
  const { terrain, physics } = ctx;
  const fh = footprintHeights(terrain, b);
  const y0 = fh.mx + 0.15;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const w = b.w, d = b.d, H = b.kind === 'outhouse' ? 2.2 : 3.2;
  const tile = b.kind === 'outhouse' ? 'battenGrey' : 'battenRed';
  B.box([0, H / 2, 0], [w, H, d], { tile, tileMeters: TM }, null, M);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box([sx * (w / 2), H / 2, sz * (d / 2)], [0.16, H, 0.16], { color: TRIM }, null, M);
  const depth = y0 - fh.mn + 0.3;
  B.box([0, -depth / 2, 0], [w + 0.1, depth, d + 0.1], { tile: 'stone', tileMeters: 2 }, null, M);
  if (b.kind === 'outhouse') {
    B.box([0, H + 0.2, 0], [w + 0.4, 0.12, d + 0.5], { tile: 'roof_rust', tileMeters: TM }, [0.3, 0, 0], M);
    B.box([0, 0.95, d / 2 + 0.04], [0.8, 1.9, 0.06], { tile: 'battenGrey', tileMeters: 2.5, color: 0xc8b8a0 }, null, M);
    // the crescent moon
    B.box([0.05, 1.6, d / 2 + 0.08], [0.16, 0.24, 0.02], { color: 0x1a1414 }, null, M);
    B.box([0.1, 1.6, d / 2 + 0.09], [0.12, 0.2, 0.02], { color: 0xc8b8a0 }, null, M);
  } else {
    const rise = gableRoof(B, M, w, d, H, { tile: ROOF[b.roof] || 'roof_rust', ridgeAlong: 'z', gableTile: tile, pitch: 0.7 });
    // big double barn doors with white X-braces
    for (const sx of [-1, 1]) {
      const cx = sx * 0.62;
      B.box([cx, 1.2, d / 2 + 0.05], [1.22, 2.4, 0.08], { tile: 'battenGrey', tileMeters: 2.5, color: 0xd8c8b8 }, null, M);
      B.tube([cx - 0.5, 0.15, d / 2 + 0.1], [cx + 0.5, 2.25, d / 2 + 0.1], 0.05, 0.05, { color: TRIM }, 4, M);
      B.tube([cx + 0.5, 0.15, d / 2 + 0.1], [cx - 0.5, 2.25, d / 2 + 0.1], 0.05, 0.05, { color: TRIM }, 4, M);
    }
    const t = TILESIZE('sign:GARAGE');
    B.box([0, 2.85, d / 2 + 0.06], [(t.w / 25.6) * 1.1, (t.h / 25.6) * 1.1, 0.05], { tile: 'sign:GARAGE', keepUV: true }, null, M);
    windowAt(B, M, w / 2, 1.6, 0, 'right', { box: false });
    // tools on the outside wall
    B.tube([-w / 2 - 0.05, 0.4, 0.8], [-w / 2 - 0.05, 1.7, 1.0], 0.03, 0.03, { color: 0x8a5a30 }, 3, M);
    B.box([-w / 2 - 0.06, 1.75, 1.02], [0.04, 0.2, 0.3], { color: 0x8a8a90 }, null, M);
    B.box([0, 2.55, d / 2 + 0.25], [0.24, 0.24, 0.24], { tile: 'lamp', keepUV: true, emissive: 2 }, null, M);
    ctx.lights.push({ pos: toWorld(M, 0, 2.5, d / 2 + 0.8), color: [1.0, 0.72, 0.4], radius: 8, kind: 'lamp' });
    physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 0.2, l: d + 0.2, y0: y0 - 1, y1: y0 + H + rise });
    return { M, y0, H };
  }
  physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 0.2, l: d + 0.2, y0: y0 - 1, y1: y0 + H });
  return { M, y0, H };
}

function chapel(ctx, B, b) {
  const { terrain, physics } = ctx;
  const fh = footprintHeights(terrain, b);
  const y0 = fh.mx + 0.4;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const w = b.w, d = b.d, H = 4.2;
  B.box([0, H / 2, 0], [w, H, d], { tile: 'siding_white', tileMeters: TM }, null, M);
  const rise = gableRoof(B, M, w, d, H, { tile: 'roof_dark', ridgeAlong: 'z', gableTile: 'siding_white', pitch: 1.3 });
  B.box([0, -(y0 - fh.mn + 0.4) / 2, 0], [w + 0.3, y0 - fh.mn + 0.4, d + 0.3], { tile: 'stone', tileMeters: 2 }, null, M);
  for (const face of ['left', 'right']) for (let i = 0; i < 3; i++) {
    windowAt(B, M, face === 'left' ? -w / 2 : w / 2, 2.2, -d / 2 + 2 + i * ((d - 4) / 2), face, { tile: 'stained', w: 0.8, h: 1.8, box: false });
  }
  // steeple tower at the front
  const tz = d / 2 + 1.0;
  B.box([0, (H + 3.5) / 2, tz], [2.4, H + 3.5, 2.4], { tile: 'siding_white', tileMeters: TM }, null, M);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box([sx * 1.2, (H + 3.5) / 2, tz + sz * 1.2], [0.18, H + 3.5, 0.18], { color: TRIM }, null, M);
  // belfry openings + bell
  B.box([0, H + 2.4, tz + 1.22], [1.0, 1.2, 0.04], { color: 0x1a1418 }, null, M);
  B.box([0, H + 2.4, tz - 1.22], [1.0, 1.2, 0.04], { color: 0x1a1418 }, null, M);
  B.tube([0, H + 2.7, tz], [0, H + 2.1, tz], 0.18, 0.38, { color: 0xc89a3a }, 8, M);
  // spire
  const top = H + 3.5, sp = 4.5;
  const c = [[-1.35, top, tz - 1.35], [1.35, top, tz - 1.35], [1.35, top, tz + 1.35], [-1.35, top, tz + 1.35]];
  for (let i = 0; i < 4; i++) B.poly([c[i], c[(i + 1) % 4], [0, top + sp, tz]].reverse(), { tile: 'roof_dark', tileMeters: TM }, M);
  B.tube([0, top + sp - 0.1, tz], [0, top + sp + 1.0, tz], 0.05, 0.05, { color: 0xf2c443 }, 4, M);
  B.tube([-0.3, top + sp + 0.7, tz], [0.3, top + sp + 0.7, tz], 0.05, 0.05, { color: 0xf2c443 }, 4, M);
  doorAt(B, M, 0, 0, tz + 1.2, 'front', 0x8a2a24, { canopy: false });
  physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 0.3, l: d + 0.3, y0: y0 - 1, y1: y0 + 20 });
  const tw = toWorld(M, 0, 0, tz);
  physics.addBox({ x: tw.x, z: tw.z, yaw: b.facing || 0, w: 2.6, l: 2.6, y0: y0 - 1, y1: y0 + 20 });
  ctx.lights.push({ pos: toWorld(M, 0, 2.5, tz + 2), color: [1.0, 0.7, 0.4], radius: 7, kind: 'lamp' });
  return { M, y0, H };
}

function lighthouse(ctx, B, b) {
  const { terrain, physics } = ctx;
  const y0 = terrain.heightAt(b.x, b.z) - 0.2;
  const M = buildingMatrix(b.x, y0, b.z, 0);
  B.geom(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 10), [0, 0.3, 0], null, [1, 1, 1], { tile: 'stone', tileMeters: 2 }, M);
  const Ht = 13;
  for (let i = 0; i < 4; i++) {
    const y1 = i * (Ht / 4), y2 = (i + 1) * (Ht / 4);
    const r1 = 2.2 - (y1 / Ht) * 0.7, r2 = 2.2 - (y2 / Ht) * 0.7;
    B.geom(new THREE.CylinderGeometry(r2, r1, y2 - y1, 8, 1, true), [0, 0.9 + (y1 + y2) / 2, 0], null, [1, 1, 1], { tile: i % 2 ? 'siding_red' : 'siding_white', tileMeters: TM }, M);
  }
  const ty = 0.9 + Ht;
  B.geom(new THREE.CylinderGeometry(2.1, 2.1, 0.25, 12), [0, ty + 0.1, 0], null, [1, 1, 1], { color: 0x2a2a30 }, M);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    B.tube([Math.cos(a) * 1.95, ty + 0.2, Math.sin(a) * 1.95], [Math.cos(a) * 1.95, ty + 1.1, Math.sin(a) * 1.95], 0.03, 0.03, { color: 0x2a2a30 }, 3, M);
  }
  B.geom(new THREE.TorusGeometry(1.95, 0.04, 3, 16), [0, ty + 1.1, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { color: 0x2a2a30 }, M);
  B.geom(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8, 1, true), [0, ty + 1.0, 0], null, [1, 1, 1], { tile: 'lamp', keepUV: true, emissive: 3 }, M);
  B.geom(new THREE.ConeGeometry(1.5, 1.4, 8), [0, ty + 2.5, 0], null, [1, 1, 1], { tile: 'roof_red', tileMeters: TM }, M);
  B.geom(new THREE.SphereGeometry(0.25, 6, 4), [0, ty + 3.3, 0], null, [1, 1, 1], { color: 0x2a2a30 }, M);
  doorAt(B, M, 0, 0.9, 2.15, 'front', 0x8a2a24, { canopy: false });
  physics.addCircle({ x: b.x, z: b.z, r: 3.4, y0: y0 - 1, y1: y0 + 30, kind: 'lighthouse' });
  ctx.lights.push({ pos: toWorld(M, 0, ty + 1.0, 0), color: [1.0, 0.85, 0.5], radius: 30, kind: 'beacon' });
  ctx.beacon = toWorld(M, 0, ty + 1.0, 0);
  return { M, y0 };
}

function sawmill(ctx, B, b) {
  const { terrain, physics } = ctx;
  const fh = footprintHeights(terrain, b);
  const y0 = fh.mx + 0.2;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const w = b.w, d = b.d, H = 4.4;
  // open shed: posts, back wall, half side walls
  for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) B.box([-w / 2 + (i * w) / 4, H / 2, sz * (d / 2)], [0.35, H, 0.35], { tile: 'woodDark', tileMeters: 1.25, tileMetersV: 2.5 }, null, M);
  B.box([0, H / 2, -d / 2], [w, H, 0.2], { tile: 'battenGrey', tileMeters: TM }, null, M);
  for (const sx of [-1, 1]) B.box([sx * (w / 2), 1.0, 0], [0.2, 2.0, d], { tile: 'battenGrey', tileMeters: TM }, null, M);
  gableRoof(B, M, w, d, H, { tile: 'roof_rust', ridgeAlong: 'x', gableTile: 'battenGrey', pitch: 0.55, oh: 0.6 });
  B.box([0, 0.1, 0], [w, 0.2, d], { tile: 'planksDark', tileMeters: 2.5 }, null, M);
  // saw table + giant blade
  B.box([0, 0.6, 0.5], [6, 0.8, 1.2], { tile: 'woodDark', tileMeters: 1.25 }, null, M);
  B.geom(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 20), [0, 1.2, 0.5], [0, 0, Math.PI / 2], [1, 1, 1], { color: 0xc8ccd4 }, M);
  // log piles
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
    const x = -w / 2 + 2 + k * 0.7 + r * 0.35, y = 0.55 + r * 0.6;
    B.geom(new THREE.CylinderGeometry(0.32, 0.32, 4.5, 7), [x, y, d / 2 + 2.0], [Math.PI / 2, 0, 0], [1, 1, 1], { tile: 'logs', tileMeters: TM }, M);
  }
  const t = TILESIZE('sign:SAWMILL');
  B.box([0, H - 0.4, d / 2 + 0.2], [(t.w / 25.6) * 1.4, (t.h / 25.6) * 1.4, 0.06], { tile: 'sign:SAWMILL', keepUV: true }, null, M);
  physics.addBox({ x: b.x, z: b.z, yaw: b.facing || 0, w: w + 0.4, l: d + 0.4, y0: y0 - 1, y1: y0 + H + 2 });
  const lp = toWorld(M, -w / 2 + 3.4, 0, d / 2 + 2.0);
  physics.addBox({ x: lp.x, z: lp.z, yaw: b.facing || 0, w: 3.4, l: 4.6, y0: y0 - 1, y1: y0 + 2 });
  ctx.lights.push({ pos: toWorld(M, 0, H - 0.5, 0), color: [1.0, 0.75, 0.45], radius: 9, kind: 'lamp' });
  return { M, y0, H };
}

// ---------------------------------------------------------------- little props shared with props.js
export function pumpkin(B, M, x, y, z, s = 0.3) {
  { const w = M ? toWorld(M, x, y, z) : { x, y, z }; if (decor('pumpkin', w.x, w.y, w.z, { s })) return; }
  B.geom(new THREE.SphereGeometry(s, 8, 6), [x, y + s * 0.8, z], null, [1.15, 0.85, 1.15], { color: 0xe8701e }, M);
  for (let k = 0; k < 4; k++) B.geom(new THREE.SphereGeometry(s * 0.98, 6, 5), [x, y + s * 0.8, z], [0, (k * Math.PI) / 4, 0], [0.4, 0.86, 1.18], { color: 0xd05a14 }, M);
  B.tube([x, y + s * 1.45, z], [x + 0.03, y + s * 1.8, z], 0.035, 0.03, { color: 0x4a6a2a }, 4, M);
}

export function rockingChair(B, M, x, y, z) {
  if (M) { const w = toWorld(M, x, y, z); const e = new THREE.Euler().setFromRotationMatrix(M); if (decor('rocker', w.x, w.y, w.z, { yaw: e.y })) return; }
  const c = { color: 0x7a4a24 };
  B.box([x, y + 0.45, z], [0.55, 0.06, 0.5], c, null, M);
  B.box([x, y + 0.85, z - 0.25], [0.55, 0.8, 0.06], c, [-0.15, 0, 0], M);
  for (const sx of [-0.25, 0.25]) {
    B.geom(new THREE.TorusGeometry(0.5, 0.03, 3, 8, 1.2), [x + sx, y + 0.5, z], [0, Math.PI / 2, Math.PI + 0.97], [1, 1, 1], c, M);
    B.tube([x + sx, y + 0.08, z - 0.2], [x + sx, y + 0.45, z - 0.2], 0.025, 0.025, c, 3, M);
    B.tube([x + sx, y + 0.08, z + 0.2], [x + sx, y + 0.45, z + 0.2], 0.025, 0.025, c, 3, M);
  }
}

import { TILES, TILE_DENSITY } from '../render/builder.js';
function TILESIZE(name) {
  const t = TILES[name];
  if (!t) return { w: 32, h: 16 };
  const k = TILE_DENSITY[name] || 1;
  return { w: Math.round((t[2] * 1024) / k), h: Math.round((-t[3] * 1024) / k) };
}
export { TILESIZE };

// Kinds that only exist as voxel models: just a floor height and a collision box here;
// the voxel model adds its own porches/decks and extra solids from its meta (voxelWorld.js).
const GENERIC = {
  shop: { lift: 0.3, H: (b) => b.floors * 2.75 + 2.6 },
  firehall: { lift: 0.2, H: (b) => 8.5 },
  barn: { lift: 0.15, H: (b) => 9.5 },
  sugarshack: { lift: 0.3, H: (b) => 5.5 },
  gazebo: { lift: 0.05, H: () => 5.6, open: true },
  lifeguard: { lift: 0.0, H: () => 4.2, open: true },
};
function generic(ctx, B, b) {
  const { terrain, physics } = ctx;
  const g = GENERIC[b.kind];
  const fh = footprintHeights(terrain, b);
  const y0 = (g.open ? fh.mn : fh.mx) + g.lift;
  const M = buildingMatrix(b.x, y0, b.z, b.facing || 0);
  const H = g.H(b);
  // a recessed shopfront (the general store's porch) leaves its front strip walkable
  const rec = b.recess || 0, f = b.facing || 0;
  const cx = b.x - Math.sin(f) * rec / 2, cz = b.z - Math.cos(f) * rec / 2;
  if (!g.open) physics.addBox({ x: cx, z: cz, yaw: f, w: b.w + 0.2, l: b.d - rec + 0.2, y0: y0 - 1, y1: y0 + H });
  return { M, y0, H, generic: true };
}

export function buildBuildings(ctx, B, list = L.BUILDINGS) {
  const out = {};
  for (const b of list) {
    let r;
    if (b.kind === 'house') r = house(ctx, B, b);
    else if (b.kind === 'cabin') r = cabin(ctx, B, b);
    else if (b.kind === 'shed' || b.kind === 'outhouse') r = shed(ctx, B, b);
    else if (b.kind === 'chapel') r = chapel(ctx, B, b);
    else if (b.kind === 'lighthouse') r = lighthouse(ctx, B, b);
    else if (b.kind === 'sawmill') r = sawmill(ctx, B, b);
    else if (GENERIC[b.kind]) r = generic(ctx, B, b);
    out[b.id] = r;
  }
  return out;
}
