// Expressive 2D pixel faces painted onto the front of voxel heads.
// Every character instance owns a small RGBA DataTexture that is redrawn only
// when its expression, blink, gaze or talk frame changes.
// Alpha: 255 = lit paint, 128 = glowing paint (skull eye lights), 0 = see-through.
import * as THREE from 'three';

export const FPX = 5; // texture pixels per voxel

export const EXPRESSIONS = [
  'neutral', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'shock', 'scared', 'sheepish',
  'smug', 'love', 'determined', 'dizzy', 'wink', 'sleepy', 'worried', 'ko', 'sparkle', 'grumpy',
];

const INK = [30, 20, 26];
const WHITE = [255, 248, 236];
const BLUSH = [240, 120, 120];
const TEAR = [120, 190, 255];
const RED = [214, 50, 40];
const HEART = [255, 92, 140];
const GLOW = [255, 214, 140];

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
      this.eyes = [{ x: cx - gap, y: ey }, { x: cx + gap, y: ey }];
      this.mouth = { x: cx, y: this.H - (spec.face?.mouthY ?? (spec.beard ? 1.0 : spec.mustache ? 1.4 : 2.0)) * FPX };
    }
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
    if (this.skull) this.drawSkull(state.expr, blinkQ, lx, ly, anim);
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
      this.rect(x - th / 2, y - th / 2, th, th, c, a);
    }
  }
  // an arc (part of an ellipse outline); a0..a1 in radians, y down
  arc(cx, cy, rx, ry, a0, a1, c, th = 1, a) {
    const n = Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) * 1.5) + 2;
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      this.rect(cx + Math.cos(t) * rx - th / 2, cy + Math.sin(t) * ry - th / 2, th, th, c, a);
    }
  }
  heart(cx, cy, s, c, a) {
    this.oval(cx - s * 0.5, cy - s * 0.25, s * 0.55, s * 0.5, c, a);
    this.oval(cx + s * 0.5, cy - s * 0.25, s * 0.55, s * 0.5, c, a);
    for (let y = 0; y < s * 1.1; y++) this.rect(cx - s * 1.05 + y, cy - s * 0.1 + y, (s * 1.05 - y) * 2, 1, c, a);
  }
  spiral(cx, cy, r, c, phase, a) {
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const ang = t * Math.PI * 4 + phase;
      this.rect(cx + Math.cos(ang) * r * t - 0.5, cy + Math.sin(ang) * r * t - 0.5, 1.4, 1.4, c, a);
    }
  }
  sparkle(cx, cy, s, c, a) {
    this.rect(cx - 0.5, cy - s, 1.2, s * 2, c, a);
    this.rect(cx - s, cy - 0.5, s * 2, 1.2, c, a);
  }

  // ------------------------------------------------------------ human faces
  drawHuman(expr, blink, talk, lx, ly, anim) {
    const S = this.spec;
    const style = S.eyes || 'bean';
    const F = FPX;
    const [eL, eR] = this.eyes;
    const m = this.mouth;
    const big = style === 'round';
    const tiny = style === 'tiny';
    // blush first (under everything)
    const blushOn = S.blush || ['sheepish', 'love', 'laugh', 'happy'].includes(expr);
    if (blushOn) {
      const bc = expr === 'sheepish' || expr === 'love' ? [236, 96, 104] : BLUSH;
      for (const e of this.eyes) {
        const bx = e.x + (e === eL ? -F * 0.9 : F * 0.9), by = e.y + F * 1.6;
        this.oval(bx, by, F * 1.1, F * 0.55, bc);
        if (expr === 'sheepish') for (let k = -1; k <= 1; k++) this.line(bx + k * 3 - 1, by - 1, bx + k * 3 + 1, by + 1, [200, 70, 80]);
      }
    }
    const eyeW = big ? F * 1.0 : tiny ? F * 0.5 : F * 0.62;
    const eyeH = big ? F * 1.15 : tiny ? F * 0.6 : F * 0.95;
    const shut = (e, dir = 1) => this.arc(e.x, e.y + (dir > 0 ? F * 0.4 : -F * 0.2), eyeW * 1.3, F * 0.6, dir > 0 ? Math.PI * 1.1 : Math.PI * 0.1, dir > 0 ? Math.PI * 1.9 : Math.PI * 0.9, INK, 2);
    const open = (e, k = 1, pupilK = 1) => {
      if (big) {
        this.oval(e.x, e.y, eyeW * k + 1, eyeH * k + 1, INK);
        this.oval(e.x, e.y, eyeW * k, eyeH * k, WHITE);
        const pr = eyeW * 0.6 * pupilK;
        this.oval(e.x + lx * 1.2, e.y + ly + 1, pr, pr * 1.15, S.irisColor || [70, 110, 160]);
        this.oval(e.x + lx * 1.2, e.y + ly + 1, pr * 0.55, pr * 0.6, INK);
        this.rect(e.x + lx - pr * 0.6, e.y + ly - pr * 0.5, 2, 2, WHITE);
      } else {
        this.oval(e.x + lx * 0.6, e.y + ly * 0.6, eyeW * k, eyeH * k, INK);
        if (!tiny) {
          this.rect(e.x + lx * 0.6 - eyeW * 0.45, e.y + ly * 0.6 - eyeH * 0.55, 2, 2, WHITE);
          if (k >= 1) this.px(e.x + lx * 0.6 + eyeW * 0.25, e.y + ly * 0.6 + eyeH * 0.35, WHITE);
        }
      }
      if (style === 'lash') {
        const s = e === eL ? -1 : 1;
        this.line(e.x + s * eyeW * 0.6, e.y - eyeH * 0.6, e.x + s * (eyeW + 2), e.y - eyeH - 1, INK);
        this.line(e.x + s * eyeW * 0.1, e.y - eyeH * 0.9, e.x + s * eyeW * 0.4, e.y - eyeH - 2, INK);
      }
    };
    const brow = (e, tilt, lift = 0, thick = S.brows === 'bushy' ? 3 : 2) => {
      // tilt > 0 : inner end down (angry); tilt < 0 : inner end up (sad)
      const s = e === eL ? 1 : -1; // inner direction
      const y = e.y - eyeH - F * 0.8 - lift;
      const len = F * (S.brows === 'bushy' ? 1.2 : 0.9);
      this.line(e.x - s * len, y - tilt * F * 0.35, e.x + s * len, y + tilt * F * 0.35, S.hair?.color ? hexRGB(darken(S.hair.color, 0.35)) : INK, thick);
    };
    // ---- eyes per expression
    const both = (fn) => { fn(eL); fn(eR); };
    switch (expr) {
      case 'happy': case 'laugh':
        both((e) => shut(e, 1));
        both((e) => brow(e, -0.2, 2));
        break;
      case 'sad':
        both((e) => open(e, 0.85));
        both((e) => brow(e, -1, 0));
        break;
      case 'cry': {
        both((e) => shut(e, -1));
        both((e) => brow(e, -1.1, 0));
        const fl = anim;
        for (const e of this.eyes) for (let k = 0; k < 3; k++) {
          const yy = e.y + F * 0.6 + ((k * 5 + fl * 2) % 14);
          this.rect(e.x - 1, yy, 2, 3, TEAR);
        }
        break;
      }
      case 'angry': case 'grumpy':
        both((e) => open(e, expr === 'grumpy' ? 0.7 : 0.9));
        both((e) => brow(e, expr === 'grumpy' ? 0.6 : 1.2, -1, 3));
        if (expr === 'angry') {
          // anger vein on the forehead
          const vx = eR.x + F * 1.5, vy = F * 1.1;
          this.line(vx - 3, vy - 1, vx - 1, vy + 1, RED, 1); this.line(vx + 3, vy - 1, vx + 1, vy + 1, RED, 1);
          this.line(vx - 3, vy + 3, vx - 1, vy + 1, RED, 1); this.line(vx + 3, vy + 3, vx + 1, vy + 1, RED, 1);
        }
        break;
      case 'surprised':
        both((e) => open(e, 1.2));
        both((e) => brow(e, -0.3, 4));
        break;
      case 'shock': case 'scared':
        // white eyes with pinprick pupils
        both((e) => {
          this.oval(e.x, e.y, eyeW * 1.5 + 1, eyeH * 1.3 + 1, INK);
          this.oval(e.x, e.y, eyeW * 1.5, eyeH * 1.3, WHITE);
          const jitter = expr === 'scared' ? (anim % 2) - 0.5 : 0;
          this.rect(e.x - 1 + jitter + lx * 0.5, e.y - 1, 2, 2, INK);
        });
        both((e) => brow(e, expr === 'scared' ? -0.9 : -0.4, 5));
        if (expr === 'scared') this.rect(eR.x + F * 1.6, F * 0.6 + (anim % 2), 2, 4, TEAR); // sweat
        break;
      case 'sheepish':
        both((e) => shut(e, 1));
        both((e) => brow(e, -0.6, 2));
        this.rect(eR.x + F * 1.6, F * 0.8, 2, 4, TEAR);
        break;
      case 'smug':
        both((e) => {
          open(e, 0.85);
          this.rect(e.x - eyeW - 1, e.y - eyeH - 1, eyeW * 2 + 2, eyeH * 0.9, this.skinRGB); // heavy lids
          this.line(e.x - eyeW - 1, e.y - eyeH * 0.1, e.x + eyeW + 1, e.y - eyeH * 0.1, INK);
        });
        brow(eL, 0.2, 1); brow(eR, -0.5, 3);
        break;
      case 'love':
        both((e) => this.heart(e.x, e.y, F * 0.75 * (anim % 2 ? 1.1 : 1), HEART));
        both((e) => brow(e, -0.3, 3));
        break;
      case 'determined':
        both((e) => open(e, 0.95));
        both((e) => brow(e, 0.8, 0, 3));
        break;
      case 'dizzy':
        both((e) => this.spiral(e.x, e.y, F * 1.0, INK, anim * 1.5 * (e === eL ? 1 : -1)));
        break;
      case 'wink':
        open(eL, 1);
        shut(eR, 1);
        brow(eL, 0, 2); brow(eR, -0.3, 2);
        this.sparkle(eR.x + F * 1.9, eR.y - F * 1.2, 2, [255, 230, 120]);
        break;
      case 'sleepy':
        both((e) => this.line(e.x - eyeW * 1.2, e.y + 1, e.x + eyeW * 1.2, e.y + 1, INK, 2));
        break;
      case 'worried':
        both((e) => open(e, 0.9));
        both((e) => brow(e, -0.8, 2));
        this.rect(eR.x + F * 1.6, F * 0.6, 2, 4, TEAR);
        break;
      case 'ko':
        both((e) => { this.line(e.x - 3, e.y - 3, e.x + 3, e.y + 3, INK, 2); this.line(e.x + 3, e.y - 3, e.x - 3, e.y + 3, INK, 2); });
        break;
      case 'sparkle':
        both((e) => {
          open(e, 1.15);
          this.sparkle(e.x - 1, e.y - 2, 2, WHITE);
        });
        both((e) => brow(e, -0.2, 3));
        break;
      default:
        if (blink) both((e) => this.line(e.x - eyeW, e.y + 1, e.x + eyeW, e.y + 1, INK, 2));
        else both((e) => open(e, 1));
        both((e) => brow(e, 0, 0));
    }
    // ---- glasses on top of eyes
    if (S.glasses) {
      const gc = hexRGB(S.glassesColor ?? 0x3a2a2a);
      for (const e of this.eyes) {
        if (S.glasses === 'round') { this.ring(e.x, e.y, F * 1.35, F * 1.3, 1.2, gc); this.px(e.x - F * 0.6, e.y - F * 0.7, WHITE); }
        else if (S.glasses === 'square') { this.rectOutline(e.x - F * 1.3, e.y - F * 1.0, F * 2.6, F * 2.0, gc); this.line(e.x - F * 0.8, e.y - F * 0.5, e.x - F * 0.3, e.y - F * 0.8, WHITE); }
        else if (S.glasses === 'cateye') {
          this.ring(e.x, e.y, F * 1.3, F * 1.1, 1.2, gc);
          const s = e === eL ? -1 : 1;
          this.line(e.x + s * F * 1.1, e.y - F * 0.8, e.x + s * F * 1.8, e.y - F * 1.5, gc, 2);
        }
      }
      this.line(eL.x + F * 1.2, eL.y - 1, eR.x - F * 1.2, eR.y - 1, gc);
    }
    // ---- mouth
    if (!S.hideMouth) this.drawMouth(expr, talk, anim);
  }

  rectOutline(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
  }

  drawMouth(expr, talk, anim) {
    const F = FPX;
    const { x, y } = this.mouth;
    const MOUTH = [110, 36, 44], TONGUE = [230, 110, 110];
    const openM = (w, h, teeth = true) => {
      this.oval(x, y, w, h, INK);
      this.oval(x, y + 0.5, w - 1, h - 1, MOUTH);
      this.oval(x, y + h * 0.5, w * 0.55, h * 0.4, TONGUE);
      if (teeth && h > 2) this.rect(x - w * 0.6, y - h + 1, w * 1.2, 1.5, WHITE);
    };
    if (talk > 0 && !['cry', 'shock', 'scared', 'laugh'].includes(expr)) {
      const h = [0, 1.6, 2.6, 3.4][talk];
      openM(F * (0.75 + talk * 0.12), h, talk > 1);
      return;
    }
    switch (expr) {
      case 'happy': case 'wink': case 'love': case 'sparkle':
        openM(F * 1.0, F * 0.7);
        this.rect(x - F * 1.0, y - F * 0.7, F * 2.0, F * 0.5, this.skinRGB); // flat top -> D smile
        this.line(x - F * 1.0, y - F * 0.25, x + F * 1.0, y - F * 0.25, INK);
        break;
      case 'laugh':
        openM(F * 1.3, F * (anim % 2 ? 1.2 : 1.0));
        break;
      case 'sad': case 'grumpy':
        this.arc(x, y + F * 0.6, F * 0.9, F * 0.6, Math.PI * 1.15, Math.PI * 1.85, INK, 1.5);
        break;
      case 'cry':
        openM(F * 1.0, F * (0.7 + (anim % 2) * 0.2), false);
        break;
      case 'angry':
        this.rect(x - F * 1.0, y - F * 0.4, F * 2.0, F * 0.8, INK);
        this.rect(x - F * 0.9, y - F * 0.3, F * 1.8, F * 0.6, WHITE);
        for (let k = -2; k <= 2; k++) this.rect(x + k * F * 0.4, y - F * 0.3, 1, F * 0.6, [200, 190, 180]);
        break;
      case 'surprised':
        openM(F * 0.5, F * 0.6, false);
        break;
      case 'shock':
        openM(F * 0.9, F * 1.3);
        break;
      case 'scared':
        // wobbly zig-zag
        for (let k = 0; k < 6; k++) this.line(x - F + (k * F) / 3, y + (k % 2 ? 1 : -1), x - F + ((k + 1) * F) / 3, y + ((k + 1) % 2 ? 1 : -1), INK, 1.4);
        break;
      case 'sheepish': case 'worried':
        for (let k = 0; k < 4; k++) this.line(x - F * 0.8 + (k * F * 1.6) / 4, y + (k % 2 ? 0.8 : -0.8), x - F * 0.8 + ((k + 1) * F * 1.6) / 4, y + ((k + 1) % 2 ? 0.8 : -0.8), INK, 1.3);
        break;
      case 'smug':
        this.arc(x + F * 0.3, y - F * 0.3, F * 0.8, F * 0.5, Math.PI * 0.1, Math.PI * 0.8, INK, 1.5);
        break;
      case 'determined':
        this.line(x - F * 0.7, y, x + F * 0.7, y - 1, INK, 1.5);
        break;
      case 'dizzy':
        this.arc(x, y, F * 0.8, F * 0.4, 0, Math.PI * 2, INK, 1.2);
        break;
      case 'ko':
        openM(F * 0.6, F * 0.5, false);
        break;
      case 'sleepy':
        this.oval(x, y, F * 0.35, F * 0.35, INK);
        break;
      default:
        // a soft little smile
        this.arc(x, y - F * 0.5, F * 0.8, F * 0.55, Math.PI * 0.15, Math.PI * 0.85, INK, 1.5);
    }
  }

  // ------------------------------------------------------------ skull faces
  // The sockets are dark carved voxels; we paint glowing eye-lights into them and
  // "lids" in bone colour on top to shape the expression.
  drawSkull(expr, blink, lx, ly, anim) {
    const F = FPX;
    const bone = this.skinRGB;
    const lid = bone;
    const brow = hexRGB(darken(this.spec.skin, 0.34));
    const glow = this.spec.eyeGlow || GLOW;
    const r = this.eyeR;
    const [eL, eR] = this.eyes;
    const both = (fn) => { fn(eL, -1); fn(eR, 1); };
    const light = (e, k = 1, c = glow) => this.oval(e.x + lx * 0.8, e.y + ly * 0.7, r * 0.55 * k, r * 0.7 * k, c, 128);
    const happyArc = (e, c = glow) => this.arc(e.x, e.y + r * 0.45, r * 0.75, r * 0.7, Math.PI * 1.1, Math.PI * 1.9, c, 2, 128);
    const browLine = (e, s, tilt, lift = 0) => {
      // s: -1 left eye, 1 right; tilt > 0 angry (inner down)
      const y = e.y - r * 1.9 - lift;
      this.line(e.x - r * 0.9, y + (s > 0 ? -tilt : tilt) * 2.2, e.x + r * 0.9, y + (s > 0 ? tilt : -tilt) * 2.2, brow, 1.5);
    };
    switch (expr) {
      case 'happy': case 'laugh': case 'sheepish':
        both((e) => happyArc(e));
        both((e, s) => browLine(e, s, -0.3, 1));
        break;
      case 'sad': case 'cry': case 'worried':
        both((e, s) => {
          light(e, 0.9);
          // droopy lid over the outer top corner
          for (let k = 0; k < 4; k++) this.line(e.x + s * r * 1.2, e.y - r * 1.2 + k, e.x - s * r * 0.2, e.y - r * 1.2 + k - (3 - k) * 0.4, lid, 1);
          browLine(e, s, -0.9, 0);
        });
        if (expr === 'cry') for (const e of this.eyes) for (let k = 0; k < 3; k++) this.rect(e.x - 1, e.y + r + ((k * 5 + anim * 2) % 14), 2, 3, TEAR, 128);
        if (expr === 'worried') this.rect(eR.x + r * 1.6, 2, 2, 4, TEAR);
        break;
      case 'angry': case 'grumpy': case 'determined':
        both((e, s) => {
          light(e, 0.85, expr === 'angry' ? [255, 120, 80] : glow);
          // lid slanting down toward the nose
          for (let k = 0; k < 4; k++) this.line(e.x - s * r * 1.2, e.y - r * 1.2 + k + 2, e.x + s * r * 0.6, e.y - r * 1.2 + k - 1, lid, 1);
          browLine(e, s, 1, -1);
        });
        break;
      case 'surprised': case 'shock':
        both((e) => this.oval(e.x, e.y, r * 0.3, r * 0.3, [255, 250, 230], 128));
        both((e, s) => browLine(e, s, -0.2, 3));
        break;
      case 'scared':
        both((e) => this.oval(e.x + (anim % 2) - 0.5, e.y, r * 0.28, r * 0.32, [220, 240, 255], 128));
        both((e, s) => browLine(e, s, -0.9, 3));
        this.rect(eR.x + r * 1.5, 1 + (anim % 2), 2, 4, TEAR);
        break;
      case 'love':
        both((e) => this.heart(e.x, e.y, r * 0.6 * (anim % 2 ? 1.12 : 1), HEART, 128));
        break;
      case 'dizzy':
        both((e, s) => this.spiral(e.x, e.y, r * 0.9, glow, anim * 1.5 * s, 128));
        break;
      case 'wink':
        light(eL, 1);
        happyArc(eR);
        browLine(eL, -1, 0, 1);
        break;
      case 'sleepy':
        both((e) => {
          this.rect(e.x - r * 1.3, e.y - r * 1.4, r * 2.6, r * 1.4, lid);
          this.line(e.x - r * 0.9, e.y, e.x + r * 0.9, e.y, glow, 1.2, 128);
        });
        break;
      case 'ko':
        both((e) => { this.line(e.x - 3, e.y - 3, e.x + 3, e.y + 3, glow, 1.6, 128); this.line(e.x + 3, e.y - 3, e.x - 3, e.y + 3, glow, 1.6, 128); });
        break;
      case 'smug':
        both((e, s) => {
          light(e, 0.85);
          this.rect(e.x - r * 1.3, e.y - r * 1.4, r * 2.6, r * 1.1, lid);
        });
        browLine(eR, 1, -0.5, 2);
        break;
      case 'sparkle':
        both((e) => { light(e, 1.15); this.sparkle(e.x, e.y, 2, [255, 255, 255], 128); });
        break;
      default:
        if (blink) both((e) => this.rect(e.x - r * 1.3, e.y - r * 1.4, r * 2.6, r * 2.8, lid));
        else both((e) => light(e, 1));
        both((e, s) => browLine(e, s, 0, 0));
    }
  }
}

const ANIMATED = { cry: 8, scared: 14, love: 3, dizzy: 6, laugh: 7 };

export function hexRGB(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function darken(c, k) {
  const [r, g, b] = hexRGB(c);
  return ((Math.round(r * (1 - k)) << 16) | (Math.round(g * (1 - k)) << 8) | Math.round(b * (1 - k))) >>> 0;
}
