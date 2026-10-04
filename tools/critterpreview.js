// Animated contact sheet of the voxel wildlife: every species in a grid, cycling
// through its animations with the game's own puppets and animator.
// /tools/critterpreview.html?kind=deer,fox&anim=walk,run&cols=6&cell=2.4&night&slow=0.5
import * as THREE from 'three';
import { G } from '../src/render/shaderlib.js';
import { createVoxelMaterial } from '../src/render/voxelMaterial.js';
import { SPECIES, rigDef } from '../src/voxel/models/animals.js';
import { RigSpecies, composePose, PS, MS } from '../src/render/voxelRig.js';
import { poseCritter } from '../src/game/critterAnim.js';

const q = new URLSearchParams(location.search);
// per body plan: [anim, speed (m/s), seconds]; k: a 0..1 phase the AI would drive (hops, pounces, leaps)
const ANIMS = {
  quad: [['idle', 0, 3], ['walk', 0.32, 4], ['trot', 0.75, 3], ['run', 2.4, 3], ['graze', 0, 4], ['alert', 0, 3]],
  hopper: [['idle', 0, 3], ['eat', 0, 3], ['nibble', 0, 3], ['alert', 0, 2], ['hop', 0, 3, 'hopK', 0.45], ['run', 1, 3], ['climb', 0, 3], ['perch', 0, 2]],
  bird: [['idle', 0, 3], ['peck', 0, 3], ['hop', 0, 2, 'hopK', 0.22], ['fly', 6, 4], ['glide', 6, 3]],
  frog: [['idle', 0, 4], ['leap', 0, 3, 'lK', 0.55]],
  fish: [['jump', 0, 3]],
  bug: [['fly', 0.5, 5], ['rest', 0, 4]],
  swim: [['swim', 0.5, 6]],
  bin: [['idle', 0, 3], ['rummage', 0, 3]],
};
const EXTRA = {
  fox: [['sit', 0, 3], ['listen', 0, 3], ['crouch', 0, 1, 'crK', 1], ['pounce', 0, 1, 'pK', 0.75]],
  raccoon: [['rummage', 0, 4], ['freeze', 0, 2]],
  duchess: [['sit', 0, 3], ['angry', 0, 3], ['friend', 0.5, 3]],
  biscuit: [['sit', 0, 3], ['angry', 0, 3], ['friend', 0.8, 3]],
  mallard: [['swim', 0.3, 4], ['dabble', 0, 4]],
  duckHen: [['swim', 0.3, 4], ['dabble', 0, 4]],
  owl: [['look', 0, 4]],
};
const only = q.get('anim')?.split(',');
const kinds = (q.get('kind') || Object.keys(SPECIES).join(',')).split(',').filter((k) => SPECIES[k]);
const cols = +(q.get('cols') || Math.ceil(Math.sqrt(kinds.length * 1.6)));
const cell = +(q.get('cell') || 2.2);
const slow = +(q.get('slow') || 1);
const night = q.has('night');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? 0x141832 : 0x8fb0e8);
G.uSunDir.value.set(0.45, 0.75, 0.5).normalize();
G.uSunColor.value.setRGB(1.25, 1.1, 0.92);
G.uSkyAmb.value.setRGB(0.42, 0.48, 0.62);
G.uGroundAmb.value.setRGB(0.3, 0.26, 0.22);
G.uNight.value = night ? 1 : 0;
if (night) { G.uSunColor.value.setRGB(0.15, 0.18, 0.3); G.uSkyAmb.value.setRGB(0.08, 0.1, 0.2); }
const rows = Math.ceil(kinds.length / cols);
const span = Math.max(cols, rows) * cell;
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.position.set(span * 0.6, span * 1.4, span * 0.9);
Object.assign(sun.shadow.camera, { left: -span, bottom: -span, right: span, top: span, far: span * 4 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), createVoxelMaterial());
ground.geometry.setAttribute('color4', new THREE.Float32BufferAttribute(new Array(4).fill(night ? [0.12, 0.14, 0.12, 0] : [0.3, 0.42, 0.22, 0]).flat(), 4));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const items = kinds.map((kind, i) => {
  const r = SPECIES[kind]();
  const sp = new RigSpecies(kind, rigDef(r), { max: 1, shadow: true });
  sp.arch = r.arch;
  sp.meta = r.meta;
  scene.add(sp.mesh);
  const list = [...(ANIMS[r.arch] || []), ...(EXTRA[kind] || [])].filter((a) => !only || only.includes(a[0]));
  const cx = ((i % cols) - (cols - 1) / 2) * cell, cz = (Math.floor(i / cols) - (rows - 1) / 2) * cell;
  const air = r.arch === 'bug' || r.arch === 'fish' || kind === 'bat' ? 0.5 : 0;
  const c = { kind, x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', state: 'idle', t: Math.random() * 3, sp, P: new Float32Array(sp.nb * PS), M: new Float32Array(sp.nb * MS), A: {}, id: i, bob: 0, near: true, rum: 1 };
  return { kind, sp, c, list, k: 0, at: 0, cx, cz, air, faces: sp.faces };
});
const W = { px: 0, py: 1.2, pz: span * 2, h: () => 0 };
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const dist = +(q.get('dist') || span * 1.2 + 2);
cam.position.set(0, dist * 0.5, dist * 0.85);
cam.lookAt(0, 0.4, 0);
const lbl = document.getElementById('lbl');
const v = new THREE.Vector3();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * slow;
  last = now;
  for (const it of items) {
    const c = it.c, A = it.list[it.k];
    if (!A) continue;
    it.at += dt;
    if (it.at > A[2]) { it.at = 0; it.k = (it.k + 1) % it.list.length; }
    const [anim, speed, , kKey, kDur] = it.list[it.k];
    c.anim = c.state = anim === 'trot' ? 'walk' : anim;
    c.t += dt;
    c.z += speed * dt; // a treadmill: the animator sees the speed, the puppet stays in its cell
    if (kKey) c[kKey] = Math.min(1, (it.at % (kDur * 1.6)) / kDur);
    if (c.kind === 'trout' || c.kind === 'salmon') { const u = (it.at % 1.2) / 1.2; c.vx = 2; c.vy = 4.5 - 9.8 * u * 0.9; c.vz = 0; }
    c.bob = kKey ? Math.sin(Math.min(1, c[kKey]) * Math.PI) * (kKey === 'hopK' ? 0.15 : 0.3) : 0;
    poseCritter(c, dt, W);
    composePose(it.sp, c.P, c.M);
    it.sp.begin();
    it.sp.push(c.M, it.cx, it.air + c.bob, it.cz, 0.6, 1, 0);
    it.sp.end();
  }
  renderer.render(scene, cam);
  lbl.innerHTML = items.map((it) => {
    v.set(it.cx, 0, it.cz).project(cam);
    return `<div style="position:absolute;left:${(v.x * 0.5 + 0.5) * innerWidth}px;top:${(-v.y * 0.5 + 0.5) * innerHeight + 10}px;transform:translateX(-50%)">${it.kind}:${it.list[it.k]?.[0] || ''} <small>${it.faces}</small></div>`;
  }).join('');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = window.__done = true;
