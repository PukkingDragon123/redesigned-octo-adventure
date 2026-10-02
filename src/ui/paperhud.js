// The HUD as physical things: Harold's brass pocket watch, a coin pouch, Nana's
// hand-written order list pinned to the corner, a little compass whose needle
// points at the next stop, and the bike's handlebar speedometer.
import { iconURL } from '../art/icons.js';
import { foodIconURL } from '../art/foodsprites.js';
import { CHARACTERS } from '../art/characters.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ---------------------------------------------------------------- pixel canvases
function pixCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  return { c, g, px };
}
function disc(px, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, col);
}
function lineP(px, x0, y0, x1, y1, col, th = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 || 1;
  for (let i = 0; i <= n; i++) px(x0 + ((x1 - x0) * i) / n - th / 2 + 0.5, y0 + ((y1 - y0) * i) / n - th / 2 + 0.5, col, th, th);
}

// Harold's pocket watch: 40x48 px
class PocketWatch {
  constructor() {
    const P = pixCanvas(40, 48);
    Object.assign(this, P);
    this.key = '';
  }
  draw(hour) {
    const mm = Math.floor((hour % 1) * 60);
    const key = `${Math.floor(hour)}:${Math.floor(mm / 2)}`;
    if (key === this.key) return;
    this.key = key;
    const { g, px } = this;
    g.clearRect(0, 0, 40, 48);
    const cx = 20, cy = 27;
    // bow ring & crown
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      px(cx + Math.cos(t) * 4.5, 4.5 + Math.sin(t) * 3.5, a < 20 ? '#f6d27a' : '#a8741e');
    }
    px(cx - 2, 7, '#c8902e', 4, 3);
    px(cx - 1, 6, '#f6d27a', 2, 1);
    // case: dark rim, gold, highlight
    disc(px, cx, cy, 18, '#3a2410');
    disc(px, cx, cy, 17, '#a8741e');
    disc(px, cx, cy, 16, '#e8b44a');
    for (let a = 0; a < 30; a++) { const t = Math.PI * (1.05 + (a / 30) * 0.5); px(cx + Math.cos(t) * 15.5, cy + Math.sin(t) * 15.5, '#fff0b8'); }
    disc(px, cx, cy, 14, '#6a4418');
    // face
    const night = hour < 6.5 || hour > 19.6;
    disc(px, cx, cy, 13, night ? '#d8d0bc' : '#fff6e0');
    // ticks
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2 - Math.PI / 2;
      const r0 = k % 3 === 0 ? 9.5 : 11, r1 = 12;
      lineP(px, cx + Math.cos(t) * r0, cy + Math.sin(t) * r0, cx + Math.cos(t) * r1, cy + Math.sin(t) * r1, '#3a2418');
    }
    // little day/night window at the bottom
    px(cx - 3, cy + 4, '#3a2418', 7, 5);
    px(cx - 2, cy + 5, night ? '#1e2850' : '#6fa8e8', 5, 3);
    if (night) { px(cx, cy + 5, '#f6f0c8', 2, 2); px(cx + 1, cy + 5, '#1e2850'); }
    else px(cx - 1, cy + 5, '#ffd040', 3, 3);
    // hands
    const h12 = (hour % 12) / 12, m60 = mm / 60;
    const ha = h12 * Math.PI * 2 - Math.PI / 2, ma = m60 * Math.PI * 2 - Math.PI / 2;
    lineP(px, cx, cy, cx + Math.cos(ma) * 10.5, cy + Math.sin(ma) * 10.5, '#2a1a14', 1);
    lineP(px, cx, cy, cx + Math.cos(ha) * 7, cy + Math.sin(ha) * 7, '#2a1a14', 2);
    px(cx - 1, cy - 1, '#c8361f', 2, 2);
  }
}

// a little cloth coin pouch: 26x26 px
function pouchCanvas() {
  const { c, px } = pixCanvas(26, 26);
  const body = '#8a5a32', dark = '#5a3420', lite = '#b07a48';
  for (let y = 9; y < 25; y++) {
    const w = Math.round(9 + Math.sin(((y - 9) / 16) * Math.PI) * 3.5);
    for (let x = -w; x <= w; x++) px(13 + x, y, Math.abs(x) === w || y === 24 ? dark : x < -w + 3 ? lite : body);
  }
  // cinched neck + tassel string
  for (let x = 8; x <= 18; x++) px(x, 8, dark);
  for (let x = 7; x <= 19; x++) px(x, 6 + (x % 2), x % 3 ? body : lite);
  px(9, 9, '#c8361f', 8, 1);
  px(19, 9, '#c8361f'); px(20, 10, '#c8361f'); px(20, 11, '#e8d070');
  // coin peeking out
  px(11, 3, '#a87a1e', 5, 4); px(12, 3, '#f6d27a', 3, 3);
  return c.toDataURL();
}

// brass compass: 34x34; needle points at a world heading relative to the camera
class Compass {
  constructor() {
    Object.assign(this, pixCanvas(34, 34));
    this.key = '';
  }
  draw(cardDeg, needleDeg) {
    const key = `${Math.round(cardDeg / 4)}|${needleDeg == null ? 'x' : Math.round(needleDeg / 4)}`;
    if (key === this.key) return;
    this.key = key;
    const { g, px } = this;
    g.clearRect(0, 0, 34, 34);
    const cx = 17, cy = 17;
    disc(px, cx, cy, 16, '#3a2410');
    disc(px, cx, cy, 15, '#c8902e');
    disc(px, cx, cy, 13, '#f2e6c8');
    // rotating card: N mark
    const t = ((-cardDeg) * Math.PI) / 180 - Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = t + (k / 8) * Math.PI * 2;
      const r0 = k % 2 ? 11 : 9;
      lineP(px, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 12.5, cy + Math.sin(a) * 12.5, k === 0 ? '#c8361f' : '#6a4a3a');
    }
    // the N letter
    const nx = cx + Math.cos(t) * 7.5, ny = cy + Math.sin(t) * 7.5;
    px(nx - 1.5, ny - 1.5, '#c8361f', 1, 4); px(nx + 1.5, ny - 1.5, '#c8361f', 1, 4); px(nx - 0.5, ny - 0.5, '#c8361f'); px(nx + 0.5, ny + 0.5, '#c8361f');
    // the needle points at the target
    if (needleDeg != null) {
      const a = (needleDeg * Math.PI) / 180 - Math.PI / 2;
      lineP(px, cx - Math.cos(a) * 6, cy - Math.sin(a) * 6, cx, cy, '#3a4a6a', 2);
      lineP(px, cx, cy, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, '#d8301e', 2);
    }
    disc(px, cx, cy, 1, '#f6d27a');
    // glass glint
    px(cx - 8, cy - 9, '#ffffff', 3, 1); px(cx - 9, cy - 8, '#ffffff', 1, 2);
  }
}

// ---------------------------------------------------------------- the HUD
export function buildPaperHUD(ui) {
  const h = el('div');
  h.id = 'hud';
  h.classList.add('paper-hud');
  ui.hud = h;
  // pocket watch + day tag + coin pouch (top-left)
  const tl = el('div', 'ph-tl');
  ui.watch = new PocketWatch();
  ui.watch.c.className = 'ph-watch';
  tl.appendChild(ui.watch.c);
  const tag = el('div', 'ph-daytag', `<span class="d">Day 1</span><img class="wx">`);
  tl.appendChild(tag);
  const pouch = el('div', 'ph-pouch', `<img src="${pouchCanvas()}"><span class="m">$0</span>`);
  tl.appendChild(pouch);
  h.appendChild(tl);
  ui.elDay = tag.querySelector('.d');
  ui.elWx = tag.querySelector('.wx');
  ui.elMoney = pouch.querySelector('.m');
  ui.pouchEl = pouch;
  // compass (top centre)
  const cw = el('div', 'ph-compass');
  ui.compassP = new Compass();
  cw.appendChild(ui.compassP.c);
  ui.compassLbl = el('div', 'ph-dist');
  cw.appendChild(ui.compassLbl);
  h.appendChild(cw);
  // Nana's list (top right)
  const note = el('div', 'ph-note');
  note.innerHTML = `<div class="pin"></div><div class="ttl">Nana's list</div><div class="rows"></div><div class="obj"></div>`;
  h.appendChild(note);
  ui.noteEl = note;
  ui.noteRows = note.querySelector('.rows');
  ui.objective = note.querySelector('.obj');
  ui.orderCards = new Map();
  // handlebar speedometer (bottom-left) stays a little pixel gauge
  const g = el('div', 'hud-gauge ph-gauge');
  g.appendChild(ui.gauge.canvas);
  ui.boosts = el('div', 'hud-boosts');
  g.appendChild(ui.boosts);
  h.appendChild(g);
  // prompt: a paper tag with an ink key
  ui.promptEl = el('div', 'ph-prompt');
  h.appendChild(ui.promptEl);
  ui.root.appendChild(h);
}

export function updatePaperHUD(ui, dt) {
  const g = ui.game;
  const st = g.state;
  if (!st || !g.bike) return;
  const hr = g.world.atmosphere.hour;
  ui.watch.draw(hr);
  const day = `Day ${st.day}`;
  if (ui.elDay.textContent !== day) ui.elDay.textContent = day;
  const night = hr < 6.5 || hr > 19.6;
  const wx = { clear: night ? 'star' : 'sun', breezy: 'leaf', misty: 'fog', overcast: 'fog', rain: 'rain', snow: 'snowflake' }[g.world.atmosphere.weatherTarget] || 'sun';
  if (ui.elWx.dataset.i !== wx) { ui.elWx.src = iconURL(wx); ui.elWx.dataset.i = wx; }
  const money = `$${Math.floor(st.money)}`;
  if (ui.elMoney.textContent !== money) {
    if (ui.elMoney.textContent && ui.elMoney.textContent !== '$0') { ui.pouchEl.classList.remove('jingle'); void ui.pouchEl.offsetWidth; ui.pouchEl.classList.add('jingle'); }
    ui.elMoney.textContent = money;
  }
  // the speedometer only matters on the bike
  const gaugeOn = !g.onFoot;
  ui.gauge.canvas.parentElement.classList.toggle('away', !gaugeOn);
  if (gaugeOn) ui.gauge.draw(g.bike, dt);
  const total = g.bike.stats.boostCharges;
  if (ui.boosts.childElementCount !== total) {
    ui.boosts.innerHTML = '';
    for (let i = 0; i < total; i++) ui.boosts.appendChild(el('img')).src = iconURL('cola');
  }
  [...ui.boosts.children].forEach((img, i) => img.classList.toggle('used', i >= g.bike.boostCharges));
  updateNote(ui);
  updateCompassP(ui);
}

const SHORT = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes' };
const FOOD_OF = (o) => {
  const l = (o.label || '').toLowerCase();
  if (l.includes('maple')) return 'cocoa_maple';
  if (l.includes('mint')) return 'cocoa_mint';
  if (l.includes('pumpkin')) return 'cocoa_pumpkin';
  if (l.includes('cinnamon') || l.includes('spice')) return 'cocoa_cinnamon';
  if (l.includes('mocha') || l.includes('lumberjack')) return 'cocoa_mocha';
  return o.food || 'cocoa_classic';
};

function updateNote(ui) {
  const g = ui.game;
  const orders = g.orders?.carried() || [];
  const extra = g.quests?.noteLines?.() || [];
  const seen = new Set();
  for (const o of orders) {
    seen.add(o.id);
    let r = ui.orderCards.get(o.id);
    if (!r) {
      r = el('div', 'nrow');
      const who = SHORT[o.customer] || CHARACTERS[o.customer]?.name?.split(' ')[0] || o.customer;
      r.innerHTML = `<img class="fi" src="${foodIconURL(FOOD_OF(o))}"><span class="who">${who}</span><span class="steam"></span>${o.rush ? '<span class="rush">rush!</span>' : ''}`;
      ui.noteRows.appendChild(r);
      ui.orderCards.set(o.id, r);
    }
    const q = o.quality;
    const steam = q > 70 ? 'sss' : q > 45 ? 'ss' : q > 22 ? 's' : 'cold';
    const sEl = r.querySelector('.steam');
    if (sEl.dataset.s !== steam) {
      sEl.dataset.s = steam;
      sEl.className = `steam s-${steam}`;
      sEl.textContent = steam === 'cold' ? '*brr*' : '~'.repeat(steam.length);
    }
    r.classList.toggle('done', o.state === 'delivered');
  }
  for (const [id, r] of ui.orderCards) if (!seen.has(id)) { r.remove(); ui.orderCards.delete(id); }
  // quest lines (lost cats, saplings...) written under the orders
  const key = extra.join('|');
  if (ui._extraKey !== key) {
    ui._extraKey = key;
    ui.noteRows.querySelectorAll('.qrow').forEach((e) => e.remove());
    for (const t of extra) ui.noteRows.appendChild(el('div', 'nrow qrow', `<span class="box"></span><span>${t}</span>`));
  }
  ui.noteEl.classList.toggle('empty', !orders.length && !extra.length);
}

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
  if (best) {
    const deg = (Math.atan2(best.x - p.x, -(best.z - p.z)) * 180) / Math.PI;
    needle = deg - heading;
  }
  ui.compassP.draw(heading, needle);
  const txt = best ? `${best.d < 1000 ? Math.round(best.d) + ' m' : (best.d / 1000).toFixed(1) + ' km'}` : '';
  if (ui.compassLbl.dataset.t !== txt + (best?.icon || '')) {
    ui.compassLbl.dataset.t = txt + (best?.icon || '');
    ui.compassLbl.innerHTML = best ? `<img src="${iconURL(best.icon)}">${txt}` : '';
  }
}
