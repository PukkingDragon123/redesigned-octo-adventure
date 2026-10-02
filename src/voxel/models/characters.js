// Voxel character bodies: every villager gets a unique silhouette (short round
// Nana, tall skinny Marie, chunky Gus, huge Lou...) and a detailed outfit.
// Parts are separate voxel models so the rig can animate them (and the skeleton
// can fall apart). Faces are 2D pixel decals drawn by faces.js.
import { Vox, EMIT, tone, mixc, vhash } from '../vox.js';

export const VS = 0.05; // metres per voxel for characters

const SKIN = {
  fair: 0xf2c8a2, rosy: 0xf4c2a6, tan: 0xd8a274, brown: 0x9c6844, deep: 0x6e4630, bone: 0xf1e6cc,
};

// ---------------------------------------------------------------- character specs
// Units are voxels (0.05 m). head/torso: w,h,d. arm/leg: len (shoulder->wrist, hip->ankle), t (thickness)
export const CHARACTERS = {
  hank: {
    name: 'Hank', kind: 'skeleton', skin: SKIN.bone,
    head: { w: 12, h: 11, d: 11 }, torso: { w: 10, h: 12, d: 6 }, arm: { len: 13, t: 2 }, leg: { len: 15, t: 2 },
    hat: { type: 'toque', color: 0xc8361f, band: 0xf2e6cc, pom: 0xfff4e0 },
    scarf: { color: 0xc8361f, stripe: 0xf2e6cc },
    bag: { color: 0x8a5432, strap: 0x5a3420 },
    eyes: 'skull', voice: 'hank',
  },
  hankBuried: {
    name: 'Hank', kind: 'skeleton', skin: 0xe2d6b8, dirty: true,
    head: { w: 12, h: 11, d: 11 }, torso: { w: 10, h: 12, d: 6 }, arm: { len: 13, t: 2 }, leg: { len: 15, t: 2 },
    eyes: 'skull', voice: 'hank',
  },
  grandma: {
    name: 'Nana Marguerite', skin: SKIN.rosy, head: { w: 12, h: 11, d: 11, chub: 0.8 }, torso: { w: 12, h: 9, d: 9, belly: 1 },
    arm: { len: 8, t: 3 }, leg: { len: 4, t: 3 },
    hair: { style: 'bun', color: 0xeae6ee }, glasses: 'round',
    top: { type: 'cardigan', color: 0x8a3a5a, accent: 0xf0e0c8 }, apron: { color: 0xf6eedc, stain: 0x7a4a2a, pocket: 0xe8c86a },
    skirt: { color: 0x5a3a52, len: 6 }, shoes: 0x6a4a3a, eyes: 'bean', blush: true, voice: 'grandma',
  },
  gus: {
    name: 'Gus', skin: SKIN.tan, head: { w: 12, h: 11, d: 11 }, torso: { w: 15, h: 11, d: 10, belly: 2 },
    arm: { len: 10, t: 4 }, leg: { len: 8, t: 4 },
    hair: { style: 'short', color: 0x9a9894 }, beard: { style: 'full', color: 0xc8c4bc }, brows: 'bushy',
    hat: { type: 'trapper', color: 0x6a4a2e, fur: 0xd8c8a8 },
    top: { type: 'plaid', color: 0x2f6e3a, accent: 0x1a3a22, suspenders: 0x8a3020 }, legs: { color: 0x5a4a32 }, shoes: 0x3a2618,
    eyes: 'tiny', voice: 'gus',
  },
  marie: {
    name: 'Marie-Claude', skin: SKIN.fair, head: { w: 10, h: 11, d: 10 }, torso: { w: 8, h: 12, d: 6 },
    arm: { len: 14, t: 2 }, leg: { len: 17, t: 3 },
    hair: { style: 'bob', color: 0xc8501e }, hat: { type: 'beret', color: 0x8a1e2a },
    top: { type: 'stripes', color: 0xf6f0e6, accent: 0x22305a }, apron: { color: 0x4a2a1e, short: true }, legs: { color: 0x22222a }, shoes: 0x6a2a20,
    scarf: { color: 0xd8361f, stripe: 0xd8361f, short: true }, eyes: 'lash', blush: true, voice: 'marie',
  },
  doug: {
    name: 'Constable Doug', skin: SKIN.fair, head: { w: 11, h: 11, d: 10 }, torso: { w: 13, h: 13, d: 7 },
    arm: { len: 13, t: 3 }, leg: { len: 16, t: 3 },
    hair: { style: 'short', color: 0x5a3a22 }, mustache: 0x5a3a22,
    hat: { type: 'campaign', color: 0x8a6a3a, band: 0x5a3a22 },
    top: { type: 'serge', color: 0xc8261e, accent: 0xf2c443, belt: 0x5a3a22 }, legs: { color: 0x1e2244, stripe: 0xf2c443 }, shoes: 0x1e1418,
    eyes: 'bean', voice: 'doug',
  },
  birdie: {
    name: 'Captain Birdie', skin: SKIN.rosy, head: { w: 12, h: 11, d: 11 }, torso: { w: 13, h: 10, d: 9, belly: 1 },
    arm: { len: 10, t: 3 }, leg: { len: 9, t: 4 },
    hair: { style: 'curly', color: 0xd8d0c4 }, hat: { type: 'sou', color: 0xf2c430 },
    top: { type: 'raincoat', color: 0xf2c430, accent: 0xc89a20 }, legs: { color: 0x2a3a52 }, shoes: 0x2a2a30, boots: true,
    pipe: true, eyes: 'tiny', blush: true, voice: 'birdie',
  },
  ingrid: {
    name: 'Dr. Ingrid', skin: SKIN.fair, head: { w: 10, h: 11, d: 10 }, torso: { w: 8, h: 13, d: 6 },
    arm: { len: 14, t: 2 }, leg: { len: 17, t: 2 },
    hair: { style: 'braid', color: 0xf0d27a }, glasses: 'square',
    top: { type: 'labcoat', color: 0xf6f6f2, accent: 0x9ab8d8 }, legs: { color: 0x3a4a6a }, shoes: 0x2a2a30, stethoscope: true,
    eyes: 'round', voice: 'ingrid',
  },
  lou: {
    name: 'Big Lou', skin: SKIN.deep, head: { w: 13, h: 12, d: 12 }, torso: { w: 18, h: 14, d: 11, belly: 2 },
    arm: { len: 14, t: 5 }, leg: { len: 13, t: 5 },
    hair: { style: 'short', color: 0x1e1418 }, beard: { style: 'full', color: 0x1e1418 },
    hat: { type: 'hardhat', color: 0xf2c430 },
    top: { type: 'hivis', color: 0xe86a1e, accent: 0xe8e0c0, under: 0x3a5a8a }, legs: { color: 0x3a3a46 }, shoes: 0x3a2618, boots: true,
    eyes: 'tiny', voice: 'lou',
  },
  agnes: {
    name: 'Agnes', skin: SKIN.fair, head: { w: 12, h: 11, d: 11 }, torso: { w: 13, h: 9, d: 10, belly: 2 },
    arm: { len: 8, t: 3 }, leg: { len: 5, t: 3 },
    hair: { style: 'curly', color: 0xc8a8d8 }, glasses: 'cateye',
    top: { type: 'cardigan', color: 0xa98ad0, accent: 0xf6e0f0 }, skirt: { color: 0x6a4a8a, len: 6, dots: 0xf6e0f0 }, shoes: 0x5a3a4a,
    eyes: 'lash', blush: true, voice: 'agnes',
  },
  pip: {
    name: 'Pip', skin: SKIN.tan, head: { w: 11, h: 10, d: 10 }, torso: { w: 9, h: 7, d: 6 },
    arm: { len: 7, t: 2 }, leg: { len: 7, t: 3 },
    hair: { style: 'short', color: 0x2a1a14 }, hat: { type: 'toque', color: 0x2a5aa8, band: 0xf6f0e6, pom: 0xd8361f },
    top: { type: 'jersey', color: 0xc8261e, accent: 0xf6f0e6 }, legs: { color: 0x2a2a3a }, shoes: 0xf6f0e6,
    cape: { color: 0x2a1a3a, inner: 0xc8261e }, eyes: 'bean', blush: true, voice: 'pip',
  },
  pop: {
    name: 'Pop', skin: SKIN.fair, head: { w: 11, h: 10, d: 10 }, torso: { w: 9, h: 7, d: 6 },
    arm: { len: 7, t: 2 }, leg: { len: 7, t: 3 },
    hair: { style: 'short', color: 0xe8b24a }, hat: { type: 'toque', color: 0xf2c430, band: 0x2a5aa8, pom: 0x2a5aa8 },
    top: { type: 'jersey', color: 0x2a5aa8, accent: 0xf6f0e6 }, legs: { color: 0x2a2a3a }, shoes: 0xf6f0e6,
    eyes: 'bean', blush: true, voice: 'pip',
  },
  ollie: {
    name: 'Old Ollie', skin: SKIN.rosy, head: { w: 11, h: 11, d: 10 }, torso: { w: 10, h: 12, d: 7 },
    arm: { len: 12, t: 3 }, leg: { len: 13, t: 3 },
    hair: { style: 'short', color: 0xf0ece4 }, beard: { style: 'full', color: 0xf6f2ea },
    hat: { type: 'captain', color: 0x1e2a4a, band: 0xf6f0e6 },
    top: { type: 'coat', color: 0x1e2a4a, accent: 0xf2c443 }, legs: { color: 0x2a2a3a }, shoes: 0x1e1418,
    eyes: 'tiny', voice: 'ollie',
  },
  mo: {
    name: 'Mo the Grocer', skin: SKIN.brown, head: { w: 12, h: 11, d: 11 }, torso: { w: 15, h: 11, d: 10, belly: 3 },
    arm: { len: 10, t: 4 }, leg: { len: 9, t: 4 },
    hair: { style: 'short', color: 0x2a1a14 }, mustache: 0x1e1418, hat: { type: 'flatcap', color: 0x6a5a4a },
    top: { type: 'shirt', color: 0xf0e6d0, accent: 0xa8382a }, apron: { color: 0x2f6e4a, pocket: 0xf2c443 }, legs: { color: 0x4a3a2a }, shoes: 0x2a1a14,
    eyes: 'bean', blush: true, voice: 'gus',
  },
  reaper: {
    name: 'The Grim Reaper', kind: 'reaper', skin: SKIN.bone, head: { w: 12, h: 11, d: 11 }, torso: { w: 12, h: 13, d: 9 },
    arm: { len: 16, t: 3 }, leg: { len: 16, t: 3 },
    top: { type: 'robe', color: 0x2e2a3c, accent: 0x4e4864 }, hood: 0x2a2638,
    cape: { color: 0x2e2a3c, inner: 0x4e2a5a, long: true }, eyes: 'skull', voice: 'reaper',
  },
};

// ---------------------------------------------------------------- helpers
const dark = (c, k = 0.22) => tone(c, -k);
const lite = (c, k = 0.18) => tone(c, k);

function shadeBox(v, x0, y0, z0, x1, y1, z1, c) {
  // a box with darker bottom rows and a lighter top row for chunky readability
  v.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => (y === y1 ? lite(c, 0.08) : y === y0 ? dark(c, 0.1) : c));
}

// rounded box: corners trimmed
function roundBox(v, x0, y0, z0, x1, y1, z1, col, r = 1) {
  v.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const ex = x === x0 || x === x1, ey = y === y0 || y === y1, ez = z === z0 || z === z1;
    if (r >= 1 && ((ex && ez) || (ex && ey && r > 1) || (ez && ey && r > 1))) return 0;
    return typeof col === 'function' ? col(x, y, z) : col;
  });
}

// ---------------------------------------------------------------- heads
// Returns { vox, origin, face: { x0, y0, x1, y1, z } } where face is the decal rect in voxel units (front plane)
export function buildHead(spec) {
  const { w, h, d } = spec.head;
  const pad = 4; // room for hair & hats
  const W = w + pad * 2, H = h + pad * 2 + 6, D = d + pad * 2;
  const v = new Vox(W, H, D);
  const x0 = pad, y0 = 0, z0 = pad, x1 = pad + w - 1, y1 = h - 1, z1 = pad + d - 1;
  const skin = spec.skin;
  if (spec.kind === 'skeleton' || spec.kind === 'reaper') return skullHead(spec, v, x0, y0, z0, x1, y1, z1);
  // head block: a chunky squircle so corners read soft and round
  const hcx = (x0 + x1) / 2, hcy = (y0 + y1) / 2, hcz = (z0 + z1) / 2;
  const rx = w / 2, ry = h / 2, rz = d / 2;
  const chub = spec.head.chub ?? 0; // wider cheeks at the bottom
  v.fill(x0 - 1, y0, z0, x1 + 1, y1, z1, (x, y, z) => {
    const ty = (y - hcy) / ry;
    const rxx = rx + (ty < 0 ? -ty * chub : 0);
    const ax = Math.abs((x - hcx) / (rxx + 0.15)), ay = Math.abs((y - hcy) / (ry + 0.15)), az = Math.abs((z - hcz) / (rz + 0.15));
    if (ax ** 3.2 + ay ** 3.2 + az ** 3.2 > 1) return 0;
    return y < 2 ? dark(skin, 0.06) : y > y1 - 1 ? lite(skin, 0.03) : skin;
  });
  // ears
  v.fill(x0 - 1, 3, z0 + (d >> 1) - 1, x0 - 1, 5, z0 + (d >> 1), dark(skin, 0.08));
  v.fill(x1 + 1, 3, z0 + (d >> 1) - 1, x1 + 1, 5, z0 + (d >> 1), dark(skin, 0.08));
  // nose
  v.set(x0 + (w >> 1), 4, z1 + 1, dark(skin, 0.06));
  if (w % 2 === 0) v.set(x0 + (w >> 1) - 1, 4, z1 + 1, dark(skin, 0.06));
  hair(spec, v, x0, y0, z0, x1, y1, z1);
  facialHair(spec, v, x0, y0, z0, x1, y1, z1);
  hat(spec, v, x0, y0, z0, x1, y1, z1);
  return { vox: v, origin: [x0 + w / 2, 0, z0 + d / 2], face: { x0, y0: 1, x1: x1 + 1, y1: y1, z: z1 + 1 }, size: VS };
}

function skullHead(spec, v, x0, y0, z0, x1, y1, z1) {
  const bone = spec.skin;
  const w = x1 - x0 + 1;
  const cx = x0 + w / 2 - 0.5;
  const dirt = spec.dirty;
  const boneCol = (x, y, z) => {
    let c = y > y1 - 2 ? lite(bone, 0.06) : y < 3 ? dark(bone, 0.08) : bone;
    if (dirt && vhash(x, y, z, 3) < 0.12) c = mixc(c, 0x6a4a2a, 0.6);
    return c;
  };
  // cranium: a big round dome sitting on a narrower cheek block
  v.ellipsoid(cx, y0 + 6.6, z0 + 5, w / 2 + 0.4, 5.6, 5.8, boneCol);
  v.fill(x0 + 1, 2, z0 + 1, x1 - 1, 6, z1, boneCol);
  // flat face front
  v.fill(x0 + 1, 2, z1 - 1, x1 - 1, 9, z1, boneCol);
  // eye sockets (deep, dark)
  const sock = 0x2a1c22;
  const sockets = [];
  for (const sx of [cx - 2.6, cx + 2.6]) {
    const a = Math.round(sx - 1.5), b = Math.round(sx + 1.5);
    for (let y = 4; y <= 7; y++) for (let x = a; x <= b; x++) {
      const edge = (y === 4 || y === 7) && (x === a || x === b);
      if (edge) continue;
      v.set(x, y, z1, sock);
      v.set(x, y, z1 - 1, sock);
    }
    sockets.push({ x: (a + b + 1) / 2, y: 6 });
  }
  // nose hole
  v.set(Math.round(cx), 3, z1, sock);
  v.set(Math.round(cx) + 1, 3, z1, sock);
  // upper teeth row
  for (let x = x0 + 2; x <= x1 - 2; x++) v.set(x, 1, z1, x % 2 ? 0xfff6e0 : 0xd8ccb0);
  v.fill(x0 + 2, 1, z0 + 2, x1 - 2, 1, z1 - 1, dark(bone, 0.1));
  // cracks / patina
  v.set(x0 + 3, 9, z1 - 1, dark(bone, 0.25));
  v.set(x0 + 4, 10, z1 - 2, dark(bone, 0.25));
  if (spec.kind === 'reaper') hood(spec, v, x0, y0, z0, x1, y1, z1);
  else hat(spec, v, x0, y0, z0, x1, y1, z1);
  return { vox: v, origin: [x0 + w / 2, 0, z0 + (z1 - z0 + 1) / 2], face: { x0: x0 + 1, y0: 2, x1: x1, y1: 10, z: z1 + 1, sockets }, skull: true, size: VS };
}

// the skeleton's jaw (separate so it can chatter)
export function buildJaw(spec) {
  const { w, d } = spec.head;
  const v = new Vox(w, 3, d);
  const bone = spec.skin;
  v.fill(2, 0, 2, w - 3, 1, d - 1, (x, y, z) => (y === 0 ? dark(bone, 0.1) : bone));
  v.fill(1, 1, 3, w - 2, 1, d - 2, bone);
  for (let x = 2; x <= w - 3; x++) v.set(x, 2, d - 1, x % 2 ? 0xfff6e0 : 0xd8ccb0);
  // pivot at the back hinge
  return { vox: v, origin: [w / 2, 2, 3], size: VS };
}

function hood(spec, v, x0, y0, z0, x1, y1, z1) {
  const c = spec.hood;
  const cx = (x0 + x1) / 2;
  // a deep pointed hood around the skull, open at the face
  for (let y = -1; y <= y1 + 4; y++) {
    const r = 7.5 - Math.max(0, y - y1) * 1.2;
    for (let z = z0 - 2; z <= z1 + 1; z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dz = z - (z0 + z1) / 2;
      const inside = Math.abs(dx) < r && Math.abs(dz) < 7;
      if (!inside) continue;
      const shell = Math.abs(dx) > r - 1.6 || dz < -5 || y > y1;
      const front = z >= z1 - 1 && Math.abs(dx) < r - 1.6 && y < y1;
      if (shell && !front) v.set(x, y, z, (x + y) % 5 === 0 ? tone(c, 0.08) : c);
    }
  }
  // brim of the hood over the forehead
  v.fill(Math.round(cx - 6), y1 - 1, z1 - 1, Math.round(cx + 6), y1 + 1, z1 + 1, tone(c, 0.06));
}

function hair(spec, v, x0, y0, z0, x1, y1, z1) {
  const H = spec.hair;
  if (!H) return;
  const c = H.color;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const strand = (x, y, z) => ((x + z * 2 + y) % 4 === 0 ? dark(c, 0.12) : (x + y) % 5 === 0 ? lite(c, 0.1) : c);
  const cap = (depthTop = 2) => {
    v.fill(x0 - 1, y1 - 1, z0 - 1, x1 + 1, y1 + depthTop - 1, z1 - 1, strand);
    v.fill(x0 - 1, y1 - 3, z0 - 1, x1 + 1, y1 - 1, z0 + 2, strand); // back
  };
  switch (H.style) {
    case 'short':
      cap(1);
      v.fill(x0 - 1, y1 - 4, z0 - 1, x1 + 1, y1 - 1, z0 + Math.floor(d * 0.45), strand);
      v.fill(x0, y1, z1 - 1, x1, y1, z1, strand); // fringe line
      break;
    case 'bob':
      cap(2);
      v.fill(x0 - 1, 1, z0 - 1, x1 + 1, y1 + 1, z0 + Math.floor(d * 0.55), strand);
      v.fill(x0 - 1, 2, z0, x0 - 1, y1, z1 - 2, strand);
      v.fill(x1 + 1, 2, z0, x1 + 1, y1, z1 - 2, strand);
      // swoopy fringe
      for (let x = x0; x <= x1; x++) for (let y = y1 - 2 + Math.round(((x - x0) / w) * 2); y <= y1 + 1; y++) v.set(x, y, z1 + 1, strand(x, y, z1));
      break;
    case 'bun':
      cap(2);
      v.fill(x0 - 1, 3, z0 - 1, x1 + 1, y1, z0 + 2, strand);
      v.fill(x0 - 1, 4, z0, x0 - 1, y1, z1 - 3, strand);
      v.fill(x1 + 1, 4, z0, x1 + 1, y1, z1 - 3, strand);
      v.ellipsoid(cx, y1 + 3.5, cz - 1, 3.2, 2.6, 3.2, strand);
      v.fill(Math.round(cx) - 1, y1 + 2, Math.round(cz) + 2, Math.round(cx), y1 + 2, Math.round(cz) + 2, 0x8a3a5a); // hair pin
      // little fringe waves
      for (let x = x0; x <= x1; x += 2) v.set(x, y1, z1 + 1, strand(x, y1, z1));
      break;
    case 'braid':
      cap(2);
      v.fill(x0 - 1, 3, z0 - 1, x1 + 1, y1, z0 + 2, strand);
      v.fill(x0 - 1, 4, z0, x0 - 1, y1, z1 - 3, strand);
      v.fill(x1 + 1, 4, z0, x1 + 1, y1, z1 - 3, strand);
      for (let y = -6; y < 4; y++) v.fill(Math.round(cx) - 1, y + pad0(), z0 - 2, Math.round(cx), y + pad0(), z0 - 2, (y & 1) ? dark(c, 0.15) : c);
      break;
    case 'curly':
      for (let k = 0; k < 26; k++) {
        const a = vhash(k, 1, 2, 9) * Math.PI * 2, b = vhash(k, 3, 4, 9) * Math.PI * 0.55;
        const r = w / 2 + 0.6;
        v.ellipsoid(cx + Math.cos(a) * Math.cos(b) * r, y1 - 1 + Math.sin(b) * 4, cz - 1 + Math.sin(a) * Math.cos(b) * (d / 2), 1.8, 1.6, 1.8, strand);
      }
      v.clear(x0, 0, z1 - 1, x1, y1 - 2, z1 + 2); // keep the face clear
      break;
    case 'messy':
      cap(2);
      for (let x = x0 - 1; x <= x1 + 1; x += 2) v.set(x, y1 + 2, z0 + ((x * 3) % d), strand(x, y1, 0));
      break;
    default:
      break;
  }
  function pad0() {
    return y1 - 3;
  }
}

function facialHair(spec, v, x0, y0, z0, x1, y1, z1) {
  const w = x1 - x0 + 1;
  if (spec.beard) {
    const c = spec.beard.color;
    const col = (x, y, z) => ((x + y) % 3 === 0 ? lite(c, 0.1) : (x * 2 + y) % 5 === 0 ? dark(c, 0.12) : c);
    // big fluffy beard hugging the lower face, bulging forward and down
    v.fill(x0 - 1, -2, z1 - 4, x1 + 1, 2, z1 + 1, col);
    v.fill(x0, -3, z1 - 3, x1, -3, z1, col);
    v.fill(x0 + 1, -4, z1 - 2, x1 - 1, -4, z1, col);
    v.fill(x0 - 1, 2, z1 - 4, x0, 5, z1 - 1, col); // sideburns
    v.fill(x1, 2, z1 - 4, x1 + 1, 5, z1 - 1, col);
    v.clear(x0 + 3, 1, z1 + 1, x1 - 3, 2, z1 + 1); // mouth gap
  }
  if (spec.mustache) {
    const c = spec.mustache;
    const cx = Math.round((x0 + x1) / 2);
    v.fill(cx - 3, 3, z1 + 1, cx + 2 + (w % 2 ? 1 : 0), 3, z1 + 1, c);
    v.set(cx - 4, 2, z1 + 1, c);
    v.set(cx + 3 + (w % 2 ? 1 : 0), 2, z1 + 1, c);
  }
  if (spec.pipe) {
    v.fill(x1 - 2, 1, z1 + 1, x1 + 1, 1, z1 + 2, 0x5a3420);
    v.fill(x1 + 1, 1, z1 + 2, x1 + 2, 3, z1 + 3, 0x6a4028);
  }
}

function hat(spec, v, x0, y0, z0, x1, y1, z1) {
  const H = spec.hat;
  if (!H) return;
  const c = H.color;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0 + 1;
  switch (H.type) {
    case 'toque': {
      const knit = (x, y, z) => ((x + y) % 2 === 0 ? c : dark(c, 0.1));
      v.fill(x0 - 1, y1 - 2, z0 - 1, x1 + 1, y1, z1 + 1, (x, y, z) => (y === y1 - 2 ? H.band : (x % 2 ? H.band : tone(H.band, -0.1))));
      v.ellipsoid(cx, y1 + 1, cz, w / 2 + 0.6, 4, (z1 - z0) / 2 + 1, (x, y, z) => (y > y1 ? knit(x, y, z) : 0));
      v.ellipsoid(cx + 0.5, y1 + 6, cz - 0.5, 2.2, 2.2, 2.2, (x, y, z) => ((x + y + z) % 2 ? H.pom : tone(H.pom, -0.08)));
      break;
    }
    case 'trapper': {
      v.ellipsoid(cx, y1 + 1, cz, w / 2 + 1, 3.6, (z1 - z0) / 2 + 1.5, (x, y, z) => (y >= y1 - 1 ? ((x + z) % 3 ? c : dark(c, 0.1)) : 0));
      v.fill(x0 - 1, y1 - 2, z1 - 1, x1 + 1, y1 - 1, z1 + 1, H.fur); // fur brim
      v.fill(x0 - 2, 0, z0 + 2, x0 - 1, y1 - 1, z1 - 2, (x, y, z) => (y < 2 ? H.fur : c)); // ear flaps
      v.fill(x1 + 1, 0, z0 + 2, x1 + 2, y1 - 1, z1 - 2, (x, y, z) => (y < 2 ? H.fur : c));
      break;
    }
    case 'beret':
      v.ellipsoid(cx + 1, y1 + 1, cz, w / 2 + 1.6, 1.8, (z1 - z0) / 2 + 1.2, (x, y, z) => (y >= y1 ? ((x + z) % 4 === 0 ? dark(c, 0.1) : c) : 0));
      v.set(Math.round(cx) + 1, y1 + 3, Math.round(cz), dark(c, 0.2));
      break;
    case 'campaign':
      v.fill(x0 - 4, y1, z0 - 4, x1 + 4, y1, z1 + 4, (x, y, z) => (Math.hypot(x - cx, z - cz) < w / 2 + 4.5 ? c : 0)); // flat brim
      v.fill(x0, y1 + 1, z0, x1, y1 + 1, z1, H.band);
      v.fill(x0, y1 + 2, z0, x1, y1 + 4, z1, (x, y, z) => (y === y1 + 4 && (Math.abs(x - cx) < 1 || Math.abs(z - cz) < 1) ? dark(c, 0.15) : c)); // pinched crown
      break;
    case 'sou':
      v.ellipsoid(cx, y1, cz, w / 2 + 1, 4, (z1 - z0) / 2 + 1, (x, y, z) => (y >= y1 - 1 ? c : 0));
      v.fill(x0 - 2, y1 - 2, z0 - 3, x1 + 2, y1 - 1, z0 + 1, dark(c, 0.06)); // long back brim
      v.fill(x0 - 1, y1 - 1, z1, x1 + 1, y1 - 1, z1 + 2, c);
      break;
    case 'hardhat':
      v.ellipsoid(cx, y1, cz, w / 2 + 1, 4.5, (z1 - z0) / 2 + 1, (x, y, z) => (y >= y1 - 1 ? (Math.abs(x - cx) < 1 ? lite(c, 0.15) : c) : 0));
      v.fill(x0 - 1, y1 - 1, z1, x1 + 1, y1 - 1, z1 + 3, dark(c, 0.06));
      break;
    case 'captain':
      v.fill(x0 - 1, y1, z0 - 1, x1 + 1, y1 + 3, z1 + 1, (x, y, z) => (y === y1 ? H.band : y === y1 + 3 ? lite(c, 0.1) : c));
      v.fill(x0, y1 - 1, z1 + 1, x1, y1, z1 + 3, 0x1e1418); // visor
      v.fill(Math.round(cx) - 1, y1 + 1, z1 + 2, Math.round(cx), y1 + 2, z1 + 2, 0xf2c443); // badge
      break;
    case 'flatcap':
      v.fill(x0 - 1, y1, z0 - 1, x1 + 1, y1 + 1, z1, (x, y, z) => ((x + z) % 3 ? c : dark(c, 0.12)));
      v.fill(x0, y1, z1, x1, y1, z1 + 2, dark(c, 0.08));
      break;
    case 'witch':
      v.fill(x0 - 4, y1, z0 - 4, x1 + 4, y1, z1 + 4, (x, y, z) => (Math.hypot(x - cx, z - cz) < w / 2 + 4 ? c : 0));
      for (let k = 0; k < 10; k++) v.ellipsoid(cx - k * 0.25, y1 + 1 + k, cz - k * 0.2, w / 2 - k * 0.5, 0.6, w / 2 - k * 0.5, c);
      v.fill(x0, y1 + 1, z0, x1, y1 + 1, z1, 0x8a3ac8);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- torsos
export function buildTorso(spec) {
  const { w, h, d, belly = 0 } = spec.torso;
  if (spec.kind === 'skeleton') return skeletonTorso(spec);
  if (spec.kind === 'reaper') return robeTorso(spec);
  const W = w + 4, H = h + 2, D = d + belly + 6;
  const v = new Vox(W, H, D);
  const x0 = 2, x1 = x0 + w - 1, z0 = 2, z1 = z0 + d - 1;
  const T = spec.top || { type: 'shirt', color: 0x888888 };
  const legsCol = spec.legs?.color ?? spec.skirt?.color ?? 0x3a3a46;
  const cx = (x0 + x1) / 2;
  const topCol = (x, y, z) => topPattern(T, x - x0, y, z, w, h, x, cx, z1);
  // rounded body: belly bulges at the front
  for (let y = 0; y < h; y++) {
    const isHips = y < 2;
    const shoulder = y >= h - 2;
    const taper = 1 - 0.14 * Math.pow(y / Math.max(1, h - 1), 2);
    for (let z = z0 - 0; z <= z1 + belly; z++) {
      for (let x = x0; x <= x1; x++) {
        const bz = z - z1;
        {
          const ax = Math.abs((x - cx) / ((w / 2) * taper + 0.2)), az = Math.abs((Math.min(z, z1) - (z0 + z1) / 2) / (d / 2 + 0.2));
          if (ax ** 3 + az ** 3 > 1) continue;
        }
        if (bz > 0) {
          // belly: an oval bump in the middle rows
          const yy = (y - h * 0.42) / (h * 0.42), xx = (x - cx) / (w * 0.5);
          if (xx * xx + yy * yy + (bz / (belly + 0.5)) ** 2 > 1) continue;
        }
        if (shoulder && y === h - 1 && (Math.abs(x - cx) > w / 2 - 1.6)) continue;
        v.set(x, y, z, isHips && !spec.skirt ? (y === 0 ? dark(legsCol, 0.1) : legsCol) : topCol(x, y, z));
      }
    }
  }
  // collar / neck
  v.fill(Math.round(cx) - 2, h, z0 + 1, Math.round(cx) + 1 + (w % 2 ? 1 : 0), h, z1 - 1, T.type === 'raincoat' || T.type === 'coat' ? dark(T.color, 0.1) : spec.skin);
  if (T.type === 'serge' || T.type === 'coat' || T.type === 'labcoat' || T.type === 'cardigan') {
    v.fill(Math.round(cx) - 2, h - 1, z1 + 1, Math.round(cx) + 1, h - 1, z1 + 1, dark(T.color, 0.12)); // lapels
  }
  if (T.belt) v.fill(x0, 2, z0, x1, 2, z1 + belly, (x, y, z) => (Math.abs(x - cx) < 1 && z >= z1 ? 0xf2c443 : T.belt));
  if (T.suspenders) for (const sx of [x0 + 2, x1 - 2]) v.fill(sx, 2, z1 + belly, sx, h - 1, z1 + belly, T.suspenders), v.fill(sx, 2, z0, sx, h - 1, z0, T.suspenders);
  if (spec.apron) {
    const A = spec.apron;
    const top = A.short ? 3 : h - 2;
    for (let y = 0; y <= top; y++) for (let x = x0 + 1; x <= x1 - 1; x++) {
      const zz = surfaceZ(v, x, y, z1 + belly + 2);
      if (zz < 0) continue;
      let c = A.color;
      if (A.stain && x === x0 + 3 && y === 4) c = A.stain;
      if (A.pocket && y === 2 && x > cx - 2 && x < cx + 2) c = A.pocket;
      v.set(x, y, zz + 1, c);
    }
    // strings at the back
    v.fill(x0, 3, z0 - 1, x1, 3, z0 - 1, A.color);
  }
  if (spec.stethoscope) {
    v.fill(Math.round(cx) - 2, h - 1, z1 + 1, Math.round(cx) - 2, h - 5, z1 + 1, 0x3a3a46);
    v.fill(Math.round(cx) + 2, h - 1, z1 + 1, Math.round(cx) + 2, h - 5, z1 + 1, 0x3a3a46);
    v.set(Math.round(cx), h - 6, z1 + 1, 0xc8c8d0);
  }
  if (spec.bag) {
    // messenger bag strap across the chest, bag on the hip
    for (let y = 2; y < h; y++) {
      const x = Math.round(x0 + ((y - 2) / (h - 2)) * (w - 1));
      v.set(x, y, z1 + 1, spec.bag.strap);
    }
  }
  return { vox: v, origin: [x0 + w / 2, 0, z0 + d / 2], size: VS, frontZ: z1 + belly };
}

function surfaceZ(v, x, y, zmax) {
  for (let z = zmax; z >= 0; z--) if (v.get(x, y, z)) return z;
  return -1;
}

function topPattern(T, lx, y, z, w, h, x, cx, z1) {
  const c = T.color, a = T.accent ?? dark(c, 0.2);
  switch (T.type) {
    case 'plaid': {
      const gx = lx % 4 < 2, gy = y % 4 < 2;
      return gx && gy ? dark(c, 0.25) : gx || gy ? c : lite(c, 0.12);
    }
    case 'stripes':
      return y % 3 === 0 ? a : c;
    case 'nordic':
      return y === h - 3 || y === 3 ? a : (y === h - 4 || y === 4) && lx % 2 === 0 ? a : c;
    case 'serge':
      return Math.abs(x - cx) < 0.6 && y > 2 && y % 3 === 0 ? 0xf2c443 : c;
    case 'raincoat':
      return Math.abs(x - cx) < 0.6 && y > 1 && y % 3 === 1 ? a : y === 0 ? dark(c, 0.12) : c;
    case 'coat':
      return (Math.abs(x - cx + 2) < 0.6 || Math.abs(x - cx - 2) < 0.6) && y % 3 === 1 && y > 1 ? a : c;
    case 'labcoat':
      return Math.abs(x - cx) < 0.6 ? dark(c, 0.08) : y === 5 && lx > w - 4 ? a : c;
    case 'cardigan':
      return Math.abs(x - cx) < 0.6 ? (y % 3 === 1 ? a : dark(c, 0.15)) : (y + lx) % 4 === 0 ? dark(c, 0.06) : c;
    case 'hivis':
      return y === 3 || y === h - 4 ? a : Math.abs(x - cx) < 1.6 ? T.under ?? c : c;
    case 'jersey':
      return y === h - 3 ? a : y === 3 ? a : c;
    default:
      return y === h - 1 ? lite(c, 0.06) : c;
  }
}

function skeletonTorso(spec) {
  const { w, h } = spec.torso;
  const W = w + 4, H = h + 2, D = 10;
  const v = new Vox(W, H, D);
  const bone = spec.skin;
  const cx = W / 2 - 0.5, zc = 4;
  const B = (x, y, z) => {
    let c = y % 2 ? bone : tone(bone, -0.06);
    if (spec.dirty && vhash(x, y, z, 5) < 0.15) c = mixc(c, 0x6a4a2a, 0.55);
    return c;
  };
  // pelvis (wide bowl)
  v.fill(Math.round(cx - 4), 0, zc - 1, Math.round(cx + 4), 2, zc + 2, B);
  v.clear(Math.round(cx - 1), 0, zc + 2, Math.round(cx + 1), 1, zc + 2);
  // spine
  v.fill(Math.round(cx), 2, zc - 1, Math.round(cx) + 1, h - 1, zc, (x, y, z) => (y % 2 ? bone : dark(bone, 0.12)));
  // ribcage: curved rib hoops
  for (let r = 0; r < 4; r++) {
    const y = h - 3 - r * 2;
    const half = 4.6 - r * 0.45;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half + 1); x++) {
      v.set(x, y, zc - 1, B(x, y, 0));
      v.set(x, y, zc + 3, B(x, y, 1));
    }
    for (let z = zc - 1; z <= zc + 3; z++) {
      v.set(Math.round(cx - half), y, z, B(0, y, z));
      v.set(Math.round(cx + half + 1), y, z, B(1, y, z));
    }
    v.clear(Math.round(cx), y, zc + 3, Math.round(cx) + 1, y, zc + 3); // sternum gap
  }
  // sternum
  v.fill(Math.round(cx), h - 9, zc + 3, Math.round(cx) + 1, h - 3, zc + 3, lite(bone, 0.05));
  // collarbones & shoulder knobs
  v.fill(Math.round(cx - 5), h - 1, zc, Math.round(cx + 6), h - 1, zc + 1, B);
  v.fill(Math.round(cx - 6), h - 2, zc - 1, Math.round(cx - 5), h, zc + 2, B);
  v.fill(Math.round(cx + 6), h - 2, zc - 1, Math.round(cx + 7), h, zc + 2, B);
  // neck vertebrae
  v.fill(Math.round(cx), h, zc, Math.round(cx) + 1, h + 1, zc + 1, bone);
  if (spec.bag) {
    for (let y = 1; y < h; y++) {
      const x = Math.round(cx - 5 + ((y - 1) / (h - 1)) * 11);
      v.set(x, y, zc + 4, spec.bag.strap);
      v.set(x, y, zc - 2, spec.bag.strap);
    }
    // the cocoa satchel on the hip
    v.fill(Math.round(cx - 6), 0, zc - 2, Math.round(cx - 3), 4, zc + 4, (x, y, z) => (y === 4 ? dark(spec.bag.color, 0.15) : z === zc + 4 && y === 2 && x === Math.round(cx - 5) ? 0xf2c443 : spec.bag.color));
  }
  return { vox: v, origin: [cx + 0.5, 0, zc + 1], size: VS, frontZ: zc + 3 };
}

// leg height in voxels, from the ground to the hip joint (thigh + shin + foot)
export function hipVoxels(spec) {
  const L = spec.leg.len;
  return Math.max(2, Math.round(L * 0.48)) + Math.max(2, Math.round(L * 0.52)) + 3;
}

function robeTorso(spec) {
  const { w, h, d } = spec.torso;
  const hip = hipVoxels(spec);
  const HH = h + hip;
  const W = w + 10, D = d + 10;
  const v = new Vox(W, HH + 2, D);
  const c = spec.top.color;
  const cx = W / 2 - 0.5, cz = D / 2 - 0.5;
  // a long flared robe from the shoulders to the ground (legs hidden inside)
  for (let y = 0; y < HH; y++) {
    const t = 1 - y / (HH - 1);
    const fl = Math.pow(t, 1.4);
    const rx = w / 2 + fl * 4.2, rz = d / 2 + fl * 3;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx, dz = (z - cz) / rz;
      if (dx * dx + dz * dz > 1) continue;
      // ragged hem
      if (y === 0 && vhash(x, 0, z, 4) < 0.35) continue;
      const fold = (x + Math.round(y * 0.25)) % 4 === 0;
      v.set(x, y, z, y < 2 ? tone(c, -0.2) : fold ? tone(c, -0.12) : (x + z) % 7 === 0 ? tone(c, 0.05) : c);
    }
  }
  // rope belt with a dangling knot
  v.paint((x, y, z, col) => (y === hip + 1 ? ((x + z) % 2 ? 0x8a7a5a : 0x6a5a4a) : undefined));
  v.fill(Math.round(cx) + 2, hip - 4, Math.round(cz + d / 2 + 0.5), Math.round(cx) + 2, hip, Math.round(cz + d / 2 + 0.5), 0x7a6a4e);
  // collar / hood base around the neck
  v.fill(Math.round(cx - w / 2 + 1), HH - 1, Math.round(cz - d / 2), Math.round(cx + w / 2 - 1), HH, Math.round(cz + d / 2), spec.hood ?? tone(c, -0.08));
  v.clear(Math.round(cx) - 2, HH - 1, Math.round(cz) - 1, Math.round(cx) + 2, HH, Math.round(cz) + 2);
  return { vox: v, origin: [cx + 0.5, hip, cz + 0.5], size: VS, frontZ: cz + d / 2 };
}

// ---------------------------------------------------------------- limbs
// upper arm / forearm / thigh / shin are built as one call; pivot at the top centre
export function buildLimb(spec, part) {
  const isArm = part === 'upperArm' || part === 'forearm';
  const L = isArm ? spec.arm : spec.leg;
  const t = L.t;
  const upper = part === 'upperArm' || part === 'thigh';
  const len = Math.max(2, Math.round(upper ? L.len * 0.48 : L.len * 0.52));
  const skel = spec.kind === 'skeleton' || spec.kind === 'reaper';
  const extra = part === 'shin' ? 6 : part === 'forearm' ? 4 : 0; // feet / hands
  const W = t + 6, H = len + extra + 2, D = t + 8;
  const v = new Vox(W, H, D);
  const x0 = 3, x1 = x0 + t - 1, z0 = 3, z1 = z0 + t - 1;
  const top = H - 1;
  const bone = spec.skin;
  let sleeve, cuff;
  if (isArm) {
    const T = spec.top || {};
    sleeve = T.type === 'robe' ? T.color : T.color ?? spec.skin;
    if (T.type === 'hivis') sleeve = T.under ?? sleeve;
    if (T.type === 'stripes') sleeve = (y) => ((top - y) % 3 === 0 ? T.accent : T.color);
    cuff = T.type === 'labcoat' ? dark(T.color, 0.06) : null;
  } else {
    sleeve = spec.legs?.color ?? spec.skirt?.color ?? 0x3a3a46;
  }
  const sCol = (y) => (typeof sleeve === 'function' ? sleeve(y) : sleeve);
  if (skel && !(spec.kind === 'reaper' && isArm)) {
    // thin bone with knobbly joint ends
    const cx = x0 + (t - 1) / 2;
    const B = (x, y, z) => (spec.dirty && vhash(x, y, z, 8) < 0.14 ? mixc(bone, 0x6a4a2a, 0.5) : bone);
    v.fill(Math.floor(cx), top - len + 1, z0, Math.ceil(cx), top, z1, B);
    v.fill(x0 - 1, top - 1, z0 - 1, x1 + 1, top, z1 + 1, tone(bone, -0.04)); // joint knob
    v.fill(x0 - 1, top - len + 1, z0 - 1, x1 + 1, top - len + 2, z1 + 1, tone(bone, 0.04));
  } else {
    for (let y = top - len + 1; y <= top; y++) {
      const c = cuff && y === top - len + 1 ? cuff : sCol(y);
      v.fill(x0, y, z0, x1, y, z1, (x, yy, z) => ((x === x0 || x === x1) && (z === z0 || z === z1) && t > 2 ? dark(c, 0.06) : c));
    }
    // legs stripe (Mountie trousers)
    if (!isArm && spec.legs?.stripe) v.fill(x0, top - len + 1, z0 + (t >> 1), x0, top, z0 + (t >> 1), spec.legs.stripe);
  }
  const yb = top - len + 1;
  if (part === 'forearm') {
    // a chunky mitten hand
    const hand = skel ? bone : spec.skin;
    const hy0 = yb - 3;
    v.fill(x0 - (t < 3 ? 1 : 0), hy0, z0 - 0, x1 + (t < 3 ? 1 : 0), yb - 1, z1 + 1, (x, y, z) => (y === hy0 ? dark(hand, 0.08) : hand));
    v.set(x0 - 1 - (t < 3 ? 1 : 0), yb - 2, z1, hand); // thumb
    if (skel) v.clear(x0, hy0, z1 + 1, x1, hy0, z1 + 1);
  }
  if (part === 'shin') {
    // boot / foot pointing forward (+z)
    const sh = spec.shoes ?? (skel ? bone : 0x3a2618);
    const fy0 = yb - 3;
    const fz1 = z1 + (skel ? 2 : 3);
    v.fill(x0 - (t < 3 ? 1 : 0), fy0, z0 - 1, x1 + (t < 3 ? 1 : 0), yb - 1, fz1, (x, y, z) => (y === fy0 ? dark(sh, 0.25) : z === fz1 && y === yb - 1 ? lite(sh, 0.1) : sh));
    if (spec.boots && !skel) v.fill(x0, yb, z0, x1, yb + 2, z1, sh);
    if (skel) {
      v.clear(x0 - 1, yb - 1, z0 - 1, x1 + 1, yb - 1, z0); // toe bones look
      for (let x = x0 - 1; x <= x1 + 1; x += 2) v.set(x, fy0, fz1 + 1, bone);
    }
  }
  return { vox: v, origin: [x0 + t / 2, top + 1, z0 + t / 2], size: VS, len: len * VS };
}

// a skirt that hangs from the torso bottom, covering short legs
export function buildSkirt(spec) {
  const S = spec.skirt;
  const { w, d, belly = 0 } = spec.torso;
  const len = S.len;
  const W = w + 6, H = len + 1, D = d + belly + 6;
  const v = new Vox(W, H, D);
  const cx = W / 2 - 0.5, cz = (D - belly) / 2 - 0.5;
  for (let y = 0; y < len; y++) {
    const flare = 1 + ((len - y) / len) * 1.6;
    const rx = w / 2 + flare - 0.6, rz = d / 2 + flare - 0.6 + belly * 0.5;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx, dz = (z - cz - belly * 0.4) / rz;
      if (dx * dx + dz * dz > 1) continue;
      let c = (x + Math.round(z * 0.5)) % 4 === 0 ? dark(S.color, 0.12) : S.color;
      if (S.dots && (x * 3 + y * 5 + z) % 11 === 0) c = S.dots;
      if (y === 0) c = dark(S.color, 0.2);
      v.set(x, y, z, c);
    }
  }
  if (spec.apron && !spec.apron.short) {
    const A = spec.apron;
    for (let y = 1; y < len; y++) for (let x = Math.round(cx - w / 2 + 2); x <= Math.round(cx + w / 2 - 2); x++) {
      for (let z = D - 1; z >= 0; z--) if (v.get(x, y, z)) { v.set(x, y, z + 1, y === 1 ? dark(A.color, 0.1) : A.color); break; }
    }
  }
  // pivot at the top centre (waist)
  return { vox: v, origin: [cx + 0.5, len, cz + 0.5], size: VS };
}

// the long red scarf / cape cloth textures are drawn in cloth.js; here only the knot
export function bodyHeight(spec) {
  return (spec.leg.len + spec.torso.h + spec.head.h) * VS;
}
