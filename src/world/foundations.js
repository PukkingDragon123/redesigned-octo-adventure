// Where buildings meet the ground. Pure JS (no three.js) so node tools can use it too.
//
// floorY(): the floor height a building is placed at (the voxel model's y = 0).
// groundGrid(): the terrain around a building in its own frame, relative to that floor, handed
//   to the voxel builder so foundations, porch skirts, steps, stilts and yard props reach the
//   real ground instead of an assumed flat yard.
// buildingSpecPure(): the spec the voxel model is built from (layout entry + seed, stilt
//   length, floor height and ground grid).
import * as L from './layout.js';

const KIND_LIFT = {
  house: 0.35, cabin: 0.45, shed: 0.15, garage: 0.15, outhouse: 0.15, chapel: 0.4, sawmill: 0.2,
  shop: 0.3, firehall: 0.2, barn: 0.15, sugarshack: 0.3, gazebo: 0.05, lifeguard: 0, rink: 0.06,
  station: 0.25, firetower: 0,
};
const OPEN = { gazebo: true, lifeguard: true, firetower: true }; // stand on their lowest point, not the highest

// local (building frame, +z = front) -> world
export function localToWorld(b, lx, lz) {
  const c = Math.cos(b.facing || 0), s = Math.sin(b.facing || 0);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

// lowest / highest terrain under the footprint, sampled every ~0.5 m (edges included)
export function footprintHeights(terrain, b, pad = 0) {
  let mn = Infinity, mx = -Infinity;
  const w = b.w + pad * 2, d = b.d + pad * 2;
  const nx = Math.max(2, Math.ceil(w / 0.5) + 1), nz = Math.max(2, Math.ceil(d / 0.5) + 1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z] = localToWorld(b, -w / 2 + (w * i) / (nx - 1), -d / 2 + (d * j) / (nz - 1));
    const h = terrain.heightAt(x, z);
    if (h < mn) mn = h;
    if (h > mx) mx = h;
  }
  return { mn, mx };
}

// the floor (model y = 0) height of a layout building
export function floorY(terrain, b) {
  if (b.stilts) return L.BOARDWALK[0].h + 0.02;
  if (b.kind === 'lighthouse') return terrain.heightAt(b.x, b.z) + 0.1;
  const fh = footprintHeights(terrain, b);
  return (OPEN[b.kind] ? fh.mn : fh.mx) + (KIND_LIFT[b.kind] ?? 0.35);
}

// terrain heights relative to the floor (metres) on a 0.5 m grid in the building's frame,
// reaching `side` metres past the walls and `front` metres out from the front wall
export function groundGrid(terrain, b, y0, { side = 4, back = 4, front = 8 } = {}) {
  const step = 0.5;
  const x0 = -b.w / 2 - side, z0 = -b.d / 2 - back;
  const nx = Math.ceil((b.w + side * 2) / step) + 1, nz = Math.ceil((b.d + back + front) / step) + 1;
  const h = new Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z] = localToWorld(b, x0 + i * step, z0 + j * step);
    h[i + j * nx] = Math.round((terrain.heightAt(x, z) - y0) * 1000) / 1000;
  }
  return { x0, z0, step, nx, nz, h, water: -y0 };
}

// bilinear lookup in a ground grid (local metres); clamps at the edges
export function groundAt(g, lx, lz) {
  const fx = Math.max(0, Math.min(g.nx - 1.001, (lx - g.x0) / g.step));
  const fz = Math.max(0, Math.min(g.nz - 1.001, (lz - g.z0) / g.step));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = g.h[i + j * g.nx], b2 = g.h[i + 1 + j * g.nx], c = g.h[i + (j + 1) * g.nx], d = g.h[i + 1 + (j + 1) * g.nx];
  return (a + (b2 - a) * tx) + ((c + (d - c) * tx) - (a + (b2 - a) * tx)) * tz;
}

function hashStr(s) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// The spec a building's voxel model is built from (stilt houses reach down to the seabed)
export function buildingSpecPure(b, terrain) {
  const y0 = floorY(terrain, b);
  const opts = { seed: hashStr(b.id), floorY: y0 };
  if (b.stilts) {
    let low = 1e9;
    for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [0, 0]]) {
      const [x, z] = localToWorld(b, lx, lz);
      low = Math.min(low, terrain.heightAt(x, z));
    }
    opts.stilt = Math.max(1.5, y0 - Math.min(low, -0.4) + 0.6);
  }
  const big = b.kind === 'rink' || b.kind === 'barn' || b.kind === 'sawmill';
  // (the station's platform reaches 6 m out over the track side; the tower's feet stand wide)
  const wide = b.kind === 'station' ? { side: 7, back: 4, front: 12 } : b.kind === 'firetower' ? { side: 4, back: 4, front: 4 } : null;
  opts.ground = groundGrid(terrain, b, y0, wide ?? { side: big ? 6 : 4, back: big ? 6 : 4, front: big ? 10 : 8 });
  return { ...b, ...opts };
}
