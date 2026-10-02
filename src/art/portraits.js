// 64x64 dialogue portraits with expressive faces.
import { Pix, shade, mix } from './pixel.js';
import { CHARACTERS, SKINS } from './characters.js';

const INK = 0x24161a;
const WHITE = 0xfcf8f0;
const S = 64;

export const EXPRESSIONS = ['neutral', 'happy', 'laugh', 'sad', 'scared', 'surprised', 'angry', 'sheepish', 'smug', 'sleepy', 'determined', 'love', 'shock', 'cry', 'talk'];

function eye(p, x, y, expr, side, o) {
  // x,y = top-left of a 6x5 eye box; side -1 left / +1 right
  const iris = o.iris ?? 0x3a2a24;
  const lidCol = o.skin.sh;
  switch (expr) {
    case 'happy':
    case 'laugh':
    case 'love':
      // closed happy arcs
      p.hline(x + 1, x + 4, y + 1, INK);
      p.set(x, y + 2, INK);
      p.set(x + 5, y + 2, INK);
      if (expr === 'love') {
        p.rect(x + 1, y - 1, 2, 2, 0xe83a5a);
        p.rect(x + 3, y - 1, 2, 2, 0xe83a5a);
        p.rect(x + 1, y + 1, 4, 1, 0xe83a5a);
        p.rect(x + 2, y + 2, 2, 1, 0xe83a5a);
      }
      return;
    case 'sleepy':
      p.hline(x, x + 5, y + 3, INK);
      p.hline(x + 1, x + 4, y + 2, lidCol);
      return;
    case 'sad':
    case 'cry':
      p.rect(x + 1, y + 1, 4, 3, WHITE);
      p.rect(x + 2, y + 2, 2, 2, iris);
      p.set(x + 2, y + 2, WHITE);
      p.hline(x, x + 5, y, INK);
      if (expr === 'cry') { p.vline(x + 2, y + 5, y + 9, 0x6ac0f0); p.set(x + 3, y + 7, 0x6ac0f0); }
      return;
    case 'scared':
    case 'shock':
    case 'surprised':
      p.rect(x, y - 1, 6, 6, WHITE);
      p.rect(x + 2, y + 1, 2, 2, expr === 'shock' ? INK : iris);
      p.hline(x, x + 5, y - 2, INK);
      p.vline(x - 1, y - 1, y + 4, INK);
      p.vline(x + 6, y - 1, y + 4, INK);
      p.hline(x, x + 5, y + 5, INK);
      return;
    case 'angry':
    case 'determined':
      p.rect(x, y + 1, 6, 3, WHITE);
      p.rect(x + 2, y + 1, 2, 3, iris);
      p.hline(x, x + 5, y, INK);
      p.hline(x, x + 5, y + 4, INK);
      return;
    case 'smug':
      p.rect(x, y + 2, 6, 2, WHITE);
      p.rect(x + (side < 0 ? 3 : 1), y + 2, 2, 2, iris);
      p.hline(x - 1, x + 6, y + 1, INK);
      return;
    default:
      p.rect(x, y, 6, 5, WHITE);
      p.rect(x + 2, y + 1, 3, 3, iris);
      p.set(x + 2, y + 1, WHITE);
      p.hline(x, x + 5, y - 1, INK);
      p.vline(x - 1, y, y + 3, INK);
      p.vline(x + 6, y, y + 3, INK);
      p.hline(x, x + 5, y + 5, shade(lidCol, -0.1));
  }
}

function brows(p, xL, xR, y, expr, col, grumpy) {
  const b = (x, dir, lift = 0) => {
    // dir: +1 inner end down (angry), -1 inner end up (sad/worried)
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) / 3;
      const yy = y - lift + Math.round(t * dir * 1.5);
      p.rect(x + i, yy, 1, 2, col);
    }
  };
  let d = 0, lift = 0;
  if (expr === 'angry' || expr === 'determined' || grumpy) d = 1;
  if (expr === 'sad' || expr === 'cry' || expr === 'sheepish' || expr === 'scared') d = -1;
  if (expr === 'surprised' || expr === 'shock' || expr === 'scared') lift = 3;
  if (expr === 'happy' || expr === 'laugh') lift = 1;
  b(xL, d, lift); // left brow: inner end is its right side
  // right brow mirrored
  for (let i = 0; i < 7; i++) {
    const t = (3 - i) / 3;
    const yy = y - lift + Math.round(t * d * 1.5);
    p.rect(xR + i, yy, 1, 2, col);
  }
  if (expr === 'smug') p.rect(xR, y - 2, 7, 2, col);
}

function mouth(p, cx, y, expr, o) {
  const lip = o.skin.lip;
  const dark = 0x4a1a1e;
  switch (expr) {
    case 'happy':
    case 'love':
      p.hline(cx - 3, cx + 3, y + 1, dark);
      p.set(cx - 4, y, dark);
      p.set(cx + 4, y, dark);
      break;
    case 'laugh':
      p.rect(cx - 4, y - 1, 9, 5, dark);
      p.hline(cx - 3, cx + 3, y - 1, WHITE);
      p.rect(cx - 2, y + 2, 5, 2, 0xd85a6a);
      break;
    case 'talk':
      p.rect(cx - 2, y - 1, 5, 3, dark);
      p.hline(cx - 1, cx + 1, y + 1, 0xd85a6a);
      break;
    case 'sad':
    case 'cry':
      p.hline(cx - 2, cx + 2, y, dark);
      p.set(cx - 3, y + 1, dark);
      p.set(cx + 3, y + 1, dark);
      break;
    case 'scared':
    case 'shock':
      p.rect(cx - 2, y - 2, 5, 6, dark);
      p.hline(cx - 2, cx + 2, y - 2, WHITE);
      p.rect(cx - 1, y + 2, 3, 1, 0xd85a6a);
      break;
    case 'surprised':
      p.rect(cx - 1, y - 1, 3, 4, dark);
      break;
    case 'angry':
      p.rect(cx - 4, y - 1, 9, 3, dark);
      p.hline(cx - 3, cx + 3, y, WHITE);
      break;
    case 'determined':
      p.hline(cx - 3, cx + 3, y, dark);
      p.set(cx + 3, y - 1, dark);
      break;
    case 'sheepish':
      p.hline(cx - 3, cx + 1, y, dark);
      p.set(cx + 2, y - 1, dark);
      p.set(cx + 3, y - 1, dark);
      break;
    case 'smug':
      p.hline(cx - 2, cx + 3, y, dark);
      p.set(cx + 4, y - 1, dark);
      p.set(cx + 4, y - 2, dark);
      break;
    case 'sleepy':
      p.rect(cx - 1, y, 3, 2, dark);
      break;
    default:
      p.hline(cx - 2, cx + 2, y, o.undead ? o.skin.dk : lip);
  }
}

function bust(p, spec) {
  const t = spec.top;
  const c = t.color;
  // shoulders
  p.poly([[6, 63], [12, 50], [24, 46], [40, 46], [52, 50], [58, 63]], c);
  if (t.type === 'sweater') {
    for (let x = 10; x < 56; x++) {
      const k = (x - 10) % 6;
      p.set(x, 54 + (k < 3 ? k : 6 - k), t.accent);
      p.set(x, 58, t.accent2);
    }
    p.rect(26, 46, 12, 3, shade(c, -0.15));
  } else if (t.type === 'plaid') {
    for (let y = 47; y < 64; y++) for (let x = 6; x < 58; x++) if (p.alpha(x, y) && ((x % 6) === 0 || (y % 6) === 0)) p.set(x, y, mix(c, t.accent, 0.6));
    p.poly([[26, 46], [32, 54], [38, 46]], 0xe8e0d0);
  } else if (t.type === 'cardigan') {
    p.poly([[26, 46], [32, 56], [38, 46]], t.accent);
    p.vline(32, 56, 63, shade(c, -0.25));
    p.set(30, 58, 0xf2c443);
    p.set(30, 62, 0xf2c443);
    p.rect(40, 52, 3, 3, 0xf2c443); // brooch
  } else if (t.type === 'serge') {
    p.rect(30, 48, 4, 16, shade(c, -0.15));
    for (const y of [52, 57, 62]) p.set(31, y, t.accent);
    p.rect(26, 46, 12, 3, 0x1e2440);
  } else if (t.type === 'robe') {
    p.poly([[4, 63], [10, 44], [54, 44], [60, 63]], c);
  } else if (t.type === 'labcoat') {
    p.poly([[24, 46], [32, 60], [40, 46]], 0x7aaac8);
    p.line(26, 47, 30, 58, t.accent);
    p.line(38, 47, 34, 58, t.accent);
    p.circle(32, 60, 1.6, 0xdadde4);
  } else if (t.type === 'vest') {
    p.rect(14, 50, 12, 14, t.accent);
    p.rect(38, 50, 12, 14, t.accent);
    p.hline(14, 25, 57, t.stripe);
    p.hline(38, 49, 57, t.stripe);
  } else if (t.type === 'raincoat') {
    p.poly([[24, 46], [32, 52], [40, 46]], t.accent);
    for (const y of [54, 59]) p.rect(33, y, 2, 2, INK);
  } else if (t.type === 'stripes') {
    for (let y = 48; y < 64; y += 3) for (let x = 6; x < 58; x++) if (p.alpha(x, y)) p.set(x, y, t.accent);
  } else if (t.type === 'jersey') {
    p.hline(10, 54, 52, t.accent);
    p.rect(28, 54, 8, 6, t.accent);
  }
  if (spec.apron) p.rect(22, 54, 20, 10, spec.apron.color);
}

function hairAndHat(p, spec, x0, y0, w, h, back) {
  const hc = spec.hair?.color;
  const st = spec.hair?.style;
  if (hc && back) {
    // hair behind the head
    if (st === 'bun') p.ellipse(32, y0 - 1, 9, 6, hc);
    if (st === 'curly') for (let k = 0; k < 9; k++) p.circle(x0 + k * 4.2, y0 + 4 + (k % 2) * 2, 4.2, hc);
    if (st === 'curly') { p.circle(x0 - 2, y0 + 16, 5, hc); p.circle(x0 + w + 2, y0 + 16, 5, hc); p.circle(x0 - 1, y0 + 24, 4, hc); p.circle(x0 + w + 1, y0 + 24, 4, hc); }
    if (st === 'braid') for (let k = 0; k < 5; k++) p.ellipse(x0 + w + 2, y0 + 20 + k * 5, 3, 3, k % 2 ? shade(hc, -0.15) : hc);
    if (st === 'pigtails') { p.ellipse(x0 - 4, y0 + 22, 4, 7, hc); p.ellipse(x0 + w + 4, y0 + 22, 4, 7, hc); }
    return;
  }
  if (hc) {
    switch (st) {
      case 'messy':
        p.rect(x0, y0, w, 7, hc);
        for (let k = 0; k < w; k += 3) p.poly([[x0 + k, y0 + 7], [x0 + k + 3, y0 + 7], [x0 + k + 1, y0 + 11]], hc);
        p.rect(x0 - 2, y0 + 3, 4, 14, hc);
        p.rect(x0 + w - 2, y0 + 3, 4, 14, hc);
        break;
      case 'short':
        p.rect(x0, y0, w, 6, hc);
        p.rect(x0 - 1, y0 + 2, 3, 10, hc);
        p.rect(x0 + w - 2, y0 + 2, 3, 10, hc);
        break;
      case 'bun':
        p.rect(x0, y0, w, 7, hc);
        p.rect(x0 - 2, y0 + 3, 4, 16, hc);
        p.rect(x0 + w - 2, y0 + 3, 4, 16, hc);
        for (let k = 0; k < w; k += 4) p.vline(x0 + k, y0 + 1, y0 + 5, shade(hc, -0.12));
        break;
      case 'curly':
        for (let k = 0; k < 9; k++) p.circle(x0 + 2 + k * 3.8, y0 + 2 + (k % 2), 3.6, hc);
        break;
      case 'braid':
        p.rect(x0, y0, w, 6, hc);
        p.rect(x0 - 2, y0 + 3, 4, 14, hc);
        p.rect(x0 + w - 2, y0 + 3, 4, 14, hc);
        p.line(x0 + 6, y0 + 1, x0 + w / 2, y0 + 5, shade(hc, -0.15));
        break;
      case 'curlers':
        p.rect(x0, y0, w, 7, hc);
        p.rect(x0 - 2, y0 + 3, 4, 14, hc);
        p.rect(x0 + w - 2, y0 + 3, 4, 14, hc);
        for (let k = 0; k < 4; k++) p.rect(x0 + 2 + k * 8, y0 - 3, 6, 4, spec.hair.curler);
        break;
      case 'pigtails':
        p.rect(x0, y0, w, 6, hc);
        break;
    }
  }
  const H = spec.hat;
  if (!H) return;
  const cx = x0 + w / 2;
  switch (H.type) {
    case 'toque':
      p.rect(x0 - 3, y0 - 8, w + 6, 12, H.color);
      p.ellipse(cx, y0 - 8, w / 2 + 2, 6, H.color);
      for (let k = 0; k < w + 6; k += 3) p.vline(x0 - 3 + k, y0 - 9, y0 + 2, shade(H.color, -0.15));
      p.rect(x0 - 4, y0 + 2, w + 8, 5, H.band);
      for (let k = 0; k < w + 8; k += 2) p.vline(x0 - 4 + k, y0 + 2, y0 + 6, shade(H.band, -0.1));
      p.circle(cx, y0 - 15, 5, H.pom);
      break;
    case 'trapper':
      p.ellipse(cx, y0 - 2, w / 2 + 3, 9, H.color);
      p.rect(x0 - 4, y0 + 2, w + 8, 5, H.fur);
      p.rect(x0 - 5, y0 + 4, 7, 18, H.fur);
      p.rect(x0 + w - 2, y0 + 4, 7, 18, H.fur);
      break;
    case 'campaign':
      p.rect(x0 - 12, y0 + 1, w + 24, 4, H.color);
      p.rect(x0 + 1, y0 - 12, w - 2, 14, H.color);
      p.rect(x0 + 1, y0 - 1, w - 2, 3, H.band);
      p.rect(cx - 2, y0 - 12, 4, 3, 0);
      for (let y = y0 - 12; y < y0 - 9; y++) for (let x = cx - 2; x < cx + 2; x++) p.data[p.idx(x, y) + 3] = 0;
      p.rect(cx - 6, y0 - 13, 3, 3, 0);
      break;
    case 'souwester':
      p.ellipse(cx, y0 - 1, w / 2 + 3, 9, H.color);
      p.rect(x0 - 8, y0 + 3, w + 16, 4, H.color);
      p.rect(x0 - 8, y0 + 6, 9, 12, H.color);
      p.rect(x0 + w - 1, y0 + 6, 9, 12, H.color);
      break;
    case 'hardhat':
      p.ellipse(cx, y0 - 1, w / 2 + 2, 10, H.color);
      p.rect(x0 - 6, y0 + 4, w + 12, 4, H.color);
      p.rect(cx - 2, y0 - 10, 4, 12, shade(H.color, 0.2));
      break;
    case 'captain':
      p.rect(x0 - 3, y0 - 8, w + 6, 10, H.top);
      p.rect(x0 - 3, y0 + 1, w + 6, 5, H.color);
      p.rect(x0 + 1, y0 + 6, w - 2, 3, INK);
      p.rect(cx - 2, y0 + 2, 4, 3, 0xf2c443);
      break;
    case 'beret':
      p.ellipse(cx + 3, y0 - 1, w / 2 + 5, 6, H.color);
      p.rect(cx + 3, y0 - 9, 2, 3, H.color);
      break;
  }
}

export function drawPortrait(p, ox, oy, id, expr = 'neutral') {
  const q = new Pix(S, S);
  if (id === 'cat') return catPortrait(p, ox, oy, expr);
  const spec = CHARACTERS[id] || CHARACTERS.hank;
  const skin = SKINS[spec.skin];
  const o = { skin, undead: spec.eyes === 'undead', iris: spec.skin === 'zombie' ? 0x8a2a22 : spec.eyes === 'skull' ? 0xff7a3a : 0x3a2a24 };
  const kid = spec.build === 'kid';
  const w = kid ? 30 : spec.build === 'huge' ? 36 : 32, h = kid ? 28 : 31;
  const x0 = 32 - w / 2, y0 = kid ? 16 : 12;
  bust(q, spec);
  // neck
  q.rect(27, y0 + h - 4, 10, 8, skin.sh);
  hairAndHat(q, spec, x0, y0, w, h, true);
  if (spec.hood) {
    q.ellipse(32, y0 + h / 2 + 1, w / 2 + 6, h / 2 + 8, spec.hood);
    q.ellipse(32, y0 + h / 2 + 3, w / 2 - 2, h / 2 - 1, 0x0e0a10);
  }
  // face
  q.ellipse(32, y0 + h / 2, w / 2, h / 2, skin.base);
  q.rect(x0 + 2, y0 + 4, w - 4, h - 10, skin.base);
  // jaw shading
  for (let x = x0 + 3; x < x0 + w - 3; x++) q.set(x, y0 + h - 2, skin.sh);
  // ears
  if (!spec.hood) {
    q.ellipse(x0 - 1, y0 + h / 2 + 1, 3, 4, skin.sh);
    q.ellipse(x0 + w + 1, y0 + h / 2 + 1, 3, 4, skin.sh);
  }
  const ey = y0 + Math.round(h * 0.45);
  const eL = 32 - 10, eR = 32 + 4;
  if (o.undead) {
    // tired dark rings under the eyes
    q.hline(eL, eL + 6, ey + 6, skin.dk);
    q.hline(eR - 1, eR + 6, ey + 6, skin.dk);
    q.hline(eL + 1, eL + 5, ey + 7, skin.sh);
    q.hline(eR, eR + 5, ey + 7, skin.sh);
  }
  if (spec.eyes === 'skull') {
    // skull: deep sockets with glowing pinpoints
    for (const ex of [eL, eR]) {
      q.ellipse(ex + 3, ey + 2, 4, 4, 0x1a1218);
      if (expr === 'happy' || expr === 'sheepish' || expr === 'laugh') q.hline(ex + 1, ex + 5, ey + 1, 0xff9a5a);
      else if (expr === 'scared' || expr === 'shock' || expr === 'surprised') q.circle(ex + 3, ey + 2, 1.2, 0xffb070);
      else q.rect(ex + 2, ey + 1, 2, 2, 0xff7a3a);
    }
    q.poly([[30, ey + 8], [34, ey + 8], [32, ey + 11]], 0x1a1218);
    // teeth
    const my = ey + 14;
    q.rect(25, my - 1, 14, 4, skin.sh);
    for (let x = 25; x < 39; x += 2) q.vline(x, my - 1, my + 2, 0x1a1218);
    if (expr === 'laugh' || expr === 'shock' || expr === 'scared') q.rect(26, my + 3, 12, 2, 0x1a1218);
  } else {
    eye(q, eL, ey, expr, -1, o);
    eye(q, eR, ey, expr, 1, o);
    if (o.undead && !['happy', 'laugh', 'love', 'sleepy', 'scared', 'shock', 'surprised'].includes(expr)) {
      // droopy right eyelid
      q.rect(eR, ey - 1, 6, 2, skin.sh);
      q.hline(eR, eR + 5, ey + 1, INK);
    }
    const bc = spec.beard?.color ?? spec.hair?.color ?? 0x5a3a2a;
    brows(q, eL - 1, eR, ey - 4, expr, shade(bc, -0.1), spec.brows === 'grumpy');
    // nose
    q.rect(31, ey + 7, 3, 3, skin.sh);
    q.set(31, ey + 7, skin.base);
    // cheeks
    if (['happy', 'laugh', 'love', 'sheepish'].includes(expr) || spec.skin === 'rosy') {
      q.rect(eL - 1, ey + 8, 4, 2, skin.cheek);
      q.rect(eR + 4, ey + 8, 4, 2, skin.cheek);
    }
    if (spec.id === 'marie' || spec.name === 'Marie-Claude' || spec.name === 'Pip' || spec.name === 'Pop') for (const [fx, fy] of [[eL + 1, ey + 9], [eL + 3, ey + 10], [eR + 3, ey + 9], [eR + 5, ey + 10]]) q.set(fx, fy, skin.dk);
  }
  // beard / mustache
  const my = ey + 14;
  if (spec.beard) {
    const bc = spec.beard.color;
    q.poly([[x0 + 1, ey + 6], [x0 + 5, y0 + h + 6], [32, y0 + h + 10], [x0 + w - 5, y0 + h + 6], [x0 + w - 1, ey + 6], [x0 + w - 5, my - 2], [37, my - 3], [27, my - 3], [x0 + 5, my - 2]], bc);
    for (let k = 0; k < 12; k++) q.set(x0 + 5 + k * 2, y0 + h + 3 + (k % 2) * 2, shade(bc, -0.2));
    q.hline(26, 38, my - 3, shade(bc, 0.1));
    q.rect(28, my - 1, 9, 3, skin.base);
  }
  if (spec.mustache) {
    q.rect(26, my - 3, 13, 3, spec.mustache);
    q.set(25, my - 1, spec.mustache);
    q.set(39, my - 1, spec.mustache);
  }
  if (spec.eyes !== 'skull') mouth(q, 32, my, expr, o);
  if (spec.glasses) {
    q.ring(eL + 3, ey + 2, 5, spec.glasses);
    q.ring(eR + 3, ey + 2, 5, spec.glasses);
    q.hline(eL + 8, eR - 2, ey + 1, spec.glasses);
    q.set(eL + 1, ey, 0xe8f4ff);
    q.set(eR + 1, ey, 0xe8f4ff);
  }
  if (spec.bandage) {
    q.rect(x0 + 4, y0 + 8, 7, 4, 0xf0e8d8);
    q.hline(x0 + 4, x0 + 10, y0 + 10, 0xc8b8a0);
    q.set(x0 + 7, y0 + 9, 0xd86a5a);
  }
  if (spec.pipe) {
    q.hline(36, 44, my + 1, 0x5a3420);
    q.rect(43, my - 3, 4, 5, 0x3a2414);
  }
  hairAndHat(q, spec, x0, y0, w, h, false);
  // sweat / tears / love bubbles
  if (expr === 'sheepish' || expr === 'scared' || expr === 'shock') {
    q.rect(x0 + w + 1, y0 + 6, 3, 4, 0x8ad0f0);
    q.set(x0 + w + 2, y0 + 4, 0x8ad0f0);
    q.set(x0 + w + 2, y0 + 5, 0x8ad0f0);
  }
  if (expr === 'angry') {
    // anger vein
    q.rect(x0 + w - 6, y0 + 2, 2, 5, 0xe0301e);
    q.rect(x0 + w - 8, y0 + 4, 6, 2, 0xe0301e);
  }
  // shade + outline
  const src = new Uint8ClampedArray(q.data);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (src[i + 3] < 255) continue;
    const right = x + 1 >= S || src[i + 7] === 0;
    const down = y + 1 >= S || src[i + S * 4 + 3] === 0;
    if (right || down) {
      const c = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      const n = shade(c, -0.18);
      q.data[i] = (n >> 16) & 255;
      q.data[i + 1] = (n >> 8) & 255;
      q.data[i + 2] = n & 255;
    }
  }
  q.outline(INK, { region: [0, 0, S, S] });
  p.blit(q, ox, oy);
}

function catPortrait(p, ox, oy, expr) {
  const q = new Pix(S, S);
  const fur = 0xe08a3a, dark = 0xb05e22, white = 0xf8f0e4;
  q.ellipse(32, 58, 22, 12, fur);
  q.ellipse(32, 36, 20, 17, fur);
  q.poly([[13, 30], [15, 10], [27, 22]], fur);
  q.poly([[37, 22], [49, 10], [51, 30]], fur);
  q.poly([[17, 26], [18, 15], [24, 22]], 0xf0a0a0);
  q.poly([[40, 22], [46, 15], [47, 26]], 0xf0a0a0);
  q.rect(46, 11, 3, 3, 0); // notch
  for (let y = 11; y < 14; y++) for (let x = 46; x < 49; x++) q.data[q.idx(x, y) + 3] = 0;
  q.ellipse(32, 44, 9, 7, white);
  q.ellipse(32, 58, 8, 8, white);
  for (const x of [26, 32, 38]) q.vline(x, 21, 25, dark);
  const ey = 33;
  for (const ex of [22, 37]) {
    if (expr === 'happy' || expr === 'love' || expr === 'laugh') { q.hline(ex, ex + 5, ey + 1, INK); q.set(ex - 1, ey + 2, INK); q.set(ex + 6, ey + 2, INK); }
    else if (expr === 'sleepy') q.hline(ex, ex + 5, ey + 2, INK);
    else {
      q.ellipse(ex + 2.5, ey + 1, 3.4, 3.4, 0x6ad050);
      q.rect(ex + 2, ey - 1, 2, expr === 'scared' ? 2 : 5, INK);
      q.set(ex + 1, ey - 1, WHITE);
    }
  }
  q.poly([[30, 40], [34, 40], [32, 42]], 0xe07080);
  if (expr === 'talk' || expr === 'surprised' || expr === 'scared') q.ellipse(32, 46, 2.6, 2.4, INK);
  else { q.line(32, 42, 29, 45, INK); q.line(32, 42, 35, 45, INK); }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) q.line(32 + s * 8, 42 + k, 32 + s * 18, 40 + k * 3, 0xf8f0e4);
  q.outline(INK, { region: [0, 0, S, S] });
  p.blit(q, ox, oy);
}

const cache = new Map();
export function portraitURL(id, expr = 'neutral') {
  const key = `${id}:${expr}`;
  if (cache.has(key)) return cache.get(key);
  const p = new Pix(S, S);
  drawPortrait(p, 0, 0, id, expr);
  const url = p.toDataURL();
  cache.set(key, url);
  return url;
}
