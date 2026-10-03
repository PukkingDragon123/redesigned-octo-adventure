// Builds and meshes every voxel building as the workers do (near model + far model) and
// reports per-building grid size, triangles and time, plus the town totals.
//   node tools/townbench.mjs [id ...]
import { buildVoxelBuilding, lowDetail } from '../src/voxel/models/buildings.js';
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

const T = { build: 0, mesh: 0, low: 0, meshLo: 0 };
let tris = 0, trisLo = 0;
const rows = [];
for (const b of BUILDINGS) {
  if (only.length && !only.includes(b.id)) continue;
  const spec = specFn(b);
  const t0 = performance.now();
  const r = buildVoxelBuilding(spec);
  const t1 = performance.now();
  const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
  const t2 = performance.now();
  const lr = lowDetail ? lowDetail(r) : null;
  const t3 = performance.now();
  const gl = lr ? meshVox(lr.vox, { size: lr.size, origin: lr.origin, jitter: 0 }) : g;
  const t4 = performance.now();
  const f = g.index.count / 3, fl = gl.index.count / 3;
  rows.push([b.id.padEnd(14), `${r.vox.w}x${r.vox.h}x${r.vox.d}`.padEnd(14), String(f).padStart(7), String(fl).padStart(7), ...[t1 - t0, t2 - t1, t3 - t2, t4 - t3].map((t) => t.toFixed(0).padStart(6))]);
  T.build += t1 - t0; T.mesh += t2 - t1; T.low += t3 - t2; T.meshLo += t4 - t3;
  tris += f; trisLo += fl;
}
console.log('id             grid              tris  trisLo  build   mesh    low meshLo (ms)');
for (const r of rows) console.log(r.join(' '));
const tot = T.build + T.mesh + T.low + T.meshLo;
console.log(`TOTAL ${rows.length} buildings: ${tris} triangles near, ${trisLo} far; ${tot.toFixed(0)} ms single thread (build ${T.build.toFixed(0)}, mesh ${T.mesh.toFixed(0)}, low ${T.low.toFixed(0)}, mesh far ${T.meshLo.toFixed(0)})`);
