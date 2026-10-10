// Screens: title, Hank's journal (pause), settings, controls, Nana's order book and
// customer book (spiral notebooks), the Skill Book (Harold's garage), keepsakes,
// the paper map, recipes, the Moose & Goose shop and the day's receipt. All built
// from the pixel UI kit (src/ui/kit.js, styles in src/ui/menus.css and notebook.css).
import { el } from '../ui/ui.js';
import { kPanel, kSign, kClose, kBook, kBar, kSlider, kToggle, kSlot, kKey, esc, scale, snap, snapBox, setUIScaleOffset } from '../ui/kit.js';
import { iconURL, iconSmallURL, glyphURL } from '../art/icons.js';
import { LivePortrait } from '../ui/live3d.js';
import { CHARACTERS } from '../art/characters.js';
import { KEEPSAKES, POI, CUSTOMERS, WORLD_HALF, BUILDINGS } from '../world/layout.js';
import { KEEPSAKE_ICON } from './keepsakes.js';
import { hasSave } from './state.js';
import { tempBarHTML, cupTemp } from './orders.js';
import { foodIconURL, FOOD_INFO } from '../art/foodsprites.js';
import { QUESTS, SHOP, RECIPES, LOST, BIRD_NAMES } from './quests.js';
import { RIBBONS } from './carveScore.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// a stand-in move list so the Skill Book can be opened before game.skills exists
const STUB_SKILLS = [
  { id: 'wheelie', name: 'Wheelie', icon: 'skill_wheelie', how: 'Pedal and hold lean-back to lift the front wheel. Small taps keep it up.', desc: 'Harold once rode a wheelie from the mill to the chapel.', tier: 1, maxTier: 3, goal: 'Hold a wheelie for 5 seconds', progress: 0.4 },
  { id: 'stoppie', name: 'Stoppie', icon: 'skill_stoppie', how: 'Brake hard and lean forward: the back wheel lifts.', desc: 'Stopping, but with style.', tier: 0, maxTier: 3, goal: 'Stoppie for 0.8 seconds', progress: 0.1 },
  { id: 'bunnyhop', name: 'Bunny Hop', icon: 'skill_hop', how: 'Hold hop to crouch, let go to pop.', desc: 'Up and over: logs, kerbs, ducks.', tier: 2, maxTier: 3, goal: 'Hop 1.12 m high', progress: 0.7 },
  { id: 'drift', name: 'Drift', icon: 'skill_drift', how: 'At speed, hold drift and steer into a corner.', desc: 'The cocoa stays (mostly) in the cup.', tier: 3, maxTier: 3, goal: 'Mastered!', progress: 1 },
];

export class Menus {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
  }

  // ---------------------------------------------------------------- building blocks
  // a carved wooden frame with a wood-burned sign for a title and a close button; body is the scrolling part
  sheet(title, { kind = 'leather', cls = '', ribbon = 'oak', onClose = null } = {}) {
    const p = kPanel(kind, `menu ${cls}`);
    const rb = kSign(title, ribbon, 'm-title');
    p.appendChild(rb);
    if (onClose) {
      const x = kClose(() => { this.game.sound?.play('ui_click'); onClose(); });
      x.classList.add('m-close');
      p.appendChild(x);
    }
    const body = el('div', 'm-body');
    p.appendChild(body);
    // the sign is centred by layout (no transforms on pixel art); kit.js keeps its text on whole pixels
    requestAnimationFrame(() => snapBox(p));
    return { p, body };
  }
  // a selectable row (index entries, list rows): glyph + label (+ right side)
  item(label, onClick, { icon = '', right = '', cls = '' } = {}) {
    const b = el('button', `k-item pick${cls ? ` ${cls}` : ''}`, `${icon ? `<img class="k-g" src="${icon}">` : '<i class="k-g"></i>'}<span class="lbl">${label}</span>${right ? `<span class="rt">${right}</span>` : ''}`);
    b.addEventListener('click', () => { this.game.sound?.play('ui_click'); onClick?.(b); });
    return this.ui.hoverSelect(b);
  }

  // ---------------------------------------------------------------- title (the lead's screen; built from the kit)
  title({ onContinue, onNew, onSettings }) {
    const ui = this.ui;
    const t = el('div');
    t.id = 'title';
    const word = 'DELI-VERY-DEAD';
    const letters = [...word].map((c) => `<span class="drip">${c}</span>`).join('');
    t.innerHTML = `<div class="logo"><div class="l1">${letters}</div><div class="l2">a cozy undead cocoa-delivery tale</div></div>`;
    const menu = el('div', 'title-menu');
    const buttons = [];
    if (hasSave()) buttons.push(ui.button('Continue', () => close(onContinue), { small: `Day ${this.game.peekSave()?.day ?? 1}` }));
    buttons.push(ui.button(hasSave() ? 'New Game' : 'Start', () => close(onNew), { small: hasSave() ? 'overwrites your save' : '' }));
    buttons.push(ui.button('Settings', () => onSettings()));
    buttons.push(ui.button('Controls', () => this.controls()));
    buttons.forEach((b) => menu.appendChild(b));
    t.appendChild(menu);
    t.appendChild(el('div', 'title-foot', 'Autumn in Maple Cove'));
    this.ui.root.appendChild(t);
    const m = { ov: t, items: buttons, sel: 0, onBack: null };
    ui.menuStack.push(m);
    ui.highlight(m);
    const close = (fn) => {
      t.style.transition = 'opacity 0.6s';
      t.style.opacity = '0';
      ui.menuStack = ui.menuStack.filter((x) => x !== m);
      setTimeout(() => t.remove(), 650);
      fn?.();
    };
    return m;
  }

  // ---------------------------------------------------------------- pause: Hank's journal
  pause() {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    let m;
    const close = () => {
      g.sound.play('book_close');
      ui.closeOverlay(m);
      g.resumeFromMenu();
    };
    const { p, body } = this.sheet("Hank's Journal", { cls: 'journal', onClose: close });
    const { book, left, right } = kBook('jbook');
    body.appendChild(book);
    p.appendChild(el('i', 'k-strap'));
    // left page: today + favours
    const d = st.stats || {};
    left.innerHTML = `<div class="jdate"><img class="k-g" src="${glyphURL('coin')}"><b>$${Math.floor(st.money)}</b><img class="k-g" src="${glyphURL('cocoa')}">${d.deliveries || 0}</div><div class="k-h k-bold">Day ${st.day} &middot; Errands</div>`;
    const Q = st.quests || {};
    const lines = [];
    const row = (done, text) => `<div class="jq${done ? ' done' : ''}"><img class="k-g" src="${glyphURL(done ? 'boxOn' : 'box')}"><span>${text}</span></div>`;
    for (const [id, def] of Object.entries(QUESTS)) {
      const q = Q[id];
      if (q?.state === 'active') lines.push(row(false, def.title));
      else if (q?.state === 'done') lines.push(row(true, def.title));
    }
    for (const L of LOST) {
      const q = Q[`lost_${L.id}`];
      if (q?.state === 'active') lines.push(row(false, `${q.found ? 'Return' : 'Find'} the ${L.name}`));
      else if (q?.state === 'done') lines.push(row(true, `Found the ${L.name}`));
    }
    const list = el('div', 'jlist');
    list.innerHTML = lines.length ? lines.join('') : '<p class="hint">Nothing yet. Chat with folks around town!</p>';
    left.appendChild(list);
    if (st.photos && Object.keys(st.photos).length) {
      left.insertAdjacentHTML('beforeend', `<div class="k-h k-bold">Bird book</div><div class="jphotos">${Object.keys(st.photos).map((k) => `<span class="jph"><img class="k-g" src="${glyphURL('camera')}">${esc(BIRD_NAMES[k] || k)}</span>`).join('')}</div>`);
    }
    // the pumpkin carving contest: the ribbons Hank has won (src/game/carving.js)
    const pr = st.carving?.ribbons;
    if (pr && Object.values(pr).some((n) => n)) {
      const medal = { first: 'medalG', second: 'medalS', third: 'medalB', part: 'medalNone' };
      left.insertAdjacentHTML('beforeend', `<div class="k-h k-bold">Pumpkin ribbons</div><div class="jphotos">${Object.keys(RIBBONS).filter((k) => pr[k]).map((k) => `<span class="jph"><img class="k-g" src="${glyphURL(medal[k])}">${pr[k] > 1 ? `${pr[k]} x ` : ''}${esc(RIBBONS[k].name)}</span>`).join('')}<span class="jph">Best: ${st.carving.best || 0} pts</span></div>`);
    }
    // right page: an index of where to go
    right.insertAdjacentHTML('beforeend', '<div class="k-h k-bold">Contents</div>');
    const items = [
      this.item('Back to the road', close, { icon: glyphURL('arrowR') }),
      this.item('The map', () => this.map(), { icon: iconSmallURL('map') }),
      this.item("Harold's keepsakes", () => this.keepsakes(), { icon: iconSmallURL('lantern') }),
      this.item('Skill book', () => this.skillBook(), { icon: iconSmallURL('skill_wheelie') }),
      this.item("Nana's customers", () => this.customers(), { icon: glyphURL('home') }),
      this.item("Nana's recipes", () => this.recipes(), { icon: glyphURL('mug_classic') }),
      this.item('Settings', () => this.settings(), { icon: glyphURL('gear') }),
      this.item('Controls', () => this.controls(), { icon: glyphURL('pad') }),
      this.item('Save & quit', () => { g.save(); location.href = location.pathname; }, { icon: glyphURL('home'), cls: 'quit' }),
    ];
    const idx = el('div', 'jindex');
    items.forEach((b) => idx.appendChild(b));
    right.appendChild(idx);
    g.sound.play('book_open');
    m = ui.openOverlay(p, { onBack: close, items });
    return m;
  }

  // the pumpkin-carving page went with the Halloween decorations; an old caller just gets "not now"
  carve(onDone) {
    onDone?.(null);
  }

  // ---------------------------------------------------------------- Nana's recipes & pantry
  recipes() {
    const g = this.game;
    const ui = this.ui;
    const pantry = g.state.pantry || {};
    let m;
    const close = () => ui.closeOverlay(m);
    const { p, body } = this.sheet("Nana's Recipe Book", { kind: 'parchment', cls: 'recipes', onClose: close });
    const names = { classic: 'Classic Cocoa', maple: 'Maple Mallow', cinnamon: 'Cinnamon Fire', mint: 'Peppermint', pumpkin: 'Pumpkin Spice', mocha: 'Lumberjack' };
    const grid = el('div', 'rgrid');
    for (const [id, ing] of Object.entries(RECIPES)) {
      const can = ing.every((k) => (pantry[k] || 0) > 0);
      const card = el('div', `k-paper rcard${can ? '' : ' short'}`);
      card.innerHTML = `<img class="big" src="${foodIconURL('cocoa_' + id)}"><div class="rtext"><div class="rn k-bold">${names[id] || id}</div><div class="ri">${ing.map((k) => `<div class="${(pantry[k] || 0) > 0 ? 'ok' : 'out'}"><img class="k-g" src="${glyphURL((pantry[k] || 0) > 0 ? 'check' : 'cross')}"><span>${esc(SHORT_FOOD[k] || FOOD_INFO[k]?.label || k)}</span><b>${pantry[k] || 0}</b></div>`).join('')}</div></div>`;
      grid.appendChild(card);
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'hint', 'One of each per cup. Low? Mo at Moose &amp; Goose has it all.'));
    g.sound.play('page_flip');
    m = ui.openOverlay(p, { onBack: close, items: [p.querySelector('.m-close')] });
    return m;
  }

  // ---------------------------------------------------------------- Moose & Goose
  shop(onDone) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    st.bag = st.bag || {};
    let m;
    const cart = {};
    const total = () => Object.entries(cart).reduce((s, [k, n]) => s + n * (FOOD_INFO[k]?.price || 3), 0);
    const done = (pay) => {
      if (pay && total() > 0) {
        st.money -= total();
        for (const [k, n] of Object.entries(cart)) st.bag[k] = (st.bag[k] || 0) + n * 2;
        g.sound.play('cash_coins');
        ui.pop('Groceries bagged! Now home to Nana before the milk gets ideas.', { expr: 'happy' });
        g.save();
      }
      ui.closeOverlay(m);
      onDone?.();
    };
    const { p, body } = this.sheet('Moose & Goose', { cls: 'shop', ribbon: 'green', onClose: () => done(false) });
    const money = el('div', 'shopbar');
    body.appendChild(money);
    const grid = el('div', 'shopgrid');
    body.appendChild(grid);
    const items = [];
    const render = () => {
      money.innerHTML = `<span><img class="k-g" src="${glyphURL('coin')}">Pocket <b>$${Math.floor(st.money)}</b></span><span><img class="k-g" src="${iconSmallURL('basket')}">Basket <b>$${total()}</b></span>`;
      items.forEach((e) => e.sync());
    };
    for (const k of SHOP) {
      const info = FOOD_INFO[k] || { label: k, price: 3 };
      const e = el('button', 'k-plate k-parchment shopitem pick', `<img class="fi" src="${foodIconURL(k)}"><span class="nm">${esc(SHOP_NAME[k] || info.label)}</span><span class="pr"><b>$${info.price}</b></span><span class="k-count qty"></span>`);
      e.sync = () => { const q = e.querySelector('.qty'); q.textContent = cart[k] ? `${cart[k]}` : ''; q.style.visibility = cart[k] ? '' : 'hidden'; e.classList.toggle('taken', !!cart[k]); };
      e.addEventListener('click', () => {
        if (total() + info.price > st.money) { g.sound.play('ui_error'); ui.pop("That's a little more than you've got, Hank!", { who: 'mo', name: 'Mo', expr: 'sheepish', key: 'shop' }); return; }
        cart[k] = (cart[k] || 0) + 1;
        g.sound.play('register', { volume: 0.5 });
        render();
      });
      ui.hoverSelect(e);
      grid.appendChild(e);
      items.push(e);
    }
    const foot = el('div', 'm-foot');
    const pay = ui.button('Pay & bag it', () => done(true), { small: 'each item makes two cups', face: 'green' });
    const leave = ui.button('Never mind', () => done(false));
    foot.append(pay, leave);
    body.appendChild(foot);
    render();
    g.sound.play('shop_bell');
    m = ui.openOverlay(p, { onBack: () => done(false), items: [...items, pay, leave], grid: shopCols() });
    autoGrid(m, items);
    return m;
  }

  // ---------------------------------------------------------------- settings
  settings(onClose) {
    const g = this.game;
    const ui = this.ui;
    const s = g.settings;
    let m;
    const close = () => {
      g.saveSettings();
      ui.closeOverlay(m);
      onClose?.();
    };
    const { p, body } = this.sheet('Settings', { cls: 'settings', onClose: close });
    const rows = [];
    if (s.uiSize === undefined) s.uiSize = 0;
    // a row is the menu item: left/right nudges its control, confirm clicks it
    const row = (label, ctrl, icon) => {
      const r = el('div', 'k-setrow pick', `${icon ? `<img class="k-g" src="${icon}">` : '<i class="k-g"></i>'}<span class="lbl">${label}</span>`);
      r.appendChild(ctrl);
      r.nudge = (d) => ctrl.nudge?.(d);
      r.addEventListener('click', (e) => { if (e.target === r || e.target.classList.contains('lbl')) ctrl.nudge?.(1); });
      ui.hoverSelect(r);
      body.appendChild(r);
      rows.push(r);
      return r;
    };
    const slider = (key, min, max, step) => kSlider(s[key], min, max, step, (v) => { s[key] = v; g.applySettings(); });
    const cycle = (key, opts, labels, after) => {
      const c = el('div', 'k-cycle', '<i class="l"></i><span class="v"></span><i class="r"></i>');
      const v = c.querySelector('.v');
      const show = () => (v.textContent = labels[opts.indexOf(s[key])] ?? labels[0]);
      c.nudge = (d) => {
        let i = opts.indexOf(s[key]);
        if (i < 0) i = 0;
        s[key] = opts[(i + d + opts.length) % opts.length];
        // a hand-picked look wins over the automatic quality governor
        if (key === 'pixel' || key === 'quality') s.autoQuality = false;
        show();
        after ? after(s[key]) : g.applySettings();
        g.sound?.play('ui_hover');
      };
      c.querySelector('.l').addEventListener('click', (e) => { e.stopPropagation(); c.nudge(-1); });
      c.querySelector('.r').addEventListener('click', (e) => { e.stopPropagation(); c.nudge(1); });
      v.addEventListener('click', (e) => { e.stopPropagation(); c.nudge(1); });
      show();
      return c;
    };
    // resolution: HD renders every real screen pixel, Balanced a little under; Retro and Chunky are the pixel looks
    const res = [1, 1.5, 2, 3], resL = ['HD', 'Balanced', 'Retro', 'Chunky'];
    row('Resolution', cycle('pixel', res, resL), glyphURL('eye'));
    row('Graphics', cycle('quality', ['low', 'medium', 'high'], ['Low', 'Medium', 'High']), glyphURL('gear'));
    row('Interface size', cycle('uiSize', [-1, 0, 1, 2], ['Small', 'Normal', 'Big', 'Huge'], (v) => { setUIScaleOffset(v); requestAnimationFrame(() => snapBox(p)); }), glyphURL('size'));
    row('Master volume', slider('master', 0, 1, 0.05), glyphURL('speaker'));
    row('Music', slider('music', 0, 1, 0.05), glyphURL('note'));
    row('Sound effects', slider('sfx', 0, 1, 0.05), glyphURL('bones'));
    row('Camera distance', slider('camDist', 0.8, 1.5, 0.05), glyphURL('camera'));
    // Bessie's gears: automatic until the first shift by hand (which sets this to By hand)
    row('Gears', cycle('gears', ['auto', 'manual'], ['Automatic', 'By hand']), glyphURL('gear'));
    const fps = kToggle(!!s.fps, (on) => { s.fps = on; g.applySettings(); });
    row('Show FPS', fps, glyphURL('dot'));
    const foot = el('div', 'm-foot');
    const ok = ui.button('Done', close, { face: 'green' });
    foot.appendChild(ok);
    body.appendChild(foot);
    m = ui.openOverlay(p, { onBack: close, items: [...rows, ok] });
    return m;
  }

  // ---------------------------------------------------------------- controls
  controls() {
    const ui = this.ui;
    let m;
    const close = () => ui.closeOverlay(m);
    const { p, body } = this.sheet('Controls', { cls: 'controls', onClose: close });
    const touch = document.getElementById('ui')?.classList.contains('touchmode');
    const K = (...k) => k.map((x) => kKey(x)).join('');
    const ride = [
      [K('W', 'S'), 'Pedal: alternate them, each one a half turn of the crank (or drag the crank round). Faster is faster, and tiring'],
      [K('Z', 'X'), 'Gear down / up (low gear climbs and gets going, top gear flies)'],
      [K('S'), 'Hold on its own to brake / roll back'], [K('A', 'D'), 'Steer; spin in the air'],
      [K('Space'), 'Hop (hold to crouch, let go to pop)'], [K('Shift'), 'Drift; with a direction in the air: poses'],
      [K('Q'), 'Lean back: wheelie, manual, backflip'], [K('F'), 'Lean forward: stoppie, nose, frontflip'],
      [K('E'), 'Talk, deliver, hop off / on'], [K('R'), 'Ring the bell'],
    ];
    const foot = [
      [K('W', 'A', 'S', 'D'), 'Walk (hold Shift to sprint)'], [K('Space'), 'Jump (tap for a hop)'], [K('E'), 'Do what the tag says: talk, hop on, kick it...'],
      [K('C'), 'Camera (once you have one)'], [K('M'), 'Map'], [K('Tab'), "Harold's keepsakes"], [K('Esc'), 'Journal / skip a scene'],
    ];
    const col = (title, lines) => {
      const c = el('div', 'ccol');
      c.innerHTML = `<div class="k-h k-bold">${title}</div>` + lines.map(([k, v]) => `<div class="crow"><span class="ck">${k}</span><span>${v}</span></div>`).join('');
      return c;
    };
    const cols = el('div', 'ccols');
    cols.append(col('On the bike', ride), col('On foot & anywhere', foot));
    body.appendChild(cols);
    body.appendChild(el('p', 'hint', touch
      ? 'Touch: the left stick steers (pull back: wheelie, push up: stoppie). Circle your thumb round the crank to pedal (backwards brakes); stop and Bessie coasts. The arrows by the crank shift gear. The bone under it is Hank\'s wind: coast to get it back. The wheelie button drifts and poses. On foot the stick walks (all the way out jogs), the runner button sprints, and the tag does what it says.'
      : 'Gamepad: turn the right stick in circles to pedal (or alternate RT and LT), d-pad up / down changes gear (LB down too), hold LT to brake, A hop, RB drift (sprint on foot), left stick up/down leans, X talk, Start journal. Spin flat out and Hank runs out of puff (the bone under the crank): coast to get it back.'));
    const ok = ui.button('Got it', close);
    body.appendChild(el('div', 'm-foot')).appendChild(ok);
    m = ui.openOverlay(p, { onBack: close, items: [ok] });
    return m;
  }

  // ---------------------------------------------------------------- order board: Nana's order book
  // An open spiral notebook on the kitchen table: today's orders down the left
  // page (tick boxes, who, which cocoa), the one under Hank's finger written up on
  // the right page with a photo, where they live, what they ordered and how hot.
  orderBoard(onDone) {
    const g = this.game;
    const ui = this.ui;
    const O = g.orders;
    let m;
    const done = () => {
      ui.closeOverlay(m);
      onDone?.();
    };
    const { p, body } = this.sheet("Nana's Order Book", { kind: 'wood', cls: 'nbsheet board', onClose: done });
    const { nb, left, right } = notebook();
    body.appendChild(nb);
    const head = el('div', 'nb-head');
    left.appendChild(head);
    const rows = [];
    const all = O.list.filter((o) => o.state === 'board' || o.state === 'carried' || o.state === 'delivered');
    const detail = (o) => nbCard(right, {
      id: o.customer, spot: o.spot,
      stamp: o.state === 'delivered' ? ['DONE', 'ok'] : o.state === 'carried' ? ['PACKED', 'ok'] : o.rush ? ['RUSH', ''] : null,
      lines: [
        `<div class="nb-line wrap"><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="v">${esc(o.label)}</span></div>`,
        heatLine(o),
      ],
      quote: o.note,
    });
    all.forEach((o, i) => {
      const r = el('button', 'nb-row pick', `<i class="bx"></i><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="nm">${esc(SHORT_NAME[o.customer] || (CHARACTERS[o.customer]?.name || o.customer).split(' ')[0])}</span><span class="rt">${o.rush ? `<img class="k-g rush" src="${glyphURL('rush')}">` : ''}$${o.price}</span>`);
      const sync = () => { r.classList.toggle('packed', o.state === 'carried'); r.classList.toggle('done', o.state === 'delivered'); };
      sync();
      r.addEventListener('focus-item', () => detail(o));
      r.addEventListener('click', () => {
        if (o.state === 'delivered') return;
        let packed = false;
        if (o.state === 'carried') { O.unpack(o); g.sound.play('pencil_scribble'); }
        else if (!O.pack(o)) {
          g.sound.play('ui_error');
          const miss = O.missing ? O.missing(o) : [];
          if (miss.length) {
            ui.pop(`We're out of *${miss.map((k) => FOOD_INFO[k]?.label || k).join(' & ')}*, dear! Could you pop over to Moose & Goose?`, { who: 'grandma', expr: 'worried', key: 'pack' });
            const q = g.quests.q('groceries');
            if (q.state !== 'active') { q.state = 'active'; g.sound.play('quest_new'); }
          } else ui.pop(`Bessie only holds ${O.capacity()} cocoas: two in the basket, one in the crate.`, { expr: 'sheepish', key: 'pack' });
        } else {
          g.sound.play('cup');
          packed = true;
        }
        sync();
        upd();
        detail(o);
        // after packing, hop to the next open line, or to "Let's ride!" once the basket is full
        if (packed && m) {
          const full = O.carried().length >= O.capacity();
          const open = (e) => !e.classList.contains('packed') && !e.classList.contains('done');
          const next = rows.findIndex((e, k) => k > i && open(e));
          const later = next >= 0 ? next : rows.findIndex(open);
          m.sel = full || later < 0 ? rows.length : later;
          ui.highlight(m);
        }
      });
      ui.hoverSelect(r);
      left.appendChild(r);
      rows.push(r);
    });
    if (!all.length) left.appendChild(el('p', 'nb-pencil-note', 'No orders yet. Check back after breakfast!'));
    left.appendChild(el('div', 'nb-pencil-note nb-tip', 'Tick what to pack. Cocoa cools as you ride!'));
    const upd = () => {
      const n = O.carried().length, cap = O.capacity();
      head.innerHTML = `<div class="t k-bold">Orders, day ${g.state.day}</div><div class="sub"><span class="cups">${Array.from({ length: cap }, (_, k) => `<img class="k-g${k < n ? '' : ' empty'}" src="${glyphURL('mug_classic')}">`).join('')}</span><span>${n}/${cap} packed</span></div>`;
    };
    upd();
    doodles(left, right, g.state.day);
    if (all[0]) detail(all[0]);
    else nbCard(right, { id: 'grandma', where: 'The cabin by the woods', quote: 'Breakfast first, dear. Then the orders.' });
    const go = ui.button("Let's ride!", done, { small: 'load up the cocoa', face: 'green' });
    body.appendChild(el('div', 'm-foot')).appendChild(go);
    g.sound.play('page_flip');
    m = ui.openOverlay(p, { onBack: done, items: [...rows, go] });
    return m;
  }

  // ---------------------------------------------------------------- Nana's customer book (from the journal)
  customers() {
    const g = this.game;
    const ui = this.ui;
    let m;
    const close = () => ui.closeOverlay(m);
    const { p, body } = this.sheet("Nana's Customers", { kind: 'wood', cls: 'nbsheet custbook', onClose: close });
    const { nb, left, right } = notebook();
    body.appendChild(nb);
    const today = g.orders?.list || [];
    left.appendChild(el('div', 'nb-head', `<div class="t k-bold">Regulars</div><div class="sub">${Object.keys(CUSTOMERS).length} on the round</div>`));
    const rows = Object.entries(CUSTOMERS).map(([spot, c]) => {
      const o = today.find((x) => x.spot === spot);
      const id = spot === 'kids' ? 'pip' : spot === 'lou_lh' ? 'ollie' : spot;
      const r = el('button', `nb-row pick${o?.state === 'delivered' ? ' done' : o?.state === 'carried' ? ' packed' : ''}`, `<i class="bx"></i><span class="nm">${esc(c.name)}</span><span class="rt">${o ? `<img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}">` : ''}</span>`);
      r.addEventListener('focus-item', () => nbCard(right, {
        id, spot,
        stamp: o?.state === 'delivered' ? ['DONE', 'ok'] : null,
        lines: [
          `<div class="nb-line wrap nb-pencil-note">${esc(NANA_NOTE[spot] || '')}</div>`,
          o ? `<div class="nb-line wrap"><span class="lbl">Today:</span><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="v">${esc(o.label)}</span></div>` : '<div class="nb-line"><span class="lbl">Today:</span><span class="v">no order</span></div>',
        ],
      }));
      ui.hoverSelect(r);
      left.appendChild(r);
      return r;
    });
    doodles(left, right, 7);
    g.sound.play('page_flip');
    m = ui.openOverlay(p, { onBack: close, items: rows });
    return m;
  }

  // ---------------------------------------------------------------- Harold's garage: the Skill Book
  garage(onDone) {
    return this.skillBook(onDone);
  }
  skillBook(onDone) {
    const g = this.game;
    const ui = this.ui;
    const list = g.skills?.list ? g.skills.list() : STUB_SKILLS;
    let m;
    const close = () => {
      g.sound?.play('book_close');
      ui.closeOverlay(m);
      onDone?.();
    };
    const { p, body } = this.sheet('The Skill Book', { cls: 'skillbook', onClose: close });
    const { book, left, right } = kBook('sbook');
    body.appendChild(book);
    p.appendChild(el('i', 'k-strap'));
    const mastered = list.reduce((n, s) => n + (s.tier || 0), 0), total = list.reduce((n, s) => n + (s.maxTier || 3), 0);
    left.innerHTML = `<div class="k-h k-bold">Harold's riding notes</div><div class="sbtotal"><img class="k-g" src="${glyphURL('medalG')}"><span>${mastered} / ${total} medals</span></div>`;
    const rows = el('div', 'sblist');
    left.appendChild(rows);
    const medals = (s, big = false) => Array.from({ length: s.maxTier || 3 }, (_, k) => `<img class="k-g${big ? ' big' : ''}" src="${glyphURL(k < s.tier ? ['medalB', 'medalS', 'medalG', 'medalG', 'medalG'][k] : 'medalNone')}">`).join('');
    const detail = (s) => {
      const done = s.tier >= (s.maxTier || 3);
      const best = s.best != null && s.unit != null ? `${fmtNum(s.best)}${s.unit ? ` ${s.unit}` : ''}` : '';
      right.innerHTML = `<div class="sbhead"><div class="k-slot"><img src="${iconURL(s.icon || s.id)}"></div><div><div class="sbname k-bold">${esc(s.name)}${s.tier ? ` ${ROMAN[s.tier]}` : ''}</div><div class="sbmedals">${medals(s, true)}</div></div></div>
        <div class="sbgoal"><span class="lbl">${done ? 'Mastered!' : 'Next:'}</span> ${done ? '' : esc(s.goal || '')}</div>
        <div class="sbbar"></div>${best ? `<div class="sbbest">Best: <b>${esc(best)}</b></div>` : ''}
        <div class="sbhow">${esc(s.how || '')}</div>
        <div class="sbdesc">${esc(s.desc || '')}</div>${s.note ? `<div class="sbnote">${esc(s.note)}</div>` : ''}`;
      right.querySelector('.sbbar').appendChild(kBar(done ? 1 : s.progress || 0, done ? 'grow' : 'gold'));
    };
    const items = list.map((s) => {
      const r = this.item(esc(s.name), () => detail(s), { icon: iconSmallURL(s.icon || s.id), right: medals(s), cls: s.tier >= (s.maxTier || 3) ? 'master' : s.tier ? '' : 'new' });
      r.addEventListener('focus-item', () => detail(s));
      rows.appendChild(r);
      return r;
    });
    if (list[0]) detail(list[0]);
    g.sound?.play('book_open');
    m = ui.openOverlay(p, { onBack: close, items });
    return m;
  }

  // ---------------------------------------------------------------- keepsakes
  keepsakes() {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    let m;
    const close = () => ui.closeOverlay(m);
    const { p, body } = this.sheet("Harold's Keepsakes", { cls: 'keeps', onClose: close });
    const n = Object.keys(st.keepsakes).length;
    body.appendChild(el('p', 'keepbar', `<b>${n} / ${KEEPSAKES.length}</b> found. Bring them home: Nana has a story for each one.`));
    const split = el('div', 'split');
    body.appendChild(split);
    const grid = el('div', 'slots');
    split.appendChild(grid);
    const detail = el('div', 'k-plate k-parchment detail');
    split.appendChild(detail);
    const slots = KEEPSAKES.map((k) => {
      const have = st.keepsakes[k.id];
      const s = kSlot(iconURL(KEEPSAKE_ICON[k.id]), { state: have ? '' : 'locked', badge: have === 'given' ? ' ' : '', cls: 'pick' });
      if (have === 'given') s.querySelector('.k-badge').classList.add('given');
      s.addEventListener('focus-item', () => {
        detail.innerHTML = have ? `<div class="k-h k-bold">${esc(k.name)}</div><p>${esc(k.note)}</p>${have === 'found' ? '<p class="warn">Bring it home to Nana!</p>' : '<p class="okay">Nana has it on the mantel.</p>'}` : '<div class="k-h k-bold">???</div><p>Somewhere out in the wilds... Harold always did wander.</p>';
      });
      s.addEventListener('click', () => s.dispatchEvent(new CustomEvent('focus-item')));
      ui.hoverSelect(s);
      grid.appendChild(s);
      return s;
    });
    const back = ui.button('Close', close);
    body.appendChild(el('div', 'm-foot')).appendChild(back);
    m = ui.openOverlay(p, { onBack: close, items: [...slots, back], grid: 4 });
    autoGrid(m, slots);
    return m;
  }

  // ---------------------------------------------------------------- map
  map() {
    const g = this.game;
    const ui = this.ui;
    let m;
    const close = () => ui.closeOverlay(m);
    const { p, body } = this.sheet('Maple Hollow & Maple Cove', { cls: 'mapsheet', onClose: close });
    // paint the map at exactly the art-pixel size it is shown at, so it stays crisp
    const N = Math.max(120, Math.min(300, Math.floor(Math.min(scale.rows - 74, scale.cols - 40) / 4) * 4));
    this.mapCanvases = this.mapCanvases || new Map();
    const c = this.mapCanvases.get(N) || paintMap(g.world.terrain, N);
    this.mapCanvases.set(N, c);
    const wrap = el('div', 'k-paper mapwrap');
    const img = el('canvas');
    img.width = c.width;
    img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    img.style.width = img.style.height = `calc(var(--u) * ${N})`;
    wrap.appendChild(img);
    const at = (x, z) => [((x + WORLD_HALF) / (WORLD_HALF * 2)) * N, ((z + WORLD_HALF) / (WORLD_HALF * 2)) * N];
    const pin = (x, z, src, cls = '') => {
      const e = el('img', `pin ${cls}`);
      e.src = src;
      const [px, py] = at(x, z);
      e.style.left = `calc(var(--u) * ${Math.round(px) - 8 + 3})`;
      e.style.top = `calc(var(--u) * ${Math.round(py) - 8 + 3})`;
      wrap.appendChild(e);
    };
    const labels = [];
    const label = (x, z, text, cls = '') => {
      const e = el('div', `lbl ${cls}`, text);
      const [px, py] = at(x, z);
      e.dataset.x = px;
      e.dataset.y = py;
      wrap.appendChild(e);
      labels.push(e);
    };
    label(POI.plaza.x, POI.plaza.z - 22, 'Maple Cove', 'big');
    label(POI.cabin.x, POI.cabin.z + 14, "Nana's");
    label(POI.graveyard.x, POI.graveyard.z - 14, 'Old Pine Cemetery');
    if (POI.lookout) label(POI.lookout.x, POI.lookout.z - 12, 'Sunset Lookout');
    if (POI.lighthouse) label(POI.lighthouse.x - 8, POI.lighthouse.z - 14, 'Lighthouse');
    if (POI.sawmill) label(POI.sawmill.x, POI.sawmill.z + 12, 'Sawmill');
    if (POI.pond) label(POI.pond.x, POI.pond.z - 12, 'Beaver Pond');
    if (POI.trapper) label(POI.trapper.x, POI.trapper.z + 12, "Trapper's Hut");
    if (POI.bridge) label(POI.bridge.x + 18, POI.bridge.z + 12, 'Covered Bridge');
    pin(POI.cabin.x, POI.cabin.z, glyphURL('home'));
    for (const o of g.orders.carried()) { const c2 = CUSTOMERS[o.spot]; if (c2) pin(c2.x, c2.z, glyphURL('cocoa')); }
    for (const k of KEEPSAKES) if (g.state.keepsakes[k.id]) pin(k.x, k.z, iconSmallURL(KEEPSAKE_ICON[k.id]));
    if (g.catEventActive) { const c = g.story.stray?.pos || POI.catLog; pin(c.x, c.z, iconSmallURL('cat')); }
    for (const q of g.quests?.markers() || []) pin(q.x, q.z, iconSmallURL(q.icon), 'quest');
    pin(g.playerPos.x, g.playerPos.z, iconSmallURL('skull'), 'me');
    const legend = el('div', 'maplegend', `<span><img class="k-g" src="${glyphURL('cocoa')}">cocoa</span><span><img class="k-g" src="${iconSmallURL('skull')}">you</span><span><img class="k-g" src="${glyphURL('home')}">home</span>`);
    body.appendChild(wrap);
    body.appendChild(legend);
    const ok = ui.button('Fold it up', close);
    body.appendChild(el('div', 'm-foot')).appendChild(ok);
    g.sound.play('paper_unfold');
    m = ui.openOverlay(p, { onBack: close, items: [ok] });
    // centre the labels on whole art pixels once they have a width
    requestAnimationFrame(() => {
      const u = scale.u;
      for (const e of labels) {
        const w = Math.round(e.offsetWidth / u), h = Math.round(e.offsetHeight / u);
        const lx = Math.max(1, Math.min(N - w - 1, Math.round(+e.dataset.x - w / 2)));
        const ly = Math.max(1, Math.min(N - h - 1, Math.round(+e.dataset.y - h / 2)));
        e.style.left = `${(lx + 3) * u}px`;
        e.style.top = `${(ly + 3) * u}px`;
        e.style.visibility = 'visible';
      }
    });
    return m;
  }

  // ---------------------------------------------------------------- day summary
  summary(onDone) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    let m;
    const done = () => {
      ui.closeOverlay(m);
      onDone?.();
    };
    const { p, body } = this.sheet(`Day ${st.day} receipt`, { cls: 'summary' });
    const r = el('div', 'k-paper receipt');
    const s = st.stats;
    r.appendChild(el('div', 'rhead k-bold', 'NANA MARGUERITE’S COCOA'));
    const line = (a, b, cls = '', icon = '') => r.appendChild(el('div', `line ${cls}`, `<span>${icon ? `<img class="k-g" src="${icon}">` : ''}${a}</span><span>${b}</span>`));
    line('Cocoas delivered', s.dayDeliveries || 0, '', glyphURL('cocoa'));
    line('Tips', `$${s.dayTips || 0}`, '', glyphURL('coin'));
    line('Crashes (bones re-attached)', s.dayCrashes || 0, '', glyphURL('bones'));
    line('Best air time', `${(s.dayAir || 0).toFixed(1)}s`, '', glyphURL('star'));
    line('Earned today', `$${s.dayEarned || 0}`, 'total');
    line('Savings', `$${Math.floor(st.money)}`);
    body.appendChild(r);
    body.appendChild(el('p', 'hint', 'Nana: “You did good today, dear. Now off to bed: the dead need their rest too.”'));
    const ok = ui.button('Sleep', done, { icon: glyphURL('moon') });
    body.appendChild(el('div', 'm-foot')).appendChild(ok);
    m = ui.openOverlay(p, { onBack: done, items: [ok] });
    return m;
  }
}

// ---------------------------------------------------------------- helpers
// the customer's photo is a live 3D view of the real model (one shared, re-used)
let BOOK_FACE = null;
function faceCanvas(id) {
  if (!BOOK_FACE) {
    // one render pixel per art pixel, shown at the kit's whole-number scale (crisp, never smoothed)
    BOOK_FACE = new LivePortrait(null, { art: 32, bust: false, yaw: 0.25, outline: false, bg: '#cfe0f0' });
    BOOK_FACE.canvas.style.cssText = 'position:absolute;left:calc(var(--u)*2);top:calc(var(--u)*2);width:calc(var(--u)*32);height:calc(var(--u)*32);image-rendering:pixelated';
  }
  BOOK_FACE.set(id, 'happy');
  return BOOK_FACE.canvas;
}
// ---------------------------------------------------------------- the spiral notebook
// an open notebook: two ruled pages either side of the spiral
function notebook() {
  const nb = el('div', 'nb', '<div class="nb-page nb-l nb-ruled"></div><div class="nb-gutter"></div><div class="nb-page nb-r nb-ruled"></div>');
  return { nb, left: nb.children[0], right: nb.children[2] };
}
// where everybody lives, in Nana's handwriting
const WHERE = {
  gus: 'Log cabin on the main road', marie: 'Café Érable, Main St.', birdie: 'Little red house, Main St.',
  agnes: 'Blue house with the cats, Main St.', doug: 'The police post, Main St.', ingrid: 'The clinic, Main St.',
  kids: 'Out on the hockey rink', lou: 'The sawmill, down the river', lou_lh: 'The hut by the lighthouse',
};
const NANA_NOTE = {
  gus: 'Grumbles. Tips well. Likes it scalding.', marie: 'Runs the café. Will judge the foam.', birdie: 'Old sea captain. Shares her marshmallows with the gulls.',
  agnes: 'Lives with a great many cats.', doug: 'Calls it "patrol fuel". Two sugars.', ingrid: 'The doctor. Still looking for Hank\'s pulse.',
  kids: 'Marshmallows first, cocoa second.', lou: 'Hank\'s old pal from the mill. Big mug.', lou_lh: 'Keeps the light. Long ride, good tips.',
};
// the right-hand page: a taped-in photo (with a rubber stamp), who and where, then a few written lines
function nbCard(page, { id, spot, where = '', stamp = null, lines = [], quote = '' }) {
  const name = SHORT_NAME[id] || CUSTOMERS[spot]?.name || CHARACTERS[id]?.name || id;
  page.querySelector('.nb-card')?.remove();
  const st = stamp ? `<span class="nb-stamp ${stamp[1]}">${stamp[0]}</span>` : '';
  const c = el('div', 'nb-card', `<div class="nb-top"><span class="nb-photo">${st}</span><div class="nb-who"><div class="nm k-bold">${esc(name)}</div><div class="addr">${esc(where || WHERE[spot] || '')}</div></div></div>${lines.join('')}${quote ? `<div class="nb-quote">“${esc(quote)}”</div>` : ''}`);
  const fc = faceCanvas(id);
  if (fc) c.querySelector('.nb-photo').prepend(fc);
  page.prepend(c);
}
// how hot a cup is (every cup leaves the kitchen piping hot)
function heatLine(o) {
  const q = o.state === 'carried' ? o.quality : 100;
  const w = q > 85 ? 'piping hot' : q > 60 ? 'still hot' : q > 30 ? 'only warm' : 'gone cold!';
  const T = cupTemp(q);
  return `<div class="nb-line"><span class="v${q > 30 ? '' : ' nb-redink'}">${w}</span><span style="margin-left:auto;color:${T.color};font-weight:bold">${T.deg}\u00b0C</span></div>` +
    `<div class="nb-line" style="gap:calc(var(--u) * 3)">${tempBarHTML(q, 'big')}</div>`;
}
// pen doodles, a coffee ring and a pencil: a notebook that gets used
const DOODLE_KINDS = ['bike', 'mug', 'leaf', 'heart', 'star', 'swirl'];
function doodles(left, right, seed) {
  const pick = (k) => DOODLE_KINDS[(seed * 5 + k * 2) % DOODLE_KINDS.length];
  left.appendChild(el('i', 'nb-doodle dl')).style.backgroundImage = `var(--k-dd-${pick(0)})`;
  right.appendChild(el('i', 'nb-doodle dr')).style.backgroundImage = `var(--k-dd-${pick(1)})`;
  right.appendChild(el('i', 'nb-stain'));
  left.parentElement.appendChild(el('i', 'nb-pencil'));
}

// arrow-key grids follow the real column count once the grid is laid out
function autoGrid(m, items) {
  requestAnimationFrame(() => {
    if (!items.length) return;
    const top = items[0].offsetTop;
    const n = items.filter((e) => e.offsetTop === top).length;
    if (n > 0) m.grid = n;
  });
}
const SHORT_NAME = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes', mo: 'Mo' };
// short pantry names that fit a recipe card; shop names with soft hyphens for two lines
const SHORT_FOOD = { milk_bottle: 'Milk', cocoa_powder: 'Cocoa', sugar: 'Sugar', marshmallows: 'Mallows', maple_syrup: 'Syrup', cinnamon: 'Cinnamon', mint: 'Mint', cream: 'Cream', pumpkin: 'Pumpkin', nutmeg: 'Nutmeg', coffee_beans: 'Coffee', dark_chocolate: 'Chocolate' };
const SHOP_NAME = { milk_bottle: 'Milk', marshmallows: 'Marsh­mallows', dark_chocolate: 'Dark Choco­late', cinnamon: 'Cinna­mon', mint: 'Fresh Mint' };
const fmtNum = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : v.toFixed(1));
const shopCols = () => (scale.cols < 330 ? 3 : scale.cols < 420 ? 4 : 6);
const MUGS = ['classic', 'maple', 'mint', 'pumpkin', 'cinnamon', 'mocha'];
function mugOf(o) {
  if (MUGS.includes(o.cocoa)) return o.cocoa;
  const l = (o.label || '').toLowerCase();
  return MUGS.find((k) => l.includes(k)) || (l.includes('spice') ? 'pumpkin' : l.includes('lumberjack') ? 'mocha' : 'classic');
}

// a hand-drawn paper map, N art pixels square: pencil contours, hatched water,
// little tree doodles, inked roads and tiny houses
function paintMap(terrain, N = 192) {
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const toW = (i) => -WORLD_HALF + ((i + 0.5) / N) * WORLD_HALF * 2;
  const H = new Float32Array(N * N), RD = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    H[j * N + i] = terrain.heightAt(toW(i), toW(j));
    RD[j * N + i] = terrain.splatAt(toW(i), toW(j)).road > 0.5 ? 1 : 0;
  }
  const cstep = Math.max(4, Math.round(5 * (384 / N) * 0.6));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H[j * N + i];
    const n = ((i * 73856093) ^ (j * 19349663)) & 7;
    let r = 244 - n, gg = 230 - n, b = 196 - n;
    const hr = H[j * N + Math.min(N - 1, i + 1)], hd = H[Math.min(N - 1, j + 1) * N + i];
    if (h < 0) {
      // water: pale blue with diagonal pencil hatching
      r = 172; gg = 200; b = 210;
      if ((i + j) % 4 === 0) { r -= 34; gg -= 26; b -= 16; }
    } else {
      const k = Math.min(1, h / 60);
      r -= k * 28; gg -= k * 24; b -= k * 20;
      if (Math.floor(h / cstep) !== Math.floor(hr / cstep) || Math.floor(h / cstep) !== Math.floor(hd / cstep)) { r -= 46; gg -= 42; b -= 38; }
      if (RD[j * N + i]) { r = 138; gg = 92; b = 60; }
    }
    // coast line in ink
    if ((h < 0) !== (hr < 0) || (h < 0) !== (hd < 0)) { r = 58; gg = 46; b = 56; }
    const o = (j * N + i) * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // tree doodles where the forest is thick
  const sp = N >= 240 ? 8 : 7;
  for (let j = 4; j < N; j += sp) for (let i = 4 + ((j / sp) % 2) * 3; i < N; i += sp) {
    const x = toW(i), z = toW(j);
    if (H[j * N + i] < 2 || RD[j * N + i]) continue;
    const f = terrain.splatAt(x, z).litter ?? 0.5;
    if (f < 0.45) continue;
    ctx.fillStyle = f > 0.7 ? '#4e6a34' : '#b0602a';
    ctx.fillRect(i - 1, j - 3, 3, 1); ctx.fillRect(i - 2, j - 2, 5, 2);
    ctx.fillStyle = '#3e2a1c'; ctx.fillRect(i, j, 1, 1);
  }
  // little houses
  for (const bld of BUILDINGS) {
    const x = Math.round(((bld.x + WORLD_HALF) / (WORLD_HALF * 2)) * N), y = Math.round(((bld.z + WORLD_HALF) / (WORLD_HALF * 2)) * N);
    ctx.fillStyle = '#3a2a24'; ctx.fillRect(x - 2, y - 2, 5, 4);
    ctx.fillStyle = '#c8502e'; ctx.fillRect(x - 2, y - 3, 5, 1); ctx.fillRect(x - 1, y - 4, 3, 1);
    ctx.fillStyle = '#f2e6c8'; ctx.fillRect(x - 1, y - 1, 3, 2);
  }
  // a compass rose in the corner
  const rx = N - 14, ry = N - 14;
  ctx.fillStyle = '#6a4a2a';
  for (let k = -9; k <= 9; k++) { ctx.fillRect(rx + k, ry, 1, 1); ctx.fillRect(rx, ry + k, 1, 1); }
  ctx.fillStyle = '#c8361f';
  for (let k = 1; k < 9; k++) ctx.fillRect(rx - Math.floor((9 - k) / 4), ry - k, 1 + 2 * Math.floor((9 - k) / 4), 1);
  ctx.fillStyle = '#2a1a14';
  ctx.fillRect(rx - 2, ry - 15, 1, 5); ctx.fillRect(rx + 2, ry - 15, 1, 5); ctx.fillRect(rx - 1, ry - 14, 1, 1); ctx.fillRect(rx, ry - 13, 1, 1); ctx.fillRect(rx + 1, ry - 12, 1, 1);
  return c;
}
