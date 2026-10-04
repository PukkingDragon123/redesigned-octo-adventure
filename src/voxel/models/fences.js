// Voxel fences that follow the ground (see world/fences3d.js): one panel between two posts, drawn
// instanced and stretched/sheared per piece so the rails run from post to post down any slope,
// and the posts on their own (one per joint, so neighbouring panels never double up).
//
// Panels: local x along the fence (centred, `len` metres post to post), y up, z out of the front
// face (the fence line is z = 0). Posts: centred on x = z = 0, standing on y = 0.
// Each builder returns { vox, size, origin, len? } ready for meshVox. `far` gives the coarse version.
import { Vox, tone, vhash } from '../vox.js';

const PAINT = 0xeee8da, PAINT_D = 0xd6cebe;
const GREY = 0x8a7a68, GREY_D = 0x655848, GREY_L = 0xa89884, BARK = 0x6e5038, LICHEN = 0x8c9a66, END = 0xb8a282;

// a white picket panel, 2 m post to post: pointed pickets in front of two rails
export function picketPanel({ far = false, seed = 0 } = {}) {
  const s = far ? 1 / 16 : 1 / 32, n = Math.round(2 / s);
  // (few colours, so the faces merge into long quads: the shader adds the paint texture)
  if (far) {
    // from afar the rails behind the pickets don't show: just the pickets
    const v = new Vox(n, 15, 1);
    for (let k = 0; k < 10; k++) { const x0 = Math.round((k + 0.5) * 3.2 - 1); v.fill(x0, 1, 0, x0 + 1, 13, 0, PAINT); }
    return { vox: v, size: s, origin: [n / 2, 0, 0.5], len: 2 };
  }
  const v = new Vox(n, Math.round(1 / s), 2);
  for (const [a, b] of [[7, 8], [22, 23]]) v.fill(0, a, 0, n - 1, b, 0, PAINT_D);
  for (let k = 0; k < 10; k++) {
    const x0 = Math.round((k + 0.5) * 6.4 - 1.5);
    const pc = tone(PAINT, (vhash(k, 3, 7, seed) - 0.5) * 0.05);
    v.fill(x0, 2, 1, x0 + 2, 4, 1, tone(pc, -0.1)); // rain splash near the ground
    v.fill(x0, 5, 1, x0 + 2, 27, 1, pc);
    v.set(x0 + 1, 28, 1, pc); // the point
  }
  return { vox: v, size: s, origin: [n / 2, 0, 1], len: 2 };
}

// the square white post between picket panels, with a cap and a little finial
export function picketPost({ far = false } = {}) {
  const s = far ? 1 / 16 : 1 / 32;
  if (far) {
    const v = new Vox(2, 19, 2);
    v.fill(0, 0, 0, 1, 17, 1, (x, y) => (y < 2 ? tone(PAINT, -0.1) : PAINT));
    v.fill(0, 18, 0, 1, 18, 1, PAINT_D);
    return { vox: v, size: s, origin: [1, 0, 1] };
  }
  const v = new Vox(6, 38, 6);
  v.fill(1, 0, 1, 4, 33, 4, (x, y) => (y < 5 ? tone(PAINT, -0.1) : PAINT));
  v.fill(0, 34, 0, 5, 34, 5, PAINT_D); // cap
  v.fill(1, 35, 1, 4, 35, 4, PAINT);
  v.fill(2, 36, 2, 3, 37, 3, PAINT); // finial
  return { vox: v, size: s, origin: [3, 0, 3] };
}

// a split-rail panel, 3 m post to post: two (or three) weathered grey rails that sag a little
export function railPanel({ far = false, rails = 2, seed = 0 } = {}) {
  const s = far ? 1 / 12 : 1 / 24, n = Math.round(3 / s);
  const v = new Vox(n, Math.round(1.1 / s), far ? 2 : 3);
  const ys = rails === 3 ? [0.3, 0.62, 0.94] : [0.42, 0.86];
  ys.forEach((ym, ri) => {
    const yc = Math.round(ym / s), sag = 0.4 + vhash(ri, 1, 2, seed) * 0.7;
    const rt = (vhash(ri, 9, 2, seed) - 0.5) * 0.08;
    // a strip of bark left on and a patch of lichen, somewhere along each rail
    const b0 = Math.floor(vhash(ri, 3, 2, seed) * (n - 20)) + 4, l0 = Math.floor(vhash(ri, 6, 2, seed) * (n - 16)) + 4;
    for (let x = 0; x < n; x++) {
      const y = yc - Math.round(Math.sin((x / (n - 1)) * Math.PI) * sag);
      const bark = x >= b0 && x < b0 + 9, lichen = x >= l0 && x < l0 + 5;
      // the top catches the light, a darker underside
      const shade = (dy) => tone(dy > 0 ? (lichen ? LICHEN : GREY_L) : dy < 0 ? GREY_D : bark ? BARK : GREY, rt);
      if (far) { for (const dz of [0, 1]) { v.set(x, y, dz, shade(-1)); v.set(x, y + 1, dz, shade(1)); } continue; }
      // a rounded 3 x 3 log: the corners left off
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (dy === 0 || dz === 0) v.set(x, y + dy, 1 + dz, shade(dy));
    }
  });
  return { vox: v, size: s, origin: [n / 2, 0, far ? 1 : 1.5], len: 3 };
}

// a round grey cedar post with a cut top
export function railPost({ far = false } = {}) {
  const s = far ? 1 / 12 : 1 / 24;
  if (far) {
    const v = new Vox(2, 14, 2);
    v.fill(0, 0, 0, 1, 13, 1, (x, y) => (y === 13 ? END : y < 2 ? GREY_D : GREY));
    return { vox: v, size: s, origin: [1, 0, 1] };
  }
  const v = new Vox(4, 28, 4);
  v.fill(0, 0, 0, 3, 27, 3, (x, y, z) => {
    const corner = (x === 0 || x === 3) && (z === 0 || z === 3);
    if (corner) return 0;
    if (y === 27) return END;
    return y < 3 ? GREY_D : y > 8 && y < 16 && x === 0 ? BARK : GREY;
  });
  v.set(1, 27, 1, tone(END, -0.12)); // the heartwood
  return { vox: v, size: s, origin: [2, 0, 2] };
}
