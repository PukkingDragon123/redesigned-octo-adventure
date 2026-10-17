// Every screen is written on the pages of Hank's journal (src/ui/book.js lifts the 3D
// book into view, src/ui/book3d.js is the book): the journal itself (pause), Nana's
// order book and customers, the paper map, Nana's recipes, Harold's Skill Book, the
// keepsakes, settings, controls, Mo's shop list and the day's receipt. Each section
// writes a left and a right page with the pixel UI kit (src/ui/kit.js; styles in
// src/ui/book.css, menus.css and notebook.css) and hands back its menu items for the
// keyboard / pad; the bookmarks down the fore-edge turn between them.
import { el } from '../ui/ui.js';
import { kBar, kSlider, kToggle, kSlot, kKey, esc, scale, setUIScaleOffset } from '../ui/kit.js';
import { iconURL, iconSmallURL, glyphURL } from '../art/icons.js';
import { LivePortrait } from '../ui/live3d.js';
import { CHARACTERS } from '../art/characters.js';
import { KEEPSAKES, POI, CUSTOMERS, WORLD_HALF, WORLD_X0, WORLD_Z0, BUILDINGS } from '../world/layout.js';
import { KEEPSAKE_ICON } from './keepsakes.js';
import { hasSave } from './state.js';
import { tempBarHTML, cupTemp } from './orders.js';
import { foodIconURL, FOOD_INFO } from '../art/foodsprites.js';
import { QUESTS, SHOP, RECIPES, LOST, BIRD_NAMES } from './quests.js';
import { RIBBONS } from './carveScore.js';
import { markName } from '../ui/compass3d.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// a stand-in move list so the Skill Book can be opened before game.skills exists
const STUB_SKILLS = [
  { id: 'wheelie', name: 'Wheelie', icon: 'skill_wheelie', how: 'Pedal and hold lean-back to lift the front wheel. Small taps keep it up.', desc: 'Harold once rode a wheelie from the mill to the chapel.', tier: 1, maxTier: 3, goal: 'Hold a wheelie for 5 seconds', progress: 0.4 },
  { id: 'stoppie', name: 'Stoppie', icon: 'skill_stoppie', how: 'Brake hard and lean forward: the back wheel lifts.', desc: 'Stopping, but with style.', tier: 0, maxTier: 3, goal: 'Stoppie for 0.8 seconds', progress: 0.1 },
  { id: 'bunnyhop', name: 'Bunny Hop', icon: 'skill_hop', how: 'Hold hop to crouch, let go to pop.', desc: 'Up and over: logs, kerbs, ducks.', tier: 2, maxTier: 3, goal: 'Hop 1.12 m high', progress: 0.7 },
  { id: 'drift', name: 'Drift', icon: 'skill_drift', how: 'At speed, hold drift and steer into a corner.', desc: 'The cocoa stays (mostly) in the cup.', tier: 3, maxTier: 3, goal: 'Mastered!', progress: 1 },
];

// the bookmarks, in order down the fore-edge
const TABS = ['journal', 'orders', 'map', 'customers', 'recipes', 'skills', 'keepsakes', 'settings', 'controls'];

export class Menus {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.boardMode = false;
    this.register();
  }
  get book() {
    return this.game.book;
  }

  // ---------------------------------------------------------------- building blocks
  // a heading in red ink, with a pencilled line under it
  head(page, title, sub = '') {
    page.appendChild(el('div', 'bk-head', `<div class="bk-h k-bold">${title}</div>${sub ? `<div class="bk-sub">${sub}</div>` : ''}`));
  }
  // a selectable row (index entries, list rows): glyph + label (+ right side)
  item(label, onClick, { icon = '', right = '', cls = '' } = {}) {
    const b = el('button', `k-item pick${cls ? ` ${cls}` : ''}`, `${icon ? `<img class="k-g" src="${icon}">` : '<i class="k-g"></i>'}<span class="lbl">${label}</span>${right ? `<span class="rt">${right}</span>` : ''}`);
    b.addEventListener('click', () => { this.game.sound?.play('ui_click'); onClick?.(b); });
    return this.ui.hoverSelect(b);
  }
  // open the book on a section (or turn to it if the book is already up)
  open(id, opts = {}) {
    const g = this.game;
    if (!g.book) return null;
    return g.book.open(id, opts);
  }
  // the usual way out of a menu opened during play
  resume() {
    return () => this.game.resumeFromMenu();
  }

  // ---------------------------------------------------------------- the old entry points
  pause() { return this.open('journal', { onClose: this.resume() }); }
  map() { return this.open('map', { onClose: this.resume() }); }
  keepsakes() { return this.open('keepsakes', { onClose: this.resume() }); }
  recipes() { return this.open('recipes', { onClose: this.resume() }); }
  customers() { return this.open('customers', { onClose: this.resume() }); }
  // from the title screen only settings and controls are bookmarked
  settings(onClose) {
    const title = this.game.mode === 'title';
    return this.open('settings', { onClose: () => { this.game.saveSettings(); onClose?.(); }, tabs: title ? ['settings', 'controls'] : null });
  }
  controls() {
    const title = this.game.mode === 'title';
    return this.open('controls', { tabs: title ? ['settings', 'controls'] : null, onClose: title ? null : this.resume() });
  }
  // Nana's order book on the kitchen table: ticking a line packs that cup
  orderBoard(onDone) {
    this.boardMode = true;
    return this.open('orders', { onClose: () => { this.boardMode = false; onDone?.(); }, tabs: ['orders', 'recipes', 'customers', 'map', 'journal', 'settings', 'controls'] });
  }
  garage(onDone) { return this.skillBook(onDone); }
  skillBook(onDone) { return this.open('skills', { onClose: onDone }); }
  // Mo's: the shopping list pinned into the book (no bookmarks: pay or leave)
  shop(onDone) {
    this.cart = {};
    this.game.sound.play('shop_bell');
    return this.open('shop', { tabs: false, onClose: () => onDone?.() });
  }
  // the day's receipt before bed
  summary(onDone) { return this.open('receipt', { tabs: false, noClose: true, onClose: onDone }); }
  // the pumpkin-carving page went with the Halloween decorations; an old caller just gets "not now"
  carve(onDone) { onDone?.(null); }

  // ---------------------------------------------------------------- the sections
  register() {
    const B = this.game.book;
    if (!B) return;
    const sec = (id, title, icon, build, extra = {}) => B.register(id, { title, icon, build: (L, R, ctx) => build.call(this, L, R, ctx), ...extra });
    sec('journal', "Hank's Journal", 't_journal', this.pJournal);
    sec('orders', "Nana's Orders", 'cocoa', this.pOrders);
    sec('map', 'The Map', 'map', this.pMap);
    sec('customers', "Nana's Customers", 'home', this.pCustomers);
    sec('recipes', "Nana's Recipes", 'mug_classic', this.pRecipes);
    sec('skills', 'The Skill Book', 'skill_wheelie', this.pSkills);
    sec('keepsakes', "Harold's Keepsakes", 'lantern', this.pKeepsakes);
    sec('settings', 'Settings', 'gear', this.pSettings);
    sec('controls', 'Controls', 'pad', this.pControls);
    sec('shop', 'Moose & Goose', 'basket', this.pShop, { hidden: true });
    sec('receipt', 'Receipt', 'coin', this.pReceipt, { hidden: true });
    B.order = TABS.slice();
  }

  // ---- the journal (pause): today on the left, the contents on the right
  pJournal(L, R, ctx) {
    const g = this.game;
    const st = g.state;
    const d = st.stats || {};
    const hr = g.world.atmosphere.hour;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
    this.head(L, `Day ${st.day}`, `${time}, ${esc(g.world.atmosphere.weatherTarget || 'clear')}`);
    L.appendChild(el('div', 'jdate', `<img class="k-g" src="${glyphURL('coin')}"><b>$${Math.floor(st.money)}</b><img class="k-g" src="${glyphURL('cocoa')}"><span>${d.deliveries || 0} cups delivered</span>`));
    // the cups on Bessie right now, and how hot they still are
    const carried = g.orders?.carried?.() || [];
    if (carried.length) {
      L.appendChild(el('div', 'k-h k-bold', 'In the crate'));
      for (const o of carried) L.appendChild(el('div', 'jcup', `<img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="nm">${esc(SHORT_NAME[o.customer] || o.customer)}</span>${tempBarHTML(o.quality)}`));
    }
    L.appendChild(el('div', 'k-h k-bold', 'Errands'));
    const Q = st.quests || {};
    const lines = [];
    const row = (done, text) => `<div class="jq${done ? ' done' : ''}"><img class="k-g" src="${glyphURL(done ? 'boxOn' : 'box')}"><span>${text}</span></div>`;
    for (const [id, def] of Object.entries(QUESTS)) {
      const q = Q[id];
      if (q?.state === 'active') lines.push(row(false, def.title));
      else if (q?.state === 'done') lines.push(row(true, def.title));
    }
    for (const Lo of LOST) {
      const q = Q[`lost_${Lo.id}`];
      if (q?.state === 'active') lines.push(row(false, `${q.found ? 'Return' : 'Find'} the ${Lo.name}`));
      else if (q?.state === 'done') lines.push(row(true, `Found the ${Lo.name}`));
    }
    L.appendChild(el('div', 'jlist', lines.length ? lines.join('') : '<p class="hint">Nothing yet. Chat with folks around town!</p>'));
    if (st.photos && Object.keys(st.photos).length) {
      L.insertAdjacentHTML('beforeend', `<div class="k-h k-bold">Bird book</div><div class="jphotos">${Object.keys(st.photos).map((k) => `<span class="jph"><img class="k-g" src="${glyphURL('camera')}">${esc(BIRD_NAMES[k] || k)}</span>`).join('')}</div>`);
    }
    const pr = st.carving?.ribbons;
    if (pr && Object.values(pr).some((n) => n)) {
      const medal = { first: 'medalG', second: 'medalS', third: 'medalB', part: 'medalNone' };
      L.insertAdjacentHTML('beforeend', `<div class="k-h k-bold">Pumpkin ribbons</div><div class="jphotos">${Object.keys(RIBBONS).filter((k) => pr[k]).map((k) => `<span class="jph"><img class="k-g" src="${glyphURL(medal[k])}">${pr[k] > 1 ? `${pr[k]} x ` : ''}${esc(RIBBONS[k].name)}</span>`).join('')}<span class="jph">Best: ${st.carving.best || 0} pts</span></div>`);
    }
    // the contents page
    this.head(R, 'Contents');
    const go = (k) => () => ctx.go(k);
    const items = [
      this.item('Back to the road', () => ctx.close(), { icon: glyphURL('arrowR') }),
      this.item('The map', go('map'), { icon: iconSmallURL('map') }),
      this.item("Nana's orders", go('orders'), { icon: glyphURL('cocoa') }),
      this.item("Harold's keepsakes", go('keepsakes'), { icon: iconSmallURL('lantern') }),
      this.item('Skill book', go('skills'), { icon: iconSmallURL('skill_wheelie') }),
      this.item("Nana's customers", go('customers'), { icon: glyphURL('home') }),
      this.item("Nana's recipes", go('recipes'), { icon: glyphURL('mug_classic') }),
      this.item('Settings', go('settings'), { icon: glyphURL('gear') }),
      this.item('Controls', go('controls'), { icon: glyphURL('pad') }),
      this.item('Save & quit', () => { g.save(); location.href = location.pathname; }, { icon: glyphURL('home'), cls: 'quit' }),
    ];
    const idx = el('div', 'jindex');
    items.forEach((b) => idx.appendChild(b));
    R.appendChild(idx);
    return { items };
  }

  // ---- Nana's order book: today's orders down the left, the one under the finger on the right
  pOrders(L, R, ctx) {
    const g = this.game;
    const ui = this.ui;
    const O = g.orders;
    const board = this.boardMode;
    const head = el('div', 'nb-head');
    L.appendChild(head);
    const list = el('div', 'nb-list');
    L.appendChild(list);
    const rows = [];
    const all = O.list.filter((o) => o.state === 'board' || o.state === 'carried' || o.state === 'delivered');
    const detail = (o) => nbCard(R, {
      id: o.customer, spot: o.spot,
      stamp: o.state === 'delivered' ? ['DONE', 'ok'] : o.state === 'carried' ? ['PACKED', 'ok'] : o.rush ? ['RUSH', ''] : null,
      lines: [`<div class="nb-line wrap"><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="v">${esc(o.label)}</span></div>`, heatLine(o)],
      quote: o.note,
    });
    let m = null;
    all.forEach((o, i) => {
      const r = el('button', 'nb-row pick', `<i class="bx"></i><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="nm">${esc(SHORT_NAME[o.customer] || (CHARACTERS[o.customer]?.name || o.customer).split(' ')[0])}</span><span class="rt">${o.rush ? `<img class="k-g rush" src="${glyphURL('rush')}">` : ''}$${o.price}</span>`);
      const sync = () => { r.classList.toggle('packed', o.state === 'carried'); r.classList.toggle('done', o.state === 'delivered'); };
      sync();
      r.addEventListener('focus-item', () => detail(o));
      r.addEventListener('click', () => {
        detail(o);
        if (!board || o.state === 'delivered') return;
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
        m = ui.menuStack[ui.menuStack.length - 1];
        if (packed && m?.book) {
          const full = O.carried().length >= O.capacity();
          const open = (e) => !e.classList.contains('packed') && !e.classList.contains('done');
          const next = rows.findIndex((e, k) => k > i && open(e));
          const later = next >= 0 ? next : rows.findIndex(open);
          m.sel = full || later < 0 ? rows.length : later;
          ui.highlight(m);
        }
      });
      ui.hoverSelect(r);
      list.appendChild(r);
      rows.push(r);
    });
    if (!all.length) list.appendChild(el('p', 'nb-pencil-note', 'No orders yet. Check back after breakfast!'));
    list.appendChild(el('div', 'nb-pencil-note nb-tip', board ? 'Tick what to pack. Cocoa cools as you ride!' : 'Packing happens at Nana\'s kitchen table.'));
    const upd = () => {
      const n = O.carried().length, cap = O.capacity();
      head.innerHTML = `<div class="t k-bold">Orders, day ${g.state.day}</div><div class="sub"><span class="cups">${Array.from({ length: cap }, (_, k) => `<img class="k-g${k < n ? '' : ' empty'}" src="${glyphURL('mug_classic')}">`).join('')}</span><span>${n}/${cap} packed</span></div>`;
    };
    upd();
    doodles(L, R, g.state.day);
    if (all[0]) detail(all[0]);
    else nbCard(R, { id: 'grandma', where: 'The cabin by the woods', quote: 'Breakfast first, dear. Then the orders.' });
    const items = rows.slice();
    if (board) {
      const go = ui.button("Let's ride!", () => ctx.close(), { small: 'load up the cocoa', face: 'green' });
      R.appendChild(el('div', 'm-foot')).appendChild(go);
      items.push(go);
    }
    return { items };
  }

  // ---- Nana's customers
  pCustomers(L, R) {
    const g = this.game;
    const ui = this.ui;
    const today = g.orders?.list || [];
    L.appendChild(el('div', 'nb-head', `<div class="t k-bold">Regulars</div><div class="sub">${Object.keys(CUSTOMERS).length} on the round</div>`));
    const list = el('div', 'nb-list');
    L.appendChild(list);
    const rows = Object.entries(CUSTOMERS).map(([spot, c]) => {
      const o = today.find((x) => x.spot === spot);
      const id = spot === 'kids' ? 'pip' : spot === 'lou_lh' ? 'ollie' : spot;
      const r = el('button', `nb-row pick${o?.state === 'delivered' ? ' done' : o?.state === 'carried' ? ' packed' : ''}`, `<i class="bx"></i><span class="nm">${esc(c.name)}</span><span class="rt">${o ? `<img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}">` : ''}</span>`);
      const show = () => nbCard(R, {
        id, spot,
        stamp: o?.state === 'delivered' ? ['DONE', 'ok'] : null,
        lines: [
          `<div class="nb-line wrap nb-pencil-note">${esc(NANA_NOTE[spot] || '')}</div>`,
          o ? `<div class="nb-line wrap"><span class="lbl">Today:</span><img class="k-food" src="${foodIconURL(`cocoa_${mugOf(o)}`)}"><span class="v">${esc(o.label)}</span></div>` : '<div class="nb-line"><span class="lbl">Today:</span><span class="v">no order</span></div>',
        ],
      });
      r.addEventListener('focus-item', show);
      r.addEventListener('click', show);
      ui.hoverSelect(r);
      list.appendChild(r);
      return r;
    });
    doodles(L, R, 7);
    return { items: rows };
  }

  // ---- Harold's Skill Book
  pSkills(L, R) {
    const g = this.game;
    const list = g.skills?.list ? g.skills.list() : STUB_SKILLS;
    const mastered = list.reduce((n, s) => n + (s.tier || 0), 0), total = list.reduce((n, s) => n + (s.maxTier || 3), 0);
    this.head(L, "Harold's riding notes");
    L.appendChild(el('div', 'sbtotal', `<img class="k-g" src="${glyphURL('medalG')}"><span>${mastered} / ${total} medals</span>`));
    const rows = el('div', 'sblist');
    L.appendChild(rows);
    const medals = (s, big = false) => Array.from({ length: s.maxTier || 3 }, (_, k) => `<img class="k-g${big ? ' big' : ''}" src="${glyphURL(k < s.tier ? ['medalB', 'medalS', 'medalG', 'medalG', 'medalG'][k] : 'medalNone')}">`).join('');
    const detail = (s) => {
      const done = s.tier >= (s.maxTier || 3);
      const best = s.best != null && s.unit != null ? `${fmtNum(s.best)}${s.unit ? ` ${s.unit}` : ''}` : '';
      R.innerHTML = `<div class="sbhead"><div class="k-slot"><img src="${iconURL(s.icon || s.id)}"></div><div><div class="sbname k-bold">${esc(s.name)}${s.tier ? ` ${ROMAN[s.tier]}` : ''}</div><div class="sbmedals">${medals(s, true)}</div></div></div>
        <div class="sbgoal"><span class="lbl">${done ? 'Mastered!' : 'Next:'}</span> ${done ? '' : esc(s.goal || '')}</div>
        <div class="sbbar"></div>${best ? `<div class="sbbest">Best: <b>${esc(best)}</b></div>` : ''}
        <div class="sbhow">${esc(s.how || '')}</div>
        <div class="sbdesc">${esc(s.desc || '')}</div>${s.note ? `<div class="sbnote">${esc(s.note)}</div>` : ''}`;
      R.querySelector('.sbbar').appendChild(kBar(done ? 1 : s.progress || 0, done ? 'grow' : 'gold'));
    };
    const items = list.map((s) => {
      const r = this.item(esc(s.name), () => detail(s), { icon: iconSmallURL(s.icon || s.id), right: medals(s), cls: s.tier >= (s.maxTier || 3) ? 'master' : s.tier ? '' : 'new' });
      r.addEventListener('focus-item', () => detail(s));
      rows.appendChild(r);
      return r;
    });
    if (list[0]) detail(list[0]);
    return { items };
  }

  // ---- keepsakes: the slots on the left, the story on the right
  pKeepsakes(L, R, ctx) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    const n = Object.keys(st.keepsakes).length;
    this.head(L, "Harold's Keepsakes", `${n} / ${KEEPSAKES.length} found`);
    const grid = el('div', 'slots');
    L.appendChild(grid);
    L.appendChild(el('p', 'hint', 'Bring them home: Nana has a story for each one.'));
    const detail = el('div', 'kdetail');
    R.appendChild(detail);
    const slots = KEEPSAKES.map((k) => {
      const have = st.keepsakes[k.id];
      const s = kSlot(iconURL(KEEPSAKE_ICON[k.id]), { state: have ? '' : 'locked', badge: have === 'given' ? ' ' : '', cls: 'pick' });
      if (have === 'given') s.querySelector('.k-badge').classList.add('given');
      s.addEventListener('focus-item', () => {
        detail.innerHTML = have ? `<div class="bk-h k-bold">${esc(k.name)}</div><p>${esc(k.note)}</p>${have === 'found' ? '<p class="warn">Bring it home to Nana!</p>' : '<p class="okay">Nana has it on the mantel.</p>'}` : '<div class="bk-h k-bold">???</div><p>Somewhere out in the wilds... Harold always did wander.</p>';
      });
      s.addEventListener('click', () => s.dispatchEvent(new CustomEvent('focus-item')));
      ui.hoverSelect(s);
      grid.appendChild(s);
      return s;
    });
    // as many columns as fit on the page
    const cols = Math.max(2, Math.min(4, Math.floor((g.book.lay.aw - 22) / 48)));
    grid.style.gridTemplateColumns = `repeat(${cols}, calc(var(--u) * 46))`;
    return { items: slots, grid: cols };
  }

  // ---- the paper map on the left, where everything is on the right
  pMap(L, R) {
    const g = this.game;
    const lay = g.book.lay;
    this.head(L, 'Maple Cove', 'and the backcountry');
    // paint the map at exactly the art-pixel size it is shown at, so it stays crisp
    const avail = Math.min(lay.aw - 24, lay.ah - 52);
    const N = Math.max(96, Math.min(300, Math.floor(avail / 4) * 4));
    this.mapCanvases = this.mapCanvases || new Map();
    const c = this.mapCanvases.get(N) || paintMap(g.world.terrain, N);
    this.mapCanvases.set(N, c);
    const wrap = el('div', 'mapwrap');
    const img = el('canvas');
    img.width = c.width;
    img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    img.style.width = img.style.height = `calc(var(--u) * ${N})`;
    wrap.appendChild(img);
    const at = (x, z) => [((x - WORLD_X0) / (WORLD_HALF * 2)) * N, ((z - WORLD_Z0) / (WORLD_HALF * 2)) * N];
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
    if (N >= 160) {
      label(POI.graveyard.x, POI.graveyard.z - 14, 'Old Pine Cemetery');
      if (POI.lighthouse) label(POI.lighthouse.x - 8, POI.lighthouse.z - 14, 'Lighthouse');
      if (POI.sawmill) label(POI.sawmill.x, POI.sawmill.z + 12, 'Sawmill');
      if (POI.lake) label(POI.lake.x, POI.lake.z - 4, 'Lac des Huards');
      if (POI.marsh) label(POI.marsh.x, POI.marsh.z + 36, 'Moose Marsh');
    }
    if (N >= 220) {
      if (POI.lookout) label(POI.lookout.x, POI.lookout.z - 12, 'Sunset Lookout');
      if (POI.pond) label(POI.pond.x, POI.pond.z - 12, 'Beaver Pond');
      if (POI.station) label(POI.station.x + 6, POI.station.z - 16, 'Gare Ste-Rose');
      if (POI.firetower) label(POI.firetower.x, POI.firetower.z - 18, 'Mont Écho');
      if (POI.cafeHut) label(POI.cafeHut.x + 4, POI.cafeHut.z - 14, 'Café');
    }
    pin(POI.cabin.x, POI.cabin.z, glyphURL('home'));
    for (const o of g.orders.carried()) { const c2 = CUSTOMERS[o.spot]; if (c2) pin(c2.x, c2.z, glyphURL('cocoa')); }
    for (const k of KEEPSAKES) if (g.state.keepsakes[k.id]) pin(k.x, k.z, iconSmallURL(KEEPSAKE_ICON[k.id]));
    if (g.catEventActive) { const c3 = g.story.stray?.pos || POI.catLog; pin(c3.x, c3.z, iconSmallURL('cat')); }
    for (const q of g.quests?.markers() || []) pin(q.x, q.z, iconSmallURL(q.icon), 'quest');
    pin(g.playerPos.x, g.playerPos.z, iconSmallURL('skull'), 'me');
    L.appendChild(wrap);
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
    // the right page: where's what, nearest first, with which way and how far
    this.head(R, "Where's what");
    const p = g.playerPos;
    const places = [];
    for (const m of g.compassMarkers?.() || []) places.push({ name: markName(g, m), x: m.x, z: m.z, icon: m.icon });
    const fixed = [["Nana's cabin", POI.cabin, 'home'], ['Maple Cove', POI.plaza, 'star']];
    for (const [name, q, icon] of fixed) if (q && !places.some((x) => x.name === name)) places.push({ name, x: q.x, z: q.z, icon });
    places.forEach((x) => (x.d = Math.hypot(x.x - p.x, x.z - p.z)));
    places.sort((a, b) => a.d - b.d);
    const heading = (() => { const d = g.camera.getWorldDirection(g.camera.position.clone()); return Math.atan2(d.x, -d.z); })();
    const arrow = (x) => {
      const a = Math.atan2(x.x - p.x, -(x.z - p.z)) - heading;
      const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      return ['arrowU', 'arrowR', 'arrowR', 'arrowR', 'arrowD', 'arrowL', 'arrowL', 'arrowL'][k];
    };
    const iconOf = (n) => ({ cocoa: glyphURL('cocoa'), home: glyphURL('home'), star: glyphURL('star') }[n] || iconSmallURL(n));
    const ul = el('div', 'mplaces');
    for (const x of places.slice(0, 9)) {
      ul.appendChild(el('div', 'mplace', `<img class="k-g" src="${iconOf(x.icon)}"><span class="nm">${esc(x.name)}</span><span class="d">${x.d < 1000 ? `${Math.round(x.d)} m` : `${(x.d / 1000).toFixed(1)} km`}</span><img class="k-g ar" src="${glyphURL(arrow(x))}">`));
    }
    R.appendChild(ul);
    R.appendChild(el('div', 'maplegend', `<span><img class="k-g" src="${glyphURL('cocoa')}">cocoa</span><span><img class="k-g" src="${iconSmallURL('skull')}">you</span><span><img class="k-g" src="${glyphURL('home')}">home</span>`));
    g.sound.play('paper_unfold');
    return { items: [] };
  }

  // ---- Nana's recipes & pantry: three cards a page
  pRecipes(L, R) {
    const g = this.game;
    const pantry = g.state.pantry || {};
    const names = { classic: 'Classic Cocoa', maple: 'Maple Mallow', cinnamon: 'Cinnamon Fire', mint: 'Peppermint', pumpkin: 'Pumpkin Spice', mocha: 'Lumberjack' };
    this.head(L, "Nana's Recipes", 'one of each per cup');
    const ids = Object.keys(RECIPES);
    const card = (id) => {
      const ing = RECIPES[id];
      const can = ing.every((k) => (pantry[k] || 0) > 0);
      const c = el('div', `rcard${can ? '' : ' short'}`);
      c.innerHTML = `<img class="big" src="${foodIconURL('cocoa_' + id)}"><div class="rtext"><div class="rn k-bold">${names[id] || id}</div><div class="ri">${ing.map((k) => `<div class="${(pantry[k] || 0) > 0 ? 'ok' : 'out'}"><img class="k-g" src="${glyphURL((pantry[k] || 0) > 0 ? 'check' : 'cross')}"><span>${esc(SHORT_FOOD[k] || FOOD_INFO[k]?.label || k)}</span><b>${pantry[k] || 0}</b></div>`).join('')}</div></div>`;
      return c;
    };
    const half = Math.ceil(ids.length / 2);
    const gl = el('div', 'rgrid'), gr = el('div', 'rgrid');
    ids.slice(0, half).forEach((id) => gl.appendChild(card(id)));
    ids.slice(half).forEach((id) => gr.appendChild(card(id)));
    L.appendChild(gl);
    R.appendChild(gr);
    R.appendChild(el('p', 'hint', 'Low? Mo at Moose &amp; Goose has it all.'));
    return { items: [] };
  }

  // ---- settings: the picture on the left, the sound and the camera on the right
  pSettings(L, R) {
    const g = this.game;
    const ui = this.ui;
    const s = g.settings;
    const rows = [];
    if (s.uiSize === undefined) s.uiSize = 0;
    // a row is the menu item: left/right nudges its control, confirm clicks it
    const row = (page, label, ctrl, icon) => {
      const r = el('div', 'k-setrow pick', `${icon ? `<img class="k-g" src="${icon}">` : '<i class="k-g"></i>'}<span class="lbl">${label}</span>`);
      r.appendChild(ctrl);
      r.nudge = (d) => ctrl.nudge?.(d);
      r.addEventListener('click', (e) => { if (e.target === r || e.target.classList.contains('lbl')) ctrl.nudge?.(1); });
      ui.hoverSelect(r);
      page.appendChild(r);
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
    this.head(L, 'Settings', 'the picture');
    // resolution: HD renders every real screen pixel, Balanced a little under; Retro and Chunky are the pixel looks
    row(L, 'Resolution', cycle('pixel', [1, 1.5, 2, 3], ['HD', 'Balanced', 'Retro', 'Chunky']), glyphURL('eye'));
    row(L, 'Graphics', cycle('quality', ['low', 'medium', 'high'], ['Low', 'Medium', 'High']), glyphURL('gear'));
    row(L, 'Interface size', cycle('uiSize', [-1, 0, 1, 2], ['Small', 'Normal', 'Big', 'Huge'], (v) => { setUIScaleOffset(v); g.saveSettings(); }), glyphURL('size'));
    // Bessie's gears: automatic until the first shift by hand (which sets this to By hand)
    row(L, 'Gears', cycle('gears', ['auto', 'manual'], ['Automatic', 'By hand']), glyphURL('gear'));
    row(L, 'Show FPS', kToggle(!!s.fps, (on) => { s.fps = on; g.applySettings(); }), glyphURL('dot'));
    this.head(R, 'Sound', 'and the camera');
    row(R, 'Master volume', slider('master', 0, 1, 0.05), glyphURL('speaker'));
    row(R, 'Music', slider('music', 0, 1, 0.05), glyphURL('note'));
    row(R, 'Sound effects', slider('sfx', 0, 1, 0.05), glyphURL('bones'));
    row(R, 'Camera distance', slider('camDist', 0.8, 1.5, 0.05), glyphURL('camera'));
    const ok = ui.button('Done', () => { g.saveSettings(); g.book.close(); }, { face: 'green' });
    R.appendChild(el('div', 'm-foot')).appendChild(ok);
    return { items: [...rows, ok] };
  }

  // ---- controls: on the bike on the left, on foot on the right
  pControls(L, R) {
    const touch = document.getElementById('ui')?.classList.contains('touchmode');
    const K = (...k) => k.map((x) => kKey(x)).join('');
    const ride = [
      [K('W', 'S'), 'Pedal: alternate them, each one a half turn of the crank (or drag the crank round). Faster is faster, and tiring'],
      [K('Z', 'X'), 'Gear down / up'],
      [K('S'), 'Hold on its own to brake / roll back'], [K('A', 'D'), 'Steer; spin in the air'],
      [K('Space'), 'Hop (hold to crouch, let go to pop)'], [K('Shift'), 'Drift; with a direction in the air: poses'],
      [K('Q'), 'Lean back: wheelie, manual, backflip'], [K('F'), 'Lean forward: stoppie, nose, frontflip'],
      [K('E'), 'Talk, deliver, hop off / on'], [K('R'), 'Ring the bell'],
    ];
    const foot = [
      [K('W', 'A', 'S', 'D'), 'Walk (hold Shift to sprint)'], [K('Space'), 'Jump (tap for a hop)'], [K('E'), 'Do what the tag says: talk, hop on, kick it...'],
      [K('C'), 'Camera (once you have one)'], [K('M'), 'The map'], [K('Esc'), 'This journal / skip a scene'], [K('Tab'), 'Turn to the next bookmark'],
    ];
    const col = (page, title, lines) => {
      this.head(page, title);
      page.insertAdjacentHTML('beforeend', lines.map(([k, v]) => `<div class="crow"><span class="ck">${k}</span><span>${v}</span></div>`).join(''));
    };
    col(L, 'On the bike', ride);
    col(R, 'On foot & anywhere', foot);
    R.appendChild(el('p', 'hint', touch
      ? 'Touch: the left stick steers (pull back: wheelie, push up: stoppie). Circle your thumb round the crank to pedal (backwards brakes). Tap the little journal or the compass up top.'
      : 'Gamepad: circle the right stick to pedal (or alternate RT and LT), d-pad up / down shifts, LT brakes, A hops, RB drifts, X talks, Start opens this journal, LB / RB turn its pages.'));
    return { items: [] };
  }

  // ---- Moose & Goose: the shelf on the left, the basket and the till on the right
  pShop(L, R, ctx) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    st.bag = st.bag || {};
    const cart = (this.cart = this.cart || {});
    const total = () => Object.entries(cart).reduce((s, [k, n]) => s + n * (FOOD_INFO[k]?.price || 3), 0);
    const done = (pay) => {
      if (pay && total() > 0) {
        st.money -= total();
        for (const [k, n] of Object.entries(cart)) st.bag[k] = (st.bag[k] || 0) + n * 2;
        g.sound.play('cash_coins');
        ui.pop('Groceries bagged! Now home to Nana before the milk gets ideas.', { expr: 'happy' });
        g.save();
      }
      this.cart = {};
      ctx.close();
    };
    this.head(L, 'Moose & Goose', 'each item makes two cups');
    const shelf = el('div', 'shoplist');
    L.appendChild(shelf);
    const bar = el('div', 'shopbar');
    const basket = el('div', 'shopbasket');
    this.head(R, 'Your basket');
    R.append(bar, basket);
    const items = [];
    const render = () => {
      bar.innerHTML = `<span><img class="k-g" src="${glyphURL('coin')}">Pocket <b>$${Math.floor(st.money)}</b></span><span><img class="k-g" src="${iconSmallURL('basket')}">Total <b>$${total()}</b></span>`;
      const lines = Object.entries(cart).filter(([, n]) => n > 0);
      basket.innerHTML = lines.length ? lines.map(([k, n]) => `<div class="bline"><img class="k-g" src="${foodIconURL(k)}"><span class="nm">${esc(SHOP_NAME[k] || FOOD_INFO[k]?.label || k)}</span><span>${n} x $${FOOD_INFO[k]?.price || 3}</span></div>`).join('') : '<p class="hint">Nothing yet. Tap what you need.</p>';
      items.forEach((e) => e.sync?.());
    };
    for (const k of SHOP) {
      const info = FOOD_INFO[k] || { label: k, price: 3 };
      const have = (st.pantry || {})[k] || 0;
      const e = el('button', 'shoprow pick', `<img class="k-food" src="${foodIconURL(k)}"><span class="nm">${esc(SHOP_NAME[k] || info.label)}</span><span class="have">${have ? `${have} left` : 'none'}</span><span class="pr">$${info.price}</span><span class="k-count qty"></span>`);
      e.sync = () => { const q = e.querySelector('.qty'); q.textContent = cart[k] ? `${cart[k]}` : ''; q.style.visibility = cart[k] ? '' : 'hidden'; e.classList.toggle('taken', !!cart[k]); };
      e.addEventListener('click', () => {
        if (total() + info.price > st.money) { g.sound.play('ui_error'); ui.pop("That's a little more than you've got, Hank!", { who: 'mo', name: 'Mo', expr: 'sheepish', key: 'shop' }); return; }
        cart[k] = (cart[k] || 0) + 1;
        g.sound.play('register', { volume: 0.5 });
        render();
      });
      e.nudge = (d) => {
        if (d < 0 && cart[k]) { cart[k]--; g.sound.play('ui_hover'); render(); } else if (d > 0) e.click();
      };
      ui.hoverSelect(e);
      shelf.appendChild(e);
      items.push(e);
    }
    const foot = el('div', 'm-foot');
    const pay = ui.button('Pay & bag it', () => done(true), { face: 'green' });
    const leave = ui.button('Never mind', () => done(false));
    foot.append(pay, leave);
    R.appendChild(foot);
    render();
    return { items: [...items, pay, leave], onBack: () => done(false) };
  }

  // ---- the day's receipt
  pReceipt(L, R, ctx) {
    const g = this.game;
    const st = g.state;
    const s = st.stats;
    this.head(L, `Day ${st.day}`, 'all done');
    L.appendChild(el('p', 'rnote', 'Nana: “Well done, dear. Off to bed.”'));
    L.appendChild(el('i', 'nb-doodle dl')).style.backgroundImage = 'var(--k-dd-mug)';
    const r = el('div', 'k-paper receipt');
    r.appendChild(el('div', 'rhead k-bold', 'NANA MARGUERITE’S COCOA'));
    const line = (a, b, cls = '', icon = '') => r.appendChild(el('div', `line ${cls}`, `<span>${icon ? `<img class="k-g" src="${icon}">` : ''}${a}</span><span>${b}</span>`));
    line('Cups delivered', s.dayDeliveries || 0, '', glyphURL('cocoa'));
    line('Tips', `$${s.dayTips || 0}`, '', glyphURL('coin'));
    const w = s.dayWarm;
    if (w) line(`Warmest: ${SHORT_NAME[w.who] || CHARACTERS[w.who]?.name || w.who}`, `${cupTemp(w.q).deg}°C`, '', glyphURL('heart'));
    if ((s.dayAir || 0) >= 1) line('Best air', `${s.dayAir.toFixed(1)}s`, '', glyphURL('star'));
    line('Earned today', `$${s.dayEarned || 0}`, 'total');
    line('Savings', `$${Math.floor(st.money)}`);
    R.appendChild(r);
    const ok = this.ui.button('Sleep', () => ctx.close(), { icon: glyphURL('moon') });
    R.appendChild(el('div', 'm-foot')).appendChild(ok);
    return { items: [ok], onBack: () => ctx.close() };
  }

  // ---------------------------------------------------------------- title (an old hook; title.js draws the title now)
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

const SHORT_NAME = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes', mo: 'Mo' };
// short pantry names that fit a recipe card; shop names with soft hyphens for two lines
const SHORT_FOOD = { milk_bottle: 'Milk', cocoa_powder: 'Cocoa', sugar: 'Sugar', marshmallows: 'Mallows', maple_syrup: 'Syrup', cinnamon: 'Cinnamon', mint: 'Mint', cream: 'Cream', pumpkin: 'Pumpkin', nutmeg: 'Nutmeg', coffee_beans: 'Coffee', dark_chocolate: 'Chocolate' };
const SHOP_NAME = { milk_bottle: 'Milk', marshmallows: 'Marsh­mallows', dark_chocolate: 'Dark Choco­late', cinnamon: 'Cinna­mon', mint: 'Fresh Mint' };
const fmtNum = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : v.toFixed(1));
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
  const toX = (i) => WORLD_X0 + ((i + 0.5) / N) * WORLD_HALF * 2, toZ = (j) => WORLD_Z0 + ((j + 0.5) / N) * WORLD_HALF * 2;
  const H = new Float32Array(N * N), RD = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    H[j * N + i] = terrain.heightAt(toX(i), toZ(j));
    RD[j * N + i] = terrain.splatAt(toX(i), toZ(j)).road > 0.5 ? 1 : 0;
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
    const x = toX(i), z = toZ(j);
    if (H[j * N + i] < 2 || RD[j * N + i]) continue;
    const f = terrain.splatAt(x, z).litter ?? 0.5;
    if (f < 0.45) continue;
    ctx.fillStyle = f > 0.7 ? '#4e6a34' : '#b0602a';
    ctx.fillRect(i - 1, j - 3, 3, 1); ctx.fillRect(i - 2, j - 2, 5, 2);
    ctx.fillStyle = '#3e2a1c'; ctx.fillRect(i, j, 1, 1);
  }
  // the old railway: an inked line with cross ties where the rails still lie
  const rail = terrain.roadProfiles?.find((r) => r.road.id === 'railTrail');
  if (rail) rail.samples.forEach((p, k) => {
    if (p.x > -334) return;
    const i = Math.round(((p.x - WORLD_X0) / (WORLD_HALF * 2)) * N), j = Math.round(((p.z - WORLD_Z0) / (WORLD_HALF * 2)) * N);
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(i, j, 1, 1);
    if (k % 3 === 0) { ctx.fillRect(i - Math.round(p.dz), j + Math.round(p.dx), 1, 1); ctx.fillRect(i + Math.round(p.dz), j - Math.round(p.dx), 1, 1); }
  });
  // little houses
  for (const bld of BUILDINGS) {
    const x = Math.round(((bld.x - WORLD_X0) / (WORLD_HALF * 2)) * N), y = Math.round(((bld.z - WORLD_Z0) / (WORLD_HALF * 2)) * N);
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
