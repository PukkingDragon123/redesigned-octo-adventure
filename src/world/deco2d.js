// Where the 2D street clutter goes (the art is src/art/deco2d.js, the knocking
// about is src/game/deco2d.js): split-rail fences along the country roads,
// white pickets round the yards and down Wharf Street, trash cans, recycling
// bins, mailboxes, sandwich boards, bikes and flower boxes on Main Street, the
// fish stall and the maple syrup stand on the boardwalk by Wharf Street, a poutine
// cart on the green, lobster traps, buoys and barrels on the waterfront, hay
// bales in the fields, firewood by the cabins, laundry lines behind the houses,
// scarecrows and a few lamp posts along the dark country road.
//
// The 2D furniture (porches, yards, café terraces, shop windows, the harbour,
// the beach and the green) is placed by furniture2d.js with the same kit.
//
// Every spot is checked against buildings, colliders, roads, water, doorways and
// the story's staging areas, and the ground under the whole footprint has to be
// level, so a placement that does not fit is simply skipped (nothing floats or
// sinks). Static pieces (stalls, cart, lamps, laundry posts, scarecrows, swings,
// umbrella tables...) get colliders; knockable ones do not (the bike and Hank
// knock them over instead). Flat things (mats, towels, window displays) are
// returned as cards. The sprite atlas starts baking in a worker right here.
import * as THREE from 'three';
import * as L from './layout.js';
import { roadSamples } from './terrain.js';
import { SpatialHash } from '../core/spatial.js';
import { RNG } from '../core/noise.js';
import { FOOT2, placeFurniture } from './furniture2d.js';
import { startDecoPaint } from '../art/decoStart.js';

// per-kind footprint: r (radius), len (half length along the piece's width axis), h (height)
export const FOOT = {
  picket: { r: 0.1, len: 1.0, h: 1.0 },
  rail: { r: 0.1, len: 1.5, h: 1.15 },
  rail2: { r: 0.1, len: 1.5, h: 1.15 },
  trashcan: { r: 0.28, h: 0.85 },
  recycle: { r: 0.3, h: 0.5 },
  crate: { r: 0.36, h: 0.55 },
  barrel: { r: 0.3, h: 0.88 },
  firewood: { r: 0.45, len: 0.3, h: 0.5 },
  hay: { r: 0.6, h: 1.1 },
  sandwich: { r: 0.3, h: 0.9 },
  mailbox: { r: 0.2, h: 1.35 },
  mailboxRed: { r: 0.2, h: 1.35 },
  flowerbox: { r: 0.2, len: 0.4, h: 0.4 },
  flowerbox2: { r: 0.2, len: 0.4, h: 0.4 },
  yardsign: { r: 0.15, len: 0.3, h: 0.95 },
  bike: { r: 0.25, len: 0.7, h: 1.0, axis: 'x' },
  trap: { r: 0.3, len: 0.2, h: 0.45 },
  buoy: { r: 0.17, h: 0.55 },
  laundry: { r: 0.12, len: 1.8, h: 1.9, fixed: true },
  scarecrow: { r: 0.25, h: 1.7, fixed: true },
  lamp: { r: 0.12, h: 2.6, fixed: true },
  fishstall: { r: 0.6, len: 1.05, h: 2.1, fixed: true, stall: true },
  syrupstand: { r: 0.55, len: 0.9, h: 2.1, fixed: true, stall: true },
  cart: { r: 0.5, len: 0.7, h: 2.3, fixed: true, stall: true },
  ...FOOT2,
};

export function placeDeco2D(vw) {
  const W = vw.world, PH = W.physics, T = W.terrain;
  const items = [];
  const cards = [];
  const lawns = [];
  const placed = new SpatialHash(6);
  const rng = new RNG(2718);
  const gy = (x, z) => PH.groundAt(x, z, 60).h;
  const probe = { x: 0, y: 0, z: 0 };
  const M = L.MAIN_ST;
  // story staging spots and gameplay spots that must stay clear
  const keepOut = [
    [L.POI.grave.x, L.POI.grave.z, 10], [L.POI.lumberCamp.x, L.POI.lumberCamp.z, 15], [L.HOME_SPAWN.x, L.HOME_SPAWN.z, 6],
    [L.POI.catLog.x, L.POI.catLog.z, 5], [L.MO_SPOT.x, L.MO_SPOT.z, 2], [L.POI.bridge.x, L.POI.bridge.z, 13],
    [L.BOWLING.x, L.BOWLING.z - 3, 6], [L.HOME_SPOTS.porch.x, L.HOME_SPOTS.porch.z, 7], [L.HOME_SPOTS.garage.x, L.HOME_SPOTS.garage.z, 6],
    ...L.RAMPS.map((r) => [r.x, r.z, r.len + 2]),
    ...L.PLANT_SPOTS.map(([x, z]) => [x, z, 2.5]), ...L.KEEPSAKES.map((k) => [k.x, k.z, 2]),
    ...Object.values(L.CUSTOMERS).map((c) => [c.x, c.z, 2.2]),
  ];
  const kept = (x, z) => keepOut.every(([kx, kz, r]) => (x - kx) ** 2 + (z - kz) ** 2 > r * r);
  // the way in and out of every door stays clear: a corridor from the threshold out past the steps
  const doors = [];
  for (const b of L.BUILDINGS) {
    const f = b.facing || 0, c = Math.cos(f), s2 = Math.sin(f);
    const meta = W.buildings?.[b.id]?.voxel?.meta;
    const dx = meta?.door?.x ?? 0, dz = meta?.door?.z ?? b.d / 2;
    const deep = (meta?.porch || []).reduce((m, d) => (d.x0 < dx && d.x1 > dx ? Math.max(m, d.z1 - dz) : m), 0);
    doors.push({ x: b.x + dx * c + dz * s2, z: b.z - dx * s2 + dz * c, fx: s2, fz: c, len: deep + 1.9 });
  }
  const inDoorway = (x, z, r) => doors.some((d) => {
    const t = Math.max(-0.3, Math.min(d.len, (x - d.x) * d.fx + (z - d.z) * d.fz));
    return Math.hypot(x - d.x - d.fx * t, z - d.z - d.fz * t) < 0.6 + r;
  });
  // is (x, z) free for something of radius r? opts: road (allow on a road), water, solids,
  // y (stands on a deck at this height), hang (hangs from a beam: no ground checks),
  // level (the furniture: the ground under the whole footprint must be within tol of the centre)
  let why = '';
  const no = (w) => { why = w; return false; };
  const free = (x, z, r, o = {}) => {
    if (!L.inWorld(x, z, 12)) return no('edge');
    if (!kept(x, z)) return no('keepout');
    if (o.level && !o.hang && inDoorway(x, z, r * 0.5)) return no('door');
    const g = PH.groundAt(x, z, o.y != null ? o.y + 0.5 : 60);
    if (o.deck && !o.hang) {
      // on a porch deck (o.y is its floor): the footprint stays on the deck, nothing solid sticks up through it
      if (!o.deck(x, z, r)) return no('deck');
      if (g.h > o.y + 0.3) return no('deck');
    } else if (o.y != null && !o.hang && Math.abs(g.h - o.y) > 0.35) return no('deck');
    if (!o.hang && !o.deck) {
      if (!o.water && (g.water || g.h < 0.2)) return no('water');
      if (!o.road && !g.platform && T.splatAt(x, z).road > 0.3) return no('road');
      if (o.level) {
        const tol = o.tol ?? 0.09, rr = Math.max(0.1, r * 0.85);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const h = PH.groundAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr, g.h + 0.5).h;
          if (Math.abs(h - g.h) > tol) return no('slope');
        }
      }
    }
    if (o.solids !== false && !o.hang) {
      probe.x = x; probe.y = o.y ?? g.h; probe.z = z;
      const hit = PH.resolve(probe, r, 1.0);
      if (hit) return no('solid');
    }
    let hit = false;
    placed.query(x, z, r + 2, (it) => { if (!hit && !!it.hang === !!o.hang && Math.hypot(it.x - x, it.z - z) < r + (it.r ?? 0.3) + 0.05) hit = true; });
    return hit ? no('overlap') : true;
  };
  const fails = {};
  // axis of the piece's width (three.js local x after rotation.y = yaw)
  const across = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
  const fits = (kind, x, z, yaw, o) => {
    const F = FOOT[kind];
    const len = F.len || 0;
    if (!len) return free(x, z, F.r + 0.05, o);
    const [ax, az] = F.axis === 'x' ? [Math.sin(yaw), Math.cos(yaw)] : across(yaw);
    const n = Math.max(1, Math.round(len / 0.6));
    for (let k = -n; k <= n; k++) if (!free(x + (ax * len * k) / n, z + (az * len * k) / n, F.r + 0.05, o)) return false;
    return true;
  };
  const put = (kind, x, z, yaw, o = {}) => {
    const F = FOOT[kind] || { r: 0.2, h: 0.4 };
    if (FOOT2[kind]) o = { level: true, hang: !!F.hang, ...o };
    if (!o.force && !fits(kind, x, z, yaw, o)) { if (FOOT2[kind]) { const fk = (fails[kind] ||= {}); fk[why] = (fk[why] || 0) + 1; } return null; }
    const it = { kind, x, y: o.y ?? gy(x, z), z, yaw, r: F.r, len: F.len || 0, h: F.h, axis: F.axis || 'z', fixed: !!F.fixed, stall: F.stall ? [] : null, v: o.v || 0 };
    // porch things keep to the deck's floor when knocked about (the physics may not have the deck)
    if (o.deck && o.y != null) it.floor = { y: o.y, inside: o.deck };
    items.push(it);
    // the long pieces register a few points so later checks see all of them
    const [ax, az] = it.axis === 'x' ? [Math.sin(yaw), Math.cos(yaw)] : across(yaw);
    const n = Math.max(0, Math.round(it.len / 0.8));
    for (let k = -n; k <= n; k++) {
      const px = x + (n ? (ax * it.len * k) / n : 0), pz = z + (n ? (az * it.len * k) / n : 0);
      placed.insert({ x: px, z: pz, r: it.r, hang: !!o.hang }, px, pz, it.r);
    }
    if (it.fixed) collider(it);
    // the furniture stands on mown grass (the tall tufts would swallow it)
    if (FOOT2[kind] && !o.hang && !PH.groundAt(x, z, it.y + 0.5).platform) {
      const s = 2 * (it.r + it.len) + 0.8;
      lawns.push({ x, z, w: s, d: s, yaw: 0, keep: kind === 'flowerbed' ? 0 : 0.35, short: true });
    }
    if (o.sit) vw.spot(it.x, it.z, 1.4, kind === 'bench2d' ? 'Sit on the bench' : 'Sit down', 'sit', { yaw, y: it.y });
    return it;
  };
  // a flat card: on the ground (yaw: where the top of the picture points) or standing in a window (normal nx, nz)
  const card = (kind, x, y, z, o = {}) => { cards.push({ kind, x, y, z, flat: o.flat || 'ground', yaw: o.yaw || 0, nx: o.nx ?? 0, nz: o.nz ?? 1, v: o.v || 0 }); };
  const collider = (it) => {
    const y = it.y;
    if (it.kind === 'laundry') {
      for (const s of [-1, 1]) { const [ax, az] = across(it.yaw); PH.addCircle({ x: it.x + ax * 1.8 * s, z: it.z + az * 1.8 * s, r: 0.1, y0: y - 1, y1: y + 2, kind: 'post' }); }
    } else if (it.stall || it.len) {
      // (a long piece's length runs along its width axis, or along its front for axis 'x')
      const yaw = it.axis === 'x' ? it.yaw + Math.PI / 2 : it.yaw;
      PH.addBox({ x: it.x, z: it.z, yaw, w: it.len * 2, l: it.r * 2, y0: y - 1, y1: y + Math.min(2, it.h + 0.2), kind: it.stall ? 'prop' : 'bench' });
    } else PH.addCircle({ x: it.x, z: it.z, r: FOOT[it.kind]?.roof ? Math.min(it.r, 0.3) : it.r, y0: y - 1, y1: y + it.h, kind: 'post' });
  };
  // a point in a piece's own frame (+x local = its front, z = its width)
  const local = (it, fx, fz) => [it.x + Math.sin(it.yaw) * fx + Math.cos(it.yaw) * fz, it.z + Math.cos(it.yaw) * fx - Math.sin(it.yaw) * fz];
  const tryAt = (kind, cands, o) => { for (const [x, z, yaw] of cands) { const it = put(kind, x, z, yaw, o); if (it) return it; } return null; };

  // ------------------------------------------------------------ fences along the roads
  const fenceRoad = (id, { kind = 'rail', step = 3, offset = null, cover = -0.35, from = -1e9, to = 1e9, sides = [-1, 1], phase = 0 }) => {
    const road = L.ROADS.find((r) => r.id === id);
    if (!road) return;
    const S = roadSamples(road, 1);
    const off = offset ?? road.w / 2 + 2.6;
    for (const side of sides) {
      let next = 0;
      for (const p of S) {
        if (p.s < next) continue;
        next = p.s + step;
        if (p.x < from || p.x > to) continue;
        if (Math.sin(p.s * 0.045 + side * 2.1 + phase) < cover) continue;
        const nx = -p.dz * side, nz = p.dx * side; // outwards
        const x = p.x + nx * off, z = p.z + nz * off;
        const yaw = Math.atan2(-nx, -nz); // the fence's face looks at the road
        const k = kind === 'rail' && Math.floor(p.s / step) % 3 === 0 ? 'rail2' : kind;
        put(k, x, z, yaw);
      }
    }
  };
  fenceRoad('main', { from: -138, to: 96, cover: -0.65 });
  fenceRoad('main', { from: -138, to: 96, cover: -0.65, offset: 7.4, phase: 2.6 }); // a second try a little further out where the first did not fit
  fenceRoad('northLoop', { cover: -0.25, phase: 1.3 });
  fenceRoad('coastRoad', { cover: -0.2, phase: 0.7, from: 240 });
  fenceRoad('sawmillRoad', { cover: -0.8 });
  fenceRoad('farmLane', { cover: -0.9, offset: 4.4 });
  fenceRoad('graveRoad', { cover: 0.2, offset: 3.6, phase: 0.4 });
  fenceRoad('cabinDrive', { kind: 'picket', step: 2, cover: -0.9, offset: 4.2, sides: [1] });
  fenceRoad('lighthouseLane', { kind: 'picket', step: 2, cover: -0.5, offset: 3.6 });
  fenceRoad('parkLane', { kind: 'picket', step: 2, cover: -0.9, offset: 3.4 });
  // a white picket fence along the green's Main Street edge, open at the paths
  for (let x = 169.2; x < 203.5; x += 2) {
    if (Math.abs(x - 186) < 2.2 || Math.abs(x - L.BOWLING.x) < 2.4 || Math.abs(x - 170) < 1.6 || Math.abs(x - 202) < 1.6) continue;
    put('picket', x, M.z - M.road / 2 - M.walk - 0.5, 0);
  }
  // Wharf Street: white pickets down both sides between the houses, the market at the bottom
  for (const sd of [-1, 1]) for (let z = 58.4; z < 69; z += 2) put('picket', 166 + sd * 3.6, z, sd * Math.PI / 2 * -1, { road: true });
  // white pickets round the front yards of the houses out in the country
  for (const id of ['houseLoop', 'houseHill', 'gus', 'lighthouseHut']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const f = b.facing || 0, c = Math.cos(f), s = Math.sin(f);
    const P = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    const ex = b.d / 2 + 4.2, hw = b.w / 2 + 1.6;
    for (let lx = -hw + 1; lx <= hw - 0.9; lx += 2) {
      if (Math.abs(lx) < 1.4) continue; // the gate
      const [x, z] = P(lx, ex);
      put('picket', x, z, f);
    }
    for (const sd of [-1, 1]) for (let lz = b.d / 2 + 0.4; lz < ex - 0.4; lz += 2) {
      const [x, z] = P(sd * hw, lz + 1);
      put('picket', x, z, f + Math.PI / 2);
    }
  }

  // ------------------------------------------------------------ Main Street
  const curbN = M.z - M.road / 2 - 0.5, curbS = M.z + M.road / 2 + 0.5;
  const sidewalk = { road: true };
  const pair = (x, z, yaw) => { const a = put('trashcan', x, z, yaw, sidewalk); if (a) put('recycle', x + 0.72, z, yaw, sidewalk); };
  for (const x of [131, 147.5, 171, 197, 222.5, 254]) pair(x, curbN, 0);
  for (const x of [134, 157, 188.5, 214, 248]) pair(x, curbS, Math.PI);
  // sandwich boards outside the shops
  for (const [id, dx] of [['cafe', -3], ['donuts', 3.2], ['store', -4.8], ['chipshack', 2.6], ['house7', -2.8], ['house6', 3.2]]) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const north = b.z < M.z;
    put('sandwich', b.x + dx, north ? M.z - M.road / 2 - 1.3 : M.z + M.road / 2 + 1.3, Math.PI / 2 + (north ? 0.2 : -0.2), sidewalk);
  }
  // mailboxes at the curb in front of the houses
  for (const id of ['doug', 'kids', 'agnes', 'birdie', 'house5', 'clinic', 'inn']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const north = b.z < M.z;
    tryAt(id === 'agnes' || id === 'inn' ? 'mailboxRed' : 'mailbox', [[b.x - 2.4, north ? curbN : curbS, north ? 0 : Math.PI], [b.x + 2.4, north ? curbN : curbS, north ? 0 : Math.PI]], sidewalk);
  }
  // bikes parked at the racks, flower boxes under the shop windows
  for (const [x, z, yaw] of [[159.9, 44.9, 0.05], [161.2, 44.9, -0.08], [218.5, 44.9, 0.1], [217.2, 44.9, 0.04]]) put('bike', x, z, yaw, { road: true, force: true });
  for (const id of ['postoffice', 'clinic', 'inn', 'firehall', 'house7', 'doug']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const north = b.z < M.z;
    const z = north ? b.z + b.d / 2 + 0.35 : b.z - b.d / 2 - 0.35;
    tryAt(id.length % 2 ? 'flowerbox' : 'flowerbox2', [[b.x + b.w / 2 - 1.2, z, north ? 0 : Math.PI], [b.x - b.w / 2 + 1.2, z, north ? 0 : Math.PI]], sidewalk);
  }
  // crates of apples outside Moose & Goose
  {
    const b = L.BUILDINGS.find((q) => q.id === 'store');
    for (const [dx, dz] of [[4.6, 0.6], [5.4, 0.9], [-5.4, 0.7]]) put('crate', b.x + dx, b.z + b.d / 2 + dz, rng.range(-0.2, 0.2), sidewalk);
  }

  // ------------------------------------------------------------ the market on the boardwalk, either side of the Wharf Street gangway
  const stall = tryAt('fishstall', [[172.4, 85.1, Math.PI], [176.4, 85.1, Math.PI], [171.4, 74.2, -Math.PI / 2]]);
  if (stall) {
    const goods = [['cod', 0.1, -0.62], ['salmon', -0.16, -0.25], ['cod', 0.14, 0.05], ['mackerel', -0.14, 0.32], ['mackerel', 0.15, 0.5], ['salmon', -0.1, 0.72], ['lobster', 0.22, -0.3], ['lobster', 0.2, 0.78], ['mackerel', 0.02, -0.85]];
    for (const [k, fx, fz] of goods) {
      const [x, z] = local(stall, fx, fz);
      const it = put(k, x, z, stall.yaw + Math.PI / 2 + rng.range(-0.25, 0.25), { force: true, y: stall.y + 0.95 });
      it.r = 0.2; it.h = 0.12; it.goods = stall;
      stall.stall.push(it);
    }
    for (const [k, fx, fz] of [['trap', -0.1, -2.0], ['trap', 0.25, -2.6], ['buoy', 0.9, 1.6], ['barrel', -0.2, 1.9]]) { const [x, z] = local(stall, fx, fz); put(k, x, z, stall.yaw + rng.range(-0.4, 0.4)); }
  }
  const stand = tryAt('syrupstand', [[159.6, 85.1, Math.PI], [156.6, 85.1, Math.PI], [160.6, 74.2, Math.PI / 2]]);
  if (stand) {
    const goods = [['bit_apple', 0.14, -0.55], ['bit_appleG', 0.08, -0.02], ['bit_apple', 0.16, 0.5], ['bit_apple', 0.05, 0.6], ['bit_jar', -0.3, -0.44], ['bit_jar', -0.3, 0.0], ['bit_jar', -0.3, 0.44]];
    for (const [k, fx, fz] of goods) {
      const [x, z] = local(stand, fx, fz);
      const it = put(k, x, z, rng.range(0, 6), { force: true, y: stand.y + (k === 'bit_jar' ? 1.07 : 0.97) });
      it.r = 0.08; it.h = 0.15; it.goods = stand;
      stand.stall.push(it);
    }
    for (const [fx, fz] of [[0.3, -1.6], [0.35, 1.5]]) { const [x, z] = local(stand, fx, fz); put('crate', x, z, stand.yaw + rng.range(-0.3, 0.3)); }
  }
  tryAt('cart', [[196.5, 40.4, 0.15], [176, 40.4, -0.1], [203, 38, 0.3], [150, 58.4, Math.PI]]);

  // ------------------------------------------------------------ the waterfront
  const bw = L.BOARDWALK[0];
  for (const d of L.DOCKS) {
    const x = d.a[0] - 3.2, z = bw.a[1] - 1.2;
    put('trap', x, z, rng.range(-0.5, 0.5));
    put('trap', x - 0.8, z + 0.25, rng.range(-0.5, 0.5));
    put('buoy', x + 0.9, z - 0.2, 0);
    put('barrel', x - 1.8, z, 0);
  }
  { const b = L.BUILDINGS.find((q) => q.id === 'fishmarket'); for (const [dx, k] of [[-6, 'crate'], [-6.8, 'barrel'], [6, 'trap'], [6.7, 'buoy'], [7.4, 'buoy']]) put(k, b.x + dx, bw.a[1] - 1.3, rng.range(-0.4, 0.4)); }
  { const b = L.BUILDINGS.find((q) => q.id === 'fishchips'); for (const [dx, dz, k] of [[-2, 4.5, 'trashcan'], [-1.3, 4.6, 'recycle'], [4.5, -4.5, 'barrel'], [3.8, -5.2, 'barrel']]) put(k, b.x + dx, b.z + dz, rng.range(-0.3, 0.3)); }

  // ------------------------------------------------------------ yards, farms and the countryside
  for (const id of ['houseRiver', 'houseLoop', 'houseHill', 'farmhouse', 'gus', 'lighthouseHut']) {
    const b = L.BUILDINGS.find((q) => q.id === id);
    const f = b.facing || 0;
    const back = L.frontOf(id, -(b.d + 3.6), 0.5);
    tryAt('laundry', [[back.x, back.z, f], [back.x + Math.cos(f) * 2, back.z - Math.sin(f) * 2, f]]);
    const side = L.frontOf(id, -b.d / 2 - 0.2, b.w / 2 + 1.1);
    tryAt('firewood', [[side.x, side.z, f + Math.PI / 2], [side.x + Math.sin(f) * 1.5, side.z + Math.cos(f) * 1.5, f + Math.PI / 2]]);
    const bin = L.frontOf(id, 1.2, -(b.w / 2 + 1.0));
    if (put('trashcan', bin.x, bin.z, f)) put('recycle', bin.x - Math.cos(f) * 0.75, bin.z + Math.sin(f) * 0.75, f);
  }
  for (const [x, z, yaw] of [[-56, 28.5, 0.4], [118.5, -76, 0.5], [12, 6, 1.9]]) put('yardsign', x, z, yaw);
  // round bales in the fields
  for (const [x, z] of [[30, 76], [34.5, 80.5], [80, 92], [84.5, 97], [46, 116], [136, -54], [142, -60], [146.5, -52.5], [-92, -60], [-99, -50], [70, 60]]) put('hay', x, z, rng.range(0, Math.PI));
  // scarecrows minding the fields and Nana's garden
  for (const [x, z, yaw] of [[140, -64, 0.6], [26, 90, 1.2], [-156.5, 49.5, 2.4], [-100, -45, -0.4]]) put('scarecrow', x, z, yaw);
  // crates and barrels at the farm, the sawmill and the campground
  for (const [x, z, k] of [[60, 70.5, 'crate'], [61, 71.2, 'crate'], [59.2, 69.8, 'barrel'], [104, 126, 'barrel'], [104.8, 126.6, 'barrel'], [91, 126.5, 'crate'], [-58, -132, 'firewood'], [-66, -122, 'trashcan'], [-3, 61.5, 'trashcan'], [176, -101, 'recycle'], [-248, 146.5, 'firewood'], [44, -42, 'barrel']]) put(k, x, z, rng.range(0, Math.PI));
  // a few lamp posts along the dark country road and up the cabin drive
  const main = L.ROADS.find((r) => r.id === 'main');
  let n = 0, nextLamp = 0;
  for (const p of roadSamples(main, 1)) {
    if (p.x < -130 || p.x > 90 || p.s < nextLamp) continue;
    nextLamp = p.s + 38;
    const side = n++ % 2 ? 1 : -1;
    const nx = -p.dz * side, nz = p.dx * side, off = main.w / 2 + 1.4;
    const it = put('lamp', p.x + nx * off, p.z + nz * off, Math.atan2(-nx, -nz));
    if (it) {
      const tip = local(it, 0.34, 0);
      vw.lights.push({ pos: new THREE.Vector3(tip[0], it.y + 2.2, tip[1]), color: [1.0, 0.74, 0.42], radius: 9, kind: 'street' });
    }
  }

  // ------------------------------------------------------------ the 2D furniture
  placeFurniture(vw, { put, tryAt, card, rng, PH, local });
  // start baking the sprites now, so they are ready when the game starts (screenshots bake their own)
  const shots = typeof location !== 'undefined' && new URLSearchParams(location.search).has('frames');
  return { items, cards, lawns, fails, paint: shots ? null : startDecoPaint() };
}
