import './ui/base.css';
import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { World } from './world/world.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const pipeline = new Pipeline(canvas);
const bootFill = document.getElementById('bootFill');

const world = new World(pipeline, (p) => {
  bootFill.style.width = `${Math.round(p * 100)}%`;
});

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2400);
camera.layers.enable(1);
camera.layers.enable(2);

function onResize() {
  pipeline.resize();
  camera.aspect = pipeline.w / pipeline.h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

async function boot() {
  if (params.has('px')) pipeline.pixelScale = parseInt(params.get('px'));
  if (params.has('noshadow')) pipeline.renderer.shadowMap.enabled = false;
  await world.build();
  onResize();
  if (params.has('hour')) world.atmosphere.hour = parseFloat(params.get('hour'));
  if (params.has('weather')) world.atmosphere.setWeather(params.get('weather'), true);
  const c = (params.get('cam') || '-120,22,70,-60,10,40').split(',').map(Number);
  camera.position.set(c[0], c[1], c[2]);
  camera.lookAt(c[3], c[4], c[5]);
  document.getElementById('boot').classList.add('gone');
  let last = performance.now();
  const maxFrames = params.has('frames') ? parseInt(params.get('frames')) : Infinity;
  const loop = (now) => {
    const dt = maxFrames < Infinity ? 1 / 30 : Math.min(0.05, (now - last) / 1000);
    last = now;
    world.update(dt, camera, camera.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(camera.quaternion)));
    pipeline.render(world.scene, camera);
    window.__frames = (window.__frames || 0) + 1;
    if (window.__frames < maxFrames) requestAnimationFrame(loop);
    else window.__done = true;
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

window.__game = { world, camera, pipeline };
boot().catch((e) => {
  console.error(e);
  document.querySelector('.boot-sub').textContent = 'Error: ' + e.message;
});
