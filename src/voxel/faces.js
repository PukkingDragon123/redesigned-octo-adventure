// Expressive 2D pixel faces painted onto the front of voxel heads.
// Every character instance owns a small RGBA DataTexture that is redrawn only
// when its expression, blink, gaze or talk frame changes.
// Alpha: 255 = lit paint, 128 = glowing paint (skull eye lights), 0 = see-through.
//
// Art style: big glossy gem eyes (outline, two-tone iris, pupil, catchlights) whose
// upper and lower lids are clipped per expression, tapered brows with clear shapes,
// a small painted blush on every cheek, and hand-pixelled mouths. Everything is
// whole texture pixels (5 per voxel) with nearest filtering: crisp, never blurred.
import * as THREE from 'three';

export const FPX = 5; // texture pixels per voxel

export const EXPRESSIONS = [
  'neutral', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'shock', 'scared', 'sheepish',
  'smug', 'love', 'determined', 'dizzy', 'wink', 'sleepy', 'worried', 'ko', 'sparkle', 'grumpy',
  'excited', 'confused', 'pout', 'tongue', 'shy', 'awe', 'furious', 'giggle', 'yawn', 'proud',
];
// skulls have fewer muscles: the newer faces borrow the nearest skull face
const SKULL_ALIAS = { excited: 'sparkle', confused: 'worried', pout: 'grumpy', tongue: 'wink', shy: 'sheepish', awe: 'surprised', furious: 'angry', giggle: 'laugh', yawn: 'sleepy', proud: 'smug' };

const INK = [44, 24, 30]; // outlines: a deep plum-brown, softer than black
const PUPIL = [26, 14, 20];
const WHITE = [255, 250, 240];
const SCLERA = [250, 244, 236];
const BLUSH = [255, 112, 128];
const TEAR = [126, 196, 255];
const TEAR_D = [70, 130, 210];
const RED = [222, 48, 52];
const HEART = [255, 84, 132];
const HEART_D = [176, 30, 74];
const GLOW = [255, 206, 122];
const STAR = [255, 226, 96];
const GLOOM = [104, 96, 180];
const MOUTH = [118, 34, 50];
const TONGUE = [240, 118, 128];
const LIP = [214, 92, 110];

// eye colours, picked per character (or spec.irisColor)
const IRIS = [
  [104, 62, 36], [84, 52, 34], [112, 92, 44], [64, 108, 168], [58, 118, 84], [96, 104, 120], [70, 46, 34], [128, 80, 40],
];

// eye style -> base half-size in texture px, resting upper lid, iris tint
const EYE_STYLE = {
  bean: { w: 3.8, h: 4.5, top: 0 },
  lash: { w: 3.8, h: 4.5, top: 0, lash: true },
  round: { w: 4.2, h: 4.9, top: 0 },
  tiny: { w: 2.5, h: 3.4, top: 0.14, plain: true },
};

// ---------------------------------------------------------------- pixel sprites
// '.' = skip; letters index the palette below (the skin-relative ones resolve per face)
const PAL = {
  '#': INK, m: MOUTH, t: TONGUE, T: [196, 76, 92], w: WHITE, r: LIP, b: TEAR, B: TEAR_D, W: [255, 255, 255],
  h: HEART, H: HEART_D, y: STAR, Y: [220, 150, 40], R: RED, g: GLOOM, z: [70, 70, 110],
};
const spr = (s) => s.trim().split('\n').map((l) => l.trim());
const M = {
  smile: spr(`
    #.....#
    ##...##
    .#####.`),
  grin: spr(`
    #########
    #mmmmmmm#
    .#mmtmm#.
    ..#####..`),
  laugh0: spr(`
    ###########
    #mmmmmmmmm#
    #mmmmmmmmm#
    .#mmtttmm#.
    ..#######..`),
  laugh1: spr(`
    ###########
    #mmmmmmmmm#
    #mmmmmmmmm#
    #mmmmmmmmm#
    .#mmtttmm#.
    ..#######..`),
  frown: spr(`
    ..###..
    .#...#.
    #.....#`),
  grumpy: spr(`
    .#######.
    #.......#`),
  wail0: spr(`
    ..#####..
    .#mmmmm#.
    #mmmmmmm#
    #mmtttmm#
    .#######.`),
  wail1: spr(`
    ..#####..
    .#mmmmm#.
    #mmmmmmm#
    #mmmmmmm#
    #mmtttmm#
    .#######.`),
  grit: spr(`
    .#######.
    #wwwwwww#
    #mmmmmmm#
    #wwwwwww#
    .#######.`),
  shout: spr(`
    .#########.
    #wwwwwwwww#
    #mmmmmmmmm#
    #mmmtttmmm#
    #wwwwwwwww#
    .#########.`),
  o: spr(`
    .###.
    #mmm#
    #mmm#
    .###.`),
  bigO: spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #mmmmm#
    .#mmm#.
    ..###..`),
  shock: spr(`
    ..#####..
    .#wwwww#.
    #mmmmmmm#
    #mmmmmmm#
    #mmtttmm#
    .#mmmmm#.
    ..#####..`),
  wave: spr(`
    .##..##..##.
    #..##..##..#`),
  wobble: spr(`
    .##..##.
    #..##..#`),
  squiggle: spr(`
    .....##
    .####..
    #......`),
  smirk: spr(`
    .......#
    #.....#.
    .#####..`),
  cat: spr(`
    #..#..#
    .##.##.`),
  catOpen: spr(`
    #..#..#
    .#####.
    .#mmm#.
    ..###..`),
  firm: spr(`
    ########
    .......#`),
  tongue: spr(`
    #.......#
    .###T###.
    ...#tt#..
    ...#tt#..
    ....##...`),
  pout: spr(`
    .##.
    #rr#
    #rr#
    .##.`),
  yawn0: spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #mmmmm#
    #mmmmm#
    #mmtmm#
    .#####.`),
  yawn1: spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #mmmmm#
    #mmmmm#
    #mmmmm#
    #mmtmm#
    .#####.`),
  proud: spr(`
    #.......#
    ##.....##
    .#######.`),
  smallO: spr(`
    .##.
    #mm#
    .##.`),
  shy: spr(`
    #...#
    .###.`),
  sheepish: spr(`
    #.........#
    .##.###.##.
    ...#...#...`),
  // talking: per mood family, mouth open a little, more, most
  talkDef: [spr(`
    .###.
    #mmm#
    .###.`), spr(`
    .#####.
    #mmmmm#
    #mmtmm#
    .#####.`), spr(`
    .#####.
    #mmmmm#
    #mmmmm#
    #mtttm#
    .#####.`)],
  talkHappy: [spr(`
    #######
    #mmmmm#
    .#####.`), spr(`
    #########
    #mmmmmmm#
    #mmtttmm#
    .#######.`), spr(`
    #########
    #mmmmmmm#
    #mmmmmmm#
    #mmtttmm#
    .#######.`)],
  talkAngry: [spr(`
    #######
    #wwwww#
    #######`), spr(`
    #########
    #wwwwwww#
    #mmmmmmm#
    #wwwwwww#
    #########`), spr(`
    #########
    #wwwwwww#
    #mmmmmmm#
    #mmtttmm#
    #wwwwwww#
    #########`)],
  talkSad: [spr(`
    ..###..
    .#mmm#.
    #######`), spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #######`), spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #mmtmm#
    #######`)],
  talkO: [spr(`
    .##.
    #mm#
    .##.`), spr(`
    .###.
    #mmm#
    #mmm#
    .###.`), spr(`
    ..###..
    .#mmm#.
    #mmmmm#
    #mmtmm#
    .#mmm#.
    ..###..`)],
};
const FX = {
  heart: spr(`
    .HH.HH.
    HhhHhhH
    HhWhhhH
    HhhhhhH
    .HhhhH.
    ..HhH..
    ...H...`),
  spiral: spr(`
    #######
    ......#
    .####.#
    .#..#.#
    .#.##.#
    .#....#
    .######`),
  ko: spr(`
    ##...##
    .##.##.
    ..###..
    .##.##.
    ##...##`),
  squeeze: spr(`
    ##....
    .###..
    ...###
    .###..
    ##....`),
  star: spr(`
    ...y...
    ...y...
    ..yyy..
    yyyWyyy
    ..yyy..
    ...y...
    ...y...`),
  twinkle: spr(`
    .y.
    yWy
    .y.`),
  sweat: spr(`
    .B..
    .bB.
    bbbB
    bWbB
    .BB.`),
  vein: spr(`
    .R.R.
    RR.RR
    .....
    RR.RR
    .R.R.`),
  question: spr(`
    .###.
    #...#
    ....#
    ..##.
    ..#..
    .....
    ..#..`),
  zz: spr(`
    zzzz
    ..z.
    .z..
    zzzz`),
};

export class FaceTex {
  constructor(spec, rect) {
    this.spec = spec;
    this.wv = rect.x1 - rect.x0;
    this.hv = rect.y1 - rect.y0;
    this.W = Math.round(this.wv * FPX);
    this.H = Math.round(this.hv * FPX);
    this.data = new Uint8Array(this.W * this.H * 4);
    this.tex = new THREE.DataTexture(this.data, this.W, this.H, THREE.RGBAFormat);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.key = '';
    this.skinRGB = hexRGB(spec.skin);
    this.skull = spec.kind === 'skeleton' || spec.kind === 'reaper';
    this.frect = rect;
    // layout in texture px (y down from the top of the face rect)
    const cx = this.W / 2;
    if (this.skull) {
      // eye sockets are carved voxels; we paint lights inside them (see buildHead/skullHead)
      const sx = rect.sockets;
      this.eyes = sx.map((s) => ({ x: (s.x - rect.x0) * FPX, y: (rect.y1 - s.y) * FPX }));
      this.eyeR = FPX * 1.25;
    } else {
      const ey = this.H - (spec.face?.eyeY ?? 4.9) * FPX;
      const gap = (spec.face?.eyeGap ?? (this.wv >= 12 ? 2.6 : 2.3)) * FPX;
      this.eyes = [{ x: Math.round(cx - gap), y: Math.round(ey) }, { x: Math.round(cx + gap), y: Math.round(ey) }];
      this.mouth = { x: Math.round(cx), y: Math.round(this.H - (spec.face?.mouthY ?? (spec.beard ? 1.0 : spec.mustache ? 1.4 : 2.0)) * FPX) };
      // per-character colours
      const h = hashSpec(spec);
      this.iris = spec.irisColor || IRIS[h % IRIS.length];
      this.style = EYE_STYLE[spec.eyes] || EYE_STYLE.bean;
      const hc = spec.hair?.color != null && spec.hair.style !== 'bald' ? spec.hair.color : spec.beard?.color ?? spec.mustache ?? null;
      let bc = hc != null ? hexRGB(hc) : [96, 64, 48];
      const lum = (bc[0] * 0.3 + bc[1] * 0.59 + bc[2] * 0.11);
      bc = scale(bc, lum > 150 ? 0.5 : lum > 90 ? 0.62 : 0.75);
      if (lum < 40) bc = [34, 22, 24];
      this.browC = bc;
      this.blushK = spec.blush ? 0.5 : 0.32;
    }
    // sprite palette with this face's skin-relative colours
    this.pal = { ...PAL, s: this.skinRGB };
  }

  // state: { expr, blink 0..1, talk 0..1, look [-1..1, -1..1], t }
  update(state) {
    const blinkQ = state.blink > 0.5 ? 1 : 0;
    const talkQ = Math.round((state.talk || 0) * 3);
    const lx = Math.round((state.look?.[0] || 0) * 2), ly = Math.round((state.look?.[1] || 0) * 1.5);
    const anim = ANIMATED[state.expr] ? Math.floor((state.t || 0) * ANIMATED[state.expr]) % 4 : 0;
    const key = `${state.expr}|${blinkQ}|${talkQ}|${lx},${ly}|${anim}`;
    if (key === this.key) return;
    this.key = key;
    this.data.fill(0);
    if (this.skull) this.drawSkull(SKULL_ALIAS[state.expr] || state.expr, blinkQ, lx, ly, anim);
    else this.drawHuman(state.expr, blinkQ, talkQ, lx, ly, anim);
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------ pixel helpers (y down)
  px(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = ((this.H - 1 - y) * this.W + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  rect(x0, y0, w, h, c, a) {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) this.px(x, y, c, a);
  }
  oval(cx, cy, rx, ry, c, a) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, a);
      }
  }
  ring(cx, cy, rx, ry, th, c, a) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 1 && d >= 1 - th / Math.min(rx, ry)) this.px(x, y, c, a);
      }
  }
  line(x0, y0, x1, y1, c, th = 1, a) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x - th / 2), Math.round(y - th / 2), th, th, c, a);
    }
  }
  // a stroke along a quadratic curve p0 -> p2 bent toward p1, stamped on whole pixels
  curve(x0, y0, x1, y1, x2, y2, c, th = 2, a) {
    const n = Math.ceil(Math.abs(x2 - x0) + Math.abs(y2 - y0)) * 2 + 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * x1 + t * t * x2, y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      this.rect(Math.round(x - th / 2), Math.round(y - th / 2), th, th, c, a);
    }
  }
  // stamp a pixel sprite centred on cx with its top row at top
  sprite(rows, cx, top, flip = false, a = 255, mid = false) {
    const w = rows[0].length, x0 = Math.round(cx - w / 2), y0 = Math.round(mid ? top - rows.length / 2 : top);
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[flip ? r.length - 1 - i : i];
        if (ch === '.') continue;
        this.px(x0 + i, y0 + j, this.pal[ch] || INK, a);
      }
    }
  }
  rectOutline(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
  }

  // ------------------------------------------------------------ the eye
  // A gem-shaped eye clipped by an upper lid (top: 0..1 of its height, slant: px the
  // inner corner drops, + = cross, - = sad) and a smiling lower lid (bot: 0..1).
  // s: +1 when the eye's inner corner is toward +x (the viewer's-left eye).
  eye(e, s, o, lx, ly) {
    const st = this.style;
    const k = o.k ?? 1;
    const w = st.w * k, h = st.h * k;
    const top = o.top ?? st.top, slant = o.slant ?? 0, bot = o.bot ?? 0;
    const ex = e.x + (o.dx || 0) * s, ey = e.y + (o.dy || 0);
    const lidded = top > 0.1 || slant;
    const yTop = (x) => (lidded || top > 0 ? ey - h + 2 * h * top + slant * (((x - ex) * s) / w) - 0.5 : -1e9);
    const yBot = (x) => { const d = (x - ex) / w; return ey + h + 0.5 - 2 * h * bot * (1 - 0.25 * d * d); };
    const glowA = o.alpha ?? 255;
    const outline = o.outline !== false;
    const ox = ex + (o.lookOff ? lx * 0.7 : 0) + (o.pdx || 0) * s, oy = ey + (o.lookOff ? ly * 0.6 : 0) + (o.pdy || 0);
    const whites = o.whites, pk = o.pk ?? 1;
    const iris = o.iris || this.iris || GLOW;
    const irisD = mixRGB(scale(iris, 0.3), PUPIL, 0.5), irisL = mixRGB(iris, [255, 240, 220], 0.32);
    for (let y = Math.floor(ey - h - 3); y <= Math.ceil(ey + h + 2); y++) {
      for (let x = Math.floor(ex - w - 2); x <= Math.ceil(ex + w + 2); x++) {
        const cxp = x + 0.5, cyp = y + 0.5;
        const dx = (cxp - ex) / w, dy = (cyp - ey) / h;
        const din = dx * dx + dy * dy;
        // the outline is a heavier lash line over the top half
        const dxo = (cxp - ex) / (w + 1), dyo = (cyp - ey) / (cyp < ey ? h + 2 : h + 1);
        const dout = dxo * dxo + dyo * dyo;
        if (dout > 1) continue;
        const yt = yTop(cxp), yb = yBot(cxp);
        if (cyp < yt || cyp > yb) continue;
        // the upper lid edge is a heavy 2px lash line; the lower lid a 1px line
        const lidEdge = lidded && cyp < yt + 2;
        const botEdge = bot > 0.02 && cyp > yb - 1;
        if (din > 1 || lidEdge || botEdge) {
          if (outline) this.px(x, y, o.ink || INK, glowA);
          continue;
        }
        let c;
        if (o.fill) c = o.fill;
        else if (whites) {
          const ix = (cxp - ox) / (w * 0.5 * pk), iy = (cyp - oy) / (h * 0.5 * pk);
          const di = ix * ix + iy * iy;
          c = di <= 0.35 ? PUPIL : di <= 1 ? iris : SCLERA;
        } else {
          // chibi gem: dark up top, the iris colour glowing up from the bottom
          const rel = (cyp - (ey - h) - (o.lookOff ? ly * 0.4 : 0)) / (2 * h);
          if (st.plain && !o.iris) c = rel > 0.7 ? scale(iris, 0.75) : PUPIL;
          else c = rel < 0.5 ? irisD : rel < 0.78 ? iris : irisL;
          if (pk < 0.9 && rel < 0.78) {
            // tiny, cross pupils: the iris shows round a small dark dot
            const ix = (cxp - ox) / (w * 0.5 * pk), iy = (cyp - oy) / (h * 0.5 * pk);
            c = ix * ix + iy * iy <= 1 ? PUPIL : iris;
          }
        }
        this.px(x, y, c, glowA);
      }
    }
    // catchlights: a big one up by the lid, a small one low on the other side
    const vis = (x, y) => {
      const dx = (x + 0.5 - ex) / w, dy = (y + 0.5 - ey) / h;
      return dx * dx + dy * dy <= 1 && y + 0.5 >= yTop(x + 0.5) + (lidded ? 2 : 0) && y + 0.5 <= yBot(x + 0.5) - (bot > 0.02 ? 1 : 0);
    };
    if (o.hi !== false) {
      const big = o.hi === 'big' || k >= 1.15 || st.w > 3.5;
      const hx = Math.round(ox - w * 0.62), hy = Math.round(Math.max(oy - h * 0.6, yTop(ox) + 2));
      const hw = st.plain ? 1 : 2, hh = st.plain ? 2 : big ? 3 : 2;
      for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) if (vis(hx + i, hy + j)) this.px(hx + i, hy + j, WHITE, glowA);
      const sx = Math.round(ox + w * 0.35), sy = Math.round(oy + h * 0.4);
      if (!st.plain && vis(sx, sy)) this.px(sx, sy, WHITE, glowA);
      if (o.hi === 'star') this.sprite(FX.twinkle, ox + w * 0.2, oy - 0.5, false, glowA, true);
    }
    // lashes flick out from the outer top corner
    if (st.lash && outline && top < 0.5) {
      const lx0 = ex - s * w, ly0 = Math.max(ey - h * 0.55, yTop(ex - s * w) + 0.5);
      this.px(lx0 - s, ly0, INK, glowA); this.px(lx0 - s * 2, ly0 - 1, INK, glowA);
      this.px(lx0 - s, ly0 - 1, INK, glowA);
    }
  }
  // closed eyes: a lash line, flat with a slight droop ('down'), or a happy arch ('up')
  closedEye(e, s, kind, slant = 0) {
    const w = this.style.w + 1, x0 = e.x - w, x1 = e.x + w;
    if (kind === 'up') this.curve(x0, e.y + 2, e.x, e.y - 4.5, x1, e.y + 2, INK, 2);
    else if (kind === 'down') this.curve(x0, e.y - 0.5 + slant * -s, e.x, e.y + 3.5, x1, e.y - 0.5 + slant * s, INK, 2);
    else this.curve(x0, e.y + 1 - slant * s * 0.5, e.x, e.y + 2, x1, e.y + 1 + slant * s * 0.5, INK, 2);
    if (this.style.lash) { const ox = e.x - s * w; this.px(ox - s, e.y + (kind === 'up' ? 1 : 0), INK); }
  }

  // tilt > 0: inner end down (cross); tilt < 0: inner end up (sad); arch bends the middle up
  brow(e, s, b) {
    if (!b) return;
    const [tilt = 0, lift = 0, arch = 0.6] = b;
    const bushy = this.spec.brows === 'bushy';
    const len = bushy ? 4.5 : 3.8;
    const base = e.y - this.style.h - 4.2 - lift;
    const xo = e.x - s * len, xi = e.x + s * (len - 0.4);
    const yo = base - tilt * 1.1, yi = base + tilt * 1.9;
    const th = bushy ? 3 : 2;
    this.curve(xo, yo + 0.6, (xo + xi) / 2, (yo + yi) / 2 - arch * 2.2, xi, yi, this.browC, th);
    // a sharper inner tip on cross brows
    if (tilt > 0.6) this.px(xi + s, yi + 1, this.browC);
  }

  // ------------------------------------------------------------ human faces
  drawHuman(expr, blink, talk, lx, ly, anim) {
    const S = this.spec;
    const X = HUMAN[expr] || HUMAN.neutral;
    const [eL, eR] = this.eyes;
    // the furious face goes red from the forehead down (ordered dither: crisp, no blur)
    if (X.redface) {
      const yEnd = eL.y - 2;
      for (let y = 0; y < yEnd; y++) {
        const k = 1 - y / yEnd;
        for (let x = 0; x < this.W; x++) if (BAYER[(y & 3) * 4 + (x & 3)] < k * 1.1) this.px(x, y, mixRGB(this.skinRGB, [210, 50, 46], 0.55));
      }
    }
    if (X.gloom) {
      const yEnd = eL.y - this.style.h - 5;
      for (let i = 0; i < 4; i++) {
        const gx = this.W / 2 - 9 + i * 6;
        for (let y = 0; y < yEnd - (i % 2) * 2; y++) if ((y & 1) === 0 || y < yEnd * 0.6) this.px(gx, y, GLOOM);
      }
    }
    // blush: every cheek has a little, the mood decides how much
    const bl = X.blush || 0;
    {
      const kb = bl >= 2 ? 0.72 : bl === 1 ? Math.max(0.55, this.blushK + 0.15) : this.blushK;
      const bc = mixRGB(this.skinRGB, BLUSH, kb);
      const rx = bl >= 2 ? 3.6 : 3, ry = bl >= 2 ? 1.8 : 1.4;
      [eL, eR].forEach((e, i) => {
        const s = i === 0 ? 1 : -1;
        const bx = e.x - s * 1.6, by = e.y + this.style.h + 3.4;
        this.oval(bx, by, rx, ry, bc);
        if (bl >= 3) for (let k = -1; k <= 1; k++) { this.px(bx + k * 2 + 1, by - 1, mixRGB(bc, [170, 40, 60], 0.45)); this.px(bx + k * 2, by, mixRGB(bc, [170, 40, 60], 0.45)); }
      });
    }
    // eyes
    [eL, eR].forEach((e, i) => {
      const s = i === 0 ? 1 : -1;
      let E = (i === 0 ? X.eyeL : X.eyeR) || X.eye;
      if (blink && E.kind === 'open' && !E.noBlink) E = { kind: 'closed', slant: E.slant };
      switch (E.kind) {
        case 'open': this.eye(e, s, { ...E, lookOff: true }, lx + (E.lx || 0), ly + (E.ly || 0)); break;
        case 'closed': this.closedEye(e, s, 'flat', (E.slant || 0) * 0.5); break;
        case 'up': this.closedEye(e, s, 'up'); break;
        case 'down': this.closedEye(e, s, 'down'); break;
        case 'squeeze': this.sprite(FX.squeeze, e.x, e.y, s < 0, 255, true); break;
        case 'heart': {
          const big = anim % 2 ? 1 : 0;
          this.sprite(FX.heart, e.x, e.y - big, false, 255, true);
          if (big) { this.px(e.x - 4, e.y - 1, HEART_D); this.px(e.x + 4, e.y - 1, HEART_D); }
          break;
        }
        case 'spiral': this.sprite(FX.spiral, e.x, e.y, (anim + i) % 2 === 1, 255, true); break;
        case 'ko': this.sprite(FX.ko, e.x, e.y, false, 255, true); break;
        default: break;
      }
      this.brow(e, s, (i === 0 ? X.browL : X.browR) || X.brow);
    });
    // glasses on top of the eyes
    if (S.glasses) {
      const gc = hexRGB(S.glassesColor ?? 0x3a2a2a);
      const R = this.style.w + 3.2, RY = this.style.h + 2.2;
      [eL, eR].forEach((e, i) => {
        const s = i === 0 ? 1 : -1;
        if (S.glasses === 'square') this.rectOutline(Math.round(e.x - R), Math.round(e.y - RY + 0.5), Math.round(R * 2) + 1, Math.round(RY * 2), gc);
        else this.ring(e.x + 0.5, e.y + 0.5, R, RY, 1, gc);
        if (S.glasses === 'cateye') { this.line(e.x - s * (R - 1), e.y - RY + 1, e.x - s * (R + 1.5), e.y - RY - 1.5, gc, 2); }
        // a glint on the lens
        this.px(e.x + s * (R - 2.5), e.y - RY + 2.5, WHITE); this.px(e.x + s * (R - 3.5), e.y - RY + 3.5, WHITE);
      });
      this.line(eL.x + this.style.w + 3, eL.y - 1, eR.x - this.style.w - 3, eR.y - 1, gc);
    }
    // little extras around the face
    const fx = X.fx || [];
    const topY = eR.y - this.style.h - 6;
    for (const f of fx) {
      if (f === 'sweat') this.sprite(FX.sweat, eR.x + this.style.w + 5, topY + (anim % 2), false);
      else if (f === 'vein') this.sprite(FX.vein, eR.x + this.style.w + 4, topY - 1);
      else if (f === 'veins') { this.sprite(FX.vein, eR.x + this.style.w + 4, topY - 1); this.sprite(FX.vein, eL.x - this.style.w - 4, topY + 1); }
      else if (f === 'star') this.sprite(FX.star, eR.x + this.style.w + 5, topY - 1);
      else if (f === 'starL') this.sprite(FX.star, eL.x - this.style.w - 5, topY - 1);
      else if (f === 'question') this.sprite(FX.question, eR.x + this.style.w + 5, topY - 2);
      else if (f === 'zz') this.sprite(FX.zz, eR.x + this.style.w + 5, topY - 1 - (anim % 2));
      else if (f === 'tears' || f === 'tear') {
        const list = f === 'tears' ? [eL, eR] : [eR];
        for (const e of list) for (let k = 0; k < 3; k++) {
          const yy = e.y + 2 + ((k * 5 + anim * 2) % 14);
          this.rect(e.x - 1, yy, 2, 3, TEAR); this.px(e.x - 1, yy, WHITE);
        }
      } else if (f === 'teardrop') { const e = eR; this.sprite(FX.sweat, e.x + this.style.w + 1, e.y + 1); }
    }
    // mouth
    if (!S.hideMouth) this.drawMouth(expr, X, talk, anim);
  }

  drawMouth(expr, X, talk, anim) {
    const { x, y } = this.mouth;
    if (talk > 0 && X.talk) {
      this.sprite(M[X.talk][talk - 1], x, y - 1);
      return;
    }
    let m = X.mouth;
    if (Array.isArray(m)) m = m[anim % m.length];
    if (m) this.sprite(M[m], x + (X.mouthDx || 0), y - 1);
  }

  // ------------------------------------------------------------ skull faces
  // The sockets are dark carved voxels; we paint glowing eye-lights into them, shaped
  // by the same lid clipping as the living (so Hank's moods read the same way).
  drawSkull(expr, blink, lx, ly, anim) {
    const bone = this.skinRGB;
    const brow = hexRGB(darken(this.spec.skin, 0.34));
    const glow = this.spec.eyeGlow || GLOW;
    const core = mixRGB(glow, [255, 255, 240], 0.55);
    const r = this.eyeR;
    const [eL, eR] = this.eyes;
    this.style = { w: r * 0.6, h: r * 0.72, top: 0 };
    const both = (fn) => { fn(eL, 1); fn(eR, -1); };
    // a glowing gem: outer light, a hot core, a white catchlight
    const light = (e, s, o = {}) => {
      const c = o.c || glow;
      this.eye(e, s, { k: 1, outline: false, fill: c, alpha: 128, hi: false, top: 0, ...o }, lx, ly);
      if (o.core !== false) this.eye(e, s, { k: 0.55, outline: false, fill: o.coreC || core, alpha: 128, hi: false, top: o.top ? Math.min(0.9, o.top * 1.3) : 0, slant: (o.slant || 0) * 0.6, bot: o.bot, dy: o.dy }, lx, ly);
      if (o.hi !== false && !(o.top > 0.55)) this.rect(Math.round(e.x - 2 + lx * 0.8), Math.round(e.y - 2 + ly * 0.7 + (o.top || 0) * 5), 1, 2, [255, 255, 255], 128);
    };
    const happyArc = (e) => this.curve(e.x - r * 0.8, e.y + r * 0.45, e.x, e.y - r * 0.75, e.x + r * 0.8, e.y + r * 0.45, glow, 2, 128);
    const browLine = (e, s, tilt, lift = 0) => {
      // tilt > 0 cross (inner end down)
      const y = e.y - r * 1.9 - lift;
      const xo = e.x - s * r * 0.95, xi = e.x + s * r * 0.95;
      this.curve(xo, y - tilt * 1.2, (xo + xi) / 2, y - 1.2, xi, y + tilt * 2, brow, 2);
    };
    switch (expr) {
      case 'happy': case 'laugh': case 'sheepish':
        both((e) => happyArc(e));
        both((e, s) => browLine(e, s, -0.3, 1));
        break;
      case 'sad': case 'cry': case 'worried':
        both((e, s) => { light(e, s, { top: 0.28, slant: -3 }); browLine(e, s, -0.9, 0); });
        if (expr === 'cry') for (const e of this.eyes) for (let k = 0; k < 3; k++) this.rect(e.x - 1, e.y + r + ((k * 5 + anim * 2) % 14), 2, 3, TEAR, 128);
        if (expr === 'worried') this.sprite(FX.sweat, eR.x + r * 1.7, 1);
        break;
      case 'angry': case 'grumpy': case 'determined':
        both((e, s) => {
          light(e, s, { top: expr === 'grumpy' ? 0.4 : 0.3, slant: expr === 'determined' ? 2.5 : 4, c: expr === 'angry' ? [255, 110, 70] : glow, coreC: expr === 'angry' ? [255, 220, 170] : undefined });
          browLine(e, s, 1, -1);
        });
        break;
      case 'surprised': case 'shock':
        both((e) => { this.oval(e.x, e.y, r * 0.34, r * 0.34, [255, 250, 230], 128); this.px(e.x - 1, e.y - 1, [255, 255, 255], 128); });
        both((e, s) => browLine(e, s, -0.2, 3));
        break;
      case 'scared':
        both((e) => this.oval(e.x + (anim % 2) - 0.5, e.y, r * 0.28, r * 0.32, [220, 240, 255], 128));
        both((e, s) => browLine(e, s, -0.9, 3));
        this.sprite(FX.sweat, eR.x + r * 1.7, 1 + (anim % 2));
        break;
      case 'love':
        both((e) => this.sprite(FX.heart, e.x, e.y - (anim % 2), false, 128, true));
        break;
      case 'dizzy':
        this.pal['#'] = glow;
        both((e, s) => this.sprite(FX.spiral, e.x, e.y, (anim + (s > 0 ? 0 : 1)) % 2 === 1, 128, true));
        this.pal['#'] = INK;
        break;
      case 'wink':
        light(eL, 1);
        happyArc(eR);
        browLine(eL, 1, 0, 1);
        break;
      case 'sleepy':
        both((e) => this.curve(e.x - r * 0.9, e.y, e.x, e.y + 2.5, e.x + r * 0.9, e.y, glow, 1.5, 128));
        this.sprite(FX.zz, eR.x + r * 1.6, 0);
        break;
      case 'ko':
        both((e) => { this.line(e.x - 3, e.y - 3, e.x + 3, e.y + 3, glow, 2, 128); this.line(e.x + 3, e.y - 3, e.x - 3, e.y + 3, glow, 2, 128); });
        break;
      case 'smug':
        both((e, s) => light(e, s, { top: 0.48 }));
        browLine(eR, -1, -0.5, 2);
        break;
      case 'sparkle':
        both((e, s) => { light(e, s, { k: 1.12 }); this.sprite(FX.twinkle, e.x + 1, e.y, false, 128, true); });
        break;
      default:
        if (blink) both((e) => this.line(e.x - r * 0.8, e.y + 1, e.x + r * 0.8, e.y + 1, glow, 1.5, 128));
        else both((e, s) => light(e, s));
        both((e, s) => browLine(e, s, 0, 0));
    }
    void bone;
  }
}

// ---------------------------------------------------------------- expression sheet
// eye: { kind: open|closed|up|down|squeeze|heart|spiral|ko, top, slant, bot, k, pk, whites, hi, lx, ly }
// brow: [tilt, lift, arch]; blush 0..3; talk: which talking mouth family (null keeps the mouth still)
const O = (o = {}) => ({ kind: 'open', ...o });
const HUMAN = {
  neutral: { eye: O(), brow: [0, 0, 0.6], mouth: 'smile', talk: 'talkDef' },
  happy: { eye: O({ bot: 0.22, hi: 'big' }), brow: [-0.2, 1.5, 0.9], blush: 1, mouth: 'grin', talk: 'talkHappy' },
  laugh: { eye: { kind: 'up' }, brow: [-0.3, 2, 1], blush: 1, mouth: ['laugh0', 'laugh1'] },
  sad: { eye: O({ top: 0.24, slant: -2.6, hi: 'big' }), brow: [-1.1, 0.5, 0.2], mouth: 'frown', talk: 'talkSad' },
  cry: { eye: { kind: 'squeeze' }, brow: [-1.2, 0.5, 0.1], mouth: ['wail0', 'wail1'], fx: ['tears'] },
  angry: { eye: O({ top: 0.3, slant: 3.2, pk: 0.8 }), brow: [1.4, -0.5, 0.1], mouth: 'grit', talk: 'talkAngry', fx: ['vein'] },
  surprised: { eye: O({ k: 1.15, whites: true, pk: 0.9 }), brow: [-0.3, 3, 1.1], mouth: 'o', talk: 'talkO' },
  shock: { eye: O({ k: 1.3, whites: true, pk: 0.45, hi: false }), brow: [-0.5, 4, 1.2], mouth: 'shock', fx: ['gloom'], gloom: true },
  scared: { eye: O({ k: 1.2, whites: true, pk: 0.55, hi: false, lx: 0 }), brow: [-1.2, 3, 0.4], mouth: 'wave', fx: ['sweat'], gloom: true },
  sheepish: { eye: { kind: 'up' }, brow: [-0.8, 1.5, 0.4], blush: 3, mouth: 'sheepish', talk: 'talkSad', fx: ['sweat'] },
  smug: { eye: O({ top: 0.5, lx: 1 }), browL: [0.3, 0, 0.4], browR: [-0.6, 2.5, 1.2], blush: 1, mouth: 'smirk', talk: 'talkDef' },
  love: { eye: { kind: 'heart' }, brow: [-0.4, 2.5, 1], blush: 2, mouth: 'grin', talk: 'talkHappy' },
  determined: { eye: O({ top: 0.26, slant: 2.2, hi: 'star' }), brow: [1, -0.5, 0.3], mouth: 'firm', talk: 'talkAngry' },
  dizzy: { eye: { kind: 'spiral' }, brow: [-0.8, 1, 0.4], mouth: 'wobble' },
  wink: { eyeL: O({ bot: 0.25 }), eyeR: { kind: 'up' }, browL: [0, 1.5, 0.8], browR: [-0.3, 1, 0.8], blush: 1, mouth: 'grin', talk: 'talkHappy', fx: ['star'] },
  sleepy: { eye: { kind: 'down' }, brow: [-0.3, -0.5, 0.3], mouth: 'smallO', fx: ['zz'] },
  worried: { eye: O({ top: 0.14, slant: -2.2 }), brow: [-1.1, 1.5, 0.3], mouth: 'wobble', talk: 'talkSad', fx: ['sweat'] },
  ko: { eye: { kind: 'ko' }, brow: [-0.5, 1, 0.3], mouth: 'smallO' },
  sparkle: { eye: O({ k: 1.12, hi: 'star' }), brow: [-0.2, 2.5, 1], blush: 1, mouth: 'grin', talk: 'talkHappy' },
  grumpy: { eye: O({ top: 0.45, slant: 1.2 }), brow: [0.8, -1, 0.1], mouth: 'grumpy', talk: 'talkAngry' },
  excited: { eye: O({ k: 1.22, hi: 'star', bot: 0.12 }), brow: [-0.3, 3.5, 1.2], blush: 1, mouth: ['laugh0', 'laugh1'], talk: 'talkHappy', fx: ['star', 'starL'] },
  confused: { eyeL: O({ top: 0.32, k: 0.9 }), eyeR: O({ k: 1.12 }), browL: [0.9, -0.5, 0.2], browR: [-0.4, 3, 1.2], mouth: 'squiggle', talk: 'talkSad', fx: ['question'] },
  pout: { eye: O({ top: 0.2, slant: 1.6, ly: 0 }), brow: [0.9, 0, 0.2], blush: 2, mouth: 'pout', talk: 'talkAngry' },
  tongue: { eyeL: { kind: 'up' }, eyeR: O({ k: 1.08 }), browL: [-0.3, 1.5, 0.8], browR: [-0.4, 2.5, 1], blush: 1, mouth: 'tongue', talk: 'talkHappy' },
  shy: { eye: O({ top: 0.3, lx: -1, ly: 1 }), brow: [-0.9, 0.5, 0.3], blush: 3, mouth: 'shy', talk: 'talkSad' },
  awe: { eye: O({ k: 1.3, pk: 1.15, hi: 'star' }), brow: [-0.5, 3.5, 1.2], blush: 1, mouth: 'bigO', talk: 'talkO' },
  furious: { eye: O({ top: 0.36, slant: 3.6, pk: 0.6, iris: [200, 40, 40] }), brow: [1.8, -2, 0], mouth: 'shout', talk: 'talkAngry', fx: ['veins'], redface: true },
  giggle: { eye: { kind: 'up' }, brow: [-0.4, 2, 1], blush: 2, mouth: ['cat', 'catOpen'] },
  yawn: { eye: { kind: 'squeeze' }, brow: [-0.6, 2, 0.6], mouth: ['yawn0', 'yawn1'], fx: ['teardrop'] },
  proud: { eye: { kind: 'up' }, brow: [-0.4, 3, 1.1], blush: 1, mouth: 'proud', talk: 'talkHappy', fx: ['starL'] },
};
for (const k in HUMAN) if (HUMAN[k].gloom) HUMAN[k].fx = HUMAN[k].fx.filter((f) => f !== 'gloom');

const ANIMATED = { cry: 8, scared: 14, love: 3, dizzy: 6, laugh: 7, excited: 6, giggle: 9, yawn: 2 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function hexRGB(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function darken(c, k) {
  const [r, g, b] = hexRGB(c);
  return ((Math.round(r * (1 - k)) << 16) | (Math.round(g * (1 - k)) << 8) | Math.round(b * (1 - k))) >>> 0;
}
function scale(c, k) { return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]; }
function mixRGB(a, b, k) { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]; }
function hashSpec(s) {
  const str = `${s.name}|${s.skin}|${s.hair?.color}|${s.hair?.style}|${s.eyes}|${s.torso?.w}|${s.torso?.h}|${s.top?.color}|${s.hat?.color}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
