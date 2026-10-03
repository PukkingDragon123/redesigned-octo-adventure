// Snapshots of the real voxel characters (for order slips, journal pages and the
// pop-up portraits): renders the actual 3D model once into a small image.
//   charSnapshot(game, id, expr, size)                      head shot, 'polaroid' framing
//   charSnapshot(game, id, expr, size, { bust: true, outline: true })
//     head and shoulders, cut off at the chest, with a 1 px ink outline: a pixel-art
//     portrait that can peek up from the bottom of the screen
import * as THREE from 'three';
import { VoxelCharacter } from '../game/vchar.js';
import { G } from '../render/shaderlib.js';

const CACHE = new Map();
const ID = (id) => (id === 'kids' ? 'pip' : id === 'lou_lh' ? 'ollie' : id);
const INK = [30, 20, 24];
const STUDIO = [
  ['uSunDir', new THREE.Vector3(0.55, 0.75, 0.6).normalize()],
  ['uSunColor', new THREE.Color(1.05, 0.95, 0.85)],
  ['uSkyAmb', new THREE.Color(0.52, 0.52, 0.62)],
  ['uGroundAmb', new THREE.Color(0.32, 0.25, 0.2)],
  ['uNight', 0], ['uWet', 0], ['uSnow', 0],
];

export function charSnapshot(game, id, expr = 'happy', size = 96, { bust = false, outline = false, yaw = 0.35, anim = 'idle' } = {}) {
  id = ID(id);
  const key = `${id}|${expr}|${size}|${bust ? 1 : 0}${outline ? 1 : 0}|${yaw}|${anim}`;
  if (CACHE.has(key)) return CACHE.get(key);
  let url = '';
  try {
    const renderer = game.pipeline.renderer;
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter({ scene, physics: null }, id, { y: 0, yaw, anim, expr, cloth: true, shadow: false });
    for (let i = 0; i < 30; i++) ch.update(1 / 60, new THREE.Vector3(0, 1, 3));
    ch.root.updateMatrixWorld(true);
    const head = ch.headWorld();
    const hH = ch.P.headH;
    let cam;
    if (bust) {
      // frame from mid-chest to just over the hat; the bottom edge cuts the body off
      cam = new THREE.PerspectiveCamera(22, 1, 0.05, 30);
      const top = head.y + 0.06, bot = head.y - hH - 0.42;
      const cy = (top + bot) / 2, half = (top - bot) / 2;
      const d = half / Math.tan(THREE.MathUtils.degToRad(11));
      cam.position.set(0.12, cy + 0.08, d);
      cam.lookAt(0, cy, 0);
    } else {
      cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
      const hy = head.y - hH * 0.45;
      cam.position.set(0.25, hy + 0.05, 1.55 + hH);
      cam.lookAt(0, hy - 0.06, 0);
    }
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    // studio light, whatever the time of day or weather outside
    const keep = STUDIO.map(([k]) => G[k].value);
    for (const [k, v] of STUDIO) G[k].value = v;
    try { renderer.render(scene, cam); } finally { STUDIO.forEach(([k], i) => (G[k].value = keep[i])); }
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    ch.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const D = img.data;
    // linear -> sRGB, flip vertically, hard alpha
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4, o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) D[o + k] = Math.round(Math.pow(Math.min(1, px[i + k] / 255), 1 / 2.2) * 255);
      D[o + 3] = px[i + 3] > 0 ? 255 : 0;
    }
    if (outline) {
      // a 1 px ink line round the silhouette (not along the bottom edge, where the body is cut off)
      const solid = (x, y) => x >= 0 && y >= 0 && x < size && y < size && D[(y * size + x) * 4 + 3] > 0;
      const add = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push((y * size + x) * 4);
      }
      for (const o of add) { D[o] = INK[0]; D[o + 1] = INK[1]; D[o + 2] = INK[2]; D[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    url = c.toDataURL();
  } catch (e) {
    console.warn('snapshot failed', id, e);
  }
  CACHE.set(key, url);
  return url;
}
