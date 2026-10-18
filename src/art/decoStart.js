// Starts building the voxel models of the street clutter and furniture in the background
// (voxelised from their sculpts and meshed: see voxel/models/clutter.js and decoVox.js).
import { bakeDecoJob, decoJobs, bakeDecoSync } from './decoVox.js';
import DecoWorker from './decoWorker.js?worker&inline';

// a worker if possible, else a few models per tick. Resolves to the meshed models.
export function startDecoPaint(kinds) {
  return new Promise((resolve) => {
    const fallback = async () => {
      const models = [];
      let t = performance.now();
      for (const job of decoJobs(kinds)) {
        models.push(bakeDecoJob(job));
        if (performance.now() - t > 6) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
      }
      resolve(models);
    };
    let w;
    try { w = new DecoWorker(); } catch { fallback(); return; }
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) { console.warn('deco voxels failed in worker', e.data.error); fallback(); } else resolve(e.data.models);
    };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); console.warn('deco worker unavailable, building on the main thread'); fallback(); };
    w.postMessage({ kinds });
  });
}
export { bakeDecoSync };
