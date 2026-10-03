// Builds and meshes voxel buildings off the main thread (see startBuildingJobs in voxelWorld.js).
// Input: { jobs: [{ id, spec }], near }. Without `near`: the far (1/8 m) mesh + meta, which is all
// the loading screen waits for. With `near`: the full-detail (1/16 m) mesh, streamed in afterwards.
// Mesh arrays are transferred.
import { buildVoxelBuilding, lowDetail } from '../voxel/models/buildings.js';
import { meshVox } from '../voxel/mesh.js';

const arrays = (g) => ({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color4.array, idx: g.index.array, scale: g.userData.scale ?? 1 });
const buffers = (a) => [a.pos.buffer, a.nor.buffer, a.col.buffer, a.idx.buffer];

self.onmessage = (e) => {
  const near = !!e.data.near;
  for (const job of e.data.jobs) {
    try {
      const r = buildVoxelBuilding(job.spec);
      if (near) {
        const hi = arrays(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0, compact: true }));
        self.postMessage({ id: job.id, hi }, buffers(hi));
      } else {
        const lr = lowDetail(r);
        const lo = arrays(meshVox(lr.vox, { size: lr.size, origin: lr.origin, jitter: 0, compact: true }));
        self.postMessage({ id: job.id, meta: r.meta, lo }, buffers(lo));
      }
    } catch (err) {
      self.postMessage({ id: job.id, error: String(err?.stack || err) });
    }
  }
};
