// A voxel sketch pad in metres: shapes are sampled at voxel centres into a grid that keeps its
// metric frame, so the meshed model sits exactly where the shapes were drawn (no pivot maths).
//   const P = new VoxPad(size, [x0, y0, z0], [x1, y1, z1]);
//   P.sample(fn)            fn(x, y, z) -> colour | 0, for every voxel centre in the box
//   P.box(c, half, col)     axis-aligned box (centre, half extents)
//   P.line(a, b, r, col)    a round rod from a to b, at least one voxel thick
//   P.result()              -> { vox, size, origin } for meshVox
import { Vox } from './vox.js';

export class VoxPad {
  constructor(s, lo, hi) {
    this.s = s;
    this.i0 = Math.floor(lo[0] / s) - 1; this.j0 = Math.floor(lo[1] / s) - 1; this.k0 = Math.floor(lo[2] / s) - 1;
    this.v = new Vox(Math.ceil(hi[0] / s) - this.i0 + 2, Math.ceil(hi[1] / s) - this.j0 + 2, Math.ceil(hi[2] / s) - this.k0 + 2);
  }
  sample(fn, lo = null, hi = null) {
    const s = this.s, v = this.v;
    const ia = lo ? Math.max(0, Math.floor(lo[0] / s) - this.i0 - 1) : 0, ib = hi ? Math.min(v.w - 1, Math.ceil(hi[0] / s) - this.i0 + 1) : v.w - 1;
    const ja = lo ? Math.max(0, Math.floor(lo[1] / s) - this.j0 - 1) : 0, jb = hi ? Math.min(v.h - 1, Math.ceil(hi[1] / s) - this.j0 + 1) : v.h - 1;
    const ka = lo ? Math.max(0, Math.floor(lo[2] / s) - this.k0 - 1) : 0, kb = hi ? Math.min(v.d - 1, Math.ceil(hi[2] / s) - this.k0 + 1) : v.d - 1;
    for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const c = fn((i + this.i0 + 0.5) * s, (j + this.j0 + 0.5) * s, (k + this.k0 + 0.5) * s);
      if (c) v.data[v.idx(i, j, k)] = c >>> 0;
    }
    return this;
  }
  box(c, h, col) {
    const e = this.s * 0.5;
    const hx = Math.max(h[0], e), hy = Math.max(h[1], e), hz = Math.max(h[2], e);
    return this.sample((x, y, z) => (Math.abs(x - c[0]) <= hx && Math.abs(y - c[1]) <= hy && Math.abs(z - c[2]) <= hz ? col : 0),
      [c[0] - hx, c[1] - hy, c[2] - hz], [c[0] + hx, c[1] + hy, c[2] + hz]);
  }
  line(a, b, r, col) {
    const rr = Math.max(r, this.s * 0.55);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    return this.sample((x, y, z) => {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / L2));
      const ex = x - a[0] - dx * t, ey = y - a[1] - dy * t, ez = z - a[2] - dz * t;
      return ex * ex + ey * ey + ez * ez <= rr * rr ? (typeof col === 'function' ? col(x, y, z, t) : col) : 0;
    }, [Math.min(a[0], b[0]) - rr, Math.min(a[1], b[1]) - rr, Math.min(a[2], b[2]) - rr], [Math.max(a[0], b[0]) + rr, Math.max(a[1], b[1]) + rr, Math.max(a[2], b[2]) + rr]);
  }
  result() { return { vox: this.v, size: this.s, origin: [-this.i0, -this.j0, -this.k0] }; }
}
