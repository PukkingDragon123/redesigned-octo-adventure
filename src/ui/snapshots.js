// Polaroid-style snapshots of the real voxel characters (for order slips,
// journal pages...): renders the actual 3D model once into a small image.
import * as THREE from 'three';
import { VoxelCharacter } from '../game/vchar.js';

const CACHE = new Map();
const ID = (id) => (id === 'kids' ? 'pip' : id === 'lou_lh' ? 'ollie' : id);

export function charSnapshot(game, id, expr = 'happy', size = 96) {
  id = ID(id);
  const key = `${id}|${expr}|${size}`;
  if (CACHE.has(key)) return CACHE.get(key);
  let url = '';
  try {
    const renderer = game.pipeline.renderer;
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter({ scene, physics: null }, id, { y: 0, yaw: 0.35, anim: 'idle', expr, cloth: false, shadow: false });
    for (let i = 0; i < 30; i++) ch.update(1 / 60, new THREE.Vector3(0, 1, 3));
    ch.root.updateMatrixWorld(true);
    const head = ch.headWorld();
    const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
    const hy = head.y - ch.P.headH * 0.45;
    cam.position.set(0.25, hy + 0.05, 1.55 + ch.P.headH);
    cam.lookAt(0, hy - 0.06, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
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
    // linear -> sRGB, flip vertically
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4, o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(Math.pow(Math.min(1, px[i + k] / 255), 1 / 2.2) * 255);
      img.data[o + 3] = px[i + 3] > 0 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    url = c.toDataURL();
  } catch (e) {
    console.warn('snapshot failed', id, e);
  }
  CACHE.set(key, url);
  return url;
}
