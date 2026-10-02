// Pixel-art comic speech bubbles that float over the real 3D speaker, with
// emotion-shaped outlines (shouts are spiky, fear is wobbly, thoughts are clouds,
// whispers are dashed), little mood marks, per-letter text effects, name plates
// and reply bubbles for choices. Narration appears on a framed caption plate.
//
// Everything is drawn on the kit's pixel grid: frames are 9-slices at a whole
// number of device pixels per art pixel, text is the pixel font at its native
// size, positions are snapped to device pixels and all motion moves in whole art
// pixels (steps()), so nothing is ever resampled or blurred.
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';
import { bubbleArt, bubbleTailArt, BUBBLE_JOIN } from './kitart.js';
import { glyphURL } from '../art/icons.js';
import { el, scale, snap } from './kit.js';

// ---------------------------------------------------------------- art (cached data URLs)
const URLS = new Map();
function toURL(p) {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c.toDataURL();
}
const frame = (style) => URLS.get(`f${style}`) || (URLS.set(`f${style}`, toURL(bubbleArt(style))), URLS.get(`f${style}`));
const tail = (style) => URLS.get(`t${style}`) || (URLS.set(`t${style}`, toURL(bubbleTailArt(style))), URLS.get(`t${style}`));

// emotion -> bubble look
function moodOf(expr) {
  switch (expr) {
    case 'angry': case 'grumpy': return { style: 'shout', marks: ['anger'], anim: 'shake' };
    case 'shock': case 'surprised': return { style: 'shout', marks: ['bang', 'shock'], anim: 'pop' };
    case 'scared': case 'worried': return { style: 'shaky', marks: ['sweat'], anim: 'tremble' };
    case 'laugh': return { style: 'round', marks: ['ha', 'note'], anim: 'bounce' };
    case 'love': return { style: 'round', marks: ['heart', 'heart'], anim: 'float' };
    case 'sad': case 'cry': return { style: 'whisper', marks: ['tear'], anim: 'droop' };
    case 'sheepish': return { style: 'whisper', marks: ['sweat'], anim: 'pop' };
    case 'sleepy': return { style: 'think', marks: ['zzz'], anim: 'float' };
    case 'think': case 'dizzy': return { style: 'think', marks: ['question'], anim: 'float' };
    case 'happy': case 'sparkle': case 'wink': return { style: 'round', marks: ['sparkle'], anim: 'bounce' };
    default: return { style: 'round', marks: [], anim: 'pop' };
  }
}

// text markup: *bold*, ~wave~, ^shake^, _small_
function tokenize(text) {
  const parts = [];
  const on = { '*': false, '~': false, '^': false, _: false };
  for (const ch of text) {
    if (ch in on) { on[ch] = !on[ch]; continue; }
    parts.push({ ch, b: on['*'], w: on['~'], s: on['^'], sm: on._ });
  }
  return parts;
}
// The whole line is laid out up front with every letter hidden, then typing just
// reveals letters: the bubble has its final size from the first frame, so it
// never grows, slides or re-wraps words while the text types in.
function layoutText(txt, parts) {
  const out = [];
  let word = null;
  parts.forEach((p, i) => {
    if (p.ch === ' ' || p.ch === '\n') {
      txt.appendChild(p.ch === ' ' ? document.createTextNode(' ') : document.createElement('br'));
      word = null;
      out.push(null);
      return;
    }
    if (!word) { word = el('span', 'tword'); txt.appendChild(word); }
    const sp = el('span', `hid${p.b ? ' tb' : ''}${p.w ? ' tw' : ''}${p.s ? ' ts' : ''}${p.sm ? ' tsm' : ''}`);
    sp.textContent = p.ch;
    if (p.w || p.s) sp.style.animationDelay = `${(i % 8) * -0.1}s`;
    word.appendChild(sp);
    out.push(sp);
  });
  return out;
}

export class Bubbles {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.layer = el('div', 'bubble-layer k-text');
    ui.root.appendChild(this.layer);
    this.active = null;
  }

  // find the 3D character who is speaking
  findSpeaker(who, opts) {
    if (opts.actor) return opts.actor;
    if (!who) return null;
    const g = this.game;
    const sc = g.currentScene;
    if (sc) {
      const a = sc.actors.find((x) => x.char === who || (who === 'hank' && x.char === 'hankBuried'));
      if (a) return a;
    }
    if ((who === 'hank' || who === 'hankBuried') && g.player?.ch?.visible) return g.player.ch;
    if ((who === 'hank' || who === 'hankBuried') && g.rider?.ch?.visible) return g.rider.ch;
    const v = g.villagers?.actors;
    if (v) for (const a of Object.values(v)) if (a.char === who && a.visible) return a;
    return null;
  }

  // returns a Promise like ui.say
  say(who, text, opts, name, voice) {
    const narr = !who && !opts.choices;
    if (narr) return this.narrate(text, opts);
    this.clear();
    // the "E: Talk to ..." tag would sit under the reply bubbles
    this.ui.prompt?.(null);
    const speaker = this.findSpeaker(who, opts);
    const mood = moodOf(opts.expr);
    const b = el('div', `bubble b-${mood.style}`);
    b.style.borderImageSource = `url(${frame(mood.style)})`;
    const tl = el('div', 'b-tail');
    tl.style.backgroundImage = `url(${tail(mood.style)})`;
    const nameEl = name ? el('div', 'k-plate k-dark k-bold b-name', '') : null;
    if (nameEl) nameEl.textContent = name;
    const txt = el('div', 'b-text');
    const next = el('div', 'b-next');
    b.appendChild(txt);
    b.appendChild(next);
    if (nameEl) b.appendChild(nameEl);
    mood.marks.forEach((m, i) => {
      const e = el('img', `b-mark m${i}`);
      e.src = glyphURL(`mark_${m}`);
      b.appendChild(e);
    });
    const wrap = el('div', 'bubble-wrap');
    const anim = el('div', `bub-anim anim-${mood.anim}`);
    anim.append(tl, b);
    wrap.appendChild(anim);
    this.layer.appendChild(wrap);
    if (speaker && opts.expr) speaker.tempExpr?.(opts.expr, 30);
    const parts = tokenize(text);
    const self = this;
    return new Promise((resolve) => {
      let i = 0, acc = 0, done = false, sel = 0;
      const speed = opts.speed ?? 40;
      const items = [];
      const A = (this.active = { wrap, b, tl, speaker, resolve: null, choiceEls: items, hasName: !!nameEl });
      const letters = layoutText(txt, parts);
      const addChar = () => letters[i - 1]?.classList.remove('hid');
      const finish = () => {
        while (i < parts.length) addChar(parts[i++]);
        done = true;
        if (speaker) speaker.talking = 0;
        if (opts.choices) this.showChoices(opts.choices, items, (k) => { sel = k; close(); }, (k) => setSel(k));
        else next.classList.add('on');
      };
      const setSel = (k) => {
        sel = (k + items.length) % items.length;
        items.forEach((e, j) => {
          e.classList.toggle('sel', j === sel);
          e.style.borderImageSource = `url(${frame(j === sel ? 'sel' : 'round')})`;
        });
        sound.play('ui_hover');
      };
      const close = () => {
        self.ui.dialogueTick = null;
        self.ui._dlgResolve = null;
        self.ui.swallowInput();
        sound.play('ui_click');
        if (speaker) { speaker.talking = 0; if (opts.expr) speaker.tempExpr?.(opts.expr, 0.8); }
        if (!opts.keepOpen) this.clear();
        resolve(opts.choices ? sel : undefined);
      };
      this.ui._dlgResolve = () => { this.clear(); resolve(opts.choices ? 0 : undefined); };
      this.ui._dlgClick = false;
      wrap.addEventListener('pointerdown', () => (this.ui._dlgClick = true));
      this.layer.onpointerdown = () => (this.ui._dlgClick = true);
      this.ui.dialogueTick = (dt) => {
        const confirm = input.pressed('confirm') || this.ui._dlgClick;
        this.ui._dlgClick = false;
        this.place(A);
        if (!done) {
          acc += dt * speed * (input.down('confirm') && i > 3 ? 3 : 1);
          let blipped = false;
          while (acc >= 1 && i < parts.length) {
            acc -= 1;
            const p = parts[i++];
            addChar(p);
            if (!blipped && p.ch !== ' ' && i % 2 === 0) { sound.blip(voice); blipped = true; }
            if ('.!?'.includes(p.ch)) acc -= 4;
            else if (p.ch === ',') acc -= 2;
          }
          if (speaker) speaker.talking = 0.3;
          if (i >= parts.length) finish();
          else if (confirm && i > 2) finish();
          return;
        }
        if (this.game.params?.has('autotalk') && (A.doneT = (A.doneT || 0) + dt) > 1.2) { close(); return; }
        if (opts.choices) {
          if (input.pressed('up') || input.pressed('left') || input.pressed('menuUp')) setSel(sel - 1);
          if (input.pressed('down') || input.pressed('right') || input.pressed('menuDown')) setSel(sel + 1);
          if (input.pressed('confirm')) close();
          return;
        }
        if (confirm) close();
      };
      this.place(A);
      if (opts.instant) finish();
    });
  }

  // Hank's reply bubbles
  showChoices(choices, items, pick, hover) {
    const box = el('div', 'reply-stack');
    choices.forEach((c, k) => {
      const e = el('div', `reply${k === 0 ? ' sel' : ''}`);
      e.style.borderImageSource = `url(${frame(k === 0 ? 'sel' : 'round')})`;
      e.innerHTML = `<span class="hand"></span><span class="rt">${c}</span>`;
      e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); pick(k); });
      e.addEventListener('pointerenter', () => hover(k));
      e.style.animationDelay = `${k * 0.08}s`;
      box.appendChild(e);
      items.push(e);
    });
    this.layer.appendChild(box);
    this.active.replies = box;
    this.active.replySpeaker = this.findSpeaker('hank', {});
  }

  // narration: a dark framed caption plate across the top
  narrate(text, opts) {
    this.clear();
    const p = el('div', 'k-panel k-dark narr-plate');
    const txt = el('div', 'n-text');
    const next = el('div', 'b-next');
    p.appendChild(txt);
    p.appendChild(next);
    this.layer.appendChild(p);
    const u = scale.u;
    const fit = () => {
      const w = Math.min(268, scale.cols - 16) * u;
      p.style.width = `${w}px`;
      p.style.left = `${snap((innerWidth - w) / 2)}px`;
      const box = this.ui.root.classList.contains('letterbox') ? Math.ceil((innerHeight * 0.09) / u) * u : 0;
      p.style.top = `${snap(box + 6 * u)}px`;
    };
    fit();
    const parts = tokenize(text);
    return new Promise((resolve) => {
      let i = 0, acc = 0, done = false;
      this.active = { wrap: p, narr: true, fit };
      const letters = layoutText(txt, parts);
      const add = () => letters[i - 1]?.classList.remove('hid');
      const close = () => {
        this.ui.dialogueTick = null;
        this.ui._dlgResolve = null;
        this.ui.swallowInput();
        sound.play('page_flip', { volume: 0.4 });
        this.clear();
        resolve(undefined);
      };
      this.ui._dlgResolve = () => { this.clear(); resolve(undefined); };
      this.layer.onpointerdown = () => (this.ui._dlgClick = true);
      this.ui.dialogueTick = (dt) => {
        const confirm = input.pressed('confirm') || this.ui._dlgClick;
        this.ui._dlgClick = false;
        if (!done) {
          acc += dt * (opts.speed ?? 46) * (input.down('confirm') && i > 3 ? 3 : 1);
          while (acc >= 1 && i < parts.length) {
            acc -= 1;
            const q = parts[i++];
            add(q);
            if ('.!?'.includes(q.ch)) acc -= 5;
          }
          if (i >= parts.length || (confirm && i > 2)) {
            while (i < parts.length) add(parts[i++]);
            done = true;
            next.classList.add('on');
          }
          return;
        }
        if (this.game.params?.has('autotalk') && (this.active.doneT = (this.active.doneT || 0) + dt) > 1.2) { close(); return; }
        if (confirm) close();
      };
      if (opts.instant) { while (i < parts.length) add(parts[i++]); done = true; next.classList.add('on'); }
    });
  }

  clear() {
    this.layer.innerHTML = '';
    this.layer.onpointerdown = null;
    this.active = null;
  }

  // keep the bubble above the speaker's real head on screen (whole device pixels only)
  place(A) {
    if (!A) return;
    if (A.narr) { A.fit?.(); return; }
    const cam = this.game.camera;
    const W = innerWidth, H = innerHeight, u = scale.u;
    const bw = A.b.offsetWidth, bh = A.b.offsetHeight;
    let sx = W / 2, sy = H * 0.72, onScreen = false;
    if (A.speaker?.headWorld) {
      const p = A.speaker.headWorld();
      p.y += 0.22;
      const v = p.project(cam);
      if (v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15) {
        sx = (v.x * 0.5 + 0.5) * W;
        sy = (-v.y * 0.5 + 0.5) * H;
        onScreen = true;
      }
    }
    const m = 6 * u;
    // keep clear of the cutscene letterbox bars and leave room for the name plate
    const box = this.ui.root.classList.contains('letterbox') ? H * 0.09 : 0;
    const top = m + box + (A.hasName ? 16 * u : 0);
    const tailBelow = (14 - BUBBLE_JOIN) * u; // how far the tail tip hangs below the bubble box
    let bx = sx - bw * 0.3;
    let by = sy - bh - tailBelow;
    bx = Math.max(m, Math.min(W - bw - m, bx));
    by = Math.max(top, Math.min(H - bh - tailBelow - m - box, by));
    bx = snap(Math.round(bx / u) * u);
    by = snap(Math.round(by / u) * u);
    A.wrap.style.transform = `translate(${bx}px, ${by}px)`;
    const tx = Math.max(10 * u, Math.min(bw - 26 * u, sx - bx - 2 * u));
    A.tl.style.left = `${snap(Math.round(tx / u) * u)}px`;
    A.tl.style.top = `${snap(bh - BUBBLE_JOIN * u)}px`;
    A.tl.style.display = onScreen ? '' : 'none';
    if (A.replies) {
      // reply bubbles stack near Hank (or bottom right)
      const rw = A.replies.offsetWidth, rh = A.replies.offsetHeight;
      let rx = W - rw - 12 * u, ry = H - rh - 12 * u;
      const h = A.replySpeaker;
      if (h?.headWorld && h !== A.speaker) {
        const v = h.headWorld().project(cam);
        if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) {
          rx = (v.x * 0.5 + 0.5) * W + 16 * u;
          ry = (-v.y * 0.5 + 0.5) * H - rh * 0.3;
        }
      }
      rx = Math.max(m + 20 * u, Math.min(W - rw - m, rx));
      ry = Math.max(by + bh + tailBelow + 4 * u, Math.min(H - rh - m, ry));
      if (ry + rh > H - m) ry = H - rh - m;
      A.replies.style.transform = `translate(${snap(Math.round(rx / u) * u)}px, ${snap(Math.round(ry / u) * u)}px)`;
    }
  }
}
