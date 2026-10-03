// The HUD as physical things, drawn as pixel art at the kit's integer scale:
// Harold's brass pocket watch, the day plate, a coin pouch, a brass compass in a
// turned-wood case whose needle points at the next stop, Nana's list (a little
// spiral notepad on a clipboard) and the handlebar speedometer.
import { iconURL, glyphURL, iconSmallURL } from '../art/icons.js';
import { CHARACTERS } from '../art/characters.js';
import { Pix } from '../art/pixel.js';
import { el, esc, snapBox, onScale } from './kit.js';
import { cupTemp } from '../game/orders.js';

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

// ---------------------------------------------------------------- Harold's pocket watch 44x54
export class PocketWatch extends PixCanvas {
  constructor() { super(44, 54, 'hud-watch'); }
  draw(hour) {
    const mm = Math.floor((hour % 1) * 60);
    const key = `${Math.floor(hour)}:${Math.floor(mm / 2)}`;
    if (key === this.key) return;
    this.key = key;
    const p = this.p;
    p.data.fill(0);
    const cx = 22, cy = 31;
    // bow and knurled crown
    ring(p, cx, 6, 2.2, 4.6, GOLD);
    for (let x = 18; x < 26; x++) for (let y = 9; y < 12; y++) p.set(x, y, x % 2 ? GOLD[2] : GOLD[4]);
    p.rect(19, 12, 6, 2, GOLD[2]);
    // the case: polished outer ring, an engraved inner ring, dark bezel lip
    ring(p, cx, cy, 15.5, 20.5, GOLD);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; p.set(Math.floor(cx + Math.cos(a) * 18 ), Math.floor(cy + Math.sin(a) * 18), k % 2 ? GOLD[1] : GOLD[2]); }
    ring(p, cx, cy, 14.5, 15.5, [GOLD[0], GOLD[0], GOLD[1], GOLD[1], GOLD[2], GOLD[2]]);
    // the face
    const night = hour < 6.5 || hour > 19.6;
    disc(p, cx, cy, 14.5, night ? [0xb8b0a0, 0xd8d0bc, 0xe8e0cc] : [0xe2d0ac, 0xfff2d6, 0xfffbea]);
    // minute dots and hour bars
    for (let k = 0; k < 60; k += 5) {
      const a = (k / 60) * Math.PI * 2 - Math.PI / 2;
      const big = k % 15 === 0;
      line(p, cx + Math.cos(a) * (big ? 9.6 : 11.2), cy + Math.sin(a) * (big ? 9.6 : 11.2), cx + Math.cos(a) * 12.8, cy + Math.sin(a) * 12.8, big ? 0x2a1a14 : 0x7a6a5a);
    }
    // day/night window above six
    p.rect(cx - 4, cy + 4, 9, 6, 0x3a2418);
    p.rect(cx - 3, cy + 5, 7, 4, night ? 0x1e2850 : 0x6fb0f0);
    if (night) { p.rect(cx + 1, cy + 5, 2, 2, 0xf6f0c8); p.set(cx + 2, cy + 5, 0x1e2850); p.set(cx - 2, cy + 7, 0xffffff); }
    else { p.rect(cx - 1, cy + 6, 3, 3, 0xffd040); p.set(cx, cy + 6, 0xfff6b0); }
    // hands: hour (2px, dark), minute (1px), red seconds pivot
    const h12 = (hour % 12) / 12, m60 = mm / 60;
    const ha = h12 * Math.PI * 2 - Math.PI / 2, ma = m60 * Math.PI * 2 - Math.PI / 2;
    line(p, cx, cy, cx + Math.cos(ma) * 11.4, cy + Math.sin(ma) * 11.4, 0x2a1a14);
    line(p, cx, cy, cx + Math.cos(ha) * 7.2, cy + Math.sin(ha) * 7.2, 0x2a1a14, 2);
    p.rect(cx - 1, cy - 1, 2, 2, 0xc8361f);
    // glass glint
    for (const [x, y] of [[cx - 9, cy - 8], [cx - 8, cy - 9], [cx - 7, cy - 10], [cx - 10, cy - 6]]) p.set(x, y, 0xffffff);
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
    this.shiftFlash = 0;
    this.lastGear = 1;
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
    // chainring with teeth, holding the gear number
    const cr = bike.crank || 0;
    for (let i = 0; i < 14; i++) {
      const a = cr + (i / 14) * Math.PI * 2;
      p.rect(Math.round(cx + Math.cos(a) * 11.4) - 1, Math.round(cy + Math.sin(a) * 11.4) - 1, 2, 2, GOLD[2]);
    }
    ring(p, cx, cy, 7.5, 10.6, GOLD);
    disc(p, cx, cy, 7.5, [0x2a1810, 0x3a2418, 0x3a2418], 0);
    const g = Math.max(1, bike.gear || 1);
    if (g !== this.lastGear) { this.shiftFlash = 0.35; this.lastGear = g; }
    this.shiftFlash = Math.max(0, this.shiftFlash - dt);
    if (g >= 10) { digit(p, cx - 6, cy - 5, Math.floor(g / 10), 0xffdc5a); digit(p, cx + 1, cy - 5, g % 10, 0xffdc5a); }
    else digit(p, cx - 3, cy - 5, g, this.shiftFlash > 0 ? 0xffffff : 0xffdc5a);
    // gear pips along the bottom
    const n = s.gears || 1;
    if (n > 1 && n <= 12) {
      const pw = Math.min(5, Math.floor(30 / n));
      for (let i = 0; i < n; i++) p.rect(Math.round(cx - (n * pw) / 2 + i * pw), 61, Math.max(1, pw - 1), 3, i < g ? 0xffdc5a : 0x5a3a1e);
    }
    // km/h readout
    const kmh = String(Math.round((bike.speed || 0) * 3.6));
    const w = kmh.length * 4 - 1;
    for (let i = 0; i < kmh.length; i++) digit(p, cx - Math.floor(w / 2) + i * 4, 52, +kmh[i], 0xfff4dc, 1);
    this.flush();
  }
}

// ---------------------------------------------------------------- the HUD
export function buildPaperHUD(ui) {
  const h = el('div', 'k-hud k-text');
  h.id = 'hud';
  ui.hud = h;
  // pocket watch, day plate and coin pouch (top left)
  const tl = el('div', 'hud-tl');
  ui.watch = new PocketWatch();
  tl.appendChild(ui.watch.c);
  const col = el('div', 'hud-tlcol');
  const day = el('div', 'k-plate k-dark hud-day', '<img class="k-g wx"><span class="d">Day 1</span>');
  const money = el('div', 'hud-money', `<img class="pouch" src="${iconURL('pouch')}"><span class="k-plate k-dark k-bold m">$0</span>`);
  col.append(day, money);
  tl.appendChild(col);
  h.appendChild(tl);
  ui.elDay = day.querySelector('.d');
  ui.elWx = day.querySelector('.wx');
  ui.elMoney = money.querySelector('.m');
  ui.pouchEl = money;
  // compass (top centre)
  const cw = el('div', 'hud-compass');
  ui.compassP = new Compass();
  cw.appendChild(ui.compassP.c);
  ui.compassLbl = el('div', 'k-plate k-dark hud-dist');
  cw.appendChild(ui.compassLbl);
  h.appendChild(cw);
  // the compass is centred with 50%: nudge it onto whole device pixels
  const resnap = () => requestAnimationFrame(() => snapBox(cw));
  window.addEventListener('resize', resnap);
  onScale(resnap);
  resnap();
  // Nana's list (top right)
  const note = el('div', 'hud-note hud-clip');
  note.innerHTML = '<i class="clip"></i><div class="pad nb-ruled"><div class="ttl k-bold">Nana\'s list</div><div class="rows"></div><div class="obj"></div><div class="foot"></div></div>';
  h.appendChild(note);
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
  ui.watch.draw(hr);
  const day = `Day ${st.day}`;
  if (ui.elDay.textContent !== day) ui.elDay.textContent = day;
  const night = hr < 6.5 || hr > 19.6;
  let wx = WX[atm.weatherTarget] || 'sun';
  if (wx === 'sun' && night) wx = 'moon';
  if (ui.elWx.dataset.i !== wx) { ui.elWx.src = glyphURL(wx); ui.elWx.dataset.i = wx; }
  const money = `$${Math.floor(st.money)}`;
  if (ui.elMoney.textContent !== money) {
    if (ui.elMoney.textContent && ui.elMoney.textContent !== '$0') { ui.pouchEl.classList.remove('jingle'); void ui.pouchEl.offsetWidth; ui.pouchEl.classList.add('jingle'); }
    ui.elMoney.textContent = money;
  }
  // the speedometer only matters on the bike
  const gaugeOn = !g.onFoot;
  ui.gaugeEl.classList.toggle('away', !gaugeOn);
  if (gaugeOn) ui.gauge.draw(g.bike, dt);
  updateNote(ui);
  updateCompassP(ui);
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
const HEAT_CSS = 'width:calc(var(--u)*30);height:calc(var(--u)*6);margin-left:calc(var(--u)*5);background:linear-gradient(90deg,#d8e8f6,#f6e6c8)';
const BULB_CSS = 'position:absolute;left:calc(var(--u)*-6);top:calc(var(--u)*-2);width:calc(var(--u)*8);height:calc(var(--u)*10);border-radius:50%;box-shadow:0 0 0 var(--u) var(--nb-pencil)';
function updateNote(ui) {
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
      r.innerHTML = `<i class="bx"></i><img class="k-g" src="${glyphURL(`mug_${mugOf(o)}`)}"><span class="who">${esc(who)}</span>${o.rush ? `<img class="k-g rush" src="${glyphURL('rush')}">` : ''}<span class="heat" style="${HEAT_CSS}"><i style="border-radius:0"></i><b style="${BULB_CSS}"></b></span>`;
      const firstQuest = ui.noteRows.querySelector('.qrow');
      ui.noteRows.insertBefore(r, firstQuest);
      ui.orderCards.set(o.id, r);
    }
    if (o.state === 'delivered') {
      if (!ui._doneAt.has(o.id)) ui._doneAt.set(o.id, now);
      r.classList.add('done');
      continue;
    }
    // a thermometer: bulb + temperature bar from hot red-orange down to cold blue
    const q = clamp(o.quality, 0, 100);
    const px = Math.round((q / 100) * 30);
    const hEl = r.querySelector('.heat');
    if (hEl.dataset.p !== String(px)) {
      hEl.dataset.p = px;
      const T = cupTemp(q);
      const f = hEl.firstChild;
      f.style.width = `calc(var(--u) * ${px})`;
      f.style.background = `linear-gradient(180deg, rgba(255,255,255,0.45) 0 var(--u), ${T.color} var(--u) calc(100% - var(--u)), rgba(0,0,0,0.25) calc(100% - var(--u)))`;
      hEl.lastChild.style.background = T.color;
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
  ui.noteEl.classList.toggle('empty', !orders.length && !extra.length && !ui.objective.textContent);
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
  let needle = null;
  if (best) needle = (Math.atan2(best.x - p.x, -(best.z - p.z)) * 180) / Math.PI - heading;
  ui.compassP.draw(heading, needle);
  const txt = best ? (best.d < 1000 ? `${Math.round(best.d)} m` : `${(best.d / 1000).toFixed(1)} km`) : '';
  const k = txt + (best?.icon || '');
  if (ui.compassLbl.dataset.t !== k) {
    ui.compassLbl.dataset.t = k;
    ui.compassLbl.innerHTML = best ? `<img class="k-g" src="${markIcon(best.icon)}"><span>${txt}</span>` : '';
    ui.compassLbl.classList.toggle('off', !best);
  }
}
