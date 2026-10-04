// A small voxel canvas: paint models in code, then mesh them (see mesh.js).
// Colors are 0xRRGGBB; the top byte carries flags (EMIT glows, GLASS glows at night).

export const EMIT = 1 << 24; // always glowing (jack-o-lantern insides, candles, eyes)
export const GLASS = 1 << 25; // window glass: dark by day, warm lamp-light at night
export const UNLIT = 1 << 26; // (with GLASS) a window whose room has the light off: dark at night too
export const FLAGS = EMIT | GLASS | UNLIT;

export class Vox {
  constructor(w, h, d) {
    this.w = w | 0;
    this.h = h | 0;
    this.d = d | 0;
    this.data = new Uint32Array(this.w * this.h * this.d);
  }
  idx(x, y, z) {
    return x + this.w * (y + this.h * z);
  }
  inb(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }
  get(x, y, z) {
    x |= 0; y |= 0; z |= 0;
    return this.inb(x, y, z) ? this.data[this.idx(x, y, z)] : 0;
  }
  set(x, y, z, c) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return;
    this.data[this.idx(x, y, z)] = c >>> 0;
  }
  // c may be a color or fn(x,y,z) -> color (0 = leave empty)
  _c(c, x, y, z) {
    return typeof c === 'function' ? c(x, y, z) : c;
  }
  fill(x0, y0, z0, x1, y1, z1, c) {
    const ax = Math.round(Math.min(x0, x1)), bx = Math.round(Math.max(x0, x1));
    const ay = Math.round(Math.min(y0, y1)), by = Math.round(Math.max(y0, y1));
    const az = Math.round(Math.min(z0, z1)), bz = Math.round(Math.max(z0, z1));
    for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const v = this._c(c, x, y, z);
      if (v) this.set(x, y, z, v);
    }
    return this;
  }
  // remove voxels in a box
  clear(x0, y0, z0, x1, y1, z1) {
    for (let z = Math.round(z0); z <= Math.round(z1); z++) for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, z, 0);
    return this;
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) {
            const v = this._c(c, x, y, z);
            if (v) this.set(x, y, z, v);
          }
        }
    return this;
  }
  // axis-aligned cylinder along y (or 'x' / 'z')
  cylinder(cx, cy, cz, r, len, c, axis = 'y', r2 = r) {
    for (let t = 0; t < len; t++) {
      const rr = r + (r2 - r) * (len > 1 ? t / (len - 1) : 0);
      for (let a = -Math.ceil(rr); a <= Math.ceil(rr); a++)
        for (let b = -Math.ceil(rr); b <= Math.ceil(rr); b++) {
          if (a * a + b * b > rr * rr + 0.3) continue;
          let x, y, z;
          if (axis === 'y') { x = cx + a; y = cy + t; z = cz + b; }
          else if (axis === 'x') { x = cx + t; y = cy + a; z = cz + b; }
          else { x = cx + a; y = cy + b; z = cz + t; }
          const v = this._c(c, x, y, z);
          if (v) this.set(x, y, z, v);
        }
    }
    return this;
  }
  // thick line between two points
  line(x0, y0, z0, x1, y1, z1, c, r = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
      if (r <= 0) this.set(x, y, z, this._c(c, Math.round(x), Math.round(y), Math.round(z)));
      else this.ellipsoid(x, y, z, r, r, r, c);
    }
    return this;
  }
  // recolor existing voxels: fn(x,y,z,c) -> new color (0 removes, undefined keeps)
  paint(fn, box = null) {
    const [x0, y0, z0, x1, y1, z1] = box || [0, 0, 0, this.w - 1, this.h - 1, this.d - 1];
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = this.idx(x, y, z);
      const c = this.data[i];
      if (!c) continue;
      const n = fn(x, y, z, c);
      if (n !== undefined) this.data[i] = n >>> 0;
    }
    return this;
  }
  // remove voxels where fn(x,y,z) is true
  carve(fn) {
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y, z);
      if (this.data[i] && fn(x, y, z)) this.data[i] = 0;
    }
    return this;
  }
  // copy another model in at an offset (empty source voxels are skipped)
  blit(src, ox, oy, oz) {
    for (let z = 0; z < src.d; z++) for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.data[src.idx(x, y, z)];
      if (c) this.set(x + ox, y + oy, z + oz, c);
    }
    return this;
  }
  // mirror the left half (x < w/2) onto the right half
  mirrorX() {
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w >> 1; x++) {
      this.data[this.idx(this.w - 1 - x, y, z)] = this.data[this.idx(x, y, z)];
    }
    return this;
  }
  count() {
    let n = 0;
    for (const c of this.data) if (c) n++;
    return n;
  }
  clone() {
    const v = new Vox(this.w, this.h, this.d);
    v.data.set(this.data);
    return v;
  }
  // bounding box of filled voxels
  bounds() {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.data[this.idx(x, y, z)]) continue;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
      if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
    }
    return { x0, y0, z0, x1, y1, z1 };
  }
}

// ---------------------------------------------------------------- color helpers
export function rgbOf(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
export function hexOf(r, g, b) {
  return ((Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)))) >>> 0;
}
// lighten (+) / darken (-) a color, keeping flags
export function tone(c, k) {
  const f = c & FLAGS;
  const [r, g, b] = rgbOf(c);
  const t = k >= 0 ? 255 : 0;
  const a = Math.abs(k);
  return (hexOf(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a) | f) >>> 0;
}
export function mixc(a, b, t) {
  const [r1, g1, b1] = rgbOf(a), [r2, g2, b2] = rgbOf(b);
  return hexOf(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
// deterministic hash in [0,1)
export function vhash(x, y, z, s = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// paint helper: a color fn with per-voxel variation
export function speckle(c, amt = 0.06, seed = 0) {
  return (x, y, z) => tone(c, (vhash(x, y, z, seed) - 0.5) * 2 * amt);
}
// choose between colors by noise
export function pickc(cols, seed = 0) {
  return (x, y, z) => cols[Math.floor(vhash(x, y, z, seed) * cols.length)];
}
