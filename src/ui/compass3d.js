// Harold's brass pocket compass, in 3D. It does not point north: it points wherever
// Hank needs to go next (game.compassMarkers()), its card turning with the real
// compass points underneath.
//
// In the screen corner it lies as if strapped to Bessie's handlebars: the case tilts
// into Hank's turns and jolts over bumps, and the needle swings on a lightly damped
// spring, overshooting and settling, lagging when he turns. Tap it (or click) and the
// camera goes into Hank's skull: he holds it up in his bony right hand, big in the
// view with the world behind it, and the name of where it is pointing is inked on a
// little paper tag tied to its bow. Drag to look about; Esc / the X puts it away.
import * as THREE from 'three';
import { cfont, fontsReady, fontsOK } from './type.js';
import { BonyHand } from './hands3d.js';
import { el, onScale } from './kit.js';
import { iconSmallURL, glyphURL } from '../art/icons.js';
import { CUSTOMERS } from '../world/layout.js';
import { CHARACTERS } from '../art/characters.js';
import { input } from '../core/input.js';
import { ease } from './view3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const _d = new THREE.Vector3();

// ---------------------------------------------------------------- the dial card
function cardTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  paintCard(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // the letters again once the pixel font is in
  fontsReady().then(() => { paintCard(c); t.needsUpdate = true; });
  return t;
}
function paintCard(c) {
  const S = c.width;
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  const R = S / 2;
  g.translate(R, R);
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, R);
  gr.addColorStop(0, '#fbf3dc');
  gr.addColorStop(0.85, '#efe0bc');
  gr.addColorStop(1, '#c8b088');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  // degree ticks
  g.strokeStyle = '#3a2418';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, big = i % 18 === 0, mid = i % 6 === 0;
    const r0 = R * (big ? 0.78 : mid ? 0.84 : 0.88), r1 = R * 0.95;
    g.lineWidth = big ? 5 : mid ? 3 : 2;
    g.beginPath();
    g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
    g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    g.stroke();
  }
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, R * 0.95, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, R * 0.74, 0, Math.PI * 2); g.stroke();
  // the rose: eight points, navy and cream, the north one red
  const point = (a, len, w, col, col2) => {
    g.save();
    g.rotate(a);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, -len); g.lineTo(w, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.fillStyle = col2;
    g.beginPath(); g.moveTo(0, -len); g.lineTo(-w, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.restore();
  };
  for (let i = 0; i < 4; i++) point(Math.PI / 4 + (i * Math.PI) / 2, R * 0.42, R * 0.07, '#7a8aa8', '#c8d0de');
  for (let i = 0; i < 4; i++) point((i * Math.PI) / 2, R * 0.66, R * 0.1, i === 0 ? '#a8241a' : '#22305a', i === 0 ? '#e0483a' : '#4a5a8a');
  g.fillStyle = '#c89a3a';
  g.beginPath(); g.arc(0, 0, R * 0.05, 0, Math.PI * 2); g.fill();
  // the letters
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = cfont(R * 0.2, true);
  ['N', 'E', 'S', 'W'].forEach((t, i) => {
    const a = (i * Math.PI) / 2;
    g.fillStyle = i === 0 ? '#a8241a' : '#2a1a14';
    g.fillText(t, Math.sin(a) * R * 0.62 * 1.25, -Math.cos(a) * R * 0.62 * 1.25 + 2);
  });
}

// the paper tag: the place's name in Nana's ink, the distance in pencil
function tagCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  return c;
}
function drawTag(c, name, sub) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  // a luggage tag: clipped corners, a reinforced hole on the left
  g.fillStyle = '#efe2c0';
  g.beginPath();
  g.moveTo(56, 12); g.lineTo(500, 12); g.lineTo(500, 244); g.lineTo(56, 244); g.lineTo(12, 196); g.lineTo(12, 60); g.closePath();
  g.fill();
  g.strokeStyle = '#b8a07a';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#c8a050';
  g.beginPath(); g.arc(52, 128, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a2a20';
  g.beginPath(); g.arc(52, 128, 10, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  // whole-pixel pixel fonts at a whole multiple of their size
  let px = 66;
  g.font = cfont(px, true);
  while (g.measureText(name).width > 412 && px > 33) { px -= 11; g.font = cfont(px, true); }
  g.fillStyle = '#7a1a10';
  g.fillText(name, 88, sub ? 96 : 128);
  if (sub) {
    g.font = cfont(55);
    g.fillStyle = '#4a4a5a';
    g.fillText(sub, 88, 176);
  }
}

// what's at a compass marker, in words
const SHORT = { birdie: 'Birdie', ingrid: 'Dr. Ingrid', doug: 'Doug', lou: 'Big Lou', ollie: 'Ollie', marie: 'Marie', grandma: 'Nana', pip: 'Pip & Pop', gus: 'Gus', agnes: 'Agnes', mo: 'Mo' };
function markName(g, m) {
  if (!m) return '';
  if (m.name) return m.name;
  if (m.id === 'home') return "Nana's cabin";
  if (m.id === 'shop') return 'Moose & Goose';
  if (m.id === 'ks') return "Harold's keepsake";
  if (m.id === 'cocoaRound') return 'Cocoa for the crowd';
  if (m.id[0] === 'o') {
    const o = g.orders?.list?.find((x) => `o${x.id}` === m.id);
    if (o) return `Cocoa for ${SHORT[o.customer] || CHARACTERS[o.customer]?.name?.split(' ')[0] || CUSTOMERS[o.spot]?.name || o.customer}`;
  }
  if (m.icon === 'cat') return 'A lost cat';
  return 'Something to find';
}
const fmtD = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);

// ---------------------------------------------------------------- the compass itself
function buildCompass({ tag = false } = {}) {
  const root = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a048, roughness: 0.28, metalness: 0.9 });
  const brassD = new THREE.MeshStandardMaterial({ color: 0x9a6a28, roughness: 0.4, metalness: 0.85 });
  // the case: a turned brass body with a raised bezel
  const prof = [[0.0001, 0], [0.024, 0], [0.0275, 0.0015], [0.0288, 0.004], [0.0288, 0.0085], [0.0282, 0.0108], [0.027, 0.0118], [0.0252, 0.0116], [0.0247, 0.0085], [0.0001, 0.0085]];
  const caseM = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48), brass);
  root.add(caseM);
  // the dial card turns with true north
  const card = new THREE.Mesh(new THREE.CircleGeometry(0.0246, 48), new THREE.MeshStandardMaterial({ map: cardTexture(), roughness: 0.75 }));
  card.rotation.x = -Math.PI / 2;
  const cardG = new THREE.Group();
  cardG.position.y = 0.0087;
  cardG.add(card);
  root.add(cardG);
  // the needle: red-lacquered pointer, blued-steel tail, a brass cap on the pivot
  const needle = new THREE.Group();
  needle.position.y = 0.0098;
  const half = (len, w, col) => {
    const s = new THREE.Shape();
    s.moveTo(0, -len); s.lineTo(w, 0); s.lineTo(0, w * 0.6); s.lineTo(-w, 0); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0007, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.3 }));
  };
  const nN = half(0.021, 0.0028, 0xc8281c);
  nN.rotation.y = 0; // points along -z
  const nS = half(0.014, 0.0026, 0x2a3a5a);
  nS.rotation.y = Math.PI;
  needle.add(nN, nS);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 8), brass);
  cap.position.y = 0.0006;
  needle.add(cap);
  root.add(needle);
  // the glass: barely there, but it catches the light
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0252, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, envMapIntensity: 2.2, depthWrite: false }));
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.0114;
  root.add(glass);
  // the crown and the bow at twelve o'clock
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.006, 14), brassD);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.006, -0.0308);
  root.add(crown);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0013, 8, 24), brass);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.006, -0.039);
  root.add(bow);
  const out = { root, cardG, needle };
  if (tag) {
    // a paper tag on a string looped through the bow, hanging off to the left
    const c = tagCanvas();
    drawTag(c, '', '');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    const tagG = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.032), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
    // the hole at the tag's left end hangs from the string
    paper.position.set(0.0263, -0.0005, 0);
    tagG.add(paper);
    root.add(tagG);
    const str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.004, 0.006, -0.043), new THREE.Vector3(-0.02, 0.01, -0.05), new THREE.Vector3(-0.042, 0.014, -0.052), new THREE.Vector3(-0.066, 0.016, -0.05)]), 16, 0.0005, 5), new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.9 }));
    root.add(str);
    tagG.position.set(-0.066, 0.016, -0.05);
    Object.assign(out, { tagG, tagCanvas: c, tagTex: t });
  }
  return out;
}

// the compass held up in his bony right hand (the tag on its string), for first person
export function heldCompass() {
  const H = buildCompass({ tag: true });
  const root = new THREE.Group();
  root.add(H.root);
  const hand = new BonyHand();
  // lying in his palm: the wrist off to the right, the fingers curled up round the left
  // of the case, the thumb resting on the bezel by the bow
  hand.pose({ curl: [[0.15, 1.45, 0.9], [0.1, 1.5, 0.9], [0.15, 1.5, 0.9], [0.25, 1.4, 0.8]], spread: -0.3, thumb: [0.2, -0.3, -0.35, 0.3, 0.2], wrist: [0.6, -0.5] });
  hand.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
  hand.root.position.set(0.084, -0.016, 0.004);
  H.root.add(hand.root);
  return { H, root, hand };
}
export { buildCompass, drawTag };

export class Compass3D {
  constructor(view, game) {
    this.view = view;
    this.g = game;
    // needle physics: a world bearing with its own spin (it swings, overshoots, settles)
    this.a = 0;
    this.v = 0;
    this.heading = 0;
    this.yawRate = 0;
    this.tilt = { r: 0, p: 0, vr: 0, vp: 0 };
    this.prevVy = 0;
    this.goal = null;
    this.time = 0;
    // the corner one
    const C = buildCompass();
    this.c = C;
    this.cornerRoot = new THREE.Group();
    this.cornerRoot.add(C.root);
    view.corner.add(this.cornerRoot);
    this.cornerRoot.visible = false;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 2);
    cam.position.set(0, 0.105, 0.088);
    cam.lookAt(0, 0.002, -0.004);
    this.widget = { root: this.cornerRoot, cam, box: () => this.box(), visible: () => this.cornerOn(), update: () => {} };
    view.widgets.push(this.widget);
    // the held one, with the hand and the tag
    const { H, root, hand } = heldCompass();
    this.h = H;
    this.heldRoot = root;
    this.hand = hand;
    view.scene.add(this.heldRoot);
    this.heldRoot.visible = false;
    this.held = { root: this.heldRoot, visible: () => this.fpK > 0.001, update: () => {} };
    view.held.push(this.held);
    this.fpOpen = false;
    this.fpK = 0;
    this.yawOff = 0;
    this.tagKey = '';
    this.buildDom();
  }

  // ---------------------------------------------------------------- DOM: the tap target and the little label
  buildDom() {
    const ui = this.g.ui;
    const hit = (this.hitEl = el('button', 'cmp-hit hide'));
    hit.setAttribute('aria-label', 'Compass');
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.cornerOn()) this.openFP();
    });
    ui.root.appendChild(hit);
    this.label = el('div', 'k-plate k-dark cmp-lbl off');
    ui.root.appendChild(this.label);
    // the first-person view's own little bar: what to do, and an X
    this.fpEl = el('div', 'cmp-fp', '<div class="k-plate k-dark cmp-fp-hint"><span class="k-key">Esc</span><span>put it away</span><span class="sep"></span><span>drag to look about</span></div>');
    const x = el('button', 'k-close cmp-fp-x');
    x.addEventListener('click', () => this.closeFP());
    this.fpEl.appendChild(x);
    this.fpClose = x;
    let drag = null;
    this.fpEl.addEventListener('pointerdown', (e) => {
      if (e.target === x) return;
      drag = { id: e.pointerId, x: e.clientX };
      this.fpEl.setPointerCapture?.(e.pointerId);
    });
    this.fpEl.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      this.yawOff -= ((e.clientX - drag.x) / Math.max(320, innerWidth)) * 3.2;
      drag.x = e.clientX;
    });
    const up = () => (drag = null);
    this.fpEl.addEventListener('pointerup', up);
    this.fpEl.addEventListener('pointercancel', up);
    ui.root.appendChild(this.fpEl);
    this._box = null;
    onScale(() => (this._box = null));
    window.addEventListener('resize', () => (this._box = null));
  }
  box() {
    if (!this._box) {
      const r = this.hitEl.getBoundingClientRect();
      this._box = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return this._box;
  }
  cornerOn() {
    const g = this.g, ui = g.ui;
    return !!this.goal && g.mode === 'ride' && !ui.menuStack.length && !ui.dialogueTick && !ui.hud?.classList.contains('hidden') && !g.interior?.active && !this.fpOpen && this.fpK < 0.05;
  }

  // ---------------------------------------------------------------- where to
  // the nearest marker (same rule the paper compass used: home alone, early in the day
  // with nothing to fetch there, is no goal)
  pick() {
    const g = this.g;
    let marks = [];
    try { marks = g.compassMarkers ? g.compassMarkers() : []; } catch { marks = []; }
    const p = g.playerPos;
    let best = null;
    for (const m of marks) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (!best || d < best.d) best = { ...m, d };
    }
    const goal = !!best && (marks.some((m) => m.id !== 'home') || g.world.atmosphere.hour >= 17 || (g.orders?.board?.().length || 0) > 0);
    return goal ? best : null;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    if (!g.state || !g.bike || g.mode === 'title') return;
    this.time += dt;
    this.goal = this.pick();
    const cam = g.camera;
    cam.getWorldDirection(_d);
    // heading of the eye, north (-z) = 0, clockwise
    const h = Math.atan2(_d.x, -_d.z);
    const dh = wrap(h - this.heading);
    this.heading = h;
    if (dt > 0) this.yawRate += (clamp(dh / dt, -6, 6) - this.yawRate) * (1 - Math.exp(-dt * 8));
    // the needle wants the goal's bearing; with none it drifts round to north
    const p = g.playerPos;
    const want = this.goal ? Math.atan2(this.goal.x - p.x, -(this.goal.z - p.z)) : Math.sin(this.time * 0.4) * 0.6;
    // jolts: bumps and landings knock it about
    const vy = g.onFoot ? 0 : g.bike.vel?.y || 0;
    const jolt = dt > 0 ? Math.abs(vy - this.prevVy) / dt : 0;
    this.prevVy = vy;
    if (jolt > 9) this.v += (Math.random() - 0.5) * Math.min(14, jolt * 0.35);
    const step = Math.min(dt, 1 / 30);
    for (let t = 0; t < dt - 1e-6; t += step) {
      const s = Math.min(step, dt - t);
      this.v += (wrap(want - this.a) * 30 - this.v * 2.6) * s;
      this.a = wrap(this.a + this.v * s);
    }
    // the case leans into turns and nods with the bike
    const T = this.tilt;
    const roll = clamp(this.yawRate * 0.11, -0.35, 0.35) + (g.onFoot ? 0 : (g.bike.lean || 0) * 0.25);
    const pitch = clamp((g.bike.speed || 0) * 0.006, 0, 0.08) + clamp(jolt * 0.004, 0, 0.12);
    T.vr += ((roll - T.r) * 60 - T.vr * 9) * dt;
    T.vp += ((pitch - T.p) * 70 - T.vp * 8) * dt;
    T.r += T.vr * dt;
    T.p += T.vp * dt;
    this.place(this.c, h);
    this.c.root.rotation.set(T.p, 0, -T.r);
    this.updateLabel(dt);
    this.updateFP(dt, h);
    // (the tap target only while the compass is there to tap)
    const on = this.cornerOn();
    if (this.hitEl.classList.contains('hide') === on) this.hitEl.classList.toggle('hide', !on);
  }
  // the needle and the card, relative to the case (which faces the way Hank looks)
  place(C, h) {
    C.needle.rotation.y = -wrap(this.a - h);
    C.cardG.rotation.y = h;
  }
  // a small pencilled distance under the corner compass, now and then
  updateLabel(dt) {
    const g = this.g, L = this.label, G = this.goal;
    const on = this.cornerOn();
    const key = G ? `${G.id}` : '';
    if (key !== this._lastGoal) { this._lastGoal = key; this.lblT = 5; }
    const obj = g.ui.objective?.textContent || '';
    if (obj !== this._lastObj) { this._lastObj = obj; if (obj) this.lblT = 7; }
    const sp = g.onFoot ? g.walker?.speed || 0 : g.bike.speed || 0;
    this.stillT = sp < 1.5 ? (this.stillT || 0) + dt : 0;
    this.lblT = (this.lblT || 0) - dt;
    const show = on && G && (this.lblT > 0 || this.stillT > 2.5);
    if (L.classList.contains('off') === !!show) L.classList.toggle('off', !show);
    if (!show) return;
    const txt = `${obj && this.lblT > 0 ? obj : markName(g, G)}  ${fmtD(G.d)}`;
    if (L.dataset.t !== txt) {
      L.dataset.t = txt;
      const icon = { cocoa: () => glyphURL('cocoa'), home: () => glyphURL('home'), star: () => glyphURL('star') }[G.icon]?.() || iconSmallURL(G.icon);
      L.innerHTML = `<img class="k-g" src="${icon}"><span>${txt.replace(/[&<>]/g, '')}</span>`;
    }
  }

  // ---------------------------------------------------------------- first person
  openFP() {
    const g = this.g, ui = g.ui;
    if (this.fpOpen) return;
    this.fpOpen = true;
    this.yawOff = 0;
    g.sound?.play('paper_unfold', { volume: 0.4 });
    g.sound?.play('ui_open');
    g.prevMode = g.mode;
    g.mode = 'menu';
    this.view.fp.enter({ pitch: -0.12, fov: 60 });
    this.fpEl.classList.add('on');
    this.m = { ov: this.fpEl, items: [this.fpClose], sel: 0, onBack: () => this.closeFP(), compass: true };
    ui.menuStack.push(this.m);
  }
  closeFP() {
    const g = this.g, ui = g.ui;
    if (!this.fpOpen) return;
    this.fpOpen = false;
    this.view.fp.exit();
    this.fpEl.classList.remove('on');
    ui.menuStack = ui.menuStack.filter((x) => x !== this.m);
    ui.swallowInput();
    g.sound?.play('ui_close');
    g.resumeFromMenu();
  }
  updateFP(dt, h) {
    const fp = this.view.fp;
    const want = this.fpOpen ? 1 : 0;
    this.fpK = clamp(this.fpK + (want ? dt / 0.5 : -dt / 0.35), 0, 1);
    if (this.fpOpen) {
      // look about: drag (fpEl), the right stick or the arrow keys
      const l = input.look();
      this.yawOff -= l.x * 2.2;
      if (input.down('left')) this.yawOff += dt * 1.6;
      if (input.down('right')) this.yawOff -= dt * 1.6;
      this.yawOff = clamp(this.yawOff, -Math.PI, Math.PI);
      fp.yawOff = this.yawOff;
    }
    if (this.fpK <= 0) { this.heldRoot.visible = false; return; }
    const k = ease(this.fpK);
    const H = this.h;
    // held up below the eye, face tipped towards it; it rises from below as it comes up
    const r = this.heldRoot;
    // (further off on a tall screen, so it fits across)
    const P = this.g.pipeline, far = Math.max(1, 1.15 / Math.max(0.3, P.w / P.h)) ** 0.85;
    r.position.set(0.016 / far, -0.058 - (1 - k) * 0.2, -0.27 * far);
    r.rotation.set(1.02 - (1 - k) * 0.6, -0.08, 0.04 + Math.sin(this.time * 1.3) * 0.006);
    r.position.y += Math.sin(this.time * 1.9) * 0.0012;
    this.place(H, h);
    // the tag swings a little
    H.tagG.rotation.set(-r.rotation.x + 0.15 + Math.sin(this.time * 1.4) * 0.05, 0, -0.35 + Math.sin(this.time * 1.1 + 1) * 0.06);
    const G = this.goal;
    const name = G ? markName(this.g, G) : 'Nowhere just now';
    const sub = G ? fmtD(G.d) : 'free time!';
    const key = `${name}|${sub}|${fontsOK()}`;
    if (key !== this.tagKey) {
      this.tagKey = key;
      drawTag(H.tagCanvas, name, sub);
      H.tagTex.needsUpdate = true;
    }
  }
}
export { markName };
