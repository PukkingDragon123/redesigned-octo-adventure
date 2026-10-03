// Do the buildings sit on the ground? Builds every voxel building as the game does and, for each
// voxel column of its base (foundation, porch deck, steps, stoop, yard props; stilt posts on
// stilt houses), measures the gap between the column's lowest voxel and the terrain under it.
//   node tools/floatcheck.mjs [--old] [id ...]
//   --old: place buildings the way the game did before foundations.js (corner+centre floor
//          height, no ground grid handed to the models)
import { buildVoxelBuilding } from '../src/voxel/models/buildings.js';
import { BUILDINGS, BOARDWALK } from '../src/world/layout.js';
import { Terrain } from '../src/world/terrain.js';
import { buildingSpecPure, floorY, localToWorld, footprintHeights } from '../src/world/foundations.js';

const args = process.argv.slice(2);
const OLD = args.includes('--old');
const only = args.filter((a) => !a.startsWith('--'));
const terrain = new Terrain();

function oldFloor(b) {
  const c = Math.cos(b.facing || 0), s = Math.sin(b.facing || 0);
  let mn = Infinity, mx = -Infinity;
  for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [0, 0]]) {
    const h = terrain.heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
    mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  const lift = { house: 0.35, cabin: 0.45, shed: 0.15, outhouse: 0.15, chapel: 0.4, sawmill: 0.2, shop: 0.3, firehall: 0.2, barn: 0.15, sugarshack: 0.3, gazebo: 0.05, lifeguard: 0, rink: 0.06 }[b.kind];
  if (b.stilts) return BOARDWALK[0].h + 0.02;
  if (b.kind === 'lighthouse') return terrain.heightAt(b.x, b.z) + 0.1;
  return ((b.kind === 'gazebo' || b.kind === 'lifeguard') ? mn : mx) + lift;
}

const rows = [];
let worst = 0, totalArea = 0;
for (const b of BUILDINGS) {
  if (only.length && !only.includes(b.id)) continue;
  let spec, y0;
  if (OLD) {
    y0 = oldFloor(b);
    spec = { ...b, seed: 0 };
    if (b.stilts) {
      let low = 1e9;
      for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [0, 0]]) { const [x, z] = localToWorld(b, lx, lz); low = Math.min(low, terrain.heightAt(x, z)); }
      spec.stilt = Math.max(1.5, y0 - Math.min(low, -0.4) + 0.6);
    }
  } else {
    spec = buildingSpecPure(b, terrain);
    y0 = spec.floorY ?? floorY(terrain, b);
  }
  const r = buildVoxelBuilding(spec);
  const v = r.vox, [ox, oy, oz] = r.origin, size = r.size;
  // lowest voxel of every column
  const WW = (v.w + 31) >> 5;
  const low = new Int32Array(v.w * v.d).fill(-1);
  const words = new Int32Array(WW + 1);
  for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) {
    words.fill(0);
    if (v.occRow) v.occRow(y, z, words, 0);
    else for (let x = 0; x < v.w; x++) if (v.get(x, y, z)) words[x >> 5] |= 1 << (x & 31);
    for (let k = 0; k < WW; k++) {
      let m = words[k];
      while (m) { const t = m & -m; m ^= t; const x = (k << 5) + 31 - Math.clz32(t); if (low[x + v.w * z] < 0) low[x + v.w * z] = y; }
    }
  }
  let maxGap = 0, n = 0, at = null;
  // stilt houses: every post must reach the ground (the seabed) under it
  if (b.stilts && r.meta.stiltPosts?.length) {
    for (const q of r.meta.stiltPosts) {
      const [wx, wz] = localToWorld(b, q.x, q.z);
      const gap = y0 + q.y - terrain.heightAt(wx, wz);
      if (gap > 0.05) { n += 16; if (gap > maxGap) { maxGap = gap; at = [q.x, q.z]; } }
    }
  }
  if (!(b.stilts && r.meta.stiltPosts?.length)) {
    // gap per base column (NaN: not a base column)
    const gaps = new Float32Array(v.w * v.d).fill(NaN);
    for (let z = 0; z < v.d; z++) for (let x = 0; x < v.w; x++) {
      const y = low[x + v.w * z];
      if (y < 0) continue;
      const ly = (y - oy) * size; // local metres, floor = 0
      if (ly > 0.3) continue; // eaves, awnings, signs... hang in the air on purpose
      const lx = (x - ox + 0.5) * size, lz = (z - oz + 0.5) * size;
      const [wx, wz] = localToWorld(b, lx, lz);
      gaps[x + v.w * z] = y0 + ly - terrain.heightAt(wx, wz);
    }
    // a column within 3 voxels (19 cm) of a grounded one is an overhang (a sill, a drip cap, a
    // pumpkin's belly), not a floating base
    const near = new Uint8Array(v.w * v.d);
    for (let z = 0; z < v.d; z++) for (let x = 0; x < v.w; x++) {
      if (!(gaps[x + v.w * z] <= 0.05)) continue;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx >= 0 && zz >= 0 && xx < v.w && zz < v.d) near[xx + v.w * zz] = 1;
      }
    }
    for (let z = 0; z < v.d; z++) for (let x = 0; x < v.w; x++) {
      const gap = gaps[x + v.w * z];
      if (!(gap > 0.05) || near[x + v.w * z]) continue;
      n++;
      if (gap > maxGap) { maxGap = gap; at = [(x - ox + 0.5) * size, (z - oz + 0.5) * size]; }
    }
  }
  const fh = footprintHeights(terrain, { ...b, w: b.w - 0.2, d: b.d - 0.2 });
  const buried = b.stilts || b.kind === 'lighthouse' ? 0 : Math.max(0, fh.mx - y0);
  const area = n * size * size;
  worst = Math.max(worst, maxGap); totalArea += area;
  rows.push(`${b.id.padEnd(14)} slope ${(fh.mx - fh.mn).toFixed(2).padStart(5)} m   max gap ${maxGap.toFixed(2).padStart(5)} m   floating ${area.toFixed(2).padStart(6)} m2${at ? `  (worst at local ${at[0].toFixed(1)}, ${at[1].toFixed(1)})` : ''}${buried > 0.02 ? `  floor buried ${buried.toFixed(2)} m` : ''}`);
}
console.log(rows.join('\n'));
console.log(`${OLD ? 'BEFORE' : 'NOW'}: worst gap ${worst.toFixed(2)} m, ${totalArea.toFixed(1)} m2 of base floating in total`);
