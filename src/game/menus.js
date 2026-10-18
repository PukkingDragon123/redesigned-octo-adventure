// The menu screen and the little bits of business that used to have their own pages.
//
// The menu is Hank's journal (src/ui/book.js shows it, src/ui/bookart.js paints it): a
// contents page (where the day stands, Resume / Settings / Controls / Save & quit), the
// settings and the controls. Nothing else lives in the book.
//
// Nana's order board, Mo's shop and the end-of-day tally are spoken instead: a speech
// bubble with reply choices (ui.say), the same as any other chat in the village.
import { el } from '../ui/ui.js';
import { kSlider, kKey, esc, setUIScaleOffset } from '../ui/kit.js';
import { glyphURL } from '../art/icons.js';
import { CHARACTERS } from '../art/characters.js';
import { FOOD_INFO } from '../art/foodsprites.js';
import { SHOP } from './quests.js';

const SHORT_NAME = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes', mo: 'Mo' };
const FOOD_NAME = { milk_bottle: 'milk', cocoa_powder: 'cocoa', sugar: 'sugar', marshmallows: 'marshmallows', maple_syrup: 'maple syrup', cinnamon: 'cinnamon', mint: 'fresh mint', cream: 'cream', pumpkin: 'a pumpkin', nutmeg: 'nutmeg', coffee_beans: 'coffee beans', dark_chocolate: 'dark chocolate' };
const who = (id) => SHORT_NAME[id] || (CHARACTERS[id]?.name || id).split(' ')[0];
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export class Menus {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.register();
  }
  get book() {
    return this.game.book;
  }

  // ---------------------------------------------------------------- building blocks
  // a heading in red ink, with a pencilled line under it
  head(page, title, sub = '') {
    page.appendChild(el('div', 'bk-head', `<div class="bk-h">${title}</div>${sub ? `<div class="bk-sub">${sub}</div>` : ''}`));
  }
  // a selectable row: glyph + label
  item(label, onClick, icon = '', cls = '') {
    const b = el('button', `k-item pick${cls ? ` ${cls}` : ''}`, `${icon ? `<img class="k-g" src="${icon}" alt="">` : '<i class="k-g"></i>'}<span class="lbl">${label}</span>`);
    b.addEventListener('click', () => { this.game.sound?.play('ui_click'); onClick?.(b); });
    return this.ui.hoverSelect(b);
  }
  open(id, opts = {}) {
    return this.game.book ? this.game.book.open(id, opts) : null;
  }
  resume() {
    return () => this.game.resumeFromMenu();
  }

  // ---------------------------------------------------------------- entry points
  // Esc / Start / the little journal in the corner
  pause() { return this.open('menu', { home: 'menu', onClose: () => { this.game.saveSettings(); this.game.resumeFromMenu(); } }); }
  // straight to settings or controls (the title screen's signposts)
  settings(onClose) { return this.open('settings', { onClose: () => { this.game.saveSettings(); onClose?.(); } }); }
  controls() { return this.open('controls', { onClose: this.game.mode === 'title' ? null : this.resume() }); }

  register() {
    const B = this.game.book;
    if (!B) return;
    B.register('menu', { build: (L, R, ctx) => this.pMenu(L, R, ctx) });
    B.register('settings', { build: (L, R, ctx) => this.pSettings(L, R, ctx) });
    B.register('controls', { build: (L, R, ctx) => this.pControls(L, R, ctx) });
  }

  // ---- the contents: the day on the left, the menu on the right
  pMenu(L, R, ctx) {
    const g = this.game, st = g.state || {}, d = st.stats || {};
    const hr = g.world?.atmosphere?.hour ?? 8;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
    this.head(L, `Day ${st.day ?? 1}`, `${time}, ${esc(g.world?.atmosphere?.weatherTarget || 'clear')}`);
    const stat = (icon, big, small) => `<div class="bk-stat"><img class="k-g" src="${glyphURL(icon)}" alt=""><b>${big}</b><span>${small}</span></div>`;
    const crate = g.orders?.carried?.().length || 0;
    L.appendChild(el('div', 'bk-stats', [
      stat('coin', `$${Math.floor(st.money || 0)}`, 'saved'),
      stat('cocoa', `${d.dayDeliveries || 0}`, 'cups today'),
      stat('mug_classic', `${crate}`, crate === 1 ? 'cup on Bessie' : 'cups on Bessie'),
      stat('star', `${d.deliveries || 0}`, 'delivered in all'),
    ].join('')));
    this.head(R, "Hank's Journal");
    const items = [
      this.item('Resume', () => ctx.close(), glyphURL('arrowR')),
      this.item('Settings', () => ctx.go('settings'), glyphURL('gear')),
      this.item('Controls', () => ctx.go('controls'), glyphURL('pad')),
      this.item('Save & quit', () => { g.save(); location.href = location.pathname; }, glyphURL('home'), 'quit'),
    ];
    const idx = el('div', 'bk-index');
    items.forEach((b) => idx.appendChild(b));
    R.appendChild(idx);
    return { items };
  }

  // ---- settings: sound on the left, the picture and the camera on the right
  pSettings(L, R, ctx) {
    const g = this.game, ui = this.ui, s = g.settings;
    if (s.uiSize === undefined) s.uiSize = 0;
    const rows = [];
    // a row is the menu item: left / right nudges its control, confirm clicks it
    const row = (page, label, ctrl) => {
      const r = el('div', 'k-setrow pick', `<span class="lbl">${label}</span>`);
      r.appendChild(ctrl);
      r.nudge = (dir) => ctrl.nudge?.(dir);
      r.addEventListener('click', (e) => { if (e.target === r || e.target.classList.contains('lbl')) ctrl.nudge?.(1); });
      ui.hoverSelect(r);
      page.appendChild(r);
      rows.push(r);
    };
    const slider = (key, min, max, step) => kSlider(s[key], min, max, step, (v) => { s[key] = v; g.applySettings(); });
    const cycle = (key, opts, labels, after) => {
      const c = el('div', 'k-cycle', '<i class="l"></i><span class="v"></span><i class="r"></i>');
      const v = c.querySelector('.v');
      const show = () => (v.textContent = labels[opts.indexOf(s[key])] ?? labels[0]);
      c.nudge = (dir) => {
        let i = opts.indexOf(s[key]);
        if (i < 0) i = 0;
        s[key] = opts[(i + dir + opts.length) % opts.length];
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
    this.head(L, 'Sound');
    row(L, 'Volume', slider('master', 0, 1, 0.05));
    row(L, 'Music', slider('music', 0, 1, 0.05));
    row(L, 'Effects', slider('sfx', 0, 1, 0.05));
    this.head(R, 'Picture');
    row(R, 'Graphics', cycle('quality', ['low', 'medium', 'high'], ['Low', 'Medium', 'High']));
    // HD renders every real screen pixel, Balanced a little under; Retro and Chunky are the big-pixel looks
    row(R, 'Pixels', cycle('pixel', [1, 1.5, 2, 3], ['HD', 'Balanced', 'Retro', 'Chunky']));
    row(R, 'Text size', cycle('uiSize', [-1, 0, 1, 2], ['Small', 'Normal', 'Big', 'Huge'], (v) => { setUIScaleOffset(v); g.saveSettings(); }));
    row(R, 'Camera', slider('camDist', 0.8, 1.5, 0.05));
    const ok = ui.button('Back', () => { g.saveSettings(); ctx.back(); });
    R.appendChild(el('div', 'm-foot')).appendChild(ok);
    return { items: [...rows, ok] };
  }

  // ---- controls: on the bike on the left, on foot on the right
  pControls(L, R, ctx) {
    const touch = document.getElementById('ui')?.classList.contains('touchmode');
    const K = (...k) => k.map((x) => kKey(x)).join('');
    const col = (page, title, lines) => {
      this.head(page, title);
      page.insertAdjacentHTML('beforeend', lines.map(([k, v]) => `<div class="crow"><span class="ck">${k}</span><span>${v}</span></div>`).join(''));
    };
    if (touch) {
      col(L, 'Riding', [
        [K('L'), 'Stick: steer. Pull back to wheelie'],
        [K('R'), 'Circle the crank to pedal'],
      ]);
      col(R, 'Buttons', [
        [K('Hop'), 'Hop: hold, then let go'],
        [K('Tag'), 'Tap the tag to talk or hop off'],
        [K('Menu'), 'The journal, top left'],
      ]);
    } else {
      col(L, 'On the bike', [
        [K('W', 'S'), 'Pedal: alternate them'],
        [K('A', 'D'), 'Steer'],
        [K('S'), 'Hold to brake'],
        [K('Space'), 'Hop'],
        [K('Shift'), 'Drift'],
        [K('Q', 'F'), 'Lean back / forward'],
        [K('Z', 'X'), 'Gear down / up'],
        [K('R'), 'Ring the bell'],
      ]);
      col(R, 'On foot', [
        [K('W', 'A', 'S', 'D'), 'Walk (Shift: run)'],
        [K('Space'), 'Jump'],
        [K('E'), 'Talk, hop on / off'],
        [K('Esc'), 'This journal'],
      ]);
      R.appendChild(el('p', 'hint', 'Gamepad: right stick pedals, A hops, X talks, Start opens the journal.'));
    }
    const ok = this.ui.button('Back', () => ctx.back());
    R.appendChild(el('div', 'm-foot')).appendChild(ok);
    return { items: [ok] };
  }

  // ---------------------------------------------------------------- spoken, not paged
  // Nana's order board: she packs what she can brew (rush orders, then the best paid);
  // Hank can swap cups in and out before he rides
  async orderBoard(onDone) {
    const g = this.game, ui = this.ui, O = g.orders;
    const open = () => O.list.filter((o) => o.state === 'board' || o.state === 'carried');
    if (!O.carried().length) {
      const best = O.board().slice().sort((a, b) => (b.rush ? 1 : 0) - (a.rush ? 1 : 0) || b.price - a.price);
      for (const o of best) if (O.carried().length < O.capacity()) O.pack(o);
    }
    for (let guard = 0; guard < 40; guard++) {
      const c = O.carried();
      if (!open().length) {
        await ui.say('grandma', 'No orders on the board, dear. Off you go!', { expr: 'happy' });
        break;
      }
      const text = c.length
        ? `I've packed ${list(c.map((o) => `*${who(o.customer)}'s* ${o.label}`))}. ${c.length}/${O.capacity()} cups!`
        : 'We can\'t brew a thing on the board, dear. Pop over to Moose & Goose?';
      const choices = [c.length ? "Let's ride!" : 'Okay, Nana'];
      if (O.board().length && c.length) choices.push('Swap the orders');
      const k = await ui.say('grandma', text, { expr: c.length ? 'happy' : 'worried', choices });
      if (k !== 1) {
        if (!c.length) this.needGroceries();
        break;
      }
      // pick: each line packs or unpacks one cup
      for (let n = 0; n < 20; n++) {
        const lines = open();
        const labels = lines.map((o) => `${o.state === 'carried' ? 'Unpack' : 'Pack'} ${who(o.customer)}: ${o.label}${o.rush ? ', rush' : ''} $${o.price}`);
        const p = await ui.say('grandma', `Which cups, dear? ${O.carried().length}/${O.capacity()} packed.`, { expr: 'happy', choices: [...labels, 'Done'], instant: n > 0 });
        const o = lines[p];
        if (!o) break;
        if (o.state === 'carried') { O.unpack(o); g.sound?.play('pencil_scribble'); continue; }
        if (O.pack(o)) { g.sound?.play('cup'); continue; }
        g.sound?.play('ui_error');
        const miss = O.missing(o);
        if (miss.length) {
          await ui.say('grandma', `We're out of *${list(miss.map((m) => FOOD_NAME[m] || m))}* for that one, dear.`, { expr: 'worried' });
          this.needGroceries();
        } else await ui.say('grandma', `Bessie only holds ${O.capacity()} cups. Unpack one first.`, { expr: 'sheepish' });
      }
    }
    onDone?.();
  }
  needGroceries() {
    const g = this.game, q = g.quests?.q?.('groceries');
    if (q && q.state !== 'active') { q.state = 'active'; g.sound?.play('quest_new'); }
  }

  // Mo's: he rings up what Nana is low on (two cups' worth of each)
  async shop(onDone) {
    const g = this.game, ui = this.ui, st = g.state;
    st.bag = st.bag || {};
    g.sound?.play('shop_bell');
    const pantry = st.pantry || {};
    const low = SHOP.filter((k) => (pantry[k] || 0) + (st.bag[k] || 0) < 2);
    const say = (t, o = {}) => ui.say('mo', t, { name: 'Mo', ...o });
    if (!low.length) {
      await say("Nana's pantry is full up, Hank! Come back when she's low.", { expr: 'happy' });
      onDone?.();
      return;
    }
    let total = 0;
    const buy = [];
    for (const k of low) {
      const pr = FOOD_INFO[k]?.price || 3;
      if (total + pr <= st.money) { buy.push(k); total += pr; }
    }
    if (!buy.length) {
      g.sound?.play('ui_error');
      await say("That's a little more than you've got, Hank! Deliver a few cups first.", { expr: 'sheepish' });
      onDone?.();
      return;
    }
    const k = await say(`Nana's low on ${list(buy.map((b) => FOOD_NAME[b] || b))}. $${total} for the lot.`, { expr: 'happy', choices: [`Pay $${total}`, 'Never mind'] });
    if (k === 0) {
      st.money -= total;
      for (const b of buy) st.bag[b] = (st.bag[b] || 0) + 2;
      g.sound?.play('cash_coins');
      ui.pop('Groceries bagged! Now home to Nana before the milk gets ideas.', { expr: 'happy' });
      g.save();
    }
    onDone?.();
  }

  // the day's tally before bed
  async summary(onDone) {
    const g = this.game, st = g.state, s = st.stats || {};
    const tips = s.dayTips ? ` ($${s.dayTips} in tips)` : '';
    await this.ui.say('grandma', `Day ${st.day} done! ${s.dayDeliveries || 0} cups delivered, $${s.dayEarned || 0} earned${tips}. $${Math.floor(st.money)} saved. Off to bed, dear.`, { expr: 'happy' });
    onDone?.();
  }
}
