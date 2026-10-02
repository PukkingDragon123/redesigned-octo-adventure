// HUD, dialogue, toasts, banners, prompts and menu plumbing.
import './ui.css';
import { frameURL, slotURL } from './frames.js';
import { iconURL } from '../art/icons.js';
import { portraitURL } from '../art/portraits.js';
import { CHARACTERS } from '../art/characters.js';
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';
import { Pix } from '../art/pixel.js';
import { clamp } from '../core/math.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export const VOICE = { hank: 'hank', hankBuried: 'hank', grandma: 'grandma', reaper: 'reaper', gus: 'gus', marie: 'marie', doug: 'doug', birdie: 'birdie', ingrid: 'ingrid', lou: 'lou', agnes: 'agnes', pip: 'kid', pop: 'kid', ollie: 'ollie', cat: 'cat' };

export function frameStyle(e, style = 'wood') {
  e.style.borderImageSource = `url(${frameURL(style)})`;
  return e;
}

// ---------------------------------------------------------------- gear & wheel gauge
class Gauge {
  constructor() {
    this.canvas = el('canvas');
    this.canvas.width = 72;
    this.canvas.height = 72;
    this.ctx = this.canvas.getContext('2d');
    this.pix = new Pix(72, 72);
    this.img = this.ctx.createImageData(72, 72);
    this.shiftFlash = 0;
    this.lastGear = 1;
  }
  draw(bike, dt) {
    const p = this.pix;
    p.data.fill(0);
    const cx = 36, cy = 34;
    const s = bike.stats;
    const top = s.motor ? s.topSpeed : s.topSpeed * (0.42 + 0.58);
    const k = clamp(bike.speed / (top * 1.25), 0, 1);
    // speed arc (lots of little pixel segments)
    for (let i = 0; i < 28; i++) {
      const t = i / 27;
      const a = Math.PI * (0.8 + t * 1.4);
      const on = t <= k;
      const col = t < 0.55 ? 0x6ad050 : t < 0.8 ? 0xf2c443 : 0xe8401e;
      const r0 = 31, r1 = 34;
      for (let r = r0; r <= r1; r++) p.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), on ? col : 0x3a2418);
    }
    // the wheel: tyre, rim, rotating spokes, hub
    p.ring(cx, cy, 26, 0x1e1618, 4);
    p.ring(cx, cy, 22, 0xc4c6cc, 1);
    p.ring(cx, cy, 21, 0x7a7c84, 1);
    const ang = bike.wheelAngle;
    for (let i = 0; i < 8; i++) {
      const a = ang + (i / 8) * Math.PI;
      p.line(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, cx - Math.cos(a) * 20, cy - Math.sin(a) * 20, 0x9a9ca4);
    }
    // chainring with teeth (spins with the cranks) holding the gear number
    const cr = bike.crank;
    p.circle(cx, cy, 11, 0x2a2a30);
    for (let i = 0; i < 14; i++) {
      const a = cr + (i / 14) * Math.PI * 2;
      p.rect(Math.round(cx + Math.cos(a) * 11.5) - 1, Math.round(cy + Math.sin(a) * 11.5) - 1, 2, 2, 0xd8b050);
    }
    p.circle(cx, cy, 9, this.shiftFlash > 0 ? 0xffe08a : 0xf2c443);
    p.circle(cx, cy, 7.5, 0x3a2418);
    // big pixel gear digit
    const g = s.motor ? Math.max(1, bike.gear) : bike.gear;
    if (g !== this.lastGear) { this.shiftFlash = 0.35; this.lastGear = g; }
    this.shiftFlash = Math.max(0, this.shiftFlash - dt);
    drawDigit(p, cx - 3, cy - 5, g, this.shiftFlash > 0 ? 0xffffff : 0xffe08a);
    // gear pips (how many gears you own)
    const n = s.motor ? 4 : s.gears;
    const pw = Math.min(5, Math.floor(56 / n));
    for (let i = 0; i < n; i++) {
      const x = cx - (n * pw) / 2 + i * pw;
      p.rect(Math.round(x), 66, Math.max(1, pw - 1), 3, i < g ? 0xf2c443 : 0x4a2a1a);
    }
    // speed number
    const kmh = Math.round(bike.speed * 3.6);
    drawNumber(p, cx, 56, kmh, 0xfff4dc);
    this.img.data.set(p.data);
    this.ctx.putImageData(this.img, 0, 0);
  }
}

const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawDigit(p, x, y, d, c, sc = 2) {
  const g = DIG[d % 10];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r * 3 + k] === '1') p.rect(x + k * sc, y + r * sc, sc, sc, c);
}
function drawNumber(p, cx, y, n, c) {
  const s = String(n);
  const w = s.length * 4 - 1;
  for (let i = 0; i < s.length; i++) drawDigit(p, cx - Math.floor(w / 2) + i * 4, y, +s[i], c, 1);
}

// ---------------------------------------------------------------- UI
export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.root.innerHTML = '';
    this.buildHUD();
    this.dialogue = this.buildDialogue();
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.skipHint = el('div', 'skiphint', `<span class="key">Esc</span> skip`);
    this.root.appendChild(this.skipHint);
    this.overlay = null;
    this.menuStack = [];
    this.prompted = null;
    this.tags = new Map();
  }

  // ---------------------------------------------------------------- HUD
  buildHUD() {
    const h = el('div');
    h.id = 'hud';
    this.hud = h;
    // clock + money
    const clock = frameStyle(el('div', 'panel dark hud-clock'), 'dark');
    clock.innerHTML = `
      <div class="hud-row hud-day"><span class="d">DAY 1</span><img class="wx" src="${iconURL('sun')}"></div>
      <div class="hud-row hud-time"><img class="tod" src="${iconURL('sun')}"><span class="t">8:00 AM</span></div>
      <div class="hud-row hud-money"><img src="${iconURL('coin')}"><span class="m">$0</span></div>`;
    h.appendChild(clock);
    this.elDay = clock.querySelector('.d');
    this.elTime = clock.querySelector('.t');
    this.elMoney = clock.querySelector('.m');
    this.elTod = clock.querySelector('.tod');
    this.elWx = clock.querySelector('.wx');
    // compass
    const comp = el('div', 'hud-compass');
    comp.appendChild(el('div', 'center'));
    this.compass = comp;
    this.compassTicks = [];
    for (const [deg, label] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]) {
      const t = el('div', `tick ${label.length === 1 ? 'major' : ''}`, label);
      comp.appendChild(t);
      this.compassTicks.push({ deg, e: t });
    }
    this.compassMarks = new Map();
    h.appendChild(comp);
    this.objective = el('div', 'hud-objective');
    h.appendChild(this.objective);
    // orders
    this.ordersEl = el('div', 'hud-orders');
    h.appendChild(this.ordersEl);
    this.orderCards = new Map();
    // gauge
    const g = el('div', 'hud-gauge');
    this.gauge = new Gauge();
    g.appendChild(this.gauge.canvas);
    this.boosts = el('div', 'hud-boosts');
    g.appendChild(this.boosts);
    h.appendChild(g);
    // prompt
    this.promptEl = frameStyle(el('div', 'panel dark hud-prompt'), 'dark');
    h.appendChild(this.promptEl);
    this.root.appendChild(h);
  }

  showHUD(on) {
    this.hud.classList.toggle('hidden', !on);
  }

  updateHUD(dt) {
    const g = this.game;
    const st = g.state;
    if (!st || !g.bike) return;
    this.elDay.textContent = `DAY ${st.day}`;
    const hr = g.world.atmosphere.hour;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60 / 5) * 5;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh + 11) % 12) + 1;
    const ts = `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
    if (this.elTime.textContent !== ts) this.elTime.textContent = ts;
    const night = hr < 6.5 || hr > 19.6;
    const todIcon = night ? 'moon' : 'sun';
    if (this.elTod.dataset.i !== todIcon) { this.elTod.src = iconURL(todIcon); this.elTod.dataset.i = todIcon; }
    const wx = { clear: 'sun', breezy: 'leaf', misty: 'fog', overcast: 'fog', rain: 'rain', snow: 'snowflake' }[g.world.atmosphere.weatherTarget] || 'sun';
    if (this.elWx.dataset.i !== wx) { this.elWx.src = iconURL(wx); this.elWx.dataset.i = wx; }
    const money = `$${Math.floor(st.money)}`;
    if (this.elMoney.textContent !== money) this.elMoney.textContent = money;
    this.gauge.draw(g.bike, dt);
    // boost bottles
    const total = g.bike.stats.boostCharges;
    if (this.boosts.childElementCount !== total) {
      this.boosts.innerHTML = '';
      for (let i = 0; i < total; i++) this.boosts.appendChild(el('img')).src = iconURL('cola');
    }
    [...this.boosts.children].forEach((img, i) => img.classList.toggle('used', i >= g.bike.boostCharges));
    this.updateOrders();
    this.updateCompass();
  }

  updateOrders() {
    const orders = this.game.orders?.carried() || [];
    const seen = new Set();
    for (const o of orders) {
      seen.add(o.id);
      let c = this.orderCards.get(o.id);
      if (!c) {
        c = frameStyle(el('div', 'panel order-card'), 'order');
        c.innerHTML = `<div class="pt"></div><div><div class="nm"></div><div class="ty"></div><div class="thermo"><i></i></div></div>`;
        c.querySelector('.pt').style.backgroundImage = `url(${portraitURL(o.customer)})`;
        c.querySelector('.nm').textContent = CHARACTERS[o.customer]?.name || o.customer;
        c.querySelector('.ty').textContent = o.label;
        this.ordersEl.appendChild(c);
        this.orderCards.set(o.id, c);
      }
      c.querySelector('i').style.width = `${Math.round(o.quality)}%`;
      c.classList.toggle('done', o.state === 'delivered');
    }
    for (const [id, c] of this.orderCards) if (!seen.has(id)) { c.remove(); this.orderCards.delete(id); }
  }

  // markers: [{id, x, z, icon, label}]
  updateCompass() {
    const g = this.game;
    const cam = g.camera;
    const dir = cam.getWorldDirection(this._dir || (this._dir = new cam.position.constructor()));
    // heading: 0 = north (-z), clockwise
    const heading = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
    const W = this.compass.clientWidth || 390;
    const fov = 160;
    const place = (deg, e) => {
      let d = ((deg - heading + 540) % 360) - 180;
      const vis = Math.abs(d) < fov / 2;
      e.style.display = vis ? '' : 'none';
      if (vis) e.style.left = `${W / 2 + (d / (fov / 2)) * (W / 2)}px`;
      return vis;
    };
    for (const t of this.compassTicks) place(t.deg, t.e);
    const marks = (g.compassMarkers ? g.compassMarkers() : []).map((m) => {
      const dx = m.x - g.bike.pos.x, dz = m.z - g.bike.pos.z;
      return { ...m, d: Math.hypot(dx, dz), deg: (Math.atan2(dx, -dz) * 180) / Math.PI };
    });
    marks.sort((a, b) => a.d - b.d);
    const seen = new Set();
    const placed = [];
    if (!(this._uAt > g.time - 2)) {
      this._u = parseFloat(getComputedStyle(this.root).getPropertyValue('--u')) || 3;
      this._uAt = g.time;
    }
    const u = this._u;
    for (const m of marks) {
      seen.add(m.id);
      let e = this.compassMarks.get(m.id);
      if (!e) {
        e = el('div', 'mk', `<img src="${iconURL(m.icon)}"><span></span>`);
        this.compass.appendChild(e);
        this.compassMarks.set(m.id, e);
      }
      if (!place(m.deg, e)) continue;
      // nearer markers win: farther ones that would overlap step aside and drop their label
      let x = parseFloat(e.style.left);
      let crowded = false;
      for (const px of placed) {
        if (Math.abs(x - px) < u * 16) crowded = true;
        if (Math.abs(x - px) < u * 7) x = px + (x >= px ? u * 7 : -u * 7);
      }
      e.style.left = `${x}px`;
      placed.push(x);
      const span = e.querySelector('span');
      span.textContent = `${Math.round(m.d)}m`;
      span.style.visibility = crowded ? 'hidden' : '';
      e.style.zIndex = String(10 - placed.length);
    }
    for (const [id, e] of this.compassMarks) if (!seen.has(id)) { e.remove(); this.compassMarks.delete(id); }
  }

  setObjective(text) {
    if (this.objective.textContent !== text) this.objective.textContent = text || '';
  }

  prompt(text, key = 'E') {
    if (text === this.prompted) return;
    this.prompted = text;
    if (!text) {
      this.promptEl.classList.remove('on');
      return;
    }
    this.promptEl.innerHTML = `<span class="key">${key}</span><span>${text}</span>`;
    this.promptEl.classList.add('on');
  }

  toast(text, icon = null, ms = 3200) {
    const t = frameStyle(el('div', 'panel toast'), 'wood');
    t.innerHTML = `${icon ? `<img src="${iconURL(icon)}">` : ''}<span>${text}</span>`;
    this.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, ms);
    while (this.toasts.childElementCount > 4) this.toasts.firstChild.remove();
  }

  banner(title, sub = '', ms = 2600) {
    const b = el('div', 'banner', `<div class="b1">${title}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`);
    this.root.appendChild(b);
    setTimeout(() => {
      b.classList.add('out');
      setTimeout(() => b.remove(), 650);
    }, ms);
  }

  letterbox(on) {
    this.root.classList.toggle('letterbox', on);
  }

  // floating text tags over world positions (e.g. "!!" shouts)
  tag(id, text, pos, ms = 1500) {
    let t = this.tags.get(id);
    if (!t) {
      t = { e: frameStyle(el('div', 'panel wtag'), 'paper') };
      this.root.appendChild(t.e);
      this.tags.set(id, t);
    }
    t.e.textContent = text;
    t.pos = pos;
    t.until = performance.now() + ms;
  }
  updateTags() {
    const cam = this.game.camera;
    const now = performance.now();
    for (const [id, t] of this.tags) {
      if (now > t.until) {
        t.e.remove();
        this.tags.delete(id);
        continue;
      }
      const v = t.pos.clone().project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      t.e.style.display = vis ? '' : 'none';
      t.e.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
      t.e.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  }

  // ---------------------------------------------------------------- dialogue
  buildDialogue() {
    const d = el('div');
    d.id = 'dialogue';
    const box = frameStyle(el('div', 'panel dlg-box'), 'wood');
    box.innerHTML = `<div class="dlg-portrait"></div><div class="dlg-main"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-choices"></div></div><div class="dlg-next">▼</div>`;
    d.appendChild(box);
    this.root.appendChild(d);
    d.addEventListener('pointerdown', () => (this._dlgClick = true));
    return { root: d, box, portrait: box.querySelector('.dlg-portrait'), name: box.querySelector('.dlg-name'), text: box.querySelector('.dlg-text'), choices: box.querySelector('.dlg-choices'), next: box.querySelector('.dlg-next') };
  }

  // say('grandma', 'Hello *dear*!', { expr: 'happy', choices: ['Yes', 'No'] }) -> Promise<choiceIndex|undefined>
  say(who, text, opts = {}) {
    const D = this.dialogue;
    const spec = who ? CHARACTERS[who] : null;
    const name = opts.name ?? (who === 'cat' ? 'Poutine' : spec?.name ?? '');
    D.root.classList.add('on');
    // narration gets a dark storybook caption instead of the parchment speech box
    const narr = !who && !opts.choices;
    if (D.box.classList.contains('narr') !== narr) {
      D.box.classList.toggle('narr', narr);
      frameStyle(D.box, narr ? 'dark' : 'wood');
    }
    D.portrait.classList.toggle('empty', !who);
    if (who) D.portrait.style.backgroundImage = `url(${portraitURL(who === 'hankBuried' ? 'hankBuried' : who, opts.expr || 'neutral')})`;
    D.name.textContent = name;
    D.name.style.display = name ? '' : 'none';
    D.choices.innerHTML = '';
    D.next.style.display = 'none';
    // tokenise markup: *emphasis*, ~wobble~
    const parts = [];
    let mode = '';
    for (const ch of text) {
      if (ch === '*') { mode = mode === 'em' ? '' : 'em'; continue; }
      if (ch === '~') { mode = mode === 'w' ? '' : 'w'; continue; }
      parts.push({ ch, mode });
    }
    D.text.innerHTML = '';
    const voice = VOICE[who] || 'narrator';
    return new Promise((resolve) => {
      let i = 0, acc = 0;
      const speed = opts.speed ?? 42;
      let done = false;
      let sel = 0;
      const items = [];
      const finishTyping = () => {
        while (i < parts.length) addChar(parts[i++]);
        done = true;
        if (opts.choices) {
          opts.choices.forEach((c, k) => {
            const e = el('div', `choice${k === 0 ? ' sel' : ''}`, c);
            e.addEventListener('pointerdown', (ev) => {
              ev.stopPropagation();
              sel = k;
              close();
            });
            e.addEventListener('pointerenter', () => setSel(k));
            D.choices.appendChild(e);
            items.push(e);
          });
        } else D.next.style.display = '';
      };
      const setSel = (k) => {
        sel = (k + items.length) % items.length;
        items.forEach((e, j) => e.classList.toggle('sel', j === sel));
        sound.play('ui_hover');
      };
      const addChar = (p) => {
        let node;
        if (p.mode === 'w') {
          node = el('span', 'w', p.ch === ' ' ? '&nbsp;' : p.ch);
          node.style.animationDelay = `${(D.text.childNodes.length % 12) * -0.05}s`;
        } else if (p.mode === 'em') node = el('em', '', p.ch);
        else node = document.createTextNode(p.ch);
        D.text.appendChild(node);
      };
      const close = () => {
        this.dialogueTick = null;
        this._dlgResolve = null;
        this.swallowInput();
        sound.play('ui_click');
        if (!opts.keepOpen) D.root.classList.remove('on');
        resolve(opts.choices ? sel : undefined);
      };
      // hideDialogue() (e.g. skipping a cutscene) settles the line with its default answer
      this._dlgResolve = () => resolve(opts.choices ? 0 : undefined);
      this._dlgClick = false;
      this.dialogueTick = (dt) => {
        const confirm = input.pressed('confirm') || this._dlgClick;
        this._dlgClick = false;
        if (!done) {
          acc += dt * speed * (input.down('confirm') && i > 3 ? 3 : 1);
          let blipped = false;
          while (acc >= 1 && i < parts.length) {
            acc -= 1;
            const p = parts[i++];
            addChar(p);
            if (!blipped && p.ch !== ' ' && i % 2 === 0) {
              sound.blip(voice);
              blipped = true;
            }
            if ('.!?'.includes(p.ch)) acc -= 4; // little pauses
            else if (p.ch === ',') acc -= 2;
          }
          if (i >= parts.length) finishTyping();
          else if (confirm && i > 2) finishTyping();
          return;
        }
        if (opts.choices) {
          if (input.pressed('up') || input.pressed('left') || input.pressed('menuUp')) setSel(sel - 1);
          if (input.pressed('down') || input.pressed('right') || input.pressed('menuDown')) setSel(sel + 1);
          if (input.pressed('confirm')) close();
          return;
        }
        if (confirm) close();
      };
      if (opts.instant) finishTyping();
    });
  }
  // the key press that closes a line or a menu shouldn't also hop the bike or re-open a talk
  swallowInput(seconds = 0.25) {
    this.swallowUntil = (this.game.time || 0) + seconds;
  }
  inputSwallowed() {
    return (this.game.time || 0) < (this.swallowUntil || 0);
  }

  hideDialogue() {
    this.dialogue.root.classList.remove('on');
    this.dialogueTick = null;
    const r = this._dlgResolve;
    this._dlgResolve = null;
    r?.();
  }

  // ---------------------------------------------------------------- menus
  // A menu is { el, items: [elements], onBack } ; navigation handled here.
  openOverlay(contentEl, { onBack = null, items = null, grid = 0 } = {}) {
    const ov = el('div', 'overlay');
    ov.appendChild(contentEl);
    this.root.appendChild(ov);
    const m = { ov, items: items || [...contentEl.querySelectorAll('.btn:not(:disabled), .slot, .slip')], sel: 0, onBack, grid };
    this.menuStack.push(m);
    this.highlight(m);
    sound.play('ui_open');
    return m;
  }
  closeOverlay(m = this.menuStack[this.menuStack.length - 1]) {
    if (!m) return;
    m.ov.remove();
    this.menuStack = this.menuStack.filter((x) => x !== m);
    this.swallowInput();
    sound.play('ui_close');
  }
  refreshItems(m, selector = '.btn:not(:disabled), .slot, .slip') {
    m.items = [...m.ov.querySelectorAll(selector)];
    m.sel = Math.min(m.sel, m.items.length - 1);
    this.highlight(m);
  }
  highlight(m) {
    m.items.forEach((e, i) => {
      e.classList.toggle('sel', i === m.sel);
      if (e.classList.contains('btn')) e.style.borderImageSource = `url(${frameURL(i === m.sel ? 'buttonHot' : 'button')})`;
      if (e.classList.contains('slot')) e.style.borderImageSource = `url(${slotURL(i === m.sel)})`;
    });
    const cur = m.items[m.sel];
    cur?.dispatchEvent(new CustomEvent('focus-item'));
  }
  menuTick() {
    const m = this.menuStack[this.menuStack.length - 1];
    if (!m) return false;
    const n = m.items.length;
    const move = (d) => {
      if (!n) return;
      m.sel = (m.sel + d + n) % n;
      this.highlight(m);
      sound.play('ui_hover');
    };
    const cols = m.grid || 1;
    if (input.pressed('up') || input.pressed('menuUp')) move(-cols);
    if (input.pressed('down') || input.pressed('menuDown')) move(cols);
    if (cols > 1) {
      if (input.pressed('left')) move(-1);
      if (input.pressed('right')) move(1);
    }
    if ((input.pressed('interact') || input.pressed('jump') || (input.pressed('confirm'))) && n) {
      m.items[m.sel]?.click();
    }
    if (input.pressed('back') || input.pressed('pause')) {
      if (m.onBack) m.onBack();
    }
    return true;
  }

  button(label, onClick, { small = '', disabled = false } = {}) {
    const b = el('button', 'btn', `${label}${small ? `<small>${small}</small>` : ''}`);
    b.disabled = disabled;
    b.style.borderImageSource = `url(${frameURL('button')})`;
    b.addEventListener('click', () => {
      if (b.disabled) return;
      sound.play('ui_click');
      onClick?.();
    });
    b.addEventListener('pointerenter', () => {
      const m = this.menuStack[this.menuStack.length - 1];
      if (!m) return;
      const i = m.items.indexOf(b);
      if (i >= 0 && i !== m.sel) {
        m.sel = i;
        this.highlight(m);
      }
    });
    return b;
  }

  panel(style = 'wood', cls = 'menu') {
    return frameStyle(el('div', `panel ${cls}`), style);
  }

  update(dt) {
    if (this.dialogueTick) this.dialogueTick(dt);
    else this.menuTick();
    this.updateTags();
  }
}

export { el };
