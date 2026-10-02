import './ui/base.css';
import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { World } from './world/world.js';
import { Game } from './game/game.js';

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

let game = null;

async function boot() {
  if (params.has('px')) pipeline.pixelScale = parseFloat(params.get('px'));
  if (params.has('noshadow')) pipeline.renderer.shadowMap.enabled = false;
  await world.build();
  onResize();
  if (params.has('hour')) world.atmosphere.hour = parseFloat(params.get('hour'));
  if (params.has('weather')) world.atmosphere.setWeather(params.get('weather'), true);
  const freeCam = params.get('cam');
  if (!freeCam) {
    game = new Game(pipeline, world, camera, params);
    game.init();
  } else {
    const c = freeCam.split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(c[3], c[4], c[5]);
  }
  const bootEl = document.getElementById('boot');
  if (params.has('frames')) bootEl.style.display = 'none';
  bootEl.classList.add('gone');
  clearInterval(window.__bootTips);
  setTimeout(() => (bootEl.style.display = 'none'), 900);
  let last = performance.now();
  const maxFrames = params.has('frames') ? parseInt(params.get('frames')) : Infinity;
  // deterministic warm-up for tests: simulate N seconds before the first frame
  const warm = parseFloat(params.get('warm') || '0');
  if (game && warm > 0) {
    for (let t = 0; t < warm; t += 1 / 30) {
      game.update(1 / 30);
      world.update(1 / 30, camera, game.focus());
    }
  }
  const loop = (now) => {
    const dt = maxFrames < Infinity ? parseFloat(params.get('step') || '0') || 1 / 30 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game) game.update(dt);
    const focus = game ? game.focus() : camera.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(camera.quaternion));
    world.update(dt, camera, focus);
    pipeline.render(world.scene, camera);
    window.__frames = (window.__frames || 0) + 1;
    if (window.__frames < maxFrames) requestAnimationFrame(loop);
    else window.__done = true;
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

window.__game = { world, camera, pipeline, get game() { return game; } };
// test helper: advance the simulation n frames and render once
window.__step = (n = 1, dt = 1 / 30) => {
  for (let i = 0; i < n; i++) {
    if (game) game.update(dt);
    world.update(dt, camera, game ? game.focus() : camera.position);
  }
  pipeline.render(world.scene, camera);
};
boot().catch((e) => {
  console.error(e);
  document.querySelector('.boot-sub').textContent = 'Error: ' + e.message;
});
