// node tools/wildtest.mjs [-v]
// Headless checks for the bigger map and the backcountry: the world's bounds hold every place,
// customer and keepsake; the new terrain (Lac des Huards under water, the marsh at the waterline,
// Mont Écho standing tall) and the new roads (above water, rideable grades, the switchbacks
// really climbing to the summit, junctions meeting their roads); the new buildings and props
// build; and the backcountry quests run start to finish with a stand-in game (the ranger's
// cocoa, Gérard's race, Gisèle's paddle, Tremblay's apples, the letter by rail, the express).
import * as L from '../src/world/layout.js';
import { Terrain, roadSamples, lakeSDF } from '../src/world/terrain.js';
import { buildVoxelBuilding } from '../src/voxel/models/buildings.js';
import { buildingSpecPure } from '../src/world/foundations.js';
import * as PR from '../src/voxel/models/props.js';
import { meshVox } from '../src/voxel/mesh.js';
import { Quests, QUESTS } from '../src/game/quests.js';
import { WILD_QUESTS } from '../src/game/questsWild.js';
import { CHARACTERS } from '../src/voxel/models/characters.js';

const verbose = process.argv.includes('-v');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fail++;
  if (!ok || verbose) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  ${info}` : ''}`);
};

// ---------------------------------------------------------------- the world
const area = (L.WORLD_HALF * 2) ** 2;
check('the world is 60-100% bigger than the old 640 m square', area / 640 ** 2 >= 1.6 && area / 640 ** 2 <= 2.0, `${(area / 640 ** 2).toFixed(2)}x`);
check('the sea keeps its east edge', L.WORLD_X1 === 320);
for (const [k, p] of Object.entries(L.POI)) check(`POI ${k} inside the world`, L.inWorld(p.x, p.z, 12));
for (const [k, c] of Object.entries(L.CUSTOMERS)) check(`customer ${k} inside`, L.inWorld(c.x, c.z, 12));
for (const k of L.KEEPSAKES) check(`keepsake ${k.id} inside`, L.inWorld(k.x, k.z, 12));
const t0 = performance.now();
const T = new Terrain();
const tms = performance.now() - t0;
check('terrain builds quickly', tms < 6000, `${tms.toFixed(0)} ms, ${T.n}^2 heights, ${T.sn}^2 splat`);
for (const lk of L.LAKES) check('the lake is under water in the middle', T.heightAt(lk.x, lk.z) < -1.5, T.heightAt(lk.x, lk.z).toFixed(2));
for (const ms of L.MARSHES) {
  let wet = 0, n = 0;
  for (let a = 0; a < 6.28; a += 0.3) for (const r of [5, 15, 25]) { n++; const h = T.heightAt(ms.x + Math.cos(a) * r, ms.z + Math.sin(a) * r); if (h > -0.8 && h < 0.8) wet++; }
  check('the marsh sits at the waterline', wet / n > 0.85, `${((wet / n) * 100).toFixed(0)}%`);
}
const ft = L.POI.firetower;
check('Mont Écho stands tall', T.heightAt(ft.x, ft.z) > 30, T.heightAt(ft.x, ft.z).toFixed(1));
const NEW_ROADS = ['railTrail', 'westRoad', 'lakeLane', 'campLane', 'towerTrail', 'orchardRoad', 'rangRoad', 'marshTrail'];
for (const id of NEW_ROADS) {
  const R = L.ROADS.find((r) => r.id === id);
  check(`road ${id} exists`, !!R);
  if (!R) continue;
  const S = roadSamples(R, 2);
  let low = 1e9, steep = 0;
  // (the very ends fade into whatever they meet: a junction, a yard, the tunnel's mouth)
  for (let k = 2; k < S.length - 2; k++) {
    const h = T.heightAt(S[k].x, S[k].z);
    low = Math.min(low, h);
    if (k > 2) steep = Math.max(steep, Math.abs(h - T.heightAt(S[k - 1].x, S[k - 1].z)) / 2);
  }
  check(`road ${id} stays above water`, low > 0.4, `lowest ${low.toFixed(2)} m`);
  check(`road ${id} is rideable`, steep <= (R.grade ?? 0.1) * 1.5 + 0.08, `steepest ${steep.toFixed(3)} (grade ${R.grade})`);
}
{
  const S = roadSamples(L.ROADS.find((r) => r.id === 'towerTrail'), 2);
  const h0 = T.heightAt(S[0].x, S[0].z), h1 = T.heightAt(S.at(-1).x, S.at(-1).z), top = T.heightAt(ft.x, ft.z);
  check('the switchbacks climb Mont Écho', h1 - h0 > 20, `${h0.toFixed(1)} -> ${h1.toFixed(1)} m`);
  check('the trail tops out at the summit', Math.abs(top - h1) < 2.5, `trail end ${h1.toFixed(1)}, summit ${top.toFixed(1)}`);
}
// junctions: a road that starts or ends on an earlier one takes its height there
for (const id of NEW_ROADS) {
  const R = L.ROADS.find((r) => r.id === id), S = roadSamples(R, 2);
  for (const end of [S[0], S.at(-1)]) {
    let near = null;
    for (const o of L.ROADS) {
      if (o === R) continue;
      for (const p of roadSamples(o, 2)) if (Math.hypot(p.x - end.x, p.z - end.z) < 4) near = o.id;
    }
    if (near) check(`${id} meets ${near} without a step`, Math.abs(T.heightAt(end.x, end.z) - T.heightAt(end.x + end.dx * 3, end.z + end.dz * 3)) < 1.0);
  }
}
for (const lk of L.LAKES) for (const b of L.BUILDINGS) if (lakeSDF(lk, b.x, b.z) < 3) check(`building ${b.id} is not in the lake`, false);

// ---------------------------------------------------------------- buildings & props
for (const id of ['station', 'firetower', 'cottage', 'fishcamp', 'cidrerie', 'cafehut']) {
  const b = L.BUILDINGS.find((q) => q.id === id);
  let ok = false, info = '';
  try {
    const r = buildVoxelBuilding(buildingSpecPure(b, T));
    const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
    ok = g.attributes.position.count > 0;
    info = `${(g.index.count / 3) | 0} tris`;
  } catch (e) { info = e.message; }
  check(`building ${id} builds`, ok, info);
}
for (const [k, fn] of Object.entries({ railTrack: () => PR.railTrack({}), tunnelPortal: PR.tunnelPortal, handcar: () => PR.handcar({}), woodDeck: () => PR.woodDeck({ rail: 1 }), appleTree: () => PR.appleTree({ seed: 1 }), ciderPress: PR.ciderPress, cattails: () => PR.cattails({}), wildlifeBlind: PR.wildlifeBlind, coinViewer: PR.coinViewer, paddle: PR.paddle, thermos: PR.thermos, apple: () => PR.apple({}) })) {
  let tris = 0;
  try { const r = fn(); const g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 }); tris = g.index ? g.index.count / 3 : 0; } catch (e) { tris = -1; }
  check(`prop ${k} meshes cheaply`, tris > 0 && tris < 6000, `${tris | 0} tris`);
}
for (const id of ['rosie', 'gisele', 'odile', 'tremblay']) check(`character ${id} is registered`, !!CHARACTERS[id]?.name);

// ---------------------------------------------------------------- the quests, with a stand-in game
const pops = [];
const mkActor = (x, z) => ({ pos: { x, y: 0, z }, visible: true, root: { visible: true }, faceTowards() {}, lookAt() {}, react() {}, update() {}, homeYaw: 0, targetYaw: 0 });
const g = {
  state: { quests: {}, money: 100, day: 2, photos: {}, keepsakes: {}, flags: {} },
  playerPos: { x: 0, y: 0, z: 0 }, onFoot: true, bike: { speed: 0 }, mode: 'ride',
  scene: { add() {}, remove() {} },
  physics: { groundAt: (x, z) => ({ h: T.heightAt(x, z) }) },
  world: { voxel: { orchardTrees: [{ x: -190, z: 280 }, { x: -183, z: 288 }, { x: -176, z: 296 }] }, atmosphere: { hour: 12 }, buildings: {} },
  ui: { say: async () => 0, pop: (t) => pops.push(t), prompt() {} },
  sound: { play() {} },
  effects: { hearts() {}, magic() {}, confetti() {} },
  rider: { ch: { faceTowards() {}, lookAt() {}, react() {} } },
  emotes: { show() {} },
  villagers: { addTrust() {}, moodOf: () => 'friendly' },
  save() {},
  wait: async () => {},
  camera: { position: { x: 0, y: 0, z: 0 } },
  critters: { add: (kind, x, z, o) => ({ kind, x, z, y: 0, yaw: o.yaw, ...o }) },
};
const Q = new Quests(g);
const W = Q.wild;
W.synced = true;
W.homes = {};
const H = { rosie: [ft.x + 3, ft.z + 5.5], gisele: [-336, 84.5], odile: [-400.6, -143.8], tremblay: [-146, 269.8] };
for (const [id, [x, z]] of Object.entries(H)) W.folk[id] = mkActor(x, z);
const at = (x, z) => { g.playerPos.x = x; g.playerPos.z = z; g.playerPos.y = T.heightAt(x, z); };
const step = (s, dt = 1 / 30) => { for (let t = 0; t < s; t += dt) Q.update(dt); };
for (const id of Object.keys(WILD_QUESTS)) check(`journal lists ${id}`, !!QUESTS[id]?.title);

// the ranger's cocoa
at(ft.x + 3, ft.z + 7);
check('Rosie asks for a cocoa', W.offersFor('rosie').some((o) => o.id === 'ranger'));
await W.talk('rosie');
check('the cocoa errand starts', Q.q('ranger').state === 'active');
const cafe = L.frontOf('cafehut', 1.4);
at(cafe.x, cafe.z);
const buy = Q.action(g);
check('the café sells cocoa to go', /cocoa/i.test(buy?.text || ''), buy?.text);
buy?.fn();
check('a hot cup in hand', Q.q('ranger').cup > 100);
step(20);
check('it cools as Hank rides', Q.q('ranger').cup < 135 && Q.q('ranger').cup > 0);
const m0 = g.state.money;
at(ft.x + 3, ft.z + 7);
await W.talk('rosie');
check('Rosie gets her cocoa', Q.q('ranger').state === 'done' && g.state.money > m0);

// Gérard's race: lose once, then win
check('Rosie offers the race', W.offersFor('rosie').some((o) => o.id === 'moose'));
await W.talk('rosie');
check('the race starts with Gérard at the top', !!W.race && Q.q('moose').state === 'active');
step(4);
const s0 = W.race.s;
step(3);
check('Gérard runs down the trail', W.race.s > s0 + 10, `${W.race.s.toFixed(0)} m of ${W.race.total.toFixed(0)}`);
step(33);
check('Gérard wins if Hank dawdles', W.race?.done && Q.q('moose').state === 'active', `${W.race?.s.toFixed(0)} m`);
step(13);
check('a rematch is on offer', !W.race && W.offersFor('rosie').some((o) => o.id === 'moose'));
await W.talk('rosie');
step(5);
const f = W.race.finish;
at(f.x + 2, f.z);
step(0.2);
check('beating Gérard to the bottom wins', Q.q('moose').state === 'done');
step(13);

// Gisèle's paddle
at(-336, 86);
await W.talk('gisele');
check('the paddle errand starts and the paddle is out there', Q.q('paddle').state === 'active' && W.objs.some((o) => o.kind === 'paddle'));
const pd = W.objs.find((o) => o.kind === 'paddle');
at(pd.x + 1.2, pd.z);
const pick = Q.action(g);
check('the paddle can be picked up', /paddle/i.test(pick?.text || ''), pick?.text);
pick?.fn();
at(-336, 86);
await W.talk('gisele');
check('Gisèle gets her paddle back', Q.q('paddle').state === 'done');

// Tremblay's apples
at(-146, 271);
await W.talk('tremblay');
const apples = W.objs.filter((o) => o.kind === 'apple');
check('eight apples lie under the trees', apples.length === 8);
g.onFoot = false;
for (const o of apples) { at(o.x + 0.5, o.z); g.playerPos.y = o.y; Q.update(1 / 30); }
g.onFoot = true;
check('riding over them picks them up', (Q.q('apples').n || 0) === 8, `${Q.q('apples').n}`);
at(-146, 271);
await W.talk('tremblay');
check('the apples go to the press', Q.q('apples').state === 'done');

// the letter by rail (Old Ollie -> Odile -> Ollie)
const ollie = Q.offersFor('ollie').find((o) => o.id === 'railLetter');
check('Ollie has a letter for Odile', !!ollie);
await ollie?.start();
at(-400.6, -142);
await W.talk('odile');
check('Odile writes back', Q.q('railLetter').step === 'ollie');
const fakeOllie = { char: 'ollie', pos: { x: 0, y: 0, z: 0 }, faceTowards() {}, lookAt() {}, react() {}, tempExpr() {} };
const handed = await Q.turnIns(fakeOllie);
check('Ollie gets the reply', handed && Q.q('railLetter').state === 'done');

// the express down the rail trail
at(-400.6, -142);
await W.talk('odile');
check('the express challenge starts', Q.q('express').state === 'active');
const rs = L.ROADS.find((r) => r.id === 'railTrail').pts.at(-1);
g.onFoot = false;
at(rs[0], rs[1]);
step(0.1);
at(rs[0] - 20, rs[1] - 10);
step(0.1);
check('the clock starts riding off from the tree stand', Q.q('express').t != null);
step(25);
const st = L.BUILDINGS.find((b) => b.id === 'station');
at(st.x, st.z + 9);
step(0.1);
check('beating the express wins', Q.q('express').state === 'done');
check('the HUD lists nothing stale', Q.noteLines().every((l) => typeof l === 'string'));
check('quest markers are on the map', Array.isArray(Q.markers()));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
