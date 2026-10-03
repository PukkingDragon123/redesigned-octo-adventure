// Where the 2D furniture goes (the art is src/art/furniture2d.js, the knocking
// about is src/game/deco2d.js; this runs inside placeDeco2D in deco2d.js with its
// placement kit, so everything is fitted around buildings, colliders, roads,
// doors, NPC spots and the street clutter already down):
//   - porches: rocking chairs with a side table and cocoa, porch swings (you can
//     sit on them), boot racks, wood boxes, potted mums by the steps, hanging
//     ferns and wind chimes under the porch beam, a welcome mat at the door
//   - yards: Muskoka chairs, wheelbarrows of leaves, leaf piles and rakes,
//     gnomes, bird baths, barrel planters
//   - Main Street: café terraces on the lots beside Café Érable, the donut shop
//     and the bakery (umbrella tables, bistro chairs, menu easels), newspaper
//     boxes, a phone booth, street-name signs, planters by the shop doors, and
//     the goods in every shop window (cards just in front of the glass)
//   - the harbour and the beach: benches, life rings, rods, nets, coolers, deck
//     chairs, kayaks, towels, picnic baskets, pails and a beach ball
//   - the green: music stands in the bandstand, picnic tables, flower beds, a
//     little free library, leaf piles
// Porch things stand on the voxel deck (its height from the building's model),
// everything else on whatever physics.groundAt finds, and only where the ground
// under the whole footprint is level, so nothing floats or sinks.
import * as L from './layout.js';

// footprints (as FOOT in deco2d.js): r radius, len half length along the width axis (axis 'x':
// along the front), h height; fixed: static with a collider; soft: static, no collider; hang: hangs
// from a porch beam (no footprint on the ground)
export const FOOT2 = {
  rocker: { r: 0.32, h: 1.1 },
  swing: { r: 0.3, len: 0.62, h: 1.0, fixed: true },
  muskoka: { r: 0.36, h: 1.0 },
  sidetable: { r: 0.25, h: 0.65 },
  mum: { r: 0.2, h: 0.6 },
  fern: { r: 0.28, h: 0.55 },
  hangfern: { r: 0.25, h: 0.3, hang: true },
  chimes: { r: 0.12, h: 0.3, hang: true },
  bootrack: { r: 0.17, len: 0.42, h: 0.45 },
  woodbox: { r: 0.26, len: 0.38, h: 0.8 },
  barrow: { r: 0.3, len: 0.6, h: 0.65, axis: 'x' },
  gnome: { r: 0.14, h: 0.55 },
  birdbath: { r: 0.3, h: 0.8 },
  leafpile: { r: 0.55, h: 0.4 },
  rake: { r: 0.1, h: 1.45 },
  bistrotable: { r: 0.33, h: 0.95 },
  umbrellatable: { r: 0.36, h: 2.5, fixed: true, roof: 1.05 },
  bistrochair: { r: 0.24, h: 0.9 },
  easel: { r: 0.3, h: 1.35 },
  newsbox: { r: 0.24, h: 1.0 },
  barrelplanter: { r: 0.34, h: 0.9 },
  phonebooth: { r: 0.48, h: 2.6, fixed: true },
  streetsign: { r: 0.08, h: 2.6, fixed: true, roof: 0.5 },
  bench2d: { r: 0.25, len: 0.78, h: 0.9, fixed: true },
  deckchair: { r: 0.3, h: 0.9 },
  cooler: { r: 0.22, len: 0.3, h: 0.45 },
  rods: { r: 0.18, h: 2.1 },
  netpile: { r: 0.5, h: 0.35, soft: true },
  lifering: { r: 0.1, h: 1.6, fixed: true },
  kayak: { r: 0.28, len: 1.35, h: 0.45, axis: 'x', fixed: true },
  basket: { r: 0.22, h: 0.5 },
  pail: { r: 0.14, h: 0.3 },
  beachball: { r: 0.2, h: 0.4 },
  picnic2d: { r: 0.72, len: 0.85, h: 0.8, fixed: true },
  musicstand: { r: 0.22, h: 1.3 },
  flowerbed: { r: 0.9, h: 0.4, soft: true },
  library: { r: 0.3, h: 1.8, fixed: true },
};

// what each shop shows in its windows, and the width of each display card (m)
const DISPLAYS = {
  post: ['win_parcels'], donuts: ['win_donuts', 'win_cake'], cafe: ['win_mugs', 'win_cake', 'win_pie'], store: ['win_tins', 'win_apples'],
  hardware: ['win_tools'], bakery: ['win_bread', 'win_pie'], fishmarket: ['win_tackle'],
};
const WIN_W = { win_donuts: 0.9, win_cake: 0.8, win_mugs: 0.9, win_bread: 0.95, win_pie: 0.82, win_tools: 0.9, win_tins: 0.93, win_apples: 1.1, win_parcels: 0.82, win_tackle: 1.02 };

const HOUSES = ['doug', 'kids', 'agnes', 'birdie', 'house5', 'clinic', 'inn', 'houseRiver', 'houseLoop', 'houseHill', 'farmhouse', 'gus', 'lighthouseHut', 'trapperHut'];
const COUNTRY = new Set(['houseRiver', 'houseLoop', 'houseHill', 'farmhouse', 'gus', 'lighthouseHut', 'trapperHut']);

export function placeFurniture(vw, K) {
  const { put, tryAt, card, rng, PH } = K;
  const W = vw.world;
  const B = (id) => L.BUILDINGS.find((q) => q.id === id);
  // a building's frame: P(lx, lz) -> world (lx along the front, lz out of the front door)
  const frame = (b) => {
    const f = b.facing || 0, c = Math.cos(f), s = Math.sin(f);
    const at = W.buildings?.[b.id];
    const meta = at?.voxel?.meta || null;
    const floorY = at?.voxel?.mesh?.position.y ?? at?.y0 ?? null;
    return { b, f, c, s, at, meta, floorY, doorX: meta?.door?.x ?? 0, front: b.d / 2, P: (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c] };
  };
  const R = (seed) => { let x = seed * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };
  const strSeed = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7);

  // ------------------------------------------------------------ porches & yards
  for (const id of HOUSES) {
    const b = B(id);
    if (!b) continue;
    dressHouse(frame(b), R(strSeed(id)), COUNTRY.has(id));
  }
  function deckOf(F) {
    const decks = (F.meta?.porch || []).filter((d) => d.z1 > F.front + 1.2 && d.x1 - d.x0 > 2.5);
    if (decks.length) return decks.sort((a, b2) => (b2.x1 - b2.x0) * (b2.z1 - b2.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
    if (F.b.porch) return { x0: -F.b.w / 2 - 0.2, x1: F.b.w / 2 + 0.2, z0: F.front, z1: F.front + 2.0, y: 0 };
    return null;
  }
  function dressHouse(F, r, country) {
    const { P, f, doorX, front } = F;
    const deck = deckOf(F);
    const pick = (a) => a[Math.floor(r() * a.length) % a.length];
    // welcome mat at the door, on whatever the door opens onto
    {
      const [x, z] = P(doorX, front + 0.36);
      const under = (F.meta?.porch || []).find((d) => d.x0 < doorX - 0.3 && d.x1 > doorX + 0.3 && d.z0 < front + 0.1 && d.z1 > front + 0.6);
      const y = under && F.floorY != null ? F.floorY + (under.y || 0) : PH.groundAt(x, z, (F.floorY ?? 50) + 0.5).h;
      if (F.floorY == null || Math.abs(y - F.floorY) < 0.25) card('mat', x, y + 0.012, z, { flat: 'ground', yaw: f + Math.PI });
    }
    if (deck) {
      const y = F.floorY != null ? F.floorY + (deck.y || 0) : null;
      const on = { y, deck: true };
      const z0 = Math.max(deck.z0, front), z1 = deck.z1;
      const left = [deck.x0 + 0.55, doorX - 1.15], right = [doorX + 1.15, deck.x1 - 0.55];
      const sides = r() < 0.5 ? [left, right] : [right, left];
      // a rocker with a side table and cocoa on one side, a porch swing (or a pair of Muskokas) on the other
      const [a, c2] = sides;
      if (a[1] - a[0] > 0.9) {
        const x = a[0] + (a[1] - a[0]) * 0.5;
        const [rx, rz] = P(x, z0 + 0.7);
        if (put('rocker', rx, rz, f + (r() - 0.5) * 0.5, on)) {
          const tx = x + (x < doorX ? 0.62 : -0.62);
          const [sx, sz] = P(tx, z0 + 0.45);
          put('sidetable', sx, sz, f, on);
        }
      }
      if (c2[1] - c2[0] > 1.6) {
        const x = (c2[0] + c2[1]) / 2;
        const [sx, sz] = P(x, z0 + 0.55);
        const sw = put('swing', sx, sz, f, { ...on, v: Math.floor(r() * 2) });
        if (sw) vw.spot(sx, sz, 1.2, 'Sit on the porch swing', 'sit', { yaw: f, y: sw.y });
        else {
          for (const dx of [-0.45, 0.45]) { const [mx, mz] = P(x + dx, z0 + 0.7); put('muskoka', mx, mz, f + dx * 0.4, { ...on, v: Math.floor(r() * 3) }); }
        }
      } else if (c2[1] - c2[0] > 0.6) {
        const [mx, mz] = P((c2[0] + c2[1]) / 2, z0 + 0.6);
        put('muskoka', mx, mz, f, { ...on, v: Math.floor(r() * 3) });
      }
      // potted mums either side of the steps, a fern by the door
      const mv = Math.floor(r() * 4);
      for (const sd of [-1, 1]) { const [mx, mz] = P(doorX + sd * 0.95, z1 - 0.32); put('mum', mx, mz, f, { ...on, v: (mv + (sd > 0 ? 1 : 0)) % 4 }); }
      { const [fx, fz] = P(doorX + (r() < 0.5 ? -0.85 : 0.85), z0 + 0.3); if (r() < 0.6) put('fern', fx, fz, f, on); else put('bootrack', fx, fz, f, on); }
      // hanging baskets and wind chimes under the beam at the front
      if (y != null) {
        const hv = Math.floor(r() * 2);
        for (const sd of [-1, 1]) {
          const [hx, hz] = P(sd < 0 ? deck.x0 + 0.7 : deck.x1 - 0.7, z1 - 0.3);
          if (sd > 0 && r() < 0.45) put('chimes', hx, hz, f, { y, hang: true });
          else put('hangfern', hx, hz, f, { y, hang: true, v: hv });
        }
      }
      // a box of firewood at the end of the porch for the country houses
      if (country) { const [wx, wz] = P(r() < 0.5 ? deck.x0 + 0.45 : deck.x1 - 0.45, z0 + 0.45); put('woodbox', wx, wz, f + Math.PI / 2, on); }
    } else {
      // a stoop: mums on the ground either side of it
      const mv = Math.floor(r() * 4);
      for (const sd of [-1, 1]) tryAt('mum', [P(doorX + sd * 1.25, front + 0.4), P(doorX + sd * 1.6, front + 0.35)].map(([x, z]) => [x, z, f]), { v: (mv + (sd > 0 ? 2 : 0)) % 4 });
      if (r() < 0.5) tryAt('bootrack', [P(doorX + 1.9, front + 0.3), P(doorX - 1.9, front + 0.3)].map(([x, z]) => [x, z, f]));
    }
    if (!country) {
      // Main Street: a planter or a gnome by the door at most
      if (r() < 0.5) tryAt('barrelplanter', [P(doorX - 2.3, front + 0.45), P(doorX + 2.3, front + 0.45)].map(([x, z]) => [x, z, f]), { v: Math.floor(r() * 3) });
      return;
    }
    // the front yard: chairs on the grass, a wheelbarrow of leaves, a leaf pile and its rake, a gnome, a bird bath
    const yard = (lx, lz) => P(lx, front + (deck ? deck.z1 - front : 0) + lz);
    const hw = F.b.w / 2;
    const side = r() < 0.5 ? -1 : 1;
    {
      const v = Math.floor(r() * 3);
      const ok = put('muskoka', ...yard(side * (hw - 0.4), 2.2), f + side * 0.5, { v });
      if (ok) put('muskoka', ...yard(side * (hw - 1.4), 2.6), f + side * 0.15, { v: (v + 1) % 3 });
    }
    tryAt('barrow', [yard(-side * (hw - 0.5), 1.9), yard(-side * (hw + 0.6), 1.2), yard(-side * (hw - 1.2), 2.8)].map(([x, z]) => [x, z, f + side * (0.8 + r() * 0.6)]), { v: r() < 0.7 ? 0 : 1 });
    const pile = tryAt('leafpile', [yard(-side * (hw - 2.2), 2.6), yard(-side * 1.6, 3.0), yard(side * 1.8, 3.1)].map(([x, z]) => [x, z, r() * 3]), { v: Math.floor(r() * 2) });
    if (pile) put('rake', pile.x + Math.cos(f) * 0.8, pile.z - Math.sin(f) * 0.8, f + Math.PI / 2 + (r() - 0.5) * 0.6);
    tryAt(r() < 0.5 ? 'gnome' : 'birdbath', [yard(side * (hw - 2.6), 1.3), yard(-side * 0.9, 1.4), yard(side * 1.2, 1.5)].map(([x, z]) => [x, z, f + (r() - 0.5)]));
    void pick;
  }

  // ------------------------------------------------------------ Main Street
  const M = L.MAIN_ST;
  const hw = M.road / 2;
  const walkN = M.z - hw - M.walk, walkS = M.z + hw + M.walk; // the sidewalks' back edges (shop fronts)
  // café terraces on the open lots beside the shops (umbrella tables with chairs round them)
  const terrace = (cx, cz, yaw, cols, n = 2, gap = 2.4) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), ax = Math.cos(yaw), az = -Math.sin(yaw);
    let made = 0;
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * gap;
      const x = cx + ax * o, z = cz + az * o;
      const t = put('umbrellatable', x, z, yaw, { v: cols });
      if (!t) continue;
      made++;
      for (const [dx, dz, cy] of [[0.62, 0.0, -Math.PI / 2], [-0.62, 0.0, Math.PI / 2], [0.0, 0.62, Math.PI]]) {
        if (dz && k % 2) continue;
        const px = x + ax * dx + fx * dz, pz = z + az * dx + fz * dz;
        put('bistrochair', px, pz, yaw + cy + (rng.next() - 0.5) * 0.4);
      }
    }
    return made;
  };
  {
    // Café Érable's garden on the lot between the green and the café, the donut shop's on its east side,
    // the bakery's on the lot past it
    const cafe = B('cafe'), donuts = B('donuts'), bakery = B('house7');
    terrace(cafe.x - cafe.w / 2 - 3.2, walkN - 3.2, Math.PI / 2, 0, 2, 2.6);
    terrace(cafe.x - cafe.w / 2 - 3.0, walkN - 6.0, Math.PI / 2, 0, 1);
    terrace(donuts.x + donuts.w / 2 + 3.2, walkN - 2.8, -Math.PI / 2, 1, 2, 2.6);
    terrace(bakery.x + bakery.w / 2 + 3.4, walkS + 3.0, -Math.PI / 2, 1, 2, 2.6);
    // menu easels and planters at the sidewalk
    for (const [x, z, yaw] of [[cafe.x - cafe.w / 2 - 1.0, walkN - 0.6, 0.3], [donuts.x + donuts.w / 2 + 1.2, walkN - 0.6, -0.3], [bakery.x + bakery.w / 2 + 1.2, walkS + 0.6, Math.PI + 0.3]]) put('easel', x, z, yaw, { road: true });
    for (const [x, z, v] of [[cafe.x - cafe.w / 2 - 5.6, walkN - 0.6, 0], [donuts.x + donuts.w / 2 + 5.4, walkN - 0.6, 1], [bakery.x + bakery.w / 2 + 5.6, walkS + 0.6, 2]]) put('barrelplanter', x, z, 0, { road: true, v });
  }
  // newspaper boxes by the post office and the café, a phone booth beside the post office
  {
    const post = B('postoffice'), cafe = B('cafe');
    const curb = M.z - hw - 0.75;
    [[post.x + post.w / 2 + 1.1, 0], [post.x + post.w / 2 + 1.75, 1], [cafe.x + cafe.w / 2 + 0.9, 2], [cafe.x + cafe.w / 2 + 1.55, 0]].forEach(([x, v]) => put('newsbox', x, curb - 0.35, 0, { road: true, v }));
    tryAt('phonebooth', [[post.x - post.w / 2 - 2.6, walkN - 1.0, 0], [post.x - post.w / 2 - 2.6, walkN + 0.6, 0], [post.x + post.w / 2 + 2.2, walkN - 1.2, 0]], { road: true });
  }
  // street-name signs at the corners of the side streets
  for (const sd of L.SIDE_STREETS) {
    const z = sd.side < 0 ? walkN + 0.35 : walkS - 0.35;
    const x = sd.x + (sd.w / 2 + 0.5) * (sd.x === 166 ? -1 : 1);
    tryAt('streetsign', [[x, z, sd.side < 0 ? 0 : Math.PI], [x + 0.6, z, 0], [x - 0.6, z, 0]], { road: true, v: sd.x === 166 ? 1 : 2 });
  }
  tryAt('streetsign', [[L.CROSSWALKS[2] + 2.0, walkN + 0.35, 0], [L.CROSSWALKS[2] - 2.0, walkN + 0.35, 0]], { road: true, v: 0 });
  // the goods in the shop windows
  for (const b of L.BUILDINGS) {
    const kind = b.shop || (b.id === 'fishmarket' ? 'fishmarket' : null);
    if (!kind || !DISPLAYS[kind]) continue;
    shopWindows(frame(b), DISPLAYS[kind]);
  }
  function shopWindows(F, kinds) {
    const wins = findWindows(F);
    let k = 0;
    for (const w of wins) {
      const width = w.x1 - w.x0;
      // fill the sill from one side with the shop's displays, evenly spaced
      const list = [];
      let used = 0;
      for (let i = 0; i < 6; i++) {
        const kd = kinds[(k + i) % kinds.length], ww = WIN_W[kd] || 0.9;
        if (used + ww + 0.12 > width - 0.1) break;
        list.push(kd); used += ww + 0.12;
      }
      k += list.length;
      let x = (w.x0 + w.x1) / 2 - used / 2 + 0.06;
      for (const kd of list) {
        const ww = WIN_W[kd] || 0.9;
        const [cx, cz] = F.P(x + ww / 2, w.z + 0.03);
        card(kd, cx, F.floorY + w.y0 + 0.02, cz, { flat: 'window', nx: Math.sin(F.f), nz: Math.cos(F.f) });
        x += ww + 0.12;
      }
    }
    // an OUVERT sign hung in the door glass
    const d = findGlass(F, (q) => Math.abs((q.x0 + q.x1) / 2 - F.doorX) < 0.8 && q.y1 > 1.3 && q.y0 < 1.9);
    if (d.length) {
      const z = Math.max(...d.map((q) => q.z)), y0 = Math.min(...d.map((q) => q.y0)), y1 = Math.max(...d.map((q) => q.y1));
      const [cx, cz] = F.P(F.doorX, z + 0.03);
      card('win_open', cx, F.floorY + Math.min(y1 - 0.5, Math.max(y0, 1.0)), cz, { flat: 'window', nx: Math.sin(F.f), nz: Math.cos(F.f) });
    }
  }
  // the glass on the front of a building, as rectangles in its frame: scanned from the voxel mesh
  // (glass faces carry 0.5 in color4.w), so the displays follow the windows wherever the model puts them
  function findGlass(F, keep) {
    const g = F.at?.voxel?.mesh?.geometry;
    const P = g?.attributes.position, N = g?.attributes.normal, C = g?.attributes.color4;
    if (!P || !N || !C || F.floorY == null) return [];
    const out = [];
    for (let i = 0; i + 3 < P.count; i += 4) {
      if (N.getZ(i) < 0.9 || Math.abs(C.getW(i) - 0.5) > 0.05) continue;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let j = 0; j < 4; j++) { const x = P.getX(i + j), y = P.getY(i + j); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const q = { x0, x1, y0, y1, z: P.getZ(i) };
      if (q.z > F.front - 1.0 && keep(q)) out.push(q);
    }
    return out;
  }
  function findWindows(F) {
    // ground-floor glass, away from the door, merged into whole windows (mullions and shelves split it up)
    const qs = findGlass(F, (q) => q.y0 < 1.4 && q.y1 > 0.3 && q.y0 > -0.2 && !(Math.abs((q.x0 + q.x1) / 2 - F.doorX) < 0.75 && q.x1 - q.x0 < 1.2));
    qs.sort((a, b2) => a.x0 - b2.x0);
    const wins = [];
    for (const q of qs) {
      const w = wins.find((o) => Math.abs(o.z - q.z) < 0.06 && q.x0 < o.x1 + 0.2 && q.x1 > o.x0 - 0.2);
      if (w) { w.x0 = Math.min(w.x0, q.x0); w.x1 = Math.max(w.x1, q.x1); w.y0 = Math.min(w.y0, q.y0); w.y1 = Math.max(w.y1, q.y1); } else wins.push({ ...q });
    }
    return wins.filter((w) => w.x1 - w.x0 > 0.95 && w.y1 - w.y0 > 0.6 && (w.x1 < F.doorX - 0.5 || w.x0 > F.doorX + 0.5));
  }

  // ------------------------------------------------------------ the harbour
  const bw = L.BOARDWALK[0];
  const sea = 0; // the sea is to the south (+z): yaw 0 faces it
  for (const x of [140, 196, 214, 240]) put('bench2d', x, bw.a[1] + bw.w / 2 - 0.55, sea, { v: 1, sit: true });
  for (const d of L.DOCKS) {
    // a life ring on a post at the head of each dock, rods and a cooler on the dock, deck chairs further out
    put('lifering', d.a[0] + d.w / 2 + 0.25, bw.a[1] + bw.w / 2 + 0.4, Math.PI / 2);
    const dx = (d.b[0] - d.a[0]) / (d.b[1] - d.a[1]);
    const on = (t, side) => [d.a[0] + dx * (d.a[1] + t - d.a[1]) + side * (d.w / 2 - 0.45), d.a[1] + t];
    put('rods', ...on(4, -1), Math.PI / 2);
    put('cooler', ...on(5.2, -1), Math.PI / 2 + 0.2, { v: d.a[0] % 2 });
    put('deckchair', ...on(12, 1), -Math.PI / 2 + 0.5, { v: d.a[0] % 3 });
    put('deckchair', ...on(13.1, 1), -Math.PI / 2 + 0.2, { v: (d.a[0] + 1) % 3 });
    put('netpile', ...on(20, -1), rng.range(0, 3));
  }
  {
    const fm = frame(B('fishmarket'));
    put('netpile', ...fm.P(-3.2, fm.front + 1.1), fm.f);
    put('rods', ...fm.P(2.9, fm.front + 0.6), fm.f);
    put('cooler', ...fm.P(3.6, fm.front + 1.0), fm.f + 0.3, { v: 1 });
  }
  // kayaks pulled up on the shore west of the boardwalk, next to the canoes
  for (const [x, z, yaw, v] of [[116.5, 86.5, 0.9, 0], [118.2, 92.5, 0.7, 1], [114, 90, 1.2, 1]]) put('kayak', x, z, yaw, { v, tol: 0.22 });

  // ------------------------------------------------------------ Sandy Point Beach
  {
    const bc = L.BEACHES[0];
    const nx = Math.cos(bc.angle), nz = Math.sin(bc.angle), tx = -nz, tz = nx;
    const at = (along, inland) => [bc.x + tx * along - nx * inland, bc.z + tz * along - nz * inland];
    const seaYaw = Math.atan2(nx, nz);
    // towels and deck chairs by the umbrellas, a cooler and a picnic basket
    [[-14, 12], [16, 13], [4, 19]].forEach(([al, inl], i) => {
      const [x, z] = at(al + 1.3, inl - 0.4);
      card('towel', x, PH.groundAt(x, z, 60).h + 0.01, z, { flat: 'ground', yaw: seaYaw + Math.PI + (i - 1) * 0.3, v: i % 2 });
      put('deckchair', ...at(al - 1.4, inl - 0.2), seaYaw + (i - 1) * 0.3, { v: i % 3, tol: 0.18 });
      if (i !== 1) put('deckchair', ...at(al - 2.3, inl + 0.4), seaYaw + 0.4, { v: (i + 1) % 3, tol: 0.18 });
      put(i === 1 ? 'basket' : 'cooler', ...at(al + 2.6, inl + 0.6), seaYaw + 1.2, { v: i % 2, tol: 0.18 });
    });
    put('beachball', ...at(-8, 7), 0, { tol: 0.2 });
    put('pail', ...at(-19, 3.2), 0.4, { tol: 0.2 });
    put('pail', ...at(11.2, 2.4), 2.2, { tol: 0.2 });
    put('kayak', ...at(-44, 7), seaYaw + 1.4, { v: 0, tol: 0.25 });
    put('kayak', ...at(-41.5, 8.5), seaYaw + 1.6, { v: 1, tol: 0.25 });
    put('basket', ...at(-4, 18), seaYaw, { tol: 0.2 });
  }

  // ------------------------------------------------------------ the green
  {
    const p = L.POI.plaza;
    const gz = frame(B('gazebo'));
    // music stands in the bandstand
    const gy = gz.floorY;
    for (const [dx, dz, yaw] of [[-1.3, -0.4, 0.3], [0, -0.9, 0], [1.3, -0.4, -0.3]]) {
      const [x, z] = gz.P(dx, dz);
      put('musicstand', x, z, gz.f + Math.PI + yaw, { y: gy != null && Math.abs(PH.groundAt(x, z, gy + 1).h - gy) < 0.3 ? PH.groundAt(x, z, gy + 1).h : undefined });
    }
    tryAt('picnic2d', [[p.x - 14, p.z + 7, 0.3], [p.x - 13, p.z - 4, 0.2], [p.x + 9, p.z - 13, -0.4]]);
    tryAt('picnic2d', [[p.x + 14, p.z + 1, -0.2], [p.x + 16, p.z + 5, 0.1], [p.x + 9, p.z + 15, 0.4]]);
    for (const [x, z, v] of [[p.x - 3.4, p.z + 15.5, 0], [p.x + 3.4, p.z + 15.5, 1], [p.x - 6, p.z - 6, 1]]) put('flowerbed', x, z, 0, { v });
    tryAt('library', [[p.x - 2.0, p.z + 12.0, Math.PI / 2], [p.x + 2.0, p.z + 13.5, -Math.PI / 2], [p.x - 2.2, p.z + 6, Math.PI / 2]]);
    for (const [x, z, v] of [[p.x + 7.5, p.z + 5, 0], [p.x - 7, p.z - 1.5, 1]]) {
      const pile = put('leafpile', x, z, rng.range(0, 3), { v });
      if (pile) put('rake', x + 0.8, z + 0.3, 1.2);
    }
  }
}
