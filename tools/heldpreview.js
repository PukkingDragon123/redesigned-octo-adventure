// Preview of the first-person 3D interface pieces (src/ui/book3d.js, hands3d.js) on a
// plain backdrop, without loading the game.
//   tools/heldpreview.html?what=book&open=1&lift=1&flip=0.4
//   tools/heldpreview.html?what=hand&ry=0.5
import * as THREE from 'three';
import '../src/ui/kit.css';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Book3D } from '../src/ui/book3d.js';
import { BonyHand } from '../src/ui/hands3d.js';
import { heldCompass, buildCompass, drawTag } from '../src/ui/compass3d.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const r = new THREE.WebGLRenderer({ canvas, antialias: true });
r.setSize(innerWidth, innerHeight);
r.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a7a6a);
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = +(q.get('env') ?? 0.45);
scene.add(new THREE.HemisphereLight(0xfff0dc, 0x4a3428, 0.55));
const key = new THREE.DirectionalLight(0xfff2de, 1.25);
key.position.set(-0.5, 1.1, 1.3);
scene.add(key);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 10);
const view = { scene, held: [], cam };
const what = q.get('what') || 'book';
if (what === 'book') {
  const b = new Book3D(view);
  const u = +(q.get('u') ?? 3), pageH = +(q.get('ph') ?? 206) * u, pageW = +(q.get('pw') ?? 165) * u;
  b.layout({ pageW, pageH, cx: innerWidth / 2 - 15 * u, cy: innerHeight / 2, single: q.has('single'), W: innerWidth, H: innerHeight });
  b.setTabs(+(q.get('tabs') ?? 9), 2);
  b.show();
  for (let i = 0; i < 200; i++) b.update(1 / 60);
  b.lift = +(q.get('lift') ?? 1);
  b.open = +(q.get('open') ?? 1);
  b.want = 2; // hold the pose
  // pose overrides for tuning the grip: hp=x,y,z (from the corner) hr=rx,ry,rz th=... wr=...
  const nums = (k) => q.get(k)?.split(',').map(Number);
  if (q.has('th') || q.has('wr') || q.has('curl')) {
    const c = nums('curl');
    const pose = { thumb: nums('th'), wrist: nums('wr'), ...(c ? { curl: [c, c, c, c] } : {}) };
    b.handR.pose(pose);
    b.handL.pose(pose);
  }
  if (q.has('hp')) b.gripPos = nums('hp');
  if (q.has('hr')) b.gripRot = nums('hr');
  b.update(0);
  if (q.has('orbit')) {
    const a = +q.get('orbit');
    const c0 = b.root.position.clone();
    cam.position.set(c0.x + Math.sin(a) * 0.4, c0.y + 0.05, c0.z + Math.cos(a) * 0.4);
    cam.lookAt(c0.x + 0.12, c0.y - 0.08, c0.z);
  }
  if (q.has('flip')) { b.turn(1, null); b.flip.t = +q.get('flip') - 1e-3; b.updateFlip(1e-3 * 0.46); }
  // the page boxes the DOM would use
  window.__quads = { l: b.quad('l'), r: b.quad('r') };
}
if (what === 'hand') {
  const h = new BonyHand();
  h.root.position.set(0, -0.06, -0.32);
  h.root.rotation.set(+(q.get('rx') ?? 0), +(q.get('ry') ?? 0), 0);
  scene.add(h.root);
}
if (what === 'compass') {
  const { H, root, hand } = heldCompass();
  scene.add(root);
  const nums = (k) => q.get(k)?.split(',').map(Number);
  if (q.has('th') || q.has('wr') || q.has('curl')) { const c = nums('curl'); hand.pose({ thumb: nums('th'), wrist: nums('wr'), ...(c ? { curl: [c, c, c, c] } : {}) }); }
  if (q.has('hp')) hand.root.position.set(...nums('hp'));
  if (q.has('hr')) hand.root.rotation.set(...nums('hr'));
  root.position.set(0.012, -0.04, -0.18);
  root.rotation.set(+(q.get('rx') ?? 1.02), -0.08, 0.04);
  H.needle.rotation.y = 0.6;
  const tr = nums('tr') || [-0.87, 0, -0.9];
  H.tagG.rotation.set(...tr);
  document.fonts.load('32px BoldPixels').finally(() => { drawTag(H.tagCanvas, 'Cocoa for Birdie', '354 m'); H.tagTex.needsUpdate = true; });
  cam.fov = 60; cam.updateProjectionMatrix();
}
if (what === 'corner') {
  const C = buildCompass();
  scene.add(C.root);
  cam.fov = 30; cam.aspect = 1; cam.updateProjectionMatrix();
  r.setSize(300, 300);
  cam.position.set(0, 0.105, 0.088);
  cam.lookAt(0, 0.002, -0.004);
  C.root.rotation.set(0.05, 0, -0.15);
}
window.__ready = true;
const loop = () => { r.render(scene, cam); requestAnimationFrame(loop); };
loop();
