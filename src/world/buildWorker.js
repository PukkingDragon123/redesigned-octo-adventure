// Builds and meshes voxel buildings off the main thread (see startBuildingJobs in voxelWorld.js).
// Input: { jobs: [{ id, spec }] }. Output per building: the mesh arrays (transferred) + meta.
import { buildVoxelBuilding } from '../voxel/models/buildings.js';
import { meshVox } from '../voxel/mesh.js';

self.onmessage = (e) => {
  for (const job of e.data.jobs) {
    try {
      const r = buildVoxelBuilding(job.spec);
      const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
      const out = {
        id: job.id, meta: r.meta,
        pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color4.array, idx: g.index.array,
      };
      self.postMessage(out, [out.pos.buffer, out.nor.buffer, out.col.buffer, out.idx.buffer]);
    } catch (err) {
      self.postMessage({ id: job.id, error: String(err?.stack || err) });
    }
  }
};
