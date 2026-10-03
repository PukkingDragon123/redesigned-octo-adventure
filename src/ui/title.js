// Title screen: a live 3D shot of Hank on Harold's bike outside Nana's cabin at
// dusk, a hand-made pixel-art logo, and a leather-and-brass menu.
import * as THREE from 'three';
import { HOME_SPAWN, POI } from '../world/layout.js';
import { hasSave } from '../game/state.js';

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
    this.gagT = 4;
  }

  async show({ onContinue, onNew, onSettings, onControls }) {
    const g = this.g;
    try { await document.fonts.load('32px BoldPixels'); await document.fonts.load('24px Monogram'); } catch { /* fonts are optional */ }
    const s = uiScale();
    this.s = s;
    const root = el('div', `position:fixed;inset:0;z-index:40;pointer-events:none;font-family:Monogram,monospace;color:#fff4e0;`);
    root.id = 'title3d';
    // logo
    const logo = drawLogo();
    const mug = drawMug();
    const ls = Math.max(1, Math.min(5, Math.floor(Math.min((innerWidth * 0.62) / logo.width, (innerHeight * 0.3) / logo.height))));
    const lw = logo.width * ls, lh = logo.height * ls;
    const logoBox = el('div', `position:absolute;left:50%;top:${Math.round(innerHeight * 0.05)}px;width:${lw + 30 * ls}px;margin-left:${-Math.round((lw + 30 * ls) / 2)}px;height:${lh}px;`);
    const li = el('img', `position:absolute;left:0;top:0;width:${lw}px;height:${lh}px;image-rendering:pixelated;`);
    li.src = logo.toDataURL();
    const mi = el('img', `position:absolute;left:${lw - 2 * ls}px;top:${2 * ls}px;width:${28 * ls}px;height:${30 * ls}px;image-rendering:pixelated;`);
    mi.src = mug.toDataURL();
    this.mugEl = mi;
    this.ls = ls;
    const ss = ls;
    const sub = el('div', `position:absolute;left:0;width:${lw}px;top:${lh - 4 * ls}px;text-align:center;font-size:${16 * ss}px;line-height:1;color:#ffe8c8;text-shadow:${ss}px ${ss}px 0 ${INK};`, 'a cozy undead cocoa-delivery tale');
    logoBox.append(li, mi, sub);
    this.logoEl = li;
    // menu
    const items = [];
    const save = hasSave();
    if (save) items.push({ label: 'Continue', small: `Day ${g.peekSave()?.day ?? 1}`, fn: () => this.close(onContinue) });
    items.push({ label: save ? 'New Game' : 'Start', small: save ? 'starts over' : '', fn: () => this.close(onNew) });
    items.push({ label: 'Settings', fn: () => onSettings?.() });
    items.push({ label: 'Controls', fn: () => onControls?.() });
    // menu: the shared leather & brass kit buttons
    const narrow = innerWidth < innerHeight;
    const menu = el('div', `position:absolute;${narrow ? 'left:50%;transform:translateX(-50%);bottom:calc(var(--u) * 18)' : `left:${Math.round(innerWidth * 0.07)}px;bottom:${Math.round(innerHeight * 0.1)}px`};display:flex;flex-direction:column;gap:calc(var(--u) * 3);pointer-events:auto;min-width:calc(var(--u) * 104);`);
    menu.className = 'title-menu-k';
    const buttons = items.map((it, i) => {
      const b = g.ui.button(it.label, it.fn, { small: it.small || '' });
      b.addEventListener('pointerenter', () => this.select(i));
      menu.appendChild(b);
      return b;
    });
    this.buttons = buttons;
    const foot = el('div', `position:absolute;right:8px;bottom:6px;font-size:16px;line-height:1;text-align:right;color:#e8d0b0;text-shadow:1px 1px 0 ${INK};`,
      'Autumn in Maple Cove<br>fonts: monogram by datagoblin (CC0) &middot; BoldPixels by YukiPixels (CC BY-SA 4.0)');
    root.append(logoBox, menu, foot);
    document.body.appendChild(root);
    this.root = root;
    // hook into the game's menu navigation (arrow keys / pad / confirm)
    const m = { ov: root, items: buttons, sel: 0, onBack: null, title: true };
    this.m = m;
    g.ui.menuStack.push(m);
    this.select(0);
    // stage
    this.stage();
  }

  select(i) {
    if (!this.buttons || !this.m) return;
    this.m.sel = i;
    this.g.ui.highlight(this.m);
    this.selI = i;
  }

  // Hank on the bike in the yard, Nana on the porch, lanterns lit
  stage() {
    const g = this.g;
    const A = g.world.atmosphere;
    A.hour = 17.35;
    A.setWeather('breezy', true);
    g.parkBike(HOME_SPAWN.x, HOME_SPAWN.z, HOME_SPAWN.yaw + 0.5);
    g.setBikeVisible(true);
    g.rider.visible = true;
    g.pipeline.post.uFade.value = 1;
    g.tween(g.pipeline.post.uFade, 'value', 0, 1.4);
    this.t = 0;
  }

  update(dt) {
    if (!this.root) return;
    const g = this.g;
    this.t += dt;
    // camera: a slow, low push-in on Hank with the cabin glowing behind him
    const b = g.bike.pos;
    const k = this.t * 0.05;
    const narrow = innerWidth < innerHeight;
    const ang = HOME_SPAWN.yaw + 0.5 + 0.9 + Math.sin(k) * 0.28;
    const r = (narrow ? 7.4 : 5.6) - Math.min(1, this.t / 12) * 0.5;
    const pos = new THREE.Vector3(b.x + Math.sin(ang) * r, b.y + 1.25 + Math.sin(k * 1.3) * 0.12, b.z + Math.cos(ang) * r);
    // frame Hank right of centre on wide screens so the menu has room on the left
    const side = narrow ? 0 : -1.25;
    const look = new THREE.Vector3(b.x + Math.cos(ang) * side, b.y + 1.0, b.z - Math.sin(ang) * side);
    g.chase.cut(pos, look, narrow ? 50 : 42);
    g.chase.apply(dt);
    // little bits of business: bell, head pop, a wave at the camera
    this.gagT -= dt;
    const ch = g.rider.ch;
    if (this.gagT <= 0 && ch) {
      this.gagT = 4 + Math.random() * 4;
      const r2 = Math.random();
      if (r2 < 0.35) ch.react('headpop');
      else if (r2 < 0.6) { g.sound?.play?.('bell', { volume: 0.5 }); ch.react('nod'); }
      else if (r2 < 0.8) ch.react('laugh');
      else ch.react('love');
    }
    // the mug's steam bobs in pixel steps
    if (this.mugEl) this.mugEl.style.transform = `translateY(${-Math.round((Math.sin(this.t * 2.4) + 1) * 1) * this.ls}px)`;
    void POI;
  }

  close(fn) {
    const g = this.g;
    if (!this.root) return;
    g.ui.menuStack = g.ui.menuStack.filter((x) => x !== this.m);
    const r = this.root;
    this.root = null;
    r.style.transition = 'opacity 0.5s';
    r.style.opacity = '0';
    setTimeout(() => r.remove(), 550);
    fn?.();
  }
}
