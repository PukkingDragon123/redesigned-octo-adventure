// The pumpkin carving contest on Main Street, right where the road from Nana's comes
// into Maple Cove (the first thing Hank sees of the village): bunting, trestle tables
// along both kerbs with the carvers' pumpkins and tools, Hank's own little table at
// the west end (src/game/carving.js), the judges' table, the stand of finished entries,
// a pile of pumpkins to pick from, hay bales, corn sheaves and raked leaves. No signs:
// Gus, the host, does the announcing. The middle of the street stays clear for Bessie.
//
// The big pieces (bunting, tables, hay) merge into the town's static chunks
// (VoxelWorld.addStatic); all the little things (pumpkins, the trophy, leaves) merge
// into one more mesh that src/game/contest.js hides once Hank is far off. CONTEST also
// tells the villagers where to stand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as L from './layout.js';
import * as PR from '../voxel/models/props.js';
import * as CM from '../voxel/models/contest.js';

const M = L.MAIN_ST;
const NK = M.z - M.road / 2; // north kerb (z = 46)
const SK = M.z + M.road / 2; // south kerb (z = 54)
const PI = Math.PI;

export const CONTEST = {
  x: 133, z: M.z, r: 20, // the crowd notices Hank inside this circle
  entry: { x: 113, z: M.z, yaw: PI / 2 }, // where Bessie stops for the first look
  west: 121.2, // the west end of the dressing (bunting strings start here)
  // tables along the kerbs: carvers stand on the kerb side (side -1: north, +1: south)
  tables: [
    { x: 125, z: NK + 1.05, yaw: 0, cloth: 'red', seed: 1, wip: [['half', 'cat', 'medium', 4], ['lid', 'happy', 'medium', 7]] },
    { x: 130.2, z: NK + 1.05, yaw: 0, cloth: 'orange', seed: 2, wip: [['sketch', 'wink', 'medium', 11], ['lid', 'maple', 'medium', 12]] },
    { x: 126.4, z: SK - 1.05, yaw: PI, cloth: 'green', seed: 3, wip: [['half', 'owl', 'medium', 15], ['lid', 'wink', 'medium', 16]] },
    { x: 132.4, z: SK - 1.05, yaw: PI, cloth: 'blue', seed: 4, wip: [['sketch', 'heart', 'medium', 19], ['half', 'happy', 'medium', 20]] },
    // the townsfolk's tables at the east end (src/game/crowd.js): a long one on the south
    // side, and the kids' table across the street
    { x: 147.4, z: SK - 1.05, yaw: PI, cloth: 'green', seed: 6, wip: [['half', 'maple', 'medium', 23], ['lid', 'owl', 'medium', 24]] },
    { x: 149.8, z: NK + 1.05, yaw: 0, cloth: 'red', seed: 7, wip: [['sketch', 'cat', 'medium', 27], ['lid', 'happy', 'medium', 28]] },
  ],
  // Hank's table (an empty place for him to carve at; he stands on the kerb side)
  hank: { x: 121.6, z: SK - 1.05, yaw: PI, cloth: 'orange', seed: 5, stand: { x: 121.6, z: SK + 0.05, yaw: PI } },
  judges: { x: 139.6, z: NK + 1.05, len: 2.8 },
  entries: { x: 144, z: NK + 1.0, len: 2.8 },
  giant: { x: 136.6, z: NK + 1.0 },
  pile: { x: 138.4, z: SK - 0.95 },
  // where each villager (brain key) stands and what they do there
  spots: {
    agnes: { x: 124.1, z: NK + 0.12, yaw: 0, role: 'carve', table: 0 },
    marie: { x: 125.9, z: NK + 0.12, yaw: 0, role: 'carve', table: 0 },
    kids: { x: 129.3, z: NK + 0.12, yaw: 0, role: 'kid', table: 1 },
    pop: { x: 131.1, z: NK + 0.12, yaw: 0, role: 'kid', table: 1 },
    birdie: { x: 127.3, z: SK - 0.12, yaw: PI, role: 'carve', table: 2 },
    lou: { x: 131.5, z: SK - 0.12, yaw: PI, role: 'carve', table: 3 },
    ingrid: { x: 139.2, z: NK - 0.05, yaw: 0, role: 'judge' },
    doug: { x: 141.7, z: NK - 0.1, yaw: 0.15, role: 'watch' },
    josee: { x: 133.2, z: NK - 0.2, yaw: -1.45, role: 'cheer' },
    // Gus hosts: announcements from the middle of the street (facing the road in), then
    // a stroll along the tables for a close look at every entry (src/game/contest.js)
    gus: { x: 128.4, z: M.z - 1.4, yaw: -PI / 2, role: 'host' },
  },
  // the judge's round: in front of each north table, looking at the work
  round: [{ x: 130.2, z: NK - 0.1, yaw: 0.25 }, { x: 125, z: NK - 0.1, yaw: 0.25 }],
  // the townsfolk (src/game/crowd.js): where each part of the crowd stands and walks
  crowd: {
    // carving: the spare places at the tables (south ones face north, yaw PI)
    carve: [
      { x: 125.5, z: SK - 0.12, yaw: PI, table: 2 },
      { x: 133.3, z: SK - 0.12, yaw: PI, table: 3 },
      { x: 146.5, z: SK - 0.12, yaw: PI, table: 4 },
      { x: 148.3, z: SK - 0.12, yaw: PI, table: 4 },
      { x: 148.9, z: NK + 0.12, yaw: 0, table: 5 },
      { x: 150.7, z: NK + 0.12, yaw: 0, table: 5 },
    ],
    // two little circles chatting on the sidewalks (out of the walkers' lanes)
    chat: [{ x: 128.2, z: NK - 2.0, r: 0.55 }, { x: 136.4, z: SK + 2.1, r: 0.55 }],
    // hot cider by the judges' table
    cider: [{ x: 139.2, z: NK - 2.0, yaw: PI / 2 + 0.3 }, { x: 140.1, z: NK - 2.05, yaw: -PI / 2 + 0.2 }],
    // things worth a look: (x, z) to stand, (lx, lz) what they look at
    exhibits: [
      { x: 136.6, z: NK + 2.5, lx: 136.6, lz: NK + 1 }, // the giant pumpkin
      { x: 143.3, z: NK + 2.4, lx: 143.3, lz: NK + 1 }, // the finished entries
      { x: 144.8, z: NK + 2.4, lx: 144.8, lz: NK + 1 },
      { x: 124.4, z: NK + 2.3, lx: 124.6, lz: NK + 1 }, // table 0 from the street side
      { x: 130.6, z: NK + 2.3, lx: 130.4, lz: NK + 1 },
      { x: 126.0, z: SK - 2.3, lx: 126.2, lz: SK - 1 },
      { x: 132.8, z: SK - 2.3, lx: 132.6, lz: SK - 1 },
      { x: 147.0, z: SK - 2.3, lx: 147.2, lz: SK - 1 },
      { x: 149.6, z: NK + 2.3, lx: 149.8, lz: NK + 1 },
      { x: 138.4, z: SK - 2.4, lx: 138.4, lz: SK - 0.95 }, // the pile to pick from
    ],
    // where the photographer stands for a shot, and of what
    photo: [
      { x: 134.4, z: M.z - 0.6, lx: 136.6, lz: NK + 1 },
      { x: 142.0, z: M.z - 0.8, lx: 144, lz: NK + 1 },
      { x: 127.6, z: M.z + 0.4, lx: 125, lz: NK + 1.2 },
      { x: 129.6, z: M.z + 0.9, lx: 132.4, lz: SK - 1.2 },
      { x: 148.6, z: M.z, lx: 149.8, lz: NK + 1.2 },
    ],
    // walking lanes along both sidewalks (behind the carvers) and the road's edges
    laneN: NK - 1.0, laneS: SK + 0.95, stripN: NK + 2.5, stripS: SK - 2.5,
    x0: 122.6, x1: 152,
    // the kids' game of tag: on the south sidewalk, through the leaf pile
    tag: { x0: 134.5, x1: 146, z0: SK + 0.55, z1: SK + 1.7 },
    leaves: [{ x: 135.6, z: M.z + 6.0 }, { x: 128.8, z: M.z - 6.1 }, { x: 148, z: M.z - 5.8 }],
    // the elders' favourite spots
    elder: [{ x: 125.2, z: NK - 1.8, yaw: 0.1 }, { x: 140.4, z: SK + 2.1, yaw: PI - 0.1 }],
  },
};

export function dressContest(vw, physprops) {
  const PH = vw.world.physics;
  const gy = (x, z) => vw.ground(x, z);
  const S = (key, fn, x, z, yaw = 0, dy = 0, scale = 1) => {
    const r = vw.model(key, fn);
    vw.addStatic(r, x, gy(x, z) + dy, z, yaw, scale);
    return r;
  };
  // the small stuff: one merged, distance-culled mesh
  const detail = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const SD = (key, fn, x, z, yaw = 0, dy = 0, scale = 1) => {
    const r = vw.model(key, fn);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, gy(x, z) + dy, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(scale, scale, scale));
    detail.push(r.geometry.clone().applyMatrix4(m));
    return r;
  };
  const box = (x, z, yaw, w, l, h) => PH.addBox({ x, z, yaw, w, l, y0: gy(x, z) - 0.6, y1: gy(x, z) + h, kind: 'prop' });
  const post = (x, z, r, h) => PH.addCircle({ x, z, r, y0: gy(x, z) - 1, y1: gy(x, z) + h, kind: 'post' });
  // a model's local point (lx, lz) placed at (x, z) turned by yaw
  const at = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const C = CONTEST;

  // ---- no banner, no signs: corn sheaves on both sidewalks where the street comes in
  const bx = C.west;
  SD('contest:corn', () => PR.cornBundle({ seed: 2 }), bx - 0.4, M.z - 5.7, 2.2);
  SD('contest:corn2', () => PR.cornBundle({ seed: 5 }), bx - 0.2, M.z + 5.8, 0.6);

  // ---- bunting poles and strings: across the street, and along both sidewalks
  const poleH = 4.4;
  for (const x of [bx, 133.6, 146.3, 158.9]) for (const z of [M.z - 6, M.z + 6]) {
    S('contest:pole', () => CM.pole({ h: poleH }), x, z);
    SD('contest:finial', () => CM.simplePumpkin({ r: 0.13, seed: 3 }), x, z, 0, poleH + 0.1);
    post(x, z, 0.1, poleH);
  }
  const string = (ax, az, bx2, bz2, seed) => {
    const len = Math.hypot(bx2 - ax, bz2 - az);
    const dx = (bx2 - ax) / len, dz = (bz2 - az) / len;
    const y = Math.max(gy(ax, az), gy(bx2, bz2)) + poleH - 0.05;
    vw.addStatic(vw.model(`contest:bunting:${Math.round(len * 2)}:${seed}`, () => CM.bunting({ len, sag: len * 0.045, seed })), ax, y, az, Math.atan2(-dz, dx));
  };
  let k = 0;
  for (const x of [133.6, 146.3, 158.9]) string(x, M.z - 6, x, M.z + 6, k++);
  for (const z of [M.z - 6, M.z + 6]) { string(bx, z, 133.6, z, k++); string(133.6, z, 146.3, z, k++); string(146.3, z, 158.9, z, k++); }

  // ---- carving tables: each with its two pumpkins in progress and a spare or two
  C.tables.forEach((t, i) => {
    const r = S(`contest:table:${i}`, () => CM.contestTable({ len: 3.6, seed: t.seed, cloth: t.cloth }), t.x, t.z, t.yaw);
    box(t.x, t.z, t.yaw, 3.7, 0.98, 0.86);
    const top = r.meta.top;
    r.meta.places.forEach((p, j) => {
      const [stage, face, kind, seed] = t.wip[j];
      const [x, z] = at(t.x, t.z, t.yaw, p.x, p.z);
      SD(`contest:wip:${i}:${j}`, () => CM.wipPumpkin({ stage, face, kind, seed }), x, z, t.yaw + (j ? -0.15 : 0.12), top);
    });
    // a little uncarved one waiting at the end of the table
    const [ex, ez] = at(t.x, t.z, t.yaw, (i % 2 ? -1 : 1) * 1.55, 0.2);
    SD(`contest:spare:${i % 3}`, () => CM.simplePumpkin({ r: 0.15, seed: 40 + i, color: ['orange', 'white', 'amber'][i % 3] }), ex, ez, i * 1.7, top);
  });

  // ---- Hank's own little table at the west end: an empty place, a knife and a bowl; his
  // pumpkin (plain, or the face he carved: src/game/carving.js) is placed by the game
  const Hk = C.hank;
  const hr = S('contest:table:hank', () => CM.contestTable({ len: 1.8, seed: Hk.seed, cloth: Hk.cloth, places: 1 }), Hk.x, Hk.z, Hk.yaw);
  box(Hk.x, Hk.z, Hk.yaw, 1.9, 0.98, 0.86);
  {
    const p = hr.meta.places[0];
    const [x, z] = at(Hk.x, Hk.z, Hk.yaw, p.x, p.z);
    const y = gy(x, z) + hr.meta.top;
    const light = { pos: new THREE.Vector3(x, y + 0.35, z), color: [1.0, 0.55, 0.18], radius: 4, kind: 'lamp', on: false };
    vw.lights.push(light);
    vw.contestHank = { x, y, z, yaw: Hk.yaw, light };
  }

  // ---- the judges' table, the trophy, the stand of finished entries and the giant
  const J = C.judges;
  const jr = S('contest:judges', () => CM.judgesTable({ len: J.len }), J.x, J.z, 0);
  box(J.x, J.z, 0, J.len + 0.1, 0.98, 0.86);
  const [tx, ty, tz] = jr.meta.trophy;
  SD('contest:trophy', () => PR.trophyCup(), J.x + tx, J.z + tz, 0.3, ty);
  const E = C.entries;
  const er = S('contest:entries', () => CM.entryStand({ len: E.len }), E.x, E.z, PI);
  box(E.x, E.z, PI, E.len + 0.1, 0.95, 0.9);
  const faces = [['happy', 'medium'], ['maple', 'medium'], ['cat', 'small'], ['classic', 'small'], ['wink', 'medium'], ['owl', 'small']];
  er.meta.tiers.forEach((tier, row) => {
    for (let n = 0; n < 3; n++) {
      const [face, kind] = faces[row * 3 + n];
      const lx = (n - 1) * 0.85 + (row ? 0.2 : -0.1);
      const [x, z] = at(E.x, E.z, PI, lx, tier.z);
      SD(`contest:jack:${face}`, () => PR.jackOLantern({ face: CM.FACES[face] || face, kind, seed: 60 + row * 3 + n, hollow: false }), x, z, (n - 1) * 0.12, tier.y);
    }
  });
  vw.lights.push({ pos: new THREE.Vector3(E.x, gy(E.x, E.z) + 1.2, E.z + 0.6), color: [1.0, 0.55, 0.18], radius: 5, kind: 'lamp' });
  const G = C.giant;
  SD('contest:giant', () => PR.pumpkin({ kind: 'big', seed: 77, color: 'orange', leaf: true, vine: true }), G.x, G.z, 0.4, 0, 1.5);
  post(G.x, G.z, 0.5, 1);

  // ---- pick-your-own pile and a barrow of spares, hay bales for the audience
  const P = C.pile;
  [[0, 0, 0.3, 0], [0.55, 0.15, 0.22, 1], [-0.5, 0.2, 0.24, 2], [0.2, -0.32, 0.2, 3], [-0.28, -0.25, 0.16, 4], [0.05, 0.05, 0.2, 5, 0.38]].forEach(([dx, dz, r, i, dy = 0]) => {
    SD(`contest:pile:${i}`, () => CM.simplePumpkin({ r, seed: 90 + i, color: i === 3 ? 'white' : i === 4 ? 'red' : i === 2 ? 'amber' : 'orange' }), P.x + dx, P.z + dz, i * 1.3, dy);
  });
  post(P.x, P.z, 0.8, 0.9);
  SD('contest:barrow', () => PR.wheelbarrow({ contents: 'pumpkins' }), P.x + 2.2, P.z + 0.1, PI / 2 + 0.3);
  box(P.x + 2.2, P.z + 0.1, PI / 2 + 0.3, 0.8, 1.4, 0.8);
  const hay = (x, z, yaw, i, top) => {
    S(`hay:c${i % 3}`, () => PR.hayBale({ seed: i % 3 }), x, z, yaw);
    box(x, z, yaw, 1.05, 0.62, 0.75);
    if (top) SD(`contest:haytop:${i % 2}`, () => CM.simplePumpkin({ r: 0.2, seed: 50 + i, color: i % 2 ? 'amber' : 'orange' }), x + 0.15, z, i, 0.55);
  };
  hay(141.9, SK - 0.75, 0, 0);
  hay(143.6, SK - 0.75, 0.05, 1);
  hay(bx + 1.3, M.z - 6.25, 0, 2, true);
  hay(bx + 1.3, M.z + 6.25, 0, 3, true);
  hay(bx + 2.5, M.z - 6.3, 0.1, 4);

  // ---- raked leaf piles on the sidewalks (and a few kickable harvest pumpkins)
  [[128.8, M.z - 6.1, 0], [135.6, M.z + 6.0, 1], [148, M.z - 5.8, 2], [139.6, M.z - 6.2, 3]].forEach(([x, z, i]) => SD(`contest:leaves:${i}`, () => CM.leafPile({ seed: i + 1, r: 0.5 + (i % 2) * 0.12 }), x, z, i * 1.1));
  [[123.6, M.z + 3.4], [137.2, M.z + 3.5]].forEach(([x, z], i) => {
    const r = vw.model(`pumpkin:medium:${(i + 2) % 6}`, () => PR.pumpkin({ kind: 'medium', seed: i + 32 }));
    physprops.add(r, x, gy(x, z), z, { yaw: i * 1.7, kind: 'pumpkin', hp: 3, mass: 1.2, lights: false });
  });

  const merged = detail.length ? mergeGeometries(detail, false) : null;
  for (const g of detail) g.dispose();
  if (merged) {
    merged.computeBoundingSphere();
    const mesh = voxMesh(merged, sharedVoxelMaterial(), { cast: false }); // (small things: no need to cast shadows)
    mesh.name = 'contest:detail';
    mesh.matrixAutoUpdate = false;
    vw.scene.add(mesh);
    vw.meshes.push(mesh);
    vw.contestDetail = mesh;
  }
}
