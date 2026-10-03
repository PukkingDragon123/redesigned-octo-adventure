// Starts baking the 2D clutter and furniture atlas pages in the background (see decoPaint.js).
import { frameJobs, bakeJob, packPages } from './decoPaint.js';
import DecoWorker from './decoWorker.js?worker&inline';

// bake in the background: a worker if possible, else a few frames per tick. Resolves to pages.
export function startDecoPaint(kinds) {
  return new Promise((resolve) => {
    const fallback = async () => {
      const frames = [];
      let t = performance.now();
      for (const job of frameJobs(kinds)) {
        frames.push(...bakeJob(job));
        if (performance.now() - t > 6) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
      }
      resolve(packPages(frames));
    };
    let w;
    try { w = new DecoWorker(); } catch { fallback(); return; }
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) { console.warn('deco bake failed in worker', e.data.error); fallback(); } else resolve(e.data.pages);
    };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); console.warn('deco worker unavailable, baking on the main thread'); fallback(); };
    w.postMessage({ kinds });
  });
}
