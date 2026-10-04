import './ui/base.css';
import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { World } from './world/world.js';
import { Game } from './game/game.js';
import { Loader3D } from './boot/loader3d.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const pipeline = new Pipeline(canvas);
const loader = new Loader3D(pipeline);

const world = new World(pipeline, (p, label) => loader.progress(p, label));

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
  if (params.has('px')) pipeline.setPixelScale(parseFloat(params.get('px')));
  if (params.has('noshadow')) pipeline.renderer.shadowMap.enabled = false;
  const testRun = params.has('frames');
  if (params.has('loaderonly')) {
    // test hook: just the loading scene, with fake progress
    loader.start();
    window.__ready = true;
    let p = 0;
    setInterval(() => loader.progress((p = Math.min(1, p + 0.01))), 100);
    setTimeout(() => (window.__done = true), parseFloat(params.get('loaderonly') || '6') * 1000);
    return;
  }
  if (!testRun || params.has('loader')) loader.start();
  // let the loading scene draw a few frames before the heavy world build starts
  await new Promise((r) => setTimeout(r, testRun ? 0 : 120));
  await world.build();
  // the street clutter, fences and furniture finish baking (in a worker) before
  // the loading screen goes, so the village is complete on the first frame
  const paint = world.deco2d?.paint;
  if (paint && !testRun) {
    loader.progress(0.97, 'putting up the fences');
    await Promise.race([paint, new Promise((r) => setTimeout(r, 20000))]);
  }
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
  document.getElementById('boot')?.remove();
  await loader.finish(testRun);
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
  let warmed = false;
  const loop = (now) => {
    const dt = maxFrames < Infinity ? parseFloat(params.get('step') || '0') || 1 / 30 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game) game.update(dt);
    const focus = game ? game.focus() : camera.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(camera.quaternion));
    world.update(dt, camera, focus);
    // a scene can stand in for the world (a hook; the title draws the world itself); the
    // world is drawn once first so its shaders are compiled before the game starts
    const ov = game?.overrideScene;
    if (ov && warmed) ov.render(pipeline);
    else {
      pipeline.render(world.scene, camera);
      warmed = true;
      if (ov) ov.render(pipeline);
    }
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
  if (game?.overrideScene) game.overrideScene.render(pipeline);
  else pipeline.render(world.scene, camera);
};
boot().catch((e) => {
  console.error(e);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:200;color:#fff4e0;background:#1e1418;padding:8px 12px;font:16px monospace';
  box.textContent = 'Error: ' + e.message;
  document.body.appendChild(box);
});
