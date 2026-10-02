// While the town is being built, the old low-poly prop helpers report what they
// would have built here instead, so the voxel world can place the voxel version
// (pumpkins become kickable voxel pumpkins, benches voxel benches, etc).
export const DECOR = { on: false, list: [] };

export function decor(type, x, y, z, opts = {}) {
  if (!DECOR.on) return false;
  DECOR.list.push({ type, x, y, z, ...opts });
  return true;
}
