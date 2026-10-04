// Poutine before she was Poutine: a little orange tabby wandering the road home on
// the first evening. She trots along the verge, stops to sniff, sits to wash a paw,
// meows at nothing in particular. When Hank comes by she notices him; rush at her and
// she arches up, hisses and skitters off, but a calm, slow skeleton makes her curious:
// she creeps up, sits, mrrps, winds round his shins and then tags along behind him
// until he scoops her up (Story.catRescue).
import * as THREE from 'three';
import { Vox, tone } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { ROADS, POI } from '../world/layout.js';

const VS = 0.03; // metres per voxel
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const damp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---------------------------------------------------------------- the model (orange tabby)
const FUR = 0xe8a050, STRIPE = 0xc4762c, CREAM = 0xfff0d8, EYE = 0x60c0e8, PINK = 0xe88aa0, INK = 0x2a1a18;

// paint the frontmost voxel (largest z) at (x, y)
function front(v, x, y, c) {
  for (let z = v.d - 1; z >= 0; z--) if (v.get(x, y, z)) { v.set(x, y, z, c); return z; }
  return -1;
}
function torsoVox() {
  const v = new Vox(9, 9, 17);
  v.ellipsoid(4, 4, 8, 3.4, 3.3, 7.6, (x, y, z) => {
    if (y < 2.6 && Math.abs(x - 4) < 2.2) return CREAM;
    if (y > 3 && (z + (Math.abs(x - 4) > 2 ? 1 : 0)) % 4 === 0) return STRIPE;
    return FUR;
  });
  v.fill(3, 6, 14, 5, 7, 15, CREAM); // chest ruff
  return { vox: v, origin: [4.5, 4.5, 8.5] };
}
// head; mode: 'open' (eyes open), 'blink' (content, eyes shut), 'meow' (mouth open)
function headVox(mode = 'open') {
  const v = new Vox(11, 11, 9);
  v.ellipsoid(5, 4, 4, 4.2, 3.6, 3.6, (x, y, z) => (y > 5 && (x === 4 || x === 6) && z < 6 ? STRIPE : FUR));
  v.fill(4, 1, 6, 6, 3, 8, CREAM); // muzzle
  v.set(5, 3, 8, PINK); // nose
  // ears (outer fur, pink inside)
  for (const s of [-1, 1]) {
    const ex = 5 + s * 3;
    v.fill(ex - 1, 7, 2, ex + 1, 7, 4, FUR);
    v.fill(ex - (s < 0 ? 1 : 0), 8, 2, ex + (s > 0 ? 1 : 0), 8, 4, FUR);
    v.set(ex + s, 9, 3, FUR);
    v.set(ex, 7, 4, PINK); v.set(ex, 8, 4, PINK);
  }
  for (const x of [3, 7]) {
    if (mode === 'blink') front(v, x, 5, INK);
    else { front(v, x, 5, EYE); front(v, x, 4, mode === 'meow' ? EYE : INK); }
  }
  if (mode === 'meow') { v.set(5, 1, 8, PINK); v.set(5, 2, 8, INK); v.set(4, 1, 8, INK); v.set(6, 1, 8, INK); }
  // whisker dots
  for (const x of [3, 7]) v.set(x, 2, 7, tone(CREAM, -0.08));
  return { vox: v, origin: [5.5, 1.5, 2] };
}
function legVox(back) {
  const v = new Vox(2, 7, 3);
  v.fill(0, 1, 0, 1, 6, 1, back ? STRIPE : FUR);
  v.fill(0, 4, 0, 1, 6, 1, FUR);
  v.fill(0, 0, 0, 1, 0, 2, CREAM); // paw
  return { vox: v, origin: [1, 6.5, 1] };
}
function tailVox(tip) {
  const v = new Vox(2, 2, 5);
  v.fill(0, 0, 0, 1, 1, 4, (x, y, z) => (tip && z < 2 ? tone(STRIPE, -0.1) : z % 3 === 0 ? STRIPE : FUR));
  return { vox: v, origin: [1, 1, 4.6] };
}

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const m = (r) => meshVox(r.vox, { size: VS, origin: r.origin, jitter: 0.02 });
  GEO = {
    torso: m(torsoVox()),
    head: m(headVox('open')), blink: m(headVox('blink')), meow: m(headVox('meow')),
    legF: m(legVox(false)), legB: m(legVox(true)),
    tail: m(tailVox(false)), tip: m(tailVox(true)),
  };
  return GEO;
}

// an articulated voxel cat: root (on the ground) > body > head / legs / tail chain
export class VoxelCat {
  constructor(scene) {
    const G = geos(), mat = sharedVoxelMaterial();
    const mesh = (g) => { const x = voxMesh(g, mat); x.castShadow = true; return x; };
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.torso = mesh(G.torso);
    this.body.add(this.torso);
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.06, 0.2);
    this.body.add(this.neck);
    this.heads = { open: mesh(G.head), blink: mesh(G.blink), meow: mesh(G.meow) };
    for (const h of Object.values(this.heads)) { this.neck.add(h); h.visible = false; }
    this.heads.open.visible = true;
    this.face = 'open';
    this.legs = [];
    for (const [x, z, back] of [[-0.06, 0.15, 0], [0.06, 0.15, 0], [-0.06, -0.15, 1], [0.06, -0.15, 1]]) {
      const p = new THREE.Group();
      p.position.set(x, -0.04, z);
      p.add(mesh(back ? G.legB : G.legF));
      this.body.add(p);
      this.legs.push(p);
    }
    this.tail = [];
    let parent = this.body;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      p.position.set(0, i ? 0 : 0.05, i ? -0.13 : -0.22);
      p.add(mesh(i === 2 ? G.tip : G.tail));
      parent.add(p);
      parent = p;
      this.tail.push(p);
    }
    // pose parameters (eased toward each state's targets every frame)
    this.P = { y: 0.2, pitch: 0, z: 0, head: 0, headYaw: 0, headRoll: 0, front: 0, back: 0, t1: 0.9, t2: 0.4, t3: -0.3, curl: 0, arch: 0, paw: 0 };
    this.ph = 0;
    this.t = 0;
    scene.add(this.root);
  }
  setFace(f) {
    if (f === this.face) return;
    this.heads[this.face].visible = false;
    this.heads[f].visible = true;
    this.face = f;
  }
  // targets for a named pose
  static pose(name) {
    switch (name) {
      case 'sit': return { y: 0.15, pitch: -0.62, z: -0.06, head: 0.5, front: 0.62, back: -0.95, t1: 0.45, t2: 0.9, t3: 0.8, curl: 1, arch: 0, paw: 0 };
      case 'groom': return { y: 0.15, pitch: -0.62, z: -0.06, head: 0.95, headYaw: 0.35, front: 0.62, back: -0.95, t1: 0.45, t2: 0.9, t3: 0.8, curl: 1, arch: 0, paw: 1 };
      case 'sniff': return { y: 0.205, pitch: 0.16, z: 0, head: 0.75, front: -0.16, back: -0.16, t1: 0.35, t2: 0.3, t3: -0.2, curl: 0, arch: 0, paw: 0 };
      case 'crouch': return { y: 0.17, pitch: 0.06, z: 0, head: 0.1, front: -0.3, back: 0.35, t1: 0.3, t2: 0.5, t3: -0.6, curl: 0, arch: 0, paw: 0 };
      case 'arch': return { y: 0.28, pitch: 0, z: 0, head: 0.35, front: 0, back: 0, t1: 1.45, t2: 0.05, t3: 0, curl: 0, arch: 1, paw: 0 };
      default: return { y: 0.225, pitch: 0, z: 0, head: 0.05, front: 0, back: 0, t1: 1.05, t2: 0.35, t3: -0.45, curl: 0, arch: 0, paw: 0 };
    }
  }
  // animate: target pose, walking speed (m/s), dt
  animate(dt, target, speed) {
    const P = this.P, k = Math.min(1, dt * 9);
    this.t += dt;
    for (const key in target) if (key in P) P[key] = damp(P[key], target[key], k);
    if (!('headYaw' in target)) P.headYaw = damp(P.headYaw, 0, k);
    if (!('headRoll' in target)) P.headRoll = damp(P.headRoll, 0, k);
    const moving = speed > 0.05;
    this.ph += dt * (2.5 + speed * 11);
    const sw = moving ? Math.min(0.75, 0.35 + speed * 0.25) : 0;
    const s = Math.sin(this.ph), c = Math.cos(this.ph);
    const B = this.body;
    B.position.set(0, P.y + (moving ? Math.abs(c) * 0.012 : Math.sin(this.t * 1.7) * 0.003), P.z);
    B.rotation.set(P.pitch + (moving ? s * 0.03 : 0), 0, 0);
    this.torso.scale.set(1 - P.arch * 0.1, 1 + P.arch * 0.28 + (moving ? 0 : Math.sin(this.t * 2.2) * 0.012), 1 - P.arch * 0.06);
    this.torso.position.y = P.arch * 0.03;
    // legs: diagonal pairs swing together
    const [FL, FR, BL, BR] = this.legs;
    FL.rotation.x = P.front + s * sw;
    BR.rotation.x = P.back + s * sw;
    FR.rotation.x = P.front - s * sw + P.paw * (-1.5 + Math.sin(this.t * 9) * 0.25);
    BL.rotation.x = P.back - s * sw;
    for (const L of this.legs) L.scale.y = 1 + P.arch * 0.15;
    // head
    const N = this.neck;
    N.rotation.set(P.head + (moving ? c * 0.05 : 0) + P.paw * Math.sin(this.t * 9) * 0.08, P.headYaw, P.headRoll);
    N.position.y = 0.06 - P.arch * 0.04;
    // tail chain: lifts, curls round the paws when sitting, sways
    const sway = Math.sin(this.t * (P.arch ? 18 : 1.6)) * (P.arch ? 0.08 : 0.25);
    const [T1, T2, T3] = this.tail;
    T1.rotation.set(P.t1, sway * 0.4, 0);
    T2.rotation.set(P.t2 * (1 - P.curl), sway + P.curl * 1.1, 0);
    T3.rotation.set(P.t3 * (1 - P.curl), sway * 1.3 + P.curl * 1.2, 0);
    const puff = 1 + P.arch * 0.8;
    for (const T of this.tail) T.scale.set(puff, puff, 1);
  }
  headWorld(out = new THREE.Vector3()) {
    this.neck.updateWorldMatrix(true, false);
    return out.set(0, 0.16, 0.06).applyMatrix4(this.neck.matrixWorld);
  }
  remove() {
    this.root.parent?.remove(this.root);
  }
}

// ---------------------------------------------------------------- where she wanders: the verges of the road home
function verges() {
  const R = ROADS.find((r) => r.id === 'main');
  const pts = [];
  const P = R.pts.filter(([x]) => x > -132 && x < -52);
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = hyp(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let t = 0; t < len; t += 3) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      for (const side of [-1, 1]) for (const off of [3.6, 5.5, 7.5]) pts.push({ x: x + nx * side * off, z: z + nz * side * off });
    }
  }
  return pts;
}

// ---------------------------------------------------------------- her little mind
export class StrayCat {
  constructor(game, at = POI.catLog) {
    this.g = game;
    this.cat = new VoxelCat(game.scene);
    this.pos = new THREE.Vector3(at.x, 0, at.z);
    this.pos.y = game.physics.groundAt(at.x, at.z, 100).h;
    this.yaw = rand(0, Math.PI * 2);
    this.state = 'sit';
    this.t = rand(2, 4);
    this.to = null;
    this.speed = 0;
    this.trust = 0; // seconds of calm company; enough of it and she comes over
    this.cool = { meow: rand(3, 6), notice: 0, hiss: 0 };
    this.scripted = false;
    this.spots = verges().filter((p) => {
      const g = game.physics.groundAt(p.x, p.z, 100);
      return !g.water && g.h > 0.4;
    });
    this.tagPos = new THREE.Vector3();
    this.blinkT = 2;
    this.target = VoxelCat.pose('sit');
  }
  get visible() { return this.cat.root.visible; }
  get root() { return this.cat.root; }
  headWorld(out) { return this.cat.headWorld(out); }
  remove() {
    this.cat.remove();
  }

  // ------------------------------------------------------------ little noises
  sfx(name, vol = 1, pitch = 1) {
    const g = this.g, cam = g.camera;
    const d = this.pos.distanceTo(cam.position);
    if (d > 45) return;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const pan = Math.max(-1, Math.min(1, this.pos.clone().sub(cam.position).normalize().dot(right)));
    g.sound.play(name, { volume: vol * Math.max(0, 1 - d / 45), pan, pitch: pitch * rand(0.94, 1.08) });
  }
  say(text, ms = 1400) {
    this.g.ui?.tag('cat:stray', text, this.tagPos, ms);
  }
  emote(name, s = 1.6) {
    this.g.emotes?.show(this, name, s);
  }
  meow(sad = false) {
    this.cool.meow = rand(7, 14);
    this.setFace('meow', 0.5);
    this.sfx(sad ? 'meow_sad' : pick(['meow', 'cat_meow_happy']), 0.8, sad ? 0.95 : rand(1.05, 1.3));
    this.say(sad ? pick(['Mew...', 'Mrrrow...']) : pick(['Mrrp?', 'Mew!', 'Mrrrow?', 'Mrrt.']));
    this.emote('note', 1.4);
  }
  setFace(f, s) {
    this.cat.setFace(f);
    this.faceT = s;
  }

  // ------------------------------------------------------------ what Hank can do near her
  action(p, slow) {
    if (this.scripted || !slow || ['startle', 'skitter'].includes(this.state)) return null;
    if (hyp(p.x - this.pos.x, p.z - this.pos.z) > 2.4 || Math.abs(p.y - this.pos.y) > 2) return null;
    return { text: this.friendly ? 'Scoop up the little cat' : 'Crouch down by the little cat', fn: () => this.g.story.catRescue() };
  }
  get friendly() {
    return ['rub', 'follow', 'wait', 'curious', 'sitBy'].includes(this.state) || this.trust > 3;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g;
    const H = g.playerPos;
    const d = hyp(H.x - this.pos.x, H.z - this.pos.z);
    const far = d > 120;
    this.cat.root.visible = !far;
    if (far && !this.scripted) return;
    if (this.faceT != null && (this.faceT -= dt) <= 0) { this.faceT = null; this.cat.setFace('open'); }
    if (!this.scripted) this.think(dt, d, H);
    // move
    let speed = 0;
    if (this.to) {
      const dx = this.to.x - this.pos.x, dz = this.to.z - this.pos.z, dd = hyp(dx, dz);
      if (dd < 0.08) { this.to = null; this.arrived = true; }
      else {
        speed = Math.min(this.speed, dd * 4);
        const st = Math.min(dd, speed * dt);
        this.pos.x += (dx / dd) * st;
        this.pos.z += (dz / dd) * st;
        this.yawTo = Math.atan2(dx, dz);
        g.physics.resolve(this.pos, 0.16, 0.4);
      }
    }
    if (this.yawTo != null) this.yaw += angDiff(this.yaw, this.yawTo) * Math.min(1, dt * (speed > 2 ? 12 : 7));
    this.pos.y = g.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6).h;
    const R = this.cat.root;
    R.position.copy(this.pos);
    if (this.hopT > 0) { this.hopT -= dt; R.position.y += Math.sin(Math.max(0, this.hopT / 0.4) * Math.PI) * 0.14; }
    R.rotation.y = this.yaw;
    // a slow blink now and then (cats say "I trust you" that way)
    if ((this.blinkT -= dt) < 0) {
      this.blinkT = rand(2.5, 6);
      if (this.cat.face === 'open' && !['startle', 'skitter'].includes(this.state)) this.setFace('blink', this.friendly ? 0.5 : 0.15);
    }
    this.cat.animate(dt, this.target, speed);
    this.tagPos.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
  }

  go(x, z, speed, pose = 'walk') {
    this.to = { x, z };
    this.speed = speed;
    this.arrived = false;
    this.target = VoxelCat.pose(pose);
  }
  stop(pose) {
    this.to = null;
    this.target = VoxelCat.pose(pose);
  }
  faceHank(H) {
    this.yawTo = Math.atan2(H.x - this.pos.x, H.z - this.pos.z);
  }
  set(state, t, pose) {
    this.state = state;
    this.t = t;
    if (pose) this.stop(pose);
  }

  think(dt, d, H) {
    const g = this.g;
    const live = g.mode === 'ride' && !g.interior?.active;
    const sp = live ? (g.onFoot ? g.walker.speed || 0 : g.bike.speed || 0) : 0;
    for (const k in this.cool) this.cool[k] -= dt;
    this.t -= dt;
    const calm = live && sp < 2.2 && d < 11;
    const rushing = live && sp > 4.5 && d < 7.5 && !this.friendly;
    // ------------------------------------------------ reactions to Hank
    if (live && ['wander', 'sniff', 'sit', 'groom', 'watch', 'curious', 'sitBy'].includes(this.state)) {
      if ((rushing || (d < 2.6 && sp > 2.5 && this.trust < 2)) && !(this.cool.hiss > 0)) return this.startle(H);
      if (calm) this.trust += dt * (g.onFoot ? 1.3 : 0.8);
      if (d < 14 && !(this.cool.notice > 0) && ['wander', 'sniff', 'sit', 'groom'].includes(this.state)) {
        // ears up: who's that?
        this.cool.notice = 30;
        this.set('watch', rand(2.5, 4), 'sit');
        this.faceHank(H);
        this.emote(this.trust > 1 ? 'question' : 'alert', 1.4);
        if (Math.random() < 0.6) this.meow();
        return;
      }
      if (this.trust > 2.6 && this.state !== 'curious' && this.state !== 'sitBy' && d < 11) {
        this.set('curious', 6);
        this.emote('question', 1.5);
        this.say('Mrrp?');
        this.sfx('meow', 0.6, 1.35);
      }
    }
    switch (this.state) {
      case 'sit': case 'groom': case 'sniff': {
        if (this.t > 0) {
          if (this.state !== 'sniff' && !(this.cool.meow > 0) && Math.random() < dt * 0.25) this.meow();
          if (this.state === 'sit' && Math.random() < dt * 0.12) { this.state = 'groom'; this.target = VoxelCat.pose('groom'); }
          else if (this.state === 'groom' && Math.random() < dt * 0.3) { this.state = 'sit'; this.target = VoxelCat.pose('sit'); }
          if (this.state === 'sniff') this.target.head = 0.7 + Math.sin(g.time * 14) * 0.06;
          return;
        }
        return this.wander();
      }
      case 'wander': {
        if (this.arrived || this.t < 0) {
          const r = Math.random();
          if (r < 0.45) this.set('sniff', rand(1.5, 3.2), 'sniff');
          else if (r < 0.8) this.set('sit', rand(4, 9), 'sit');
          else this.wander();
        }
        return;
      }
      case 'watch': {
        if (live) this.faceHank(H);
        this.cat.P.headYaw = 0;
        if (this.t < 0) {
          if (this.trust > 1.2 && d < 12) { this.set('curious', 6); this.say('Mrrp?'); }
          else this.set('sit', rand(3, 6), 'sit');
        }
        return;
      }
      case 'startle': {
        if (this.t < 0) {
          // skitter off, away from Hank
          const dx = this.pos.x - H.x, dz = this.pos.z - H.z, dd = hyp(dx, dz) || 1;
          const tx = this.pos.x + (dx / dd) * rand(4.5, 6.5), tz = this.pos.z + (dz / dd) * rand(4.5, 6.5);
          const gnd = g.physics.groundAt(tx, tz, this.pos.y + 1);
          if (gnd.water || Math.abs(gnd.h - this.pos.y) > 1.6) this.go(this.pos.x - (dz / dd) * 4, this.pos.z + (dx / dd) * 4, 4.2, 'crouch');
          else this.go(tx, tz, 4.2, 'crouch');
          this.state = 'skitter';
          this.t = 2.5;
        }
        return;
      }
      case 'skitter': {
        if (this.arrived || this.t < 0) {
          // from a safe distance she watches, curious despite herself
          this.set('watch', rand(3, 5), 'sit');
          this.faceHank(H);
          this.cool.notice = 30;
        }
        return;
      }
      case 'curious': {
        // creep up, low and slow, and sit just out of reach
        if (!live || d > 14 || sp > 3.5) { this.set('watch', 3, 'sit'); this.trust = Math.max(0, this.trust - 1); return; }
        if (d > 1.5) {
          const dx = H.x - this.pos.x, dz = H.z - this.pos.z;
          this.go(H.x - (dx / d) * 1.3, H.z - (dz / d) * 1.3, d > 4 ? 0.9 : 0.5, 'crouch');
        } else {
          this.set('sitBy', rand(2, 3), 'sit');
          this.faceHank(H);
          this.say('Mrrrp.');
          this.sfx('purr', 0.6);
          this.emote('heart', 1.5);
        }
        return;
      }
      case 'sitBy': {
        if (live) this.faceHank(H);
        if (d > 3) { this.state = 'follow'; return; }
        if (this.t < 0) { this.state = 'rub'; this.t = rand(3.5, 5); this.ang = Math.atan2(this.pos.z - H.z, this.pos.x - H.x); }
        return;
      }
      case 'rub': {
        // wind round his shins, tail up, purring
        this.ang = (this.ang || 0) + dt * 1.5;
        this.go(H.x + Math.cos(this.ang) * 0.6, H.z + Math.sin(this.ang) * 0.6, 1.2, 'walk');
        this.target.headRoll = 0.35;
        this.target.t1 = 1.4;
        if (!(this.cool.purr > 0)) { this.cool.purr = 2.6; this.sfx('purr', 0.7); this.g.effects?.hearts(this.pos.x, this.pos.y + 0.45, this.pos.z, 1); }
        if (this.t < 0 || d > 2.5) { this.state = 'follow'; this.t = 0; }
        return;
      }
      case 'follow': {
        // tag along behind him; if he races off, sit down and complain
        if (d > 16 && sp > 4) { this.set('wait', rand(5, 8), 'sit'); this.faceHank(H); this.meow(true); return; }
        if (d > 1.9) {
          const dx = H.x - this.pos.x, dz = H.z - this.pos.z;
          this.go(H.x - (dx / d) * 1.4, H.z - (dz / d) * 1.4, Math.min(4.4, 0.8 + d * 0.45), d > 5 ? 'crouch' : 'walk');
          this.target = VoxelCat.pose('walk');
          this.target.t1 = 1.35;
        } else {
          this.stop('sit');
          this.faceHank(H);
          if (!(this.cool.meow > 0) && Math.random() < dt * 0.3) this.meow();
        }
        return;
      }
      case 'wait': {
        if (live) this.faceHank(H);
        if (d < 10) { this.state = 'follow'; this.emote('heart', 1.2); return; }
        if (this.t < 0) { this.trust = Math.min(this.trust, 1.5); this.set('sit', rand(3, 6), 'sit'); }
        return;
      }
      default:
        this.wander();
    }
  }

  wander() {
    // somewhere a few metres away along the verge (now and then she crosses the road)
    const near = this.spots.filter((p) => { const dd = hyp(p.x - this.pos.x, p.z - this.pos.z); return dd > 2.5 && dd < 10; });
    const home = POI.catLog;
    const pool = near.filter((p) => hyp(p.x - home.x, p.z - home.z) < 30);
    const to = pick(pool.length ? pool : near.length ? near : this.spots);
    this.state = 'wander';
    this.t = 12;
    if (to) this.go(to.x, to.z, rand(0.45, 0.7), 'walk');
  }

  startle(H) {
    this.cool.hiss = 6;
    this.trust = Math.max(0, this.trust - 1.5);
    this.set('startle', 1.1, 'arch');
    this.faceHank(H);
    this.setFace('meow', 1.1);
    this.hopT = 0.4;
    this.sfx('cat_hiss', 0.9);
    this.say('HSSSSS!', 1200);
    this.emote('alert', 1.2);
  }

  // ------------------------------------------------------------ the rescue scene drives her by hand
  script(on) {
    this.scripted = on;
    if (on) this.to = null;
  }
  // scene helpers: strike a pose / walk to a point (resolves on arrival)
  pose(name, face) {
    this.stop(name);
    if (face) this.setFace(face, 1.2);
  }
  walkTo(x, z, speed = 0.8, pose = 'walk') {
    this.go(x, z, speed, pose);
    return new Promise((res) => {
      const tick = () => (this.arrived || !this.to ? res() : this.g.wait(0.05).then(tick));
      tick();
    });
  }
}
