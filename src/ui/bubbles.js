// Simple, classic, cosy speech bubbles that float over the real 3D speaker: a cream
// bubble with round pixel corners, a one-pixel brown outline, a hard drop shadow
// and a little tail pointing at whoever is talking, their name on a small tab in
// their own colour, a tiny leaf pinned to the corner and a bouncing arrow when
// there's more to read. Moods stay gentle: shouts get little spikes, thoughts a
// cool tint and thought dots, whispers a dotted outline, plus small mood marks and
// per-letter text effects. Reply bubbles for choices; narration on a dark cocoa
// bubble across the top.
//
// Out in the world (villagers muttering as Hank rides by: WorldBubbles, ui.tag) the
// very same bubble comes on the half-size pixel grid with one or two short lines, or,
// too far off to read, as a tiny thought cloud with three dots.
//
// Everything is drawn on the kit's pixel grid: frames are 9-slices at a whole
// number of device pixels per art pixel, text is the pixel font at its native
// size, positions are snapped to device pixels and all motion moves in whole art
// pixels (steps()), so nothing is ever resampled or blurred. Bubbles are placed
// after the camera and the characters have moved for the frame (ui.late), on the
// speaker's real head, with no easing and no bob.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';
import { bubbleArt, bubbleTailArt, nameTabArt, BUBBLE_JOIN, BUBBLE_TAIL, CLOUD_ART } from './kitart.js';
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
const cached = (key, make) => URLS.get(key) || (URLS.set(key, toURL(make())), URLS.get(key));
export const frame = (style) => cached(`f${style}`, () => bubbleArt(style));
// flip: the tip on the right (a mirrored image, never a CSS flip)
export const tail = (style, flip = false) => cached(`t${style}${flip ? 'r' : ''}`, () => bubbleTailArt(style, flip));
// how many art px of the tail overlap the bubble's bottom edge (its outline row sits
// higher on a spiky shout; thought dots float a little below)
export const tailJoin = (style) => (style === 'shout' ? 5 : style === 'think' ? 1 : BUBBLE_JOIN);
export const TAIL_W = BUBBLE_TAIL[0], TAIL_H = BUBBLE_TAIL[1];

// ---------------------------------------------------------------- name tabs
const TAB = {
  hank: 0xe07a2a, hankBuried: 0xe07a2a, grandma: 0xd0566a, reaper: 0x6a4a8a, gus: 0x4f8a3a, marie: 0x3a78b8,
  doug: 0x34548e, birdie: 0x2a8a86, ingrid: 0x8a5ab0, lou: 0xb0582a, agnes: 0xc0608a, pip: 0xc8902a, pop: 0x4a96bc,
  ollie: 0x7a6a48, cat: 0x9a6a4a,
};
const TAB_ANY = [0xd0566a, 0x4f8a3a, 0x3a78b8, 0x8a5ab0, 0xe07a2a, 0x2a8a86, 0xc8902a];
export function tabColor(who, name = '') {
  if (TAB[who]) return TAB[who];
  let h = 0;
  for (const ch of String(name || who || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TAB_ANY[Math.abs(h) % TAB_ANY.length];
}
// the speaker's name on a little coloured tab riding the bubble's top edge
export function nameTab(who, name, cls = '') {
  const e = el('div', `b-name k-bold${cls ? ` ${cls}` : ''}`);
  e.textContent = name;
  const c = tabColor(who, name);
  e.style.borderImageSource = `url(${cached(`n${c}`, () => nameTabArt(c))})`;
  return e;
}

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
export function tokenize(text) {
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
export function layoutText(txt, parts) {
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

// ---------------------------------------------------------------- where a speaker's head is
// The top of the head this frame. Up and down it is held still through the little bob
// of a walk or a nod (BAND metres) and only follows once the head really goes up or
// down (it then rides the edge of the band: no easing, no lag beyond it). A character
// drawn as a far-off stand-in (the contest crowd) has no posed rig: their height then.
const BAND = 0.09;
const _hv = new THREE.Vector3();
export function headAnchor(a, st, out) {
  if (a.headWorld && (!a.root || (a.root.visible && a.root.parent))) a.headWorld(out);
  else out.set(a.pos.x, a.pos.y + (a.P?.height ?? 1.7), a.pos.z);
  if (st.ay == null || Math.abs(out.y - st.ay) > 1.5) st.ay = out.y;
  else if (out.y > st.ay + BAND) st.ay = out.y - BAND;
  else if (out.y < st.ay - BAND) st.ay = out.y + BAND;
  out.y = st.ay;
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
    const nameEl = name ? nameTab(who, name) : null;
    const txt = el('div', 'b-text');
    const next = el('div', 'b-next');
    b.appendChild(txt);
    b.appendChild(next);
    if (nameEl) b.appendChild(nameEl);
    if (mood.style !== 'shout') b.appendChild(el('i', 'b-leaf'));
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
      const A = (this.active = { wrap, b, tl, style: mood.style, speaker, resolve: null, choiceEls: items, hasName: !!nameEl });
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

  // narration: a dark cocoa bubble (no tail) across the top
  narrate(text, opts) {
    this.clear();
    const p = el('div', 'bubble b-dark narr-plate');
    p.style.borderImageSource = `url(${frame('dark')})`;
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
      const p = headAnchor(A.speaker, A, _hv);
      p.y += 0.22;
      const v = p.project(cam);
      if (v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15) {
        sx = (v.x * 0.5 + 0.5) * W;
        sy = (-v.y * 0.5 + 0.5) * H;
        onScreen = true;
      }
    }
    const m = 6 * u;
    // keep clear of the cutscene letterbox bars and leave room for the name tab
    const box = this.ui.root.classList.contains('letterbox') ? H * 0.09 : 0;
    const top = m + box + (A.hasName ? 12 * u : 0);
    const join = tailJoin(A.style);
    const tailBelow = (TAIL_H - join) * u; // how far the tail tip hangs below the bubble box
    let bx = sx - bw * 0.3;
    let by = sy - bh - tailBelow;
    bx = Math.max(m, Math.min(W - bw - m, bx));
    by = Math.max(top, Math.min(H - bh - tailBelow - m - box, by));
    bx = snap(Math.round(bx / u) * u);
    by = snap(Math.round(by / u) * u);
    A.wrap.style.transform = `translate(${bx}px, ${by}px)`;
    // the tail's tip points at the speaker: tip at its left end, or (speaker right of
    // the middle) a mirrored tail with the tip at its right end; kept on the flat of
    // the bubble's bottom edge, clear of the round corners
    const flip = sx - bx > bw / 2;
    const want = flip ? sx - bx - (TAIL_W - 2) * u : sx - bx - u;
    const tx = Math.max(3 * u, Math.min(bw - (TAIL_W + 4) * u, want));
    if (A.flip !== flip) {
      A.flip = flip;
      A.tl.style.backgroundImage = `url(${tail(A.style, flip)})`;
    }
    A.tl.style.left = `${snap(Math.round(tx / u) * u)}px`;
    A.tl.style.top = `${snap(bh - join * u)}px`;
    A.tl.style.display = onScreen ? '' : 'none';
    if (A.replies) {
      // reply bubbles stack near Hank (or bottom right)
      const rw = A.replies.offsetWidth, rh = A.replies.offsetHeight;
      let rx = W - rw - 12 * u, ry = H - rh - 12 * u;
      const h = A.replySpeaker;
      if (h?.headWorld && h !== A.speaker) {
        const v = headAnchor(h, A.replyAnchor || (A.replyAnchor = {}), _hv).project(cam);
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

// ---------------------------------------------------------------- little bubbles out in the world
// Villagers muttering as Hank goes by (ui.tag): the same cream bubble, outline and tail
// as a conversation, on the half-size pixel grid (--us) with one or two short lines (a
// longer line is split over two bubbles in turn, and anything past that trimmed). Each
// one sits right on top of its speaker's head, found once when the line is said and
// followed every frame. Far off, or crowded out by nearer talk, it is a tiny thought
// cloud with three dots instead, which pops open into the words as Hank comes closer.
const W_LINE = 14; // characters a line (Monogram is 6 px a character)
const W_LINES = 2; // lines a bubble
const W_NEAR = 17, W_FAR = 21; // m from the camera: nearer opens the words, further makes a cloud
const W_GONE = 48; // m: further off than this, nothing at all
const W_OPEN = 3; // at most this many open at once (the nearest)
const CLOUD_TIP = 6.5; // x of the middle of the cloud's last little puff (it hangs over the head)
const CH = 6, LH = 12; // a character's width and a line's height (art px)
const BOX_X = 11, BOX_Y = 10; // the bubble frame's borders and padding across / down
const SETTLE = 220; // ms a change between words and cloud has to hold before it shows

// words -> pages of at most W_LINES lines of at most W_LINE characters
export function pagesOf(text) {
  const words = String(text).replace(/\[([^\]\s]{1,8})\]/g, '$1').replace(/<[^>]+>/g, '').replace(/[*~^_]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > W_LINE) {
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(`${w.slice(0, W_LINE - 1)}-`);
      w = w.slice(W_LINE - 1);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= W_LINE) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const pages = [];
  for (let i = 0; i < lines.length; i += W_LINES) pages.push(lines.slice(i, i + W_LINES));
  if (pages.length > 2) {
    pages.length = 2;
    const pg = pages[1], l = pg[pg.length - 1].replace(/[.,!?;:-]+$/, '');
    pg[pg.length - 1] = `${l.length >= W_LINE ? l.slice(0, W_LINE - 1) : l}…`;
  }
  return pages.length ? pages : [['…']];
}

// who is talking at pos: the character standing right under it (a villager, someone in the
// contest crowd, a cutscene actor, Hank); nobody for a dog's bark or the stray cat (their
// own position, which they keep up to date, is used as it is)
function speakerAt(g, pos) {
  let best = null, bd = 0.4 * 0.4;
  const test = (a) => {
    if (!a?.pos || !a.headWorld) return;
    const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, d = dx * dx + dz * dz;
    if (d < bd && pos.y > a.pos.y - 0.5 && pos.y < a.pos.y + 4) { bd = d; best = a; }
  };
  for (const a of Object.values(g.villagers?.actors || {})) test(a);
  for (const m of g.contest?.crowd?.list || []) test(m.a);
  for (const a of g.currentScene?.actors || []) test(a);
  test(g.rider?.ch);
  test(g.player?.ch);
  return best;
}

const _wp = new THREE.Vector3();
const overlaps = (R, q) => R[0] < q[2] && R[2] > q[0] && R[1] < q[3] && R[3] > q[1];
export class WorldBubbles {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    // under the HUD and the touch controls: they belong to the world
    this.layer = el('div', 'wbub-layer');
    ui.root.prepend(this.layer);
    this.list = new Map();
  }

  // ui.tag(id, text, pos, ms): pos is where the line was said (often a copy made then);
  // the bubble follows whoever is standing there
  say(id, text, pos, ms = 1500) {
    const now = performance.now();
    let t = this.list.get(id);
    if (!t) {
      const e = el('div', 'wbub');
      e.innerHTML = '<div class="wb-in"><div class="wb-box"></div><i class="wb-tail"></i><i class="wb-cloud"></i></div>';
      this.layer.appendChild(e);
      t = { e, anim: e.firstChild, box: e.querySelector('.wb-box'), tl: e.querySelector('.wb-tail'), mode: '', shown: '', flip: false };
      this.list.set(id, t);
    }
    t.pages = pagesOf(text);
    t.page = -1;
    t.born = now;
    // long enough to read every part
    t.until = now + Math.max(ms, t.pages.length * 1800);
    t.pos = pos;
    t.who = pos ? speakerAt(this.game, pos) : null;
    t.ay = null;
    if (t.shown === 'text') t.repop = true;
  }

  clear() {
    for (const t of this.list.values()) t.e.remove();
    this.list.clear();
  }

  // once a frame, after the camera and everyone in the world have moved
  place() {
    if (!this.list.size) return;
    const g = this.game, ui = this.ui, cam = g.camera, now = performance.now();
    const off = !cam || g.mode === 'title' || ui.menuStack.length > 0;
    const W = innerWidth, H = innerHeight, us = scale.us, m = 3 * us;
    const live = [];
    for (const [id, t] of this.list) {
      if (now > t.until) { t.e.remove(); this.list.delete(id); continue; }
      let vis = !off && !!(t.who || t.pos) && (!t.who || (t.who.visible !== false && !t.who.hiddenByStory));
      if (vis) {
        const p = t.who ? headAnchor(t.who, t, _wp) : _wp.copy(t.pos);
        const d = p.distanceTo(cam.position);
        p.y += 0.16;
        p.project(cam);
        vis = p.z < 1 && Math.abs(p.x) < 1.02 && Math.abs(p.y) < 1.05 && d < W_GONE;
        if (vis) { t.d = d; t.sx = (p.x * 0.5 + 0.5) * W; t.sy = (-p.y * 0.5 + 0.5) * H; live.push(t); }
      }
      if (!vis) { t.mode = ''; this.show(t, ''); }
    }
    if (!live.length) return;
    // nearest first: they open (up to W_OPEN), and anyone who would land on top of them
    // (or on the conversation going on) is a cloud
    live.sort((a, b) => a.d - b.d);
    const taken = [];
    const D = ui.bubbles?.active;
    if (D?.wrap?.isConnected) {
      const r = D.wrap.getBoundingClientRect();
      if (r.width) taken.push([r.left, r.top - 16 * scale.u, r.right, r.bottom + 10 * scale.u]);
    }
    const hits = (R) => taken.some((q) => overlaps(R, q));
    let open = 0;
    for (const t of live) {
      // which part of a long line is up
      const n = t.pages.length;
      const pg = Math.min(n - 1, Math.floor(((now - t.born) / (t.until - t.born)) * n));
      if (pg !== t.page) {
        t.page = pg;
        t.lines = t.pages[pg];
        t.cols = Math.max(...t.lines.map((l) => l.length));
        if (pg > 0 && t.shown === 'text') t.repop = true;
      }
      let want = t.d < W_NEAR ? 'text' : t.d > W_FAR ? 'cloud' : t.mode || 'cloud';
      if (want === 'text' && open >= W_OPEN) want = 'cloud';
      const fit = (mode) => {
        if (mode === 'text') { const R = this.textRect(t, W, m, us); return hits(R) ? null : R; }
        const R = this.cloudRect(t, W, m, us);
        const q = taken.find((q) => overlaps(R, q));
        if (!q) return R;
        // crowded: sit just above whatever is in the way (one small step), or keep quiet
        const lift = R[3] - q[1] + us;
        if (lift > (R[3] - R[1]) * 1.25) return null;
        const L = [R[0], R[1] - lift, R[2], R[3] - lift];
        L.x = R.x; L.y = R.y - lift;
        return L[1] < m || hits(L) ? null : L;
      };
      let R = want === 'text' ? fit('text') : null;
      if (!R) { want = 'cloud'; R = fit('cloud'); }
      if (!R) want = '';
      // a change has to hold a moment before it shows (no flicker as people cross)
      if (want !== t.mode && t.mode) {
        if (t.pend !== want) { t.pend = want; t.pendAt = now; }
        if (now - t.pendAt < SETTLE) {
          const keep = t.mode === 'text' ? this.textRect(t, W, m, us) : this.cloudRect(t, W, m, us);
          if (!hits(keep) || !want) { want = t.mode; R = keep; }
        }
      }
      if (want === t.mode) t.pend = null;
      t.mode = want;
      if (!want) { this.show(t, ''); continue; }
      if (want === 'text') open++;
      taken.push([R[0], R[1], R[2], R[3]]);
      this.show(t, want, R);
    }
  }

  // where the open bubble for t goes: [x0, y0, x1, y1] round the box and its tail
  textRect(t, W, m, us) {
    const bw = (t.cols * CH + BOX_X) * us, bh = (t.lines.length * LH + BOX_Y) * us;
    const hang = (TAIL_H - BUBBLE_JOIN) * us; // the tail's tip hangs this far under the box
    const x = Math.max(m, Math.min(W - bw - m, Math.round((t.sx - bw / 2) / us) * us));
    const y = Math.max(m, Math.round((t.sy - hang - bh) / us) * us);
    const R = [x, y, x + bw, y + bh + hang];
    R.x = x; R.y = y; R.w = bw; R.h = bh;
    return R;
  }
  cloudRect(t, W, m, us) {
    const [cw, ch] = CLOUD_ART;
    const x = Math.max(m, Math.min(W - cw * us - m, Math.round((t.sx - CLOUD_TIP * us) / us) * us));
    const y = Math.round((t.sy - (ch - 2) * us) / us) * us;
    const R = [x, y, x + cw * us, y + ch * us];
    R.x = x; R.y = y;
    return R;
  }

  // put t on the page as words, a cloud or nothing (writing only what changed)
  show(t, mode, R) {
    const e = t.e;
    if (mode !== t.shown) {
      const was = t.shown;
      t.shown = mode;
      e.className = mode ? `wbub ${mode === 'cloud' ? 'cloud' : 'open'}` : 'wbub';
      // a cloud popping open into words (or one appearing) bounces in
      if (mode && mode !== was) t.repop = true;
    }
    if (!mode) return;
    const us = scale.us;
    if (mode === 'text') {
      const key = t.lines.join('\n');
      if (t.textKey !== key) {
        t.textKey = key;
        t.box.textContent = key;
        t.box.style.width = `calc(var(--us) * ${t.cols * CH + BOX_X})`;
        t.box.style.height = `calc(var(--us) * ${t.lines.length * LH + BOX_Y})`;
      }
      // the tail's tip right over the head: just off the middle of the bottom edge, or
      // mirrored once the edge of the screen has pushed the bubble aside
      const sx = t.sx - R.x;
      const flip = sx > R.w / 2 + 2 * us;
      let tx = flip ? sx - (TAIL_W - 1.5) * us : sx - 1.5 * us;
      tx = Math.round(Math.max(3 * us, Math.min(R.w - (TAIL_W + 4) * us, tx)) / us) * us;
      if (flip !== t.flip) { t.flip = flip; t.tl.style.backgroundImage = flip ? `url(${tail('round', true)})` : ''; }
      if (tx !== t.tx) { t.tx = tx; t.tl.style.left = `${snap(tx)}px`; }
      if (R.h !== t.th) { t.th = R.h; t.tl.style.top = `${snap(R.h - BUBBLE_JOIN * us)}px`; }
    }
    const x = snap(R.x), y = snap(R.y);
    if (x !== t.x || y !== t.y) { t.x = x; t.y = y; e.style.transform = `translate(${x}px, ${y}px)`; }
    if (t.repop) {
      t.repop = false;
      t.anim.classList.remove('pop');
      void t.anim.offsetWidth;
      t.anim.classList.add('pop');
    }
  }
}
