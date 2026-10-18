// A pixel-art sprite pressed into a voxel model: every opaque pixel becomes a column of
// `depth` voxels (glowing pixels glow), like an item picked up in a block game. The pivot is
// the bottom centre of the sprite, mid-depth; +z is the side the sprite was drawn from.
//   extrudeSprite(atlas, frameName, { depth, size }) -> { vox, size, origin } | null
import { Vox, EMIT } from './vox.js';

export function extrudeSprite(atlas, name, { depth = 2, size = 0.04 } = {}) {
  const f = atlas?.frames?.get(name);
  if (!f) return null;
  const P = atlas.pix, W = f.w, H = f.h;
  const v = new Vox(W, H, depth);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = ((f.y + y) * P.w + (f.x + x)) * 4;
    const a = P.data[o + 3];
    if (a < 100) continue;
    let c = (P.data[o] << 16) | (P.data[o + 1] << 8) | P.data[o + 2];
    if (a > 140 && a < 180) c |= EMIT; // (alpha 160 marks a glowing pixel)
    // an outline pixel stays one voxel thin at the back so the piece has a little relief
    for (let z = 0; z < depth; z++) v.set(x, H - 1 - y, z, c >>> 0);
  }
  return { vox: v, size, origin: [W / 2, 0, depth / 2] };
}
