// The pumpkin carving mini-game, played right there in the street at Hank's table (it runs
// as a story scene: src/game/carving.js starts it and does the judging after). The camera
// glides in over Hank's shoulder to a close-up of a big voxel pumpkin (src/game/carve3d.js:
// 36 x 38 x 36 voxels, a real shell with ribs, flesh and a hollow), his bony hands in
// shot, the contest going on behind.
//
// 1. Gus's request: spooky, funny, cute, a copy of his design, or carve away.
// 2. The warm-up: cut round the stem along the marker ring (the knife goes straight in
//    along the pumpkin's normal, through the wall) and the lid comes free; Hank lifts it
//    off and holds it while the pumpkin tips towards him; scoop out the guts and seeds,
//    flicked into the bowl on the table; the lid goes back on.
// 3. The carving, against the clock: drag to cut (a ray from the pointer into the voxel
//    grid, a cut every fraction of a voxel along the stroke), the knife saws up and down
//    under the pointer, cut voxels pop out as little cubes that tumble and bounce on the
//    table (one instanced mesh, pooled), a bit ringed by a cut drops into the hollow. Two
//    fingers (or the right mouse button, Q/E and the arrow keys, the little buttons) turn
//    and tip the pumpkin; left alone a little off the front it turns back. Undo, a
//    stencil drawn on in marker, Gus's design on a card. Only the chunks a cut touched
//    are remeshed (src/game/carveMesh.js).
// 4. Done: the lights go down, the lid comes off, a candle goes in, a match is struck,
//    the lid goes back on and the inside lights up (the faces that look into the hollow
//    or a cut glow, with the candle's own light flickering on the table), Hank turns it
//    round to the street and the crowd goes "ooooh". Cut it clean across (or hollow
//    out half a side) and it caves in instead.
//
// The judges look at all four sides and score the best one (carve3d.judge); the exact
// pumpkin is saved (carve3d.encodeCarve) and stands on the table afterwards.
import * as THREE from 'three';
import * as C from './carve3d.js';
import * as CS from './carveScore.js';
import { meshChunk, CHUNKS, dirtyAround } from './carveMesh.js';
import * as CM from '../voxel/models/contest.js';
import { Vox, EMIT } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, createVoxelMaterial, solidVoxelMaterial } from '../render/voxelMaterial.js';
import { worldUniforms, LIGHT_PARS_VERT, LIGHT_PARS_FRAG, SHADOW_VERT } from '../render/shaderlib.js';
import { el, kBar, kButton } from '../ui/kit.js';
import { input } from '../core/input.js';
import '../ui/carving.css';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SZ = C.SIZE;
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (k) => k * k * (3 - 2 * k);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const TIME = 90; // seconds on the clock (once the guts are out)

// ---------------------------------------------------------------- Gus's requests
export const REQUESTS = [
  { id: 'spooky', label: 'Spooky', line: 'Make it SPOOKY. Scare the gulls off the wharf.' },
  { id: 'funny', label: 'Funny', line: 'Make me laugh. Nobody makes me laugh.' },
  { id: 'cute', label: 'Cute', line: 'Something cute. For the kids. ...And me.' },
  { id: 'copy', label: "Gus's design", line: 'Copy my design off the card. Line for line.' },
  { id: 'free', label: 'Free carve', line: 'Carve what ya like, bones.' },
];

// ---------------------------------------------------------------- the stage (metres; Hank's side is +z)
const BOWL = V(-0.375, 0.07, 0.2); // the bowl of guts on Hank's table
const TABLE = { x0: -0.88, x1: 0.88, z0: -0.47, z1: 0.47 };
const TOPY = C.Y0 + C.RY - 1; // the voxel row the lid sits in
// camera shots: elevation, azimuth (0: from Hank's side), what it looks at, how much must fit
const SHOTS = {
  pick: { el: 0.36, az: 0, look: [0, 0.23, 0], r: 0.43 },
  front: { el: 0.3, az: 0, look: [0, 0.215, 0], r: 0.37 }, // (a little low: the buttons are along the bottom)
  top: { el: 0.98, az: 0, look: [0, 0.42, 0.05], r: 0.27 },
  scoop: { el: 1.05, az: 0, look: [0, 0.44, 0.09], r: 0.22 },
  show: { el: 0.26, az: PI + 0.6, look: [0, 0.28, 0], r: 0.6 },
};
const TILT = { pick: 0, lid: 0.36, scoop: 0.44, carve: 0, finale: 0.44 };
const TILT_MIN = -0.3, TILT_MAX = 0.75;

// ---------------------------------------------------------------- pixel icons for the tool buttons
const ICON_COL = { o: '#1e1418', y: '#f6ecd0', m: '#dde2e8', M: '#8a909a', h: '#8a5432', g: '#7ab84a', R: '#d8604a', w: '#f2d8a8', b: '#f0e6cc' };
const ICONS = {
  knife: ['', '.............oo', '............omo', '...........omMo', '..........omMo', '.........omMo', '........omMo', '.......omMo', '......ohMo', '.....ohho', '....ohho', '...ohho', '..ohho', '..oho', '...o'],
  gouge: ['', '..........ooooo', '.........omo.omo', '.........omo.omo', '.........omMMMo', '..........oMMo', '.........oMo', '........oMo', '.......ohMo', '......ohho', '.....ohho', '....ohho', '...ohho', '...oho', '....o'],
  undo: ['', '', '.....o', '....oyo', '...oyyooooo', '..oyyyyyyyyoo', '...oyyooooyyyo', '....oyo...ooyyo', '.....o......oyo', '............oyo', '...........oyyo', '.........ooyyo', '.......ooyyoo', '.......oooo'],
  left: ['', '', '.......o', '......oyo', '.....oyyo', '....oyyyoooooo', '...oyyyyyyyyyyo', '..oyyyyyyyyyyyo', '...oyyyyyyyyyyo', '....oyyyoooooo', '.....oyyo', '......oyo', '.......o'],
  tilt: ['.......o', '......oyo', '.....oyyyo', '....oyyyyyo', '...oooyyyooo', '.....oyyyo', '.....oyyyo', '.....oyyyo', '.....oyyyo', '.....oyyyo', '...oooyyyooo', '....oyyyyyo', '.....oyyyo', '......oyo', '.......o'],
  stencil: ['', '...........oo', '..........oRRo', '.........oRRRRo', '........oyyRRo', '.......oyyyyo', '......oyyyyo', '.....oyyyyo', '....oyyyyo', '...owyyyo', '...owwyo', '..owwwo', '..oooo'],
  done: ['', '', '.............oo', '............ogo', '...........oggo', '..oo......oggo', '.ogo.....oggo', '.oggo...oggo', '..oggo.oggo', '...oggogggo', '....ogggo', '.....ogo', '......o'],
  skip: ['', '', '..o.....o', '..oo....oo', '..oyo...oyo', '..oyyo..oyyo', '..oyyyo.oyyyo', '..oyyyyooyyyyo', '..oyyyo.oyyyo', '..oyyo..oyyo', '..oyo...oyo', '..oo....oo', '..o.....o'],
};
let ICON_URL = null;
function icons() {
  if (ICON_URL) return ICON_URL;
  ICON_URL = {};
  const draw = (rows, mirror) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    const c = cv.getContext('2d');
    rows.forEach((r, y) => {
      const row = r.padEnd(16, '.').slice(0, 16);
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch === '.' || !ICON_COL[ch]) continue;
        c.fillStyle = ICON_COL[ch];
        c.fillRect(mirror ? 15 - x : x, y, 1, 1);
      }
    });
    return cv.toDataURL();
  };
  for (const [k, rows] of Object.entries(ICONS)) ICON_URL[k] = draw(rows, false);
  ICON_URL.right = draw(ICONS.left, true);
  return ICON_URL;
}

// ---------------------------------------------------------------- the flying bits (one instanced mesh)
const CHIP_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec4 worldPosition = M * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(M) * normal);
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #else
  vColor = vec3(1.0);
  #endif
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  ${SHADOW_VERT}
}
`;
const CHIP_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec3 n = normalize(vNormal);
  float shadow = getShadowMask();
  float diff = clamp(dot(n, uSunDir) * 0.75 + 0.25, 0.0, 1.0) * shadow;
  vec3 col = vColor * (hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95 + pointLightsAt(vWorldPos, n, 0.35));
  gl_FragColor = vec4(col, 1.0);
}
`;
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

class Chips {
  constructor(max = 200) {
    this.max = max;
    this.mat = new THREE.ShaderMaterial({ uniforms: worldUniforms(), vertexShader: CHIP_VERT, fragmentShader: CHIP_FRAG, lights: true });
    const m = (this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, max));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    this.list = [];
    this.free = [];
  }
  // pos (stage metres), vel (m/s), colour 0xRRGGBB; o.to: a point to arc into (in o.T seconds)
  spawn(x, y, z, vx, vy, vz, c, size = SZ, o = {}) {
    const ch = this.list.length >= this.max ? this.list.shift() : this.free.pop() || { q: new THREE.Quaternion(), w: new THREE.Vector3() };
    ch.x = x; ch.y = y; ch.z = z; ch.vx = vx; ch.vy = vy; ch.vz = vz;
    ch.r = LIN[(c >> 16) & 255]; ch.g = LIN[(c >> 8) & 255]; ch.b = LIN[c & 255];
    ch.s = size; ch.age = 0; ch.life = o.life ?? rnd(3.5, 5); ch.rest = false; ch.nohit = o.nohit ?? 0;
    ch.q.setFromEuler(_e.set(rnd(0, TAU), rnd(0, TAU), 0));
    ch.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
    if (o.to) {
      const T = o.T ?? 0.55;
      ch.vx = (o.to.x - x) / T; ch.vz = (o.to.z - z) / T; ch.vy = (o.to.y - y) / T + 4.9 * T;
      ch.nohit = T;
    }
    this.list.push(ch);
    return ch;
  }
  // floor(x, z): the height of whatever's under (stage metres); pk: the pumpkin's ellipsoid
  update(dt, floor, pk) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const c = L[i];
      c.age += dt;
      if (c.age >= c.life) { this.free.push(c); L.splice(i, 1); continue; }
      if (c.rest) continue;
      c.vy -= 9.8 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.nohit > 0) c.nohit -= dt;
      else if (pk) {
        const dx = (c.x - pk.x) / pk.rx, dy = (c.y - pk.y) / pk.ry, dz = (c.z - pk.z) / pk.rz;
        const q = dx * dx + dy * dy + dz * dz;
        if (q < 1 && q > 1e-6) {
          const k = 1 / Math.sqrt(q);
          c.x = pk.x + (c.x - pk.x) * k; c.y = pk.y + (c.y - pk.y) * k; c.z = pk.z + (c.z - pk.z) * k;
          let nx = dx / pk.rx, ny = dy / pk.ry, nz = dz / pk.rz;
          const nl = Math.hypot(nx, ny, nz);
          nx /= nl; ny /= nl; nz /= nl;
          const vn = c.vx * nx + c.vy * ny + c.vz * nz;
          if (vn < 0) { c.vx -= 1.4 * vn * nx; c.vy -= 1.4 * vn * ny; c.vz -= 1.4 * vn * nz; c.vx *= 0.8; c.vz *= 0.8; }
        }
      }
      const f = floor(c.x, c.z) + c.s * 0.5;
      if (c.y < f) {
        c.y = f;
        if (c.vy < 0) c.vy *= -0.3;
        c.vx *= 0.62; c.vz *= 0.62;
        c.w.multiplyScalar(0.55);
        if (Math.abs(c.vy) < 0.35 && Math.hypot(c.vx, c.vz) < 0.12) {
          c.vy = 0;
          c.rest = true;
          // settle flat on a face
          _e.setFromQuaternion(c.q);
          c.q.setFromEuler(_e.set(Math.round(_e.x / (PI / 2)) * (PI / 2), _e.y, Math.round(_e.z / (PI / 2)) * (PI / 2)));
        }
      }
      if (!c.rest) {
        const wl = c.w.length();
        if (wl > 1e-3) { _q2.setFromAxisAngle(_p.copy(c.w).divideScalar(wl), wl * dt); c.q.premultiply(_q2); }
      }
    }
    const m = this.mesh, col = m.instanceColor.array;
    for (let i = 0; i < L.length; i++) {
      const c = L[i];
      const k = Math.min(1, (c.life - c.age) / 0.35);
      _s.setScalar(c.s * k);
      m.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), c.q, _s));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    m.count = L.length;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- the mini-game
const EMPTY = new THREE.BufferGeometry();

export class CarveStage {
  constructor(g, host, { suggest = 'spooky' } = {}) {
    this.g = g;
    this.host = host; // the Carving (src/game/carving.js): the table, the judges
    this.suggest = suggest;
    this.request = null;
    this.design = null;
    this.phase = 'intro';
    this.p = C.freshPumpkin();
    this.dirty = new Set();
    this.p.onChange = (x, y, z) => dirtyAround(x, y, z, this.dirty);
    for (let c = 0; c < CHUNKS; c++) this.dirty.add(c);
    this.chunks = new Array(CHUNKS);
    this.air = null;
    this.undoStack = [];
    this.rec = null;
    this.toolName = 'knife';
    this.left = TIME;
    this.t = 0;
    this.yaw = PI; this.yawT = PI; // (it stands on the table facing the street, as it was)
    this.tilt = 0; this.tiltT = 0;
    this.turnIdle = 0;
    this.squash = 0;
    this.ptrs = new Map();
    this.stroke = null;
    this.rot = null;
    this.hover = null;
    this.speed = 0;
    this.cutT = 0;
    this.carvedAny = false;
    this.finished = false;
    this.done = false;
    this.lid = null;
    this.lidAnim = null;
    this.falling = [];
    this.glowK = -1;
    this.flick = 1;
    this.stencil = null;
    this.stencilCols = null;
    this.btn = {};
  }
  sfx(name, o) {
    this.g.sound.play(name, o);
  }

  // ------------------------------------------------------------ in and out
  run(S) {
    const g = this.g, T = this.host.spot();
    this.S = S;
    g.ui.letterbox(false);
    g.rider.visible = false;
    this.host.hidden = true;
    if (this.host.group) this.host.group.visible = false;
    this.build(T);
    this.buildUI();
    S.temp.push({ remove: () => this.dispose() });
    S.every((dt) => { this.tick(dt); return this.done; });
    return new Promise((res) => {
      this.resolve = (v) => { this.done = true; res(v); };
      this.showPick();
    });
  }
  build(T) {
    const root = (this.root = new THREE.Group());
    root.position.set(T.x, T.y, T.z);
    this.pk = new THREE.Group(); // the pumpkin, turning and tipping about its middle
    this.vg = new THREE.Group(); // ...its voxel grid (one unit a voxel)
    this.vg.position.set(-C.X0 * SZ, -C.Y0 * SZ, -C.Z0 * SZ);
    this.vg.scale.setScalar(SZ);
    this.pk.add(this.vg);
    root.add(this.pk);
    this.mat = createVoxelMaterial();
    this.mat.uniforms.uSeeOK.value = 0; // (never melts away, however close the lens)
    this.glowMat = createVoxelMaterial();
    this.glowMat.uniforms.uSeeOK.value = 0;
    this.glowMat.uniforms.uTint.value.setScalar(0.06);
    this.chips = new Chips(200);
    root.add(this.chips.mesh);
    // Hank's hands: the right one with a tool, the left steadying the pumpkin
    const mk = (tool) => {
      const r = CM.bonyHand({ tool });
      const m = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin }), solidVoxelMaterial(), { cast: true });
      m.visible = false;
      return m;
    };
    this.hands = {};
    this.hand = new THREE.Group();
    for (const k of ['knife', 'gouge', 'scoop', 'candle']) this.hand.add((this.hands[k] = mk(k)));
    this.lhand = new THREE.Group();
    const open = mk('open');
    open.visible = true;
    this.lhand.add(open);
    root.add(this.hand, this.lhand);
    this.hs = { tip: V(0.3, 0.06, 0.28), dir: V(0.2, 1, 0.5).normalize(), saw: 0, show: true };
    this.hand.position.copy(this.hs.tip);
    this.lhand.position.set(-0.29, 0.26, 0.04);
    this.handTool('knife');
    // where things fall: the table top, a bowl on it, the street below
    const drop = T.y - this.g.physics.groundAt(T.x, T.z, T.y).h;
    this.floor = (x, z) => {
      if (Math.hypot(x - BOWL.x, z - BOWL.z) < 0.1) return BOWL.y - 0.02;
      return x > TABLE.x0 && x < TABLE.x1 && z > TABLE.z0 && z < TABLE.z1 ? 0 : -drop;
    };
    this.g.scene.add(root);
    this.applyPose();
    this.remesh();
  }
  dispose() {
    const g = this.g;
    this.unbind?.();
    this.ui?.remove();
    if (this.root) {
      g.scene.remove(this.root);
      this.root.traverse((o) => { if (o.isMesh && o.geometry !== EMPTY && !o.isInstancedMesh) o.geometry.dispose(); });
      this.chips.dispose();
      for (const m of [this.mat, this.glowMat]) { m.userData.depth?.dispose(); m.dispose(); }
    }
    if (this.light) g.lightPool.removeDynamic(this.light);
    this.light = null;
    if (this.expo0 !== undefined) g.tween(g.pipeline.post.uExposure, 'value', this.expo0, 0.8);
    this.host.hidden = false;
    g.rider.visible = true;
  }

  // ------------------------------------------------------------ the overlay: clock, a line, the tools
  buildUI() {
    const ui = (this.ui = el('div', 'carve3d'));
    const top = el('div', 'c3-top');
    this.clock = el('div', 'k-plate k-dark c3-clock', '');
    this.bar = kBar(1, 'heat', 'c3-time');
    top.append(this.clock, this.bar);
    this.msgEl = el('div', 'c3-msg k-bold k-shadow', '');
    this.sayEl = el('div', 'c3-say k-plate k-parchment', '');
    this.card = el('div', 'c3-card k-plate k-parchment');
    this.cardCv = document.createElement('canvas');
    this.cardCv.className = 'c3-card-cv';
    this.cardCv.width = this.cardCv.height = CS.N + 4;
    this.card.append(this.cardCv);
    this.tools = el('div', 'c3-tools');
    this.hintEl = el('div', 'c3-hint k-shadow', '');
    ui.append(top, this.sayEl, this.msgEl, this.card, this.tools, this.hintEl);
    this.g.ui.root.appendChild(ui);
    this.bindInput();
  }
  // the buttons along the bottom: [key, icon or label, fn, { face, title, text }]
  setTools(list) {
    this.tools.replaceChildren();
    this.btn = {};
    const I = icons();
    for (const [key, what, fn, o = {}] of list) {
      const b = kButton(o.text ? what : '', () => { this.sfx('ui_click', { volume: 0.5 }); fn(); }, { face: o.face || '', icon: o.text ? '' : I[what], cls: o.text ? 'c3-text' : 'c3-btn' });
      b.title = o.title || what;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.tools.appendChild(b);
      this.btn[key] = b;
    }
  }
  say(text, ms = 2200) {
    const e = this.msgEl;
    e.textContent = text;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
    this.msgT = ms / 1000;
  }
  gus(text, ms = 4000) {
    this.sayEl.innerHTML = `<b>Gus:</b> ${text}`;
    this.sayEl.classList.add('on');
    this.sayT = ms / 1000;
  }
  hint(touch, mouse) {
    this.hintEl.textContent = this.g.touch?.on || input.lastDevice === 'touch' ? touch : mouse;
    this.hintEl.classList.add('on');
    this.hintT = 5;
  }
  setClock(text, k) {
    if (this.clock.textContent !== text) this.clock.textContent = text;
    this.bar.set(k);
  }

  // ------------------------------------------------------------ 1. Gus's request
  showPick() {
    this.phase = 'pick';
    this.yawT = 0; // Hank turns it round to face him
    this.shot('pick', 1.0);
    this.setClock('-:--', 1);
    const sug = REQUESTS.find((r) => r.id === this.suggest) || REQUESTS[0];
    const order = [sug, ...REQUESTS.filter((r) => r !== sug)];
    this.tools.classList.add('pick');
    this.setTools(order.map((r) => [r.id, r.label, () => this.pick(r.id), { text: true, face: r === sug ? 'green' : '', title: r.line }]));
    this.gus(`"${sug.line}"`, 60000);
  }
  pick(id) {
    if (this.phase !== 'pick') return;
    this.request = id;
    this.tools.classList.remove('pick');
    this.sfx('paper', { volume: 0.5 });
    const r = REQUESTS.find((q) => q.id === id);
    if (id !== this.suggest && r) this.gus(`"${r.line}"`, 2600);
    else this.sayEl.classList.remove('on');
    this.startLid();
  }

  // ------------------------------------------------------------ 2. the lid and the guts
  startLid() {
    this.phase = 'lid';
    this.tiltT = TILT.lid;
    this.shot('top', 0.8);
    this.setClock('Lid', 1);
    this.handTool('knife');
    this.setTools([['skip', 'skip', () => this.skipWarmup(), { title: 'Skip' }]]);
    this.say('Cut round the stem!', 3000);
    this.hint('Drag round the ring to cut the lid', 'Drag round the ring to cut the lid');
  }
  checkLid() {
    const parts = C.looseParts(this.p);
    let lid = null;
    for (const part of parts) {
      if (part.stem && !lid) lid = part;
      else this.dropPiece(part, null);
    }
    if (lid) this.liftLid(lid);
  }
  liftLid(part) {
    this.phase = 'lidOff';
    this.stroke = null;
    this.say('The lid!', 1400);
    this.showLid(C.takeLid(this.p, part), 0.6, () => {
      if (this.finished) return;
      if (this.skipGuts) this.endScoop(true);
      else this.startScoop();
    });
  }
  // the lid (out of the grid) as a piece of its own: Hank lifts it off and holds it up to
  // one side, in the stage frame
  showLid(L, dur, then) {
    this.lid = L;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    const xyz = (i) => { const x = i % C.W, r = (i - x) / C.W, y = r % C.H; return [x, y, (r - y) / C.H]; };
    for (const i of L.cells) {
      const [x, y, z] = xyz(i);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    }
    const v = new Vox(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
    L.cells.forEach((i, k) => { const [x, y, z] = xyz(i); v.set(x - x0, y - y0, z - z0, L.col[k]); });
    const m = voxMesh(meshVox(v, { size: 1, origin: [0, 0, 0] }), this.mat);
    m.position.set(x0 - L.c[0], y0 - L.c[1], z0 - L.c[2]);
    const piv = (this.lidPiv = new THREE.Group());
    piv.position.set(L.c[0], L.c[1], L.c[2]);
    piv.add(m);
    this.vg.add(piv);
    this.root.updateMatrixWorld(true);
    this.root.attach(piv);
    L.stem = V(C.X0, y1 + 1, C.Z0).sub(V(...L.c)); // (the stem's top, from its middle)
    this.sfx('pumpkin_bonk', { volume: 0.4, pitch: 1.5 });
    this.animLid(V(-0.2, 0.66, 0.1), new THREE.Quaternion().setFromEuler(_e.set(0.3, 0.5, 0.35)), dur, then);
  }
  // move the lid (in the stage frame) to a pose over dur seconds
  animLid(pos, quat, dur, then) {
    const piv = this.lidPiv;
    this.lidAnim = { p0: piv.position.clone(), q0: piv.quaternion.clone(), p1: pos, q1: quat, t: 0, dur, then };
  }
  // ...and back on (into the voxel grid once it's there)
  returnLid(then) {
    const L = this.lid;
    this.root.updateMatrixWorld(true);
    const M = new THREE.Matrix4().copy(this.root.matrixWorld).invert().multiply(this.vg.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(L.c[0], L.c[1], L.c[2]));
    const p = V(0, 0, 0), q = new THREE.Quaternion(), s = V(0, 0, 0);
    M.decompose(p, q, s);
    this.animLid(p, q, 0.45, () => {
      C.putLid(this.p, L);
      this.root.remove(this.lidPiv);
      this.lidPiv.traverse((o) => o.isMesh && o.geometry.dispose());
      this.lidPiv = null;
      this.lid = null;
      this.sfx('pumpkin_bonk', { volume: 0.3, pitch: 1.2 });
      then?.();
    });
  }
  startScoop() {
    this.phase = 'scoop';
    this.tiltT = TILT.scoop;
    this.shot('scoop', 0.7);
    this.handTool('scoop');
    this.gutsAt = Math.max(1, this.p.guts());
    this.gutsLeft = this.gutsAt;
    this.setClock('Guts!', 1);
    this.setTools([['skip', 'skip', () => this.endScoop(true), { title: 'Skip' }]]);
    this.say('Scoop out the guts!', 2400);
    this.hint('Drag inside to scoop', 'Drag inside to scoop');
    this.sfx('squish', { volume: 0.4, pitch: 0.8 });
  }
  endScoop(skipped) {
    if (this.phase !== 'scoop' && this.phase !== 'lidOff') return;
    this.phase = 'lidOn';
    this.stroke = null;
    this.setTools([]);
    this.say(skipped ? 'Guts can wait. Lid on!' : 'All clean! Lid on...', 1600);
    this.sfx(skipped ? 'paper' : 'item_get', { volume: 0.5 });
    this.handTool('knife');
    this.returnLid(() => this.startCarve());
  }
  skipWarmup() {
    if (this.phase !== 'lid') return;
    this.skipGuts = true;
    C.cutLidRing(this.p);
    this.sfx('carve_cut', { volume: 0.4 });
    this.checkLid();
  }

  // ------------------------------------------------------------ 3. carve!
  startCarve() {
    this.phase = 'carve';
    this.tiltT = TILT.carve;
    this.yawT = 0;
    this.shot('front', 0.7);
    this.setTools([
      ['knife', 'knife', () => this.tool('knife'), { title: 'Knife [1]' }],
      ['gouge', 'gouge', () => this.tool('gouge'), { title: 'Gouge [2]' }],
      ['undo', 'undo', () => this.undo(), { title: 'Undo [Z]' }],
      ['left', 'left', () => this.turn(-1), { title: 'Turn [Q]' }],
      ['right', 'right', () => this.turn(1), { title: 'Turn [E]' }],
      ['tilt', 'tilt', () => this.tip(), { title: 'Tip [W/S]' }],
      ['stencil', 'stencil', () => this.cycleStencil(), { title: 'Stencil [T]' }],
      ['done', 'done', () => this.finish('done'), { face: 'green', title: 'Done!' }],
    ]);
    this.tool('knife');
    if (this.request === 'copy') {
      this.design = CS.DESIGNS[pickOf(CS.DESIGN_NAMES)];
      this.drawCard();
      this.card.classList.add('on');
    }
    const r = REQUESTS.find((q) => q.id === this.request);
    this.say(this.request === 'copy' ? "Copy Gus's design!" : r && r.id !== 'free' ? `Make it ${r.label.toUpperCase()}!` : 'Carve away!', 2400);
    this.hint('Drag to cut · two fingers to turn', 'Drag to cut · right-drag or Q/E to turn');
    this.sfx('carve_cut', { volume: 0.4, pitch: 0.8 });
  }
  tool(name) {
    this.toolName = name;
    this.btn.knife?.classList.toggle('on', name === 'knife');
    this.btn.gouge?.classList.toggle('on', name === 'gouge');
    this.handTool(name);
  }
  turn(d) {
    this.yawT = Math.round((this.yawT + (d * PI) / 4) / (PI / 4)) * (PI / 4);
    this.turnIdle = 0;
    this.sfx('pumpkin_bonk', { volume: 0.15, pitch: 1.8 });
  }
  tip(d = 0) {
    this.tiltT = d ? Math.max(TILT_MIN, Math.min(TILT_MAX, this.tiltT + d * 0.25)) : this.tiltT > 0.2 ? 0 : 0.5;
    this.turnIdle = 0;
  }
  undo() {
    if (this.finished || this.phase !== 'carve' || !this.undoStack.length) return;
    this.p.undo(this.undoStack.pop());
    this.sfx('paper', { volume: 0.3, pitch: 1.3 });
    this.warned = false;
  }
  // the stencil: faint marker lines on the front to follow (off, then each design in turn)
  cycleStencil() {
    if (this.phase !== 'carve') return;
    const names = [null, ...CS.STENCIL_NAMES];
    this.stencil = names[(names.indexOf(this.stencil) + 1) % names.length];
    const p = this.p;
    // rub out the old lines (where they're still there), draw the new
    for (const [i, c, m] of this.stencilCols || []) if (p.kind[i] && p.col[i] === m) p.put(i, c, p.kind[i]);
    this.stencilCols = [];
    const st = this.stencil && CS.STENCILS[this.stencil], N = CS.N;
    if (st) {
      const B = C.shapeOf();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = r * N + c;
        if (!st[k]) continue;
        const edge = !st[k - 1] || !st[k + 1] || !st[k - N] || !st[k + N];
        if (!edge || (r + c) % 2) continue;
        const x = c + C.P0, y = C.TOP - r;
        for (let z = C.D - 1; z >= C.Z0; z--) {
          const i = C.idx(x, y, z);
          if (B.ORIG[i] !== 1) continue;
          if ((p.kind[i] & C.KIND) === C.K.SKIN) { this.stencilCols.push([i, p.col[i], C.COL.marker]); p.put(i, C.COL.marker, p.kind[i]); }
          break;
        }
      }
      this.yawT = 0;
    }
    this.btn.stencil?.classList.toggle('on', !!st);
    this.sfx('paper', { volume: 0.4 });
  }
  // Gus's design on his little card (one pixel a cell, cut cells in marker)
  drawCard() {
    const cv = this.cardCv, ctx = cv.getContext('2d'), W = CS.N + 4, N = CS.N;
    const img = ctx.createImageData(W, W), D = new Uint32Array(img.data.buffer);
    const abgr = (c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
    const paper = abgr(0xf2e6c8), line = abgr(0xd8c8a0), ink = abgr(0x3a1608), skin = abgr(0xe2762a);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = x - 2, j = y - 2;
      let c = y % 4 === 3 ? line : paper;
      if (i >= 0 && j >= 0 && i < N && j < N && CS.BODY[j * N + i]) c = this.design[j * N + i] ? ink : skin;
      D[y * W + x] = c;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------ the pointer
  bindInput() {
    const L = this.ui;
    const down = (e) => {
      if (e.target.closest?.('.k-btn')) return;
      e.preventDefault();
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { L.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.ptrs.size >= 2) {
        // two fingers: turn and tip it (a stroke just begun is taken back)
        if (this.stroke) {
          if (this.stroke.rec?.length && performance.now() - this.stroke.t0 < 250) this.p.undo(this.stroke.rec);
          else this.endStroke();
          this.stroke = null;
        }
        this.rot = { two: true };
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) { this.rot = { id: e.pointerId }; return; }
      this.beginStroke(e);
    };
    const move = (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (e.pointerType === 'mouse' && !p) { this.hover = { x: e.clientX, y: e.clientY }; this.aim(e.clientX, e.clientY, false); return; }
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.rot && (this.rot.two || this.rot.id === e.pointerId)) {
        const k = this.rot.two ? 0.5 : 1;
        this.spin(dx * k, dy * k);
        return;
      }
      if (this.stroke && this.stroke.id === e.pointerId) this.strokeTo(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') this.hover = { x: e.clientX, y: e.clientY };
    };
    const up = (e) => {
      if (!this.ptrs.delete(e.pointerId)) return;
      if (this.stroke && this.stroke.id === e.pointerId) this.endStroke();
      if (this.rot && (this.rot.id === e.pointerId || (this.rot.two && this.ptrs.size === 0))) this.rot = null;
      if (e.pointerType !== 'mouse' && !this.ptrs.size) this.hs.target = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      if (this.phase === 'carve' && !this.finished) { this.yawT += Math.sign(e.deltaY) * 0.12; this.turnIdle = 0; }
    };
    const key = (e) => {
      if (this.finished) return;
      const c = e.code;
      if (this.phase === 'pick') {
        // 1-5 for the requests in the order shown, Enter for Gus's own idea
        const ids = Object.keys(this.btn), n = c.startsWith('Digit') ? +c.slice(5) : 0;
        if (n >= 1 && n <= ids.length) this.pick(ids[n - 1]);
        else if (c === 'Enter') this.pick(ids[0]);
        return;
      }
      if (c === 'Enter' && this.phase === 'lid') { this.skipWarmup(); return; }
      if (c === 'Enter' && this.phase === 'scoop') { this.endScoop(true); return; }
      if (this.phase !== 'carve') return;
      if (c === 'Digit1') this.tool('knife');
      else if (c === 'Digit2') this.tool('gouge');
      else if (c === 'KeyZ') this.undo();
      else if (c === 'KeyT') this.cycleStencil();
      else if (c === 'KeyQ' || c === 'ArrowLeft') this.turn(-1);
      else if (c === 'KeyE' || c === 'ArrowRight') this.turn(1);
      else if (c === 'KeyW' || c === 'ArrowUp') this.tip(1);
      else if (c === 'KeyS' || c === 'ArrowDown') this.tip(-1);
      else if (c === 'Enter') this.finish('done');
    };
    const ctx = (e) => e.preventDefault();
    L.addEventListener('pointerdown', down);
    L.addEventListener('pointermove', move);
    L.addEventListener('pointerup', up);
    L.addEventListener('pointercancel', up);
    L.addEventListener('wheel', wheel, { passive: false });
    L.addEventListener('contextmenu', ctx);
    window.addEventListener('keydown', key);
    this.unbind = () => window.removeEventListener('keydown', key);
  }
  spin(dx, dy) {
    if (this.phase !== 'carve' || this.finished) return;
    const k = 3.2 / Math.max(320, Math.min(window.innerWidth, window.innerHeight));
    this.yawT += dx * k;
    this.tiltT = Math.max(TILT_MIN, Math.min(TILT_MAX, this.tiltT + dy * k * 0.8));
    this.turnIdle = 0;
  }
  // a ray from the screen into the pumpkin's voxel grid: { o: [x,y,z], d: [x,y,z] } (voxel units)
  ray(sx, sy) {
    const g = this.g, cam = g.camera;
    const r = g.pipeline.renderer.domElement.getBoundingClientRect();
    const nx = ((sx - r.left) / r.width) * 2 - 1, ny = -((sy - r.top) / r.height) * 2 + 1;
    cam.updateMatrixWorld();
    const o = V(nx, ny, -1).unproject(cam), f = V(nx, ny, 1).unproject(cam);
    const inv = this.invVG;
    o.applyMatrix4(inv);
    f.applyMatrix4(inv);
    const d = f.sub(o).normalize();
    return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
  }
  // the pointer over the pumpkin: what it's on (and the hand goes there)
  aim(sx, sy, cutting) {
    if (!this.invVG || this.finished) return null;
    const { o, d } = this.ray(sx, sy);
    const hit = C.raycast(this.p, o[0], o[1], o[2], d[0], d[1], d[2]);
    const at = hit ? [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t] : null;
    if (at) this.hs.target = this.toStage(at[0], at[1], at[2], this.hs.target || V());
    else if (!cutting) {
      // (off the pumpkin: the knife floats under the pointer, about as near as its front)
      const tc = (C.X0 - o[0]) * d[0] + (C.Y0 - o[1]) * d[1] + (C.Z0 - o[2]) * d[2] - C.RX;
      if (tc > 0) this.hs.target = this.toStage(o[0] + d[0] * tc, o[1] + d[1] * tc, o[2] + d[2] * tc, this.hs.target || V());
    }
    if (at) {
      const n = C.inward(at[0], at[1], at[2]);
      this.hs.din = (this.hs.din || V()).set(n[0], n[1], n[2]).applyQuaternion(this.pk.quaternion);
    }
    return hit ? { hit, at, o, d } : null;
  }
  beginStroke(e) {
    const ph = this.phase;
    if (this.finished || (ph !== 'carve' && ph !== 'lid' && ph !== 'scoop')) return;
    this.stroke = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), lt: performance.now(), rec: ph === 'carve' ? [] : null, n: 0 };
    this.speed = 0;
    if (ph === 'carve') this.sfx('carve_cut', { volume: 0.3, pitch: 0.9 + Math.random() * 0.25 });
    this.cutAt(e.clientX, e.clientY);
  }
  strokeTo(x, y) {
    const s = this.stroke;
    const now = performance.now(), dist = Math.hypot(x - s.x, y - s.y);
    const vpx = this.voxelPx();
    this.speed += ((dist / vpx / Math.max(1, now - s.lt)) * 1000 - this.speed) * 0.4; // voxels a second
    s.lt = now;
    const n = Math.min(60, Math.max(1, Math.ceil(dist / Math.max(1.5, vpx * 0.4))));
    for (let k = 1; k <= n; k++) this.cutAt(s.x + ((x - s.x) * k) / n, s.y + ((y - s.y) * k) / n);
    s.x = x;
    s.y = y;
    if (this.phase === 'lid' && now - (this.lidCheckT || 0) > 120 && s.n) { this.lidCheckT = now; if (C.lidFree(this.p)) this.checkLid(); }
  }
  // how big a voxel looks on screen (CSS pixels)
  voxelPx() {
    const cam = this.g.camera;
    const d = cam.position.distanceTo(this.pkWorld || cam.position) || 1;
    return (SZ / (2 * d * Math.tan((cam.fov * PI) / 360))) * window.innerHeight;
  }
  cutAt(sx, sy) {
    const ph = this.phase, s = this.stroke;
    if (!s || (ph !== 'carve' && ph !== 'lid' && ph !== 'scoop')) return;
    const a = this.aim(sx, sy, true);
    if (!a || !s) return;
    const { hit, at, o, d } = a;
    const p = this.p, rec = s.rec || (this.tmp = []), before = rec.length;
    if (ph === 'scoop') {
      if (!C.GUTS[hit.k] && !(hit.t - (C.enterShell(o[0], o[1], o[2], d[0], d[1], d[2]) ?? hit.t) > 3)) return;
      C.scoop(p, at[0], at[1], at[2], 2.6, rec);
      const n = (rec.length - before) / 3;
      if (!n) return;
      s.n += n;
      this.hs.saw = 1;
      // a dollop (or a seed) flicked out of the top into the bowl
      const top = this.toStage(C.X0 + rnd(-2, 2), TOPY + 2, C.Z0 + rnd(-2, 2), V());
      for (let k = 0; k < Math.min(2, n); k++) {
        const c = rec[before + 1 + k * 3 * Math.floor(n / 2)] || C.COL.goo[0];
        this.chips.spawn(top.x, top.y, top.z, 0, 0, 0, c, SZ * rnd(0.9, 1.3), { to: V(BOWL.x + rnd(-0.05, 0.05), BOWL.y + 0.05, BOWL.z + rnd(-0.05, 0.05)), T: rnd(0.45, 0.65), life: rnd(2.5, 3.5) });
      }
      const now = performance.now();
      if (now - this.cutT > 150) { this.cutT = now; this.sfx('goo_scoop', { volume: 0.45, pitch: 0.85 + Math.random() * 0.35 }); }
      this.gutsLeft -= n;
      const left = this.gutsLeft / this.gutsAt;
      this.bar.set(left);
      if (left < 0.2) this.endScoop(false);
      return;
    }
    if (!C.onWall(hit, o[0], o[1], o[2], d[0], d[1], d[2])) return;
    if (ph === 'lid' && at[1] < C.Y0 + C.RY * 0.5) return; // (only the top, for the lid)
    C.cut(p, at[0], at[1], at[2], ph === 'lid' ? 'lid' : this.toolName === 'gouge' ? 'gouge' : 'knife', rec);
    const n = (rec.length - before) / 3;
    if (!n) return;
    s.n += n;
    this.carvedAny = this.carvedAny || ph === 'carve';
    this.hs.saw = 1;
    // chunks of rind and flesh pop out and tumble onto the table
    for (let k = 0; k < n; k++) {
      if (k >= 2 && Math.random() > 0.3) continue;
      const i = rec[before + k * 3];
      const x = i % C.W, r = (i - x) / C.W, y = r % C.H, z = (r - y) / C.H;
      const q = this.toStage(x + 0.5, y + 0.5, z + 0.5, _p);
      const ox = q.x - this.pk.position.x, oy = q.y - this.pk.position.y, oz = q.z - this.pk.position.z, ol = Math.hypot(ox, oy, oz) || 1;
      const sp = rnd(0.5, 1.0);
      this.chips.spawn(q.x, q.y, q.z, (ox / ol) * sp + rnd(-0.25, 0.25), (oy / ol) * sp * 0.5 + rnd(0.5, 1.1), (oz / ol) * sp + rnd(-0.25, 0.25), rec[before + k * 3 + 1], SZ * rnd(0.85, 1.25));
    }
    // "shhk, shhk": quicker and higher the faster the knife saws
    const now = performance.now(), sp = this.speed || 0;
    const gap = this.toolName === 'knife' || ph === 'lid' ? Math.max(55, 125 - sp * 2.2) : 150;
    if (now - this.cutT > gap) {
      this.cutT = now;
      if (this.toolName === 'knife' || ph === 'lid') this.sfx('carve_shhk', { volume: 0.4 + Math.min(0.25, sp * 0.012), pitch: 0.85 + Math.min(0.55, sp * 0.02) + Math.random() * 0.1 });
      else this.sfx('squish', { volume: 0.35, pitch: 1.1 + Math.random() * 0.3 });
    }
  }
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    if (this.phase === 'lid') { if (s.n && C.lidFree(this.p)) this.checkLid(); return; }
    if (this.phase !== 'carve' || !s.rec?.length) return;
    // whatever's cut free drops in
    let fell = 0;
    for (const part of C.looseParts(this.p)) fell += this.dropPiece(part, s.rec);
    if (fell) {
      this.sfx('pumpkin_bonk', { volume: 0.35, pitch: 1.4 });
      this.say(fell > 40 ? 'Plop! A big bit fell in.' : 'Plop!', 1500);
    }
    this.undoStack.push(s.rec);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.judgeSoon = true; // (next frame: the finger's lift stays light)
  }
  // is it holding up?
  holding() {
    this.judgeSoon = false;
    const J = C.judge(this.p);
    if (J.res.collapse && !this.warned) {
      this.warned = true;
      this.sfx('tree_creak', { volume: 0.4, pitch: 1.6 });
      this.say(J.res.split ? "Uh oh... it's coming apart! (Undo?)" : "Uh oh... it's more hole than pumpkin! (Undo?)", 2600);
      this.g.chase.shake(0.25);
    } else if (!J.res.collapse && J.res.area > 0.42 && !this.flimsy) {
      this.flimsy = true;
      this.say("Careful! It's getting flimsy...", 2200);
    }
  }
  // a piece cut free falls into the hollow (or off), tumbling; returns its size
  dropPiece(part, rec) {
    const p = this.p, n = part.cells.length;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1, cx = 0, cy = 0, cz = 0;
    const pts = [];
    for (const i of part.cells) {
      const x = i % C.W, r = (i - x) / C.W, y = r % C.H, z = (r - y) / C.H;
      pts.push(x, y, z, p.col[i]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
      cx += x + 0.5; cy += y + 0.5; cz += z + 0.5;
      p.remove(i, rec);
    }
    cx /= n; cy /= n; cz /= n;
    if (n <= 3000) {
      const v = new Vox(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
      for (let k = 0; k < pts.length; k += 4) v.set(pts[k] - x0, pts[k + 1] - y0, pts[k + 2] - z0, pts[k + 3]);
      const m = voxMesh(meshVox(v, { size: 1, origin: [0, 0, 0] }), this.mat, { cast: false });
      m.position.set(x0, y0, z0);
      this.vg.add(m);
      const d = C.inward(cx, cy, cz);
      this.falling.push({ m, v: V(d[0] * 9, d[1] * 9 - 3, d[2] * 9), w: V(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)), t: 0 });
    }
    return n;
  }

  // ------------------------------------------------------------ 4. done: the candle (or the cave-in)
  back() {
    if (this.finished) return;
    if (this.phase !== 'carve' || !this.carvedAny) {
      // nothing carved yet: walk away, no harm done (the day's go isn't used up)
      this.finished = true;
      this.resolve(null);
      return;
    }
    this.finish('done');
  }
  finish(why) {
    if (this.finished || this.phase !== 'carve') return;
    this.finished = true;
    this.stroke = null;
    this.rot = null;
    this.hs.target = null;
    this.tools.replaceChildren();
    this.card.classList.remove('on');
    if (this.stencil) { this.stencil = null; for (const [i, c, m] of this.stencilCols || []) if (this.p.kind[i] && this.p.col[i] === m) this.p.put(i, c, this.p.kind[i]); }
    const J = C.judge(this.p, { theme: CS.THEMES[this.request] ? this.request : null, target: this.request === 'copy' ? this.design : null });
    const out = { p: this.p, judged: J, timeUp: why === 'time', request: this.request, design: this.design || null };
    const end = () => this.resolve(out);
    (J.res.collapse ? this.caveIn(why) : this.light(why, J)).then(end, (e) => { console.error(e); end(); });
  }
  wait(s) {
    return this.g.wait(s);
  }
  async caveIn(why) {
    this.say(why === 'time' ? "Time's up! ...Oh no." : 'Oh no...', 2400);
    this.sfx('tree_creak', { volume: 0.5, pitch: 1.4 });
    this.yawT = 0;
    this.tiltT = 0;
    this.wobble = 1;
    await this.wait(0.6);
    this.wobble = 0;
    this.sfx('pumpkin_smash', { volume: 0.7 });
    this.g.chase.shake(0.6);
    const pk = this.pk.position;
    for (let k = 0; k < 40; k++) {
      const a = rnd(0, TAU), r = rnd(0.1, 0.27);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = pk.y + rnd(-0.15, 0.1);
      this.chips.spawn(x, y, z, Math.cos(a) * rnd(0.4, 1.2), rnd(0.6, 1.6), Math.sin(a) * rnd(0.4, 1.2), pickOf([C.COL.base, C.COL.base2, C.COL.flesh, C.COL.fleshIn]), SZ * rnd(1, 1.6), { nohit: 1 });
    }
    this.squashT = 0;
    await this.wait(2.0);
  }
  async light(why, J) {
    const g = this.g;
    // the lights go down...
    this.say(why === 'time' ? "Time's up! Lights out..." : 'Lights out...', 1600);
    this.sfx('lantern_whoomp', { volume: 0.5, pitch: 0.7 });
    const post = g.pipeline.post;
    this.expo0 = post.uExposure.value;
    g.tween(post.uExposure, 'value', this.expo0 * 0.42, 1.0);
    this.yawT = Math.round(this.yaw / TAU) * TAU;
    this.tiltT = TILT.finale;
    this.shot('top', 0.9);
    this.handTool('candle');
    this.hs.show = false;
    await this.wait(0.9);
    // ...the lid comes off...
    const part = C.lidPart(this.p);
    if (part) this.showLid(C.takeLid(this.p, part), 0.5, null);
    await this.wait(0.6);
    // ...Hank lowers a candle in...
    this.hs.show = true;
    const floorY = (() => { const B = C.shapeOf(); let y = 0; while (y < C.H && !B.CAV[C.idx(Math.floor(C.X0), y, Math.floor(C.Z0))]) y++; return y; })();
    this.candleAnim = { t: 0, dur: 1.0, from: TOPY + 16, to: floorY };
    await this.wait(1.1);
    this.candleAnim = null;
    const cv = new Vox(2, 7, 2);
    cv.fill(0, 0, 0, 1, 3, 1, (x, y, z) => (x || z ? 0xd8ccae : C.COL.candle));
    cv.set(0, 4, 0, 0x2a2420);
    const fv = new Vox(2, 7, 2);
    fv.set(0, 5, 0, C.COL.flame | EMIT);
    fv.set(0, 6, 0, C.COL.flame2 | EMIT);
    const cm = voxMesh(meshVox(cv, { size: 1, origin: [0, 0, 0] }), this.mat, { cast: false });
    const fm = voxMesh(meshVox(fv, { size: 1, origin: [0, 0, 0] }), this.mat, { cast: false });
    cm.position.set(Math.floor(C.X0) - 1, floorY, Math.floor(C.Z0) - 1);
    fm.position.copy(cm.position);
    fm.visible = false;
    this.vg.add(cm, fm);
    this.hs.show = false;
    // ...strikes a match...
    await this.wait(0.35);
    this.sfx('match_strike', { volume: 0.7 });
    this.say('*scritch*', 900);
    const w = this.vg.localToWorld(V(C.X0, TOPY + 3, C.Z0));
    g.effects.glint?.(w.x, w.y, w.z, { color: [1, 0.85, 0.5], size: 0.25, life: 0.4 });
    fm.visible = true;
    const cw = this.vg.localToWorld(V(C.X0, floorY + 6, C.Z0));
    this.light = g.lightPool.addDynamic({ pos: cw, color: [1.0, 0.58, 0.2], radius: 3.2, intensity: 0 });
    await this.wait(0.45);
    // ...the lid goes back on, and the inside lights up
    if (this.lid) await new Promise((res) => this.returnLid(res));
    this.air = C.insideAir(this.p);
    for (let c = 0; c < CHUNKS; c++) this.dirty.add(c);
    this.glowK = 0;
    await this.wait(0.5);
    // Hank turns it round to the street, the camera round with it
    this.yawT = this.yaw + wrapA(PI - (J.side * PI) / 2 - this.yaw + 0.001);
    this.tiltT = 0;
    this.shot('show', 1.7);
    const H = this.host.hankAt(this.S);
    H.play('idle', 'proud');
    this.lhand.visible = false;
    await this.wait(1.2);
    this.sfx('crowd_ooh', { volume: 0.8 });
    this.say('Ooooooooh!', 1900);
    H.play('present', 'proud');
    this.swoon();
    await this.wait(2.3);
  }

  // the street goes "ooooh": little hearts over the heads of everyone nearby
  swoon() {
    const g = this.g, T = this.root.position, C2 = this.host.contest;
    try {
      const folk = [...(C2.present?.() || []).map((b) => b.a), ...(C2.crowd?.list || []).filter((m) => m.shown && !m.frozen).map((m) => m.a)];
      for (const a of folk) {
        if (!a?.showEmote || Math.hypot(a.pos.x - T.x, a.pos.z - T.z) > 16 || Math.random() < 0.3) continue;
        g.wait(rnd(0, 0.6)).then(() => a.showEmote('heart', 1.8));
      }
    } catch (e) {
      console.warn('carving: no swoon', e);
    }
  }

  // ------------------------------------------------------------ the camera
  shot(name, dur = 0.8) {
    const cam = this.g.camera, asp = cam.aspect || 1.6;
    this.shotName = name;
    this.asp = asp;
    const fov = asp < 1 ? Math.min(66, 42 / Math.pow(asp, 0.55)) : 42;
    const vh = (fov * PI) / 360, hh = Math.atan(Math.tan(vh) * asp), half = Math.min(vh, hh);
    const s = SHOTS[name];
    const look = V(...s.look);
    if (asp < 1 && (name === 'front' || name === 'pick')) look.y -= 0.035; // (two rows of buttons on a phone held upright)
    const dist = s.r / Math.sin(half);
    const pos = look.clone().add(V(Math.sin(s.az) * Math.cos(s.el), Math.sin(s.el), Math.cos(s.az) * Math.cos(s.el)).multiplyScalar(dist));
    this.root.updateMatrixWorld(true);
    this.root.localToWorld(pos);
    this.root.localToWorld(look);
    this.S.cam(pos, look, dur, fov, look.clone());
  }

  // ------------------------------------------------------------ the hands
  handTool(name) {
    for (const [k, m] of Object.entries(this.hands)) m.visible = k === name;
  }
  // voxel point -> stage metres
  toStage(x, y, z, out) {
    return out.set(x, y, z).applyMatrix4(this.vgToStage);
  }
  updateHands(dt) {
    const hs = this.hs, cam = this.g.camera;
    const camUp = V(0, 1, 0).applyQuaternion(cam.quaternion), camR = V(1, 0, 0).applyQuaternion(cam.quaternion), toCam = V(0, 0, 1).applyQuaternion(cam.quaternion);
    let tip, dir;
    if (this.candleAnim) {
      const a = this.candleAnim;
      a.t += dt;
      const k = smooth(Math.min(1, a.t / a.dur));
      tip = this.toStage(C.X0, a.from + (a.to - a.from) * k, C.Z0, V());
      dir = V(0.04, 1, 0.06).applyQuaternion(this.pk.quaternion).normalize(); // (straight down the opening)
    } else if (hs.target && hs.show) {
      // a right hand: the tool comes in from the right, the cut itself (and the face) in clear view
      tip = hs.target.clone();
      const din = hs.din || V(0, 0, -1);
      const sc = this.phase === 'scoop';
      dir = din.clone().multiplyScalar(sc ? -0.2 : -0.3).addScaledVector(camR, 0.62).addScaledVector(toCam, 0.55).addScaledVector(camUp, sc ? 0.3 : 0.16).normalize();
    } else {
      // resting on the table to the right
      tip = V(0.3, 0.02, 0.24);
      dir = V(0.15, 0.4, 1).normalize();
    }
    // sawing up and down while it cuts
    hs.saw = Math.max(0, hs.saw - dt * 5);
    const sawing = this.stroke && hs.saw > 0 ? Math.sin(this.t * 30) * (this.phase === 'scoop' ? 0.012 : 0.008) * Math.min(1.6, 0.6 + this.speed * 0.03) : 0;
    tip.addScaledVector(dir, sawing + (this.stroke || this.candleAnim ? 0 : 0.012));
    const k = 1 - Math.exp(-dt * (this.candleAnim ? 40 : 26));
    this.hand.position.lerp(tip, k);
    const z = toCam.clone().addScaledVector(dir, -toCam.dot(dir)).normalize();
    const x = V().crossVectors(dir, z);
    _q.setFromRotationMatrix(_m.makeBasis(x, dir, z));
    this.hand.quaternion.slerp(_q, 1 - Math.exp(-dt * 16));
    this.hand.visible = hs.show || !!this.candleAnim;
    // the left hand: steadying the pumpkin on its left side, or holding the lid up
    let lt, ld;
    if (this.lidPiv && this.lid?.stem) {
      lt = this.lid.stem.clone().multiplyScalar(SZ).applyQuaternion(this.lidPiv.quaternion).add(this.lidPiv.position);
      ld = V(-0.3, 1, 0.35).normalize();
    } else {
      // fingertips on the front-left of its flank, the bony fingers draped over it, the
      // forearm coming from Hank's side
      const c = this.pk.position;
      const s = V(-0.272, 0.03, 0.1).applyAxisAngle(V(1, 0, 0), this.tilt);
      lt = s.add(c);
      ld = V(-0.3, 0.6, 0.75).applyAxisAngle(V(1, 0, 0), this.tilt * 0.5).normalize();
    }
    this.lhand.position.lerp(lt, 1 - Math.exp(-dt * 14));
    const lz = V(1, 0.1, 0.2).addScaledVector(ld, -V(1, 0.1, 0.2).dot(ld)).normalize();
    _q.setFromRotationMatrix(_m.makeBasis(V().crossVectors(ld, lz), ld, lz));
    this.lhand.quaternion.slerp(_q, 1 - Math.exp(-dt * 10));
  }

  // ------------------------------------------------------------ every frame
  applyPose() {
    const pk = this.pk, t = this.tilt;
    pk.rotation.set(t, this.yaw, this.wobble ? Math.sin(this.t * 40) * 0.03 : 0, 'XYZ');
    // (sitting on the table whichever way it's tipped)
    const h = C.Y0 * SZ * Math.sqrt(Math.cos(t) ** 2 + (C.RZ / C.RY) ** 2 * Math.sin(t) ** 2);
    const sq = this.squashT !== undefined ? smooth(Math.min(1, this.squashT / 0.35)) : 0;
    pk.scale.set(1 + sq * 0.35, 1 - sq * 0.5, 1 + sq * 0.35);
    pk.position.set(0, h * (1 - sq * 0.5), 0);
    this.root.updateMatrixWorld(true);
    this.invVG = (this.invVG || new THREE.Matrix4()).copy(this.vg.matrixWorld).invert();
    this.vgToStage = (this.vgToStage || new THREE.Matrix4()).copy(this.root.matrixWorld).invert().multiply(this.vg.matrixWorld);
    this.pkWorld = (this.pkWorld || V()).setFromMatrixPosition(this.pk.matrixWorld);
  }
  tick(dt) {
    const g = this.g, S = this.S;
    this.t += dt;
    if (S.skip) { S.skip = false; if (!this.finished) this.back(); }
    if (this.done) return;
    // turning and tipping: eased; left alone a little off the front, it turns back
    if (this.phase === 'carve' && !this.finished) {
      this.turnIdle += dt;
      if (this.turnIdle > 2.5 && !this.stroke && !this.rot) {
        const off = wrapA(this.yawT);
        if (Math.abs(off) < 0.75) this.yawT -= off * Math.min(1, dt * 2);
        if (Math.abs(this.tiltT) < 0.3) this.tiltT -= this.tiltT * Math.min(1, dt * 2);
      }
    }
    this.yaw += (this.yawT - this.yaw) * (1 - Math.exp(-dt * (this.phase === 'pick' ? 3 : 9)));
    this.tilt += (this.tiltT - this.tilt) * (1 - Math.exp(-dt * 7));
    if (this.squashT !== undefined) this.squashT += dt;
    this.applyPose();
    // the clock
    if (this.phase === 'carve' && !this.finished) {
      const before = Math.ceil(this.left);
      this.left = Math.max(0, this.left - dt);
      const s = Math.ceil(this.left);
      if (s !== before && s <= 10 && s > 0) {
        this.sfx('clock_tick', { volume: s <= 5 ? 0.7 : 0.45, pitch: s <= 5 ? 1.25 : 1 });
        if (s === 10) this.say('Ten seconds!', 1400);
      }
      this.ui.classList.toggle('hurry', this.left <= 10);
      this.setClock(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, this.left / TIME);
      const noUndo = !this.undoStack.length;
      if (this.btn.undo && this.btn.undo.disabled !== noUndo) this.btn.undo.disabled = noUndo;
      if (this.left <= 0) this.finish('time');
    }
    // the lid in the air
    const la = this.lidAnim;
    if (la && this.lidPiv) {
      la.t += dt;
      const k = smooth(Math.min(1, la.t / la.dur));
      this.lidPiv.position.lerpVectors(la.p0, la.p1, k);
      this.lidPiv.quaternion.slerpQuaternions(la.q0, la.q1, k);
      if (la.t >= la.dur) { this.lidAnim = null; la.then?.(); }
    }
    // pieces cut free, falling in
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.v.y -= 70 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
      if (f.t > 0.9) { this.vg.remove(f.m); f.m.geometry.dispose(); this.falling.splice(i, 1); }
    }
    // the glow: up as the candle catches, then flickering
    if (this.glowK >= 0) {
      this.glowK = Math.min(1, this.glowK + dt / 0.7);
      if ((this.flickT = (this.flickT || 0) - dt) <= 0) {
        this.flickT = 0.07;
        this.flick = 1 + Math.sin(this.t * 11) * 0.07 + Math.sin(this.t * 23.7 + 1) * 0.05 + (Math.random() - 0.5) * 0.08;
      }
      this.glowMat.uniforms.uTint.value.setScalar((0.06 + 1.5 * this.glowK) * this.flick);
      if (this.light) this.light.intensity = (0.6 + 1.2 * this.glowK) * this.flick;
    } else if (this.light) this.light.intensity = Math.min(0.6, (this.light.intensity || 0) + dt * 1.5);
    const pk = this.pk.position;
    this.chips.update(dt, this.floor, { x: pk.x, y: pk.y, z: pk.z, rx: C.RX * SZ * 1.02, ry: C.RY * SZ * 1.02, rz: C.RZ * SZ * 1.02 });
    // a mouse hovering: the knife follows it even while the pumpkin turns under it
    if (this.hover && !this.stroke && !this.finished && (this.phase === 'carve' || this.phase === 'lid' || this.phase === 'scoop')) this.aim(this.hover.x, this.hover.y, false);
    this.updateHands(dt);
    this.remesh();
    if (this.judgeSoon && !this.stroke && this.phase === 'carve' && !this.finished) this.holding();
    // the screen turned (a phone on its side): frame the shot again
    if ((g.camera.aspect || 1.6) !== this.asp && this.shotName && !this.finished) this.shot(this.shotName, 0);
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.msgEl.classList.remove('on');
    if (this.sayT > 0 && (this.sayT -= dt) <= 0) this.sayEl.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) this.hintEl.classList.remove('on');
  }
  // rebuild the chunks a cut touched (all of them only when the candle lights it)
  remesh() {
    if (!this.dirty.size) return;
    for (const c of this.dirty) {
      const r = meshChunk(this.p, c, this.air);
      const ch = this.chunks[c] || (this.chunks[c] = {});
      ch.mesh = this.swap(ch.mesh, r.geo, this.mat, true);
      ch.glow = this.swap(ch.glow, r.glow, this.glowMat, false);
    }
    this.dirty.clear();
  }
  swap(m, geo, mat, cast) {
    if (!geo) {
      if (m) { if (m.geometry !== EMPTY) m.geometry.dispose(); m.geometry = EMPTY; m.visible = false; }
      return m;
    }
    if (!m) {
      m = voxMesh(geo, mat, { cast });
      this.vg.add(m);
      return m;
    }
    if (m.geometry !== EMPTY) m.geometry.dispose();
    m.geometry = geo;
    m.visible = true;
    return m;
  }
}
