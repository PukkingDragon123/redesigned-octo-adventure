// Parametric pixel-art character rig. Every character is drawn from a spec
// (skin, hair, hat, outfit, props) in poses (idle, walk, ride, scared...),
// views (front, back, side) and facial expressions, with auto shading + outlines.
import { Pix, shade, mix } from './pixel.js';

export const SKINS = {
  zombie: { base: 0xa4c49a, sh: 0x7a9c7a, dk: 0x52725a, hi: 0xcae2bc, cheek: 0x9ab48c, lip: 0x66806a },
  fair: { base: 0xf2c8a2, sh: 0xd89c7a, dk: 0xa86c52, hi: 0xffe2c6, cheek: 0xf0a090, lip: 0xc0605a },
  rosy: { base: 0xf4c4a8, sh: 0xdc9a80, dk: 0xac6a58, hi: 0xffe4d0, cheek: 0xf28a82, lip: 0xc05a58 },
  tan: { base: 0xd8a274, sh: 0xb47a4c, dk: 0x7c5032, hi: 0xf0c496, cheek: 0xe08c70, lip: 0xa0503c },
  brown: { base: 0x9c6844, sh: 0x7a4c2e, dk: 0x50301c, hi: 0xba855c, cheek: 0xb46c52, lip: 0x6a3020 },
  skull: { base: 0xf0eadc, sh: 0xcac0aa, dk: 0x8a8070, hi: 0xffffff, cheek: 0xf0eadc, lip: 0x2a2228 },
};

const INK = 0x1e1418;
const WHITE = 0xfaf6ee;

// ---------------------------------------------------------------- characters
export const CHARACTERS = {
  hank: {
    name: 'Hank', skin: 'zombie', build: 'big',
    hair: { style: 'messy', color: 0x4a3226 }, beard: { style: 'full', color: 0x4a3226 },
    eyes: 'undead', bandage: true,
    hat: { type: 'toque', color: 0xc8361f, band: 0xeadfc4, pom: 0xf6efe0 },
    top: { type: 'sweater', color: 0xe2d4b4, accent: 0x2f6e6a, accent2: 0xc8361f },
    legs: { type: 'pants', color: 0x3e4c6c }, boots: 0x5a3420,
  },
  hankBuried: {
    name: 'Hank', skin: 'zombie', build: 'big',
    hair: { style: 'messy', color: 0x4a3226 }, beard: { style: 'full', color: 0x4a3226 },
    eyes: 'undead', bandage: false, dirt: true,
    hat: null,
    top: { type: 'plaid', color: 0xa8321e, accent: 0x2a1616, suspenders: 0x3a2a20 },
    legs: { type: 'pants', color: 0x3e4c6c }, boots: 0x5a3420,
  },
  grandma: {
    name: 'Nana Marguerite', skin: 'rosy', build: 'small',
    hair: { style: 'bun', color: 0xe8e4ec }, glasses: 0x8a6a3a,
    top: { type: 'cardigan', color: 0x8a3a5a, accent: 0xf0e0c8 },
    apron: { color: 0xf4ecda, stain: 0x7a4a2a },
    legs: { type: 'skirt', color: 0x5a4a6e }, boots: 0x4a2a2a,
  },
  reaper: {
    name: 'The Grim Reaper', skin: 'skull', build: 'tall',
    hood: 0x2e2a3e, eyes: 'skull',
    top: { type: 'robe', color: 0x38324c, accent: 0x564e6e },
    legs: { type: 'robe', color: 0x38324c }, boots: 0x38324c,
  },
  gus: {
    name: 'Gus', skin: 'tan', build: 'normal',
    hair: { style: 'short', color: 0x9a9894 }, beard: { style: 'full', color: 0xb8b4ac },
    brows: 'grumpy',
    hat: { type: 'trapper', color: 0x6a4a2e, fur: 0xc8b090 },
    top: { type: 'plaid', color: 0x2e5a3a, accent: 0x161a16 },
    legs: { type: 'pants', color: 0x5a4a38 }, boots: 0x3a2618,
  },
  marie: {
    name: 'Marie-Claude', skin: 'fair', build: 'normal',
    hair: { style: 'curly', color: 0xc0502a },
    hat: { type: 'beret', color: 0x8a1e2e },
    top: { type: 'stripes', color: 0xf0ead8, accent: 0x2a3a6a },
    apron: { color: 0x5a3a2a, stain: 0x8a5a3a },
    legs: { type: 'pants', color: 0x2a2a34 }, boots: 0x2a1a1a,
  },
  doug: {
    name: 'Constable Doug', skin: 'fair', build: 'normal', mustache: 0x6a4a2a,
    hair: { style: 'short', color: 0x6a4a2a },
    hat: { type: 'campaign', color: 0x8a6a3e, band: 0x4a3420 },
    top: { type: 'serge', color: 0xc02a24, accent: 0xf2c443, belt: 0x5a3420 },
    legs: { type: 'pants', color: 0x1e2440, stripe: 0xf2c443 }, boots: 0x1e1616,
  },
  birdie: {
    name: 'Captain Birdie', skin: 'tan', build: 'small',
    hair: { style: 'short', color: 0xc8c4c0 },
    hat: { type: 'souwester', color: 0xf0c020 }, pipe: true,
    top: { type: 'raincoat', color: 0xf0c020, accent: 0xc89810 },
    legs: { type: 'pants', color: 0x3a4a5a }, boots: 0x2e3a2e,
  },
  ingrid: {
    name: 'Dr. Ingrid', skin: 'fair', build: 'tall',
    hair: { style: 'braid', color: 0xe8c860 }, glasses: 0x3a3a4a,
    top: { type: 'labcoat', color: 0xf4f4f0, accent: 0x6aa0c0 },
    legs: { type: 'pants', color: 0x4a5a7a }, boots: 0x3a2a2a,
  },
  lou: {
    name: 'Big Lou', skin: 'brown', build: 'huge',
    hair: { style: 'short', color: 0x1e1a1a }, beard: { style: 'full', color: 0x1e1a1a },
    hat: { type: 'hardhat', color: 0xf0b020 },
    top: { type: 'vest', color: 0x4a6a8a, accent: 0xf07020, stripe: 0xe8e8a0 },
    legs: { type: 'pants', color: 0x3a3a46 }, boots: 0x5a3a1a,
  },
  agnes: {
    name: 'Agnes', skin: 'fair', build: 'small',
    hair: { style: 'curlers', color: 0xb8b0bc, curler: 0xf090b0 }, glasses: 0xc04080,
    top: { type: 'cardigan', color: 0xa890c8, accent: 0xf6eee0 },
    legs: { type: 'skirt', color: 0x6a5a8a }, boots: 0x4a3a4a,
  },
  pip: {
    name: 'Pip', skin: 'tan', build: 'kid',
    hair: { style: 'short', color: 0x3a2418 },
    hat: { type: 'toque', color: 0x2a5ab0, band: 0xf0f0f0, pom: 0xc8361f },
    top: { type: 'jersey', color: 0xc8361f, accent: 0xf6f0e8 },
    legs: { type: 'pants', color: 0x2a2a3a }, boots: 0x1e1e2a,
  },
  pop: {
    name: 'Pop', skin: 'fair', build: 'kid',
    hair: { style: 'pigtails', color: 0xe0a040 },
    hat: { type: 'toque', color: 0xe8b020, band: 0x2a5ab0, pom: 0x2a5ab0 },
    top: { type: 'jersey', color: 0x2a5ab0, accent: 0xf6f0e8 },
    legs: { type: 'pants', color: 0x2a2a3a }, boots: 0x1e1e2a,
  },
  ollie: {
    name: 'Old Ollie', skin: 'rosy', build: 'normal',
    hair: { style: 'short', color: 0xf0f0f0 }, beard: { style: 'full', color: 0xf4f4f4 },
    hat: { type: 'captain', color: 0x22284a, top: 0xf4f4f0 },
    top: { type: 'sweater', color: 0x2a3a6a, accent: 0xe8e8e8, accent2: 0xe8e8e8, cable: true },
    legs: { type: 'pants', color: 0x3a3a46 }, boots: 0x2a1e1a,
  },
};

// ---------------------------------------------------------------- metrics
function metrics(spec) {
  const b = spec.build;
  const m = { headW: 12, headH: 11, torsoW: 12, torsoH: 14, legH: 14, legW: 4, armW: 3, armL: 11, scale: 1 };
  if (b === 'big') Object.assign(m, { torsoW: 14, torsoH: 14, legW: 5, armW: 3, armL: 12 });
  if (b === 'huge') Object.assign(m, { torsoW: 16, torsoH: 16, legH: 15, legW: 5, armW: 4, armL: 13, headW: 13 });
  if (b === 'small') Object.assign(m, { torsoW: 12, torsoH: 12, legH: 12, armL: 10 });
  if (b === 'tall') Object.assign(m, { torsoW: 12, torsoH: 15, legH: 16, armL: 12 });
  if (b === 'kid') Object.assign(m, { headW: 12, headH: 11, torsoW: 10, torsoH: 9, legH: 9, legW: 3, armL: 8, armW: 3 });
  return m;
}

// thick line between two points
function limb(p, x0, y0, x1, y1, w, color) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    p.rect(Math.round(x - w / 2), Math.round(y - w / 2), w, w, color);
  }
}

// two-bone IK: returns elbow/knee position. bend = +1 / -1 chooses the side
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy);
  const maxd = l1 + l2 - 0.01;
  if (d > maxd) {
    dx *= maxd / d;
    dy *= maxd / d;
    d = maxd;
  }
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1))));
  const base = Math.atan2(dy, dx);
  const ang = base + a * bend;
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
}

// Shading pass: light from the top-left; then selective outline
function shadeRegion(p, ox, oy, w, h) {
  const src = new Uint8ClampedArray(p.data);
  const W = p.w;
  const alphaAt = (x, y) => (x < ox || y < oy || x >= ox + w || y >= oy + h ? 0 : src[(y * W + x) * 4 + 3]);
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] < 255) continue;
      const c = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      const flag = src[i + 3];
      if (flag !== 255) continue;
      // edge-based light: transparent above/left = lit, below/right = shadow
      const up = alphaAt(x, y - 1) === 0, left = alphaAt(x - 1, y) === 0;
      const down = alphaAt(x, y + 1) === 0, right = alphaAt(x + 1, y) === 0;
      let nc = c;
      if (right || down) nc = shade(c, -0.18);
      if (up && !down) nc = shade(c, 0.14);
      else if (left && !right) nc = shade(c, 0.08);
      if (nc !== c) {
        p.data[i] = (nc >> 16) & 255;
        p.data[i + 1] = (nc >> 8) & 255;
        p.data[i + 2] = nc & 255;
      }
    }
  }
  p.outline(null, { region: [ox, oy, w, h], darken: 0.62 });
}

// ---------------------------------------------------------------- heads
function drawFace(p, x, y, hw, hh, spec, expr, view, frame) {
  const sk = SKINS[spec.skin];
  const cx = x + Math.floor(hw / 2);
  // positions relative to head box
  const side = view === 'side';
  const ey = y + Math.floor(hh * 0.55);
  const exL = side ? x + hw - 5 : cx - 3, exR = side ? -99 : cx + 2;
  const my = ey + 3;
  const mx = side ? x + hw - 4 : cx - 1;
  const undead = spec.eyes === 'undead';
  const skull = spec.eyes === 'skull';
  const eye = (ex, which) => {
    if (ex < 0) return;
    if (skull) {
      p.rect(ex, ey - 1, 2, 3, INK);
      if (expr === 'happy' || expr === 'sheepish') { p.set(ex, ey - 1, sk.base); p.set(ex + 1, ey - 1, sk.base); }
      if (expr === 'surprised' || expr === 'scared') p.set(ex, ey, 0xff6a3a);
      return;
    }
    if (undead) {
      // dark rings under the eyes
      p.set(ex, ey + 1, sk.dk);
      p.set(ex + 1, ey + 1, sk.dk);
    }
    switch (expr) {
      case 'happy':
      case 'laugh':
        p.set(ex, ey, INK); p.set(ex + 1, ey - 1, INK); p.set(ex + 2 > ex + 1 && !side ? ex + 1 : ex + 1, ey - 1, INK);
        p.set(ex + 1, ey, sk.base);
        p.set(ex, ey, INK);
        p.set(ex + 1, ey - 1, INK);
        break;
      case 'sleepy':
      case 'sad':
        p.set(ex, ey, INK); p.set(ex + 1, ey, INK);
        if (expr === 'sad') p.set(which === 'L' ? ex + 1 : ex, ey - 2, shade(spec.hair?.color ?? INK, -0.2));
        break;
      case 'scared':
      case 'surprised':
      case 'shock':
        p.rect(ex, ey - 1, 2, 2, WHITE);
        p.set(ex + (which === 'L' ? 1 : 0), ey, INK);
        if (expr !== 'surprised') p.set(ex + (which === 'L' ? 0 : 1), ey - 2, INK);
        break;
      case 'angry':
      case 'grumpy':
        p.set(ex, ey, INK); p.set(ex + 1, ey, INK);
        p.set(which === 'L' ? ex : ex + 1, ey - 2, INK);
        p.set(which === 'L' ? ex + 1 : ex, ey - 1, INK);
        break;
      case 'blink':
        p.set(ex, ey, INK); p.set(ex + 1, ey, INK);
        break;
      default:
        p.set(ex, ey - 1, INK);
        p.set(ex, ey, INK);
        if (!undead || which === 'L') p.set(ex + 1, ey - 1, WHITE);
        if (undead && which === 'R') { p.set(ex, ey - 1, sk.sh); p.set(ex + 1, ey - 1, sk.sh); } // droopy lid
        if (spec.brows === 'grumpy') { p.set(which === 'L' ? ex + 1 : ex, ey - 2, INK); p.set(which === 'L' ? ex : ex + 1, ey - 3, INK); }
    }
  };
  eye(exL, 'L');
  eye(exR, 'R');
  // nose
  if (!skull && !side) p.set(cx - 1, ey + 1, sk.sh);
  if (side && !skull) { p.set(x + hw, ey + 1, sk.base); p.set(x + hw, ey + 2, sk.sh); }
  if (skull) { p.set(cx - 1, ey + 2, sk.dk); p.set(cx, ey + 2, sk.dk); }
  // cheeks
  if (!skull && (expr === 'happy' || expr === 'laugh' || expr === 'embarrassed' || spec.skin === 'rosy')) {
    if (!side) { p.set(exL - 1, ey + 2, sk.cheek); p.set(cx + 4, ey + 2, sk.cheek); }
    else p.set(x + hw - 6, ey + 2, sk.cheek);
  }
  // mouth
  const mouthCol = skull ? INK : undead ? sk.dk : sk.lip;
  const talkOpen = expr === 'talk' && frame % 2 === 1;
  switch (expr) {
    case 'happy':
      p.set(mx - 1, my - 1, mouthCol); p.hline(mx, mx + 1, my, mouthCol); p.set(mx + 2, my - 1, mouthCol);
      break;
    case 'laugh':
      p.rect(mx - 1, my - 1, 4, 2, INK); p.hline(mx, mx + 1, my - 1, WHITE);
      break;
    case 'scared':
    case 'shock':
      p.rect(mx, my - 1, 2, 3, INK); p.set(mx, my - 1, WHITE);
      break;
    case 'surprised':
      p.rect(mx, my, 2, 2, INK);
      break;
    case 'sad':
      p.set(mx - 1, my + 1, mouthCol); p.hline(mx, mx + 1, my, mouthCol); p.set(mx + 2, my + 1, mouthCol);
      break;
    case 'angry':
    case 'grumpy':
      p.hline(mx - 1, mx + 2, my, mouthCol);
      if (expr === 'angry') p.hline(mx, mx + 1, my + 1, WHITE);
      break;
    case 'sheepish':
    case 'embarrassed':
      p.hline(mx - 1, mx + 1, my, mouthCol); p.set(mx + 2, my - 1, mouthCol);
      break;
    default:
      if (talkOpen) p.rect(mx, my - 1, 2, 2, INK);
      else p.hline(mx, mx + 1, my, mouthCol);
  }
  if (skull) {
    // teeth
    p.hline(cx - 2, cx + 1, my + 1, WHITE);
    p.set(cx - 1, my + 1, INK);
    p.set(cx + 1, my + 1, INK);
  }
  if (expr === 'scared' || expr === 'sheepish' || expr === 'embarrassed') {
    // sweat drop
    p.set(x + hw, y + 2, 0x8ad0f0);
    p.set(x + hw, y + 3, 0x8ad0f0);
    p.set(x + hw + 1, y + 3, 0x5aa0d0);
  }
}

function drawHead(p, x, y, m, spec, view, expr, frame) {
  const sk = SKINS[spec.skin];
  const hw = m.headW, hh = m.headH;
  const back = view === 'back', side = view === 'side';
  if (spec.hood) {
    // reaper hood around a skull
    p.ellipse(x + hw / 2, y + hh / 2 + 1, hw / 2 + 2, hh / 2 + 2.5, spec.hood);
    if (side) p.poly([[x - 2, y + 2], [x - 5, y + hh + 2], [x + 2, y + hh]], spec.hood);
    if (!back) {
      const fx = side ? x + 4 : x + 2, fw = side ? hw - 4 : hw - 4;
      p.ellipse(fx + fw / 2, y + hh / 2 + 2, fw / 2, hh / 2 - 0.5, sk.base);
      p.set(fx + fw / 2 - 2, y + hh - 1, sk.sh);
      drawFace(p, side ? x + 2 : x, y + 1, hw, hh, spec, expr, view, frame);
    }
    return;
  }
  // skull/face shape: rounded box
  p.rect(x + 1, y, hw - 2, hh, sk.base);
  p.rect(x, y + 1, hw, hh - 2, sk.base);
  if (side) p.rect(x + hw, y + 4, 1, 4, sk.base);
  // ears
  if (!side) {
    p.set(x - 1, y + 5, sk.sh);
    p.set(x - 1, y + 6, sk.sh);
    p.set(x + hw, y + 5, sk.sh);
    p.set(x + hw, y + 6, sk.sh);
  } else p.rect(x + 3, y + 5, 2, 2, sk.sh);
  const hair = spec.hair;
  const hc = hair?.color;
  if (hair) {
    switch (hair.style) {
      case 'messy':
        if (side) {
          p.rect(x, y - 1, hw - 1, 3, hc);
          p.rect(x - 1, y, 4, hh - 3, hc);
          p.set(x + hw - 2, y + 2, hc);
          for (let i = 0; i < hw - 2; i += 2) p.set(x + i, y - 2, hc);
        } else {
          p.rect(x, y - 1, hw, 3, hc);
          p.rect(x - 1, y + 1, 2, 5, hc);
          p.rect(x + hw - 1, y + 1, 2, 5, hc);
          for (let i = 0; i < hw; i += 2) p.set(x + i, y - 2, hc);
          p.set(x + 3, y + 2, hc);
          p.set(x + hw - 4, y + 2, hc);
        }
        break;
      case 'short':
        p.rect(x, y - 1, hw, 3, hc);
        p.rect(x - 1, y + 1, 1, 4, hc);
        p.rect(x + hw, y + 1, 1, 4, hc);
        if (side) p.rect(x - 1, y, 4, hh - 4, hc);
        break;
      case 'bun':
        p.rect(x, y - 1, hw, 4, hc);
        p.rect(x - 1, y + 1, 2, 6, hc);
        p.rect(x + hw - 1, y + 1, 2, 6, hc);
        p.ellipse(x + hw / 2 + (side ? -3 : 0), y - 2, 3.2, 2.6, hc);
        if (side) p.rect(x - 1, y, 5, hh - 3, hc);
        break;
      case 'curly':
        for (let i = -1; i <= hw; i += 2) p.circle(x + i + 0.5, y + 0.5, 1.6, hc);
        p.circle(x - 0.5, y + 4, 1.8, hc);
        p.circle(x + hw + 0.5, y + 4, 1.8, hc);
        p.circle(x - 0.5, y + 7.5, 1.6, hc);
        p.circle(x + hw + 0.5, y + 7.5, 1.6, hc);
        if (side) { p.rect(x - 2, y, 6, hh - 2, hc); }
        break;
      case 'braid':
        p.rect(x, y - 1, hw, 3, hc);
        p.rect(x - 1, y + 1, 2, 6, hc);
        p.rect(x + hw - 1, y + 1, 2, 6, hc);
        if (back || side) for (let k = 0; k < 6; k++) p.rect(x + hw / 2 - 1 + (side ? -4 : 0) + (k % 2), y + hh + k * 2 - 1, 2, 2, k % 2 ? shade(hc, -0.15) : hc);
        if (side) p.rect(x - 1, y, 5, hh - 3, hc);
        break;
      case 'curlers':
        p.rect(x, y - 1, hw, 4, hc);
        p.rect(x - 1, y + 1, 2, 6, hc);
        p.rect(x + hw - 1, y + 1, 2, 6, hc);
        for (let i = 0; i < 3; i++) p.rect(x + 1 + i * 4, y - 2, 3, 2, hair.curler);
        if (side) p.rect(x - 1, y, 5, hh - 3, hc);
        break;
      case 'pigtails':
        p.rect(x, y - 1, hw, 3, hc);
        p.rect(x - 3, y + 4, 3, 5, hc);
        p.rect(x + hw, y + 4, 3, 5, hc);
        if (side) p.rect(x - 1, y, 4, hh - 4, hc);
        break;
    }
  }
  if (back) {
    // back of head: hair covers it
    if (hair) p.rect(x, y, hw, hh - 2, hc);
    if (hair?.style === 'bun') p.ellipse(x + hw / 2, y + 2, 3.4, 3, shade(hc, 0.05));
  }
  // beard / mustache
  if (spec.beard && !back) {
    const bc = spec.beard.color;
    if (side) {
      // sideburn, jaw and a chin that juts forward a little
      p.rect(x + 3, y + 4, 2, hh - 6, bc);
      p.rect(x + 3, y + hh - 3, hw - 3, 3, bc);
      p.rect(x + 5, y + hh, hw - 5, 2, bc);
      p.set(x + hw, y + hh - 2, bc);
      p.hline(x + hw - 4, x + hw - 1, y + Math.floor(hh * 0.55) + 2, bc);
      // keep the mouth visible
      p.set(x + hw - 3, y + hh - 3, SKINS[spec.skin].lip);
    } else {
      p.rect(x, y + hh - 5, 2, 4, bc);
      p.rect(x + hw - 2, y + hh - 5, 2, 4, bc);
      p.rect(x + 1, y + hh - 2, hw - 2, 3, bc);
      p.rect(x + 3, y + hh, hw - 6, 2, bc);
      // mustache around the mouth
      const mx = x + Math.floor(hw / 2) - 1;
      p.hline(mx - 2, mx - 1, y + Math.floor(hh * 0.55) + 2, bc);
      p.hline(mx + 2, mx + 3, y + Math.floor(hh * 0.55) + 2, bc);
    }
  } else if (spec.beard && back) {
    p.rect(x - 1, y + hh - 4, 2, 3, spec.beard.color);
    p.rect(x + hw - 1, y + hh - 4, 2, 3, spec.beard.color);
  }
  if (spec.mustache && !back) {
    const mx = x + Math.floor(hw / 2) - 1, my = y + Math.floor(hh * 0.55) + 2;
    if (side) p.hline(x + hw - 4, x + hw - 1, my, spec.mustache);
    else { p.hline(mx - 2, mx + 3, my, spec.mustache); p.set(mx - 3, my + 1, spec.mustache); p.set(mx + 4, my + 1, spec.mustache); }
  }
  if (!back) drawFace(p, x, y, hw, hh, spec, expr, view, frame);
  if (spec.glasses && !back) {
    const ey = y + Math.floor(hh * 0.55) - 1;
    const g = spec.glasses;
    if (side) { p.rect(x + hw - 6, ey - 1, 3, 3, g); p.set(x + hw - 5, ey, 0xd8e8f0); }
    else {
      const cx = x + Math.floor(hw / 2);
      p.ring(cx - 2.5, ey + 0.5, 2.1, g);
      p.ring(cx + 2.5, ey + 0.5, 2.1, g);
      p.set(cx, ey, g);
    }
  }
  if (spec.bandage && !back) {
    const bx = side ? x + 5 : x + 2;
    p.rect(bx, y + 2, 3, 2, 0xf0e8d8);
    p.set(bx + 1, y + 2, 0xc8b8a0);
  }
  if (spec.dirt && !back) {
    p.set(x + 2, y + 3, 0x5a4030);
    p.set(x + hw - 3, y + hh - 4, 0x5a4030);
    p.set(x + 4, y + hh - 2, 0x5a4030);
  }
  if (spec.pipe && !back) {
    const my = y + Math.floor(hh * 0.55) + 3;
    const px = side ? x + hw : x + Math.floor(hw / 2) + 2;
    p.hline(px, px + 2, my, 0x5a3420);
    p.rect(px + 2, my - 2, 2, 3, 0x3a2414);
  }
  drawHat(p, x, y, hw, hh, spec, view);
}

function drawHat(p, x, y, hw, hh, spec, view) {
  const h = spec.hat;
  if (!h) return;
  const side = view === 'side';
  switch (h.type) {
    case 'toque': {
      p.rect(x - 1, y - 4, hw + 2, 5, h.color);
      p.rect(x, y - 6, hw, 2, h.color);
      p.rect(x + 2, y - 7, hw - 4, 1, h.color);
      // ribbing
      for (let i = 0; i < hw; i += 2) p.set(x + i, y - 3, shade(h.color, -0.18));
      p.rect(x - 1, y, hw + 2, 2, h.band);
      for (let i = 0; i < hw + 2; i += 2) p.set(x - 1 + i, y + 1, shade(h.band, -0.12));
      p.circle(x + hw / 2 + (side ? -2 : 0), y - 8, 2.2, h.pom);
      break;
    }
    case 'trapper': {
      p.rect(x - 1, y - 4, hw + 2, 5, h.color);
      p.rect(x, y - 5, hw, 1, h.color);
      p.rect(x - 1, y, hw + 2, 2, h.fur);
      if (!side) {
        p.rect(x - 2, y + 1, 3, 7, h.fur);
        p.rect(x + hw - 1, y + 1, 3, 7, h.fur);
      } else p.rect(x + 2, y + 1, 4, 7, h.fur);
      break;
    }
    case 'campaign': {
      // flat wide brim + pinched crown (the classic Mountie stetson)
      p.rect(x - 4, y - 1, hw + 8, 2, h.color);
      p.rect(x + 1, y - 6, hw - 2, 5, h.color);
      p.set(x + Math.floor(hw / 2) - 1, y - 6, 0);
      p.set(x + Math.floor(hw / 2), y - 6, 0);
      p.rect(x + 1, y - 2, hw - 2, 1, h.band);
      p.data[p.idx(x + Math.floor(hw / 2) - 1, y - 6) + 3] = 0;
      p.data[p.idx(x + Math.floor(hw / 2), y - 6) + 3] = 0;
      break;
    }
    case 'souwester':
      p.rect(x - 2, y - 4, hw + 4, 5, h.color);
      p.rect(x - 3, y, hw + 6, 2, h.color);
      if (!side) { p.rect(x - 3, y + 2, 3, 5, h.color); p.rect(x + hw, y + 2, 3, 5, h.color); }
      else p.rect(x - 3, y + 2, 5, 6, h.color);
      break;
    case 'hardhat':
      p.ellipse(x + hw / 2, y - 1, hw / 2 + 1, 4, h.color);
      p.rect(x - 2, y + 1, hw + 4, 2, h.color);
      p.rect(x + hw / 2 - 1, y - 5, 2, 5, shade(h.color, 0.2));
      break;
    case 'captain':
      p.rect(x - 1, y - 4, hw + 2, 4, h.top);
      p.rect(x - 1, y - 1, hw + 2, 2, h.color);
      if (!side) p.rect(x + 1, y + 1, hw - 2, 1, INK);
      else p.rect(x + hw - 4, y + 1, 6, 1, INK);
      p.set(x + Math.floor(hw / 2), y - 1, 0xf2c443);
      break;
    case 'beret':
      p.ellipse(x + hw / 2 + 1, y - 1, hw / 2 + 2, 3, h.color);
      p.set(x + hw / 2 + 1, y - 4, h.color);
      break;
  }
}

// ---------------------------------------------------------------- bodies
function fairIsle(p, x0, x1, y, a, b) {
  for (let x = x0; x <= x1; x++) {
    const k = (x - x0) % 4;
    p.set(x, y, k === 0 || k === 2 ? a : b);
    if (k === 1) p.set(x, y - 1, a);
    if (k === 3) p.set(x, y + 1, a);
  }
}

function drawTorso(p, tx, ty, tw, th, spec, view, lean = 0) {
  const t = spec.top;
  const c = t.color;
  const side = view === 'side', back = view === 'back';
  const w = side ? Math.max(8, tw - 4) : tw;
  const x = side ? tx + Math.floor((tw - w) / 2) : tx;
  // body block with slightly rounded shoulders, optional lean (side view)
  for (let j = 0; j < th; j++) {
    const off = side ? Math.round(lean * (1 - j / th)) : 0;
    const inset = j === 0 ? 1 : 0;
    p.rect(x + inset + off, ty + j, w - inset * 2, 1, c);
  }
  const long = t.type === 'robe' || t.type === 'labcoat' || t.type === 'raincoat';
  switch (t.type) {
    case 'sweater': {
      // Harold's hand-knit sweater: fair-isle yoke, ribbed hem
      if (t.cable) {
        for (let j = 2; j < th - 2; j++) { p.set(x + 3, ty + j, shade(c, (j % 2) * 0.15)); p.set(x + w - 4, ty + j, shade(c, (j % 2) * 0.15)); }
      } else {
        fairIsle(p, x + 1, x + w - 2, ty + 3, t.accent, c);
        p.hline(x + 1, x + w - 2, ty + 5, t.accent2);
        for (let i = x + 2; i < x + w - 1; i += 3) p.set(i, ty + 1, t.accent2);
      }
      for (let i = x; i < x + w; i += 2) p.set(i, ty + th - 1, shade(c, -0.15));
      if (!back && !side) p.rect(x + w / 2 - 2, ty, 4, 1, shade(c, -0.25));
      break;
    }
    case 'plaid': {
      for (let j = 0; j < th; j++) for (let i = 0; i < w; i++) {
        if ((i + 1) % 4 === 0 || (j + 2) % 4 === 0) p.set(x + i, ty + j, mix(c, t.accent, (i + 1) % 4 === 0 && (j + 2) % 4 === 0 ? 0.9 : 0.5));
      }
      if (t.suspenders && !side) { p.vline(x + 2, ty, ty + th - 1, t.suspenders); p.vline(x + w - 3, ty, ty + th - 1, t.suspenders); }
      if (!back && !side) { p.vline(x + w / 2, ty + 2, ty + th - 1, shade(c, -0.25)); p.set(x + w / 2 - 1, ty + 4, 0xe8e0d0); p.set(x + w / 2 - 1, ty + 8, 0xe8e0d0); }
      break;
    }
    case 'cardigan':
      if (!back && !side) {
        p.rect(x + w / 2 - 1, ty, 2, th, t.accent);
        for (let j = 3; j < th; j += 3) p.set(x + w / 2 - 2, ty + j, 0xf2c443);
      }
      for (let i = x; i < x + w; i += 2) p.set(i, ty + th - 1, shade(c, -0.15));
      break;
    case 'stripes':
      for (let j = 1; j < th; j += 3) p.hline(x, x + w - 1, ty + j, t.accent);
      break;
    case 'serge':
      p.hline(x, x + w - 1, ty + th - 4, spec.top.belt);
      p.set(x + w / 2, ty + th - 4, t.accent);
      if (!back) for (let j = 2; j < th - 4; j += 3) p.set(side ? x + w - 2 : x + w / 2, ty + j, t.accent);
      if (!side) { p.vline(x + 2, ty, ty + th - 5, shade(spec.top.belt, 0.2)); }
      break;
    case 'raincoat':
      if (!back && !side) { p.vline(x + w / 2, ty + 1, ty + th + 5, t.accent); for (let j = 3; j < th + 4; j += 3) p.set(x + w / 2 + 1, ty + j, INK); }
      p.rect(x, ty + th, w, 6, c);
      break;
    case 'labcoat':
      p.rect(x, ty + th, w, 8, c);
      if (!back && !side) {
        p.vline(x + w / 2, ty + 1, ty + th + 7, shade(c, -0.12));
        p.rect(x + 2, ty + 6, 3, 2, shade(c, -0.1));
        // stethoscope
        p.line(x + 3, ty + 1, x + w / 2 - 1, ty + 6, t.accent);
        p.line(x + w - 4, ty + 1, x + w / 2 + 1, ty + 6, t.accent);
        p.set(x + w / 2, ty + 7, 0xdadde4);
      }
      break;
    case 'robe':
      p.rect(x - 1, ty + th, w + 2, 18, c);
      p.vline(x + 2, ty + 2, ty + th + 16, t.accent);
      p.vline(x + w - 3, ty + 2, ty + th + 16, t.accent);
      // tattered hem
      for (let i = -1; i < w + 1; i += 2) p.set(x + i, ty + th + 18, c);
      break;
    case 'vest':
      p.rect(x + 1, ty, w - 2, th, t.accent);
      p.hline(x + 1, x + w - 2, ty + th - 5, t.stripe);
      p.hline(x + 1, x + w - 2, ty + th - 3, t.stripe);
      if (!back && !side) p.vline(x + w / 2, ty, ty + th - 1, c);
      break;
    case 'jersey':
      p.hline(x, x + w - 1, ty + th - 3, t.accent);
      p.hline(x, x + w - 1, ty + 1, t.accent);
      if (back) { p.rect(x + w / 2 - 2, ty + 3, 1, 4, t.accent); p.rect(x + w / 2 + 1, ty + 3, 1, 4, t.accent); }
      else if (!side) p.rect(x + w / 2 - 1, ty + 3, 2, 3, t.accent);
      break;
  }
  if (spec.apron && !back) {
    const a = spec.apron;
    const ax = side ? x + w - 3 : x + 2, aw = side ? 3 : w - 4;
    p.rect(ax, ty + 5, aw, th - 4 + 6, a.color);
    if (!side) p.hline(x, x + w - 1, ty + 5, a.color);
    p.set(ax + 1, ty + 9, a.stain);
    p.set(ax + 2, ty + 10, a.stain);
  }
  return { long };
}

function drawSkirt(p, spec, m, hipX, hipY, ground, view, sway = 0) {
  const L = spec.legs;
  const side = view === 'side';
  const top = hipY - 1, bot = ground - 4;
  const w0 = side ? m.torsoW - 4 : m.torsoW - 1, w1 = side ? m.torsoW - 1 : m.torsoW + 3;
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / Math.max(1, bot - top);
    const w = Math.round(w0 + (w1 - w0) * t);
    const off = Math.round(sway * t);
    p.rect(hipX - Math.floor(w / 2) + off, y, w, 1, L.color);
  }
  // folds + hem
  const hw = Math.floor(w1 / 2);
  for (let k = -hw + 2; k < hw - 1; k += 3) p.line(hipX + Math.round(k * 0.6), top + 2, hipX + k + Math.round(sway), bot - 1, shade(L.color, -0.14));
  p.hline(hipX - hw + Math.round(sway), hipX + hw - 1 + Math.round(sway), bot, shade(L.color, -0.28));
}

function drawLegs(p, spec, m, hipX, hipY, feet, view) {
  const L = spec.legs;
  const side = view === 'side';
  if (L.type === 'robe') return; // robe covers everything
  for (const f of feet) {
    const [fx, fy, knee, near] = f;
    const col = near === false ? shade(L.color, -0.22) : L.color;
    const hx = hipX + f.hipDx;
    if (L.type === 'skirt') {
      // only the stockinged shins + shoes show under a skirt
      limb(p, fx, fy - 5, fx, fy - 1, 2, shade(0xd8c8c0, near === false ? -0.25 : 0));
    } else if (knee) {
      limb(p, hx, hipY, knee[0], knee[1], m.legW, col);
      limb(p, knee[0], knee[1], fx, fy - 2, m.legW - 1, col);
      if (L.stripe && near !== false) limb(p, hx + (side ? 0 : f.hipDx > 0 ? 1 : -1), hipY + 1, knee[0], knee[1], 1, L.stripe);
    } else {
      limb(p, hx, hipY, fx, fy - 2, m.legW, col);
      if (L.stripe && near !== false) limb(p, hx + (f.hipDx > 0 ? 1 : 0), hipY + 1, fx + (f.hipDx > 0 ? 1 : 0), fy - 3, 1, L.stripe);
    }
    // boots
    const bc = near === false ? shade(spec.boots, -0.2) : spec.boots;
    if (side) p.rect(Math.round(fx) - 2, Math.round(fy) - 2, 5, 3, bc);
    else p.rect(Math.round(fx) - Math.floor(m.legW / 2) - 1, Math.round(fy) - 2, m.legW + 1, 3, bc);
  }
}

function drawArm(p, spec, m, sx, sy, hx, hy, bend, near, item) {
  const t = spec.top;
  let col = t.type === 'vest' ? t.color : t.color;
  if (t.type === 'robe') col = t.color;
  if (near === false) col = shade(col, -0.22);
  const sk = SKINS[spec.skin];
  const l1 = Math.ceil(m.armL / 2), l2 = Math.floor(m.armL / 2) + 1;
  const [ex, ey] = ik(sx, sy, hx, hy, l1, l2, bend);
  limb(p, sx, sy, ex, ey, m.armW, col);
  limb(p, ex, ey, hx, hy, m.armW - (m.armW > 3 ? 1 : 0), col);
  // cuffs
  if (t.type === 'sweater') p.set(Math.round(hx), Math.round(hy) - 1, t.accent2);
  const hand = t.type === 'robe' ? SKINS.skull.base : near === false ? sk.sh : sk.base;
  p.rect(Math.round(hx) - 1, Math.round(hy), 2, 2, hand);
  if (item) drawItem(p, item, Math.round(hx), Math.round(hy), near);
}

function drawItem(p, item, hx, hy, near) {
  switch (item) {
    case 'mug':
      p.rect(hx - 1, hy - 3, 3, 4, 0xf4ecdc);
      p.hline(hx - 1, hx + 1, hy - 3, 0x6a3a1e);
      p.set(hx + 2, hy - 2, 0xf4ecdc);
      break;
    case 'lantern':
      p.vline(hx, hy + 1, hy + 2, INK);
      p.rect(hx - 2, hy + 3, 5, 6, 0x3a2a1a);
      p.rect(hx - 1, hy + 4, 3, 4, 0xffe080);
      p.set(hx, hy + 5, 0xffffff);
      break;
    case 'gun':
      // comedic old shotgun held across the body
      p.line(hx - 6, hy + 3, hx + 9, hy - 3, 0x2a2a30);
      p.line(hx - 6, hy + 4, hx - 2, hy + 3, 0x6a3a1e);
      p.rect(hx - 8, hy + 3, 3, 3, 0x6a3a1e);
      break;
    case 'gunAim':
      p.hline(hx, hx + 12, hy, 0x2a2a30);
      p.hline(hx + 1, hx + 11, hy - 1, 0x3a3a44);
      p.rect(hx - 4, hy, 4, 3, 0x6a3a1e);
      break;
    case 'clipboard':
      p.rect(hx - 2, hy - 5, 5, 7, 0x8a5a2a);
      p.rect(hx - 1, hy - 4, 3, 5, 0xf6f0e0);
      p.hline(hx - 1, hx + 1, hy - 2, 0x8a8a8a);
      break;
    case 'scythe':
      p.vline(hx, hy - 22, hy + 10, 0x6a4a2a);
      p.line(hx, hy - 22, hx + 9, hy - 19, 0xdadde4);
      p.line(hx + 1, hy - 21, hx + 10, hy - 17, 0xb0b4bc);
      p.line(hx + 9, hy - 19, hx + 11, hy - 15, 0xb0b4bc);
      break;
    case 'stick':
      p.line(hx, hy, hx + 3, hy + 12, 0x8a5a2a);
      p.hline(hx + 3, hx + 7, hy + 12, 0x2a2a2a);
      break;
    case 'needles':
      p.line(hx - 2, hy - 3, hx + 2, hy + 1, 0xdadde4);
      p.line(hx + 2, hy - 3, hx - 2, hy + 1, 0xdadde4);
      p.circle(hx, hy + 2, 1.6, 0xd04060);
      break;
  }
}

// ---------------------------------------------------------------- poses
// Each pose returns joint targets in frame pixel coordinates.
// Frame: 32 x 48 for on-foot, feet baseline y=45. Ride frames: 40 x 56.
export const FOOT_FRAME = { w: 32, h: 48 };
export const RIDE_FRAME = { w: 40, h: 56, hipX: 20, hipY: 27 };

function standing(spec, m, view, f, opts = {}) {
  const ground = 45;
  const bob = opts.bob ?? 0;
  const hipY = ground - m.legH - 1 + bob + (opts.crouch || 0);
  const torsoY = hipY - m.torsoH + 1;
  const headY = torsoY - m.headH + 1 + (opts.headDy || 0);
  const cx = 16;
  return { ground, hipY, torsoY, headY, cx };
}

function poseFrame(p, ox, oy, spec, animName, view, frame, expr) {
  const m = metrics(spec);
  const [legAnim, armAnim] = animName.includes('+') ? animName.split('+') : [animName, animName];
  let anim = legAnim;
  const side = view === 'side', back = view === 'back';
  let bob = 0, crouch = 0, headDy = 0, lean = 0;
  let arms = null, feet = null, item = null, itemSide = 'R';
  const ph = (frame % 4) / 4;
  // defaults: relaxed arms, feet together
  const S = standing(spec, m, view, frame);
  if (anim === 'idle' || anim === 'talk') bob = frame % 2;
  if (anim === 'walk') bob = frame % 2 === 0 ? 0 : -1;
  if (anim === 'scared') { bob = frame % 2 === 0 ? -2 : 0; }
  if (anim === 'shiver') { bob = 0; }
  if (anim === 'sit' || anim === 'eat') crouch = 6;
  if (anim === 'float') bob = frame % 2 ? -1 : 0;
  const ground = 45;
  const hipY = ground - m.legH - 1 + bob + crouch;
  const torsoY = hipY - m.torsoH + 1;
  const headY = torsoY - m.headH + (spec.build === 'kid' ? 2 : 1) + headDy;
  const cx = 16 + (anim === 'shiver' ? (frame % 2 ? 1 : -1) * 0 : 0);
  const shake = anim === 'shiver' || (anim === 'aim' && frame % 2) ? (frame % 2 ? 1 : 0) : 0;
  const tx = cx - Math.floor(m.torsoW / 2) + shake;
  const shY = torsoY + 2;
  const shL = tx - 1, shR = tx + m.torsoW;
  const restY = torsoY + m.armL + 1;

  // ---- arms
  const A = (l, r) => (arms = { l, r });
  anim = armAnim;
  switch (anim) {
    case 'walk': {
      const sw = [2, 0, -2, 0][frame % 4];
      A([shL - 1 + (side ? sw : 0), restY - (side ? 0 : Math.abs(sw) * 0.5)], [shR + 1 - (side ? sw : 0), restY]);
      break;
    }
    case 'talk':
      A([shL - 1, restY], frame % 2 ? [shR + 4, torsoY + 4] : [shR + 3, torsoY + 6]);
      break;
    case 'wave':
      A([shL - 1, restY], [shR + 3 + (frame % 2), torsoY - 6]);
      break;
    case 'handsup':
    case 'scared':
      A([shL - 3 - (frame % 2), torsoY - 5 - (frame % 2)], [shR + 3 + (frame % 2), torsoY - 5 - (frame % 2)]);
      break;
    case 'cheer':
      A([shL - 2, torsoY - 6 + (frame % 2)], [shR + 2, torsoY - 6 + (frame % 2)]);
      break;
    case 'shiver':
      A([cx - 2 + shake, torsoY + 6], [cx + 3 + shake, torsoY + 6]);
      break;
    case 'hold':
    case 'sip':
      A([shL - 1, restY], anim === 'sip' && frame % 2 ? [cx + 2, headY + m.headH - 2] : [shR + 2, torsoY + 7]);
      item = 'mug';
      break;
    case 'offer':
      A([cx - 1, torsoY + 8], [shR + 4, torsoY + 6]);
      item = 'mug';
      break;
    case 'eat':
      A([shL, torsoY + 9], frame % 3 === 1 ? [cx + 2, headY + m.headH - 1] : [shR + 2, torsoY + 9]);
      break;
    case 'lantern':
      A([shL - 1, restY], [shR + 3, torsoY + 6]);
      item = 'lantern';
      break;
    case 'aim':
      A([cx + 2 + shake, torsoY + 5], [cx + 6 + shake, torsoY + 4]);
      item = 'gunAim';
      break;
    case 'gun':
      A([shL + 1, torsoY + 8], [shR + 1, torsoY + 6]);
      item = 'gun';
      break;
    case 'clipboard':
      A([shL - 1, restY], [cx + 3, torsoY + 6]);
      item = 'clipboard';
      break;
    case 'facepalm':
      A([shL - 1, restY], [cx + 1, headY + 6]);
      break;
    case 'point':
      A([shL - 1, restY], [shR + 8, torsoY + 2]);
      break;
    case 'scythe':
    case 'float':
      A([shL - 1, restY - 2], [shR + 3, torsoY + 8]);
      item = anim === 'scythe' || spec === CHARACTERS.reaper ? 'scythe' : null;
      break;
    case 'hug':
      A([shL - 5, torsoY + 3], [shR + 5, torsoY + 3]);
      break;
    case 'knit':
      A([cx - 2, torsoY + 8], [cx + 3, torsoY + 8 - (frame % 2)]);
      item = 'needles';
      break;
    case 'hockey':
      A([cx - 1, torsoY + 7], [cx + 3, torsoY + 8]);
      item = 'stick';
      break;
    case 'shrug':
      A([shL - 4, torsoY + 1], [shR + 4, torsoY + 1]);
      break;
    case 'crawl':
      A([shL - 4, ground - 1 - (frame % 2) * 2], [shR + 4, ground - 3 + (frame % 2) * 2]);
      break;
    default:
      A([shL - 1, restY + (anim === 'idle' ? frame % 2 : 0)], [shR + 1, restY + (anim === 'idle' ? frame % 2 : 0)]);
  }
  // ---- legs
  anim = legAnim;
  const hx = cx;
  const legOff = Math.max(2, Math.floor(m.torsoW / 4));
  if (anim === 'walk') {
    const st = [3, 0, -3, 0][frame % 4];
    if (side) feet = [[cx + st, ground, null, true], [cx - st, ground, null, false]];
    else feet = [[cx - legOff, ground - (frame % 4 === 1 ? 1 : 0), null], [cx + legOff - 1, ground - (frame % 4 === 3 ? 1 : 0), null]];
  } else if (anim === 'sit' || anim === 'eat') {
    feet = side ? [[cx + 6, ground, [cx + 6, hipY], true], [cx + 5, ground, [cx + 5, hipY], false]] : [[cx - legOff, ground, null], [cx + legOff - 1, ground, null]];
  } else if (anim === 'scared' && frame % 2 === 0) {
    feet = [[cx - legOff - 1, ground - 2, null], [cx + legOff, ground - 2, null]];
  } else {
    feet = side ? [[cx + 1, ground, null, true], [cx - 1, ground, null, false]] : [[cx - legOff, ground, null], [cx + legOff - 1, ground, null]];
  }
  for (const f of feet) f.hipDx = side ? 0 : f[0] < cx ? -legOff + 1 : legOff - 2;

  // ---- paint (z-order depends on view)
  const crawl = anim === 'crawl';
  const draw = () => {
    if (side) {
      // far limbs first
      drawArm(p, spec, m, cx - 1, shY, arms.l[0], arms.l[1], -1, false, null);
      drawLegs(p, spec, m, hx, hipY, feet.filter((f) => f[3] === false), view);
      drawTorso(p, tx, torsoY, m.torsoW, m.torsoH, spec, view, lean);
      drawLegs(p, spec, m, hx, hipY, feet.filter((f) => f[3] !== false), view);
      if (spec.legs.type === 'skirt') drawSkirt(p, spec, m, hx, hipY, ground, view, anim === 'walk' ? [1, 0, -1, 0][frame % 4] : 0);
      drawHead(p, cx - Math.floor(m.headW / 2), headY, m, spec, view, expr, frame);
      drawArm(p, spec, m, cx, shY, arms.r[0], arms.r[1], 1, true, item);
    } else {
      drawLegs(p, spec, m, hx, hipY, feet, view);
      if (spec.legs.type === 'skirt') drawSkirt(p, spec, m, hx, hipY, ground, view, anim === 'walk' ? [1, 0, -1, 0][frame % 4] * 0.5 : 0);
      const armsBehind = back;
      if (armsBehind) {
        drawArm(p, spec, m, shL + 1, shY, arms.l[0], arms.l[1], 1, true, null);
        drawArm(p, spec, m, shR - 1, shY, arms.r[0], arms.r[1], -1, true, null);
      }
      drawTorso(p, tx, torsoY, m.torsoW, m.torsoH, spec, view);
      drawHead(p, cx - Math.floor(m.headW / 2), headY, m, spec, view, expr, frame);
      if (!armsBehind) {
        drawArm(p, spec, m, shL + 1, shY, arms.l[0], arms.l[1], 1, true, itemSide === 'L' ? item : null);
        drawArm(p, spec, m, shR - 1, shY, arms.r[0], arms.r[1], -1, true, itemSide === 'R' ? item : null);
      }
    }
  };
  if (crawl) {
    // crawling out of the grave: arms reaching up, only the top half above the dirt
    const q = new Pix(32, 48);
    poseFrame(q, 0, 0, spec, 'handsup', 'front', frame, expr);
    p.blit(q, ox, oy + 16 + (frame % 2), false, 0, 0, 32, 30);
    return;
  }
  // paint into a scratch canvas (with margin) so shading/outlines only see this frame
  const OX = 8, OY = 10;
  const q = new Pix(48, 64);
  const realP = p;
  p = offsetPix(q, OX, OY);
  draw();
  p = realP;
  shadeRegion(q, 0, 0, q.w, q.h);
  realP.blit(q, ox, oy, false, OX, OY, FOOT_FRAME.w, FOOT_FRAME.h);
}

// Wrap a Pix so that all drawing calls are offset (lets painters use frame coords)
function offsetPix(pix, dx, dy) {
  return {
    w: pix.w, h: pix.h, data: pix.data,
    set: (x, y, c, a) => pix.set(x + dx, y + dy, c, a),
    rect: (x, y, w, h, c, a) => pix.rect(x + dx, y + dy, w, h, c, a),
    hline: (x0, x1, y, c) => pix.hline(x0 + dx, x1 + dx, y + dy, c),
    vline: (x, y0, y1, c) => pix.vline(x + dx, y0 + dy, y1 + dy, c),
    line: (x0, y0, x1, y1, c, a) => pix.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy, c, a),
    ellipse: (cx, cy, rx, ry, c, a) => pix.ellipse(cx + dx, cy + dy, rx, ry, c, a),
    circle: (cx, cy, r, c, a) => pix.circle(cx + dx, cy + dy, r, c, a),
    ring: (cx, cy, r, c, t) => pix.ring(cx + dx, cy + dy, r, c, t),
    poly: (pts, c, a) => pix.poly(pts.map(([x, y]) => [x + dx, y + dy]), c, a),
    alpha: (x, y) => pix.alpha(x + dx, y + dy),
    idx: (x, y) => pix.idx(x + dx, y + dy),
    blit: (src, x, y, flip, sx, sy, sw, sh) => pix.blit(src, x + dx, y + dy, flip, sx, sy, sw, sh),
  };
}

// ---------------------------------------------------------------- riding poses
// Ride frame 40x56; hips (saddle) at (20, 27). Phase = crank angle 0..1
export function drawRider(p, ox, oy, spec, view, pose, phase, expr = 'neutral') {
  const m = metrics(spec);
  const q = new Pix(56, 72);
  const OX = 8, OY = 8;
  const P = offsetPix(q, OX, OY);
  const side = view === 'side', back = view === 'back';
  const stand = pose === 'stand';
  const air = pose === 'air' || pose === 'glide';
  const ang = phase * Math.PI * 2;
  const crankR = 4.5;
  const rock = pose === 'pedal' || stand ? Math.round(Math.sin(ang) * (stand ? 1.2 : 0.6)) : 0;
  const hipX = 20 + (side ? 0 : rock), hipY = 27;
  const hy = hipY - (stand ? 5 : 0) - (air ? 1 : 0);
  const legC = spec.legs.color;
  const boot = (x, y, c) => P.rect(Math.round(x) - 2, Math.round(y) - 1, 4, 2, c);
  if (side) {
    // facing right; the bottom bracket is ahead of & below the saddle
    const bbX = hipX + 5, bbY = hipY + 18;
    const lean = stand ? 2 : pose === 'brake' ? 1 : 5;
    const shX = hipX + lean + 2, shY = hy - m.torsoH + 4;
    const footN = [bbX + Math.cos(ang) * crankR, bbY + Math.sin(ang) * crankR];
    const footF = [bbX - Math.cos(ang) * crankR, bbY - Math.sin(ang) * crankR];
    if (air) { footN[0] = bbX + 5; footN[1] = bbY - 3; footF[0] = bbX - 2; footF[1] = bbY - 1; }
    if (pose === 'drift') { footN[0] = bbX + 10; footN[1] = bbY - 4; }
    const hand = pose === 'glide' ? [shX + 1, shY - 10] : [hipX + 11, hipY - 3];
    // far leg & arm (darker)
    const kF = ik(hipX, hy, footF[0], footF[1], 11, 11, -1);
    limb(P, hipX, hy, kF[0], kF[1], m.legW, shade(legC, -0.25));
    limb(P, kF[0], kF[1], footF[0], footF[1] - 1, m.legW - 1, shade(legC, -0.25));
    boot(footF[0] + 1, footF[1], shade(spec.boots, -0.25));
    drawArm(P, spec, m, shX - 1, shY + 1, hand[0] - 1, hand[1], -1, false, null);
    // seat on the saddle
    P.rect(hipX - 4, hy - 2, 7, 4, legC);
    // torso leaning forward
    const tw = Math.max(8, m.torsoW - 4);
    for (let j = 0; j < m.torsoH - 2; j++) {
      const k = j / (m.torsoH - 2);
      const xoff = Math.round(lean * (1 - k));
      P.rect(hipX - Math.floor(tw / 2) + xoff, shY + j - 1, tw, 1, spec.top.color);
    }
    if (spec.top.type === 'sweater') fairIsle(P, hipX - 3 + lean, hipX + 3 + lean, shY + 2, spec.top.accent, spec.top.color);
    if (spec.top.type === 'plaid') for (let j = 0; j < m.torsoH - 2; j += 4) P.hline(hipX - 3 + Math.round(lean * (1 - j / m.torsoH)), hipX + 3 + Math.round(lean * (1 - j / m.torsoH)), shY + j, shade(spec.top.color, -0.3));
    // near leg
    const kN = ik(hipX, hy, footN[0], footN[1], 11, 11, -1);
    limb(P, hipX, hy, kN[0], kN[1], m.legW, legC);
    limb(P, kN[0], kN[1], footN[0], footN[1] - 1, m.legW - 1, legC);
    boot(footN[0] + 1, footN[1], spec.boots);
    // head ahead of the shoulders, chin forward
    drawHead(P, shX - Math.floor(m.headW / 2) + 3, shY - m.headH + 2, m, spec, 'side', expr, 0);
    drawArm(P, spec, m, shX, shY + 1, hand[0], hand[1], -1, true, null);
  } else {
    // back / front: hunched over the bars, knees pumping
    const bbY = hipY + 17;
    const offs = [Math.cos(ang) * crankR, -Math.cos(ang) * crankR];
    if (air) { offs[0] = -2; offs[1] = 0; }
    const tw = m.torsoW;
    const torsoH = m.torsoH - 4;
    const ty = hy - torsoH;
    const legX = [hipX - 3, hipX + 3];
    for (let k = 0; k < 2; k++) {
      const out = k ? 1 : -1;
      let fx = legX[k] + out, fy = bbY + offs[k];
      if (pose === 'drift' && k === (back ? 0 : 1)) { fx += out * 7; fy -= 5; }
      if (air) fx += out;
      // thighs point away/towards the camera: foreshortened, knee rises with the pedal
      const kneeY = hy + 4 + (offs[k] + crankR) * 0.55;
      const knee = [legX[k] + out * 2, kneeY];
      limb(P, legX[k], hy + 1, knee[0], knee[1], m.legW, legC);
      limb(P, knee[0], knee[1], fx, fy - 1, m.legW - 1, shade(legC, offs[k] > 0 ? -0.08 : 0));
      boot(fx, fy, spec.boots);
    }
    // seat on the saddle
    P.rect(hipX - Math.floor(tw / 2) + 1, hy - 2, tw - 2, 4, legC);
    const shL = hipX - Math.floor(tw / 2), shR = hipX + Math.ceil(tw / 2) - 1;
    const glide = pose === 'glide';
    const handL = glide ? [hipX - 6, ty - 10] : [shL - 2, ty + 9 + (stand ? 2 : 0)];
    const handR = glide ? [hipX + 6, ty - 10] : [shR + 2, ty + 9 + (stand ? 2 : 0)];
    if (back) {
      drawTorso(P, shL, ty, tw, torsoH + 2, spec, view);
      drawHead(P, hipX - Math.floor(m.headW / 2), ty - m.headH + 4, m, spec, view, expr, 0);
      drawArm(P, spec, m, shL, ty + 2, handL[0], handL[1], 1, true, null);
      drawArm(P, spec, m, shR, ty + 2, handR[0], handR[1], -1, true, null);
    } else {
      drawTorso(P, shL, ty, tw, torsoH + 2, spec, view);
      drawArm(P, spec, m, shL, ty + 2, handL[0], handL[1], 1, true, null);
      drawArm(P, spec, m, shR, ty + 2, handR[0], handR[1], -1, true, null);
      drawHead(P, hipX - Math.floor(m.headW / 2), ty - m.headH + 3, m, spec, view, expr, 0);
    }
  }
  shadeRegion(q, 0, 0, q.w, q.h);
  p.blit(q, ox, oy, false, OX, OY, RIDE_FRAME.w, RIDE_FRAME.h);
}

// ---------------------------------------------------------------- body parts (crash gag)
export function drawPart(p, ox, oy, spec, part) {
  const m = metrics(spec);
  const q = new Pix(24, 24);
  const P = offsetPix(q, 4, 4);
  const sk = SKINS[spec.skin];
  switch (part) {
    case 'head':
      drawHead(P, 2, 3, m, spec, 'front', 'shock', 0);
      break;
    case 'torso':
      drawTorso(P, 2, 1, m.torsoW, m.torsoH, spec, 'front');
      break;
    case 'arm':
      limb(P, 3, 3, 10, 9, m.armW, spec.top.color);
      P.rect(10, 9, 2, 2, sk.base);
      break;
    case 'leg':
      limb(P, 4, 2, 6, 12, m.legW, spec.legs.color);
      P.rect(4, 12, 5, 3, spec.boots);
      break;
    case 'hat':
      if (spec.hat) drawHat(P, 3, 9, m.headW, m.headH, spec, 'front');
      break;
  }
  shadeRegion(q, 0, 0, q.w, q.h);
  p.blit(q, ox, oy, false);
}

export { poseFrame, metrics, shadeRegion, offsetPix, limb };
