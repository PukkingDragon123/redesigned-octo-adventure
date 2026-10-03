// Bakes the 2D street clutter (deco2d.js) and furniture (furniture2d.js) into
// atlas pages: every view of every kind is pixelled, the frames are sorted by
// height and shelf-packed into as few square pages as fit. Runs in a Web Worker
// when it can (decoWorker.js), so the town's sprites are ready by the time the
// game starts (decoStart.js); on the main thread it bakes a few frames at a time.
//
// A page is { size, data: Uint8ClampedArray(size*size*4), frames: [{ name, x, y, w, h, ax, ay, ppm }] }.
// Pixels with alpha 160 glow (lamps, lanterns), as everywhere else.
import { renderSculpt } from './sculpt2d.js';
import { DECO, VIEWS } from './deco2d.js';
import { FURN } from './furniture2d.js';

export const CATALOGUE = { ...DECO, ...FURN };
export const PAGE = 1024;

const viewOf = (v) => (typeof v === 'string' ? VIEWS[v] : v);
export const viewName = (v, i) => (typeof v === 'string' ? v : `v${i}`);

// all the frames to bake, as small jobs
export function frameJobs(kinds = Object.keys(CATALOGUE)) {
  const jobs = [];
  for (const kind of kinds) {
    const K = CATALOGUE[kind];
    if (!K) continue;
    for (let i = 0; i < K.n; i++) jobs.push({ kind, i });
  }
  return jobs;
}

// bake one job (a pose of a kind, all its views) -> [{ name, w, h, ax, ay, ppm, px }]
export function bakeJob({ kind, i }) {
  const K = CATALOGUE[kind];
  const S = K.pose(i);
  const out = [];
  K.views.forEach((view, vi) => {
    const v = viewOf(view);
    const r = renderSculpt(S, { yaw: v.yaw, pitch: v.pitch ?? K.pitch }, K.ppm, { contour: 2.2 });
    const px = new Uint8ClampedArray(r.w * r.h * 4);
    for (let k = 0, n = r.w * r.h; k < n; k++) {
      if (!r.rgba[k * 4 + 3]) continue;
      px[k * 4] = r.rgba[k * 4]; px[k * 4 + 1] = r.rgba[k * 4 + 1]; px[k * 4 + 2] = r.rgba[k * 4 + 2];
      px[k * 4 + 3] = r.glow[k] ? 160 : 255;
    }
    out.push({ name: `${kind}:${viewName(view, vi)}:${i}`, w: r.w, h: r.h, ax: r.ax, ay: r.ay, ppm: r.ppm, px });
  });
  return out;
}

// shelf-pack baked frames (tallest first) into pages
export function packPages(frames, size = PAGE) {
  const order = frames.slice().sort((a, b) => b.h - a.h || b.w - a.w);
  const pages = [];
  let pg = null, x = 0, y = 0, shelf = 0;
  const open = () => { pg = { size, data: new Uint8ClampedArray(size * size * 4), frames: [] }; pages.push(pg); x = 0; y = 0; shelf = 0; };
  open();
  for (const f of order) {
    const w = Math.min(f.w, size), h = Math.min(f.h, size);
    if (x + w + 1 > size) { x = 0; y += shelf + 1; shelf = 0; }
    if (y + h > size) { open(); }
    const d = pg.data;
    for (let j = 0; j < h; j++) d.set(f.px.subarray(j * f.w * 4, j * f.w * 4 + w * 4), ((y + j) * size + x) * 4);
    pg.frames.push({ name: f.name, x, y, w, h, ax: f.ax, ay: f.ay, ppm: f.ppm });
    x += w + 1;
    shelf = Math.max(shelf, h);
  }
  return pages;
}

// everything at once, on this thread (used by the worker, screenshots and tools)
export function bakeAllSync(kinds) {
  const frames = [];
  for (const job of frameJobs(kinds)) frames.push(...bakeJob(job));
  return packPages(frames);
}
