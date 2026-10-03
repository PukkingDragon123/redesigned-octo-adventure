// Dressing for the remade map: Main Street's sidewalks, curbs, lamps & benches, the town green,
// the rink, the bike park, the harbour, the farm, the sugar bush, the campground, the picnic area,
// the beach and the lookout. Everything is voxel art merged into the
// static chunks (see VoxelWorld.addStatic); a few things are kickable physics props.
import * as THREE from 'three';
import * as L from './layout.js';
import * as PR from '../voxel/models/props.js';
import { roadSamples } from './terrain.js';

export function dressPlaces(vw, physprops) {
  const W = vw.world, PH = W.physics, ctx = W.ctx;
  const gy = (x, z) => vw.ground(x, z);
  const S = (key, fn, x, z, yaw = 0, dy = 0, scale = 1) => {
    const r = vw.model(key, fn);
    vw.addStatic(r, x, gy(x, z) + dy, z, yaw, scale);
    return r;
  };
  const post = (x, z, r = 0.16, h = 3) => PH.addCircle({ x, z, r, y0: gy(x, z) - 1, y1: gy(x, z) + h, kind: 'post' });
  const box = (x, z, yaw, w, l, h = 1.2, kind = 'prop') => PH.addBox({ x, z, yaw, w, l, y0: gy(x, z) - 0.6, y1: gy(x, z) + h, kind });
  const bench = (x, z, yaw, color = 'green') => {
    S(`bench:${color}`, () => PR.parkBench({ color }), x, z, yaw);
    box(x, z, yaw, 1.6, 0.55, 0.9, 'bench');
    vw.spot(x, z, 1.4, 'Sit on the bench', 'sit', { yaw, y: gy(x, z) });
  };
  const kickable = (x, z, i) => {
    const r = vw.model(`pumpkin:medium:${i % 6}`, () => PR.pumpkin({ kind: 'medium', seed: i + 30 }));
    physprops.add(r, x, gy(x, z), z, { yaw: i * 1.3, kind: 'pumpkin', hp: 3, mass: 1.2, lights: false });
  };

  mainStreet(vw, { S, post, box, bench, gy, PH });
  green(vw, { S, post, box, bench, gy, ctx });
  bikePark(vw, { S, post, box, bench, gy });
  harbour(vw, { S, post, box, bench, gy });
  farm(vw, { S, post, box, gy, kickable });
  sugarBush(vw, { S, box, gy });
  campground(vw, { S, post, box, bench, gy, ctx });
  picnicArea(vw, { S, post, box, bench, gy });
  beach(vw, { S, post, box, bench, gy, ctx });
  lookout(vw, { S, box, gy });
  roadside(vw, { S, post, box, gy });
  yards(vw, { S, post, box, gy });
  restStop(vw, { S, post, box, bench, gy });
}

// ---------------------------------------------------------------- back yards over the harbour
function yards(vw, { S, post, box, gy }) {
  const shore = L.BOARDWALK[0].a[1] - 7.4;
  const fenceRun = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
    const yaw = -Math.atan2(bz - az, bx - ax);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      S('picket:c', () => PR.picketFence({ len: 3, coarse: true }), x, z, yaw);
      box(x, z, yaw + Math.PI / 2, 0.15, len / n, 1.0, 'fence');
    }
  };
  const ids = ['kids', 'agnes', 'birdie', 'house5', 'house6', 'house7'];
  ids.forEach((id, i) => {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const back = b.z + b.d / 2 + 0.6, xl = b.x - b.w / 2 - 1.4, xr = b.x + b.w / 2 + 1.4;
    fenceRun(xl, shore, xr, shore); // along the shore, with a gate gap in the middle
    fenceRun(xl, back + 1, xl, shore);
    if (i === ids.length - 1 || L.BUILDINGS.find((q) => q.id === ids[i + 1]).x - b.x > b.w + 4) fenceRun(xr, back + 1, xr, shore);
    // Muskoka chairs looking out over the harbour, a garden, laundry on the line
    for (const dx of [-1.1, 1.1]) S(`muskoka:${(i + (dx > 0 ? 1 : 0)) % 5}`, () => PR.muskokaChair({ color: [0xc8382e, 0x2f8a86, 0xe8b830, 0x3a5aa8, 0x5a9a48][(i + (dx > 0 ? 1 : 0)) % 5] }), b.x + dx + 1.5, shore - 2.4, 0.05 * dx);
    if (i % 2 === 0) S(`clothes:${i % 3}`, () => PR.clothesline({ seed: i }), b.x - 1, back + 4.5, 0.08);
    else { S(`vines:${i % 3}`, () => PR.pumpkinVines({ seed: i }), b.x - 2.5, back + 4.5, i); S(`pp:medium:${i % 4}`, () => PR.pumpkin({ kind: 'medium', seed: i % 4 + 50 }), b.x - 2.2, back + 4.2, i); }
  });
  // the countryside houses get a picket fence along their front yard
  for (const id of ['houseRiver', 'farmhouse']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const f = b.facing || 0, c = Math.cos(f), s2 = Math.sin(f);
    const ex = b.d / 2 + 5.5, hw = b.w / 2 + 2;
    const P = (lx, lz) => [b.x + lx * c + lz * s2, b.z - lx * s2 + lz * c];
    const [ax, az] = P(-hw, ex), [bx, bz] = P(-1.4, ex), [cx, cz] = P(1.4, ex), [dx, dz] = P(hw, ex);
    fenceRun(ax, az, bx, bz);
    fenceRun(cx, cz, dx, dz);
  }
}

// ---------------------------------------------------------------- the rest area & the giant goose
function restStop(vw, { S, post, box, bench, gy }) {
  const r = L.POI.restStop;
  // the goose looks out at the road (north of the pull-off)
  S('giantgoose', () => PR.giantGoose(), r.x + 1, r.z + 2, Math.PI - 0.2);
  box(r.x + 1, r.z + 2, Math.PI - 0.2, 2.4, 3.4, 4.5, 'statue');
  S('picnic:rest', () => PR.picnicTable({ cloth: false }), r.x - 4.5, r.z + 4, 0.5);
  box(r.x - 4.5, r.z + 4, 0.5, 1.9, 1.7, 0.8, 'table');
  bench(r.x + 5, r.z + 6, -0.6, 'green');
  S('bin', () => PR.litterBin(), r.x - 2, r.z + 7.5, 0); post(r.x - 2, r.z + 7.5, 0.32, 1.1);
  S('welcome:rest', () => PR.welcomeSign({ text: 'HALTE ROUTIERE REST AREA' }), r.x - 5, r.z - 5, Math.PI + 0.25);
  box(r.x - 5, r.z - 5, Math.PI + 0.25, 3.2, 0.4, 2.2);
}

// ---------------------------------------------------------------- Main Street
function mainStreet(vw, { S, post, box, bench, gy, PH }) {
  const M = L.MAIN_ST;
  const hw = M.road / 2, wz = M.walk / 2;
  const gap = (x, side) => L.SIDE_STREETS.some((s) => s.side === side && Math.abs(x - s.x) < s.w / 2 + 0.6);
  // sidewalks with granite curbs, in 4 m lengths (the curb always faces the road)
  for (const side of [-1, 1]) {
    const z = M.z + side * (hw + wz);
    for (let x = M.x0; x < M.x1 - 0.1; x += 4) {
      const cx = x + 2;
      if (gap(cx, side)) continue;
      const seed = Math.floor(x) % 5;
      const r = vw.model(`sidewalk:${seed}`, () => PR.sidewalk({ len: 4, w: M.walk, seed }));
      const top = r.meta.top;
      const ya = gy(x, z) + 0.17, yb = gy(x + 4, z) + 0.17, yc = gy(cx, z) + 0.17;
      vw.addStatic(r, cx, yc - top, z, side < 0 ? 0 : Math.PI);
      PH.addPlatform({ x: cx, z, yaw: Math.PI / 2, w: M.walk, l: 4, y0: ya, y1: yb, surface: 'road', kind: 'sidewalk' });
    }
  }
  // lamps every 16 m on both curbs, staggered; maple-leaf banners
  let k = 0;
  for (let x = M.x0 + 6; x <= M.x1 - 4; x += 8, k++) {
    if (L.CROSSWALKS.some((c) => Math.abs(c - x) < 2.5)) continue;
    const side = k % 2 ? 1 : -1, z = M.z + side * (hw + 0.55);
    S(`townlamp:${side}`, () => PR.townLamp({ banner: true, flip: side > 0 }), x, z, side < 0 ? 0 : Math.PI, 0.17);
    post(x, z, 0.18, 4.5);
  }
  // benches, planters, bins and racks against the shopfronts; the post box by the post office
  const frontN = M.z - hw - M.walk + 0.45, frontS = M.z + hw + M.walk - 0.45;
  const nBench = [[150, 'green'], [178, 'wood'], [196, 'wood'], [223, 'green'], [253, 'green']];
  for (const [x, c] of nBench) bench(x, frontN + 0.3, 0, c);
  for (const [x, c] of [[131, 'wood'], [173, 'green'], [201.5, 'green'], [237, 'wood']]) bench(x, frontS - 0.3, Math.PI, c);
  const planters = [[134.5, -1], [149, -1], [163.5, -1], [208.5, -1], [238.5, -1], [254.5, -1], [145, 1], [161, 1], [188, 1], [214, 1], [250, 1]];
  planters.forEach(([x, side], i) => { const z = side < 0 ? frontN - 0.05 : frontS + 0.05; S(`planter:${i % 3}`, () => PR.planter({ seed: i % 3 }), x, z, i, 0.17); post(x, z, 0.42, 0.9); });
  for (const [x, side] of [[152.4, -1], [226, -1], [176, 1], [242, 1]]) { const z = side < 0 ? frontN : frontS; S('bin', () => PR.litterBin(), x, z, 0, 0.17); post(x, z, 0.32, 1.1); }
  S('postbox', () => PR.postBox(), 138, M.z - hw - 1.0, 0, 0.17); post(138, M.z - hw - 1.0, 0.34, 1.4);
  for (const [x, side] of [[160.5, -1], [218.5, -1]]) { const z = side < 0 ? frontN - 0.1 : frontS; S('bikerack', () => PR.bikeRack(), x, z, 0, 0.17); box(x, z, 0, 2, 0.3, 0.9); }
  for (const [x, side] of [[124, 1], [184, -1], [232, 1]]) { const z = M.z + side * (hw + 0.6); S('hydrant', () => PR.hydrant(), x, z, side < 0 ? 0 : Math.PI, 0.17); post(x, z, 0.22, 0.9); }
  // café terrace: bistro tables & chairs on the sidewalk
  const cafe = L.BUILDINGS.find((b) => b.id === 'cafe');
  for (const dx of [3.2, -3.0 - 1.6]) {
    const x = cafe.x + dx + 0.8, z = frontN - 0.4;
    S('bistro:t', () => PR.cafeTable({ color: 'green' }), x, z, 0, 0.17);
    S('bistro:c', () => PR.cafeChair({ color: 'green' }), x - 0.7, z, Math.PI / 2, 0.17);
    S('bistro:c', () => PR.cafeChair({ color: 'green' }), x + 0.7, z, -Math.PI / 2, 0.17);
    post(x, z, 0.5, 1);
  }
  // STOP / ARRÊT at the side streets, facing the traffic coming out of them
  for (const s of L.SIDE_STREETS) {
    const z = s.side < 0 ? M.z - hw - M.walk - 0.6 : M.z + hw + M.walk + 0.6;
    const x = s.x + (s.side < 0 ? -1 : 1) * (s.w / 2 + 0.4);
    S('stop', () => PR.stopSign(), x, z, s.side < 0 ? Math.PI : 0);
    post(x, z, 0.08, 2.6);
  }
  // the welcome sign at the west end
  S('welcome:cove', () => PR.welcomeSign({ text: 'BIENVENUE MAPLE COVE' }), M.x0 - 10, M.z - 6.6, Math.PI / 2 - 0.2);
  box(M.x0 - 10, M.z - 6.6, Math.PI / 2 - 0.2, 3.2, 0.4, 2.2);
  // a few kickable pumpkins tucked by doors (more come from L.LOOSE_PUMPKINS)
  void gy;
}

// ---------------------------------------------------------------- the green
function green(vw, { S, post, box, bench, gy, ctx }) {
  const p = L.POI.plaza;
  // the big flag on its pole, the war memorial with poppies, benches round the paths
  const fx = p.x + 7, fz = p.z - 6;
  const fp = S('flagpole:8', () => PR.flagPole({ h: 8 }), fx, fz);
  post(fx, fz, 0.2, 8);
  ctx.flags.push({ pos: new THREE.Vector3(fx + 0.06, gy(fx, fz) + fp.meta.flagAt, fz), w: 2.2, h: 1.1 });
  S('cenotaph', () => PR.cenotaph(), p.x - 10, p.z - 8, 0.3);
  post(p.x - 10, p.z - 8, 0.9, 3);
  for (const [dx, dz, yaw] of [[-5.5, 11, Math.PI * 0.75], [5.5, 11, -Math.PI * 0.75], [-11, 2, Math.PI / 2], [11, 2, -Math.PI / 2]]) bench(p.x + dx, p.z + dz, yaw, 'green');
  for (const [dx, dz] of [[-13, -13], [13, -13], [-15, 12], [15, 12]]) {
    S('greenlamp', () => PR.streetLamp({ variant: 'post', lit: true }), p.x + dx, p.z + dz);
    post(p.x + dx, p.z + dz, 0.16, 3);
  }
  S('pstack:1', () => PR.pumpkinStack({ seed: 3 }), p.x + 3, p.z + 13);
  S('pstack:2', () => PR.pumpkinStack({ seed: 5 }), p.x - 15.5, p.z - 2);
  S('scarecrow:g2', () => PR.scarecrow({ seed: 1, crow: false }), p.x + 15, p.z - 4, -1.2);
  for (const [dx, dz, i] of [[-12, 8, 0], [12.5, 7, 1], [-4, -13, 2]]) S(`hay:g${i}`, () => PR.hayBale({ seed: i }), p.x + dx, p.z + dz, i * 0.7);
  // the rink's nets (the rink itself is a building), and a bench for skaters to lace up
  const rk = L.BUILDINGS.find((b) => b.id === 'rink');
  for (const sx of [-1, 1]) S('hockeynet', () => PR.hockeyNet(), rk.x + sx * (rk.w / 2 - 1.75), rk.z, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 0.08);
}

// ---------------------------------------------------------------- bike park
function bikePark(vw, { S, post, box, bench, gy }) {
  const bp = L.POI.bikePark;
  // coping stones round the bowl's lip
  for (const bw of L.BOWLS) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = bw.x + Math.cos(a) * (bw.r + 0.4), z = bw.z + Math.sin(a) * (bw.r + 0.4);
      S(`coping`, () => PR.sidewalk({ len: 2, w: 0.6, seed: 9 }), x, z, -a + Math.PI / 2, -0.33);
    }
  }
  S('welcome:park', () => PR.welcomeSign({ text: 'BIKE PARK' }), bp.x - 10, bp.z + 15, 0.2);
  box(bp.x - 10, bp.z + 15, 0.2, 3.2, 0.4, 2.2);
  bench(bp.x + 13, bp.z + 15, Math.PI + 0.1, 'red');
  for (let i = 0; i < 5; i++) S(`railfence:p${i % 2}`, () => PR.railFence({ len: 3, seed: i % 2 }), bp.x - 20 + i * 3.1, bp.z - 15.5, 0);
}

// ---------------------------------------------------------------- harbour
function harbour(vw, { S, post, box, bench, gy }) {
  const bw = L.BOARDWALK[0];
  const y = bw.h;
  // lobster traps stacked by the docks, buoys hung on the railing, crates of the day's catch
  for (const d of L.DOCKS) {
    const x = d.a[0] + 3, z = bw.a[1] - 0.6;
    for (let i = 0; i < 3; i++) vw.addStatic(vw.model(`trap:${i}`, () => PR.lobsterTrap({ seed: i })), x + (i % 2) * 0.75, y + Math.floor(i / 2) * 0.42, z, i * 0.2);
    vw.addStatic(vw.model('buoy:1', () => PR.buoy({ seed: 1 })), x - 1.4, y, z + 0.2, 0);
    box(x + 0.3, z, 0, 1.6, 0.8, 1, 'crate');
  }
  // rowboats & canoes pulled up on the shore west of the boardwalk
  S('canoe:red', () => PR.canoe({ color: 0xb83a2a }), 120, 89, 0.5);
  S('canoe:green', () => PR.canoe({ color: 0x2f6e6a, flip: true }), 122.5, 91, 0.62);
  void post; void bench;
}

// ---------------------------------------------------------------- the farm
function farm(vw, { S, post, box, gy, kickable }) {
  const pp = L.POI.pumpkinPatch, cm = L.POI.cornMaze;
  // pumpkin patch: vines with fat pumpkins all over, a few you can kick
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) S(`vines:${(i + j + 4) % 3}`, () => PR.pumpkinVines({ seed: (i + j + 4) % 3 }), pp.x + i * 2.1, pp.z + j * 2.1, (i * 3 + j) * 0.7, -0.02);
  let n = 0;
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399, d = 1 + Math.sqrt(i / 26) * 5.2;
    const x = pp.x + Math.cos(a) * d, z = pp.z + Math.sin(a) * d;
    const kind = ['big', 'medium', 'squat', 'small', 'medium'][i % 5];
    S(`pp:${kind}:${i % 4}`, () => PR.pumpkin({ kind, seed: i % 4 + 50, color: i % 9 === 4 ? 'white' : 'orange' }), x, z, a);
    n++;
  }
  [[pp.x + 6.4, pp.z - 5], [pp.x - 6.2, pp.z + 4.4], [pp.x + 5.5, pp.z + 6]].forEach(([x, z], i) => kickable(x, z, 40 + i));
  S('scarecrow:pp', () => PR.scarecrow({ seed: 0, crow: true }), pp.x, pp.z, 0.4);
  post(pp.x, pp.z, 0.3, 2);
  // split-rail fence round the patch
  const fence = (cx, cz, hw, hd, gapSide) => {
    for (const [ax, az, bx, bz, sd] of [[-hw, -hd, hw, -hd, 'n'], [hw, -hd, hw, hd, 'e'], [hw, hd, -hw, hd, 's'], [-hw, hd, -hw, -hd, 'w']]) {
      const len = Math.hypot(bx - ax, bz - az), segs = Math.round(len / 3.1);
      for (let k = 0; k < segs; k++) {
        if (sd === gapSide && k === Math.floor(segs / 2)) continue;
        const t = (k + 0.5) / segs, x = cx + ax + (bx - ax) * t, z = cz + az + (bz - az) * t;
        const yaw = Math.atan2(bz - az, bx - ax);
        S(`railfence:${k % 2}`, () => PR.railFence({ len: 3, seed: k % 2 }), x, z, -yaw);
        box(x, z, -yaw + Math.PI / 2, 0.2, 3.1, 1.3, 'fence');
      }
    }
  };
  fence(pp.x, pp.z, 9, 9, 'n');
  // corn maze: rows on a 4 m grid with a winding path through; entry from the north, exit east
  const G = 4, N = 6; // 6 x 6 cells
  const ox = cm.x - (N * G) / 2, oz = cm.z - (N * G) / 2;
  // a perfect maze (one way through), carved with a seeded depth-first walk
  const Hw = Array.from({ length: N + 1 }, () => Array(N).fill(1)); // walls between rows j-1 and j
  const Vw = Array.from({ length: N }, () => Array(N + 1).fill(1)); // walls between columns i-1 and i
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stack = [[2, 0]];
  seen[0][2] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b2]) => a >= 0 && b2 >= 0 && a < N && b2 < N && !seen[b2][a]);
    if (!nb.length) { stack.pop(); continue; }
    const [a, b2] = nb[Math.floor(rnd() * nb.length)];
    if (a !== i) Vw[j][Math.max(a, i)] = 0; else Hw[Math.max(b2, j)][i] = 0;
    seen[b2][a] = true;
    stack.push([a, b2]);
  }
  Hw[0][2] = 0; // entrance from the farmyard (north)
  Vw[4][N] = 0; // exit towards the sawmill road (east)
  const H = Hw.map((r) => r.join('')), V = Vw.map((r) => r.join(''));
  let wi = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) if (H[j][i] === '1') {
    const x = ox + (i + 0.5) * G, z = oz + j * G;
    S(`corn:${wi++ % 3}`, () => PR.cornRow({ len: G, seed: wi % 3 }), x, z, 0);
    box(x, z, 0, G, 0.8, 2.2, 'hedge');
  }
  for (let j = 0; j < N; j++) for (let i = 0; i <= N; i++) if (V[j][i] === '1') {
    const x = ox + i * G, z = oz + (j + 0.5) * G;
    S(`corn:${wi++ % 3}`, () => PR.cornRow({ len: G, seed: wi % 3 }), x, z, Math.PI / 2);
    box(x, z, Math.PI / 2, G, 0.8, 2.2, 'hedge');
  }
  S('welcome:maze', () => PR.welcomeSign({ text: 'LABYRINTHE CORN MAZE' }), cm.x - 4, oz - 2.2, 0);
  box(cm.x - 4, oz - 2.2, 0, 3.2, 0.4, 2.2);
  S('scarecrow:maze', () => PR.scarecrow({ seed: 1, crow: true }), cm.x, cm.z, 2.2);
  // the farmyard: tractor, hay, crates of apples, a wheelbarrow of pumpkins
  const f = L.POI.farm;
  S('tractor', () => PR.tractor({}), f.x - 3, f.z - 14, 0.9);
  box(f.x - 3, f.z - 14, 0.9, 1.8, 3.1, 1.8, 'tractor');
  for (const [dx, dz, i] of [[10, -14, 0], [11, -12.6, 1], [10.5, -13.3, 2]]) S(`hay:f${i}`, () => PR.hayBale({ seed: i }), f.x + dx, f.z + dz, i * 0.4, i === 2 ? 0.7 : 0);
  box(f.x + 10.5, f.z - 13.3, 0, 2, 2.4, 1.4);
  S('applecrate:1', () => PR.appleCrate({ seed: 1 }), f.x + 4, f.z - 19, 0.2);
  S('wheelbarrow:f', () => PR.wheelbarrow({ contents: 'pumpkins' }), f.x + 6, f.z - 18.5, 1.1);
  S('welcome:farm', () => PR.welcomeSign({ text: 'FERME GAGNON FARM' }), f.x - 6.5, f.z - 36.6, 0);
  box(f.x - 6.5, f.z - 36.6, 0, 3.2, 0.4, 2.2);
  void n;
}

// ---------------------------------------------------------------- the sugar bush
function sugarBush(vw, { S, box, gy }) {
  const ss = L.POI.sugarShack;
  // sap buckets on the maples round the shack
  const trees = vw.world.forest?.trees || [];
  let n = 0;
  for (const t of trees) {
    if (t.bush || !t.trunk || !/^maple/.test(t.species)) continue;
    const d = Math.hypot(t.x - ss.x, t.z - ss.z);
    if (d > 30 || d < 6) continue;
    const a = Math.atan2(ss.z - t.z, ss.x - t.x); // face the shack
    const r = t.trunk.r * 1.3 + 0.02;
    S('sapbucket', () => PR.sapBucket(), t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, Math.PI / 2 - a, 1.05);
    if (++n >= 18) break;
  }
  S('firewood:ss', () => PR.firewoodPile({ seed: 3, rows: 5 }), ss.x - 7, ss.z + 6, 0.3);
  box(ss.x - 7, ss.z + 6, 0.3, 2.4, 1.2, 1.2);
  S('stump:ss', () => PR.stumpWithAxe({ seed: 2 }), ss.x - 4.5, ss.z + 8, 1);
  S('welcome:sugar', () => PR.welcomeSign({ text: 'TIRE SUR LA NEIGE' }), ss.x - 14, ss.z + 2.5, Math.PI / 2 + 0.3);
  box(ss.x - 14, ss.z + 2.5, Math.PI / 2 + 0.3, 3.2, 0.4, 2.2);
}

// ---------------------------------------------------------------- campground by the beaver pond
function campground(vw, { S, post, box, bench, gy, ctx }) {
  const c = L.POI.campground;
  const tents = [[-6, 3, 0.8, 0xd8702a], [1, -6, -0.3, 0x3a8a6a], [7, 2, -1.4, 0x3a5aa8]];
  tents.forEach(([dx, dz, yaw, col], i) => { S(`tent:${i}`, () => PR.tent({ color: col, seed: i }), c.x + dx, c.z + dz, yaw); box(c.x + dx, c.z + dz, yaw, 2.2, 2.3, 1.5, 'tent'); });
  // the campfire with log seats
  const fx = c.x + 0.5, fz = c.z + 1.5;
  S('firepit:camp', () => PR.firePit({ lit: true, seed: 4 }), fx, fz, 0.3);
  post(fx, fz, 0.6, 0.8);
  ctx.fires.push(new THREE.Vector3(fx, gy(fx, fz) + 0.3, fz));
  ctx.lights.push({ pos: new THREE.Vector3(fx, gy(fx, fz) + 0.9, fz), color: [1.0, 0.5, 0.2], radius: 9, kind: 'fire', always: true });
  for (const a of [0.6, 2.4, 4.4]) { const x = fx + Math.cos(a) * 2.2, z = fz + Math.sin(a) * 2.2; S('logseat', () => PR.driftwood({ seed: 7 }), x, z, -a, -0.15, 0.6); }
  S('picnic:camp', () => PR.picnicTable({ cloth: true }), c.x - 5, c.z - 5, 0.4);
  box(c.x - 5, c.z - 5, 0.4, 1.9, 1.7, 0.8, 'table');
  S('canoe:camp', () => PR.canoe({ color: 0xb83a2a, flip: true }), c.x + 12, c.z - 9, 0.9);
  S('welcome:camp', () => PR.welcomeSign({ text: 'CAMPING BEAVER POND' }), c.x - 4, c.z + 11, Math.PI + 0.2);
  box(c.x - 4, c.z + 11, Math.PI + 0.2, 3.2, 0.4, 2.2);
  S('lantern:camp', () => PR.lantern({ color: 'red', lit: true }), c.x - 4.6, c.z - 4.6, 0, 0.82);
  void bench;
}

// ---------------------------------------------------------------- picnic area by the creek
function picnicArea(vw, { S, post, box, bench, gy }) {
  const p = L.POI.picnic;
  [[-3, -2, 0.2, true], [3, 1, -0.4, false], [-1, 5, 1.2, true]].forEach(([dx, dz, yaw, cloth], i) => {
    S(`picnic:${cloth ? 1 : 0}`, () => PR.picnicTable({ cloth }), p.x + dx, p.z + dz, yaw);
    box(p.x + dx, p.z + dz, yaw, 1.9, 1.7, 0.8, 'table');
  });
  S('bbq', () => PR.bbqGrill(), p.x + 5.5, p.z - 3, 0); post(p.x + 5.5, p.z - 3, 0.35, 1);
  S('bin', () => PR.litterBin(), p.x + 6.5, p.z + 3.5, 0); post(p.x + 6.5, p.z + 3.5, 0.32, 1.1);
  S('welcome:picnic', () => PR.welcomeSign({ text: 'PIQUE-NIQUE PICNIC' }), p.x + 2, p.z - 9, -0.2);
  box(p.x + 2, p.z - 9, -0.2, 3.2, 0.4, 2.2);
  void bench;
}

// ---------------------------------------------------------------- Sandy Point Beach
function beach(vw, { S, post, box, bench, gy, ctx }) {
  const b = L.BEACHES[0];
  // beach frame: n = out to sea, t = along the shore
  const nx = Math.cos(b.angle), nz = Math.sin(b.angle), tx = -nz, tz = nx;
  const at = (along, inland) => [b.x + tx * along - nx * inland, b.z + tz * along - nz * inland];
  const seaYaw = Math.atan2(nx, nz); // a model's +z facing the sea
  // a beach bonfire ringed by Muskoka chairs
  const [fx, fz] = at(-6, 16);
  S('firepit:beach', () => PR.firePit({ lit: true, seed: 7 }), fx, fz, 0.2);
  post(fx, fz, 0.6, 0.8);
  ctx.fires.push(new THREE.Vector3(fx, gy(fx, fz) + 0.3, fz));
  ctx.lights.push({ pos: new THREE.Vector3(fx, gy(fx, fz) + 0.9, fz), color: [1.0, 0.5, 0.2], radius: 10, kind: 'fire', always: true });
  const chairs = [0xc8382e, 0x2f8a86, 0xe8b830, 0x3a5aa8, 0x5a9a48];
  chairs.forEach((col, i) => {
    const a = (i / chairs.length) * Math.PI * 1.6 + 0.9 + seaYaw;
    const x = fx + Math.sin(a) * 2.6, z = fz + Math.cos(a) * 2.6;
    S(`muskoka:${i}`, () => PR.muskokaChair({ color: col }), x, z, a + Math.PI);
    box(x, z, a, 0.9, 1.1, 0.9, 'chair');
    vw.spot(x, z, 1.1, 'Sit in the Muskoka chair', 'sit', { yaw: a + Math.PI, y: gy(x, z) + 0.05 });
  });
  // sand castles near the waterline, umbrellas, driftwood, boats pulled up
  [[-20, 4, 1], [10, 3, 2], [24, 5, 3]].forEach(([al, inl, seed]) => { const [x, z] = at(al, inl); S(`castle:${seed}`, () => PR.sandCastle({ seed }), x, z, seed); });
  [[-14, 12, 0xc8382e], [16, 13, 0x2f8a86], [4, 19, 0xe8b830]].forEach(([al, inl, col], i) => { const [x, z] = at(al, inl); S(`umbrella:${i}`, () => PR.beachUmbrella({ color: col }), x, z, i * 1.7); post(x, z, 0.08, 2.2); });
  [[-30, 22, 0.3], [30, 24, -0.4], [0, 27, 1.2]].forEach(([al, inl, yaw], i) => { const [x, z] = at(al, inl); S(`drift:${i % 2}`, () => PR.driftwood({ seed: i }), x, z, seaYaw + yaw, -0.08); box(x, z, seaYaw + yaw + Math.PI / 2, 0.5, 3.4, 0.5, 'log'); });
  { const [x, z] = at(-36, 8); S('canoe:beach', () => PR.canoe({ color: 0xb83a2a }), x, z, seaYaw + 1.3, -0.05); }
  { const [x, z] = at(36, 9); S('rowboat:beach', () => PR.rowboat({ color: 0x3a7ab0 }), x, z, seaYaw + 1.9, -0.1); box(x, z, seaYaw + 1.9, 1.2, 3.2, 0.6, 'boat'); }
  // by the chip shack: picnic tables, a bin and the beach sign
  const fc = L.BUILDINGS.find((q) => q.id === 'fishchips');
  for (const [dx, dz, i] of [[5, -4, 0], [5.5, 2.5, 1]]) { S(`picnic:${i}`, () => PR.picnicTable({ cloth: i === 1 }), fc.x + dx, fc.z + dz, 0.2); box(fc.x + dx, fc.z + dz, 0.2, 1.9, 1.7, 0.8, 'table'); }
  S('bin', () => PR.litterBin(), fc.x + 3, fc.z + 6, 0); post(fc.x + 3, fc.z + 6, 0.32, 1.1);
  S('welcome:beach', () => PR.welcomeSign({ text: 'PLAGE SANDY POINT BEACH' }), 251, -32, Math.PI / 2);
  box(251, -32, Math.PI / 2, 3.2, 0.4, 2.2);
}

// ---------------------------------------------------------------- the lookout
function lookout(vw, { S, box, gy }) {
  const p = L.POI.lookout;
  S('inukshuk', () => PR.inukshuk({ seed: 3 }), p.x + 4.5, p.z - 2.5, 0.9);
  box(p.x + 4.5, p.z - 2.5, 0.9, 1.6, 0.5, 2);
}

// ---------------------------------------------------------------- along the roads
function roadside(vw, { S, post, box, gy }) {
  // the honour-box pumpkin stand at the farm gate, facing the road
  const ps = L.POI.pumpkinStand;
  S('farmstand', () => PR.farmStand({ text: 'CITROUILLES PUMPKINS 3$' }), ps.x, ps.z, Math.PI);
  box(ps.x, ps.z, Math.PI, 2.4, 1.3, 2);
  // moose crossing warnings on the main road and the coast road
  for (const [x, z, yaw] of [[-40, 39.2, Math.PI / 2], [30, 43.2, -Math.PI / 2], [258, -64, Math.PI]]) {
    S('moosesign', () => PR.mooseSign(), x, z, yaw);
    post(x, z, 0.08, 2.8);
  }
  // mailboxes at the countryside houses
  for (const id of ['houseRiver', 'houseLoop', 'houseHill', 'farmhouse']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const p = L.frontOf(id, 4.5, b.w / 2 + 1);
    S(`mailbox:${id}`, () => PR.mailbox({ variant: 'classic', flag: id === 'farmhouse' ? 'up' : 'down', number: id.length * 7 }), p.x, p.z, b.facing || 0);
    post(p.x, p.z, 0.12, 1.4);
  }
  void roadSamples;
}
