// The street clutter and furniture as meshed voxel models, ready to hand to the renderer
// (game/deco2d.js): every pose of every kind in the catalogue, voxelised from its sculpt
// (voxel/models/clutter.js) and meshed compact (Int16 voxel grid, see voxel/mesh.js).
//   { key: 'kind:pose', kind, pose, size, h, pos, nor, col, det, qb, idx, faces }
import { CATALOGUE } from './decoPaint.js';
import { CLUTTER_KINDS, clutterVox } from '../voxel/models/clutter.js';
import { meshVox } from '../voxel/mesh.js';

export function decoJobs(kinds = CLUTTER_KINDS) {
  const jobs = [];
  for (const kind of kinds) {
    const K = CATALOGUE[kind];
    if (!K) continue;
    for (let pose = 0; pose < K.n; pose++) jobs.push({ kind, pose });
  }
  return jobs;
}

export function bakeDecoJob({ kind, pose }) {
  const r = clutterVox(kind, pose);
  const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0, compact: true });
  const b = r.vox.bounds();
  return {
    key: `${kind}:${pose}`, kind, pose, size: r.size, h: (b.y1 + 1 - r.origin[1]) * r.size,
    pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color4.array,
    det: g.attributes.detail.array, qb: g.attributes.qbox.array, idx: g.index.array, faces: g.userData.faces,
  };
}

export function bakeDecoSync(kinds) {
  return decoJobs(kinds).map(bakeDecoJob);
}

export function decoTransfer(models) {
  const t = [];
  for (const m of models) t.push(m.pos.buffer, m.nor.buffer, m.col.buffer, m.det.buffer, m.qb.buffer, m.idx.buffer);
  return t;
}
