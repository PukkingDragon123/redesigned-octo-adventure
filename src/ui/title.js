// Title screen: a live shot in the real world at golden hour. Hank sits in the grass on the
// knoll above Maple Cove (layout.js TITLE_HILL) with a steaming mug of Nana's cocoa, the
// village, the green and the harbour below him, the wind in the grass and the leaves; now
// and then a chickadee flutters in and lands on his toque (game/titleHill.js runs the
// little scene). The camera sits behind him over his left shoulder and drifts slowly. On
// top: a hand-made pixel-art logo and the leather-and-brass menu, over a soft darkening
// where they sit (no blur: the scene stays crisp).
import * as THREE from 'three';
import { hasSave } from '../game/state.js';
import { HillScene } from '../game/titleHill.js';
import { clamp, smoothstep } from '../core/math.js';

// the light: a low autumn sun in the west-southwest, gold on the rooftops; the villagers
// keep a late-afternoon routine
const LIGHT_HOUR = 17.8;
const SCHED_HOUR = 16.6;
const FADE_IN = 1.8;
const SHADOW_SIZE = 90; // a wider shadow box so the village below keeps its shadows (gameplay uses 70)
// The camera, around Hank: its bearing from where he faces (a, radians towards his left;
// lean: the bearing it drifts round to while the bird visits, so his smile shows), distance
// d and height y (m), how far across the screen he sits (sx, 0 left .. 1 right), the pitch
// (radians, down < 0) and the horizontal field of view (degrees). Tall screens get him in
// the middle, a bit further off.
const CAM_WIDE = { a: 2.5, lean: 2.3, d: 4.7, y: 2.0, sx: 0.68, pitch: -0.19, hfov: 64 };
const CAM_TALL = { a: 2.7, lean: 2.5, d: 4.9, y: 2.3, sx: 0.53, pitch: -0.22, hfov: 58 };

const INK = '#1e1418';

function pixCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// integer display scale that keeps pixel art square and crisp
export function uiScale(base = 260) {
  return Math.max(1, Math.min(5, Math.floor(Math.min(innerWidth / base, innerHeight / (base * 0.62)))));
}

// ---------------------------------------------------------------- logo
// The title is set in BoldPixels at its native size, then outlined, shaded,
// shadowed and dripped with cocoa pixel by pixel.
function drawLogo() {
  const text = 'DELI-VERY-DEAD';
  const FS = 32;
  const [m, mg] = pixCanvas(512, 64);
  mg.font = `${FS}px BoldPixels, Monogram, monospace`;
  mg.textBaseline = 'top';
  const tw = Math.ceil(mg.measureText(text).width);
  const W = tw + 24, H = FS + 30;
  const [t, tg] = pixCanvas(W, H);
  tg.font = mg.font;
  tg.textBaseline = 'top';
  tg.fillStyle = '#fff';
  tg.fillText(text, 8, 6);
  const src = tg.getImageData(0, 0, W, H).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 110;
  // vertical extent of the glyphs for the gradient
  let y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const [o, g] = pixCanvas(W, H);
  const put = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const near = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r + (r > 1 ? 1 : 0) && on(x + dx, y + dy)) return true;
    return false;
  };
  // deep shadow (offset), then the ink outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near(x - 3, y - 3, 2)) put(x, y, '#5a1420');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near(x, y, 2)) put(x, y, INK);
  // cocoa drips hanging off the bottoms of some strokes
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < W; x++) {
    let bottom = -1;
    for (let y = H - 1; y >= 0; y--) if (on(x, y)) { bottom = y; break; }
    if (bottom < y1 - 1 || rnd() > 0.16) continue;
    const len = 2 + Math.floor(rnd() * 6);
    for (let k = 1; k <= len; k++) {
      put(x, bottom + 2 + k, k === len ? '#3a1a10' : '#5a2e1c');
      put(x - 1, bottom + 2 + k, INK);
      put(x + 1, bottom + 2 + k, INK);
    }
    put(x, bottom + 3 + len, INK);
    put(x, bottom + 3, '#7a4428');
  }
  // fill: cream to pumpkin bands, a bright top lip and a dark bottom lip per stroke
  const bands = ['#fff6e2', '#ffe6b0', '#ffc860', '#f59a32', '#e0701e'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const k = (y - y0) / Math.max(1, y1 - y0);
    let c = bands[Math.min(bands.length - 1, Math.floor(k * bands.length))];
    if (!on(x, y - 1)) c = '#ffffff';
    else if (!on(x, y + 1)) c = '#a8401a';
    else if (!on(x - 1, y)) c = k < 0.5 ? '#fffaf0' : '#ffd070';
    put(x, y, c);
  }
  // little specular glints
  for (let x = 0; x < W; x += 5) for (let y = y0; y < y0 + 3; y++) if (on(x, y) && on(x + 1, y) && on(x, y + 1) && rnd() < 0.3) { put(x + 1, y + 1, '#ffffff'); break; }
  return o;
}

// a steaming mug of cocoa with a bite out of it, to sit beside the logo
function drawMug() {
  const [c, g] = pixCanvas(28, 30);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(3, 11, 17, 17, INK); R(19, 14, 7, 10, INK);
  R(4, 12, 15, 15, '#f2e6cc'); R(4, 12, 15, 2, '#fffaf0'); R(4, 24, 15, 3, '#cdbb98');
  R(20, 15, 5, 8, '#f2e6cc'); R(21, 17, 3, 4, INK);
  R(5, 12, 13, 3, '#6a3a1e'); R(6, 12, 4, 1, '#8a5432'); R(12, 11, 4, 2, '#fffaf0'); R(9, 10, 3, 2, '#fffaf0');
  R(6, 17, 11, 4, '#c8361f'); R(6, 17, 11, 1, '#e8503a');
  R(9, 18, 1, 2, '#f2e6cc'); R(11, 18, 1, 2, '#f2e6cc'); R(13, 18, 1, 2, '#f2e6cc');
  // steam
  for (const [x, y] of [[8, 7], [9, 5], [8, 3], [13, 6], [14, 4], [13, 2], [14, 0]]) R(x, y, 1, 2, '#fffaf0');
  return c;
}

const el = (tag, css = '', html = '') => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.innerHTML = html;
  return e;
};


export class TitleScreen {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.scene = null;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._rest = new THREE.Vector3();
  }

  async show({ onContinue, onNew, onSettings, onControls }) {
    const g = this.g;
    // the scene goes up at once (black, fading in) so nothing pops in
    this.stage();
    try { await document.fonts.load('32px BoldPixels'); await document.fonts.load('24px Monogram'); } catch { /* fonts are optional */ }
    const root = el('div', `position:fixed;inset:0;z-index:40;pointer-events:none;font-family:Monogram,monospace;color:#fff4e0;opacity:0;`);
    root.id = 'title3d';
    // a soft darkening behind the logo and the menu so they read over any shot
    this.shadeEl = el('div', 'position:absolute;inset:0;');
    // logo, with a steaming mug of cocoa beside it and the subtitle under it
    this.logo = drawLogo();
    const logoBox = el('div', 'position:absolute;left:50%;');
    const li = el('img', 'position:absolute;left:0;top:0;image-rendering:pixelated;');
    li.src = this.logo.toDataURL();
    const mi = el('img', 'position:absolute;image-rendering:pixelated;');
    mi.src = drawMug().toDataURL();
    const sub = el('div', 'position:absolute;left:0;text-align:center;line-height:1;color:#ffe8c8;', 'a cozy undead cocoa-delivery tale');
    logoBox.append(li, mi, sub);
    Object.assign(this, { logoBox, logoEl: li, mugEl: mi, subEl: sub });
    // menu: the shared leather & brass kit buttons
    const items = [];
    const save = hasSave();
    if (save) items.push({ label: 'Continue', small: `Day ${g.peekSave()?.day ?? 1}`, fn: () => this.close(onContinue) });
    items.push({ label: save ? 'New Game' : 'Start', small: save ? 'starts over' : '', fn: () => this.close(onNew) });
    items.push({ label: 'Settings', fn: () => onSettings?.() });
    items.push({ label: 'Controls', fn: () => onControls?.() });
    const menu = el('div', 'position:absolute;display:flex;flex-direction:column;gap:calc(var(--u) * 3);pointer-events:auto;min-width:calc(var(--u) * 104);');
    menu.className = 'title-menu-k';
    const buttons = items.map((it, i) => {
      const b = g.ui.button(it.label, it.fn, { small: it.small || '' });
      b.addEventListener('pointerenter', () => this.select(i));
      menu.appendChild(b);
      return b;
    });
    this.buttons = buttons;
    this.menuEl = menu;
    const foot = el('div', `position:absolute;right:calc(var(--u) * 3);bottom:calc(var(--u) * 2);font-size:var(--tfs);line-height:calc(var(--us) * 12);text-align:right;color:#e8d0b0;text-shadow:var(--us) var(--us) 0 ${INK};`,
      'Autumn in Maple Cove<br>fonts: monogram by datagoblin (CC0) &middot; BoldPixels by YukiPixels (CC BY-SA 4.0)');
    root.append(this.shadeEl, logoBox, menu, foot);
    document.body.appendChild(root);
    this.root = root;
    this.layoutDom();
    this.onResize = () => this.layoutDom();
    addEventListener('resize', this.onResize);
    // hook into the game's menu navigation (arrow keys / pad / confirm)
    const m = { ov: root, items: buttons, sel: 0, onBack: null, title: true };
    this.m = m;
    g.ui.menuStack.push(m);
    this.select(0);
  }

  // wide screens: the menu bottom-left; tall screens: centred under the scene
  layoutDom() {
    if (!this.root) return;
    const W = innerWidth, H = innerHeight, narrow = W < H;
    const logo = this.logo;
    // a whole number of DEVICE pixels per logo pixel (ls is in CSS px), placed on whole
    // device pixels, so the logo and the subtitle's pixel font stay crisp and even
    const dpr = devicePixelRatio || 1;
    const k = Math.max(1, Math.min(5 * Math.ceil(dpr), Math.floor(Math.min((W * dpr * 0.62) / logo.width, (H * dpr * 0.3) / logo.height))));
    const ls = k / dpr;
    this.ls = ls;
    const lw = logo.width * ls, lh = logo.height * ls, bw = lw + 30 * ls;
    Object.assign(this.logoBox.style, { top: `${Math.round(H * 0.05 * dpr) / dpr}px`, width: `${bw}px`, left: `${Math.round(((W - bw) / 2) * dpr) / dpr}px`, marginLeft: '0px', height: `${lh}px` });
    Object.assign(this.logoEl.style, { width: `${lw}px`, height: `${lh}px` });
    Object.assign(this.mugEl.style, { left: `${lw - 2 * ls}px`, top: `${2 * ls}px`, width: `${28 * ls}px`, height: `${30 * ls}px` });
    Object.assign(this.subEl.style, { width: `${lw}px`, top: `${lh - 4 * ls}px`, fontSize: `${16 * ls}px`, textShadow: `${ls}px ${ls}px 0 ${INK}` });
    const ms = this.menuEl.style;
    // centred by its measured width on whole device pixels (a -50% transform blurs the pixel art)
    if (narrow) Object.assign(ms, { left: `${Math.round(((W - this.menuEl.offsetWidth) / 2) * dpr) / dpr}px`, transform: '', bottom: 'calc(var(--u) * 18)' });
    else Object.assign(ms, { left: `${Math.round(W * 0.07)}px`, transform: '', bottom: `${Math.round(H * 0.1)}px` });
    const ink = (a) => `rgba(24,14,20,${a})`;
    this.shadeEl.style.background = narrow
      ? `linear-gradient(to top, ${ink(0.62)} 0%, ${ink(0.32)} 28%, ${ink(0)} 48%), linear-gradient(to bottom, ${ink(0.34)} 0%, ${ink(0)} 26%)`
      : `radial-gradient(ellipse 50% 66% at 0% 100%, ${ink(0.56)} 0%, ${ink(0.26)} 55%, ${ink(0)} 100%), linear-gradient(to top, ${ink(0.38)} 0%, ${ink(0)} 30%), linear-gradient(to bottom, ${ink(0.3)} 0%, ${ink(0)} 28%)`;
  }

  select(i) {
    if (!this.buttons || !this.m) return;
    this.m.sel = i;
    this.g.ui.highlight(this.m);
    this.selI = i;
  }

  // Set the world up for the title: golden-hour light, a friendly village, Bessie tucked
  // away out of sight and Hank on his hill with his cocoa. (restore() puts it all back.)
  stage() {
    const g = this.g;
    if (this.staged) return;
    this.staged = true;
    const W = g.world, A = W.atmosphere;
    A.lightHour = LIGHT_HOUR;
    A.hour = SCHED_HOUR;
    A.setWeather('breezy', true);
    // everyone already knows Hank (a save or a new game sets the real feelings when the title closes)
    const st = g.state;
    st.flags.village1 = true;
    st.flags.contestScream = true;
    st.npc = { _day: st.day, _base: 70 };
    g.villagers.syncState();
    // no speech bubbles or voices over the title
    g.villagers.bubble = () => {};
    const sc = W.sun?.shadow?.camera;
    if (sc) {
      this.shadowWas = sc.right;
      sc.left = sc.bottom = -SHADOW_SIZE;
      sc.right = sc.top = SHADOW_SIZE;
      sc.updateProjectionMatrix();
    }
    // Bessie (and the riding Hank) wait out of sight up the hill behind him
    this.bikeWas = g.bikeModel.root.visible;
    this.riderWas = g.rider.visible;
    g.setBikeVisible(false);
    this.scene = new HillScene(g);
    const b = this.scene.local(0, 0, -26, new THREE.Vector3());
    g.parkBike(b.x, b.z, this.scene.yaw);
    g.pipeline.post.uFade.value = 1;
    this.frame(0, true);
  }

  // over his left shoulder, framed by the screen's shape, drifting slowly
  frame(dt, snap = false) {
    const g = this.g, H = this.scene, cam = g.camera;
    if (!H) return;
    const aspect = cam.aspect || innerWidth / innerHeight;
    const tall = aspect < 1;
    const K = tall ? CAM_TALL : CAM_WIDE;
    const t = this.t;
    const a = K.a + (K.lean - K.a) * H.camLean + Math.sin(t * 0.06) * 0.05;
    const d = K.d + Math.sin(t * 0.067 + 2) * 0.15;
    const pos = H.local(Math.sin(a) * d, K.y + Math.sin(t * 0.083 + 1) * 0.08, Math.cos(a) * d, this._pos);
    const vfov = clamp(2 * Math.atan(Math.tan((K.hfov * Math.PI) / 360) / aspect), 0.5, tall ? 1.25 : 1.05);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // the yaw that puts Hank at sx across the screen (from where the camera rests: drifting
    // round to his side, it keeps looking the same way and he slides over a little)
    const s = H.spot, rest = H.local(Math.sin(K.a) * K.d, 0, Math.cos(K.a) * K.d, this._rest);
    const yawH = Math.atan2(s.x - rest.x, s.z - rest.z);
    const yaw = yawH + Math.atan((2 * K.sx - 1) * Math.tan(hfov / 2)) + Math.sin(t * 0.05) * 0.015;
    const pitch = K.pitch + Math.sin(t * 0.07) * 0.008;
    const c = Math.cos(pitch) * 60;
    const look = this._look.set(pos.x + Math.sin(yaw) * c, pos.y + Math.sin(pitch) * 60, pos.z + Math.cos(yaw) * c);
    const C = g.chase, fov = (vfov * 180) / Math.PI;
    if (snap || C.mode !== 'shot') C.cut(pos, look, fov);
    else {
      C.pos.copy(pos);
      C.look.copy(look);
      C.fov = fov;
    }
    C.apply(dt);
  }

  update(dt) {
    if (!this.scene) return;
    const g = this.g;
    this.t += dt;
    // fade in from the loading screen
    g.pipeline.post.uFade.value = 1 - smoothstep(0, FADE_IN, this.t);
    this.frame(dt);
    this.scene.update(dt);
    if (!this.root) return;
    if (this.t < 2) this.root.style.opacity = String(clamp((this.t - 0.4) / 0.9, 0, 1));
    else if (this.root.style.opacity !== '1') this.root.style.opacity = '1';
    // the mug's steam bobs in pixel steps
    if (this.mugEl) this.mugEl.style.transform = `translateY(${-Math.round((Math.sin(this.t * 2.4) + 1) * 1) * this.ls}px)`;
  }

  close(fn) {
    const g = this.g;
    if (!this.root) return;
    g.ui.menuStack = g.ui.menuStack.filter((x) => x !== this.m);
    const r = this.root;
    this.root = null;
    removeEventListener('resize', this.onResize);
    r.style.transition = 'opacity 0.5s';
    r.style.opacity = '0';
    setTimeout(() => r.remove(), 550);
    this.restore();
    fn?.();
  }

  // hand the world back to the game the way the title found it
  restore() {
    const g = this.g, W = g.world;
    this.scene?.dispose();
    this.scene = null;
    W.atmosphere.lightHour = null;
    const sc = W.sun?.shadow?.camera;
    if (sc && this.shadowWas) {
      sc.left = sc.bottom = -this.shadowWas;
      sc.right = sc.top = this.shadowWas;
      sc.updateProjectionMatrix();
    }
    delete g.villagers.bubble;
    if (this.bikeWas !== undefined) {
      g.bikeModel.root.visible = this.bikeWas;
      g.rider.visible = this.riderWas;
    }
    g.parkBike();
    g.pipeline.post.uFade.value = 0;
  }
}
