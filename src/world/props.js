// Infrastructure & props: covered bridge, boardwalk, docks & boats, ramps,
// graveyard, homestead clutter, the village fall fair, lookout, beaver dam...
import * as THREE from 'three';
import * as L from './layout.js';
import { buildingMatrix, toWorld, pumpkin, TILESIZE } from './buildings.js';
import { RNG } from '../core/noise.js';
import { decor, DECOR } from './decor.js';
import { nearestRoad } from './terrain.js';
import { Builder } from '../render/builder.js';

const TRIM = 0xf2ece0;
const WOOD = 0x7a5232;

function segFrame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  return { len, yaw: Math.atan2(dx, dz), cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2 };
}

function signAt(B, M, text, x, y, z, scale = 1.2, post = true) {
  const t = TILESIZE(`sign:${text}`);
  const w = (t.w / 25.6) * scale, h = (t.h / 25.6) * scale;
  B.box([x, y, z], [w, h, 0.08], { tile: `sign:${text}`, keepUV: true }, null, M);
  B.box([x, y, z - 0.05], [w + 0.1, h + 0.1, 0.04], { color: 0x3a2414 }, null, M);
  if (post) for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) B.box([x + sx, y / 2, z - 0.08], [0.12, y + h / 2, 0.12], { color: WOOD }, null, M);
}

function lampPost(ctx, B, x, y, z, { lantern = true } = {}) {
  if (decor('lamp', x, y, z, { yaw: Math.PI / 2 })) {
    ctx.lights.push({ pos: new THREE.Vector3(x, y + 2.9, z), color: [1.0, 0.72, 0.38], radius: 11, kind: 'street' });
    ctx.physics.addCircle({ x, z, r: 0.18, y0: y - 1, y1: y + 3.3, kind: 'post' });
    return;
  }
  const M = buildingMatrix(x, y, z, 0);
  B.box([0, 1.6, 0], [0.12, 3.2, 0.12], { tile: 'metal', tileMeters: 1 }, null, M);
  B.box([0, 0.12, 0], [0.3, 0.24, 0.3], { tile: 'metal', tileMeters: 1 }, null, M);
  B.tube([0, 3.0, 0], [0.45, 3.15, 0], 0.035, 0.035, { color: 0x2a2a30 }, 4, M);
  if (lantern) {
    B.box([0.45, 2.88, 0], [0.26, 0.34, 0.26], { tile: 'lamp', keepUV: true, emissive: 2 }, null, M);
    B.box([0.45, 3.08, 0], [0.34, 0.08, 0.34], { color: 0x2a2a30 }, null, M);
  }
  ctx.lights.push({ pos: new THREE.Vector3(x + 0.45, y + 2.85, z), color: [1.0, 0.72, 0.38], radius: 11, kind: 'street' });
  ctx.physics.addCircle({ x, z, r: 0.18, y0: y - 1, y1: y + 3.3, kind: 'post' });
}

function bench(ctx, B, x, y, z, yaw) {
  if (decor('bench', x, y, z, { yaw })) return ctx.physics.addBox({ x, z, yaw, w: 1.6, l: 0.5, y0: y - 0.5, y1: y + 0.9, kind: 'bench' });
  const M = buildingMatrix(x, y, z, yaw);
  B.box([0, 0.45, 0], [1.6, 0.06, 0.45], { tile: 'planks', tileMeters: 2.5 }, null, M);
  B.box([0, 0.75, -0.2], [1.6, 0.35, 0.05], { tile: 'planks', tileMeters: 2.5 }, [-0.12, 0, 0], M);
  for (const sx of [-0.7, 0.7]) B.box([sx, 0.22, 0], [0.08, 0.45, 0.4], { color: 0x2a2a30 }, null, M);
  ctx.physics.addBox({ x, z, yaw, w: 1.6, l: 0.5, y0: y - 0.5, y1: y + 0.9, kind: 'bench' });
}

function crateStack(ctx, B, x, y, z, yaw, n = 2) {
  if (decor('crates', x, y, z, { yaw, n })) return ctx.physics.addBox({ x, z, yaw, w: 1.2, l: 0.8, y0: y - 0.5, y1: y + 1.2, kind: 'crate' });
  const M = buildingMatrix(x, y, z, yaw);
  for (let i = 0; i < n; i++) B.box([i % 2 ? 0.45 : 0, 0.3 + Math.floor(i / 2) * 0.6, i % 2 ? 0.1 : 0], [0.6, 0.6, 0.6], { tile: 'crate', keepUV: true }, [0, i * 0.3, 0], M);
  ctx.physics.addBox({ x, z, yaw, w: 1.2, l: 0.8, y0: y - 0.5, y1: y + 1.2, kind: 'crate' });
}

function barrelAt(ctx, B, x, y, z) {
  if (decor('barrel', x, y, z)) return ctx.physics.addCircle({ x, z, r: 0.35, y0: y - 0.5, y1: y + 1, kind: 'barrel' });
  const M = buildingMatrix(x, y, z, 0);
  B.geom(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 8), [0, 0.45, 0], null, [1, 1, 1], { tile: 'barrel', keepUV: true }, M);
  B.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 8), [0, 0.91, 0], null, [1, 1, 1], { color: 0x6a4224 }, M);
  ctx.physics.addCircle({ x, z, r: 0.35, y0: y - 0.5, y1: y + 1, kind: 'barrel' });
}

function hayBale(ctx, B, x, y, z, yaw) {
  if (decor('hay', x, y, z, { yaw })) return ctx.physics.addBox({ x, z, yaw, w: 1.1, l: 0.6, y0: y - 0.5, y1: y + 0.7, kind: 'hay' });
  const M = buildingMatrix(x, y, z, yaw);
  B.box([0, 0.35, 0], [1.1, 0.7, 0.6], { tile: 'hay', keepUV: true }, null, M);
  ctx.physics.addBox({ x, z, yaw, w: 1.1, l: 0.6, y0: y - 0.5, y1: y + 0.7, kind: 'hay' });
}

function fencePosts(ctx, B, pts, { color = 0x2a2a30, height = 1.1, spacing = 2.2, rails = 2, iron = false, collide = true } = {}) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = ctx.terrain.heightAt(x, z);
      B.box([x, y + height / 2, z], [0.1, height, 0.1], { color }, null, null);
      if (iron) B.box([x, y + height + 0.08, z], [0.06, 0.16, 0.06], { color: 0x4a4a52 }, [0, Math.PI / 4, Math.PI / 4], null);
      if (i < n) {
        const t2 = (i + 1) / n;
        const x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2;
        const y2 = ctx.terrain.heightAt(x2, z2);
        for (let r = 0; r < rails; r++) {
          const hh = height * (0.35 + (0.55 * r) / Math.max(1, rails - 1));
          B.tube([x, y + hh, z], [x2, y2 + hh, z2], iron ? 0.025 : 0.05, iron ? 0.025 : 0.05, { color }, 4);
        }
        if (iron) for (let q = 1; q < 6; q++) {
          const tq = q / 6;
          const xq = x + (x2 - x) * tq, zq = z + (z2 - z) * tq, yq = y + (y2 - y) * tq;
          B.box([xq, yq + height * 0.45, zq], [0.04, height * 0.9, 0.04], { color }, null, null);
        }
        if (collide) {
          const f = segFrame([x, z], [x2, z2]);
          ctx.physics.addBox({ x: f.cx, z: f.cz, yaw: f.yaw, w: 0.2, l: f.len, y0: Math.min(y, y2) - 0.5, y1: Math.max(y, y2) + height, kind: 'fence' });
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the covered bridge
function coveredBridge(ctx, B) {
  const { terrain, physics } = ctx;
  const c = L.POI.bridge;
  // align with the road where it crosses the creek
  const near = nearestRoad(c.x, c.z, ['main']);
  const yaw = Math.atan2(near.dx, near.dz);
  const len = 24, w = 5.2;
  const ax = c.x - Math.sin(yaw) * len / 2, az = c.z - Math.cos(yaw) * len / 2;
  const bx = c.x + Math.sin(yaw) * len / 2, bz = c.z + Math.cos(yaw) * len / 2;
  const h0 = terrain.heightAt(ax, az), h1 = terrain.heightAt(bx, bz);
  const deck = Math.max(2.6, (h0 + h1) / 2);
  const M = buildingMatrix(c.x, deck, c.z, yaw);
  // the voxel bridge stands in for this geometry (physics below still applies)
  const voxel = DECOR.on && decor('bridge', c.x, deck, c.z, { yaw, len, w });
  if (voxel) B = new Builder();
  // deck & stringers
  B.box([0, -0.12, 0], [len, 0.24, w], { tile: 'planks', tileMeters: 2.5 }, [0, Math.PI / 2, 0], M);
  for (const sx of [-w / 2 + 0.3, 0, w / 2 - 0.3]) B.box([sx, -0.45, 0], [0.3, 0.45, len], { tile: 'woodDark', tileMeters: 1.25, tileMetersV: 2.5 }, null, M);
  // piers into the creek
  for (const z of [-len / 2 + 1, -len / 6, len / 6, len / 2 - 1]) {
    for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) {
      const wp = toWorld(M, sx, 0, z);
      const bottom = Math.min(terrain.heightAt(wp.x, wp.z), -0.5) - 1 - deck;
      B.box([sx, bottom / 2, z], [0.4, -bottom, 0.4], { tile: 'woodDark', tileMeters: 1.25, tileMetersV: 2.5 }, null, M);
    }
  }
  // red covered-bridge walls with a strip of windows, and a roof
  const H = 3.8;
  for (const sx of [-1, 1]) {
    B.box([sx * (w / 2 + 0.06), 0.6, 0], [0.12, 1.2, len], { tile: 'battenRed', tileMeters: 2.5 }, null, M);
    B.box([sx * (w / 2 + 0.06), H - 0.7, 0], [0.12, 1.4, len], { tile: 'battenRed', tileMeters: 2.5 }, null, M);
    for (let i = 0; i <= 8; i++) B.box([sx * (w / 2 + 0.06), 1.9, -len / 2 + (i * len) / 8], [0.16, 1.6, 0.25], { tile: 'battenRed', tileMeters: 2.5 }, null, M);
    B.box([sx * (w / 2 + 0.1), 1.25, 0], [0.06, 0.1, len], { color: TRIM }, null, M);
    physics.addBox({ x: toWorld(M, sx * (w / 2 + 0.06), 0, 0).x, z: toWorld(M, sx * (w / 2 + 0.06), 0, 0).z, yaw, w: 0.3, l: len, y0: deck - 1, y1: deck + H, kind: 'wall' });
  }
  // portals
  for (const sz of [-1, 1]) {
    const z = sz * (len / 2);
    B.poly(sz > 0 ? [[-w / 2 - 0.15, H, z], [w / 2 + 0.15, H, z], [0, H + 1.8, z]] : [[w / 2 + 0.15, H, z], [-w / 2 - 0.15, H, z], [0, H + 1.8, z]], { tile: 'battenRed', tileMeters: 2.5 }, M);
    B.box([0, H - 0.25, z], [w + 0.3, 0.5, 0.15], { tile: 'battenRed', tileMeters: 2.5 }, null, M);
    for (const sx of [-1, 1]) B.box([sx * (w / 2 + 0.06), H / 2, z], [0.3, H, 0.3], { color: TRIM }, null, M);
    const t = TILESIZE('sign:BEAVER CREEK');
    B.box([0, H + 0.45, z + sz * 0.1], [(t.w / 25.6) * 1.2, (t.h / 25.6) * 1.2, 0.05], { tile: 'sign:BEAVER CREEK', keepUV: true }, sz > 0 ? null : [0, Math.PI, 0], M);
  }
  const roofW = w / 2 + 0.6;
  const th = Math.atan2(1.8, roofW);
  for (const sgn of [-1, 1]) B.box([(sgn * roofW) / 2, H + 0.9, 0], [roofW / Math.cos(th) + 0.2, 0.14, len + 0.8], { tile: 'roof_dark', tileMeters: 2.5 }, [0, 0, -sgn * th], M);
  // lanterns inside
  for (const z of [-len / 4, len / 4]) {
    B.box([0, H - 0.3, z], [0.22, 0.28, 0.22], { tile: 'lamp', keepUV: true, emissive: 2 }, null, M);
    if (!voxel) ctx.lights.push({ pos: toWorld(M, 0, H - 0.4, z), color: [1.0, 0.7, 0.35], radius: 8, kind: 'lamp' });
  }
  physics.addPlatform({ x: c.x, z: c.z, yaw, w: w, l: len, y0: deck, surface: 'wood', kind: 'bridge' });
  ctx.bridge = { x: c.x, z: c.z, yaw, deck };
}

// ---------------------------------------------------------------- boardwalk & docks
function boardwalk(ctx, B) {
  const { terrain, physics } = ctx;
  for (const s of L.BOARDWALK) {
    const f = segFrame(s.a, s.b);
    const M = buildingMatrix(f.cx, s.h, f.cz, f.yaw);
    B.box([0, -0.1, 0], [f.len, 0.2, s.w], { tile: 'planks', tileMeters: 2.5 }, [0, Math.PI / 2, 0], M);
    // pilings + stringers
    for (let z = -f.len / 2; z <= f.len / 2 + 0.01; z += 2.6) {
      for (const sx of [-s.w / 2 + 0.15, s.w / 2 - 0.15]) {
        const wp = toWorld(M, sx, 0, z);
        const bottom = Math.min(terrain.heightAt(wp.x, wp.z), -0.3) - 1.2 - s.h;
        B.box([sx, bottom / 2, z], [0.3, -bottom, 0.3], { tile: 'woodDark', tileMeters: 1.25, tileMetersV: 2.5 }, null, M);
      }
      B.box([0, -0.35, z], [s.w, 0.25, 0.25], { tile: 'woodDark', tileMeters: 1.25 }, null, M);
    }
    // railing on the water side (local -x faces south for an eastward segment)
    const side = -1;
    for (let z = -f.len / 2; z <= f.len / 2 + 0.01; z += 2.0) {
      B.box([side * (s.w / 2 - 0.08), 0.5, z], [0.12, 1.0, 0.12], { color: TRIM }, null, M);
    }
    for (const ry of [0.55, 1.0]) B.box([side * (s.w / 2 - 0.08), ry, 0], [0.08, 0.08, f.len], { color: TRIM }, null, M);
    const rw = toWorld(M, side * (s.w / 2 - 0.08), 0, 0);
    physics.addBox({ x: rw.x, z: rw.z, yaw: f.yaw, w: 0.25, l: f.len, y0: s.h - 1, y1: s.h + 1.1, kind: 'railing' });
    physics.addPlatform({ x: f.cx, z: f.cz, yaw: f.yaw, w: s.w, l: f.len, y0: s.h, surface: 'wood', kind: 'boardwalk' });
    // lamps, benches, barrels, buoys
    const rng = new RNG(77);
    for (let z = -f.len / 2 + 6; z < f.len / 2 - 3; z += 13) {
      const lp = toWorld(M, side * (s.w / 2 - 0.25), 0, z);
      lampPost(ctx, B, lp.x, s.h, lp.z);
      const bp = toWorld(M, side * (s.w / 2 - 0.55), 0, z + 4.5);
      bench(ctx, B, bp.x, s.h, bp.z, f.yaw - Math.PI / 2);
      if (rng.chance(0.7)) {
        const cp = toWorld(M, -side * (s.w / 2 - 0.5), 0, z + 8);
        if (rng.chance(0.5)) barrelAt(ctx, B, cp.x, s.h, cp.z);
        else crateStack(ctx, B, cp.x, s.h, cp.z, f.yaw, rng.int(1, 3));
      }
      // life ring on the railing
      const rp = toWorld(M, side * (s.w / 2 - 0.02), 0, z + 2);
      B.geom(new THREE.TorusGeometry(0.32, 0.08, 4, 10), [rp.x, s.h + 0.8, rp.z], [0, f.yaw + Math.PI / 2, 0], [1, 1, 1], { color: 0xf06a2a }, null);
    }
  }
  // gangways from the street
  for (const r of L.BOARDWALK_RAMPS) {
    const f = segFrame(r.a, r.b);
    const y0 = terrain.heightAt(r.a[0], r.a[1]) - 0.02;
    const y1 = L.BOARDWALK[0].h;
    const M = buildingMatrix(f.cx, 0, f.cz, f.yaw);
    const g = new THREE.BoxGeometry(r.w, 0.2, f.len);
    // slope the box by shearing its vertices
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + f.len / 2) / f.len;
      p.setY(i, p.getY(i) + y0 + (y1 - y0) * t - 0.1);
      p.setX(i, p.getX(i));
    }
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nrm.getY(i)) > 0.5) uv.setXY(i, (uv.getX(i) * r.w) / 2.5, (uv.getY(i) * f.len) / 2.5);
    }
    g.computeVertexNormals();
    B.geom(g, [0, 0, 0], null, [1, 1, 1], { tile: 'planks' }, M);
    for (let z = -f.len / 2; z <= f.len / 2; z += 2.4) {
      const t = (z + f.len / 2) / f.len;
      const y = y0 + (y1 - y0) * t;
      for (const sx of [-r.w / 2, r.w / 2]) {
        const wp = toWorld(M, sx, 0, z);
        const bottom = Math.min(terrain.heightAt(wp.x, wp.z), y) - 1 - y;
        B.box([sx, y + bottom / 2, z], [0.22, -bottom, 0.22], { tile: 'woodDark', tileMeters: 1.25 }, null, M);
        B.box([sx, y + 0.5, z], [0.1, 1.0, 0.1], { color: TRIM }, null, M);
      }
    }
    for (const sx of [-r.w / 2, r.w / 2]) {
      B.tube([sx, y0 + 1.0, -f.len / 2], [sx, y1 + 1.0, f.len / 2], 0.04, 0.04, { color: TRIM }, 4, M);
      const wp = toWorld(M, sx, 0, 0);
      physics.addBox({ x: wp.x, z: wp.z, yaw: f.yaw, w: 0.2, l: f.len - 0.4, y0: Math.min(y0, y1) - 1, y1: Math.max(y0, y1) + 1.1, kind: 'railing' });
    }
    physics.addPlatform({ x: f.cx, z: f.cz, yaw: f.yaw, w: r.w, l: f.len, y0, y1, surface: 'wood', kind: 'gangway' });
  }
  // floating docks with a ramp down from the boardwalk
  const rng = new RNG(5);
  for (const d of L.DOCKS) {
    const f = segFrame(d.a, d.b);
    const rampLen = 6;
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const r0 = [d.a[0], d.a[1]], r1 = [d.a[0] + fwdX * rampLen, d.a[1] + fwdZ * rampLen];
    const fr = segFrame(r0, r1);
    const Mr = buildingMatrix(fr.cx, 0, fr.cz, f.yaw);
    const y0 = L.BOARDWALK[0].h, y1 = d.h;
    const g = new THREE.BoxGeometry(d.w - 0.6, 0.16, rampLen);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + rampLen / 2) / rampLen;
      p.setY(i, p.getY(i) + y0 + (y1 - y0) * t - 0.08);
    }
    g.computeVertexNormals();
    B.geom(g, [0, 0, 0], null, [1, 1, 1], { tile: 'planksDark' }, Mr);
    physics.addPlatform({ x: fr.cx, z: fr.cz, yaw: f.yaw, w: d.w - 0.6, l: rampLen, y0, y1, surface: 'wood', kind: 'dockRamp' });
    const restLen = f.len - rampLen;
    const dc = [r1[0] + fwdX * restLen / 2, r1[1] + fwdZ * restLen / 2];
    const Md = buildingMatrix(dc[0], d.h, dc[1], f.yaw);
    B.box([0, -0.1, 0], [restLen, 0.2, d.w], { tile: 'planks', tileMeters: 2.5 }, [0, Math.PI / 2, 0], Md);
    B.box([0, -0.42, 0], [d.w - 0.3, 0.45, restLen - 0.3], { color: 0x3a4a4a }, null, Md); // floats
    for (let z = -restLen / 2 + 1; z < restLen / 2; z += 3) for (const sx of [-d.w / 2, d.w / 2]) {
      B.geom(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 5), [sx * 0.9, 0.12, z], null, [1, 1, 1], { color: 0x2a2a2e }, Md);
    }
    physics.addPlatform({ x: dc[0], z: dc[1], yaw: f.yaw, w: d.w, l: restLen, y0: d.h, surface: 'wood', kind: 'dock' });
    // moored boats alongside
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;
      const z = -restLen / 2 + 4 + k * (restLen / 2.2);
      const bp = toWorld(Md, side * (d.w / 2 + 1.6), 0, z);
      ctx.boats.push({ x: bp.x, z: bp.z, yaw: f.yaw + (rng.chance(0.5) ? Math.PI : 0), kind: rng.pick(['fishing', 'fishing', 'rowboat', 'canoe']), hull: rng.pick(['hull', 'hullBlue', 'hullGreen']) });
    }
  }
}

export function boatGeometry(B, kind, hull) {
  if (kind === 'canoe') {
    B.geom(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), [0, 0.35, 0], null, [0.65, 0.6, 4.4], { color: 0xc8361f });
    B.box([0, 0.33, 0], [0.62, 0.05, 3.6], { color: 0x8a5a30 });
    return;
  }
  const L2 = kind === 'rowboat' ? 3.2 : 6.5, W = kind === 'rowboat' ? 1.4 : 2.3;
  // hull as a squashed half-sphere + gunwale
  B.geom(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), [0, 0.65, 0], null, [W, 1.6, L2], { tile: hull, tileMeters: 2.5 });
  B.box([0, 0.66, 0], [W * 0.92, 0.06, L2 * 0.9], { tile: 'planksDark', tileMeters: 2.5 });
  if (kind === 'fishing') {
    B.box([0, 1.5, -0.6], [1.6, 1.6, 1.8], { tile: 'siding_white', tileMeters: 2.5 });
    B.box([0, 2.35, -0.6], [1.9, 0.12, 2.1], { color: 0x2a3a5a });
    B.box([0, 1.7, 0.31], [1.2, 0.5, 0.04], { tile: 'windowBlue', keepUV: true, emissive: 1 });
    B.tube([0, 2.4, -1.2], [0, 4.6, -1.2], 0.05, 0.04, { color: 0xe8e8e8 }, 4);
    B.tube([0, 4.2, -1.2], [0, 3.2, 1.8], 0.015, 0.015, { color: 0x3a3a3a }, 3);
    B.box([0, 4.45, -1.0], [0.45, 0.25, 0.02], { tile: 'flag', keepUV: true });
    for (const sz of [-1.6, 1.4]) B.geom(new THREE.TorusGeometry(0.14, 0.05, 4, 8), [W / 2 * 0.95, 0.75, sz], [0, Math.PI / 2, 0], [1, 1, 1], { color: 0xf06a2a });
  } else {
    for (const z of [-0.6, 0.5]) B.box([0, 0.62, z], [W * 0.85, 0.06, 0.3], { color: 0x8a5a30 });
  }
}

// ---------------------------------------------------------------- jump ramps
function ramps(ctx, B) {
  for (const r of L.RAMPS) {
    const y0 = ctx.terrain.heightAt(r.x - Math.sin(r.yaw) * r.len / 2, r.z - Math.cos(r.yaw) * r.len / 2) - 0.05;
    const M = buildingMatrix(r.x, 0, r.z, r.yaw);
    const w = 2.8;
    if (DECOR.on) decor('ramp', r.x, y0, r.z, { yaw: r.yaw, len: r.len, h: r.h, w });
    else {
    const g = new THREE.BoxGeometry(w, 0.12, r.len);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + r.len / 2) / r.len;
      p.setY(i, p.getY(i) + y0 + r.h * t * t * 0.4 + r.h * t * 0.6);
    }
    g.computeVertexNormals();
    B.geom(g, [0, 0, 0], null, [1, 1, 1], { tile: 'planks', tileMeters: 2.5 }, M);
    // side skirts & supports
    for (const sx of [-w / 2, w / 2]) {
      for (let k = 1; k <= 4; k++) {
        const t = k / 4;
        const z = -r.len / 2 + t * r.len;
        const top = y0 + r.h * t * t * 0.4 + r.h * t * 0.6;
        const gy = ctx.terrain.heightAt(...[toWorld(M, sx, 0, z)].map((v) => [v.x, v.z])[0]);
        B.box([sx, (top + gy) / 2, z], [0.14, top - gy + 0.1, 0.14], { tile: 'woodDark', tileMeters: 1.25 }, null, M);
      }
      B.tube([sx, y0 + 0.05, -r.len / 2], [sx, y0 + r.h, r.len / 2], 0.05, 0.05, { color: 0xc8361f }, 4, M);
    }
    // painted arrows on the ramp
    for (let k = 0; k < 2; k++) B.box([0, y0 + r.h * (0.3 + k * 0.35) + 0.08, -r.len / 2 + r.len * (0.3 + k * 0.35)], [0.6, 0.02, 0.35], { color: 0xf2c443 }, [-Math.atan2(r.h, r.len), 0, 0], M);
    }
    // physics: two platforms approximating the curve
    const hmid = r.h * 0.25 * 0.4 + r.h * 0.5 * 0.6;
    const half = r.len / 2;
    for (const [z0, z1, ya, yb] of [[-half, 0, y0, y0 + hmid], [0, half, y0 + hmid, y0 + r.h]]) {
      const c = toWorld(M, 0, 0, (z0 + z1) / 2);
      ctx.physics.addPlatform({ x: c.x, z: c.z, yaw: r.yaw, w, l: z1 - z0, y0: ya, y1: yb, surface: 'wood', kind: 'ramp' });
    }
    // block entering from the tall end
    const back = toWorld(M, 0, 0, half + 0.15);
    ctx.physics.addBox({ x: back.x, z: back.z, yaw: r.yaw, w: w, l: 0.3, y0: y0 - 1, y1: y0 + r.h - 0.3, kind: 'rampBack' });
  }
}

// ---------------------------------------------------------------- graveyard
function graveyard(ctx, B) {
  const { terrain } = ctx;
  const g = L.POI.graveyard;
  const rng = new RNG(13);
  const R = 15;
  // iron fence ring with a gate gap towards the trail (south-east)
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 1.25;
    if (i === 0 || i === 20) continue;
    pts.push([g.x + Math.cos(a) * R, g.z + Math.sin(a) * R]);
  }
  fencePosts(ctx, B, pts, { color: 0x2a2a30, height: 1.3, spacing: 2.4, rails: 2, iron: true });
  // headstones
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(4, R - 2.5);
    const x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
    if (Math.hypot(x - L.POI.grave.x, z - L.POI.grave.z) < 8.5) continue; // the intro is staged here
    const y = terrain.heightAt(x, z) - 0.1;
    const yaw = rng.range(-0.3, 0.3) + Math.PI * 0.75;
    const M = buildingMatrix(x, y, z, yaw);
    const t = rng.int(0, 3);
    if (DECOR.on) {
      decor('tomb', x, y + 0.1, z, { yaw: yaw + Math.PI, v: (i * 3 + t) % 7 });
    } else if (t === 0) {
      B.box([0, 0.5, 0], [0.75, 1.0, 0.18], { tile: 'gravestone', keepUV: true }, [rng.range(-0.15, 0.15), 0, rng.range(-0.12, 0.12)], M);
      B.geom(new THREE.CylinderGeometry(0.375, 0.375, 0.18, 8, 1, false, 0, Math.PI), [0, 1.0, 0], [Math.PI / 2, Math.PI / 2, 0], [1, 1, 1], { color: 0x8a8a8c }, M);
    } else if (t === 1) {
      B.box([0, 0.65, 0], [0.12, 1.3, 0.12], { color: 0x6a4a2a }, [0, 0, rng.range(-0.2, 0.2)], M);
      B.box([0, 0.95, 0], [0.7, 0.12, 0.12], { color: 0x6a4a2a }, [0, 0, rng.range(-0.2, 0.2)], M);
    } else if (t === 2) {
      B.box([0, 0.35, 0], [0.9, 0.7, 0.25], { tile: 'gravestone', keepUV: true }, [0, 0, rng.range(-0.1, 0.1)], M);
    } else {
      B.geom(new THREE.ConeGeometry(0.3, 1.8, 4), [0, 1.1, 0], null, [1, 1, 1], { color: 0x9a9a9c }, M);
      B.box([0, 0.15, 0], [0.7, 0.3, 0.7], { color: 0x8a8a8c }, null, M);
    }
    ctx.physics.addCircle({ x, z, r: 0.4, y0: y - 1, y1: y + 1.4, kind: 'grave' });
    rng.chance(0.25); // (kept so the rest of the cemetery lays out as before)
  }
  // Hank's grave: open hole, dirt mound, shovel, his own headstone
  const hg = L.POI.grave;
  const y = terrain.heightAt(hg.x, hg.z);
  const M = buildingMatrix(hg.x, y, hg.z, Math.PI * 0.75);
  B.box([0, 0.02, 0], [1.1, 0.04, 2.1], { color: 0x140c0a }, null, M);
  B.box([0, -0.25, 0], [1.0, 0.5, 2.0], { color: 0x2a1a12 }, null, M);
  B.geom(new THREE.SphereGeometry(0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), [1.4, -0.05, 0.1], null, [0.8, 0.55, 1.4], { tile: 'leaves', keepUV: true, color: 0x9a7a5a }, M);
  B.tube([1.4, 0.2, -0.4], [1.6, 1.4, -0.5], 0.03, 0.03, { color: 0x8a5a30 }, 4, M);
  B.box([1.62, 0.15, -0.38], [0.24, 0.32, 0.03], { color: 0x8a8a92 }, [0.2, 0, 0], M);
  B.box([0, 0.55, -1.25], [0.85, 1.1, 0.2], { tile: 'gravestone', keepUV: true, color: 0xd0d0d4 }, [0.08, 0, 0], M);
  ctx.physics.addCircle({ x: toWorld(M, 0, 0, -1.25).x, z: toWorld(M, 0, 0, -1.25).z, r: 0.5, y0: y - 1, y1: y + 1.3, kind: 'grave' });
  // gnarled dead tree with crows (kept ~9 m from Hank's grave: the funeral is staged there)
  const tx = g.x - 9, tz = g.z - 7.5, ty = terrain.heightAt(tx, tz);
  const Mt = buildingMatrix(tx, ty, tz, 0.4);
  B.tube([0, 0, 0], [0.3, 3.2, 0.1], 0.45, 0.28, { tile: 'logs', tileMeters: 2.5, color: 0x6a5a50 }, 6, Mt);
  const branch = (a, b2, r) => B.tube(a, b2, r, r * 0.6, { color: 0x4a3a32 }, 5, Mt);
  branch([0.3, 3.0, 0.1], [1.8, 4.6, 0.4], 0.18);
  branch([1.8, 4.6, 0.4], [2.6, 4.9, 1.2], 0.1);
  branch([0.25, 2.6, 0.1], [-1.5, 3.9, -0.6], 0.16);
  branch([-1.5, 3.9, -0.6], [-2.2, 4.8, -0.4], 0.08);
  branch([0.3, 3.2, 0.1], [0.2, 5.4, 0.3], 0.14);
  branch([0.2, 5.4, 0.3], [-0.6, 6.1, 0.2], 0.07);
  ctx.physics.addCircle({ x: tx, z: tz, r: 0.6, kind: 'tree' });
  ctx.perches.push(toWorld(Mt, 1.8, 4.65, 0.4), toWorld(Mt, -1.5, 3.95, -0.6), toWorld(Mt, 0.2, 5.45, 0.3));
  // sign & lantern at the gate
  const ga = 1.25 - 0.08;
  const gx = g.x + Math.cos(ga) * (R + 1.5), gz = g.z + Math.sin(ga) * (R + 1.5);
  const Mg = buildingMatrix(gx, terrain.heightAt(gx, gz), gz, ga + Math.PI / 2 + 0.6);
  signAt(B, Mg, 'OLD PINE CEMETERY', 0, 1.7, 0, 1.1);
  lampPost(ctx, B, gx + 1.5, terrain.heightAt(gx + 1.5, gz), gz);
}

// ---------------------------------------------------------------- homestead & world clutter
function homestead(ctx, B) {
  const { terrain } = ctx;
  const c = L.POI.cabin;
  const rng = new RNG(31);
  // woodpile with a chopping stump & axe
  const wx = -186, wz = 78, wy = terrain.heightAt(wx, wz);
  const Mw = buildingMatrix(wx, wy, wz, 0.3);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6 - r; k++) {
    B.geom(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 6), [k * 0.32 + r * 0.16 - 0.9, 0.17 + r * 0.29, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { tile: 'logs', tileMeters: 2.5 }, Mw);
  }
  for (let k = 0; k < 6; k++) B.box([k * 0.32 - 0.9, 0.17 + 0.0, 0.61], [0.28, 0.28, 0.02], { tile: 'logEnd', keepUV: true }, null, Mw);
  B.geom(new THREE.CylinderGeometry(0.35, 0.4, 0.55, 8), [1.6, 0.27, 0.6], null, [1, 1, 1], { tile: 'logs', tileMeters: 2.5 }, Mw);
  B.box([1.6, 0.56, 0.6], [0.6, 0.02, 0.6], { tile: 'logEnd', keepUV: true }, null, Mw);
  B.tube([1.6, 0.6, 0.6], [1.75, 1.1, 0.75], 0.025, 0.025, { color: 0x8a5a30 }, 4, Mw);
  B.box([1.6, 0.6, 0.58], [0.04, 0.16, 0.24], { color: 0xb0b4bc }, [0, 0.6, 0.3], Mw);
  ctx.physics.addBox({ x: wx, z: wz, yaw: 0.3, w: 2.2, l: 1.3, y0: wy - 1, y1: wy + 1.2, kind: 'woodpile' });
  // garden with pumpkins inside a picket fence
  const gx = -160, gz = 52;
  for (let i = 0; i < 9; i++) {
    const x = gx + rng.range(-3, 3), z = gz + rng.range(-2.4, 2.4);
    pumpkin(B, null, x, terrain.heightAt(x, z) - 0.05, z, rng.range(0.22, 0.42));
  }
  const fy = (x, z) => terrain.heightAt(x, z);
  fencePosts(ctx, B, [[gx - 4, gz - 3.2], [gx + 4, gz - 3.2], [gx + 4, gz + 3.2], [gx - 4, gz + 3.2], [gx - 4, gz - 1]], { color: 0xf2ece0, height: 0.9, spacing: 0.6, rails: 2, collide: true });
  void fy;
  // clothesline with sweaters
  const cl = [[-191, 58], [-191, 70]];
  for (const [x, z] of cl) {
    const y = terrain.heightAt(x, z);
    B.box([x, y + 1.1, z], [0.12, 2.2, 0.12], { color: WOOD });
    B.box([x, y + 2.15, z], [0.12, 0.1, 0.8], { color: WOOD });
  }
  const y1 = terrain.heightAt(-191, 58) + 2.1, y2 = terrain.heightAt(-191, 70) + 2.1;
  B.tube([-191, y1, 58], [-191, y2, 70], 0.01, 0.01, { color: 0xe8e8e8 }, 3);
  const clothes = [0xc8361f, 0x2f6e6a, 0xe2d4b4, 0x8a3a5a, 0xf2c443];
  for (let i = 0; i < 5; i++) {
    const z = 59.5 + i * 2.2, y = y1 + (y2 - y1) * ((z - 58) / 12) - 0.45;
    B.box([-191, y, z], [0.04, 0.75, 0.8], { color: clothes[i] });
    B.box([-191, y + 0.12, z], [0.05, 0.12, 1.25], { color: clothes[i] });
  }
  // mailbox at the drive
  const mx = -150, mz = 69, my = terrain.heightAt(mx, mz);
  if (!decor('mailbox', mx, my, mz, { yaw: -Math.PI / 2 })) B.box([mx, my + 0.6, mz], [0.1, 1.2, 0.1], { color: WOOD });
  if (!DECOR.on) {
  B.box([mx, my + 1.25, mz], [0.3, 0.3, 0.55], { color: 0x2f6e52 });
  B.box([mx + 0.16, my + 1.32, mz + 0.1], [0.02, 0.25, 0.05], { color: 0xc8361f });
  }
  // fire pit with stones and stumps
  const px = -164, pz = 84, py = terrain.heightAt(px, pz);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    B.geom(new THREE.SphereGeometry(0.22, 5, 4), [px + Math.cos(a) * 0.8, py + 0.08, pz + Math.sin(a) * 0.8], null, [1, 0.7, 1], { color: 0x8a8278 });
  }
  for (let k = 0; k < 4; k++) B.tube([px - 0.4 + k * 0.25, py + 0.1, pz - 0.3], [px + 0.3 - k * 0.2, py + 0.3, pz + 0.35], 0.06, 0.06, { color: 0x4a3020 }, 4);
  ctx.fires.push(new THREE.Vector3(px, py + 0.3, pz));
  ctx.lights.push({ pos: new THREE.Vector3(px, py + 0.8, pz), color: [1.0, 0.5, 0.2], radius: 9, kind: 'fire', always: true });
  for (const a of [0.5, 2.4, 4.2]) {
    const x = px + Math.cos(a) * 2.0, z = pz + Math.sin(a) * 2.0;
    B.geom(new THREE.CylinderGeometry(0.28, 0.3, 0.45, 7), [x, terrain.heightAt(x, z) + 0.2, z], null, [1, 1, 1], { tile: 'logs', tileMeters: 2.5 });
  }
  // wheelbarrow full of pumpkins
  const bx = -168, bz = 54, by = terrain.heightAt(bx, bz);
  const Mb = buildingMatrix(bx, by, bz, 1.0);
  if (decor('wheelbarrow', bx, by, bz, { yaw: 1.0 })) {} else {
  B.box([0, 0.55, 0], [0.7, 0.35, 1.0], { color: 0x5a7a8a }, null, Mb);
  B.geom(new THREE.TorusGeometry(0.2, 0.06, 4, 8), [0, 0.22, 0.6], [0, Math.PI / 2, 0], [1, 1, 1], { color: 0x2a2a2a }, Mb);
  for (const sx of [-0.25, 0.25]) B.tube([sx, 0.5, -0.4], [sx, 0.7, -1.2], 0.03, 0.03, { color: WOOD }, 3, Mb);
  pumpkin(B, Mb, 0, 0.6, 0, 0.25);
  pumpkin(B, Mb, 0.15, 0.6, 0.25, 0.18);
  }
}

function village(ctx, B) {
  const { terrain } = ctx;
  const rng = new RNG(99);
  const MS = L.MAIN_ST;
  // the green: fall fair hay bales & pumpkins, banner (lamps, benches, the flag: places.js)
  const p = L.POI.plaza;
  const py = terrain.heightAt(p.x, p.z);
  const free = (x, z) => Math.hypot(x - p.x, z - p.z) > 6 && z < MS.z - MS.road / 2 - MS.walk - 1 && Math.abs(x - p.x) > 1.8;
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(7, 12);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (!free(x, z)) continue;
    hayBale(ctx, B, x, terrain.heightAt(x, z), z, a);
    pumpkin(B, null, x, terrain.heightAt(x, z) + 0.7, z, 0.28);
  }
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(6.5, 14);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (!free(x, z)) continue;
    pumpkin(B, null, x, terrain.heightAt(x, z) - 0.05, z, rng.range(0.18, 0.4));
  }
  const b1 = [p.x - 6, p.z + 12], b2 = [p.x + 6, p.z + 12];
  for (const [x, z] of [b1, b2]) B.box([x, terrain.heightAt(x, z) + 2.2, z], [0.18, 4.4, 0.18], { color: WOOD });
  for (const [x, z] of [b1, b2]) ctx.physics.addCircle({ x, z, r: 0.15, kind: 'post' });
  const t = TILESIZE('sign:FALL FAIR!');
  B.box([p.x, py + 3.6, p.z + 12], [(t.w / 25.6) * 2, (t.h / 25.6) * 2, 0.05], { tile: 'sign:FALL FAIR!', keepUV: true });
  B.box([p.x, py + 3.6, p.z + 11.97], [(t.w / 25.6) * 2, (t.h / 25.6) * 2, 0.05], { tile: 'sign:FALL FAIR!', keepUV: true }, [0, Math.PI, 0]);
  // picnic tables on the waterfront lawns
  for (const [x, z, yaw] of [[172, 78, 0.2], [158, 79, -0.3], [236, 79, 0.1]]) {
    const y = terrain.heightAt(x, z);
    const M = buildingMatrix(x, y, z, yaw);
    if (decor('picnic', x, y, z, { yaw })) { ctx.physics.addBox({ x, z, yaw, w: 1.9, l: 1.6, y0: y - 1, y1: y + 0.8, kind: 'table' }); continue; }
    B.box([0, 0.75, 0], [1.8, 0.06, 0.8], { tile: 'planks', tileMeters: 2.5 }, null, M);
    for (const sz of [-0.65, 0.65]) B.box([0, 0.45, sz], [1.8, 0.05, 0.3], { tile: 'planks', tileMeters: 2.5 }, null, M);
    for (const sx of [-0.7, 0.7]) B.box([sx, 0.38, 0], [0.08, 0.75, 1.5], { color: WOOD }, null, M);
    ctx.physics.addBox({ x, z, yaw, w: 1.9, l: 1.6, y0: y - 1, y1: y + 0.8, kind: 'table' });
    B.box([0.3, 0.83, 0.1], [0.1, 0.12, 0.1], { color: 0xf4ecdc }, null, M);
  }
}

function lookout(ctx, B) {
  const { terrain } = ctx;
  const p = L.POI.lookout;
  const y = terrain.heightAt(p.x, p.z);
  bench(ctx, B, p.x + 2.5, y, p.z + 3.5, 0.6);
  // coin telescope
  const M = buildingMatrix(p.x - 2, y, p.z + 3, 0.6);
  B.tube([0, 0, 0], [0, 1.1, 0], 0.07, 0.07, { color: 0x3a6a4a }, 6, M);
  B.tube([0, 1.2, -0.35], [0, 1.4, 0.4], 0.11, 0.08, { color: 0x3a6a4a }, 7, M);
  ctx.physics.addCircle({ x: p.x - 2, z: p.z + 3, r: 0.3, y0: y - 1, y1: y + 1.5, kind: 'post' });
  signAt(B, buildingMatrix(p.x + 5, terrain.heightAt(p.x + 5, p.z - 4), p.z - 4, 2.2), 'SUNSET LOOKOUT', 0, 1.6, 0, 1.0);
  // log fence at the edge
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const a = 0.2 + (i / 6) * 1.6;
    pts.push([p.x + Math.cos(a) * 9, p.z + Math.sin(a) * 9]);
  }
  fencePosts(ctx, B, pts, { color: 0x6a4a2a, height: 0.9, spacing: 2.2, rails: 2 });
}

// the mossy hollow log by the road home, where Poutine hides from the rain
function hollowLog(ctx, B) {
  const { terrain } = ctx;
  const c = L.POI.catLog;
  const lx = c.x, lz = c.z - 1.95;
  const y = terrain.heightAt(lx, lz);
  const M = buildingMatrix(lx, y, lz, 0.12);
  const R = 0.46;
  B.tube([0, R - 0.06, -1.55], [0, R - 0.08, 1.5], R, R * 0.96, { tile: 'logs', tileMeters: 2.5 }, 9, M);
  // the dark hollow and its pale cut rim, facing the road
  B.tube([0, R - 0.08, 1.5], [0, R - 0.08, 1.53], R * 0.97, R * 0.97, { color: 0xc8a878 }, 9, M);
  B.tube([0, R - 0.08, 1.51], [0, R - 0.08, 1.56], R * 0.72, R * 0.72, { color: 0x140c0a }, 9, M);
  B.tube([0, R - 0.06, -1.58], [0, R - 0.06, -1.55], R * 0.97, R * 0.97, { tile: 'logEnd', keepUV: true }, 9, M);
  // moss, a broken branch and a few mushrooms
  const rng = new RNG(31);
  for (let k = 0; k < 9; k++) {
    const z = rng.range(-1.3, 1.2), a = rng.range(-0.7, 0.7);
    B.box([Math.sin(a) * R * 0.9, R - 0.06 + Math.cos(a) * R * 0.92, z], [rng.range(0.22, 0.4), 0.07, rng.range(0.25, 0.5)], { color: rng.pick([0x4a7a32, 0x5a8a3a, 0x3e6a2c]) }, [0, 0, -a], M);
  }
  B.tube([0.25, R + 0.2, -0.6], [0.7, R + 0.75, -0.9], 0.06, 0.03, { color: 0x5a4030 }, 4, M);
  for (const [x, z, s] of [[0.48, 0.9, 1], [0.5, 0.6, 0.7], [-0.5, -0.4, 0.85], [0.55, -1.0, 0.6]]) {
    const yy = terrain.heightAt(lx + x, lz + z) - y;
    B.tube([x, yy, z], [x, yy + 0.12 * s, z], 0.025 * s, 0.025 * s, { color: 0xf0e6d0 }, 5, M);
    B.geom(new THREE.SphereGeometry(0.08 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), [x, yy + 0.11 * s, z], null, [1, 0.7, 1], { color: 0xc8361f }, M);
  }
  const w = toWorld(M, 0, 0, 0);
  ctx.physics.addBox({ x: w.x, z: w.z, yaw: 0.12, w: R * 2, l: 3.2, y0: y - 0.5, y1: y + R * 2, kind: 'log' });
}

function wilds(ctx, B) {
  const { terrain } = ctx;
  // Harold's tree stand
  const s = L.POI.treestand;
  const y = terrain.heightAt(s.x, s.z);
  const M = buildingMatrix(s.x, y, s.z, 0.5);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    B.tube([x * 1.2, 0, z * 1.2], [x * 0.9, 4.2, z * 0.9], 0.1, 0.09, { tile: 'logs', tileMeters: 2.5 }, 5, M);
    ctx.physics.addCircle({ ...(() => { const w = toWorld(M, x * 1.2, 0, z * 1.2); return { x: w.x, z: w.z }; })(), r: 0.2, kind: 'post' });
  }
  B.box([0, 4.2, 0], [2.2, 0.15, 2.2], { tile: 'planksDark', tileMeters: 2.5 }, null, M);
  B.box([0, 4.8, -1.05], [2.2, 1.0, 0.08], { tile: 'planksDark', tileMeters: 2.5 }, null, M);
  for (let k = 0; k < 8; k++) B.box([0, 0.4 + k * 0.5, 1.35], [0.7, 0.06, 0.06], { color: WOOD }, null, M);
  for (const sx of [-0.35, 0.35]) B.tube([sx, 0, 1.4], [sx, 4.3, 1.3], 0.04, 0.04, { color: WOOD }, 4, M);
  // the beaver dam across the pond outlet
  const pd = L.POI.pond;
  const rng = new RNG(8);
  for (let i = 0; i < 70; i++) {
    const t = rng.range(-1, 1);
    const x = pd.x + t * 9 + rng.range(-0.6, 0.6), z = pd.z + 9 + t * 1.5 + rng.range(-1, 1);
    const yy = Math.max(terrain.heightAt(x, z), -0.4) + rng.range(-0.1, 0.5);
    const a = rng.range(0, Math.PI);
    B.tube([x - Math.cos(a) * 1.2, yy, z - Math.sin(a) * 1.2], [x + Math.cos(a) * 1.2, yy + rng.range(-0.2, 0.3), z + Math.sin(a) * 1.2], 0.06, 0.04, { color: rng.pick([0x5a4030, 0x6a4a34, 0x4a3426, 0x8a6a4a]) }, 4);
  }
  ctx.beaverDam = new THREE.Vector3(pd.x, 0, pd.z + 9);
  hollowLog(ctx, B);
  // trapper hut clutter: antlers over the door, canoe, crates
  const t = L.POI.trapper;
  const ty = terrain.heightAt(t.x + 3, t.z + 2);
  const Mc = buildingMatrix(t.x + 3, ty, t.z + 2, 1.1);
  B.geom(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.05, 0], null, [0.65, 0.55, 4.4], { color: 0x2f6e6a }, Mc);
  crateStack(ctx, B, t.x - 3, terrain.heightAt(t.x - 3, t.z + 3), t.z + 3, 0.4, 3);
}

export function buildProps(ctx, A) {
  coveredBridge(ctx, A.misc);
  boardwalk(ctx, A.village);
  ramps(ctx, A.misc);
  graveyard(ctx, A.grave);
  homestead(ctx, A.home);
  village(ctx, A.village);
  lookout(ctx, A.misc);
  wilds(ctx, A.misc);
}
