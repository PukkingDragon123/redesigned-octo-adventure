// Voxel food: Nana's cocoa mugs, dishes for tables, and grocery items for shop shelves.
// 0.025 m voxels (twice the detail of regular props) so food reads when held or on a table.
// Every builder returns { vox, size, origin, meta: { steam: [{x,y,z}], radius, height } };
// steam points are metres relative to the origin (pivot), at the surface steam rises from.
import { Vox, tone, mixc, vhash } from '../vox.js';

const S = 0.025;

// ------------------------------------------------------------------ palette
const C = {
  cocoa: 0x7a4430, cocoaTop: 0x9a5636, cocoaHi: 0xbc7a54,
  mocha: 0x5e3424,
  cream: 0xfaf0dc, creamSh: 0xe8d6bc,
  marsh: 0xfff2e0, toast: 0xd8a050, toastDk: 0xb87a3a,
  red: 0xc8382e, redDk: 0x9a2a26, cream2: 0xf0dfbe, mint: 0x62c49c, mintDk: 0x48a080,
  pumpkin: 0xf07e2a, pumpkinDk: 0xc85c1e, leaf: 0x5aa83a, leafDk: 0x3e7e2c,
  maroon: 0x8a2a34, charcoal: 0x4a3a4a, flame: 0xf08a2a, flameHi: 0xf8d040,
  navy: 0x34558e, coffee: 0x4a2a1c, cinn: 0xa05a2c, cinnHi: 0xc87a44,
  paper: 0xf2ece0, kraft: 0xc8965a, kraftDk: 0xa87a44, lid: 0x5e3828, lidHi: 0x7a4c36,
  plate: 0xeeeae4, plateRim: 0xd8d4e0, plateBlue: 0x5a82c8,
  pancake: 0xc47c36, pancakeTop: 0xe6ac5a, syrup: 0xc8641a, syrupHi: 0xe8902e, butter: 0xf8dc78, butterHi: 0xfff0b0,
  crust: 0xdca058, crustDk: 0xb87a3e, crustHi: 0xecc07a, pieFill: 0xd8701e, pieFillHi: 0xe8883a,
  appleFill: 0xe0a03a, appleFillDk: 0xc07a28, dish: 0x5a82c8, dishDk: 0x42629e,
  tart: 0xb85a1a, tartHi: 0xd88a3a, raisin: 0x4a2030,
  cookie: 0xd29a52, cookieDk: 0xb47a3a, oat: 0xecd8a0,
  dough: 0xdc9c52, doughHi: 0xecb874, cinnSwirl: 0x8a4420, icing: 0xfaf2e8,
  fry: 0xf0c050, fryDk: 0xd09a30, curd: 0xf4dc98, gravy: 0x7a4224, gravyHi: 0xa0623a, check: 0xd03c30, checkW: 0xf4eee4,
  bowl: 0xc8382e, bowlDk: 0x9a2a26, soup: 0xf08a30, soupHi: 0xf8a850, silver: 0xc4c8d6, silverHi: 0xe4e8f0, crouton: 0xd89a48,
  toastB: 0xe8b45e, toastCr: 0xa8642a, eggW: 0xf6eee2, yolk: 0xf8a820, yolkHi: 0xfcc850,
  appleG: 0x9cc84a, appleR: 0xd8342c, appleRDk: 0xa82424, caramel: 0xb86c24, caramelHi: 0xd8903a, wood: 0xd8b07a, woodDk: 0xb07840,
  milk: 0xf2f4f6, glass: 0xc8e2ee, blue: 0x4a78c8, carton: 0xbab6cc, cartonDk: 0x9a96b0, eggB: 0xdc9e6a, eggWh: 0xf4ece0,
  sack: 0xece0c4, sackDk: 0xd4c4a0, twine: 0xb07a48, pink: 0xe8608a, pinkL: 0xf8b8cc, bagBlue: 0xd2e6f2,
  tinRed: 0xd03c30, gold: 0xe8b440, goldDk: 0xc08a2a, amber: 0xc87e2a, amberHi: 0xecb050,
  plum: 0x6a2a5a, choc: 0x5c3020, chocHi: 0x7a4630, foil: 0xc4c8d6,
  crate: 0xb07840, crateDk: 0x8a5a30, crateHi: 0xc8925a, stem: 0x6a5a2a,
};

// ------------------------------------------------------------------ helpers
// cylinder of float radius around a float centre (cx, cz); c may be fn(x,y,z,dx,dz)
function cyl(v, cx, cz, y0, y1, r, c) {
  for (let y = y0; y <= y1; y++) for (let z = Math.floor(cz - r) - 1; z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r); x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    if (dx * dx + dz * dz > r * r + 0.01) continue;
    const col = typeof c === 'function' ? c(x, y, z, dx, dz) : c;
    if (col) v.set(x, y, z, col);
  }
}
function hollow(v, cx, cz, y0, y1, r) {
  for (let y = y0; y <= y1; y++) for (let z = Math.floor(cz - r) - 1; z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r); x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    if (dx * dx + dz * dz <= r * r + 0.01) v.set(x, y, z, 0);
  }
}
// ellipsoid with a float centre
function blob(v, cx, cy, cz, rx, ry, rz, c) {
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz) - 1; z <= Math.ceil(cz + rz); z++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    if (dx * dx + dy * dy + dz * dz > 1) continue;
    const col = typeof c === 'function' ? c(x, y, z, dx, dy, dz) : c;
    if (col) v.set(x, y, z, col);
  }
}
const ang = (x, z, cx, cz) => Math.atan2(x + 0.5 - cx, z + 0.5 - cz); // 0 = front (+z)
const vary = (c, x, y, z, k = 0.05, s = 0) => tone(c, (vhash(x, y, z, s) - 0.5) * 2 * k);
// recolour only the outer shell (voxels with an empty side neighbour)
function shell(v, fn) {
  const src = v.clone();
  v.paint((x, y, z, c) => {
    const open = !src.get(x + 1, y, z) || !src.get(x - 1, y, z) || !src.get(x, y, z + 1) || !src.get(x, y, z - 1);
    return open ? fn(x, y, z, c) : undefined;
  });
}
function done(v, o = {}) {
  const b = v.bounds();
  const origin = o.origin ?? [(b.x0 + b.x1 + 1) / 2, 0, (b.z0 + b.z1 + 1) / 2];
  let rad = 0;
  for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
    if (!v.data[v.idx(x, y, z)]) continue;
    rad = Math.max(rad, Math.hypot(Math.abs(x + 0.5 - origin[0]) + 0.5, Math.abs(z + 0.5 - origin[2]) + 0.5));
  }
  const m = (k) => +(k * S).toFixed(4);
  const steam = (o.steam || []).map(([x, y, z]) => ({ x: m(x - origin[0]), y: m(y - origin[1]), z: m(z - origin[2]) }));
  return { vox: v, size: S, origin, meta: { steam, radius: m(rad), height: m(b.y1 + 1 - origin[1]), ...(o.meta || {}) } };
}

// ------------------------------------------------------------------ cocoa mugs
// Body: 6 voxels across (0.15 m), 6 tall, handle on +x, liquid one voxel below the rim.
function mug(o) {
  const v = new Vox(9, 10, 7);
  const cx = 3, cz = 3;
  const body = o.body;
  cyl(v, cx, cz, 0, 0, 2.6, o.foot ?? tone(body, -0.18));
  cyl(v, cx, cz, 1, 5, 3.05, (x, y, z, dx, dz) => {
    const a = Math.atan2(dx, dz);
    return (o.deco && o.deco(x, y, z, a)) || vary(body, x, y, z, 0.035);
  });
  // rim lip a touch lighter
  cyl(v, cx, cz, 5, 5, 3.05, (x, y, z) => (o.deco && o.deco(x, 5, z, ang(x, z, cx, cz))) || tone(body, 0.1));
  hollow(v, cx, cz, 5, 5, 2.1);
  // liquid surface
  cyl(v, cx, cz, 4, 4, 2.1, (x, y, z) => ((x === 1 && z === 2) || (x === 2 && z === 1) ? o.hi ?? C.cocoaHi : vary(o.liquid ?? C.cocoaTop, x, y, z, 0.04)));
  // handle
  const H = o.handle ?? body;
  for (const z of [2, 3]) {
    v.set(6, 1, z, tone(H, -0.05)); v.set(6, 4, z, H);
    for (let y = 1; y <= 4; y++) v.set(7, y, z, y === 4 ? tone(H, 0.08) : H);
  }
  if (o.top) o.top(v);
  return done(v, { origin: [cx, 0, cz], steam: [[cx, 5.2, cz]] });
}
const swirlTop = (v, c, extra) => {
  cyl(v, 3, 3, 5, 5, 2.1, (x, y, z) => vary(c, x, y, z, 0.04));
  cyl(v, 3, 3, 6, 6, 1.5, (x, y, z) => vary(tone(c, 0.03), x, y, z, 0.03));
  v.set(2, 6, 1, tone(c, -0.04)); v.set(4, 6, 3, tone(c, -0.04)); v.set(1, 6, 3, tone(c, -0.06));
  v.set(3, 7, 2, c);
  if (extra) extra(v);
};

export function cocoaClassic() {
  return mug({
    body: C.red,
    deco: (x, y, z, a) => {
      if (y !== 2 && y !== 4) return 0;
      const q = a / (Math.PI / 4) + (y === 4 ? 0.5 : 0);
      return Math.abs(q - Math.round(q)) < 0.24 ? C.cream : 0;
    },
    top: (v) => {
      for (const [x, z] of [[1, 2], [3, 1], [2, 3], [4, 3], [3, 4], [2, 1]]) v.set(x, 5, z, vary(C.marsh, x, 5, z, 0.03));
      v.set(2, 6, 2, C.marsh); v.set(3, 5, 2, C.creamSh);
    },
  });
}
export function cocoaMaple() {
  return mug({
    body: C.cream2,
    foot: 0xd8c4a0,
    deco: (x, y, z, a) => {
      if (y === 1) return C.red;
      if (z === 5 && ((y === 2 || y === 3) && (x === 2 || x === 3))) return C.red;
      if (z === 5 && y === 3 && (x === 1 || x === 4)) return C.red;
      if (z === 5 && y === 4 && x === 2) return C.red;
      return 0;
    },
    top: (v) => {
      for (const [x0, z0] of [[1, 1], [3, 3]]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) {
        v.set(x0 + dx, 5, z0 + dz, C.marsh);
        v.set(x0 + dx, 6, z0 + dz, (dx + dz) % 2 ? C.toast : C.toastDk);
      }
      v.set(4, 6, 4, C.syrup); v.set(3, 6, 3, C.syrupHi); v.set(4, 5, 4, C.syrup);
    },
  });
}
export function cocoaMint() {
  return mug({
    body: C.mint,
    deco: (x, y, z, a) => (y >= 1 && y <= 4 && Math.abs(Math.sin(a * 2.5)) < 0.3 ? C.cream : 0),
    top: (v) => swirlTop(v, C.cream, (v) => {
      v.set(3, 7, 3, C.leaf); v.set(4, 7, 3, C.leafDk); v.set(3, 8, 3, C.leaf);
      v.set(1, 6, 2, C.red); v.set(4, 6, 1, C.red); v.set(2, 6, 4, C.red);
    }),
  });
}
export function cocoaPumpkin() {
  return mug({
    body: C.pumpkin,
    handle: C.leaf,
    deco: (x, y, z, a) => {
      const face = z === 5;
      if (face && y === 3 && (x === 1 || x === 4)) return 0x3a1a14;
      if (face && ((y === 1 && (x === 2 || x === 3)) || (y === 2 && (x === 1 || x === 4)))) return 0x3a1a14;
      if (!face && Math.abs(Math.sin(a * 3)) < 0.25) return C.pumpkinDk;
      return 0;
    },
    top: (v) => swirlTop(v, C.cream, (v) => {
      v.set(2, 6, 2, C.cinn); v.set(4, 5, 2, C.cinn); v.set(1, 5, 3, C.cinn); v.set(3, 7, 2, C.cinnHi);
    }),
  });
}
export function cocoaCinnamon() {
  return mug({
    body: C.maroon,
    handle: C.charcoal,
    liquid: 0x8e3e28,
    hi: 0xb05a3a,
    deco: (x, y, z, a) => {
      const k = Math.abs(Math.sin(a * 3 + 0.4));
      if (y === 1) return k > 0.5 ? C.flameHi : C.flame;
      if (y === 2 && k > 0.55) return C.flame;
      if (y === 3 && k > 0.92) return C.flame;
      return 0;
    },
    top: (v) => {
      for (let y = 4; y <= 8; y++) v.set(4, y, 2, y === 8 ? C.cinnHi : (y % 2 ? C.cinn : tone(C.cinn, -0.1)));
      for (const [x, z] of [[1, 2], [4, 3], [3, 1], [2, 4]]) v.set(x, 5, z, x === 4 ? 0xe0202c : 0xc01a26);
    },
  });
}
export function cocoaMocha() {
  return mug({
    body: C.navy,
    liquid: C.mocha,
    deco: (x, y, z) => (y === 4 || y === 1 ? C.cream2 : 0),
    top: (v) => {
      cyl(v, 3, 3, 5, 5, 2.1, (x, y, z) => vary(0xecd2ac, x, y, z, 0.03));
      v.set(2, 5, 2, C.mocha); v.set(3, 5, 2, C.mocha); v.set(2, 5, 3, C.mocha);
      v.set(4, 6, 3, C.coffee); v.set(3, 6, 4, C.coffee);
    },
  });
}
export function cocoaTakeaway() {
  const v = new Vox(5, 10, 5);
  const cx = 2.5, cz = 2.5;
  for (let y = 0; y <= 6; y++) cyl(v, cx, cz, y, y, 1.75 + y * 0.12, (x, yy, z) => (y >= 2 && y <= 4 ? vary(C.kraft, x, y, z, 0.04) : y === 6 ? 0xf08a2a : y === 0 ? 0xe0d8cc : C.paper));
  v.set(2, 3, 4, C.paper); v.set(2, 4, 4, 0xe8e0d0); // little skull logo on the sleeve
  cyl(v, cx, cz, 7, 7, 2.6, C.lid);
  cyl(v, cx, cz, 8, 8, 1.75, C.lidHi);
  v.set(2, 8, 3, 0); v.set(2, 7, 3, 0x2a1a14);
  return done(v, { origin: [cx, 0, cz], steam: [[2.5, 8.2, 3.5]] });
}

// ------------------------------------------------------------------ dishes
function plate(v, cx, cz, r, col = C.plate) {
  cyl(v, cx, cz, 0, 0, r, (x, y, z, dx, dz) => (Math.hypot(dx, dz) > r - 0.9 ? C.plateRim : col));
}
export function pancakes() {
  const v = new Vox(11, 8, 11);
  const cx = 5.5, cz = 5.5;
  plate(v, cx, cz, 5.3);
  const off = [[0, 0], [0.4, -0.2], [-0.3, 0.3], [0.2, 0.2], [-0.2, -0.3]];
  for (let k = 0; k < 5; k++) {
    const [ox, oz] = off[k];
    const r = k % 2 ? 3.35 : 3.8;
    cyl(v, cx + ox, cz + oz, 1 + k, 1 + k, r, (x, y, z, dx, dz) => {
      const rr = Math.hypot(dx, dz);
      if (rr > r - 0.9) return vary(k % 2 ? 0xb06a2e : C.pancake, x, y, z, 0.05, k);
      return vary(C.pancakeTop, x, y, z, 0.05, k);
    });
  }
  // syrup pooled on top and running down the sides
  cyl(v, cx - 0.2, cz - 0.3, 5, 5, 2.4, (x, y, z) => (vhash(x, 0, z, 4) < 0.3 ? C.syrupHi : C.syrup));
  for (const [x, z, n] of [[2, 5, 4], [8, 6, 2], [5, 8, 3], [6, 2, 1], [8, 4, 3]]) {
    for (let y = 5; y > 5 - n; y--) {
      // find the outermost voxel of this column's layer and glaze it
      let xx = x, zz = z;
      if (!v.get(xx, y, zz)) continue;
      v.set(xx, y, zz, y === 5 - n + 1 ? C.syrupHi : C.syrup);
    }
  }
  v.set(5, 6, 5, C.butter); v.set(6, 6, 5, C.butter); v.set(5, 6, 6, C.butterHi); v.set(6, 6, 6, C.butter);
  return done(v, { origin: [cx, 0, cz], steam: [[cx, 6.5, cz]] });
}
function pie(o) {
  const R = o.r ?? 6.2, n = Math.ceil(R * 2) + 1;
  const v = new Vox(n, 5, n);
  const cx = n / 2, cz = n / 2;
  cyl(v, cx, cz, 0, 0, R - 0.6, o.base ?? C.crustDk);
  cyl(v, cx, cz, 1, 1, R, (x, y, z, dx, dz) => (Math.hypot(dx, dz) > R - 1.1 ? C.crust : o.fill(x, y, z, dx, dz)));
  cyl(v, cx, cz, 2, 2, R, (x, y, z, dx, dz) => {
    if (Math.hypot(dx, dz) > R - 1.1) return Math.sin(Math.atan2(dx, dz) * 12) > 0 ? C.crustHi : C.crust;
    return o.top ? o.top(x, y, z, dx, dz) : 0;
  });
  if (o.extra) o.extra(v, cx, cz);
  if (o.wedge) {
    v.carve((x, y, z) => Math.abs(ang(x, z, cx, cz)) > o.wedge || Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < 0.8);
    v.paint((x, y, z) => (y === 0 ? C.crust : undefined));
  }
  return v;
}
export function pumpkinPie() {
  const v = pie({
    fill: (x, y, z) => (vhash(x, y, z, 2) < 0.15 ? C.pieFillHi : C.pieFill),
    extra: (v) => {
      for (const [x, z] of [[6, 3], [9, 6], [6, 9], [3, 6], [6, 6]]) v.set(x, 2, z, C.cream);
      v.set(6, 3, 6, C.cream); v.set(7, 2, 6, C.creamSh);
    },
  });
  return done(v, { origin: [6.5, 0, 6.5], steam: [[6.5, 2.5, 6.5]] });
}
export function pumpkinPieSlice() {
  const v = pie({
    r: 7.4,
    fill: (x, y, z) => (vhash(x, y, z, 2) < 0.15 ? C.pieFillHi : C.pieFill),
    // a filling-top layer so the slice is 3 voxels deep, plus a dollop of cream
    top: (x, y, z, dx, dz) => (vhash(x, y, z, 6) < 0.12 ? C.pieFillHi : C.pieFill),
    extra: (v, cx, cz) => { v.set(7, 3, 10, C.cream); v.set(7, 3, 11, C.cream); v.set(7, 4, 10, C.cream); v.set(8, 3, 10, C.creamSh); },
    wedge: 0.4,
  });
  return done(v);
}
export function applePie() {
  const v = pie({
    base: C.dishDk,
    fill: (x, y, z) => (vhash(x, y, z, 3) < 0.2 ? C.appleFillDk : C.appleFill),
    top: (x, y, z) => ((x % 3 === 0 || z % 3 === 0) ? ((x + z) % 2 ? C.crustHi : C.crust) : 0),
  });
  // ceramic dish rim under the crust
  cyl(v, 6.5, 6.5, 0, 0, 6.2, (x, y, z, dx, dz) => (Math.hypot(dx, dz) > 5.4 ? C.dish : 0));
  return done(v, { origin: [6.5, 0, 6.5], steam: [[6.5, 2.5, 6.5], [4.5, 2.5, 8]] });
}
export function butterTarts() {
  const v = new Vox(11, 4, 11);
  plate(v, 5.5, 5.5, 5.3);
  for (const [tx, tz] of [[3.5, 4.5], [7.5, 3.5], [6, 7.5]]) {
    cyl(v, tx, tz, 1, 1, 2.1, C.crustDk);
    cyl(v, tx, tz, 2, 2, 2.1, (x, y, z, dx, dz) => (Math.hypot(dx, dz) > 1.2 ? (Math.abs(dx) > Math.abs(dz) ? C.crust : C.crustHi) : (vhash(x, y, z, 5) < 0.3 ? C.tartHi : C.tart)));
    v.set(Math.floor(tx), 2, Math.floor(tz) - 1, C.raisin);
  }
  return done(v, { origin: [5.5, 0, 5.5] });
}
export function cookiesPlate() {
  const v = new Vox(11, 5, 11);
  plate(v, 5.5, 5.5, 5.3);
  const cookie = (cx, cz, y, s) => cyl(v, cx, cz, y, y, 2.1, (x, yy, z) => {
    const h = vhash(x, y, z, s);
    return h < 0.12 ? C.raisin : h < 0.3 ? C.oat : h > 0.85 ? C.cookieDk : C.cookie;
  });
  cookie(4, 4, 1, 1); cookie(4.3, 4.2, 2, 2); cookie(3.8, 4.1, 3, 3);
  cookie(7.5, 6, 1, 4); cookie(4.5, 8, 1, 5);
  return done(v, { origin: [5.5, 0, 5.5] });
}
export function cinnamonRoll() {
  const v = new Vox(9, 6, 9);
  const cx = 4.5, cz = 4.5;
  plate(v, cx, cz, 4.4);
  // side: dough with the tail of the spiral
  cyl(v, cx, cz, 1, 2, 3.3, (x, y, z, dx, dz) => (Math.abs(Math.atan2(dx, dz) - 0.7) < 0.3 ? C.cinnSwirl : vary(C.dough, x, y, z, 0.04)));
  // top: dough and cinnamon bands winding in
  cyl(v, cx, cz, 3, 3, 3.3, (x, y, z, dx, dz) => {
    const r = Math.hypot(dx, dz), a = (Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2);
    const band = Math.floor(r + a * 1.0);
    return band % 2 ? C.cinnSwirl : C.doughHi;
  });
  for (const [x, z] of [[2, 4], [3, 3], [4, 4], [5, 5], [6, 4]]) v.set(x, 4, z, C.icing);
  v.set(6, 3, 7, C.icing); v.set(6, 2, 7, C.icing);
  return done(v, { origin: [cx, 0, cz], steam: [[cx, 4.5, cz]] });
}
export function poutine() {
  const v = new Vox(9, 6, 7);
  const ck = (x, y, z) => ((x + y + z) % 2 ? C.check : C.checkW);
  v.fill(1, 0, 1, 7, 0, 5, ck);
  for (let y = 1; y <= 2; y++) for (let x = 0; x <= 8; x++) for (let z = 0; z <= 6; z++) {
    const edge = x === 0 || x === 8 || z === 0 || z === 6;
    if (edge && !((x === 0 || x === 8) && (z === 0 || z === 6))) v.set(x, y, z, ck(x, y, z));
  }
  // fries
  v.fill(1, 1, 1, 7, 2, 5, (x, y, z) => (vhash(x, y, z, 7) < 0.5 ? C.fry : C.fryDk));
  for (const [x, z, h] of [[1, 2, 2], [2, 4, 1], [3, 1, 2], [5, 5, 2], [6, 2, 1], [7, 4, 2], [4, 3, 1], [2, 1, 1], [6, 4, 1]]) for (let y = 3; y < 3 + h; y++) v.set(x, y, z, y === 2 + h ? C.fry : C.fryDk);
  // curds and gravy
  for (const [x, z] of [[3, 3], [5, 2], [4, 4], [2, 3], [6, 3]]) v.set(x, 3, z, C.curd);
  for (const [x, z] of [[3, 2], [4, 2], [4, 3], [5, 3], [5, 4], [3, 4], [4, 5]]) v.set(x, 3, z, (x + z) % 3 ? C.gravy : C.gravyHi);
  v.set(4, 4, 3, C.gravyHi); v.set(4, 4, 4, C.curd);
  return done(v, { origin: [4.5, 0, 3.5], steam: [[4.5, 4.5, 3.5]] });
}
export function soupBowl() {
  const v = new Vox(11, 6, 9);
  const cx = 4.5, cz = 4.5;
  cyl(v, cx, cz, 0, 0, 2.2, C.bowlDk);
  cyl(v, cx, cz, 1, 1, 3.2, C.bowl);
  cyl(v, cx, cz, 2, 2, 4.1, C.cream2);
  cyl(v, cx, cz, 3, 3, 4.4, (x, y, z) => vary(C.bowl, x, y, z, 0.04));
  hollow(v, cx, cz, 3, 3, 3.4);
  cyl(v, cx, cz, 2, 2, 3.2, (x, y, z, dx, dz) => {
    const r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (r < 2.4 && ((r * 0.6 - a / (Math.PI * 2) + 10) % 1) < 0.18) return C.cream;
    return vhash(x, y, z, 9) < 0.15 ? C.soupHi : C.soup;
  });
  v.set(3, 3, 3, C.crouton); v.set(5, 3, 5, C.crouton); v.set(2, 2, 5, C.leaf);
  for (const [x, y] of [[6, 3], [7, 4], [8, 5], [9, 5]]) v.set(x, y, 4, x > 7 ? C.silverHi : C.silver);
  v.set(5, 2, 4, C.silver);
  return done(v, { origin: [cx, 0, cz], steam: [[cx, 3.2, cz]] });
}
export function eggsToast() {
  const v = new Vox(11, 5, 11);
  plate(v, 5.5, 5.5, 5.3);
  v.fill(2, 1, 2, 8, 1, 8, (x, y, z) => (x === 2 || x === 8 || z === 2 || z === 8 ? C.toastCr : vary(C.toastB, x, y, z, 0.06)));
  v.fill(3, 2, 2, 7, 2, 2, C.toastCr); // domed crust at the back
  blob(v, 5.5, 2, 5.5, 2.8, 0.6, 2.4, (x, y, z) => (y === 2 ? C.eggW : 0));
  v.set(5, 2, 5, C.yolk); v.set(6, 2, 5, C.yolk); v.set(5, 2, 6, C.yolk); v.set(6, 2, 6, C.yolk);
  v.set(5, 3, 5, C.yolkHi); v.set(6, 3, 6, C.yolk);
  v.set(3, 2, 6, C.eggW); v.set(8, 2, 5, C.eggW);
  return done(v, { origin: [5.5, 0, 5.5], steam: [[5.5, 3.5, 5.5]] });
}
export function caramelApple() {
  const v = new Vox(7, 10, 7);
  cyl(v, 3.5, 3.5, 0, 0, 2.6, (x, y, z) => (vhash(x, y, z, 2) < 0.3 ? C.caramelHi : C.caramel));
  blob(v, 3.5, 3, 3.5, 2.9, 2.6, 2.9, (x, y, z) => {
    const line = 3 + (vhash(x, 0, z, 3) < 0.45 ? 1 : 0);
    if (y >= line) return vary(C.appleG, x, y, z, 0.04);
    if (y <= 2 && vhash(x, y, z, 4) < 0.25) return 0xe8c890;
    return y === 3 ? C.caramelHi : C.caramel;
  });
  v.set(3, 5, 3, tone(C.appleG, -0.25));
  for (let y = 5; y <= 8; y++) v.set(3, y, 3, y === 8 ? C.woodDk : C.wood);
  return done(v, { origin: [3.5, 0, 3.5] });
}

// ------------------------------------------------------------------ grocery shelf items
export function milkBottle() {
  const v = new Vox(5, 8, 5);
  const cx = 2.5, cz = 2.5;
  cyl(v, cx, cz, 0, 4, 2.4, (x, y, z) => (y === 2 || y === 3 ? (y === 3 && z === 4 && x === 2 ? C.milk : C.blue) : vary(C.milk, x, y, z, 0.02)));
  cyl(v, cx, cz, 5, 5, 1.6, C.milk);
  cyl(v, cx, cz, 6, 6, 1.05, C.glass);
  cyl(v, cx, cz, 7, 7, 1.05, C.red);
  return done(v, { origin: [cx, 0, cz] });
}
export function eggCarton() {
  const v = new Vox(11, 5, 9);
  v.fill(0, 0, 1, 10, 1, 8, (x, y, z) => (y === 0 ? C.cartonDk : (x % 3 === 0 || z === 1 || z === 8 || z === 4 || z === 5) ? tone(C.carton, 0.06) : C.carton));
  v.fill(0, 1, 0, 10, 2, 0, (x, y) => (y === 2 ? tone(C.carton, 0.1) : C.carton)); // folded-back lid
  const eggs = [[1, 2, C.eggB], [4, 2, C.eggWh], [7, 2, C.eggB], [1, 6, C.eggWh], [4, 6, C.eggB], [7, 6, C.eggB]];
  for (const [ex, ez, col] of eggs) {
    v.fill(ex, 2, ez, ex + 1, 3, ez + 1, (x, y, z) => (y === 3 ? tone(col, 0.07) : vary(col, x, y, z, 0.03)));
  }
  return done(v);
}
export function flourSack() {
  const v = new Vox(7, 10, 5);
  blob(v, 3.5, 3.4, 2.5, 3.6, 3.9, 2.6, (x, y, z) => {
    if (y === 4 && (z === 4 || z === 0)) return C.blue;
    if (y === 3 && (z === 4 || z === 0)) return C.red;
    return vary(C.sack, x, y, z, 0.04);
  });
  v.fill(2, 7, 1, 4, 7, 3, C.twine);
  v.fill(2, 8, 1, 4, 8, 3, (x, y, z) => ((x + z) % 2 ? C.sack : C.sackDk));
  v.set(2, 9, 2, C.sack); v.set(4, 9, 2, C.sackDk); v.set(3, 9, 1, C.sack);
  v.set(4, 6, 4, C.twine); v.set(4, 5, 4, C.twine);
  return done(v);
}
export function sugarBag() {
  const v = new Vox(5, 7, 3);
  v.fill(0, 0, 0, 4, 5, 2, (x, y, z) => (y === 2 || y === 3 ? (y === 3 && x === 2 && z === 2 ? 0xf4eee2 : C.pink) : vary(C.paper, x, y, z, 0.02)));
  v.fill(0, 6, 1, 4, 6, 1, 0xe0d8cc);
  return done(v);
}
export function cocoaTin() {
  const v = new Vox(5, 6, 5);
  const cx = 2.5, cz = 2.5;
  cyl(v, cx, cz, 0, 4, 2.4, (x, y, z) => (y === 0 ? C.goldDk : y === 2 || y === 3 ? (z === 4 && x === 2 && y === 2 ? C.choc : C.cream) : C.tinRed));
  cyl(v, cx, cz, 5, 5, 2.4, (x, y, z) => (x === 2 && z === 2 ? C.goldDk : C.gold));
  return done(v, { origin: [cx, 0, cz] });
}
export function marshmallowBag() {
  const v = new Vox(6, 8, 3);
  v.fill(0, 0, 0, 5, 6, 2, (x, y, z) => {
    if ((z === 0 || z === 2 || x === 0 || x === 5) && (x + y * 2) % 3 === 0) return (x + y) % 2 ? C.pinkL : C.marsh;
    return C.bagBlue;
  });
  v.set(0, 6, 0, 0); v.set(5, 6, 0, 0); v.set(0, 6, 2, 0); v.set(5, 6, 2, 0);
  v.fill(0, 7, 1, 5, 7, 1, (x) => (x % 2 ? C.pink : tone(C.pink, 0.15)));
  return done(v);
}
export function mapleSyrup() {
  const v = new Vox(6, 9, 5);
  const cx = 2.5, cz = 2.5;
  cyl(v, cx, cz, 0, 4, 2.4, (x, y, z, dx, dz) => {
    if ((y === 2 || y === 3) && dz > 1) return x === 2 && y === 2 ? C.red : C.cream;
    return dx < -1 && dz > 0 ? C.amberHi : C.amber;
  });
  cyl(v, cx, cz, 5, 5, 1.6, C.amber);
  v.set(2, 6, 2, C.amber); v.set(2, 7, 2, C.amber); v.set(2, 8, 2, C.red);
  v.set(3, 6, 2, C.amber); v.set(4, 6, 2, C.amber); v.set(4, 5, 2, C.amberHi);
  return done(v, { origin: [cx, 0, cz] });
}
export function butterBlock() {
  const v = new Vox(8, 3, 5);
  v.fill(0, 0, 0, 7, 0, 4, (x, y, z) => (x % 3 === 1 ? C.blue : C.paper));
  v.fill(1, 1, 1, 5, 2, 3, (x, y, z) => (y === 2 ? C.butterHi : C.butter));
  v.set(6, 1, 2, C.butter);
  return done(v);
}
function crate(w, d, h) {
  const v = new Vox(w, h + 5, d);
  v.fill(0, 0, 0, w - 1, 0, d - 1, C.crateDk);
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
    if (!edge) continue;
    const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
    if (y === 2 && !corner) continue; // gap between slats
    v.set(x, y, z, corner ? C.crateDk : y === h - 1 ? C.crateHi : vary(C.crate, x, y, z, 0.05));
  }
  return v;
}
export function applesCrate() {
  const v = crate(12, 8, 4);
  v.fill(1, 1, 1, 10, 2, 6, C.crateDk);
  let k = 0;
  for (const [ax, az] of [[2.5, 2.5], [5.5, 2.3], [8.5, 2.6], [3.8, 5.3], [6.9, 5.5], [9.6, 5.2], [1.8, 5.4]]) {
    const col = k++ % 2 ? C.appleG : C.appleR;
    blob(v, ax, 3.6, az, 1.6, 1.5, 1.6, (x, y, z, dx, dy) => (dy > 0.6 && Math.abs(dx) < 0.4 ? tone(col, -0.25) : vary(col, x, y, z, 0.05)));
    if (k % 3 === 0) v.set(Math.floor(ax) + 1, 5, Math.floor(az), C.leaf);
  }
  return done(v);
}
export function pumpkinCrate() {
  const v = crate(14, 10, 4);
  v.fill(1, 1, 1, 12, 2, 8, C.crateDk);
  for (const [px, pz, r, col] of [[4, 4.5, 2.9, C.pumpkin], [10, 4, 2.6, 0xf49a3a], [7, 7.5, 2.2, 0xe86e22]]) {
    blob(v, px, 3.5, pz, r, r * 0.72, r, (x, y, z) => (Math.abs(Math.sin(Math.atan2(x + 0.5 - px, z + 0.5 - pz) * 3)) < 0.35 ? tone(col, -0.22) : vary(col, x, y, z, 0.04)));
    const top = Math.floor(3.5 + r * 0.72);
    v.set(Math.floor(px), top + 1, Math.floor(pz), 0x6a7a30);
    v.set(Math.floor(px), top, Math.floor(pz), 0x6a7a30);
  }
  return done(v);
}
export function chocolateBar() {
  const v = new Vox(4, 2, 7);
  v.fill(0, 0, 0, 3, 0, 6, (x, y, z) => (z <= 3 ? (z === 2 ? C.gold : C.plum) : C.choc));
  v.fill(0, 1, 4, 3, 1, 6, (x, y, z) => ((x + z) % 2 ? C.chocHi : C.choc));
  v.fill(0, 1, 3, 3, 1, 3, C.foil);
  return done(v);
}

export const PREVIEW = {
  cocoaClassic, cocoaMaple, cocoaMint, cocoaPumpkin, cocoaCinnamon, cocoaMocha, cocoaTakeaway,
  pancakes, pumpkinPie, pumpkinPieSlice, applePie, butterTarts, cookiesPlate, cinnamonRoll, poutine, soupBowl, eggsToast, caramelApple,
  milkBottle, eggCarton, flourSack, sugarBag, cocoaTin, marshmallowBag, mapleSyrup, butterBlock, applesCrate, pumpkinCrate, chocolateBar,
};
