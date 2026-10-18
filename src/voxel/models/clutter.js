// The street clutter and furniture of Maple Cove as voxel models: every kind in the
// deco/furniture catalogue (art/deco2d.js, art/furniture2d.js), each pose of it, voxelised
// from its sculpt (voxel/sculptVox.js) at one sprite pixel per voxel, so the models keep the
// look the pieces were designed with and their lettering stays crisp.
//
//   clutterVox(kind, pose = 0) -> { vox, size, origin }   (cached)
//   CLUTTER_KINDS: every kind with a sculpt
import { CATALOGUE } from '../../art/decoPaint.js';
import { sculptToVox } from '../sculptVox.js';

export const CLUTTER_KINDS = Object.keys(CATALOGUE).filter((k) => k !== 'picket' && k !== 'rail' && k !== 'rail2');

// voxel size: one sprite pixel, on a few fixed steps so neighbouring pieces match
const STEPS = [1 / 64, 1 / 56, 1 / 48, 1 / 40, 1 / 32];
export function clutterSize(kind) {
  const K = CATALOGUE[kind];
  const want = 1 / (K?.ppm || 40);
  let best = STEPS[0];
  for (const s of STEPS) if (Math.abs(s - want) < Math.abs(best - want)) best = s;
  return best;
}

const cache = new Map();
export function clutterVox(kind, pose = 0) {
  const key = `${kind}:${pose}`;
  let r = cache.get(key);
  if (r) return r;
  const K = CATALOGUE[kind];
  if (!K) return null;
  const size = clutterSize(kind);
  const S = K.pose(Math.min(pose, K.n - 1));
  r = sculptToVox(S, { size, views: K.views, pitch: K.pitch ?? 0.32, ppm: 1 / size });
  cache.set(key, r);
  return r;
}

export const PREVIEW = Object.fromEntries(CLUTTER_KINDS.map((k) => [k, () => ({ ...clutterVox(k, 0), jitter: 0 })]));
