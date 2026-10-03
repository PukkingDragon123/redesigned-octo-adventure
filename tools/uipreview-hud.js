// /tools/uipreview.html?page=hud&scene=ride|dialog|shout|narr|banner|journal|board|skills|settings|keeps|map|shop|recipes|summary|controls|customers
// The real UI classes on top of a small fake game (no 3D world), for fast iteration.
import * as THREE from 'three';
import { UI } from '../src/ui/ui.js';
import { TouchControls } from '../src/ui/touch.js';
import { Menus } from '../src/game/menus.js';

export default function (root) {
  const q = new URLSearchParams(location.search);
  root.style.cssText = '';
  root.innerHTML = '';
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  cam.position.set(0, 2, 6);
  cam.lookAt(0, 1.4, 0);
  cam.updateMatrixWorld();
  const ORDERS = [
    { id: 1, customer: 'birdie', spot: 'birdie', cocoa: 'maple', label: 'Maple Marshmallow', note: 'Extra marshmallows for the gulls!', price: 14, rush: false, state: 'carried', quality: 88 },
    { id: 2, customer: 'gus', spot: 'gus', cocoa: 'classic', label: 'Classic Cocoa', note: 'Hot as the sawmill furnace, please.', price: 11, rush: true, state: 'carried', quality: 41 },
    { id: 3, customer: 'agnes', spot: 'agnes', cocoa: 'mint', label: 'Peppermint Swirl', note: 'The cats like to watch.', price: 12, rush: false, state: 'board', quality: 100 },
    { id: 4, customer: 'doug', spot: 'doug', cocoa: 'mocha', label: 'Lumberjack Mocha', note: 'Night shift. You know how it is.', price: 15, rush: false, state: 'board', quality: 100 },
    { id: 5, customer: 'marie', spot: 'marie', cocoa: 'pumpkin', label: 'Pumpkin Spice', note: 'For the café counter.', price: 13, rush: false, state: 'board', quality: 100 },
  ];
  const g = {
    params: q, time: 0, camera: cam, mode: 'ride', onFoot: q.get('foot') === '1', currentScene: null,
    settings: { pixel: 1, quality: 'high', master: 0.8, music: 0.55, sfx: 0.85, camDist: 1, fps: false, uiSize: 0, autoQuality: true },
    state: {
      day: 3, money: 125, hasCamera: true,
      stats: { deliveries: 12, dayDeliveries: 4, dayTips: 9, dayCrashes: 2, dayAir: 2.4, dayEarned: 48 },
      keepsakes: { cane: 'given', clock: 'found', lantern: 'found', books: 'given' },
      quests: { cats: { state: 'active' }, trees: { state: 'done' }, lost_glasses: { state: 'active' } },
      pantry: { milk_bottle: 3, cocoa_powder: 2, sugar: 4, marshmallows: 0, maple_syrup: 1, mint: 2 },
      photos: { robin: 1, goose: 2 },
    },
    bike: { stats: { topSpeed: 10, gears: 3 }, speed: 7.2, gear: 2, wheelAngle: 0.4, crank: 0.6, pos: new THREE.Vector3() },
    world: { atmosphere: { hour: +(q.get('hour') || 10.25), weatherTarget: q.get('wx') || 'clear' }, terrain: fakeTerrain() },
    orders: { list: ORDERS, carried: () => ORDERS.filter((o) => o.state === 'carried'), capacity: () => 3, pack(o) { if (this.carried().length >= 3) return false; o.state = 'carried'; return true; }, unpack(o) { o.state = 'board'; }, missing: () => [] },
    quests: { noteLines: () => ['Cats for Agnes 1/3', 'Find the reading glasses'], markers: () => [{ x: 40, z: -60, icon: 'cat' }], q: () => ({}) },
    playerPos: new THREE.Vector3(0, 0, 0),
    compassMarkers: () => [{ x: 120, z: -200, icon: 'cocoa' }],
    villagers: { actors: {} },
    sound: { play() {}, blip() {} },
    applySettings() {}, saveSettings() {}, resumeFromMenu() {}, save() {}, peekSave: () => ({ day: 3 }),
    catEventActive: false,
  };
  const ui = new UI(g);
  g.ui = ui;
  const touch = new TouchControls(g);
  g.touch = touch;
  const menus = new Menus(g);
  g.menus = menus;
  const head = (x, y) => ({ headWorld: () => new THREE.Vector3(x, y, 0), tempExpr() {}, talking: 0 });
  const scene = q.get('scene') || 'ride';
  ui.showHUD(true);
  ui.setObjective(q.get('obj') ?? 'Deliver to Birdie at the lighthouse');
  if (scene === 'ride') {
    ui.prompt('Talk to Nana');
    ui.toast('Found <b>Harold\'s Lantern</b>! Bring it home to Nana.', 'lantern', 60000);
    ui.toast('+$14 <b>(+$3 tip!)</b> &middot; 88% hot', 'coin', 60000);
    ui.tag('t1', 'SUPERMAN!', new THREE.Vector3(1.5, 2.4, 0), 60000, 'trick-trick');
  }
  const opts = (o) => ({ instant: true, ...o });
  if (scene === 'dialog') ui.say('grandma', 'Morning, *dear*! The ~cocoa~ is ready and Birdie is waiting at the lighthouse.', opts({ expr: 'happy', actor: head(-1.2, 1.5), choices: ["Let's see the board", 'Any shopping, Nana?', 'Just saying hi!'] }));
  if (scene === 'shout') ui.say('doug', '^HANK!^ Slow down on the *boardwalk*!', opts({ expr: 'angry', actor: head(-1, 1.6) }));
  if (scene === 'scared') ui.say('agnes', 'Did you hear that? _Something_ is in the pumpkin patch...', opts({ expr: 'scared', actor: head(1, 1.5) }));
  if (scene === 'think') ui.say('hank', 'I wonder if skeletons can taste maple syrup.', opts({ expr: 'think', actor: head(0.6, 1.4) }));
  if (scene === 'narr') ui.say(null, 'Night fell over Maple Cove, and the *pumpkins* began to glow...', opts({}));
  if (scene === 'banner') ui.banner('DAY 3', 'Crisp and clear: perfect cocoa weather', 600000);
  const m = {
    journal: () => menus.pause(), board: () => menus.orderBoard(), skills: () => menus.skillBook(), settings: () => menus.settings(), keeps: () => menus.keepsakes(),
    map: () => menus.map(), shop: () => menus.shop(), recipes: () => menus.recipes(), summary: () => menus.summary(), controls: () => menus.controls(), customers: () => menus.customers(),
  }[scene];
  if (m) { g.mode = 'menu'; m(); }
  let last = performance.now();
  const tick = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.time += dt;
    g.bike.wheelAngle += dt * 4;
    g.bike.crank += dt * 3;
    ui.update(dt);
    ui.updateHUD(dt);
    touch.update(dt);
    requestAnimationFrame(tick);
  };
  tick();
  if (q.get('touch') === '1') touch.enable(true);
}

function fakeTerrain() {
  const h = (x, z) => 30 * Math.sin(x * 0.008) * Math.cos(z * 0.01) + 12 * Math.sin((x + z) * 0.03) - (x > 250 ? (x - 250) * 0.6 : 0);
  return { heightAt: h, splatAt: (x, z) => ({ road: Math.abs(z - x * 0.3 - 20) < 3 ? 1 : 0, litter: 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.04) }) };
}
