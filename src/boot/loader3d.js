// The loading screen: a real 3D scene drawn through the game's own pipeline
// while the world builds. Hank sprints down a country road with the
// cocoa... and every so often his skull flies off, bounces down the road, and
// his headless body has to skid, turn round and go fetch it.
import * as THREE from 'three';
import { G } from '../render/shaderlib.js';
import { VoxelCharacter } from '../game/vchar.js';
import { Vox } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as PR from '../voxel/models/props.js';
import { makeTreeSprite } from '../world/forest2d.js';

const RUN = 5.6; // m/s
const TIPS = [
  'the cocoa is getting cold...',
  'reattaching femurs...',
  'stacking firewood...',
  'feeding the Canada geese...',
  'polishing skulls...',
  'warming the marshmallows...',
  'raking the maple leaves...',
  'waking up the lumberjack...',
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a 16 m tile of dirt road with grass verges, tufts, leaf litter and wheel ruts
function roadTile(seed) {
  const R = rng(seed);
  const VS = 0.125, L = 128, W = 112; // 16 m x 14 m
  const v = new Vox(L, 4, W);
  const grass = [0x5f7d30, 0x6b8a36, 0x56722c, 0x7a9040];
  const dirt = [0x80523a, 0x8a5c3e, 0x76492e, 0x946640];
  const leaf = [0xd8501e, 0xf08a2a, 0xe8b23a, 0xb8321e, 0xc86a24];
  // smooth blotches instead of per-voxel noise
  const blot = (x, z, f) => Math.sin(x * f + seed) * Math.sin(z * f * 1.3 + seed * 2) + Math.sin((x + z) * f * 0.7);
  for (let x = 0; x < L; x++) for (let z = 0; z < W; z++) {
    const edge = 15 + Math.round(Math.sin((x + seed * 9) * 0.11) * 1.5 + Math.sin(x * 0.37) * 0.6);
    const dz = Math.abs(z - W / 2 + 0.5);
    const road = dz < edge;
    const b = blot(x, z, 0.09);
    let c = road ? dirt[b > 0.9 ? 3 : b > 0 ? 1 : b > -0.9 ? 0 : 2] : grass[b > 0.8 ? 3 : b > 0 ? 1 : b > -0.8 ? 0 : 2];
    if (road && Math.abs(dz - 7) < 1.5) c = 0x6a4128; // ruts
    if (road && dz > edge - 2) c = 0x6e5a2e; // grassy shoulder
    const lr = R();
    if (lr < (road ? 0.025 : 0.09)) c = leaf[(R() * 5) | 0];
    v.set(x, 0, z, 0x3a2a1e);
    v.set(x, 1, z, c);
    if (!road) {
      const t = R();
      if (t < 0.05) { v.set(x, 2, z, grass[3]); if (t < 0.02) v.set(x, 3, z, 0x8aa048); }
      else if (t < 0.06) v.set(x, 2, z, leaf[(R() * 5) | 0]);
    } else if (R() < 0.004) v.set(x, 2, z, 0x8a8a82); // pebble
  }
  return meshVox(v, { size: VS, origin: [0, 2, W / 2], greedy: true });
}

const el = (tag, css, html = '') => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  e.innerHTML = html;
  return e;
};

export class Loader3D {
  constructor(pipeline) {
    this.pl = pipeline;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.p = 0;
    this.shown = 0;
    this.t = 0;
    this.running = false;
    this.exiting = false;
    this.tipI = 0;
    this.tipT = 0;
  }

  start() {
    const S = this.scene;
    // dusk sky gradient as the background (depth 1 = sky for the composite)
    const sky = document.createElement('canvas');
    sky.width = 4;
    sky.height = 256;
    const sg = sky.getContext('2d');
    const gr = sg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2a1840');
    gr.addColorStop(0.45, '#7a3050');
    gr.addColorStop(0.72, '#e2683a');
    gr.addColorStop(1, '#f8b450');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(sky);
    tex.colorSpace = THREE.NoColorSpace;
    S.background = tex;

    // warm low sun from behind the camera, with shadows
    G.uSunDir.value.set(0.35, 0.42, 0.84).normalize();
    G.uSunColor.value.setRGB(1.25, 0.82, 0.55);
    G.uSkyAmb.value.setRGB(0.42, 0.36, 0.58);
    G.uGroundAmb.value.setRGB(0.3, 0.2, 0.14);
    G.uNight.value = 0;
    for (const p of G.uPL.value) p.set(0, -999, 0, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
    sun.shadow.bias = -0.0008;
    sun.shadow.camera.updateProjectionMatrix();
    S.add(sun, sun.target);
    this.sun = sun;
    const P = this.pl.post;
    this.savedPost = { rays: P.uRays.value, fog: P.uFogDensity.value, refl: this.pl.reflections };
    P.uFogColor.value.setRGB(0.86, 0.5, 0.48);
    P.uFogDensity.value = 0.022;
    P.uFogMax.value = 0.9;
    P.uRays.value = 0;
    P.uFade.value = 1;
    this.pl.reflections = false;

    // road tiles that leapfrog ahead of Hank
    this.tiles = [];
    for (let i = 0; i < 4; i++) {
      const m = voxMesh(roadTile(11 + i), sharedVoxelMaterial(), { cast: false });
      m.position.set((i - 1) * 16, 0, 0);
      S.add(m);
      this.tiles.push(m);
    }
    // roadside props: pumpkins, hay, crates, mailboxes, signposts and trees
    const mk = (res, scale = 1) => {
      const g = meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true });
      return { g, scale };
    };
    const safe = (fn) => { try { return fn(); } catch (e) { console.warn('loader prop', e); return null; } };
    this.kinds = [
      safe(() => mk(PR.pumpkin({ seed: 4 }))),
      safe(() => mk(PR.hayBale({ seed: 2 }))),
      safe(() => mk(PR.hayBale({ seed: 5 }))),
      safe(() => mk(PR.appleCrate?.({ seed: 1 }) ?? PR.crate({}))),
      safe(() => mk(PR.mailbox({}))),
      safe(() => mk(PR.firewoodPile({}))),
      safe(() => mk(PR.milkChurn({}))),
      safe(() => mk(PR.signpost({}))),
    ].filter(Boolean);
    // the same pixel-art tree cards as the forest
    this.trees = ['maple', 'spruce', 'birch', 'maple2', 'pine', 'oak'].map((sp, i) => safe(() => makeTreeSprite(sp, i))).filter(Boolean);
    this.props = [];
    const R = rng(77);
    for (let i = 0; i < 26; i++) this.spawnProp(-14 + i * 2.6, R);
    for (let i = 0; i < 16; i++) this.spawnTree(-16 + i * 4.4, R);
    this.R = R;
    // maple leaves fluttering down across the shot
    const N = 70;
    const lg = new THREE.PlaneGeometry(0.12, 0.1);
    this.leaves = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    this.leaves.frustumCulled = false;
    const LC = [0xd8501e, 0xf08a2a, 0xe8b23a, 0xb8321e, 0xc86a24].map((c) => new THREE.Color(c).multiplyScalar(0.85));
    this.leafData = Array.from({ length: N }, (_, i) => {
      this.leaves.setColorAt(i, LC[i % LC.length]);
      return { x: (R() - 0.3) * 24, y: R() * 6, z: -4 + R() * 8, ph: R() * 6.3, sp: 0.5 + R() * 0.6 };
    });
    S.add(this.leaves);

    // the runner
    this.hank = new VoxelCharacter({ scene: S, physics: null }, 'hank', { x: 0, z: 0, y: 0, yaw: Math.PI / 2, anim: 'walk', expr: 'determined' });
    this.hank.groundSnap = false;
    this.hank.speedOverride = RUN;
    this.hp = this.hank.headPiece;
    this.headHome = { pos: this.hp.position.clone(), quat: this.hp.quaternion.clone() };
    this.state = 'run';
    this.stateT = 0;
    this.nextPop = parseFloat(new URLSearchParams(location.search).get('pop') || '3.2');
    this.x = 0;
    this.camX = 0;

    this.buildDom();
    window.__loader = this;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      if (this.paused) { this.last = now; requestAnimationFrame(loop); return; }
      this.frame(Math.min(1 / 30, (now - this.last) / 1000));
      this.last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.getElementById('boot')?.remove();
  }

  spawnProp(x, R) {
    const K = this.kinds[(R() * this.kinds.length) | 0];
    if (!K) return;
    const m = voxMesh(K.g, sharedVoxelMaterial());
    // mostly along the far verge; only the odd one on the near side, off to the edge of frame
    const side = R() < 0.78 ? -1 : 1;
    m.position.set(x, 0, side < 0 ? -(2.3 + R() * 1.8) : 2.2 + R() * 0.5);
    m.rotation.y = (side > 0 ? Math.PI : 0) + (R() - 0.5) * 0.9;
    this.scene.add(m);
    this.props.push(m);
  }

  spawnTree(x, R) {
    const T = this.trees[(R() * this.trees.length) | 0];
    if (!T) return;
    const m = T.clone();
    m.position.set(x, 0, -(6 + R() * 9));
    m.scale.setScalar(0.7 + R() * 0.4);
    this.scene.add(m);
    this.props.push(m);
  }

  buildDom() {
    const root = el('div', 'position:fixed;inset:0;z-index:90;pointer-events:none;font-family:BoldPixels,Monogram,monospace;color:#fff4e0;');
    root.id = 'loader3d';
    // pixel-art plate behind the progress bar: leather with gold corners
    const plate = document.createElement('canvas');
    plate.width = 120;
    plate.height = 20;
    const g = plate.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    R(1, 1, 118, 18, '#1e1418');
    R(2, 2, 116, 16, '#6b3d22');
    R(2, 2, 116, 1, '#8a5432');
    R(2, 17, 116, 1, '#3e2214');
    R(5, 6, 110, 8, '#2a1a14');
    for (const [cx, cy, fx, fy] of [[2, 2, 1, 1], [117, 2, -1, 1], [2, 17, 1, -1], [117, 17, -1, -1]]) {
      R(cx, cy, fx * 5 || 1, 1, '#f2c443');
      for (let k = 0; k < 5; k++) R(cx + fx * k, cy, 1, 1, '#f2c443');
      for (let k = 0; k < 5; k++) R(cx, cy + fy * k, 1, 1, '#f2c443');
      R(cx + fx, cy + fy, 1, 1, '#ffe08a');
      R(cx + fx * 2, cy + fy * 2, 1, 1, '#a86d1c');
    }
    this.barC = plate;
    const scale = Math.max(2, Math.min(4, Math.floor(Math.min(innerWidth / 200, innerHeight / 120))));
    const bar = el('div', `position:absolute;left:50%;bottom:${scale * 14}px;width:${120 * scale}px;height:${20 * scale}px;margin-left:${-60 * scale}px;`);
    const bg = el('div', `position:absolute;inset:0;background:url(${plate.toDataURL()}) 0 0/100% 100%;image-rendering:pixelated;`);
    this.fill = el('div', `position:absolute;left:${5 * scale}px;top:${6 * scale}px;height:${8 * scale}px;width:0;background:repeating-linear-gradient(90deg,#e8701e 0 ${4 * scale}px,#ffb04a ${4 * scale}px ${8 * scale}px);box-shadow:inset 0 ${scale}px 0 #ffd88a,inset 0 ${-scale}px 0 #a8401a;`);
    this.fillW = 110 * scale;
    bar.append(bg, this.fill);
    this.tip = el('div', `position:absolute;left:0;right:0;bottom:${scale * 36}px;text-align:center;font-family:Monogram,monospace;font-size:${12 * scale}px;line-height:1;color:#ffe8c8;text-shadow:${scale}px ${scale}px 0 #1e1418;`, TIPS[0]);
    // HURRY! in chunky bouncing letters
    const big = Math.max(2, scale) * 24;
    this.hurry = el('div', `position:absolute;left:0;right:0;top:${scale * 10}px;text-align:center;font-size:${big}px;line-height:1;white-space:nowrap;`);
    const colors = ['#fff4e0', '#ffd060'];
    this.letters = [...'HURRY!'].map((ch, i) => {
      const s = el('span', `display:inline-block;color:${colors[i % 2]};text-shadow:${scale}px ${scale}px 0 #c8361f,${scale * 2}px ${scale * 2}px 0 #c8361f,${scale * 3}px ${scale * 3}px 0 #1e1418;margin:0 ${scale}px;`, ch);
      this.hurry.appendChild(s);
      return s;
    });
    // little shout bubble for the head
    this.shout = el('div', `position:absolute;left:0;top:0;padding:${scale * 2}px ${scale * 4}px;background:#fffaf0;color:#1e1418;font-size:${12 * scale}px;line-height:1;box-shadow:0 0 0 ${scale}px #1e1418,${scale}px ${scale * 2}px 0 ${scale}px #1e1418;display:none;white-space:nowrap;`);
    this.scale = scale;
    root.append(this.hurry, this.tip, bar, this.shout);
    document.body.appendChild(root);
    this.dom = root;
  }

  progress(p, label) {
    this.p = Math.max(this.p, p);
    // long synchronous build steps starve rAF; keep the runner moving between them
    const now = performance.now();
    if (this.running && now - this.last > 50) {
      this.frame(Math.min(1 / 30, (now - this.last) / 1000));
      this.last = now;
    }
    void label;
  }

  // the skull pops off and tumbles down the road
  popHead() {
    const h = this.hank;
    this.scene.attach(this.hp);
    this.head = { v: new THREE.Vector3(RUN * 0.55, 4.2, (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(-6, 1.5, 9), rest: false };
    h.expr = 'shock';
    h.react('gasp');
    h.sfx?.('bone_rattle');
    this.say('BONK!', 0.7);
    this.state = 'headless';
    this.stateT = 0;
  }

  say(text, dur) {
    this.shout.textContent = text;
    this.shout.style.display = 'block';
    this.shoutT = dur;
  }

  updateHead(dt) {
    const H = this.head;
    if (!H || H.rest) return;
    const p = this.hp.position;
    H.v.y -= 15 * dt;
    p.addScaledVector(H.v, dt);
    const r = 0.26;
    if (p.y < r) {
      p.y = r;
      if (H.v.y < -1.2) {
        H.v.y *= -0.45;
        H.v.x *= 0.7;
        H.spin.multiplyScalar(0.6);
        this.hank.faceTex && (this.hank.expr = 'dizzy');
      } else {
        H.v.y = 0;
        H.v.x *= Math.exp(-3 * dt);
        H.spin.x = -H.v.x / r; // roll
        H.spin.y *= 0.9;
        H.spin.z *= 0.9;
        if (Math.abs(H.v.x) < 0.15) {
          H.rest = true;
          // settle upright-ish, facing the camera, looking cross
          this.hp.rotation.set(0, 0.3, 0.12);
          this.hank.expr = 'angry';
        }
      }
    }
    this.hp.rotation.x += H.spin.x * dt;
    this.hp.rotation.y += H.spin.y * dt;
    this.hp.rotation.z += H.spin.z * dt;
  }

  anim(a) {
    if (this.hank.anim !== a) this.hank.play(a);
  }

  frame(dt) {
    this.t += dt;
    this.stateT += dt;
    const h = this.hank;
    const P = this.pl.post;
    // fade in
    P.uFade.value = Math.max(this.exiting ? P.uFade.value : 0, P.uFade.value - dt * 1.5);
    let speed = 0;
    switch (this.state) {
      case 'run':
        speed = RUN;
        h.speedOverride = RUN;
        this.anim('walk');
        h.targetYaw = Math.PI / 2;
        if (!this.exiting && this.t > this.nextPop) this.popHead();
        break;
      case 'headless':
        // keeps running a few steps, arms flailing, then skids
        speed = RUN * Math.max(0, 1 - this.stateT / 0.9);
        h.speedOverride = speed;
        this.anim(this.stateT < 0.5 ? 'walk' : 'flail');
        if (this.stateT > 1.1) { this.state = 'turn'; this.stateT = 0; h.targetYaw = -Math.PI / 2; h.react('trip'); }
        break;
      case 'turn': {
        speed = 0;
        h.speedOverride = 0;
        this.anim('scared');
        if (this.stateT > 0.5) { this.state = 'fetch'; this.stateT = 0; this.say('MY HEAD!', 1.2); }
        break;
      }
      case 'fetch': {
        const hx = this.hp.position.x;
        const d = hx - this.x;
        h.targetYaw = d < 0 ? -Math.PI / 2 : Math.PI / 2;
        if (Math.abs(d) > 0.5 && this.head.rest) {
          speed = Math.sign(d) * 3.8;
          h.speedOverride = Math.abs(speed);
          this.anim('walk');
        } else if (this.head.rest) {
          speed = 0;
          h.speedOverride = 0;
          this.state = 'grab';
          this.stateT = 0;
          this.anim('bow');
          this.grabFrom = { pos: this.hp.position.clone(), quat: this.hp.quaternion.clone() };
        } else {
          h.speedOverride = 0;
          this.anim('think');
        }
        break;
      }
      case 'grab': {
        speed = 0;
        if (this.stateT > 0.35 && this.grabFrom) {
          // pop it back on the neck
          h.headJ.attach(this.hp);
          this.hp.position.copy(this.headHome.pos);
          this.hp.quaternion.copy(this.headHome.quat);
          this.grabFrom = null;
          this.head = null;
          h.kick?.('sq', 0.7);
          h.expr = 'sheepish';
          this.anim('idle');
          this.say('...nobody saw that.', 1.3);
        }
        if (this.stateT > 1.2) {
          h.targetYaw = Math.PI / 2;
          h.expr = 'determined';
          this.state = 'run';
          this.stateT = 0;
          this.nextPop = this.t + 5 + Math.random() * 3;
        }
        break;
      }
      default: break;
    }
    if (this.exiting) { speed = RUN * 1.6; h.speedOverride = RUN * 1.4; this.anim('walk'); }
    this.x += speed * dt;
    h.pos.set(this.x, 0, 0);
    this.updateHead(dt);
    h.update(dt, this.camera.position);

    // recycle the road and roadside ahead of the camera
    for (const m of this.tiles) if (m.position.x < this.camX - 24) m.position.x += 64;
    for (const m of this.props) {
      if (m.position.x < this.camX - 16) {
        m.position.x += 34 + this.R() * 4;
        m.rotation.y = this.R() * 6.3;
      }
    }

    const lm = new THREE.Matrix4(), lq = new THREE.Quaternion(), le = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), lp = new THREE.Vector3();
    this.leafData.forEach((L, i) => {
      L.y -= L.sp * dt;
      L.ph += dt * 3;
      L.x -= dt * 1.2;
      if (L.y < 0.05 || L.x < this.camX - 12) { L.y = 5 + this.R() * 2; L.x = this.camX - 4 + this.R() * 18; }
      lp.set(L.x + Math.sin(L.ph) * 0.4, L.y, L.z + Math.cos(L.ph * 0.7) * 0.3);
      lq.setFromEuler(le.set(L.ph, L.ph * 0.6, Math.sin(L.ph) * 1.2));
      this.leaves.setMatrixAt(i, lm.compose(lp, lq, one));
    });
    this.leaves.instanceMatrix.needsUpdate = true;

    // side-on tracking shot with a little lead and a bobbing handheld feel
    const lead = this.state === 'run' ? 1.4 : 0;
    const want = (this.head && !this.exiting ? (this.x + this.hp.position.x) / 2 : this.x) + lead;
    if (!this.exiting) this.camX += (want - this.camX) * (1 - Math.exp(-3 * dt));
    const asp = innerWidth / innerHeight;
    const dist = asp < 1 ? 9.5 : 6.4;
    const cam = this.camera;
    cam.position.set(this.camX - 0.6, 1.5 + Math.sin(this.t * 2.1) * 0.04, dist);
    cam.lookAt(this.camX + 0.4, 0.75, 0);
    cam.aspect = this.pl.w / this.pl.h;
    cam.updateProjectionMatrix();
    this.sun.position.set(this.camX + 8, 12, 20);
    this.sun.target.position.set(this.camX, 0, 0);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    G.uTime.value += dt;
    G.uCamPos.value.copy(cam.position);
    this.pl.render(this.scene, cam);

    // DOM: bar eases toward progress, letters hop in a wave, tips rotate
    this.shown += (this.p - this.shown) * (1 - Math.exp(-6 * dt));
    this.fill.style.width = `${Math.round(this.shown * this.fillW / this.scale) * this.scale}px`;
    const sc = this.scale;
    this.letters.forEach((s, i) => {
      const k = Math.max(0, Math.sin(this.t * 11 - i * 0.9));
      s.style.transform = `translateY(${-Math.round(k * 4) * sc}px)`;
    });
    this.tipT += dt;
    if (this.tipT > 1.6) {
      this.tipT = 0;
      this.tipI = (this.tipI + 1) % TIPS.length;
      this.tip.textContent = TIPS[this.tipI];
    }
    if (this.shoutT > 0) {
      this.shoutT -= dt;
      const at = (this.head ? this.hp.position : h.headWorld()).clone();
      at.y += 0.5;
      at.project(cam);
      const x = Math.round(((at.x + 1) / 2) * innerWidth), y = Math.round(((1 - at.y) / 2) * innerHeight);
      this.shout.style.transform = `translate(${x - Math.round(this.shout.offsetWidth / 2)}px, ${y - this.shout.offsetHeight - sc * 4}px)`;
      if (this.shoutT <= 0) this.shout.style.display = 'none';
    }
  }

  // Hank sprints out of shot, the screen fades, everything is torn down
  async finish(quick = false) {
    if (!this.running) return;
    if (this.head) {
      // never leave him headless
      this.hank.headJ.attach(this.hp);
      this.hp.position.copy(this.headHome.pos);
      this.hp.quaternion.copy(this.headHome.quat);
      this.head = null;
    }
    this.p = 1;
    this.state = 'run';
    this.exiting = true;
    this.letters.forEach((s, i) => (s.textContent = 'GO!!!!'[i] || ''));
    if (!quick) {
      await new Promise((r) => setTimeout(r, 650));
      const P = this.pl.post;
      const t0 = performance.now();
      await new Promise((r) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 450);
          P.uFade.value = k;
          this.dom.style.opacity = String(1 - k);
          if (k < 1) requestAnimationFrame(step);
          else r();
        };
        step();
      });
    }
    this.running = false;
    this.dom.remove();
    this.hank.dispose?.();
    this.scene.traverse((o) => o.geometry?.dispose?.());
    this.scene.background?.dispose?.();
    this.sun.shadow.map?.dispose();
    const P = this.pl.post;
    P.uRays.value = this.savedPost.rays;
    P.uFogDensity.value = this.savedPost.fog;
    this.pl.reflections = this.savedPost.refl;
  }
}
