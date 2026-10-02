// Black & white pixel-art speech bubbles that float over the real 3D speaker,
// with emotion-shaped outlines (shouts are spiky, fear is wobbly, thoughts are
// clouds), little animated mood marks, per-letter text effects and reply
// bubbles for choices. Narration appears on a torn paper strip.
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';

const INK = '#1e1418';
const WHITE = '#fffaf0';
const SHADE = '#cfc6b8';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ---------------------------------------------------------------- pixel frame art (9-slice)
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(px, g);
  return c.toDataURL();
}

// 24x24 frames with an 8px slice; the middle tiles
const FRAMES = {};
function frame(style) {
  if (FRAMES[style]) return FRAMES[style];
  const S = 24;
  const url = canvas(S, S, (px) => {
    const inside = (x, y) => {
      // shape mask per style (x,y in 0..S-1), returns 0 outside, 1 fill
      const e = 2; // margin for spikes / shadow
      const cx = Math.min(x - e, S - 1 - e - x), cy = Math.min(y - e, S - 2 - e - y);
      if (style === 'shout') {
        // jagged spikes every 4px along the edges
        const sx = (x % 4 < 2 ? x % 4 : 4 - (x % 4)), sy = (y % 4 < 2 ? y % 4 : 4 - (y % 4));
        return cx >= -e + sy && cy >= -e + sx && !(cx < 1 && cy < 1);
      }
      if (style === 'think') {
        const bx = ((x + 2) % 6) - 3, by = ((y + 2) % 6) - 3;
        const bump = 1.5 - Math.sqrt(bx * bx + by * by) * 0.5;
        return cx >= 1 - Math.max(0, bump) && cy >= 1 - Math.max(0, bump) && cx + cy >= 3;
      }
      if (style === 'shaky') {
        const wy = Math.round(Math.sin(x * 0.9) * 0.8), wx = Math.round(Math.sin(y * 0.9) * 0.8);
        return cx >= 1 + wx && cy >= 1 + wy && cx + cy >= 3;
      }
      // rounded
      return cx >= 0 && cy >= 0 && !(cx + cy < 3);
    };
    // drop shadow
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x - 1, y - 1) && !inside(x, y)) px(x, y, INK);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        if (style === 'whisper' && (x + y) % 3 === 0) px(x, y, WHITE);
        else px(x, y, INK);
      } else px(x, y, !inside(x, y + 2) ? SHADE : WHITE);
    }
  });
  return (FRAMES[style] = url);
}

// little tails pointing down at the speaker
function tail(style) {
  const key = 'tail:' + style;
  if (FRAMES[key]) return FRAMES[key];
  const W = 14, H = 12;
  const url = canvas(W, H, (px) => {
    if (style === 'think') {
      const dots = [[7, 2, 2.6], [5, 7, 1.8], [4, 10, 1.1]];
      for (const [cx, cy, r] of dots) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) px(x, y, d > r - 1 ? INK : WHITE);
      }
      return;
    }
    // a hooked tail; shouts get a zig-zag lightning tail
    for (let y = 0; y < H; y++) {
      let l, r;
      if (style === 'shout') { const z = y % 4 < 2 ? 0 : 2; l = 3 + Math.floor(y * 0.25) + z; r = 10 - Math.floor(y * 0.6) + z - 1; }
      else { l = 3 + Math.floor(y * 0.15); r = 11 - Math.floor(y * 0.85); }
      if (r < l) { if (y < H) px(l, y, INK); continue; }
      for (let x = l; x <= r; x++) px(x, y, x === l || x === r || y === H - 1 ? INK : WHITE);
      px(r + 1, y, INK); // shadow side
    }
  });
  return (FRAMES[key] = url);
}

// tiny mood marks (16x16) that pop around the bubble
const MARKS = {};
function mark(name) {
  if (MARKS[name]) return MARKS[name];
  const url = canvas(16, 16, (px) => {
    const P = (rows, ox = 0, oy = 0) => rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' ? px(x + ox, y + oy, INK) : ch === 'o' ? px(x + ox, y + oy, WHITE) : 0));
    switch (name) {
      case 'anger': P(['..##...##..', '.#oo#.#oo#.', '#ooo#.#ooo#', '#oo#...#oo#', '.##.....##.', '...........', '.##.....##.', '#oo#...#oo#', '#ooo#.#ooo#', '.#oo#.#oo#.', '..##...##..'], 2, 2); break;
      case 'bang': P(['.###.', '#ooo#', '#ooo#', '#ooo#', '.#o#.', '.#o#.', '.#o#.', '..#..', '.....', '.###.', '#ooo#', '.###.'], 5, 1); break;
      case 'sweat': P(['....#....', '...#o#...', '..#ooo#..', '.#oooo#..', '#oooooo#.', '#oo#ooo#.', '#ooo#oo#.', '.#oooo#..', '..####...'], 3, 3); break;
      case 'heart': P(['.##...##.', '#oo#.#oo#', '#ooo#ooo#', '#ooooooo#', '.#ooooo#.', '..#ooo#..', '...#o#...', '....#....'], 3, 4); break;
      case 'note': P(['....####', '....#oo#', '....#..#', '....#..#', '....#..#', '.###..##', '#ooo#.##', '#ooo#...', '.###....'], 4, 3); break;
      case 'sparkle': P(['...#...', '...#...', '..#o#..', '##ooo##', '..#o#..', '...#...', '...#...'], 4, 4); break;
      case 'question': P(['.####.', '#oooo#', '#o##o#', '...#o#', '..#o#.', '..#o#.', '...#..', '......', '..##..', '..##..'], 5, 3); break;
      case 'zzz': P(['#####', '...#.', '..#..', '.#...', '#####', '.....', '..####', '....#.', '...#..', '..####'], 4, 3); break;
      case 'tear': P(['..#..', '.#o#.', '#ooo#', '#ooo#', '.###.'], 6, 6); break;
      case 'shock': P(['#.....#', '.#...#.', '.......', '##...##', '.......', '.#...#.', '#.....#'], 4, 4); break;
      case 'ha': P(['#..#..##..', '#..#.#..#.', '####.####.', '#..#.#..#.', '#..#.#..#.'], 3, 5); break;
      default: break;
    }
  });
  return (MARKS[name] = url);
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
    case 'determined': case 'smug': return { style: 'round', marks: [], anim: 'pop' };
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

export class Bubbles {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.layer = el('div', 'bubble-layer');
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
    const speaker = this.findSpeaker(who, opts);
    const mood = moodOf(opts.expr);
    const b = el('div', `bubble b-${mood.style} anim-${mood.anim}`);
    b.style.borderImageSource = `url(${frame(mood.style)})`;
    const tl = el('div', 'b-tail');
    tl.style.backgroundImage = `url(${tail(mood.style)})`;
    const nameEl = name ? el('div', 'b-name', name) : null;
    const txt = el('div', 'b-text');
    const next = el('div', 'b-next');
    b.appendChild(txt);
    b.appendChild(next);
    if (nameEl) b.appendChild(nameEl);
    const marks = mood.marks.map((m, i) => {
      const e = el('div', `b-mark m${i}`);
      e.style.backgroundImage = `url(${mark(m)})`;
      b.appendChild(e);
      return e;
    });
    const wrap = el('div', 'bubble-wrap');
    wrap.appendChild(b);
    wrap.appendChild(tl);
    this.layer.appendChild(wrap);
    if (speaker && opts.expr) speaker.tempExpr?.(opts.expr, 30);
    const parts = tokenize(text);
    const self = this;
    return new Promise((resolve) => {
      let i = 0, acc = 0, done = false, sel = 0;
      const speed = opts.speed ?? 40;
      const items = [];
      const A = (this.active = { wrap, b, tl, speaker, resolve: null, choiceEls: items });
      let word = null;
      const addChar = (p) => {
        if (p.ch === ' ' || p.ch === '\n') {
          txt.appendChild(p.ch === ' ' ? document.createTextNode(' ') : document.createElement('br'));
          word = null;
          return;
        }
        if (!word) { word = el('span', 'tword'); txt.appendChild(word); }
        const sp = el('span', `${p.b ? 'tb' : ''}${p.w ? ' tw' : ''}${p.s ? ' ts' : ''}${p.sm ? ' tsm' : ''}`, p.ch.replace('<', '&lt;'));
        if (p.w || p.s) sp.style.animationDelay = `${(i % 12) * -0.06}s`;
        word.appendChild(sp);
      };
      const finish = () => {
        while (i < parts.length) addChar(parts[i++]);
        done = true;
        if (speaker) speaker.talking = 0;
        if (opts.choices) this.showChoices(opts.choices, items, (k) => { sel = k; close(); }, (k) => setSel(k));
        else next.classList.add('on');
      };
      const setSel = (k) => {
        sel = (k + items.length) % items.length;
        items.forEach((e, j) => e.classList.toggle('sel', j === sel));
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
      e.style.borderImageSource = `url(${frame('round')})`;
      e.innerHTML = `<span class="hand"></span>${c}`;
      e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); pick(k); });
      e.addEventListener('pointerenter', () => hover(k));
      e.style.animationDelay = `${k * 0.07}s`;
      box.appendChild(e);
      items.push(e);
    });
    this.layer.appendChild(box);
    this.active.replies = box;
    this.active.replySpeaker = this.findSpeaker('hank', {});
  }

  // narration: a torn strip of paper with handwriting-ish text
  narrate(text, opts) {
    this.clear();
    const p = el('div', 'narr-paper');
    const txt = el('div', 'n-text');
    const next = el('div', 'b-next');
    p.appendChild(txt);
    p.appendChild(next);
    this.layer.appendChild(p);
    const parts = tokenize(text);
    return new Promise((resolve) => {
      let i = 0, acc = 0, done = false;
      this.active = { wrap: p, narr: true };
      let word = null;
      const add = (q) => {
        if (q.ch === ' ') { txt.appendChild(document.createTextNode(' ')); word = null; return; }
        if (!word) { word = el('span', 'tword'); txt.appendChild(word); }
        word.appendChild(el('span', `${q.b ? 'tb' : ''}${q.w ? ' tw' : ''}${q.s ? ' ts' : ''}`, q.ch));
      };
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

  // keep the bubble above the speaker's real head on screen
  place(A) {
    if (!A || A.narr) return;
    const cam = this.game.camera;
    const W = innerWidth, H = innerHeight;
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
    const m = 12;
    const tailH = A.tl.offsetHeight || 30;
    let bx = sx - bw * 0.42;
    let by = sy - bh - tailH + 6;
    bx = Math.max(m, Math.min(W - bw - m, bx));
    by = Math.max(m, Math.min(H - bh - tailH - m, by));
    A.wrap.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
    const tx = Math.max(14, Math.min(bw - 50, sx - bx - 14));
    A.tl.style.left = `${Math.round(tx)}px`;
    A.tl.style.top = `${Math.round(bh - 6)}px`;
    A.tl.style.display = onScreen ? '' : 'none';
    if (A.replies) {
      // reply bubbles stack near Hank (or bottom right)
      let rx = W - A.replies.offsetWidth - 24, ry = H - A.replies.offsetHeight - 24;
      const h = A.replySpeaker;
      if (h?.headWorld && h !== A.speaker) {
        const v = h.headWorld().project(cam);
        if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) {
          rx = (v.x * 0.5 + 0.5) * W + 30;
          ry = (-v.y * 0.5 + 0.5) * H - A.replies.offsetHeight * 0.3;
        }
      }
      rx = Math.max(m, Math.min(W - A.replies.offsetWidth - m, rx));
      ry = Math.max(by + bh + tailH + 6, Math.min(H - A.replies.offsetHeight - m, ry));
      if (ry + A.replies.offsetHeight > H - m) ry = H - A.replies.offsetHeight - m;
      A.replies.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
    }
  }
}
