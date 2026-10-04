// Title screen: a live establishing shot of Maple Cove on an autumn morning, drawn by
// the real world renderer. The camera drifts through three slow shots (Main Street from
// over the sea with the mountains beyond, the pumpkin carving contest at the west end
// of Main Street, the harbour and the boardwalk), dipping to black between them; the
// villagers keep their routines, Hank rides Bessie through town with a crate of cocoa,
// geese and gulls fly over. On top: a hand-made pixel-art logo and the leather-and-
// brass menu, over a soft darkening where they sit (no blur: the scene stays crisp).
import * as THREE from 'three';
import { hasSave } from '../game/state.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';

// The light of an early autumn morning: the low sun comes in off the sea and lights the
// shopfronts, the forest and the snow on the mountains. The villagers keep each shot's
// own hour (`sched`), so the contest can be on while the light stays golden.
const LIGHT_HOUR = 8.35;
const SHOT_LEN = 15;
const FADE_OUT = 0.8;
const FADE_IN = 1.1;
const SHADOW_SIZE = 120; // a wider shadow box for the wide shots (gameplay uses 70)

// Each shot: the camera dollies from -> to, facing the point look (xz) drifting to lookTo;
// hor is where the horizon sits (fraction of the screen from the top; horTall on portrait
// screens), hfov the horizontal field of view (degrees); sched the villagers' hour; ride
// is Hank's path (xz points), speed and metres in at the start; birds cross on cue (s).
const SHOTS = [
  {
    // Main Street from over the sea at its east end: the shops, the rink, the green and
    // the chapel, the forest, the lookout hill and the mountains beyond
    sched: 7.8,
    from: [338, 28, 54.5], to: [324, 25.5, 52.5], look: [214, 49], lookTo: [212, 48.5],
    hor: 0.56, horTall: 0.5, hfov: 64,
    ride: { path: [[150, 52.2], [266, 52.2]], speed: 5.2, start: 18 },
    birds: [{ at: 1.5, geese: { start: [238, -30], dir: [0, 1], alt: 41 } }],
  },
  {
    // the pumpkin carving contest at the west end of Main Street: Hank rides in from
    // Nana's road, down the middle between the carvers' tables, towards the camera
    sched: 10.5,
    from: [160, 5.6, 48.3], to: [164.5, 5.9, 48.7], look: [112, 50.4], lookTo: [112, 50.2],
    hor: 0.53, horTall: 0.52, hfov: 70,
    ride: { path: [[72, 47.2], [92, 49.9], [106, 51], [114, 50.6], [121, 50], [146, 50], [158, 50.6], [196, 51.2]], speed: 5.3, start: 0 },
    birds: [{ at: 3, geese: { start: [64, -40], dir: [0.15, 1], alt: 26 } }],
  },
  {
    // the harbour: boats at the docks, Birdie fishing off the boardwalk, the backs of the
    // houses, the green and the chapel steeple, the ridge and the northern ranges
    sched: 7.8,
    from: [210, 21, 167], to: [197, 23.5, 159], look: [186, 34], lookTo: [180, 30],
    hor: 0.53, horTall: 0.5, hfov: 66,
    ride: { path: [[138, 85.3], [258, 85.3]], speed: 5, start: 25 },
    birds: [{ at: 0.5, gulls: true }, { at: 4, gulls: true }],
  },
];

// a polyline in xz, walked by distance
function makePath(pts) {
  const seg = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, dx: (bx - ax) / l, dz: (bz - az) / l, l, s0: len });
    len += l;
  }
  return { seg, len };
}
function pathAt(P, s, out) {
  s = clamp(s, 0, P.len);
  let q = P.seg[P.seg.length - 1];
  for (const g of P.seg) if (s <= g.s0 + g.l) { q = g; break; }
  const t = s - q.s0;
  out.x = q.ax + q.dx * t;
  out.z = q.az + q.dz * t;
  out.dx = q.dx;
  out.dz = q.dz;
  return out;
}

const INK = '#1e1418';

function pixCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// integer display scale that keeps pixel art square and crisp
export function uiScale(base = 260) {
  return Math.max(1, Math.min(5, Math.floor(Math.min(innerWidth / base, innerHeight / (base * 0.62)))));
}

// ---------------------------------------------------------------- logo
// The title is set in BoldPixels at its native size, then outlined, shaded,
// shadowed and dripped with cocoa pixel by pixel.
function drawLogo() {
  const text = 'DELI-VERY-DEAD';
  const FS = 32;
  const [m, mg] = pixCanvas(512, 64);
  mg.font = `${FS}px BoldPixels, Monogram, monospace`;
  mg.textBaseline = 'top';
  const tw = Math.ceil(mg.measureText(text).width);
  const W = tw + 24, H = FS + 30;
  const [t, tg] = pixCanvas(W, H);
  tg.font = mg.font;
  tg.textBaseline = 'top';
  tg.fillStyle = '#fff';
  tg.fillText(text, 8, 6);
  const src = tg.getImageData(0, 0, W, H).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 110;
  // vertical extent of the glyphs for the gradient
  let y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const [o, g] = pixCanvas(W, H);
  const put = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const near = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r + (r > 1 ? 1 : 0) && on(x + dx, y + dy)) return true;
    return false;
  };
  // deep shadow (offset), then the ink outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near(x - 3, y - 3, 2)) put(x, y, '#5a1420');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near(x, y, 2)) put(x, y, INK);
  // cocoa drips hanging off the bottoms of some strokes
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < W; x++) {
    let bottom = -1;
    for (let y = H - 1; y >= 0; y--) if (on(x, y)) { bottom = y; break; }
    if (bottom < y1 - 1 || rnd() > 0.16) continue;
    const len = 2 + Math.floor(rnd() * 6);
    for (let k = 1; k <= len; k++) {
      put(x, bottom + 2 + k, k === len ? '#3a1a10' : '#5a2e1c');
      put(x - 1, bottom + 2 + k, INK);
      put(x + 1, bottom + 2 + k, INK);
    }
    put(x, bottom + 3 + len, INK);
    put(x, bottom + 3, '#7a4428');
  }
  // fill: cream to pumpkin bands, a bright top lip and a dark bottom lip per stroke
  const bands = ['#fff6e2', '#ffe6b0', '#ffc860', '#f59a32', '#e0701e'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const k = (y - y0) / Math.max(1, y1 - y0);
    let c = bands[Math.min(bands.length - 1, Math.floor(k * bands.length))];
    if (!on(x, y - 1)) c = '#ffffff';
    else if (!on(x, y + 1)) c = '#a8401a';
    else if (!on(x - 1, y)) c = k < 0.5 ? '#fffaf0' : '#ffd070';
    put(x, y, c);
  }
  // little specular glints
  for (let x = 0; x < W; x += 5) for (let y = y0; y < y0 + 3; y++) if (on(x, y) && on(x + 1, y) && on(x, y + 1) && rnd() < 0.3) { put(x + 1, y + 1, '#ffffff'); break; }
  return o;
}

// a steaming mug of cocoa with a bite out of it, to sit beside the logo
function drawMug() {
  const [c, g] = pixCanvas(28, 30);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(3, 11, 17, 17, INK); R(19, 14, 7, 10, INK);
  R(4, 12, 15, 15, '#f2e6cc'); R(4, 12, 15, 2, '#fffaf0'); R(4, 24, 15, 3, '#cdbb98');
  R(20, 15, 5, 8, '#f2e6cc'); R(21, 17, 3, 4, INK);
  R(5, 12, 13, 3, '#6a3a1e'); R(6, 12, 4, 1, '#8a5432'); R(12, 11, 4, 2, '#fffaf0'); R(9, 10, 3, 2, '#fffaf0');
  R(6, 17, 11, 4, '#c8361f'); R(6, 17, 11, 1, '#e8503a');
  R(9, 18, 1, 2, '#f2e6cc'); R(11, 18, 1, 2, '#f2e6cc'); R(13, 18, 1, 2, '#f2e6cc');
  // steam
  for (const [x, y] of [[8, 7], [9, 5], [8, 3], [13, 6], [14, 4], [13, 2], [14, 0]]) R(x, y, 1, 2, '#fffaf0');
  return c;
}

const el = (tag, css = '', html = '') => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.innerHTML = html;
  return e;
};


export class TitleScreen {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.shot = null;
    this.shotI = -1;
    this.shotT = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._p = { x: 0, z: 0, dx: 0, dz: 1 };
    this._q = { x: 0, z: 0, dx: 0, dz: 1 };
  }

  async show({ onContinue, onNew, onSettings, onControls }) {
    const g = this.g;
    // the scene goes up at once (black, fading in) so nothing pops in
    this.stage();
    try { await document.fonts.load('32px BoldPixels'); await document.fonts.load('24px Monogram'); } catch { /* fonts are optional */ }
    const root = el('div', `position:fixed;inset:0;z-index:40;pointer-events:none;font-family:Monogram,monospace;color:#fff4e0;opacity:0;`);
    root.id = 'title3d';
    // a soft darkening behind the logo and the menu so they read over any shot
    this.shadeEl = el('div', 'position:absolute;inset:0;');
    // logo, with a steaming mug of cocoa beside it and the subtitle under it
    this.logo = drawLogo();
    const logoBox = el('div', 'position:absolute;left:50%;');
    const li = el('img', 'position:absolute;left:0;top:0;image-rendering:pixelated;');
    li.src = this.logo.toDataURL();
    const mi = el('img', 'position:absolute;image-rendering:pixelated;');
    mi.src = drawMug().toDataURL();
    const sub = el('div', 'position:absolute;left:0;text-align:center;line-height:1;color:#ffe8c8;', 'a cozy undead cocoa-delivery tale');
    logoBox.append(li, mi, sub);
    Object.assign(this, { logoBox, logoEl: li, mugEl: mi, subEl: sub });
    // menu: the shared leather & brass kit buttons
    const items = [];
    const save = hasSave();
    if (save) items.push({ label: 'Continue', small: `Day ${g.peekSave()?.day ?? 1}`, fn: () => this.close(onContinue) });
    items.push({ label: save ? 'New Game' : 'Start', small: save ? 'starts over' : '', fn: () => this.close(onNew) });
    items.push({ label: 'Settings', fn: () => onSettings?.() });
    items.push({ label: 'Controls', fn: () => onControls?.() });
    const menu = el('div', 'position:absolute;display:flex;flex-direction:column;gap:calc(var(--u) * 3);pointer-events:auto;min-width:calc(var(--u) * 104);');
    menu.className = 'title-menu-k';
    const buttons = items.map((it, i) => {
      const b = g.ui.button(it.label, it.fn, { small: it.small || '' });
      b.addEventListener('pointerenter', () => this.select(i));
      menu.appendChild(b);
      return b;
    });
    this.buttons = buttons;
    this.menuEl = menu;
    const foot = el('div', `position:absolute;right:8px;bottom:6px;font-size:16px;line-height:1;text-align:right;color:#e8d0b0;text-shadow:1px 1px 0 ${INK};`,
      'Autumn in Maple Cove<br>fonts: monogram by datagoblin (CC0) &middot; BoldPixels by YukiPixels (CC BY-SA 4.0)');
    root.append(this.shadeEl, logoBox, menu, foot);
    document.body.appendChild(root);
    this.root = root;
    this.layoutDom();
    this.onResize = () => this.layoutDom();
    addEventListener('resize', this.onResize);
    // hook into the game's menu navigation (arrow keys / pad / confirm)
    const m = { ov: root, items: buttons, sel: 0, onBack: null, title: true };
    this.m = m;
    g.ui.menuStack.push(m);
    this.select(0);
  }

  // wide screens: the menu bottom-left; tall screens: centred under the scene
  layoutDom() {
    if (!this.root) return;
    const W = innerWidth, H = innerHeight, narrow = W < H;
    const logo = this.logo;
    const ls = Math.max(1, Math.min(5, Math.floor(Math.min((W * 0.62) / logo.width, (H * 0.3) / logo.height))));
    this.ls = ls;
    const lw = logo.width * ls, lh = logo.height * ls, bw = lw + 30 * ls;
    Object.assign(this.logoBox.style, { top: `${Math.round(H * 0.05)}px`, width: `${bw}px`, marginLeft: `${-Math.round(bw / 2)}px`, height: `${lh}px` });
    Object.assign(this.logoEl.style, { width: `${lw}px`, height: `${lh}px` });
    Object.assign(this.mugEl.style, { left: `${lw - 2 * ls}px`, top: `${2 * ls}px`, width: `${28 * ls}px`, height: `${30 * ls}px` });
    Object.assign(this.subEl.style, { width: `${lw}px`, top: `${lh - 4 * ls}px`, fontSize: `${16 * ls}px`, textShadow: `${ls}px ${ls}px 0 ${INK}` });
    const ms = this.menuEl.style;
    // centred by its measured width on whole device pixels (a -50% transform blurs the pixel art)
    const dpr = devicePixelRatio || 1;
    if (narrow) Object.assign(ms, { left: `${Math.round(((W - this.menuEl.offsetWidth) / 2) * dpr) / dpr}px`, transform: '', bottom: 'calc(var(--u) * 18)' });
    else Object.assign(ms, { left: `${Math.round(W * 0.07)}px`, transform: '', bottom: `${Math.round(H * 0.1)}px` });
    const ink = (a) => `rgba(24,14,20,${a})`;
    this.shadeEl.style.background = narrow
      ? `linear-gradient(to top, ${ink(0.62)} 0%, ${ink(0.32)} 28%, ${ink(0)} 48%), linear-gradient(to bottom, ${ink(0.34)} 0%, ${ink(0)} 26%)`
      : `radial-gradient(ellipse 50% 66% at 0% 100%, ${ink(0.56)} 0%, ${ink(0.26)} 55%, ${ink(0)} 100%), linear-gradient(to top, ${ink(0.38)} 0%, ${ink(0)} 30%), linear-gradient(to bottom, ${ink(0.3)} 0%, ${ink(0)} 28%)`;
  }

  select(i) {
    if (!this.buttons || !this.m) return;
    this.m.sel = i;
    this.g.ui.highlight(this.m);
    this.selI = i;
  }

  // Set the world up for the title: golden morning light, a friendly village, Hank on
  // Bessie with a crate of cocoa, and the first shot. (restore() puts it all back.)
  stage() {
    const g = this.g;
    if (this.staged) return;
    this.staged = true;
    const W = g.world, A = W.atmosphere;
    A.lightHour = LIGHT_HOUR;
    A.setWeather('breezy', true);
    // everyone already knows Hank (a save or a new game sets the real feelings when the title closes)
    const st = g.state;
    st.flags.village1 = true;
    st.flags.contestScream = true;
    st.npc = { _day: st.day, _base: 70 };
    // no speech bubbles or voices over the title
    g.villagers.bubble = () => {};
    const sc = W.sun?.shadow?.camera;
    if (sc) {
      this.shadowWas = sc.right;
      sc.left = sc.bottom = -SHADOW_SIZE;
      sc.right = sc.top = SHADOW_SIZE;
      sc.updateProjectionMatrix();
    }
    g.setBikeVisible(true);
    g.rider.visible = true;
    g.orders.list = ['classic', 'maple', 'pumpkin'].map((cocoa, i) => ({ id: 9000 + i, customer: 'title', spot: 'title', cocoa, state: 'carried', loaded: true, quality: 100 }));
    g.cargo?.sync();
    g.pipeline.post.uFade.value = 1;
    this.shotI = -1;
    this.next(true);
  }

  next(first = false) {
    const g = this.g;
    this.shotI = (this.shotI + 1) % SHOTS.length;
    const S = (this.shot = SHOTS[this.shotI]);
    this.shotT = 0;
    this.first = first;
    this.birdsFired = 0;
    // the villagers jump to this shot's hour of their day (hidden by the dip to black)
    const A = g.world.atmosphere;
    if (first || A.hour !== S.sched) {
      A.hour = S.sched;
      g.villagers.syncState();
    }
    this.path = makePath(S.ride.path);
    this.rideS = S.ride.start;
    this.ride(0);
    this.frame(0, true);
  }

  // Hank pedals Bessie along the shot's path (placed directly: no physics, no controls)
  ride(dt) {
    const g = this.g, b = g.bike, P = this.path;
    if (!P) return;
    const v = this.rideS < P.len ? this.shot.ride.speed : 0;
    this.rideS = Math.min(P.len, this.rideS + v * dt);
    const p = pathAt(P, this.rideS, this._p);
    // head for a point a little ahead, so corners come out round
    const q = pathAt(P, this.rideS + 3.5, this._q);
    let hx = q.x - p.x, hz = q.z - p.z;
    if (hx * hx + hz * hz < 1e-6) { hx = p.dx; hz = p.dz; }
    const yaw = Math.atan2(hx, hz);
    const fresh = dt <= 0;
    const turn = fresh ? 0 : wrapAngle(yaw - b.yaw) / dt;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ph = g.physics;
    const y = ph.groundAt(p.x, p.z).h;
    const hF = ph.groundAt(p.x + fx * 0.46, p.z + fz * 0.46).h, hB = ph.groundAt(p.x - fx * 0.46, p.z - fz * 0.46).h;
    b.pos.set(p.x, y, p.z);
    b.yaw = yaw;
    b.vel.set(fx * v, 0, fz * v);
    b.speed = b.fwdSpeed = v;
    b.grounded = true;
    b.crash = 0;
    b.throttleIn = v > 0 ? 1 : 0;
    b.brakeIn = 0;
    b.yawRate = turn;
    b.cadence = v > 0 ? 0.72 : 0; // an easy Sunday-morning pedal
    b.crank += b.cadence * 9.5 * dt;
    b.wheelAngle += (v / 0.34) * dt;
    b.slopePitch = Math.atan2(hF - hB, 0.92);
    b.pitch = fresh ? b.slopePitch : damp(b.pitch, b.slopePitch, 12, dt);
    b.lean = fresh ? 0 : damp(b.lean, clamp(Math.atan((-turn * v) / 9.8) * 1.15, -0.45, 0.45), 6, dt);
    b.wheelie = b.stoppie = 0;
    // draw Bessie where she is now (the game posed her before the title moved her)
    b.lerpView(1);
    g.bikeModel.update(0, b, 0);
  }

  // the slow dolly, framed so the horizon sits where the shot wants it on any screen shape
  frame(dt, snap = false) {
    const g = this.g, S = this.shot, cam = g.camera;
    const k = smoothstep(0, SHOT_LEN, this.shotT);
    const pos = this._pos.set(lerp(S.from[0], S.to[0], k), lerp(S.from[1], S.to[1], k), lerp(S.from[2], S.to[2], k));
    pos.x += Math.sin(this.t * 0.31) * 0.22;
    pos.y += Math.sin(this.t * 0.23 + 1) * 0.12;
    const lx = lerp(S.look[0], S.lookTo[0], k), lz = lerp(S.look[1], S.lookTo[1], k);
    const aspect = cam.aspect || innerWidth / innerHeight;
    const tall = aspect < 1;
    const vfov = clamp(2 * Math.atan(Math.tan((S.hfov * Math.PI) / 360) / aspect), 0.5, tall ? 1.25 : 1.05);
    const pitch = Math.atan((2 * (tall ? S.horTall : S.hor) - 1) * Math.tan(vfov / 2));
    let dx = lx - pos.x, dz = lz - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const c = Math.cos(pitch) * 60;
    const look = this._look.set(pos.x + dx * c, pos.y + Math.sin(pitch) * 60, pos.z + dz * c);
    const C = g.chase, fov = (vfov * 180) / Math.PI;
    if (snap || C.mode !== 'shot') C.cut(pos, look, fov);
    else {
      C.pos.copy(pos);
      C.look.copy(look);
      C.fov = fov;
    }
    C.apply(dt);
  }

  spawnBirds(b) {
    const C = this.g.critters;
    if (!C) return;
    try {
      if (b.geese) {
        const [dx, dz] = b.geese.dir, l = Math.hypot(dx, dz);
        C.spawnGeese({ start: { x: b.geese.start[0], z: b.geese.start[1] }, dir: { x: dx / l, z: dz / l }, alt: b.geese.alt });
      }
      if (b.gulls) C.spawnGulls();
    } catch (e) {
      console.warn('title birds', e);
    }
  }

  update(dt) {
    const S = this.shot;
    if (!S) return;
    const g = this.g;
    this.t += dt;
    this.shotT += dt;
    if (this.shotT >= SHOT_LEN) this.next();
    const T = this.shotT;
    // dip to black between shots (the first one fades in from the loading screen more slowly)
    const fin = this.first ? 1.8 : FADE_IN;
    g.pipeline.post.uFade.value = T < fin ? 1 - smoothstep(0, fin, T) : smoothstep(SHOT_LEN - FADE_OUT, SHOT_LEN, T);
    this.ride(dt);
    const birds = this.shot.birds || [];
    while (this.birdsFired < birds.length && T >= birds[this.birdsFired].at) this.spawnBirds(birds[this.birdsFired++]);
    this.frame(dt);
    if (!this.root) return;
    if (this.t < 2) this.root.style.opacity = String(clamp((this.t - 0.4) / 0.9, 0, 1));
    else if (this.root.style.opacity !== '1') this.root.style.opacity = '1';
    // the mug's steam bobs in pixel steps
    if (this.mugEl) this.mugEl.style.transform = `translateY(${-Math.round((Math.sin(this.t * 2.4) + 1) * 1) * this.ls}px)`;
  }

  close(fn) {
    const g = this.g;
    if (!this.root) return;
    g.ui.menuStack = g.ui.menuStack.filter((x) => x !== this.m);
    const r = this.root;
    this.root = null;
    removeEventListener('resize', this.onResize);
    r.style.transition = 'opacity 0.5s';
    r.style.opacity = '0';
    setTimeout(() => r.remove(), 550);
    this.restore();
    fn?.();
  }

  // hand the world back to the game the way the title found it
  restore() {
    const g = this.g, W = g.world;
    this.shot = null;
    this.path = null;
    W.atmosphere.lightHour = null;
    const sc = W.sun?.shadow?.camera;
    if (sc && this.shadowWas) {
      sc.left = sc.bottom = -this.shadowWas;
      sc.right = sc.top = this.shadowWas;
      sc.updateProjectionMatrix();
    }
    delete g.villagers.bubble;
    g.orders.list = [];
    g.cargo?.sync();
    g.parkBike();
    g.pipeline.post.uFade.value = 0;
  }
}
