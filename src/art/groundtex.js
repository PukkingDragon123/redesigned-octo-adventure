// Tileable pixel-art ground textures (128 x 128 px per 4 m tile, i.e. 32 px per metre).
// Painted the way a pixel artist would: big soft patches of 3-5 tones, details grouped in
// clusters (tufts, leaf piles, pebble beds) with a highlight and a shadow pixel, and no lone
// single-pixel speckle, so the ground reads as calm and hand-made at native resolution.
import { Pix, RNG, mix, shade } from './pixel.js';
import { hash2 } from '../core/noise.js';

const S = 128;

// tileable value noise with integer period
function tnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const h = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// big soft patches (x,y in pixels of the tile)
function tfbm(x, y, seed, fine = 0.2) {
  return (
    tnoise(x / 42.67, y / 42.67, 3, seed) * (0.6 - fine * 0.5) +
    tnoise(x / 21.33, y / 21.33, 6, seed + 1) * 0.3 +
    tnoise(x / 10.67, y / 10.67, 12, seed + 2) * (0.1 + fine * 0.5)
  );
}

// soft tone bands: a few flat tones in big blobs, a darker pixel rim under each lighter blob
function bandFill(p, pal, seed, contrast = 1, fine = 0.2) {
  const k = new Int8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = tfbm(x, y, seed, fine);
    v = 0.5 + (v - 0.5) * contrast * 1.6;
    k[y * S + x] = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)));
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = k[y * S + x];
    const below = k[((y + 1) % S) * S + x];
    // the bottom edge of a lighter patch catches a little shadow
    p.set(x, y, below < c && c > 0 ? mix(pal[c], pal[c - 1], 0.55) : pal[c]);
  }
}

export const LEAF_COLORS = [0xc8361f, 0xe2622a, 0xf09a2e, 0xe8c143, 0x9e3b1b, 0xb84a22, 0xd47a2a];
// leaf piles keep to one family of colours each (a heap of reds, a drift of golds)
const LEAF_FAMILIES = [
  [0xc8361f, 0xb02e1c, 0xd84a28],
  [0xe2622a, 0xd0521e, 0xee7a34],
  [0xf09a2e, 0xe08624, 0xf6b040],
  [0xe8c143, 0xd8aa36, 0xf2d064],
  [0x9e3b1b, 0x8a3016, 0xb04a22],
];

// a little maple / birch leaf (5..7 px) with an outline, a vein highlight and a cast shadow
function leaf(p, rng, x, y, col, size = 1) {
  const dark = shade(col, -0.38), light = shade(col, 0.22);
  x = Math.round(x); y = Math.round(y);
  if (size === 0) {
    // small oval leaf (4 x 3)
    p.hline(x + 1, x + 2, y, col); p.hline(x, x + 3, y + 1, col); p.hline(x + 1, x + 2, y + 2, dark);
    p.set(x + 1, y + 1, light); p.set(x + 4, y + 2, shade(col, -0.55));
    return;
  }
  const flip = rng.chance(0.5);
  const X = (dx) => (flip ? x + 6 - dx : x + dx);
  // five-lobed maple leaf in a 7 x 6 box
  const rows = ['..#.#..', '.#####.', '#######', '.#####.', '..###..', '...#...'];
  rows.forEach((r, j) => {
    for (let i = 0; i < 7; i++) if (r[i] === '#') p.set(X(i), y + j, j >= 4 || i === 0 || i === 6 ? dark : col);
  });
  p.set(X(3), y + 1, light); p.set(X(3), y + 2, light); p.set(X(2), y + 2, light);
  // shadow on the ground below-right
  p.set(X(4), y + 6, shade(col, -0.6)); p.set(X(5), y + 4, shade(col, -0.6));
}

// a pebble cluster: a lit top-left pixel, a dark bottom-right rim
function pebble(p, rng, x, y, base, w = 2, h = 2) {
  x = Math.round(x); y = Math.round(y);
  p.rect(x, y, w, h, base);
  p.set(x, y, shade(base, 0.28));
  if (w > 2) p.set(x + 1, y, shade(base, 0.18));
  p.hline(x + 1, x + w, y + h, shade(base, -0.45));
  p.set(x + w, y + h - 1, shade(base, -0.45));
}

// a tuft of grass blades rising from a shadowed root
function tuft(p, rng, x, y, mids, tips, rootC) {
  const n = rng.int(3, 5);
  for (let b = 0; b < n; b++) {
    const bx = x + b - (n >> 1);
    const len = rng.int(3, 6) - Math.abs(b - (n >> 1));
    const lean = rng.pick([-1, 0, 0, 1]);
    for (let k = 0; k < len; k++) {
      const c = k >= len - 1 ? rng.pick(tips) : rng.pick(mids);
      p.set(bx + (k > len / 2 ? lean : 0), y - k, c);
    }
  }
  p.hline(x - (n >> 1), x + (n >> 1) + 1, y + 1, rootC);
}

function scatterClusters(rng, nClusters, perCluster, spread, fn) {
  for (let c = 0; c < nClusters; c++) {
    const cx = rng.int(0, S), cy = rng.int(0, S);
    const n = rng.int(perCluster[0], perCluster[1]);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * spread;
      fn(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, c, i);
    }
  }
}

export function grassTex(variant = 0) {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(11 + variant);
  const pal = variant === 1
    ? [0x34381c, 0x404520, 0x4e5226, 0x5c5e2a] // shady forest grass
    : [0x4a5022, 0x5a6026, 0x6a6e2c, 0x7c7e34, 0x8e8a3a];
  bandFill(p, pal, 3 + variant, 1.1, 0.25);
  const tips = variant === 1 ? [0x7a7436, 0x88803a] : [0xa69040, 0xb89e4a, 0xc4ac56];
  const mids = variant === 1 ? [0x4c5024, 0x585c28] : [0x646a2a, 0x72762e, 0x828034];
  const root = shade(pal[0], -0.25);
  // tufts grow in loose clumps
  scatterClusters(rng, 22, [4, 8], 9, (x, y) => tuft(p, rng, Math.round(x), Math.round(y), mids, tips, root));
  // a few fallen leaves, in twos and threes
  scatterClusters(rng, variant === 1 ? 5 : 3, [2, 3], 4, (x, y, c) => leaf(p, rng, x, y, LEAF_FAMILIES[c % LEAF_FAMILIES.length][rng.int(0, 2)], rng.chance(0.6) ? 0 : 1));
  // wildflowers: small clusters of one colour
  if (variant === 0) {
    const flowers = [0xf2ead0, 0xf5d860, 0xc890d0];
    scatterClusters(rng, 3, [3, 5], 4, (x, y, c) => {
      const col = flowers[c % flowers.length];
      x = Math.round(x); y = Math.round(y);
      p.set(x, y, col); p.set(x + 1, y, shade(col, -0.15)); p.set(x, y + 1, shade(col, -0.3)); p.set(x, y + 2, 0x4e5a24);
    });
  }
  return p;
}

export function dirtTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(21);
  bandFill(p, [0x5a4232, 0x664c3a, 0x735642, 0x80604a], 7, 1.0, 0.15);
  // two packed wheel tracks run along the tile (roads are textured in world space, any direction reads fine)
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, S), y = rng.int(0, S), l = rng.int(6, 16);
    p.hline(x, x + l, y, rng.pick([0x8a6c50, 0x84664a]));
    p.hline(x + 2, x + l - 2, y + 1, 0x6e5240);
  }
  // pebble beds
  scatterClusters(rng, 9, [4, 9], 7, (x, y) => pebble(p, rng, x, y, rng.pick([0x9a8c78, 0x8a7d6b, 0xa89b84, 0x7a6e5e]), rng.int(2, 3), 2));
  // a couple of cracks
  for (let i = 0; i < 5; i++) {
    let x = rng.int(0, S), y = rng.int(0, S);
    for (let k = 0; k < rng.int(5, 10); k++) { p.set(x, y, 0x3e2a1c); p.set(x + 1, y, 0x8a6c50); x += rng.int(0, 1); y += rng.pick([-1, 0, 1]); }
  }
  scatterClusters(rng, 3, [2, 3], 5, (x, y, c) => leaf(p, rng, x, y, LEAF_FAMILIES[(c + 1) % LEAF_FAMILIES.length][rng.int(0, 2)], 0));
  return p;
}

export function litterTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(31);
  bandFill(p, [0x3a2618, 0x46301e, 0x523a24, 0x5e4228], 9, 1.0, 0.1);
  // bundles of pine needles
  for (let i = 0; i < 16; i++) {
    const x = rng.int(0, S), y = rng.int(0, S), a = rng.range(0, Math.PI);
    for (let k = 0; k < 3; k++) {
      const aa = a + (k - 1) * 0.25;
      p.line(x, y, x + Math.cos(aa) * 6, y + Math.sin(aa) * 6, rng.pick([0x7a4a24, 0x8c5a2a, 0x6a421e]));
    }
  }
  // leaf drifts: each drift is a heap of one colour family, leaves overlapping
  scatterClusters(rng, 17, [9, 16], 13, (x, y, c) => {
    const fam = LEAF_FAMILIES[c % LEAF_FAMILIES.length];
    leaf(p, rng, x, y, fam[rng.int(0, 2)], rng.chance(0.3) ? 0 : 1);
  });
  // a few strays between the drifts
  for (let i = 0; i < 10; i++) leaf(p, rng, rng.int(0, S), rng.int(0, S), rng.pick(LEAF_COLORS), 0);
  // twigs
  for (let i = 0; i < 5; i++) {
    const x = rng.int(0, S), y = rng.int(0, S), dx = rng.int(8, 14), dy = rng.int(-3, 3);
    p.line(x, y, x + dx, y + dy, 0x24160e);
    p.line(x, y - 1, x + dx, y + dy - 1, 0x5a3a22);
  }
  return p;
}

export function rockTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(41);
  // flat-shaded stone facets (tileable voronoi), cracks along the seams, lit top-left edges
  const pts = [];
  for (let i = 0; i < 22; i++) pts.push([rng.range(0, S), rng.range(0, S), rng.int(0, 3)]);
  const tones = [0x5a5753, 0x68645e, 0x76716a, 0x847e75, 0x928b80];
  const cell = (x, y) => {
    let b = 1e9, b2 = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const d = (x - pts[i][0] - ox) ** 2 + ((y - pts[i][1] - oy) * 1.4) ** 2;
        if (d < b) { b2 = b; b = d; bi = i; } else if (d < b2) b2 = d;
      }
    }
    return [bi, Math.sqrt(b2) - Math.sqrt(b)];
  };
  const id = new Int16Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [ci, edge] = cell(x, y);
    id[y * S + x] = ci;
    const shadeN = tnoise(x / 16, y / 16, 8, 77) * 0.6;
    const t = Math.max(0, Math.min(tones.length - 1, pts[ci][2] + (shadeN > 0.42 ? 1 : 0)));
    p.set(x, y, edge < 1.6 ? 0x34312e : tones[t]);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = id[y * S + x];
    const up = id[((y - 1 + S) % S) * S + x], left = id[y * S + ((x - 1 + S) % S)];
    if ((up !== c || left !== c) && p.get(x, y) && (p.get(x, y)[0] > 0x40)) p.set(x, y, 0xa49c90);
  }
  // lichen & moss in little colonies
  scatterClusters(rng, 6, [3, 6], 6, (x, y) => {
    const c = rng.pick([0xc9922f, 0xd6a840, 0x6b7a33, 0x7f8c3a]);
    p.ellipse(x, y, rng.range(1.2, 2.6), rng.range(1, 2), c);
    p.set(Math.round(x), Math.round(y) - 1, shade(c, 0.25));
  });
  return p;
}

export function sandTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(51);
  // wind ripples: soft wavy bands across the tile
  const pal = [0xa48e6c, 0xb09a76, 0xbca680, 0xc6b08a];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const w = Math.sin((y + tnoise(x / 21.33, y / 21.33, 6, 5) * 14) * (Math.PI * 2 / 16));
    let v = tfbm(x, y, 17, 0.1) * 0.75 + (w * 0.5 + 0.5) * 0.25;
    v = 0.5 + (v - 0.5) * 1.5;
    p.set(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]);
  }
  // shells & pebbles in small groups
  scatterClusters(rng, 4, [2, 4], 6, (x, y) => pebble(p, rng, x, y, rng.pick([0x8c7c64, 0x9e8c70, 0xb0a084]), 2, 1));
  scatterClusters(rng, 3, [1, 3], 5, (x, y) => {
    x = Math.round(x); y = Math.round(y);
    p.hline(x, x + 2, y, 0xf2e8d4); p.set(x + 1, y - 1, 0xfaf2e2); p.hline(x, x + 2, y + 1, 0xc8b496);
  });
  return p;
}

export function gravelTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(61);
  bandFill(p, [0x645c52, 0x6e665b, 0x787064, 0x82796c], 19, 0.9, 0.2);
  // packed gravel: pebbles bunched together with a shadow pixel each
  scatterClusters(rng, 40, [5, 10], 6, (x, y) => pebble(p, rng, x, y, rng.pick([0x9a9084, 0x8a8174, 0xaea595, 0x7c7266]), rng.int(1, 2), rng.int(1, 2)));
  scatterClusters(rng, 3, [1, 2], 4, (x, y, c) => leaf(p, rng, x, y, LEAF_FAMILIES[(c + 2) % LEAF_FAMILIES.length][0], 0));
  return p;
}

export { mix };
