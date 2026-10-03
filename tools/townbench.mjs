// Builds and meshes every voxel building (as the workers do) and reports per-building
// grid size, filled voxels, triangles and time, plus the town totals.
//   node tools/townbench.mjs [id ...]
import { buildVoxelBuilding } from '../src/voxel/models/buildings.js';
import { meshVox } from '../src/voxel/mesh.js';
import { BUILDINGS } from '../src/world/layout.js';
import { Terrain } from '../src/world/terrain.js';

const only = process.argv.slice(2);
let specFn = (b) => ({ ...b, stilt: b.stilts ? 3.6 : 0 });
try {
  const { buildingSpecPure } = await import('../src/world/foundations.js');
  const terrain = new Terrain();
  specFn = (b) => buildingSpecPure(b, terrain);
} catch { /* older tree: no terrain-aware specs */ }

let T = 0, tris = 0, vox = 0, cells = 0;
const rows = [];
for (const b of BUILDINGS) {
  if (only.length && !only.includes(b.id)) continue;
  const spec = specFn(b);
  const t0 = performance.now();
  const r = buildVoxelBuilding(spec);
  const t1 = performance.now();
  const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
  const t2 = performance.now();
  const f = g.index.count / 3;
  const n = r.vox.count();
  rows.push([b.id.padEnd(14), `${r.vox.w}x${r.vox.h}x${r.vox.d}`.padEnd(14), String(n).padStart(8), String(f).padStart(7), (t1 - t0).toFixed(0).padStart(6), (t2 - t1).toFixed(0).padStart(6)]);
  T += t2 - t0; tris += f; vox += n; cells += r.vox.w * r.vox.h * r.vox.d;
}
console.log('id             grid             voxels    tris  build   mesh (ms)');
for (const r of rows) console.log(r.join(' '));
console.log(`TOTAL ${rows.length} buildings: ${vox} voxels, ${(cells / 1e6).toFixed(1)}M cells, ${tris} triangles, ${T.toFixed(0)} ms (single thread)`);
