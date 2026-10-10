// The HUD as physical things, drawn as pixel art at the kit's integer scale:
// Harold's brass pocket watch, the day plate, a coin pouch, a brass compass in a
// turned-wood case whose needle points at the next stop, Nana's list (a little
// spiral notepad on a clipboard) and the handlebar speedometer.
import { iconURL, glyphURL, iconSmallURL } from '../art/icons.js';
import { CHARACTERS } from '../art/characters.js';
import { Pix } from '../art/pixel.js';
import { el, esc } from './kit.js';
import { cupTemp } from '../game/orders.js';
import { foodIconURL } from '../art/foodsprites.js';
import { tempMood, tempFaceURL } from '../art/tempfaces.js';
import { leaves } from './leaves.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const INK = 0x1e1418;
// 6-tone ramps: outline, d2, d1, base, l1, hl
const GOLD = [0x6e3a0e, 0xa8640e, 0xd08a18, 0xf0b42a, 0xffdc5a, 0xfff8c8];
const BRASS = [0x5e3410, 0x8e5a1a, 0xb87e26, 0xd8a038, 0xf2cc6a, 0xfff0b0];
const STEEL = [0x2e3440, 0x5e6674, 0x8a929e, 0xb4bcc8, 0xdfe4ea, 0xffffff];
const LV = (() => { const l = [-0.55, -0.5, 0.67], m = Math.hypot(...l); return l.map((v) => v / m); })();
const toneOf = (R, d) => { const v = (d + 0.35) / 1.4; if (d > 0.93) return R[5]; return R[1 + clamp(Math.floor(v * 4), 0, 3)]; };

// a torus-shaded ring (bezels) and a gently domed disc (faces, glass)
function ring(p, cx, cy, r0, r1, R) {
  for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d < r0 || d > r1) continue;
    const t = ((d - r0) / (r1 - r0)) * 2 - 1;
    const n = [(dx / d) * t, (dy / d) * t, Math.sqrt(Math.max(0, 1 - t * t))];
    p.set(x, y, toneOf(R, n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]));
  }
}
// a turned-wood ring (the compass case, the speedometer rim) with grain running round it
const WOODR = [0x42210e, 0x643418, 0x8e4e24, 0xb87036, 0xd8914e, 0xf4c07a];
const gh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };
function woodRing(p, cx, cy, r0, r1) {
  for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d < r0 || d > r1) continue;
    const t = ((d - r0) / (r1 - r0)) * 2 - 1;
    const n = [(dx / d) * t, (dy / d) * t, Math.sqrt(Math.max(0, 1 - t * t))];
    const c = toneOf(WOODR, n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]);
    let k = WOODR.indexOf(c);
    const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) * r1) / 3);
    const g = gh(a, Math.floor(d * 1.3));
    if (k < 5 && g < 0.22) k = Math.max(1, k - 1);
    else if (g > 0.93 && k < 5) k++;
    p.set(x, y, WOODR[k]);
  }
}
function disc(p, cx, cy, r, cols, dome = 0.25) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, q = dx * dx + dy * dy;
    if (q > 1) continue;
    const d = dx * LV[0] * dome + dy * LV[1] * dome + Math.sqrt(1 - q * dome) * LV[2];
    const k = q > 0.82 ? 0 : d > 0.86 ? 2 : 1;
    p.set(x, y, cols[k]);
  }
}
function line(p, x0, y0, x1, y1, c, th = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) || 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    if (th === 1) p.set(Math.floor(x), Math.floor(y), c);
    else p.rect(Math.round(x - th / 2), Math.round(y - th / 2), th, th, c);
  }
}
class PixCanvas {
  constructor(w, h, cls) {
    this.c = el('canvas', cls);
    this.c.width = w;
    this.c.height = h;
    this.g = this.c.getContext('2d');
    this.p = new Pix(w, h);
    this.img = this.g.createImageData(w, h);
    this.key = '';
  }
  flush() {
    this.p.outline(INK);
    this.img.data.set(this.p.data);
    this.g.putImageData(this.img, 0, 0);
  }
}

// ---------------------------------------------------------------- Harold's pocket watch 32x40
// (a small one: bow, crown, a polished case round the face, four hour bars and dots,
// the day/night window above six, two hands)
export class PocketWatch extends PixCanvas {
  constructor() { super(32, 40, 'hud-watch'); }
  draw(hour) {
    const mm = Math.floor((hour % 1) * 60);
    const key = `${Math.floor(hour)}:${Math.floor(mm / 3)}`;
    if (key === this.key) return;
    this.key = key;
    const p = this.p;
    p.data.fill(0);
    const cx = 16, cy = 23;
    // bow and knurled crown
    ring(p, cx, 3.5, 1.4, 3.3, GOLD);
    for (let x = 13; x < 19; x++) for (let y = 6; y < 8; y++) p.set(x, y, x % 2 ? GOLD[2] : GOLD[4]);
    // the case: polished outer ring and a dark bezel lip
    ring(p, cx, cy, 11.2, 15, GOLD);
    ring(p, cx, cy, 10.4, 11.2, [GOLD[0], GOLD[0], GOLD[1], GOLD[1], GOLD[2], GOLD[2]]);
    // the face
    const night = hour < 6.5 || hour > 19.6;
    disc(p, cx, cy, 10.4, night ? [0xb8b0a0, 0xd8d0bc, 0xe8e0cc] : [0xe2d0ac, 0xfff2d6, 0xfffbea]);
    // hour bars at the quarters, dots between
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      if (k % 3 === 0) line(p, cx + c * 6.6, cy + s * 6.6, cx + c * 9, cy + s * 9, 0x2a1a14);
      else p.set(Math.floor(cx + c * 8.6), Math.floor(cy + s * 8.6), 0x9a8a7a);
    }
    // day/night window above six
    p.rect(cx - 3, cy + 3, 7, 5, 0x3a2418);
    p.rect(cx - 2, cy + 4, 5, 3, night ? 0x1e2850 : 0x6fb0f0);
    if (night) { p.set(cx + 1, cy + 4, 0xf6f0c8); p.set(cx - 1, cy + 5, 0xffffff); }
    else { p.rect(cx - 1, cy + 5, 2, 2, 0xffd040); p.set(cx - 1, cy + 5, 0xfff6b0); }
    // hands: hour (2px, dark), minute (1px), red pivot
    const h12 = (hour % 12) / 12, m60 = mm / 60;
    const ha = h12 * Math.PI * 2 - Math.PI / 2, ma = m60 * Math.PI * 2 - Math.PI / 2;
    line(p, cx, cy, cx + Math.cos(ma) * 8.4, cy + Math.sin(ma) * 8.4, 0x2a1a14);
    line(p, cx, cy, cx + Math.cos(ha) * 5.2, cy + Math.sin(ha) * 5.2, 0x2a1a14, 2);
    p.rect(cx - 1, cy - 1, 2, 2, 0xc8361f);
    // glass glint
    for (const [x, y] of [[cx - 6, cy - 6], [cx - 5, cy - 7], [cx - 7, cy - 4]]) p.set(x, y, 0xffffff);
    this.flush();
  }
}

// ---------------------------------------------------------------- brass compass 44x44
export class Compass extends PixCanvas {
  constructor() { super(44, 44, 'hud-compass-dial'); }
  draw(cardDeg, needleDeg) {
    const key = `${Math.round(cardDeg / 3)}|${needleDeg == null ? 'x' : Math.round(needleDeg / 3)}`;
    if (key === this.key) return;
    this.key = key;
    const p = this.p;
    p.data.fill(0);
    const cx = 22, cy = 22;
    woodRing(p, cx, cy, 18, 21.5);
    ring(p, cx, cy, 15.5, 18, BRASS);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 - Math.PI / 2; p.rect(Math.round(cx + Math.cos(a) * 16.8) - 1, Math.round(cy + Math.sin(a) * 16.8) - 1, 2, 2, k === 0 ? 0xc8361f : BRASS[1]); }
    // brass screws in the wooden case
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const x = Math.round(cx + Math.cos(a) * 19.6) - 1, y = Math.round(cy + Math.sin(a) * 19.6) - 1; p.set(x, y, BRASS[5]); p.set(x + 1, y, BRASS[3]); p.set(x, y + 1, BRASS[3]); p.set(x + 1, y + 1, BRASS[1]); }
    ring(p, cx, cy, 15, 15.5, [BRASS[0], BRASS[0], BRASS[1], BRASS[1], BRASS[1], BRASS[2]]);
    disc(p, cx, cy, 15, [0xd8c49a, 0xf4e6c4, 0xfcf4dc]);
    // the rotating card: 16 ticks, a red N spike
    const t0 = (-cardDeg * Math.PI) / 180 - Math.PI / 2;
    for (let k = 0; k < 16; k++) {
      const a = t0 + (k / 16) * Math.PI * 2;
      const r0 = k % 4 === 0 ? 9.6 : k % 2 ? 12.4 : 11.2;
      line(p, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 13.6, cy + Math.sin(a) * 13.6, k === 0 ? 0xc8361f : 0x8a6a4a);
    }
    const nx = cx + Math.cos(t0) * 7, ny = cy + Math.sin(t0) * 7;
    for (const [dx, dy] of [[-2, -2], [-2, -1], [-2, 0], [-2, 1], [-2, 2], [2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [-1, -1], [0, 0], [1, 1]]) p.set(Math.round(nx + dx), Math.round(ny + dy), 0xc8361f);
    // the needle: red tip at the target, steel tail
    if (needleDeg != null) {
      const a = (needleDeg * Math.PI) / 180 - Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      for (let s = -1.6; s <= 1.6; s += 0.5) {
        line(p, cx + px * s, cy + py * s, cx + ca * (12.6 - Math.abs(s) * 4), cy + sa * (12.6 - Math.abs(s) * 4), s < 0 ? 0xf2603e : 0xb02818);
        line(p, cx + px * s, cy + py * s, cx - ca * (8 - Math.abs(s) * 3), cy - sa * (8 - Math.abs(s) * 3), s < 0 ? STEEL[4] : STEEL[2]);
      }
    }
    p.rect(cx - 1, cy - 1, 3, 3, BRASS[3]);
    p.set(cx - 1, cy - 1, BRASS[5]);
    for (const [x, y] of [[cx - 9, cy - 8], [cx - 8, cy - 9], [cx - 10, cy - 6], [cx - 6, cy - 10]]) p.set(x, y, 0xffffff);
    this.flush();
  }
}

// ---------------------------------------------------------------- handlebar speedometer 72x72
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function digit(p, x, y, d, c, sc = 2) {
  const g = DIG[d % 10];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r * 3 + k] === '1') p.rect(x + k * sc, y + r * sc, sc, sc, c);
}
export class Gauge extends PixCanvas {
  constructor() {
    super(72, 72, 'hud-speedo');
    this.canvas = this.c;
  }
  draw(bike, dt) {
    const p = this.p;
    p.data.fill(0);
    const cx = 36, cy = 36;
    const s = bike.stats || {};
    const top = s.topSpeed || 10;
    const k = clamp((bike.speed || 0) / (top * 1.2), 0, 1);
    woodRing(p, cx, cy, 31.5, 35);
    ring(p, cx, cy, 30, 31.5, BRASS);
    disc(p, cx, cy, 30.5, [0x1e120e, 0x2e1c16, 0x3a2418], 0.1);
    // speed arc: 24 chunky segments with gaps
    for (let i = 0; i < 24; i++) {
      const t = i / 23, on = t <= k + 1e-3;
      const col = t < 0.55 ? [0x8ed056, 0x3a5a2a] : t < 0.8 ? [0xffd84a, 0x5a4a1e] : [0xf2603e, 0x5a2418];
      const a0 = Math.PI * (0.78 + t * 1.44) - 0.045, a1 = a0 + 0.09;
      for (let a = a0; a <= a1; a += 0.02) for (let r = 26.5; r <= 29.5; r += 0.5) p.set(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r), on ? col[0] : col[1]);
    }
    // the wheel
    ring(p, cx, cy, 18, 23, [0x141012, 0x221e20, 0x2e2a2c, 0x3a3438, 0x4e484c, 0x7a7478]);
    ring(p, cx, cy, 16.5, 18, STEEL);
    const ang = bike.wheelAngle || 0;
    for (let i = 0; i < 8; i++) {
      const a = ang + (i / 8) * Math.PI;
      line(p, cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, cx - Math.cos(a) * 16, cy - Math.sin(a) * 16, 0x9aa2ae);
    }
    // chainring with teeth, holding the km/h (the gear is on the crank: see crank.js)
    const cr = bike.crank || 0;
    for (let i = 0; i < 14; i++) {
      const a = cr + (i / 14) * Math.PI * 2;
      p.rect(Math.round(cx + Math.cos(a) * 11.4) - 1, Math.round(cy + Math.sin(a) * 11.4) - 1, 2, 2, GOLD[2]);
    }
    ring(p, cx, cy, 7.5, 10.6, GOLD);
    disc(p, cx, cy, 7.5, [0x2a1810, 0x3a2418, 0x3a2418], 0);
    const kmh = String(Math.min(99, Math.round((bike.speed || 0) * 3.6)));
    const w = kmh.length * 7 - 1;
    for (let i = 0; i < kmh.length; i++) digit(p, cx - Math.floor(w / 2) + i * 7, cy - 5, +kmh[i], 0xffdc5a);
    this.flush();
  }
}

// ---------------------------------------------------------------- the HUD
export function buildPaperHUD(ui) {
  const h = el('div', 'k-hud k-text');
  h.id = 'hud';
  ui.hud = h;
  // pocket watch, day plate and coin pouch (top left). Only the watch stays: the day
  // plate shows as a day starts (and in menus), the pouch when the money changes (and
  // in menus); tapping the watch peeks at both
  const tl = el('div', 'hud-tl');
  ui.watch = new PocketWatch();
  tl.appendChild(ui.watch.c);
  const col = el('div', 'hud-tlcol');
  const day = el('div', 'k-plate k-dark hud-day off', '<img class="k-g wx"><span class="d">Day 1</span>');
  const money = el('div', 'hud-money off', `<img class="pouch" src="${iconURL('pouch')}"><span class="k-plate k-dark k-bold m"></span>`);
  col.append(day, money);
  tl.appendChild(col);
  h.appendChild(tl);
  ui.dayEl = day;
  ui.elDay = day.querySelector('.d');
  ui.elWx = day.querySelector('.wx');
  ui.elMoney = money.querySelector('.m');
  ui.pouchEl = money;
  ui.hudT = { day: 0, cash: 0, peek: 0, fast: 0, slow: 0, obj: 0 };
  ui.watch.c.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ui.hudT.peek = ui.hudT.peek > 0 ? 0 : 4;
  });
  // compass (top centre)
  // (only while there's somewhere to go: see updateCompassP)
  const cw = el('div', 'hud-compass off');
  ui.compassEl = cw;
  ui.compassP = new Compass();
  cw.appendChild(ui.compassP.c);
  ui.compassLbl = el('div', 'k-plate k-dark hud-dist');
  cw.appendChild(ui.compassLbl);
  h.appendChild(cw);
  // centred with 50%: kit.js keeps it on whole device pixels (.hud-compass is in its snap list)
  // Nana's list (top right): only while there's something on it; tap it to fold it
  // down to its title
  const note = el('div', 'hud-note hud-clip empty');
  note.innerHTML = '<i class="clip"></i><div class="pad nb-ruled"><div class="ttl k-bold">Nana\'s list<span class="n"></span></div><div class="rows"></div><div class="obj"></div><div class="foot"></div></div>';
  h.appendChild(note);
  note.addEventListener('pointerdown', (e) => {
    if (note.classList.contains('empty')) return;
    e.stopPropagation();
    note.classList.toggle('folded');
  });
  ui.noteEl = note;
  ui.noteRows = note.querySelector('.rows');
  ui.objective = note.querySelector('.obj');
  ui.orderCards = new Map();
  // handlebar speedometer (bottom left)
  const g = el('div', 'hud-gauge');
  g.appendChild(ui.gauge.canvas);
  h.appendChild(g);
  ui.gaugeEl = g;
  // prompt: what E does right now
  ui.promptEl = el('div', 'k-plate k-dark hud-prompt');
  h.appendChild(ui.promptEl);
  ui.root.appendChild(h);
}

const WX = { clear: 'sun', breezy: 'wind', misty: 'fog', overcast: 'cloud', rain: 'rain', snow: 'snow' };
export function updatePaperHUD(ui, dt) {
  const g = ui.game;
  const st = g.state;
  if (!st || !g.bike) return;
  const atm = g.world.atmosphere;
  const hr = atm.hour;
  const T = ui.hudT;
  ui.watch.draw(hr);
  const day = `Day ${st.day}`;
  if (ui.elDay.textContent !== day) { ui.elDay.textContent = day; T.day = 6; }
  const night = hr < 6.5 || hr > 19.6;
  let wx = WX[atm.weatherTarget] || 'sun';
  if (wx === 'sun' && night) wx = 'moon';
  if (ui.elWx.dataset.i !== wx) { ui.elWx.src = glyphURL(wx); ui.elWx.dataset.i = wx; }
  const money = `$${Math.floor(st.money)}`;
  if (ui.elMoney.textContent !== money) {
    if (ui.elMoney.textContent) { T.cash = 4; ui.pouchEl.classList.remove('jingle'); void ui.pouchEl.offsetWidth; ui.pouchEl.classList.add('jingle'); }
    ui.elMoney.textContent = money;
  }
  // riding fast, the HUD gets out of the way (the watch fades, the list shrinks to its
  // cups); slow down or stop and it all comes back
  const sp = g.onFoot ? g.walker?.speed || 0 : g.bike.speed || 0;
  T.fastT = sp > (g.onFoot ? 6.5 : 4.5) ? (T.fastT || 0) + dt : 0;
  T.slowT = sp < 2.2 ? (T.slowT || 0) + dt : 0;
  if (!T.fast && T.fastT > 1.2) T.fast = true;
  else if (T.fast && T.slowT > 0.6) T.fast = false;
  const menu = ui.menuStack.length > 0;
  T.day -= dt;
  T.cash -= dt;
  T.peek -= dt;
  const peek = T.peek > 0 || menu;
  ui.hud.classList.toggle('fast', !!T.fast && !peek);
  ui.dayEl.classList.toggle('off', !(peek || T.day > 0));
  ui.pouchEl.classList.toggle('off', !(peek || T.cash > 0));
  // the speedometer only matters on the bike
  const gaugeOn = !g.onFoot;
  ui.gaugeEl.classList.toggle('away', !gaugeOn);
  if (gaugeOn) ui.gauge.draw(g.bike, dt);
  updateNote(ui, dt);
  updateCompassP(ui);
  // now and then a leaf blows in and gets caught on the clipboard's clip for a while
  ui._leafT = (ui._leafT ?? 14 + Math.random() * 10) - dt;
  if (ui._leafT <= 0) {
    ui._leafT = 35 + Math.random() * 45;
    if (g.mode === 'ride' && !ui.noteEl.classList.contains('empty') && !ui.hud.classList.contains('hidden')) leaves.catchOn(ui.noteEl.querySelector('.clip'));
  }
}

const SHORT = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes', mo: 'Mo' };
const MUGS = new Set(['classic', 'maple', 'mint', 'pumpkin', 'cinnamon', 'mocha']);
function mugOf(o) {
  if (MUGS.has(o.cocoa)) return o.cocoa;
  const l = (o.label || '').toLowerCase();
  for (const k of MUGS) if (l.includes(k)) return k;
  if (l.includes('spice')) return 'pumpkin';
  if (l.includes('lumberjack')) return 'mocha';
  return 'classic';
}

// Nana's list: the cups being carried (a tick box, the mug, who, a little
// thermometer), ticked off and crossed out for a few seconds once delivered,
// then quest lines written underneath.
const DONE_MS = 8000;
const HEAT_CSS = 'width:calc(var(--u)*30);height:calc(var(--u)*6);margin-left:calc(var(--u)*12);background:linear-gradient(90deg,#d8e8f6,#f6e6c8)';
// a little drawn face at the bar's end: beaming while hot, frozen once cold
const FACE_CSS = 'position:absolute;left:calc(var(--u)*-14);top:calc(var(--u)*-5);width:calc(var(--u)*16);height:calc(var(--u)*16);image-rendering:pixelated';
function updateNote(ui, dt) {
  const g = ui.game;
  const list = g.orders?.list || [];
  const now = performance.now();
  ui._doneAt = ui._doneAt || new Map();
  const orders = list.filter((o) => o.state === 'carried' || (o.state === 'delivered' && ui.orderCards.has(o.id) && now - (ui._doneAt.get(o.id) ?? now) < DONE_MS));
  const extra = g.quests?.noteLines?.() || [];
  const seen = new Set();
  for (const o of orders) {
    seen.add(o.id);
    let r = ui.orderCards.get(o.id);
    if (!r) {
      r = el('div', 'nrow');
      const who = SHORT[o.customer] || CHARACTERS[o.customer]?.name?.split(' ')[0] || o.customer;
      r.innerHTML = `<i class="bx"></i><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="who">${esc(who)}</span>${o.rush ? `<img class="k-g rush" src="${glyphURL('rush')}">` : ''}<span class="heat" style="${HEAT_CSS}"><i style="border-radius:0"></i><img style="${FACE_CSS}" alt=""></span>`;
      const firstQuest = ui.noteRows.querySelector('.qrow');
      ui.noteRows.insertBefore(r, firstQuest);
      ui.orderCards.set(o.id, r);
    }
    if (o.state === 'delivered') {
      if (!ui._doneAt.has(o.id)) {
        ui._doneAt.set(o.id, now);
        // ticked off: a burst of leaves off the line, and out of the coin pouch
        leaves.burstFrom(r, 14);
        leaves.burstFrom(ui.pouchEl, 6);
      }
      r.classList.add('done');
      continue;
    }
    // a temperature bar from hot red-orange down to cold blue, with a face on the end
    const q = clamp(o.quality, 0, 100);
    const px = Math.round((q / 100) * 30);
    const hEl = r.querySelector('.heat');
    // a crash knocked the heat out of it: the thermometer shivers and flashes cold
    if ((o.chills || 0) !== (+r.dataset.chills || 0)) {
      r.dataset.chills = o.chills || 0;
      hEl.animate?.([
        { transform: 'translateX(0)', filter: 'none' }, { transform: 'translateX(calc(var(--u) * -2))', filter: 'hue-rotate(160deg) brightness(1.3)' },
        { transform: 'translateX(calc(var(--u) * 2))', filter: 'hue-rotate(160deg) brightness(1.3)' }, { transform: 'translateX(calc(var(--u) * -1))', filter: 'hue-rotate(100deg)' },
        { transform: 'translateX(0)', filter: 'none' },
      ], { duration: 700, easing: 'steps(4, jump-end)' }); // lands on the keyframes: whole pixels only
    }
    if (hEl.dataset.p !== String(px)) {
      hEl.dataset.p = px;
      const T = cupTemp(q);
      const f = hEl.firstChild;
      f.style.width = `calc(var(--u) * ${px})`;
      f.style.background = `linear-gradient(180deg, rgba(255,255,255,0.45) 0 var(--u), ${T.color} var(--u) calc(100% - var(--u)), rgba(0,0,0,0.25) calc(100% - var(--u)))`;
      const mood = tempMood(q);
      if (hEl.lastChild.dataset.m !== mood) { hEl.lastChild.dataset.m = mood; hEl.lastChild.src = tempFaceURL(mood); }
      hEl.title = `${T.word} (${T.deg}\u00b0C)`;
      hEl.className = `heat ${q > 60 ? '' : q > 30 ? 'warm' : 'cool'}`;
      r.classList.toggle('cold', q <= 12);
    }
  }
  for (const [id, r] of ui.orderCards) if (!seen.has(id)) { r.remove(); ui.orderCards.delete(id); ui._doneAt.delete(id); }
  // quest lines (lost cats, saplings...) written under the orders
  const key = extra.join('|');
  if (ui._extraKey !== key) {
    ui._extraKey = key;
    ui.noteRows.querySelectorAll('.qrow').forEach((e) => e.remove());
    for (const t of extra) ui.noteRows.appendChild(el('div', 'nrow qrow', `<i class="bx"></i><span>${esc(t)}</span>`));
  }
  // the objective line: for a while after it changes, and again once Hank stops for a
  // moment ("all done" lines only the once)
  const T = ui.hudT, txt = ui.objective.textContent;
  T.obj -= dt;
  const objOn = !!txt && (T.obj > 0 || (T.slowT > 2.5 && !/^all done\b/i.test(txt)));
  if (ui.objective.classList.contains('on') !== objOn) ui.objective.classList.toggle('on', objOn);
  const n = orders.filter((o) => o.state === 'carried').length + extra.length;
  const ns = n ? String(n) : '';
  const nEl = ui.noteEl.querySelector('.ttl .n');
  if (nEl.textContent !== ns) nEl.textContent = ns;
  // (touch screens keep the objective off the list: see notebook.css)
  const empty = !orders.length && !extra.length && !(objOn && !ui.root.classList.contains('touchmode'));
  if (ui.noteEl.classList.contains('empty') !== empty) ui.noteEl.classList.toggle('empty', empty);
  const cups = orders.length > 0;
  if (ui.noteEl.classList.contains('cups') !== cups) ui.noteEl.classList.toggle('cups', cups);
}

// a 16px picture for a compass target
const SMALL = { cocoa: () => glyphURL('cocoa'), home: () => glyphURL('home'), star: () => glyphURL('star'), coin: () => glyphURL('coin') };
const markIcon = (name) => (SMALL[name] ? SMALL[name]() : iconSmallURL(name));

function updateCompassP(ui) {
  const g = ui.game;
  const cam = g.camera;
  const dir = cam.getWorldDirection(ui._dir || (ui._dir = new cam.position.constructor()));
  const heading = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  const marks = g.compassMarkers ? g.compassMarkers() : [];
  const p = g.playerPos;
  let best = null;
  for (const m of marks) {
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (!best || d < best.d) best = { ...m, d };
  }
  // just the way home, with nothing to fetch there and the day still young, is no target
  const goal = !!best && (marks.some((m) => m.id !== 'home') || g.world.atmosphere.hour >= 17 || (g.orders?.board?.().length || 0) > 0);
  if (ui.compassEl.classList.contains('off') === goal) ui.compassEl.classList.toggle('off', !goal);
  if (!goal) return;
  const needle = (Math.atan2(best.x - p.x, -(best.z - p.z)) * 180) / Math.PI - heading;
  ui.compassP.draw(heading, needle);
  const txt = best ? (best.d < 1000 ? `${Math.round(best.d)} m` : `${(best.d / 1000).toFixed(1)} km`) : '';
  const k = txt + (best?.icon || '');
  if (ui.compassLbl.dataset.t !== k) {
    ui.compassLbl.dataset.t = k;
    ui.compassLbl.innerHTML = best ? `<img class="k-g" src="${markIcon(best.icon)}"><span>${txt}</span>` : '';
    ui.compassLbl.classList.toggle('off', !best);
  }
}
