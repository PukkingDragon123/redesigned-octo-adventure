// Screens: title, pause, settings, controls, order board, garage, keepsakes, map, day summary.
import { el, frameStyle } from '../ui/ui.js';
import { frameURL, slotURL } from '../ui/frames.js';
import { iconURL } from '../art/icons.js';
import { charSnapshot } from '../ui/snapshots.js';
import { CHARACTERS } from '../art/characters.js';
import { UPGRADES, canBuy } from './upgrades.js';
import { KEEPSAKES, POI, CUSTOMERS, WORLD_HALF, BUILDINGS } from '../world/layout.js';
import { KEEPSAKE_ICON } from './keepsakes.js';
import { hasSave } from './state.js';
import { foodIconURL, FOOD_INFO } from '../art/foodsprites.js';
import { QUESTS, SHOP, RECIPES, CATS, LOST, BIRDS, BIRD_NAMES } from './quests.js';

export class Menus {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
  }

  // ---------------------------------------------------------------- title
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
    buttons.push(ui.button(hasSave() ? 'New Game' : 'Start', () => close(onNew), { small: hasSave() ? 'overwrites your save' : 'press E / Enter / click' }));
    buttons.push(ui.button('Settings', () => onSettings()));
    buttons.push(ui.button('Controls', () => this.controls()));
    buttons.forEach((b) => menu.appendChild(b));
    t.appendChild(menu);
    t.appendChild(el('div', 'title-foot', 'Autumn in Maple Cove · ride gently, deliver warmly<br><small>fonts: monogram by datagoblin (CC0) · BoldPixels by YukiPixels (CC BY-SA 4.0)</small>'));
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
    const p = ui.panel('paper', 'menu journal');
    p.appendChild(el('h2', '', "Hank's Journal"));
    const book = el('div', 'jbook');
    const left = el('div', 'jpage');
    const right = el('div', 'jpage');
    book.append(left, right);
    p.appendChild(book);
    // left page: today + favours
    left.innerHTML = `<div class="jdate">Day ${st.day} · $${Math.floor(st.money)} · ${st.stats.deliveries} cocoas delivered${st.candy ? ` · ${st.candy} candies` : ''}</div><h3>Favours & errands</h3>`;
    const Q = st.quests || {};
    const lines = [];
    const snap = (who) => (who ? `<img class="jsnap" src="${charSnapshot(g, who, 'happy', 64)}">` : '');
    for (const [id, def] of Object.entries(QUESTS)) {
      const q = Q[id];
      if (q?.state === 'active') lines.push(`<div class="jq">${snap(def.giver)}☐ ${def.title}</div>`);
      else if (q?.state === 'done') lines.push(`<div class="jq done">${snap(def.giver)}☑ ${def.title}</div>`);
    }
    for (const L of LOST) {
      const q = Q[`lost_${L.id}`];
      if (q?.state === 'active') lines.push(`<div class="jq">${snap(L.owner)}☐ ${q.found ? 'Return' : 'Find'} the ${L.name}</div>`);
      else if (q?.state === 'done') lines.push(`<div class="jq done">${snap(L.owner)}☑ Found the ${L.name}</div>`);
    }
    left.innerHTML += lines.length ? lines.join('') : '<p class="hint">Nothing yet. Stop and chat with folks around town — someone always needs a hand. Or a skeleton.</p>';
    if (st.photos && Object.keys(st.photos).length) {
      left.innerHTML += '<h3>Photos</h3><div class="polaroids">' + Object.keys(st.photos).map((k, i) => `<div class="polaroid" style="--r:${(i % 3) - 1}deg"><span>${BIRD_NAMES[k] || k}</span></div>`).join('') + '</div>';
    }
    // right page: where to go
    let m;
    const close = () => {
      ui.closeOverlay(m);
      g.resumeFromMenu();
    };
    right.appendChild(ui.button('Back to the road', close));
    right.appendChild(ui.button('Unfold the map', () => this.map()));
    right.appendChild(ui.button("Harold's keepsakes", () => this.keepsakes()));
    right.appendChild(ui.button("Nana's recipe book", () => this.recipes()));
    right.appendChild(ui.button('Settings', () => this.settings()));
    right.appendChild(ui.button('Controls', () => this.controls()));
    right.appendChild(ui.button('Save & quit to title', () => {
      g.save();
      location.href = location.pathname;
    }));
    g.sound.play('book_open');
    m = ui.openOverlay(p, { onBack: close });
    const old = m.onBack;
    m.onBack = () => { g.sound.play('book_close'); old(); };
    return m;
  }

  // ---------------------------------------------------------------- pumpkin carving
  carve(onDone) {
    const ui = this.ui;
    const g = this.game;
    const p = ui.panel('paper', 'menu carve');
    p.appendChild(el('h2', '', 'Pick a face to carve'));
    const faces = ['classic', 'happy', 'scared', 'toothy', 'cat', 'skull'];
    const grid = el('div', 'carvegrid');
    const items = faces.map((f) => {
      const b = el('div', 'slip carveface');
      b.innerHTML = `<img src="${faceSketch(f)}"><span>${f}</span>`;
      b.addEventListener('click', () => done(f));
      grid.appendChild(b);
      return b;
    });
    p.appendChild(grid);
    let m;
    const done = (f) => {
      ui.closeOverlay(m);
      if (f) g.sound.play('pencil_scribble');
      onDone?.(f);
    };
    const back = ui.button('Not now', () => done(null));
    p.appendChild(back);
    m = ui.openOverlay(p, { onBack: () => done(null), items: [...items, back], grid: 3 });
    return m;
  }

  // ---------------------------------------------------------------- Nana's recipes & pantry
  recipes() {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    const pantry = st.pantry || {};
    const p = ui.panel('paper', 'menu recipes');
    p.appendChild(el('h2', '', "Nana's Recipe Book"));
    const names = { classic: 'Classic Cocoa', maple: 'Maple Marshmallow', cinnamon: 'Cinnamon Fire', mint: 'Peppermint Swirl', pumpkin: 'Pumpkin Spice', mocha: 'Lumberjack Mocha' };
    const grid = el('div', 'rgrid');
    for (const [id, ing] of Object.entries(RECIPES)) {
      const can = ing.every((k) => (pantry[k] || 0) > 0);
      const card = el('div', `rcard${can ? '' : ' short'}`);
      card.innerHTML = `<span class="steamy"><img class="big" src="${foodIconURL('cocoa_' + id)}"></span><div class="rn">${names[id]}</div><div class="ri">${ing.map((k) => `<span class="${(pantry[k] || 0) > 0 ? '' : 'out'}"><img src="${foodIconURL(k)}">${pantry[k] || 0}</span>`).join('')}</div>`;
      grid.appendChild(card);
    }
    p.appendChild(grid);
    p.appendChild(el('p', 'hint', 'Each cup uses one of everything listed. Running low? Mo at Moose & Goose has it all — bring the groceries home to Nana.'));
    let m;
    const close = () => ui.closeOverlay(m);
    p.appendChild(ui.button('Close the book', close));
    g.sound.play('page_flip');
    m = ui.openOverlay(p, { onBack: close });
    return m;
  }

  // ---------------------------------------------------------------- Moose & Goose
  shop(onDone) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    st.bag = st.bag || {};
    const p = ui.panel('paper', 'menu shop');
    p.appendChild(el('h2', '', 'Moose & Goose · Price List'));
    const money = el('p', '');
    p.appendChild(money);
    const grid = el('div', 'shopgrid');
    p.appendChild(grid);
    const cart = {};
    const total = () => Object.entries(cart).reduce((s, [k, n]) => s + n * (FOOD_INFO[k]?.price || 3), 0);
    const items = [];
    const render = () => {
      money.innerHTML = `In your pocket: <b>$${Math.floor(st.money)}</b> · basket: <b>$${total()}</b>`;
      items.forEach((e) => e.sync());
    };
    for (const k of SHOP) {
      const info = FOOD_INFO[k] || { label: k, price: 3 };
      const e = el('div', 'slip shopitem');
      e.innerHTML = `<img src="${foodIconURL(k)}"><span class="nm">${info.label}</span><span class="pr">$${info.price}</span><span class="qty"></span>`;
      e.sync = () => { e.querySelector('.qty').textContent = cart[k] ? `×${cart[k]}` : ''; e.classList.toggle('taken', !!cart[k]); };
      e.addEventListener('click', () => {
        if (total() + info.price > st.money) { g.sound.play('ui_error'); ui.toast("Mo: 'That's a little more than you've got, Hank!'", 'coin', 1800); return; }
        cart[k] = (cart[k] || 0) + 1;
        g.sound.play('register', { volume: 0.5 });
        render();
      });
      grid.appendChild(e);
      items.push(e);
    }
    let m;
    const done = (pay) => {
      if (pay && total() > 0) {
        st.money -= total();
        for (const [k, n] of Object.entries(cart)) st.bag[k] = (st.bag[k] || 0) + n * 2;
        g.sound.play('cash_coins');
        ui.toast('Groceries bagged! Bring them home to Nana.', 'basket', 2400);
        g.save();
      }
      ui.closeOverlay(m);
      onDone?.();
    };
    const pay = ui.button('Pay & bag it', () => done(true), { small: 'each item makes two cups' });
    const leave = ui.button('Never mind', () => done(false));
    p.append(pay, leave);
    render();
    g.sound.play('shop_bell');
    m = ui.openOverlay(p, { onBack: () => done(false), items: [...items, pay, leave], grid: 4 });
    return m;
  }

    settings(onClose) {
    const g = this.game;
    const ui = this.ui;
    const s = g.settings;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', 'Settings'));
    const row = (label, ctrl) => {
      const r = el('div', 'row');
      r.appendChild(el('span', '', label));
      r.appendChild(ctrl);
      p.appendChild(r);
    };
    const slider = (key, min, max, step) => {
      const i = el('input');
      i.type = 'range';
      i.min = min; i.max = max; i.step = step;
      i.value = s[key];
      i.addEventListener('input', () => {
        s[key] = parseFloat(i.value);
        g.applySettings();
      });
      return i;
    };
    const cycle = (key, opts, labels) => {
      const b = el('button', 'btn', '');
      b.style.width = 'auto';
      b.style.borderImageSource = `url(${frameURL('button')})`;
      const show = () => (b.textContent = labels[opts.indexOf(s[key])] ?? s[key]);
      show();
      b.addEventListener('click', () => {
        s[key] = opts[(opts.indexOf(s[key]) + 1) % opts.length];
        // a hand-picked look wins over the automatic quality governor
        if (key === 'pixel' || key === 'quality') s.autoQuality = false;
        show();
        g.applySettings();
      });
      return b;
    };
    row('Pixel size', cycle('pixel', [2, 3, 4], ['Fine (2x)', 'Classic (3x)', 'Chunky (4x)']));
    row('Graphics', cycle('quality', ['low', 'medium', 'high'], ['Low', 'Medium', 'High']));
    row('Master volume', slider('master', 0, 1, 0.05));
    row('Music', slider('music', 0, 1, 0.05));
    row('Sound effects', slider('sfx', 0, 1, 0.05));
    row('Camera distance', slider('camDist', 0.8, 1.5, 0.05));
    row('Show FPS', cycle('fps', [false, true], ['Off', 'On']));
    let m;
    const close = () => {
      g.saveSettings();
      ui.closeOverlay(m);
      onClose?.();
    };
    p.appendChild(ui.button('Done', close));
    m = ui.openOverlay(p, { onBack: close, items: [...p.querySelectorAll('.btn')] });
    return m;
  }

  controls() {
    const ui = this.ui;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', 'Controls'));
    const lines = [
      ['W / ↑ / RT', 'Pedal'], ['S / ↓ / LT', 'Brake / reverse'], ['A D / ← → / stick', 'Steer'],
      ['Space / A', 'Hop (hold in the air to glide)'], ['Shift / RB', 'Drift (release for a mini-boost)'],
      ['F or Q / B', 'Maple-Cola boost'], ['E / X', 'Talk · deliver · interact'], ['R / Y', 'Ring the bell'],
      ['M', 'Map'], ['Tab', "Harold's keepsakes"], ['Mouse drag / right stick', 'Look around'], ['Esc / Start', 'Journal'],
      ['E (stopped)', 'Hop off / on the bike'], ['WASD on foot', 'Walk (Shift runs)'], ['F on foot', 'Kick!'], ['Shift + dir in the air', 'Tricks'], ['C', 'Camera (once you have one)'],
    ];
    for (const [k, v] of lines) {
      const r = el('div', 'row');
      r.innerHTML = `<span class="key">${k}</span><span>${v}</span>`;
      p.appendChild(r);
    }
    let m;
    const close = () => ui.closeOverlay(m);
    p.appendChild(ui.button('Got it', close));
    m = ui.openOverlay(p, { onBack: close });
    return m;
  }

  // ---------------------------------------------------------------- order board
  orderBoard(onDone) {
    const g = this.game;
    const ui = this.ui;
    const O = g.orders;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', "Nana's Order Board"));
    const info = el('p', '');
    p.appendChild(info);
    const cork = el('div', 'cork');
    p.appendChild(cork);
    const slips = [];
    const all = O.list.filter((o) => o.state === 'board' || o.state === 'carried');
    all.forEach((o, i) => {
      const s = el('div', 'slip');
      s.style.borderImageSource = `url(${frameURL('order')})`;
      s.style.setProperty('--rot', `${((i * 37) % 7) - 3}deg`);
      const name = CHARACTERS[o.customer]?.name || o.customer;
      s.innerHTML = `<div class="who"><img class="snap" src="${charSnapshot(g, o.customer, 'happy')}">${name}</div>
        <div class="what"><img class="ico" src="${iconURL('cocoa')}">${o.label}${o.rush ? ' · <b style="color:#c8361f">RUSH</b>' : ''}</div>
        <div class="what"><i>“${o.note}”</i></div><div class="pay">$${o.price}+ tips</div>`;
      const sync = () => s.classList.toggle('taken', o.state === 'carried');
      sync();
      s.addEventListener('click', () => {
        let packed = false;
        if (o.state === 'carried') O.unpack(o);
        else if (!O.pack(o)) {
          g.sound.play('ui_error');
          const miss = O.missing(o);
          if (miss.length) {
            ui.toast(`Nana: "We're out of <b>${miss.map((k) => FOOD_INFO[k]?.label || k).join(' & ')}</b>! Could you pop over to Moose & Goose?"`, 'basket', 3600);
            const q = g.quests.q('groceries');
            if (q.state !== 'active') { q.state = 'active'; g.sound.play('quest_new'); }
          } else ui.toast(`Your bike only holds ${O.capacity()} cocoas. Upgrade in the garage!`, 'basket');
        } else {
          g.sound.play('cup');
          packed = true;
        }
        sync();
        upd();
        // after packing, hop to the next open slip, or to "Let's ride!" once the basket is full
        if (packed && m) {
          const full = O.carried().length >= O.capacity();
          const next = slips.findIndex((e, k) => k > i && !e.classList.contains('taken'));
          const later = next >= 0 ? next : slips.findIndex((e) => !e.classList.contains('taken'));
          m.sel = full || later < 0 ? slips.length : later;
          ui.highlight(m);
        }
      });
      cork.appendChild(s);
      slips.push(s);
    });
    const upd = () => (info.innerHTML = `Pick the orders to pack: <b>${O.carried().length} / ${O.capacity()}</b> cups in the basket. Hot cocoa cools as you ride!`);
    upd();
    let m;
    const done = () => {
      ui.closeOverlay(m);
      onDone?.();
    };
    const go = ui.button("Let's ride!", done, { small: 'cocoa is poured when you leave' });
    p.appendChild(go);
    m = ui.openOverlay(p, { onBack: done, items: [...slips, go], grid: 3 });
    return m;
  }

  // ---------------------------------------------------------------- garage
  garage(onDone) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', "Harold's Garage"));
    const money = el('p', '');
    p.appendChild(money);
    const split = el('div', 'split');
    p.appendChild(split);
    const grid = el('div', 'slots');
    split.appendChild(grid);
    const detail = frameStyle(el('div', 'panel detail'), 'paper');
    split.appendChild(detail);
    const slots = [];
    const render = () => {
      money.innerHTML = `Savings: <b>$${Math.floor(st.money)}</b> — tools, oil and a lot of duct tape.`;
      slots.forEach((s) => s.sync());
    };
    for (const u of UPGRADES) {
      const s = el('div', 'slot');
      s.style.borderImageSource = `url(${slotURL(false)})`;
      s.innerHTML = `<img src="${iconURL(u.icon)}"><span class="price"></span><span class="owned"></span>`;
      s.sync = () => {
        const owned = !!st.upgrades[u.id];
        const locked = u.req && !st.upgrades[u.req];
        s.classList.toggle('locked', !!locked);
        s.querySelector('.price').textContent = owned ? '' : `$${u.price}`;
        s.querySelector('.owned').textContent = owned ? 'owned' : '';
      };
      const show = () => {
        const c = canBuy(u, st);
        const owned = !!st.upgrades[u.id];
        detail.innerHTML = `<b>${u.name}</b> ${owned ? '<span style="color:#2f6e52">(installed)</span>' : `— $${u.price}`}<p>${u.desc}</p>${!owned && !c.ok ? `<p style="color:#8a2214">${c.why}</p>` : ''}`;
      };
      s.addEventListener('focus-item', show);
      s.addEventListener('pointerenter', () => {
        const m2 = ui.menuStack[ui.menuStack.length - 1];
        const i = m2.items.indexOf(s);
        if (i >= 0) { m2.sel = i; ui.highlight(m2); }
      });
      s.addEventListener('click', () => {
        const c = canBuy(u, st);
        if (!c.ok) {
          g.sound.play('ui_error');
          show();
          return;
        }
        st.money -= u.price;
        st.upgrades[u.id] = true;
        g.applyUpgrades();
        g.sound.play('upgrade');
        g.effects.confetti(g.bike.pos.x, g.bike.pos.y + 1.5, g.bike.pos.z, 40);
        ui.toast(`Installed: <b>${u.name}</b>!`, u.icon);
        g.save();
        render();
        show();
        g.story?.onUpgrade?.(u);
      });
      grid.appendChild(s);
      slots.push(s);
    }
    render();
    let m;
    const done = () => {
      ui.closeOverlay(m);
      onDone?.();
    };
    const back = ui.button('Back to the road', done);
    p.appendChild(back);
    m = ui.openOverlay(p, { onBack: done, items: [...slots, back], grid: 4 });
    return m;
  }

  // ---------------------------------------------------------------- keepsakes
  keepsakes() {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', "Harold's Keepsakes"));
    const n = Object.keys(st.keepsakes).length;
    p.appendChild(el('p', '', `${n} / ${KEEPSAKES.length} found. Bring them home — Nana has a story for each one.`));
    const split = el('div', 'split');
    p.appendChild(split);
    const grid = el('div', 'slots');
    split.appendChild(grid);
    const detail = frameStyle(el('div', 'panel detail'), 'paper');
    split.appendChild(detail);
    const slots = KEEPSAKES.map((k) => {
      const s = el('div', 'slot');
      const have = st.keepsakes[k.id];
      s.classList.toggle('locked', !have);
      s.style.borderImageSource = `url(${slotURL(false)})`;
      s.innerHTML = `<img src="${iconURL(KEEPSAKE_ICON[k.id])}"><span class="owned given">${have === 'given' ? 'given' : ''}</span>`;
      s.addEventListener('focus-item', () => {
        detail.innerHTML = have ? `<b>${k.name}</b><p>${k.note}</p>${have === 'found' ? '<p style="color:#8a2214">Bring it home to Nana!</p>' : ''}` : `<b>???</b><p>Somewhere out in the wilds... Harold always did wander.</p>`;
      });
      s.addEventListener('click', () => s.dispatchEvent(new CustomEvent('focus-item')));
      grid.appendChild(s);
      return s;
    });
    let m;
    const close = () => ui.closeOverlay(m);
    const back = ui.button('Close', close);
    p.appendChild(back);
    m = ui.openOverlay(p, { onBack: close, items: [...slots, back], grid: 4 });
    return m;
  }

  // ---------------------------------------------------------------- map
  map() {
    const g = this.game;
    const ui = this.ui;
    const p = ui.panel('paper', 'menu mapsheet');
    p.appendChild(el('h2', '', 'Maple Hollow & Maple Cove'));
    const wrap = el('div', 'mapwrap');
    const c = this.mapCanvas || (this.mapCanvas = paintMap(g.world.terrain));
    const img = el('canvas');
    img.width = c.width;
    img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    wrap.appendChild(img);
    const pin = (x, z, iconName, cls = '') => {
      const e = el('img', `pin ${cls}`);
      e.src = iconURL(iconName);
      e.style.left = `${((x + WORLD_HALF) / (WORLD_HALF * 2)) * 100}%`;
      e.style.top = `${((z + WORLD_HALF) / (WORLD_HALF * 2)) * 100}%`;
      wrap.appendChild(e);
    };
    const label = (x, z, text, cls = '') => {
      const e = el('div', `lbl ${cls}`, text);
      e.style.left = `${((x + WORLD_HALF) / (WORLD_HALF * 2)) * 100}%`;
      e.style.top = `${((z + WORLD_HALF) / (WORLD_HALF * 2)) * 100}%`;
      wrap.appendChild(e);
    };
    label(POI.plaza.x, POI.plaza.z - 22, 'Maple Cove', 'big');
    label(POI.cabin.x, POI.cabin.z + 14, "Nana's");
    label(POI.graveyard.x, POI.graveyard.z - 14, 'Old Pine Cemetery');
    label(POI.lookout.x, POI.lookout.z - 12, 'Sunset Lookout');
    label(POI.lighthouse.x - 8, POI.lighthouse.z - 14, 'Lighthouse');
    label(POI.sawmill.x, POI.sawmill.z + 12, 'Sawmill');
    label(POI.pond.x, POI.pond.z - 12, 'Beaver Pond');
    label(POI.trapper.x, POI.trapper.z + 12, "Trapper's Hut");
    label(POI.bridge.x + 18, POI.bridge.z + 12, 'Covered Bridge');
    pin(POI.cabin.x, POI.cabin.z, 'home');
    for (const o of g.orders.carried()) { const c2 = CUSTOMERS[o.spot]; pin(c2.x, c2.z, 'cocoa'); }
    for (const k of KEEPSAKES) if (g.state.keepsakes[k.id]) pin(k.x, k.z, KEEPSAKE_ICON[k.id]);
    if (g.catEventActive) pin(POI.catLog.x, POI.catLog.z, 'cat');
    pin(g.playerPos.x, g.playerPos.z, 'star', 'me');
    for (const q of g.quests?.markers() || []) pin(q.x, q.z, q.icon, 'quest');
    const rose = el('img', 'rose');
    rose.src = compassRose();
    wrap.appendChild(rose);
    wrap.appendChild(el('div', 'folds'));
    wrap.appendChild(el('div', 'scrawl', 'X = cocoa · ★ = Harold\'s stuff · skull = you'));
    p.appendChild(wrap);
    let m;
    const close = () => ui.closeOverlay(m);
    p.appendChild(ui.button('Fold it up', close));
    g.sound.play('paper_unfold');
    m = ui.openOverlay(p, { onBack: close });
    return m;
  }

  // ---------------------------------------------------------------- day summary
  summary(onDone) {
    const g = this.game;
    const ui = this.ui;
    const st = g.state;
    const p = ui.panel('paper');
    p.appendChild(el('h2', '', `Day ${st.day} — Receipt`));
    const r = el('div', 'receipt');
    const s = st.stats;
    const line = (a, b, cls = '') => r.appendChild(el('div', `line ${cls}`, `<span>${a}</span><span>${b}</span>`));
    line('Cocoas delivered', s.dayDeliveries);
    line('Tips', `$${s.dayTips}`);
    line('Crashes (bones re-attached)', s.dayCrashes || 0);
    line('Best air time', `${(s.dayAir || 0).toFixed(1)}s`);
    line('Earned today', `$${s.dayEarned}`, 'total');
    line('Savings', `$${Math.floor(st.money)}`);
    p.appendChild(r);
    p.appendChild(el('p', 'hint', 'Nana: “You did good today, dear. Now off to bed — the dead need their rest too.”'));
    let m;
    const done = () => {
      ui.closeOverlay(m);
      onDone?.();
    };
    p.appendChild(ui.button('Sleep  zzz', done));
    m = ui.openOverlay(p, { onBack: done });
    return m;
  }
}

// a hand-drawn paper map: pencil contours, hatched water, little tree doodles,
// inked roads and tiny houses
function paintMap(terrain) {
  const N = 384;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const toW = (i) => -WORLD_HALF + ((i + 0.5) / N) * WORLD_HALF * 2;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = terrain.heightAt(toW(i), toW(j));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H[j * N + i];
    const s = terrain.splatAt(toW(i), toW(j));
    const n = ((i * 73856093) ^ (j * 19349663)) & 15;
    let r = 240 - n * 0.6, gg = 226 - n * 0.6, b = 190 - n;
    if (h < 0) {
      // water: pale blue with diagonal pencil hatching
      r = 170; gg = 196; b = 206;
      if ((i + j) % 6 === 0) { r -= 40; gg -= 30; b -= 20; }
    } else {
      const k = Math.min(1, h / 60);
      r -= k * 30; gg -= k * 26; b -= k * 22;
      // contour lines every 5 m
      const hr = H[j * N + Math.min(N - 1, i + 1)], hd = H[Math.min(N - 1, j + 1) * N + i];
      if (Math.floor(h / 5) !== Math.floor(hr / 5) || Math.floor(h / 5) !== Math.floor(hd / 5)) { r -= 60; gg -= 56; b -= 50; }
      if (s.road > 0.5) { r = 120; gg = 78; b = 52; }
    }
    // coast line in ink
    if ((h < 0) !== (H[j * N + Math.min(N - 1, i + 1)] < 0) || (h < 0) !== (H[Math.min(N - 1, j + 1) * N + i] < 0)) { r = 60; gg = 50; b = 60; }
    const o = (j * N + i) * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // tree doodles where the forest is thick
  ctx.fillStyle = '#4a6a3a';
  for (let j = 4; j < N; j += 9) for (let i = 4 + ((j / 9) % 2) * 4; i < N; i += 9) {
    const x = toW(i), z = toW(j);
    const h = H[j * N + i];
    if (h < 2 || terrain.splatAt(x, z).road > 0.2) continue;
    const f = forestDensity(terrain, x, z);
    if (f < 0.45) continue;
    const col = f > 0.7 ? '#5a6a3a' : '#a86a3a';
    ctx.fillStyle = col;
    ctx.fillRect(i - 1, j - 3, 3, 1); ctx.fillRect(i - 2, j - 2, 5, 2); ctx.fillStyle = '#4a3020'; ctx.fillRect(i, j, 1, 2);
  }
  // little houses
  for (const bld of BUILDINGS) {
    const x = Math.round(((bld.x + WORLD_HALF) / (WORLD_HALF * 2)) * N), y = Math.round(((bld.z + WORLD_HALF) / (WORLD_HALF * 2)) * N);
    ctx.fillStyle = '#3a2a24'; ctx.fillRect(x - 3, y - 2, 7, 5);
    ctx.fillStyle = '#c8502e'; ctx.fillRect(x - 2, y - 4, 5, 2); ctx.fillRect(x - 1, y - 5, 3, 1);
    ctx.fillStyle = '#f2e6c8'; ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillStyle = '#3a2a24'; ctx.fillRect(x, y, 1, 2);
  }
  return c;
}
function forestDensity(terrain, x, z) {
  const s = terrain.splatAt(x, z);
  return s.litter ?? 0.5;
}

// a brass compass rose for the map corner
function compassRose() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const d = Math.hypot(x - 23.5, y - 23.5);
    if (d < 22 && d > 20) R(x, y, 1, 1, '#6a4a2a');
    if (d < 13 && d > 12) R(x, y, 1, 1, '#6a4a2a');
  }
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 19; t++) {
      const w = Math.max(0, 4 - t * 0.22);
      for (let q = -w; q <= w; q++) {
        const ax = [0, 1, 0, -1][k], ay = [-1, 0, 1, 0][k];
        const x = 24 + ax * t - ay * q, y = 24 + ay * t + ax * q;
        R(Math.round(x), Math.round(y), 1, 1, k === 0 ? (q < 0 ? '#c8361f' : '#8a2214') : q < 0 ? '#e8d8b0' : '#8a6a4a');
      }
    }
  }
  R(22, 0, 1, 5, '#2a1a14'); R(26, 0, 1, 5, '#2a1a14'); R(23, 1, 1, 1, '#2a1a14'); R(24, 2, 1, 1, '#2a1a14'); R(25, 3, 1, 1, '#2a1a14');
  return c.toDataURL();
}

// pencil sketches of jack-o'-lantern faces for the carving page
function faceSketch(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = (x - 15.5) / 14, dy = (y - 17) / 12;
    const d = dx * dx + dy * dy;
    if (d < 1) R(x, y, 1, 1, d > 0.82 ? '#8a3a10' : (x % 7 === 0 ? '#d8601a' : '#e8781e'));
  }
  R(14, 2, 3, 4, '#4a6a2a');
  const ink = '#2a1408', glow = '#ffd060';
  const tri = (x, y, s, up = true) => { for (let k = 0; k < s; k++) R(x - k, up ? y + k : y - k, 1 + k * 2, 1, glow); };
  switch (kind) {
    case 'happy': tri(10, 11, 4); tri(21, 11, 4); for (let x = 7; x < 25; x++) R(x, 21 + Math.round(Math.sin(((x - 7) / 18) * Math.PI) * 3), 1, 2, glow); break;
    case 'scared': R(8, 11, 5, 5, glow); R(19, 11, 5, 5, glow); R(10, 13, 1, 1, ink); R(21, 13, 1, 1, ink); R(13, 20, 6, 6, glow); break;
    case 'toothy': tri(10, 10, 4); tri(21, 10, 4); R(7, 20, 18, 5, glow); for (let x = 8; x < 25; x += 3) R(x, 20, 1, 2, '#e8781e'), R(x + 1, 23, 1, 2, '#e8781e'); break;
    case 'cat': R(8, 13, 5, 3, glow); R(19, 13, 5, 3, glow); R(10, 13, 1, 3, ink); R(21, 13, 1, 3, ink); R(15, 18, 2, 2, glow); R(11, 22, 4, 1, glow); R(17, 22, 4, 1, glow); break;
    case 'skull': R(8, 10, 6, 6, glow); R(18, 10, 6, 6, glow); R(15, 17, 2, 2, glow); R(9, 21, 14, 4, glow); for (let x = 10; x < 23; x += 2) R(x, 21, 1, 4, '#e8781e'); break;
    default: tri(10, 10, 4); tri(21, 10, 4); tri(16, 15, 2); for (let x = 7; x < 25; x++) R(x, 21 + (x % 4 < 2 ? 0 : 1), 1, 3, glow);
  }
  return c.toDataURL();
}
