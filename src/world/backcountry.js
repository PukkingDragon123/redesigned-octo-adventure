// Dressing for the backcountry: the old railway (track out of the tunnel, the handcar, the station
// platform), Mont Écho's summit round the fire tower, Lac des Huards (the cottage's dock, lawn and
// canoes, the fishing camp), Moose Marsh (boardwalk, reeds, the blind), Verger Tremblay (the apple
// trees, the press), Café du Rang, and fingerposts at the junctions. Everything is voxel art merged
// into the static chunks (VoxelWorld.addStatic); boats bob on the lake like the harbour's.
import * as THREE from 'three';
import * as L from './layout.js';
import * as PR from '../voxel/models/props.js';
import { roadSamples } from './terrain.js';

const road = (id) => L.ROADS.find((r) => r.id === id);

export function dressBackcountry(vw, physprops, { S, post, box, bench, gy }) {
  const W = vw.world, PH = W.physics, ctx = W.ctx;
  const deck = (x, z, yaw, len, w, top, o = {}) => {
    // a plank deck on posts with its top at `top` (posts reaching down into the water or mud);
    // whole-metre posts and 3 m sections keep the number of distinct models small
    const P = Math.ceil(Math.max(1, top - Math.min(gy(x, z), top - 0.4) + 1.2)), Ls = 3;
    const r = vw.model(`deck:${Ls}:${w}:${P}:${o.rail ?? 0}`, () => PR.woodDeck({ len: Ls, w, posts: P, rail: o.rail ?? 0, seed: 3 }));
    vw.addStatic(r, x, top - P, z, yaw);
    PH.addPlatform({ x, z, yaw, w, l: Ls, y0: top, surface: 'wood', kind: o.kind ?? 'dock' });
    void len;
    if (o.rail) {
      const c = Math.cos(yaw), s = Math.sin(yaw), off = w / 2 + 0.05;
      PH.addBox({ x: x + c * off, z: z - s * off, yaw, w: 0.2, l: Ls, y0: top - 1, y1: top + 1.0, kind: 'railing' });
    }
  };
  // a run of deck sections along a polyline at height `top` (with o.top1: easing down to it from
  // `top` over the first leg, so a boardwalk can start at the trail's height and settle near the water)
  const deckRun = (pts, w, top, o = {}) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2.9)), yaw = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const y = o.top1 == null ? top : k === 0 ? top + (o.top1 - top) * t : o.top1;
        deck(ax + (bx - ax) * t, az + (bz - az) * t, yaw, 3, w, y, o);
      }
    }
  };
  const fingerpost = (x, z, signs) => {
    S('signpost:bc', () => PR.signPost(), x, z, 0);
    post(x, z, 0.12, 3);
    signs.forEach(([text, tx, tz, color], i) => {
      const yaw = Math.atan2(-(tz - z), tx - x);
      S(`arrow:${text}`, () => PR.signArrow({ text, color: color ?? 0xf2e6c8 }), x, z, yaw, 2.35 - i * 0.42);
    });
  };

  railway(vw, { S, post, box, gy, PH, ctx, fingerpost });
  monteEcho(vw, { S, post, box, bench, gy, ctx, fingerpost });
  lake(vw, { S, post, box, gy, ctx, deck, deckRun });
  marsh(vw, { S, post, box, gy, deckRun, fingerpost });
  orchard(vw, { S, post, box, gy, physprops, fingerpost });
  cafe(vw, { S, post, box, bench, gy });
  // fingerposts where the backcountry roads leave the old ones
  fingerpost(-188, 52, [['LAC DES HUARDS', -240, 42], ['GARE', -260, -60, 0xd8c8a0]]);
  fingerpost(-112, 64, [['VERGER', -118, 120, 0xe8c8b0]]);
  fingerpost(-120, -153, [['GARE STE-ROSE', -200, -172], ['MONT ECHO', -260, -200, 0xc8d8c0]]);
  fingerpost(-255, 160, [['MARAIS', -300, 158], ['VERGER', -232, 213, 0xe8c8b0]]);
  void THREE;
}

// ---------------------------------------------------------------- the old railway
function railway(vw, { S, post, box, gy, PH, ctx, fingerpost }) {
  const R = road('railTrail');
  const sm = roadSamples(R, 4);
  const end = -334; // the rails stop a little past the station; the rail trail carries on east
  for (let k = 0; k + 1 < sm.length; k++) {
    const a = sm[k], b = sm[k + 1];
    if (a.x > end) {
      // a buffer stop of old ties at the end of the line
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      S('ties:end', () => PR.firewoodPile({ seed: 9, rows: 3 }), a.x, a.z, yaw + Math.PI / 2);
      box(a.x, a.z, yaw + Math.PI / 2, 1.6, 1, 1);
      break;
    }
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, yaw = Math.atan2(b.x - a.x, b.z - a.z);
    S('railtrack', () => PR.railTrack({ len: 4.1 }), x, z, yaw, -0.05);
  }
  // the tunnel portal where the line comes out of the west ridge (closed: dark inside)
  const t0 = sm[0], t1 = sm[1], tyaw = Math.atan2(t1.x - t0.x, t1.z - t0.z);
  const px = t0.x - Math.sin(tyaw) * 0.6, pz = t0.z - Math.cos(tyaw) * 0.6;
  S('tunnelportal', () => PR.tunnelPortal(), px, pz, tyaw, -0.3);
  box(px, pz, tyaw, 9.2, 1.6, 8, 'wall');
  // the handcar on the rails west of the station, and a pump trolley's worth of clutter
  const hc = sm.reduce((best, p) => (Math.abs(p.x + 428) < Math.abs(best.x + 428) ? p : best), sm[0]);
  const hyaw = Math.atan2(hc.dx, hc.dz);
  S('handcar', () => PR.handcar({}), hc.x, hc.z, hyaw, 0.16);
  box(hc.x, hc.z, hyaw, 1.8, 2.1, 1.5, 'handcar');
  // the station platform's clutter (the platform itself is part of the station model)
  const st = L.BUILDINGS.find((b) => b.id === 'station');
  const sy = vw.world.buildings?.station?.y0 ?? gy(st.x, st.z);
  const onDeck = (key, fn, x, z, yaw = 0) => vw.addStatic(vw.model(key, fn), x, sy, z, yaw);
  onDeck('churn:1', () => PR.milkChurn(), st.x + 7.2, st.z + 5.2, 0.3);
  onDeck('churn:1', () => PR.milkChurn(), st.x + 7.8, st.z + 5.6, 1.1);
  onDeck('crate:mug', () => PR.crate({ stamp: 'mug', seed: 2 }), st.x - 6.5, st.z + 5.4, 0.2);
  onDeck('crate:none', () => PR.crate({ stamp: 'none', seed: 4 }), st.x - 6.4, st.z + 6.1, 0.6);
  onDeck('barrel:st', () => PR.barrel({ contents: 'lid', seed: 5 }), st.x + 3.8, st.z + 5.2, 0);
  for (const [dx, dz] of [[7.5, 5.4], [-6.45, 5.7], [3.8, 5.2]]) PH.addCircle({ x: st.x + dx, z: st.z + dz, r: 0.5, y0: sy - 0.5, y1: sy + 1.1, kind: 'post' });
  fingerpost(st.x + 12, st.z + 4, [['MONT ECHO', -300, -200, 0xc8d8c0], ['LAC DES HUARDS', -390, -60]]);
  void post; void ctx;
}

// ---------------------------------------------------------------- Mont Écho
function monteEcho(vw, { S, post, box, bench, gy, ctx, fingerpost }) {
  const p = L.POI.firetower;
  // a bench and a coin viewer looking south over the lake, the valley and, far off, the sea
  bench(p.x + 8, p.z + 3.5, 0.6, 'wood');
  bench(p.x + 5.5, p.z + 7, 0.3, 'wood');
  S('coinviewer', () => PR.coinViewer(), p.x + 9.5, p.z + 0.5, 0.9);
  post(p.x + 9.5, p.z + 0.5, 0.2, 1.4);
  S('inukshuk:echo', () => PR.inukshuk({ seed: 5 }), p.x - 8, p.z - 4, 0.6);
  box(p.x - 8, p.z - 4, 0.6, 1.6, 0.5, 2);
  S('welcome:echo', () => PR.welcomeSign({ text: 'MONT ECHO 412 m' }), p.x + 7.5, p.z - 6, -0.9);
  box(p.x + 7.5, p.z - 6, -0.9, 3.2, 0.4, 2.2);
  // the ranger's little camp under the tower
  S('tent:ranger', () => PR.tent({ color: 0x3a6a4a, seed: 7 }), p.x - 7, p.z + 3, 1.2);
  box(p.x - 7, p.z + 3, 1.2, 2.2, 2.3, 1.5, 'tent');
  const fx = p.x - 3.5, fz = p.z + 4.5;
  S('firepit:ranger', () => PR.firePit({ lit: true, seed: 8 }), fx, fz, 0.2);
  post(fx, fz, 0.6, 0.8);
  ctx.fires.push(new THREE.Vector3(fx, gy(fx, fz) + 0.3, fz));
  ctx.lights.push({ pos: new THREE.Vector3(fx, gy(fx, fz) + 0.9, fz), color: [1.0, 0.5, 0.2], radius: 8, kind: 'fire', always: true });
  S('firewood:ranger', () => PR.firewoodPile({ seed: 4, rows: 4 }), p.x - 6, p.z - 6.5, 1.4);
  box(p.x - 6, p.z - 6.5, 1.4, 2.2, 1.1, 1);
  // the trailhead down on the rail trail
  const th = L.POI.towerTrailhead;
  fingerpost(th.x - 4, th.z - 4, [['MONT ECHO', -276, -186, 0xc8d8c0]]);
  S('welcome:trail', () => PR.welcomeSign({ text: 'SENTIER MONT ECHO' }), th.x - 8, th.z - 10, 0.5);
  box(th.x - 8, th.z - 10, 0.5, 3.2, 0.4, 2.2);
}

// ---------------------------------------------------------------- Lac des Huards
function lake(vw, { S, post, box, gy, ctx, deck, deckRun }) {
  const H = vw.terrain;
  // walk from a spot on the bank towards the water until it's deep enough for a dock
  const shoreFrom = (x, z, tx, tz) => {
    const d = Math.hypot(tx - x, tz - z), ux = (tx - x) / d, uz = (tz - z) / d;
    for (let s = 0; s < d; s += 0.5) if (H.heightAt(x + ux * s, z + uz * s) < 0.45) return [x + ux * (s - 2), z + uz * (s - 2), ux, uz];
    return [x, z, ux, uz];
  };
  // the cottage's dock, straight out into the lake from the lawn
  const cot = L.BUILDINGS.find((b) => b.id === 'cottage');
  const [dx0, dz0, ux, uz] = shoreFrom(cot.x - 6, cot.z - 2, -380, 62);
  deckRun([[dx0, dz0], [dx0 + ux * 16, dz0 + uz * 16]], 2.2, Math.max(0.6, gy(dx0, dz0) + 0.12));
  const dyaw = Math.atan2(ux, uz);
  // a canoe tied alongside, another pulled up on the bank, and a rowboat out on the water
  ctx.boats.push({ x: dx0 + ux * 11 - uz * 1.9, z: dz0 + uz * 11 + ux * 1.9, yaw: dyaw, kind: 'canoe' });
  ctx.boats.push({ x: -392, z: 40, yaw: 0.9, kind: 'rowboat', hull: 'hullGreen' });
  S('canoe:lake1', () => PR.canoe({ color: 0x2f6e6a, flip: true }), dx0 - uz * 4 - ux * 2, dz0 + ux * 4 - uz * 2, dyaw + 0.3, -0.02);
  S('canoe:lake2', () => PR.canoe({ color: 0xe8a02a, paddle: false }), dx0 + uz * 4.5 - ux * 2.5, dz0 - ux * 4.5 - uz * 2.5, dyaw - 0.2, -0.04);
  // the lawn: Muskoka chairs round a fire, looking out over the lake, a flag on its pole
  const fx = cot.x - 6, fz = cot.z + 11;
  S('firepit:cottage', () => PR.firePit({ lit: true, seed: 11 }), fx, fz, 0.4);
  post(fx, fz, 0.6, 0.8);
  ctx.fires.push(new THREE.Vector3(fx, gy(fx, fz) + 0.3, fz));
  ctx.lights.push({ pos: new THREE.Vector3(fx, gy(fx, fz) + 0.9, fz), color: [1.0, 0.5, 0.2], radius: 9, kind: 'fire', always: true });
  [0xc8382e, 0x2f8a86, 0xe8b830, 0x3a5aa8].forEach((col, i) => {
    const a = -1.2 + i * 0.8, x = fx + Math.cos(a) * 2.6, z = fz + Math.sin(a) * 2.6;
    const yaw = Math.atan2(fx - x, fz - z);
    S(`muskoka:${i}`, () => PR.muskokaChair({ color: col }), x, z, yaw);
    box(x, z, yaw, 0.9, 1.1, 0.9, 'chair');
    vw.spot(x, z, 1.1, 'Sit in the Muskoka chair', 'sit', { yaw, y: gy(x, z) + 0.05 });
  });
  const gx = cot.x - 4, gz = cot.z - 7;
  const fp = S('flagpole:6', () => PR.flagPole({ h: 6 }), gx, gz);
  post(gx, gz, 0.2, 6);
  ctx.flags.push({ pos: new THREE.Vector3(gx + 0.06, gy(gx, gz) + fp.meta.flagAt, gz), w: 1.6, h: 0.8 });
  S('firewood:cottage', () => PR.firewoodPile({ seed: 2, rows: 5 }), cot.x + 3, cot.z + 6.5, 0);
  box(cot.x + 3, cot.z + 6.5, 0, 2.4, 1.2, 1.2);
  // the fishing camp on the north shore: its own little dock, canoes on a rack, barrels and a smoker
  const fc = L.BUILDINGS.find((b) => b.id === 'fishcamp');
  const [cx0, cz0, cux, cuz] = shoreFrom(fc.x + 1, fc.z + 6, fc.x + 3, fc.z + 40);
  deckRun([[cx0, cz0], [cx0 + cux * 10, cz0 + cuz * 10]], 1.8, Math.max(0.55, gy(cx0, cz0) + 0.12));
  ctx.boats.push({ x: cx0 + cux * 7 + cuz * 1.7, z: cz0 + cuz * 7 - cux * 1.7, yaw: Math.atan2(cux, cuz), kind: 'canoe' });
  S('canoe:camp2', () => PR.canoe({ color: 0xb83a2a, flip: true }), fc.x + 5.5, fc.z + 1, 0.2);
  S('canoe:camp3', () => PR.canoe({ color: 0x3a5aa8, flip: true }), fc.x + 6.6, fc.z + 1.2, 0.25, 0.32);
  box(fc.x + 6, fc.z + 1, 0.2, 1.4, 4, 0.8, 'boat');
  S('barrel:fish', () => PR.barrel({ contents: 'water', seed: 3 }), fc.x - 4, fc.z + 3, 0);
  S('barrel:smoke', () => PR.barrel({ contents: 'lid', seed: 8 }), fc.x - 4.6, fc.z + 1.8, 0);
  post(fc.x - 4.3, fc.z + 2.4, 0.8, 1.1);
  ctx.smoke.push(new THREE.Vector3(fc.x - 4.6, gy(fc.x - 4.6, fc.z + 1.8) + 1.2, fc.z + 1.8));
  S('picnic:fish', () => PR.picnicTable({ cloth: false }), fc.x + 5, fc.z + 6.5, 0.1);
  box(fc.x + 5, fc.z + 6.5, 0.1, 1.9, 1.7, 0.8, 'table');
  S('lantern:fish', () => PR.lantern({ color: 'red', lit: true }), fc.x + 5, fc.z + 6.5, 0, 0.82);
  S('welcome:lake', () => PR.welcomeSign({ text: 'LAC DES HUARDS' }), -347, 21, -0.6);
  box(-347, 21, -0.6, 3.2, 0.4, 2.2);
  void deck;
}

// ---------------------------------------------------------------- Moose Marsh
function marsh(vw, { S, post, box, gy, deckRun, fingerpost }) {
  const m = L.POI.marsh;
  // the boardwalk from the trail's end out across the pools to the blind on the far side
  const pts = [[-399, 147.5], [-412, 151], [-424, 148], [-438, 156], [-450, 166], [-460, 171]];
  const top = 0.8;
  deckRun(pts, 1.8, Math.max(top, gy(pts[0][0], pts[0][1]) + 0.1), { rail: 1, kind: 'boardwalk', top1: top });
  const [bx, bz] = pts[pts.length - 1];
  const byaw = Math.atan2(m.x - bx, m.z - bz); // (the blind's door faces back along the boardwalk, its slot out west)
  vw.addStatic(vw.model('blind', () => PR.wildlifeBlind()), bx - Math.sin(byaw) * 2, top, bz - Math.cos(byaw) * 2, byaw + Math.PI);
  vw.world.physics.addPlatform({ x: bx - Math.sin(byaw) * 2, z: bz - Math.cos(byaw) * 2, yaw: byaw, w: 2.4, l: 2.2, y0: top, surface: 'wood', kind: 'deck' });
  // reeds and cattails round the pools
  const T = vw.terrain;
  let n = 0;
  for (let k = 0; k < 140 && n < 16; k++) {
    const a = k * 2.399, r = 6 + ((k * 37) % 100) / 100 * (m.r + 4);
    const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r, h = T.heightAt(x, z);
    if (h < -0.35 || h > 0.7) continue;
    S(`cattails:${k % 3}`, () => PR.cattails({ seed: k % 3 }), x, z, a, -0.05);
    n++;
  }
  S('moosesign:marsh', () => PR.mooseSign(), -386, 152, -Math.PI / 2);
  post(-386, 152, 0.08, 2.8);
  S('welcome:marsh', () => PR.welcomeSign({ text: "MARAIS A L'ORIGNAL" }), -384, 141, -Math.PI / 2 + 0.3);
  box(-384, 141, -Math.PI / 2 + 0.3, 3.2, 0.4, 2.2);
  void fingerpost;
}

// ---------------------------------------------------------------- Verger Tremblay
function orchard(vw, { S, post, box, gy, physprops, fingerpost }) {
  const T = vw.terrain;
  const trees = (vw.orchardTrees = []);
  let k = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
    const x = -201 + i * 7 + (((i * 7 + j * 3) % 5) - 2) * 0.25, z = 278 + j * 9 + (j % 2) * 1.5;
    if (T.splatAt(x, z).road > 0.2) continue;
    const seed = (i * 3 + j * 5) % 4;
    S(`appletree:${seed}`, () => PR.appleTree({ seed }), x, z, (k++ * 1.7) % 6.28, -0.05);
    vw.world.physics.addCircle({ x, z, r: 0.28, y0: gy(x, z) - 1, y1: gy(x, z) + 2.5, kind: 'post' });
    trees.push({ x, z });
  }
  // the press by the cider house, crates, baskets and barrels of apples, a ladder in a tree
  const cd = L.BUILDINGS.find((b) => b.id === 'cidrerie');
  const px = cd.x + 7.5, pz = cd.z - 2;
  S('ciderpress', () => PR.ciderPress(), px, pz, -Math.PI / 2);
  box(px, pz, -Math.PI / 2, 2.1, 1.4, 2);
  vw.ciderPress = { x: px, z: pz };
  for (const [dx, dz, i] of [[-7.2, -2, 0], [-7.6, -0.8, 1], [-6.9, -3.2, 2]]) S(`applecrate:${i}`, () => PR.appleCrate({ seed: i }), cd.x + dx, cd.z + dz, i * 0.5);
  box(cd.x - 7.3, cd.z - 2, 0, 1.4, 3, 0.8);
  S('barrel:apples1', () => PR.barrel({ contents: 'apples', seed: 2 }), cd.x + 6.5, cd.z + 2.5, 0);
  S('barrel:apples2', () => PR.barrel({ contents: 'apples', seed: 6 }), cd.x + 7.3, cd.z + 3.3, 0);
  post(cd.x + 6.9, cd.z + 2.9, 0.8, 1.1);
  S('applebasket:o', () => PR.appleBasket({ seed: 4 }), -180, 300, 0.3);
  S('wheelbarrow:empty', () => PR.wheelbarrow({ contents: 'empty' }), -173.5, 284.5, 1.2);
  S('welcome:verger', () => PR.welcomeSign({ text: 'VERGER TREMBLAY POMMES' }), -142, 254, Math.PI + 0.2);
  box(-142, 254, Math.PI + 0.2, 3.2, 0.4, 2.2);
  // split-rail fence along the road side of the orchard
  for (let x = -206; x < -166; x += 3) { vw.fenceRun('rail', x, 268, x + 3, 268); box(x + 1.5, 268, Math.PI / 2, 0.2, 3.1, 1.3, 'fence'); }
  void physprops; void post; void fingerpost;
}

// ---------------------------------------------------------------- Café du Rang
function cafe(vw, { S, post, box, bench, gy }) {
  const c = L.BUILDINGS.find((b) => b.id === 'cafehut');
  for (const [dx, dz, i] of [[-7, 5, 0], [7.5, 5.5, 1]]) { S(`picnic:${i}`, () => PR.picnicTable({ cloth: i === 1 }), c.x + dx, c.z + dz, 0.2 * (i ? 1 : -1)); box(c.x + dx, c.z + dz, 0.2 * (i ? 1 : -1), 1.9, 1.7, 0.8, 'table'); }
  bench(c.x - 7, c.z - 0.5, Math.PI / 2, 'red');
  S('bikerack:cafe', () => PR.bikeRack(), c.x + 6, c.z + 0.5, Math.PI / 2);
  box(c.x + 6, c.z + 0.5, Math.PI / 2, 2, 0.3, 0.9);
  S('bin:cafe', () => PR.litterBin(), c.x + 4.2, c.z + 4.6, 0);
  post(c.x + 4.2, c.z + 4.6, 0.32, 1.1);
  void gy;
}
