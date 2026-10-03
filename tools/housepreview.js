// Dev tool: one or a few voxel buildings up close, with an orbit camera from the URL.
// /tools/housepreview.html?only=cafe,clinic&az=0.5&el=0.25&dist=14&look=0,2.5,0&lod=1&night
//   only: PREVIEW names (models/buildings.js), laid out in a row along x (gap=metres)
//   az / el: camera azimuth / elevation (radians, az 0 looks at the front), dist, look x,y,z
//   lod=1 shows the far (low-detail) mesh instead
import * as THREE from 'three';
import { meshVox } from '../src/voxel/mesh.js';
import { createVoxelMaterial } from '../src/render/voxelMaterial.js';
import { G } from '../src/render/shaderlib.js';
import { PREVIEW, lowDetail } from '../src/voxel/models/buildings.js';

const P = new URLSearchParams(location.search);
const names = (P.get('only') || 'house5').split(',');
const night = P.has('night');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
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
const mat = createVoxelMaterial();
const gap = +(P.get('gap') || 16);
let tris = 0;
const info = [];
names.forEach((n, i) => {
  const fn = PREVIEW[n];
  if (!fn) return;
  const t0 = performance.now();
  let r = fn();
  if (P.get('lod') === '1') r = lowDetail(r);
  const geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
  const ms = performance.now() - t0;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  m.customDepthMaterial = mat.userData.depth;
  m.position.set((i - (names.length - 1) / 2) * gap, 0, 0);
  scene.add(m);
  tris += geo.index.count / 3;
  info.push(`${n}: ${geo.index.count / 3} tris, ${r.vox.w}x${r.vox.h}x${r.vox.d}, ${ms.toFixed(0)} ms`);
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
const gg = new THREE.PlaneGeometry(400, 400);
gg.setAttribute('color4', new THREE.Float32BufferAttribute(new Array(4).fill([0.2, 0.3, 0.12, 0]).flat(), 4));
ground.geometry = gg;
scene.add(ground);
const az = +(P.get('az') || 0.55), el = +(P.get('el') || 0.28), dist = +(P.get('dist') || 22);
const look = (P.get('look') || '0,3,0').split(',').map(Number);
const cam = new THREE.PerspectiveCamera(+(P.get('fov') || 40), innerWidth / innerHeight, 0.1, 800);
cam.position.set(look[0] + Math.sin(az) * Math.cos(el) * dist, look[1] + Math.sin(el) * dist, look[2] + Math.cos(az) * Math.cos(el) * dist);
cam.lookAt(look[0], look[1], look[2]);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const S = Math.max(30, names.length * gap);
sun.position.set(S * 0.6, S * 1.4, S * 0.9);
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, far: S * 5 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
renderer.render(scene, cam);
document.getElementById('lbl').innerHTML = info.join('<br>') + `<br>total ${tris} tris`;
window.__ready = window.__done = true;
