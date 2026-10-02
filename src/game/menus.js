// Screens: title, pause, settings, controls, order board, garage, keepsakes, map, day summary.
import { el, frameStyle } from '../ui/ui.js';
import { frameURL, slotURL } from '../ui/frames.js';
import { iconURL } from '../art/icons.js';
import { portraitURL } from '../art/portraits.js';
import { CHARACTERS } from '../art/characters.js';
import { UPGRADES, canBuy } from './upgrades.js';
import { KEEPSAKES, POI, CUSTOMERS, WORLD_HALF, BUILDINGS } from '../world/layout.js';
import { KEEPSAKE_ICON } from './keepsakes.js';
import { hasSave } from './state.js';

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
    t.appendChild(el('div', 'title-foot', 'Autumn in Maple Cove · ride gently, deliver warmly'));
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

  // ---------------------------------------------------------------- pause
  pause() {
    const g = this.game;
    const ui = this.ui;
    const p = ui.panel('wood');
    p.appendChild(el('h2', '', 'Paused'));
    const st = g.state;
    p.appendChild(el('p', '', `Day ${st.day} · $${Math.floor(st.money)} · ${st.stats.deliveries} cocoas delivered`));
    let m;
    const close = () => {
      ui.closeOverlay(m);
      g.resumeFromMenu();
    };
    p.appendChild(ui.button('Resume', close));
    p.appendChild(ui.button('Map', () => this.map()));
    p.appendChild(ui.button("Harold's Keepsakes", () => this.keepsakes()));
    p.appendChild(ui.button('Settings', () => this.settings()));
    p.appendChild(ui.button('Controls', () => this.controls()));
    p.appendChild(ui.button('Save & Quit to Title', () => {
      g.save();
      location.reload();
    }));
    m = ui.openOverlay(p, { onBack: close });
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
      ['M', 'Map'], ['Tab', "Harold's keepsakes"], ['Mouse drag / right stick', 'Look around'], ['Esc / Start', 'Pause'],
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
      s.innerHTML = `<div class="who"><img src="${portraitURL(o.customer, 'happy')}">${name}</div>
        <div class="what"><img class="ico" src="${iconURL('cocoa')}">${o.label}${o.rush ? ' · <b style="color:#c8361f">RUSH</b>' : ''}</div>
        <div class="what"><i>“${o.note}”</i></div><div class="pay">$${o.price}+ tips</div>`;
      const sync = () => s.classList.toggle('taken', o.state === 'carried');
      sync();
      s.addEventListener('click', () => {
        if (o.state === 'carried') O.unpack(o);
        else if (!O.pack(o)) {
          g.sound.play('ui_error');
          ui.toast(`Your bike only holds ${O.capacity()} cocoas. Upgrade in the garage!`, 'basket');
        } else g.sound.play('cup');
        sync();
        upd();
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
    const p = ui.panel('paper');
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
    pin(g.bike.pos.x, g.bike.pos.z, 'star', 'me');
    p.appendChild(wrap);
    let m;
    const close = () => ui.closeOverlay(m);
    p.appendChild(ui.button('Close', close));
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

// a parchment map painted from the heightmap
function paintMap(terrain) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -WORLD_HALF + ((i + 0.5) / N) * WORLD_HALF * 2, z = -WORLD_HALF + ((j + 0.5) / N) * WORLD_HALF * 2;
    const h = terrain.heightAt(x, z);
    const s = terrain.splatAt(x, z);
    let r = 232, gg = 214, b = 170;
    if (h < 0) { const d = Math.min(1, -h / 5); r = 120 - d * 40; gg = 160 - d * 40; b = 160 - d * 20; }
    else {
      const k = Math.min(1, h / 50);
      r -= k * 60; gg -= k * 50; b -= k * 40;
      if (s.litter > 0.5) { r -= 30; gg -= 40; b -= 50; }
      if (s.road > 0.5) { r = 150; gg = 100; b = 60; }
      if (Math.abs(h % 6) < 0.35) { r -= 25; gg -= 25; b -= 25; }
    }
    // parchment noise
    const n = ((i * 73856093) ^ (j * 19349663)) & 15;
    const o = (j * N + i) * 4;
    img.data[o] = r - n;
    img.data[o + 1] = gg - n;
    img.data[o + 2] = b - n;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#6b3d22';
  for (const bld of BUILDINGS) {
    const x = ((bld.x + WORLD_HALF) / (WORLD_HALF * 2)) * N, y = ((bld.z + WORLD_HALF) / (WORLD_HALF * 2)) * N;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  }
  return c;
}
