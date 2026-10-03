// The loading screen: plain black, with a little pixel-art Hank (toque, scarf,
// a mug of cocoa) running on the spot above a thin progress bar. It is one 2D
// canvas, drawn in a few hundred fillRects a frame, so it costs nothing while
// the world builds. (The file keeps its old name; main.js imports Loader3D.)

const TIPS = [
  'the cocoa is getting cold...',
  'reattaching femurs...',
  'stacking firewood...',
  'polishing skulls...',
  'warming the marshmallows...',
  'raking the maple leaves...',
  'waking up the lumberjack...',
];

const BONE = '#ecdfc6', BONE_D = '#b8a888', DARK = '#1a1014', TOQUE = '#d0402a', TOQUE_D = '#962a1c', POM = '#f4e8d0';
const SCARF = '#e0782a', SCARF_D = '#a8501c', MUG = '#3a6aa8', COCOA = '#6b3a22';
const W = 64, H = 64; // sprite canvas (art pixels)

export class Loader3D {
  constructor(pipeline) {
    this.pl = pipeline;
    this.p = 0;
    this.shown = 0;
    this.t = 0;
    this.running = false;
    this.tipI = 0;
    this.tipT = 0;
    this.last = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const root = document.createElement('div');
    root.id = 'loader3d';
    root.style.cssText = 'position:fixed;inset:0;z-index:150;background:#000;pointer-events:none;transition:none;';
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;';
    root.appendChild(c);
    document.body.appendChild(root);
    this.dom = root;
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.spr = document.createElement('canvas');
    this.spr.width = W;
    this.spr.height = H;
    this.sctx = this.spr.getContext('2d');
    this.resize = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.max(2, Math.round(window.innerWidth * dpr));
      c.height = Math.max(2, Math.round(window.innerHeight * dpr));
    };
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.frame(Math.min(0.05, (now - this.last) / 1000));
      this.last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.frame(0);
  }

  progress(p, label) {
    this.p = Math.max(this.p, p);
    // long synchronous build steps starve rAF; keep him running between them
    const now = performance.now();
    if (this.running && now - this.last > 50) {
      this.frame(Math.min(1 / 30, (now - this.last) / 1000));
      this.last = now;
    }
    void label;
  }

  // ---------------------------------------------------------------- drawing
  // a chunky line of art pixels between two joints
  bone(x0, y0, x1, y1, col, w = 2) {
    const g = this.sctx;
    g.fillStyle = col;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      g.fillRect(Math.round(x0 + (x1 - x0) * k - w / 2), Math.round(y0 + (y1 - y0) * k - w / 2), w, w);
    }
  }

  // two-segment limb: from (x,y), angles a1 then a2 (radians from straight down)
  limb(x, y, a1, l1, a2, l2, col) {
    const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
    const fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
    this.bone(x, y, kx, ky, col);
    this.bone(kx, ky, fx, fy, col);
    return [fx, fy];
  }

  drawHank(t) {
    const g = this.sctx;
    g.clearRect(0, 0, W, H);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const ph = t * 11; // stride phase
    const s = Math.sin(ph), c2 = Math.cos(ph);
    const bob = Math.abs(Math.cos(ph)) * 2.2; // up on each stride
    const hx = 30, hy = 38 - bob; // hips
    // ground shadow
    R(hx - 9 + bob * 0.5, 57, 18 - bob, 1, '#2a2024');
    // far leg and arm first (darker)
    this.limb(hx + 1, hy, -s * 0.8, 8, -s * 0.8 + Math.max(0, -c2) * 1.3 + 0.2, 9, BONE_D);
    this.limb(hx + 2, hy - 13, s * 0.9, 6, s * 0.9 - 1.4, 6, BONE_D);
    // spine and ribs
    this.bone(hx, hy, hx + 1.5, hy - 14, BONE, 2);
    for (let i = 0; i < 4; i++) {
      const y = hy - 12 + i * 2.6;
      const w = 9 - i;
      R(hx + 1.5 - w / 2, y, w, 1, i % 2 ? BONE_D : BONE);
    }
    R(hx - 3, hy - 1, 7, 2, BONE); // pelvis
    // near leg (striding opposite)
    const [fx, fy] = this.limb(hx, hy, s * 0.8, 8, s * 0.8 + Math.max(0, c2) * 1.3 + 0.2, 9, BONE);
    R(fx - 1, fy - 1, 4, 2, BONE); // foot
    // scarf: wrapped round the neck, the tail streaming out behind
    const ny = hy - 15;
    R(hx - 3, ny - 1, 9, 3, SCARF);
    R(hx - 3, ny + 1, 9, 1, SCARF_D);
    for (let i = 0; i < 11; i++) {
      const wav = Math.sin(t * 16 - i * 0.7) * (i * 0.22);
      R(hx - 4 - i, ny + i * 0.25 + wav, 2, 3, i % 3 === 2 ? SCARF_D : SCARF);
    }
    // skull: rocks a little with the stride
    const sx = hx - 4 + s * 0.6, sy = ny - 12 + Math.abs(s) * 0.5;
    R(sx, sy + 2, 12, 8, BONE);
    R(sx + 1, sy + 1, 10, 1, BONE);
    R(sx + 2, sy + 10, 8, 2, BONE); // jaw
    R(sx + 2, sy + 10, 8, 1, BONE_D);
    for (let i = 0; i < 4; i++) R(sx + 3 + i * 2, sy + 10, 1, 1, DARK); // teeth gaps
    // eye sockets (blink now and then), facing right, the way he runs
    const blink = (t % 3.1) < 0.12;
    if (blink) { R(sx + 5, sy + 6, 3, 1, DARK); R(sx + 9, sy + 6, 2, 1, DARK); }
    else {
      R(sx + 5, sy + 5, 3, 3, DARK); R(sx + 9, sy + 5, 2, 3, DARK);
      R(sx + 6, sy + 6, 1, 1, '#ffd060'); R(sx + 9, sy + 6, 1, 1, '#ffd060'); // a warm glint
    }
    R(sx + 8, sy + 8, 1, 2, DARK); // nose
    // toque with a bouncing pompom
    R(sx - 1, sy - 1, 14, 4, TOQUE);
    R(sx - 1, sy + 2, 14, 1, TOQUE_D);
    for (let i = 0; i < 7; i++) R(sx + i * 2, sy - 1, 1, 3, TOQUE_D); // ribbing
    R(sx + 1, sy - 4, 10, 3, TOQUE);
    R(sx + 3, sy - 6, 6, 2, TOQUE);
    const pb = Math.sin(ph + 1) * 1.2;
    R(sx + 1 - pb, sy - 9 + Math.abs(pb), 4, 4, POM);
    // near arm out in front, holding the mug steady
    const ax = hx + 2, ay = hy - 13;
    const [mx, my] = this.limb(ax, ay, -1.1 + s * 0.15, 6, -1.9 + s * 0.1, 5, BONE);
    R(mx, my - 4, 5, 6, MUG);
    R(mx + 5, my - 3, 1, 3, MUG);
    R(mx + 1, my - 4, 3, 1, COCOA);
    // steam curls
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.9 + i / 3) % 1;
      R(mx + 2 + Math.sin(k * 7 + i) * 1.5, my - 6 - k * 9, 1, 1, `rgba(255,244,224,${(0.7 * (1 - k)).toFixed(2)})`);
    }
  }

  frame(dt) {
    if (!this.running) return;
    this.t += dt;
    this.shown += (this.p - this.shown) * Math.min(1, dt * 6);
    this.tipT += dt;
    if (this.tipT > 2.6) { this.tipT = 0; this.tipI = (this.tipI + 1) % TIPS.length; }
    const c = this.canvas, g = this.ctx;
    const cw = c.width, ch = c.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, ch);
    this.drawHank(this.t);
    // whole-number scale keeps every art pixel square
    const sc = Math.max(2, Math.floor(Math.min(cw, ch * 1.4) / 260));
    g.imageSmoothingEnabled = false;
    const x = Math.round(cw / 2 - (W * sc) / 2), y = Math.round(ch / 2 - (H * sc) * 0.62);
    g.drawImage(this.spr, x, y, W * sc, H * sc);
    // the road dashes slipping past under him
    const gy = y + 58 * sc;
    g.fillStyle = '#3a2e30';
    const dash = 8 * sc, gap = 6 * sc, span = 56 * sc;
    const off = ((this.t * 60 * sc) % (dash + gap));
    for (let dx = -off; dx < span; dx += dash + gap) {
      const a = Math.max(0, dx), b = Math.min(span, dx + dash);
      if (b > a) g.fillRect(x + 4 * sc + a, gy, b - a, sc);
    }
    // thin progress bar
    const bw = Math.round(Math.min(cw * 0.5, 120 * sc)), bh = Math.max(2, Math.round(sc * 0.75));
    const bx = Math.round(cw / 2 - bw / 2), by = Math.round(gy + 10 * sc);
    g.fillStyle = '#2a2024';
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#f0a040';
    g.fillRect(bx, by, Math.round(bw * Math.min(1, this.shown)), bh);
    // tip line
    const fs = Math.max(10, Math.round(sc * 5));
    g.font = `${fs}px Monogram, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = '#8a7a70';
    g.fillText(TIPS[this.tipI], cw / 2, by + bh + sc * 4);
  }

  // fade the black away (the title fades itself in underneath)
  async finish(quick = false) {
    if (!this.running) return;
    this.p = 1;
    if (!quick) {
      const t0 = performance.now();
      await new Promise((r) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 350);
          this.dom.style.opacity = String(1 - k);
          if (k < 1) requestAnimationFrame(step);
          else r();
        };
        step();
      });
    }
    this.running = false;
    window.removeEventListener('resize', this.resize);
    this.dom.remove();
  }
}
