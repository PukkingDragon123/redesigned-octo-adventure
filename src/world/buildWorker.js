// Builds and meshes voxel buildings off the main thread (see startBuildingJobs in voxelWorld.js).
// Input: { jobs: [{ id, spec }] }. Output per building: the near (1/16 m) and far (1/8 m) mesh
// arrays (transferred) + meta.
import { buildVoxelBuilding, lowDetail } from '../voxel/models/buildings.js';
import { meshVox } from '../voxel/mesh.js';

const arrays = (g) => ({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color4.array, idx: g.index.array });
const buffers = (a) => [a.pos.buffer, a.nor.buffer, a.col.buffer, a.idx.buffer];

self.onmessage = (e) => {
  for (const job of e.data.jobs) {
    try {
      const r = buildVoxelBuilding(job.spec);
      const hi = arrays(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 }));
      const lr = lowDetail(r);
      const lo = arrays(meshVox(lr.vox, { size: lr.size, origin: lr.origin, jitter: 0 }));
      const out = { id: job.id, meta: r.meta, hi, lo };
      self.postMessage(out, [...buffers(hi), ...buffers(lo)]);
    } catch (err) {
      self.postMessage({ id: job.id, error: String(err?.stack || err) });
    }
  }
};
