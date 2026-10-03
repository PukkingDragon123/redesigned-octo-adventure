// Dev tool: /tools/charpreview.html?only=hank,grandma&pose=idle&expr=happy&t=2&yaw=0.4&walk=1.4&react=shock&rt=0.3
import * as THREE from 'three';
import { VoxelCharacter, CHARACTERS } from '../src/game/vchar.js';
import { createVoxelMaterial } from '../src/render/voxelMaterial.js';
import { G } from '../src/render/shaderlib.js';

const P = new URLSearchParams(location.search);
// &mod=/src/game/npcPoses.js registers extra poses (and characters) first
for (const m of (P.get('mod') || '').split(',').filter(Boolean)) await import(/* @vite-ignore */ m);
let names = Object.keys(CHARACTERS);
if (P.get('only')) names = P.get('only').split(',');
const exprs = P.get('exprs') ? P.get('exprs').split(',') : null;
if (exprs) names = exprs.map(() => names[0]);
// &poses=cower,peek,pray shows one character in several poses
const poses = P.get('poses') ? P.get('poses').split(',') : null;
if (poses) names = poses.map((_, i) => names[i % names.length]);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const night = P.has('night');
scene.background = new THREE.Color(night ? 0x141832 : 0x7f9fd8);
G.uSunDir.value.set(0.45, 0.75, 0.6).normalize();
G.uSunColor.value.setRGB(1.2, 1.05, 0.9);
G.uSkyAmb.value.setRGB(0.45, 0.5, 0.65);
G.uGroundAmb.value.setRGB(0.32, 0.27, 0.22);
G.uNight.value = night ? 1 : 0;
if (night) { G.uSunColor.value.setRGB(0.15, 0.18, 0.3); G.uSkyAmb.value.setRGB(0.1, 0.12, 0.22); }
G.uWind.value.set(1, 0.3); G.uWindStrength.value = +(P.get('wind') ?? 0.5);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0008;
const game = { scene, physics: null, sound: null };
const spacing = +(P.get('cell') || 1.2);
const chars = names.map((n, i) => {
  const c = new VoxelCharacter(game, n, { x: (i - (names.length - 1) / 2) * spacing, z: 0, y: 0, yaw: +(P.get('yaw') ?? 0.35), anim: poses ? poses[i] : P.get('pose') || 'idle', expr: exprs ? exprs[i] : P.get('expr') || 'neutral' });
  if (P.get('walk')) c.speedOverride = +P.get('walk');
  if (P.get('talk')) c.talking = 999;
  return c;
});
const gg = new THREE.PlaneGeometry(200, 200);
gg.setAttribute('color4', new THREE.Float32BufferAttribute(new Array(4).fill([0.36, 0.3, 0.24, 0]).flat(), 4));
const ground = new THREE.Mesh(gg, createVoxelMaterial());
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const span = names.length * spacing;
const cam = new THREE.PerspectiveCamera(+(P.get('fov') || 30), innerWidth / innerHeight, 0.1, 500);
const dist = +(P.get('dist') || span * 1.15 + 2.5);
const lookY = +(P.get('lookY') || 0.8);
cam.position.set(+(P.get('cx') || 0), lookY + dist * +(P.get('elev') || 0.32), dist);
cam.lookAt(+(P.get('cx') || 0), lookY, 0);
sun.position.set(span * 0.4 + 3, 8, 6);
sun.shadow.camera.left = sun.shadow.camera.bottom = -span - 2;
sun.shadow.camera.right = sun.shadow.camera.top = span + 2;
sun.shadow.camera.far = 40;
scene.add(sun);
// simulate
const simT = +(P.get('t') || 1.5);
const dt = 1 / 60;
const reactAt = +(P.get('rt') ?? 0.2);
let reacted = false;
for (let t = 0; t < simT; t += dt) {
  if (P.get('react') && !reacted && t >= simT - reactAt) { reacted = true; for (const c of chars) c.react(P.get('react')); }
  if (P.get('explode') && t >= simT - +P.get('explode') && !chars[0].broken && !chars[0]._ex) { for (const c of chars) { c._ex = true; c.explode(new THREE.Vector3(0, 0, 3)); if (P.has('nohold')) c.broken.auto = false; } }
  for (const c of chars) {
    if (P.get('walk') && P.has('move')) c.pos.z += +P.get('walk') * dt;
    c.update(dt, cam.position);
  }
  G.uTime.value += dt;
}
renderer.render(scene, cam);
const v = new THREE.Vector3();
document.getElementById('lbl').innerHTML = chars.map((c) => {
  v.copy(c.root.position).project(cam);
  return `<div style="position:absolute;left:${(v.x * 0.5 + 0.5) * innerWidth}px;top:${(-v.y * 0.5 + 0.5) * innerHeight + 8}px;transform:translateX(-50%)">${exprs ? c.expr : poses ? c.anim : c.char}</div>`;
}).join('');
window.__ready = window.__done = true;
let last = performance.now();
if (P.has('live')) renderer.setAnimationLoop(() => { const now = performance.now(); const d = Math.min(0.05, (now - last) / 1000); last = now; G.uTime.value += d; for (const c of chars) c.update(d, cam.position); renderer.render(scene, cam); });
