// Hank's journal as a real book held up in front of his face (src/ui/view3d.js draws it):
// leather-bound boards with tooled gold borders and brass corners, two page blocks
// that dip into the gutter and roll off at the fore-edge (their edges show the stacked
// sheets), a satin ribbon hanging out of the bottom, leather index tabs between the
// pages, a page that turns over when the section changes, and his two bony hands
// holding it by the bottom corners.
//
// It rises from his lap closed, the left hand swings the front cover open, and it
// settles flat and square to the eye at exactly the size of the page boxes the menus
// are laid out in (src/ui/book.js), so the menu pages sit on the paper pixel for pixel
// and the pixel fonts stay crisp. quad() says where each page is on screen.
import * as THREE from 'three';
import { BonyHand } from './hands3d.js';
import { ease } from './view3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- textures (painted in code)
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// cream paper: fibres, a few foxing spots, darker and warmer into the gutter (u = 0)
function paperTexture() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#f4e8cc';
  g.fillRect(0, 0, 512, 512);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 512, y = r() * 512, l = 2 + r() * 7, a = r() * Math.PI;
    g.strokeStyle = r() < 0.5 ? 'rgba(150,120,80,0.06)' : 'rgba(255,255,240,0.08)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = r() * 512, y = r() * 512, rr = 2 + r() * 6;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(170,120,60,0.16)');
    gr.addColorStop(1, 'rgba(170,120,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // into the gutter
  const gu = g.createLinearGradient(0, 0, 90, 0);
  gu.addColorStop(0, 'rgba(110,70,30,0.32)');
  gu.addColorStop(0.35, 'rgba(140,100,50,0.1)');
  gu.addColorStop(1, 'rgba(140,100,50,0)');
  g.fillStyle = gu;
  g.fillRect(0, 0, 90, 512);
  // a little aged at the fore-edge and the corners
  const fe = g.createLinearGradient(512, 0, 470, 0);
  fe.addColorStop(0, 'rgba(160,110,50,0.16)');
  fe.addColorStop(1, 'rgba(160,110,50,0)');
  g.fillStyle = fe;
  g.fillRect(470, 0, 42, 512);
  return tex(c);
}
// the edges of a block of pages: fine sheets stacked along v
function edgeTexture() {
  const c = canvas(16, 256), g = c.getContext('2d');
  const r = rng(3);
  for (let y = 0; y < 256; y++) {
    const k = 0.82 + r() * 0.16 - (y % 3 === 0 ? 0.08 : 0);
    g.fillStyle = `rgb(${Math.round(236 * k)},${Math.round(222 * k)},${Math.round(190 * k)})`;
    g.fillRect(0, y, 16, 1);
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
// leather: mottled oxblood-brown, a fine grain, worn lighter at the edges; tooled with a
// blind groove and a gold rule round the border. front: the title and a little emblem
function leatherTexture(w, h, { front = false, title = '', sub = '' } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#5e2c1a';
  g.fillRect(0, 0, w, h);
  const r = rng(front ? 11 : 5);
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, rr = 8 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const d = r() < 0.5;
    gr.addColorStop(0, d ? 'rgba(40,14,8,0.22)' : 'rgba(140,72,40,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < w * h * 0.05; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(20,6,4,0.18)' : 'rgba(170,100,70,0.12)';
    g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1);
  }
  // worn edges
  const edge = 18;
  for (const [x0, y0, x1, y1] of [[0, 0, edge, 0], [w, 0, w - edge, 0], [0, 0, 0, edge], [0, h, 0, h - edge]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(150,90,60,0.35)');
    gr.addColorStop(1, 'rgba(150,90,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  // tooling
  const m = Math.round(w * 0.06);
  g.strokeStyle = 'rgba(25,8,4,0.55)';
  g.lineWidth = 3;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.strokeStyle = '#d8a83a';
  g.lineWidth = 2;
  g.strokeRect(m + 7, m + 7, w - m * 2 - 14, h - m * 2 - 14);
  g.lineWidth = 1;
  g.strokeRect(m + 12, m + 12, w - m * 2 - 24, h - m * 2 - 24);
  // little gold fleurons in the border's corners
  g.fillStyle = '#e0b448';
  for (const [x, y] of [[m + 7, m + 7], [w - m - 7, m + 7], [m + 7, h - m - 7], [w - m - 7, h - m - 7]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  if (front) {
    const cx = w / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const gold = (txt, y, px, font = 'BoldPixels') => {
      g.font = `${px}px ${font}, monospace`;
      g.fillStyle = 'rgba(20,6,2,0.6)';
      g.fillText(txt, cx + 2, y + 3);
      g.fillStyle = '#e8bc4c';
      g.fillText(txt, cx, y);
      g.fillStyle = 'rgba(255,240,180,0.55)';
      g.fillText(txt, cx - 1, y - 1);
    };
    gold(title, h * 0.3, Math.round(w * 0.11));
    if (sub) gold(sub, h * 0.3 + w * 0.12, Math.round(w * 0.065), 'Monogram');
    // the emblem: a skull over a steaming mug, in gold
    const ey = h * 0.62, s = w * 0.0042;
    g.save();
    g.translate(cx, ey);
    g.scale(s, s);
    g.fillStyle = '#e0b448';
    g.strokeStyle = '#e0b448';
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, -22, 26, Math.PI, 0); g.lineTo(18, 6); g.lineTo(-18, 6); g.closePath(); g.fill();
    g.fillStyle = '#5e2c1a';
    g.beginPath(); g.arc(-10, -18, 7, 0, Math.PI * 2); g.arc(10, -18, 7, 0, Math.PI * 2); g.fill();
    g.fillRect(-2, -8, 4, 6);
    g.fillStyle = '#e0b448';
    g.fillRect(-12, 6, 24, 8);
    g.fillStyle = '#5e2c1a';
    for (let i = -8; i <= 8; i += 6) g.fillRect(i, 6, 2, 8);
    g.fillStyle = '#e0b448';
    g.fillRect(-26, 30, 40, 34);
    g.beginPath(); g.arc(18, 46, 11, -Math.PI / 2, Math.PI / 2); g.stroke();
    for (const x of [-16, -6, 4]) { g.beginPath(); g.moveTo(x, 24); g.bezierCurveTo(x - 6, 18, x + 6, 14, x, 8); g.stroke(); }
    g.restore();
  }
  return c;
}
// a grain bump map for the leather
let GRAIN = null;
function grainTexture() {
  if (GRAIN) return GRAIN;
  const c = canvas(256, 256), g = c.getContext('2d');
  const r = rng(9);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)';
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  GRAIN = tex(c, false);
  GRAIN.wrapS = GRAIN.wrapT = THREE.RepeatWrapping;
  GRAIN.repeat.set(3, 4);
  return GRAIN;
}

// ---------------------------------------------------------------- geometry
// One block of pages (the right one; the left is its mirror): x from 0 (the gutter) to W,
// y over the page height, z from the board (c) up to the paper, which dips into the
// gutter and rolls off over the fore-edge. Groups: 0 paper, 1 sheet edges.
function pageBlockGeo(W, H, c, t, gw, fe) {
  const T = c + t;
  const zt = (x) => {
    let z = T;
    if (x < gw) z -= t * 0.6 * (1 - x / gw) ** 2;
    if (x > W - fe) z -= t * 0.32 * ((x - (W - fe)) / fe) ** 2;
    return z;
  };
  const dz = (x) => (zt(x + 1e-4) - zt(x - 1e-4)) / 2e-4;
  const P = [], N = [], U = [], I = [];
  const xs = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    // more samples where it bends
    const s = i / n;
    xs.push(W * (s < 0.5 ? 0.5 * Math.pow(s * 2, 1.6) : 1 - 0.5 * Math.pow((1 - s) * 2, 1.6)));
  }
  const quad = (a, b, cc, d) => I.push(a, b, cc, a, cc, d);
  // paper
  for (const x of xs) {
    const z = zt(x), d = dz(x), l = Math.hypot(d, 1);
    for (const y of [-H / 2, H / 2]) {
      P.push(x, y, z);
      N.push(-d / l, 0, 1 / l);
      U.push(x / W, y / H + 0.5);
    }
  }
  for (let i = 0; i < n; i++) quad(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1);
  const paperCount = I.length;
  // the fore-edge (x = W)
  let b = P.length / 3;
  for (const [y, z] of [[-H / 2, c], [H / 2, c], [H / 2, zt(W)], [-H / 2, zt(W)]]) {
    P.push(W, y, z);
    N.push(1, 0, 0);
    U.push(y / H + 0.5, (z - c) / t);
  }
  quad(b, b + 1, b + 2, b + 3);
  // the head and tail edges (y = +-H/2)
  for (const sy of [1, -1]) {
    b = P.length / 3;
    for (const x of xs) {
      P.push(x, (sy * H) / 2, c, x, (sy * H) / 2, zt(x));
      N.push(0, sy, 0, 0, sy, 0);
      U.push(x / W * 8, 0, x / W * 8, (zt(x) - c) / t);
    }
    for (let i = 0; i < n; i++) {
      const a = b + i * 2;
      if (sy > 0) quad(a, a + 1, a + 3, a + 2);
      else quad(a, a + 2, a + 3, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.addGroup(0, paperCount, 0);
  g.addGroup(paperCount, I.length - paperCount, 1);
  return g;
}

const TAB_COLORS = [0x7a2a1c, 0x2e5a3c, 0x2e4470, 0x9a6a22, 0x5a2e52, 0x2a5a58, 0x6a3e22, 0x44404c, 0x843240, 0x3a5a26];

// ---------------------------------------------------------------- the book
export class Book3D {
  constructor(view) {
    this.view = view;
    this.root = new THREE.Group();
    this.root.visible = false;
    view.scene.add(this.root);
    view.held.push(this);
    this.lift = 0; // 0 in his lap .. 1 held up
    this.open = 0; // 0 shut .. 1 open
    this.want = 0;
    this.flip = null; // { t, dir, mid, done, midFired }
    this.tabCount = 0;
    this.tabActive = -1;
    this.tabOut = [];
    this.time = 0;
    this.lay = null;
    this.mats();
    this.hands();
  }
  mats() {
    this.paperMat = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.92, metalness: 0 });
    this.edgeMat = new THREE.MeshStandardMaterial({ map: edgeTexture(), roughness: 0.95 });
    this.sheetMat = new THREE.MeshStandardMaterial({ map: this.paperMat.map, roughness: 0.92, side: THREE.DoubleSide });
    const grain = grainTexture();
    const backC = leatherTexture(256, 352);
    this.leather = new THREE.MeshStandardMaterial({ map: tex(backC), bumpMap: grain, bumpScale: 0.6, roughness: 0.62, metalness: 0.02 });
    this.leatherEdge = new THREE.MeshStandardMaterial({ color: 0x4e2414, bumpMap: grain, bumpScale: 0.4, roughness: 0.7 });
    this.endpaper = new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.85 });
    this.frontC = leatherTexture(512, 704, { front: true, title: "HANK'S", sub: 'journal' });
    this.front = new THREE.MeshStandardMaterial({ map: tex(this.frontC), bumpMap: grain, bumpScale: 0.6, roughness: 0.58, metalness: 0.04 });
    // repaint the title once the pixel fonts are in
    document.fonts?.load?.('40px BoldPixels').then(() => document.fonts.load('30px Monogram')).then(() => {
      const c2 = leatherTexture(512, 704, { front: true, title: "HANK'S", sub: 'journal' });
      this.front.map.image = c2;
      this.front.map.needsUpdate = true;
    }).catch(() => {});
    this.brass = new THREE.MeshStandardMaterial({ color: 0xc8963a, roughness: 0.32, metalness: 0.85 });
    this.ribbonMat = new THREE.MeshStandardMaterial({ color: 0xa8201c, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide });
    this.tabMats = TAB_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, bumpMap: grain, bumpScale: 0.3 }));
  }
  hands() {
    this.handR = new BonyHand();
    this.handL = new BonyHand({ left: true });
    // holding the bottom corners from behind, the thumbs over the front onto the paper
    // (the fingers lie flat up the back board; the thumb comes up round the bottom edge
    // and rests on the paper pointing in towards the gutter)
    const grip = { curl: [[0.08, 0.06, 0.04], [0.06, 0.06, 0.04], [0.08, 0.08, 0.05], [0.12, 0.1, 0.06]], thumb: [0.85, Math.PI, -0.6, 0.5, 0.4], wrist: [-0.9, 0.1] };
    this.handR.pose(grip);
    this.handL.pose(grip);
  }
  // build the book for a page shape: pw, ph = the flat writing area of one page (m)
  build(pw, ph) {
    const key = `${pw.toFixed(4)}|${ph.toFixed(4)}`;
    if (this.key === key) return;
    this.key = key;
    if (this.body) {
      this.root.remove(this.body);
      this.body.traverse((o) => o.geometry && !o.userData.keep && o.geometry.dispose());
    }
    const c = 0.0032, t = 0.0105, gw = pw * 0.07, fe = 0.006, ov = 0.0045;
    const W = pw + gw + fe, H = ph + 0.016, T = c + t;
    Object.assign(this, { c, t, gw, fe, ov, W, H, T, pw, ph });
    const body = (this.body = new THREE.Group());
    this.root.add(body);
    // the right half: back board + pages
    const right = new THREE.Group();
    body.add(right);
    const boardGeo = new THREE.BoxGeometry(W + ov, H + ov * 2, c);
    const back = new THREE.Mesh(boardGeo, [this.leatherEdge, this.leatherEdge, this.leatherEdge, this.leatherEdge, this.endpaper, this.leather]);
    back.position.set((W + ov) / 2 - 0.0008, 0, c / 2);
    right.add(back);
    const blockGeo = pageBlockGeo(W, H, c, t, gw, fe);
    const pagesR = new THREE.Mesh(blockGeo, [this.paperMat, this.edgeMat]);
    right.add(pagesR);
    // the left half swings about the spine at paper level
    const left = (this.left = new THREE.Group());
    left.position.set(0, 0, T);
    body.add(left);
    const front = new THREE.Mesh(boardGeo, [this.leatherEdge, this.leatherEdge, this.leatherEdge, this.leatherEdge, this.endpaper, this.front]);
    front.position.set(-(W + ov) / 2 + 0.0008, 0, c / 2 - T);
    left.add(front);
    const pagesL = new THREE.Mesh(blockGeo, [this.paperMat, this.edgeMat]);
    pagesL.scale.x = -1;
    pagesL.position.z = -T;
    left.add(pagesL);
    // brass corners on the outer corners of both boards
    const cornerGeo = new THREE.BoxGeometry(0.014, 0.014, c + 0.0012);
    for (const [grp, sx, z] of [[right, 1, c / 2], [left, -1, c / 2 - T]]) {
      for (const sy of [1, -1]) {
        const m = new THREE.Mesh(cornerGeo, this.brass);
        m.position.set(sx * (W + ov - 0.0055), sy * (H / 2 + ov - 0.0055), z);
        m.rotation.z = Math.PI / 4;
        m.scale.set(1, 1, 1);
        grp.add(m);
      }
    }
    // the spine: a strip hinged at the back board, swinging round as the book shuts
    const spine = (this.spine = new THREE.Group());
    body.add(spine);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(T * 2 + c, H + ov * 2, c), this.leatherEdge);
    sp.position.set(-(T * 2 + c) / 2, 0, -c / 2);
    spine.add(sp);
    // the ribbon: hangs out of the bottom of the gutter, forked at the end
    const rg = new THREE.PlaneGeometry(0.0085, 0.085, 2, 10);
    rg.translate(0, -0.0425, 0);
    const pos = rg.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.084 && Math.abs(pos.getX(i)) < 1e-4) pos.setY(i, -0.076);
    this.ribbonBase = Float32Array.from(pos.array);
    const ribbon = (this.ribbon = new THREE.Mesh(rg, this.ribbonMat));
    ribbon.position.set(0.0045, -H / 2 + 0.006, T - t * 0.5);
    body.add(ribbon);
    // the turning page
    const sg = new THREE.PlaneGeometry(1, H - 0.002, 24, 1);
    const sheet = (this.sheet = new THREE.Mesh(sg, this.sheetMat));
    sheet.visible = false;
    body.add(sheet);
    // bookmark tabs between the pages, sticking out of the fore-edge (built in setTabs)
    this.tabGroup = new THREE.Group();
    right.add(this.tabGroup);
    this.tabMeshes = [];
    this.buildTabs();
    // the hands hold the bottom corners
    body.add(this.handR.root, this.handL.root);
  }
  // the bookmark tabs: n of them, one active (it sticks out further)
  setTabs(n, active) {
    if (n !== this.tabCount) {
      this.tabCount = n;
      this.tabOut = Array.from({ length: n }, () => 0);
      this.buildTabs();
    }
    this.tabActive = active;
  }
  tabSize() {
    const n = Math.max(1, this.tabCount);
    const span = this.H - 0.03;
    const h = Math.min(0.026, span / n - 0.0015);
    // w: the whole tab; it sits under the paper from W - 0.01 and sticks out past the board
    return { h, step: h + 0.0015, top: this.H / 2 - 0.012, w: 0.032, cx: this.W + 0.006 };
  }
  buildTabs() {
    if (!this.tabGroup) return;
    for (const m of this.tabMeshes) this.tabGroup.remove(m);
    this.tabMeshes = [];
    const { h, step, top, w, cx } = this.tabSize();
    // a leather tab with rounded outer corners (the inner end is hidden under the paper)
    const sh = new THREE.Shape(), r = Math.min(0.004, h * 0.3), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
    sh.moveTo(x0, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0, y1); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -0.0006);
    for (let i = 0; i < this.tabCount; i++) {
      const m = new THREE.Mesh(geo, this.tabMats[i % this.tabMats.length]);
      m.position.set(cx, top - h / 2 - i * step, this.T - 0.0004);
      this.tabGroup.add(m);
      this.tabMeshes.push(m);
    }
  }
  // the screen layout (CSS px, relative to the canvas box): the page boxes the menus use
  // { pageW, pageH, cx, cy, single, W, H } -> the book is sized and placed so its flat
  // writing areas cover those boxes exactly once it is held up
  layout(L) {
    this.lay = L;
    const ph = 0.2;
    const pw = ph * (L.pageW / L.pageH);
    this.build(pw, ph);
    const cam = this.view.cam;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const ppm = L.pageH / ph; // CSS px per metre on the paper
    const d = L.H / 2 / (ppm * tanH);
    this.ppm = ppm;
    // the paper plane (z = T in the book) sits at distance d
    this.dist = d;
    // where the spine goes: the spread's middle on the page centre, or (one page at a
    // time on a tall screen) the right page's middle there
    const midX = (L.cx - L.W / 2) / ppm, midY = -(L.cy - L.H / 2) / ppm;
    this.home = new THREE.Vector3(L.single ? midX - (this.gw + this.pw / 2) : midX, midY, -d - this.T);
  }
  show() { this.want = 1; }
  hide() { this.want = 0; }
  visible() { return this.lift > 0.001 && !!this.body; }
  get settled() { return this.want === 1 && this.lift >= 1 && this.open >= 1; }
  // turn a page: dir 1 forwards (the right page over to the left), -1 back; mid() runs
  // when the turning page hides both pages (swap the writing then)
  turn(dir, mid) {
    if (this.flip && !this.flip.midFired) this.flip.mid?.();
    this.flip = { t: 0, dir, mid, midFired: false };
  }
  update(dt) {
    if (!this.body) return;
    this.time += dt;
    // lift and open run as one gesture: up first, the cover swings as it arrives
    if (this.want) {
      this.lift = Math.min(1, this.lift + dt / 0.38);
      if (this.lift > 0.55) this.open = Math.min(1, this.open + dt / 0.42);
    } else {
      this.open = Math.max(0, this.open - dt / 0.3);
      if (this.open < 0.45) this.lift = Math.max(0, this.lift - dt / 0.34);
    }
    const L = ease(this.lift), O = ease(this.open);
    this.root.visible = this.lift > 0.001;
    if (!this.home) return;
    // held up: square to the eye; down: lying back in his lap, tipped towards him
    const r = this.root;
    const h = this.home;
    const back = 1 - L;
    r.position.set(h.x, h.y - back * 0.34, h.z + back * 0.08);
    r.rotation.set(-back * 1.15 + (1 - O) * 0.12 * L, (1 - O) * 0.22 * L, (1 - O) * -0.05);
    // shut, the book is half as wide: slide it over so it stays in front of him
    const shut = 1 - O;
    this.body.position.x = -(this.W / 2) * shut * (this.lay?.single ? 0.2 : 1);
    this.body.position.z = -this.T * 0.5 * shut;
    this.left.rotation.y = Math.PI * shut;
    this.spine.rotation.y = (Math.PI / 2) * shut;
    // the hands: the right one stays on its corner; the left one carries the cover over
    const W = this.W, H = this.H, ov = this.ov;
    const hr = this.handR.root, hl = this.handL.root;
    const gp = this.gripPos || [-0.028, -0.05, -0.015], gr = this.gripRot || [0, 0, 0.3];
    hr.position.set(W + ov + gp[0], -H / 2 + gp[1], gp[2]);
    hr.rotation.set(gr[0], gr[1], gr[2]);
    // the left one holds the left board's outer corner when open, the spine side of the
    // shut book (mirroring the right hand), and carries the cover over in between
    const ox = -(W + ov) - gp[0], sx = -ov - gp[0];
    const k = ease(shut), arc = Math.sin(Math.PI * shut);
    hl.position.set(ox + (sx - ox) * k, -H / 2 + gp[1] + arc * 0.02, gp[2] + arc * 0.06);
    hl.rotation.set(gr[0] - arc * 0.3, -gr[1] - arc * 0.7, -gr[2]);
    // the ribbon sways a little
    this.swayRibbon();
    // tabs: the active one slides out a touch
    for (let i = 0; i < this.tabMeshes.length; i++) {
      const want = i === this.tabActive ? 1 : 0;
      this.tabOut[i] = (this.tabOut[i] || 0) + (want - (this.tabOut[i] || 0)) * (1 - Math.exp(-dt * 14));
      const m = this.tabMeshes[i];
      m.position.x = this.tabSize().cx + this.tabOut[i] * 0.005;
      m.visible = O > 0.6;
    }
    this.updateFlip(dt);
  }
  swayRibbon() {
    const pos = this.ribbon.geometry.attributes.position, B = this.ribbonBase;
    const sw = Math.sin(this.time * 1.7) * 0.05 + Math.sin(this.time * 0.63) * 0.04 - (1 - ease(this.lift)) * 0.4;
    for (let i = 0; i < pos.count; i++) {
      const y = B[i * 3 + 1], k = Math.max(0, -y / 0.085) ** 1.6;
      pos.setX(i, B[i * 3] + Math.sin(sw) * k * 0.012);
      pos.setZ(i, B[i * 3 + 2] + Math.abs(sw) * k * 0.01);
    }
    pos.needsUpdate = true;
  }
  updateFlip(dt) {
    const f = this.flip, S = this.sheet;
    if (!f) { S.visible = false; return; }
    f.t = Math.min(1, f.t + dt / 0.46);
    const p = ease(f.t);
    if (!f.midFired && f.t > 0.08) { f.midFired = true; f.mid?.(); }
    // the sheet: angle along it lags behind at the free edge (a page bends as it turns)
    const pos = S.geometry.attributes.position;
    const W = this.W, n = 24, base = f.dir > 0 ? p * Math.PI : (1 - p) * Math.PI;
    const lag = Math.sin(p * Math.PI) * 0.75 * (f.dir > 0 ? -1 : 1);
    let x = 0, z = 0;
    const xs = [0], zs = [0];
    for (let i = 1; i <= n; i++) {
      const s = (i - 0.5) / n;
      const ph = clamp(base + lag * s * s, 0, Math.PI);
      x += Math.cos(ph) * (W / n);
      z += Math.sin(ph) * (W / n);
      xs.push(x);
      zs.push(z);
    }
    for (let i = 0; i < pos.count; i++) {
      const col = i % (n + 1);
      pos.setX(i, xs[col]);
      pos.setZ(i, zs[col] + this.T + 0.0012);
    }
    pos.needsUpdate = true;
    S.geometry.computeVertexNormals();
    S.visible = true;
    if (f.t >= 1) { this.flip = null; S.visible = false; }
  }
  get flipping() { return !!this.flip; }

  // ---------------------------------------------------------------- screen placement
  // a point on the paper (book space) -> CSS px relative to the canvas box
  project(x, y, z, out, obj = this.body) {
    _v.set(x, y, z);
    obj.localToWorld(_v);
    _v.project(this.view.cam);
    const L = this.lay;
    out[0] = (_v.x * 0.5 + 0.5) * L.W;
    out[1] = (0.5 - _v.y * 0.5) * L.H;
    return out;
  }
  // the four corners (top-left, top-right, bottom-right, bottom-left) of a page's flat
  // writing area: side 'l' or 'r'
  quad(side) {
    if (!this.body) return null;
    this.root.updateMatrixWorld(true);
    this.view.cam.updateMatrixWorld();
    this.view.cam.aspect = this.lay.W / this.lay.H;
    this.view.cam.updateProjectionMatrix();
    const x0 = side === 'r' ? this.gw : -(this.gw + this.pw), x1 = x0 + this.pw;
    const y0 = this.ph / 2, y1 = -this.ph / 2;
    // the left page swings with the cover (its paper is at z = 0 about the spine pivot)
    const o = side === 'r' ? this.body : this.left, z = side === 'r' ? this.T : 0;
    return [this.project(x0, y0, z, [], o), this.project(x1, y0, z, [], o), this.project(x1, y1, z, [], o), this.project(x0, y1, z, [], o)];
  }
  // where the bookmark tabs stick out, in the right page's own CSS px (for their buttons)
  tabBoxes() {
    const { h, step, top, w, cx } = this.tabSize(), s = this.ppm;
    const x0 = this.W + this.ov; // the part past the board
    return this.tabMeshes.map((m, i) => {
      const x1 = cx + w / 2 + (this.tabOut[i] || 0) * 0.005;
      return { left: (x0 - this.gw) * s, top: (this.ph / 2 - (top - i * step)) * s, width: (x1 - x0) * s, height: h * s };
    });
  }
}
