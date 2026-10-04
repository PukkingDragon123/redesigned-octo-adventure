// HUD, dialogue, pop-ups (Hank peeking up to say things), prompts and menu
// plumbing, all built from the pixel UI kit (kit.js / kit.css).
import './kit.css';
import './ui.css';
import './paper.css';
import './menus.css';
import './notebook.css';
import { Bubbles } from './bubbles.js';
import { Popups, htmlToMarkup } from './popup.js';
import { buildPaperHUD, updatePaperHUD, Gauge } from './paperhud.js';
import { installKit, kitReady, kButton, kPanel, el, snap, snapBox, scale } from './kit.js';
import { iconURL, hasIcon } from '../art/icons.js';
import { foodIconURL, FOOD_INFO } from '../art/foodsprites.js';
import { LivePortrait } from './live3d.js';
import { CHARACTERS } from '../art/characters.js';
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';
import { loadSettings } from '../game/state.js';
import { leaves } from './leaves.js';

// a pixel icon by name: the UI set first, then the food sprites
export function anyIcon(name) {
  if (hasIcon(name)) return { src: iconURL(name), size: 32 };
  const f = FOOD_INFO[name] ? name : null;
  return f ? { src: foodIconURL(f), size: 48 } : { src: iconURL(name), size: 32 };
}

export const VOICE = { hank: 'hank', hankBuried: 'hank', grandma: 'grandma', reaper: 'reaper', gus: 'gus', marie: 'marie', doug: 'doug', birdie: 'birdie', ingrid: 'ingrid', lou: 'lou', agnes: 'agnes', pip: 'kid', pop: 'kid', ollie: 'ollie', cat: 'cat' };

// old callers styled elements with a frame name; map those onto kit panels
const FRAME_CLASS = { wood: [], paper: ['k-parchment'], dark: ['k-dark'], order: ['k-parchment'] };
export function frameStyle(e, style = 'wood') {
  e.classList.add('k-panel', ...(FRAME_CLASS[style] || []));
  return e;
}

// ---------------------------------------------------------------- UI
export class UI {
  constructor(game) {
    this.game = game;
    installKit({ offset: (game.settings || loadSettings()).uiSize ?? 0 });
    this.root = document.getElementById('ui');
    this.root.innerHTML = '';
    this.root.classList.add('k-text');
    this.buildHUD();
    this.dialogue = this.buildDialogue();
    this.bubbles = new Bubbles(this);
    this.popups = new Popups(this);
    this.skipHint = el('div', 'skiphint', '<span class="k-key">Esc</span><span class="k-shadow">skip</span>');
    this.skipHint.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const sc = this.game.currentScene;
      if (sc) {
        sc.skip = true;
        this.hideDialogue();
      }
    });
    this.root.appendChild(this.skipHint);
    this.overlay = null;
    this.menuStack = [];
    this.prompted = null;
    this.tags = new Map();
  }

  // ---------------------------------------------------------------- HUD
  buildHUD() {
    this.gauge = new Gauge();
    buildPaperHUD(this);
  }

  showHUD(on) {
    this.hud.classList.toggle('hidden', !on);
  }

  updateHUD(dt) {
    updatePaperHUD(this, dt);
  }

  setObjective(text) {
    if (this.objective.textContent !== (text || '')) {
      this.objective.textContent = text || '';
      this.objective.classList.toggle('on', !!text);
    }
  }

  prompt(text, key = 'E') {
    if (text === this.prompted) return;
    this.prompted = text;
    if (!text) {
      this.promptEl.classList.remove('on');
      return;
    }
    this.promptEl.innerHTML = `<span class="k-key">${key}</span><span class="pt">${text}</span>`;
    this.promptEl.classList.remove('on');
    void this.promptEl.offsetWidth;
    this.promptEl.classList.add('on');
    snapBox(this.promptEl);
  }

  // Hank (or whoever: opts.who) pops up from a bottom corner and says it. See popup.js.
  pop(text, opts = {}) {
    const who = opts.who || 'hank';
    const name = who === 'hank' ? '' : opts.name ?? (who === 'cat' ? 'Poutine' : who === 'grandma' ? 'Nana' : CHARACTERS[who]?.name ?? '');
    this.popups.push(text, { ...opts, who, name, voice: VOICE[who] || CHARACTERS[who]?.voice || 'narrator' });
  }
  // old-style calls still work: they become Hank saying the same words
  toast(text, icon = null, ms) {
    this.pop(htmlToMarkup(text), { expr: { skull: 'worried', coin: 'happy', star: 'sparkle' }[icon] || 'happy', ms });
  }
  banner(title, sub = '') {
    this.pop(htmlToMarkup(sub ? `*${title}!* ${sub}` : `*${title}!*`), { expr: 'sparkle' });
  }

  letterbox(on) {
    this.root.classList.toggle('letterbox', on);
  }

  // little tooltip tags over world positions (villagers muttering, a dog barking);
  // the old comic stamps (a cls) are Hank shouting it instead
  tag(id, text, pos, ms = 1500, cls = '') {
    if (cls) { this.pop(text, { shout: true, expr: /bail/.test(cls) ? 'shock' : 'sparkle' }); return; }
    let t = this.tags.get(id);
    if (!t) {
      t = { e: el('div', 'k-tip wtag') };
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
      if (!vis) continue;
      const W = window.innerWidth, w = t.e.offsetWidth;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const left = Math.max(4, Math.min(W - w - 4, x - w / 2));
      t.e.style.transform = `translate(${snap(left)}px, ${snap(Math.max(4, y - t.e.offsetHeight))}px)`;
    }
  }

  // ---------------------------------------------------------------- dialogue (the classic box; speech bubbles are the default)
  buildDialogue() {
    const d = el('div');
    d.id = 'dialogue';
    const box = kPanel('leather', 'dlg-box');
    box.innerHTML = '<div class="dlg-portrait"></div><div class="dlg-main"><div class="dlg-name k-bold"></div><div class="dlg-text"></div><div class="dlg-choices"></div></div><div class="dlg-next"></div>';
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
    if (!opts.classic) return this.bubbles.say(who, text, opts, name, VOICE[who] || 'narrator');
    D.root.classList.add('on');
    const narr = !who && !opts.choices;
    D.box.classList.toggle('narr', narr);
    D.box.classList.toggle('k-dark', narr);
    D.portrait.classList.toggle('empty', !who);
    if (who) {
      // a live 3D head-and-shoulders of the real model, not a flat picture
      if (!this._dlgLive) {
        this._dlgLive = new LivePortrait(this.game, { art: 48, bust: true, yaw: 0.3, outline: false, bg: '#2a1a14' });
        this._dlgLive.canvas.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
      }
      if (this._dlgLive.canvas.parentNode !== D.portrait) D.portrait.appendChild(this._dlgLive.canvas);
      this._dlgLive.set(who, opts.expr || 'neutral');
      this._dlgLive.talk(true);
      setTimeout(() => this._dlgLive?.talk(false), Math.min(4000, 400 + text.length * 30));
    }
    D.name.textContent = name;
    D.name.style.display = name ? '' : 'none';
    D.choices.innerHTML = '';
    D.next.style.display = 'none';
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
            if ('.!?'.includes(p.ch)) acc -= 4;
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
    this.bubbles.clear();
    this.dialogue.root.classList.remove('on');
    this.dialogueTick = null;
    const r = this._dlgResolve;
    this._dlgResolve = null;
    r?.();
  }

  // ---------------------------------------------------------------- menus
  // A menu is { ov, items: [elements], sel, onBack, grid }; navigation handled here.
  // Items that have a nudge(dir) method (sliders, cycles, toggles) take left/right.
  openOverlay(contentEl, { onBack = null, items = null, grid = 0 } = {}) {
    kitReady();
    const ov = el('div', 'overlay');
    ov.appendChild(contentEl);
    this.root.appendChild(ov);
    const m = { ov, items: items || [...contentEl.querySelectorAll(MENU_ITEMS)], sel: 0, onBack, grid };
    this.menuStack.push(m);
    this.highlight(m);
    sound.play('ui_open');
    snapBox(contentEl);
    // a few leaves shaken loose as the sheet lands, and a little gust across
    requestAnimationFrame(() => {
      leaves.flutter(contentEl, 7);
      leaves.gust(5, { speed: 1.3 });
    });
    return m;
  }
  closeOverlay(m = this.menuStack[this.menuStack.length - 1]) {
    if (!m) return;
    const sheet = m.ov.firstElementChild;
    if (sheet) leaves.flutter(sheet, 6);
    m.ov.remove();
    this.menuStack = this.menuStack.filter((x) => x !== m);
    this.swallowInput();
    sound.play('ui_close');
  }
  refreshItems(m, selector = MENU_ITEMS) {
    m.items = [...m.ov.querySelectorAll(selector)];
    m.sel = Math.min(m.sel, m.items.length - 1);
    this.highlight(m);
  }
  highlight(m) {
    m.items.forEach((e, i) => e.classList.toggle('sel', i === m.sel));
    const cur = m.items[m.sel];
    cur?.dispatchEvent(new CustomEvent('focus-item'));
    // keep the focused row in view inside a scrolling list or menu (never scroll the page)
    const box = cur?.closest('.k-list, .menu');
    if (box && box.scrollHeight > box.clientHeight) {
      const r = cur.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    }
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
    const cur = m.items[m.sel];
    if (input.pressed('up') || input.pressed('menuUp')) move(-cols);
    if (input.pressed('down') || input.pressed('menuDown')) move(cols);
    if (cols > 1) {
      if (input.pressed('left')) move(-1);
      if (input.pressed('right')) move(1);
    } else if (cur?.nudge) {
      if (input.pressed('left')) { cur.nudge(-1); sound.play('ui_hover'); }
      if (input.pressed('right')) { cur.nudge(1); sound.play('ui_hover'); }
    }
    if ((input.pressed('interact') || input.pressed('jump') || input.pressed('confirm')) && n) {
      if (cur?.nudge && !cur.matches('button')) cur.nudge(1);
      else cur?.click();
    }
    if (input.pressed('back') || input.pressed('pause')) {
      if (m.onBack) m.onBack();
    }
    return true;
  }
  // make any element hover-selectable inside the current menu
  hoverSelect(e) {
    e.addEventListener('pointerenter', () => {
      const m = this.menuStack[this.menuStack.length - 1];
      if (!m) return;
      const i = m.items.indexOf(e);
      if (i >= 0 && i !== m.sel) {
        m.sel = i;
        this.highlight(m);
      }
    });
    return e;
  }

  button(label, onClick, { small = '', disabled = false, face = '', icon = '' } = {}) {
    const b = kButton(label, null, { small, disabled, face, icon, cls: 'btn' });
    b.addEventListener('click', () => {
      if (b.disabled) return;
      sound.play('ui_click');
      leaves.burstFrom(b, 6);
      onClick?.();
    });
    return this.hoverSelect(b);
  }

  // style: wood/leather | paper/parchment | dark
  panel(style = 'wood', cls = 'menu') {
    const kind = { wood: 'leather', leather: 'leather', paper: 'parchment', parchment: 'parchment', dark: 'dark' }[style] || 'leather';
    return kPanel(kind, cls);
  }

  update(dt) {
    // a few leaves drift past while a menu (or the title) is open
    const menu = this.menuStack.length > 0;
    if (menu !== this._leafAmb) {
      this._leafAmb = menu;
      leaves.ambient('menu', menu, 4);
    }
    if (this.dialogueTick) this.dialogueTick(dt);
    else this.menuTick();
    this.updateTags();
    this.popups.update(dt);
  }
}

export const MENU_ITEMS = '.k-btn:not(:disabled), .k-slot.pick, .pick';
export { el, scale };
