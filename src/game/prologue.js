// The prologue, fully staged in 3D: Hank the lumberjack fells one last maple,
// lies down for "a quick nap", is declared dead, gets a lovely funeral (which he
// snores through), sleeps for years... and then the Reaper notices the mistake.
import * as THREE from 'three';
import { POI } from '../world/layout.js';
import { P } from '../render/particles.js';
import { makeTreeSprite } from '../world/forest2d.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as PR from '../voxel/models/props.js';
import * as FOOD from '../voxel/models/food.js';
import { LORE, CHOP_CYCLE, CHOP_HIT } from './lorePoses.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeIn = (k) => k * k * k;
const smooth = (k) => k * k * (3 - 2 * k);
const GRAVE_YAW = Math.PI * 0.75; // matches the grave dressing in world/props.js

// world point from grave-local coordinates (x across the plot, z along it; -z = headstone)
function graveAt(lx, lz) {
  const c = Math.cos(GRAVE_YAW), s = Math.sin(GRAVE_YAW), g = POI.grave;
  return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
}

// voxel trees standing where we stage a scene get hidden for its duration
function clearTrees(g, x, z, r) {
  const F = g.world.forest, VF = g.world.voxelForest;
  const hidden = [];
  for (const t of F?.trees || []) {
    if (t.vkey && Math.hypot(t.x - x, t.z - z) < r) { hidden.push([t, t.vkey]); t.vkey = null; }
  }
  VF?.last?.set(1e9, 0, 1e9);
  return () => {
    for (const [t, k] of hidden) t.vkey = k;
    VF?.last?.set(1e9, 0, 1e9);
  };
}

function campSpot() {
  if (POI.lumberCamp) return POI.lumberCamp;
  return { x: -197, z: 30, r: 12 };
}

// test entry points (?scene=lumberCamp etc. via Story)
export const PROLOGUE = { lumberCamp: (s) => lumberCamp(s), funeral: (s) => funeral(s), yearsPass: (s) => yearsPass(s), revival: (s) => revival(s), nanaFindsHank: (s) => nanaFindsHank(s) };

export async function runPrologue(story) {
  await lumberCamp(story);
  await funeral(story);
  await yearsPass(story);
  await revival(story);
  await nanaFindsHank(story);
}

// ---------------------------------------------------------------- 1. the last tree
function lumberCamp(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    g.setBikeVisible(false);
    g.pipeline.post.uFade.value = 1;
    A.hour = 14.6;
    A.setWeather('clear', true);
    A.cold = 0;
    S.music('forest');
    const C = campSpot();
    const gy = (x, z) => g.physics.groundAt(x, z).h;
    const restore = clearTrees(g, C.x, C.z, (C.r || 12) * 0.85);
    S.temp.push({ remove: restore });
    const cy = gy(C.x, C.z);

    // stage axes: the felled maple stands on the far side of the clearing
    const dir = new THREE.Vector3(0.55, 0, -0.84).normalize(); // camp centre -> tree (and the way it falls)
    const perp = new THREE.Vector3(-dir.z, 0, dir.x); // the open side we film from
    const off = (o, a, b) => ({ x: o.x + dir.x * a + perp.x * b, z: o.z + dir.z * a + perp.z * b });
    const TP = off(C, 3.4, 0);
    const pivot = new THREE.Group();
    pivot.position.set(TP.x, gy(TP.x, TP.z), TP.z);
    g.scene.add(pivot);
    // the forest's own maple (same wind and leaf light), or a fresh one if the forest isn't voxel
    const TS = 0.9;
    // the forest's own pixel-art maple card, so it matches the trees around it
    const tree = g.world.forest?.makeTree?.('maple', 1) || makeTreeSprite('maple', 1);
    const tgeo = null, meta = tree.userData.meta;
    tree.scale.multiplyScalar(TS);
    pivot.add(tree);
    S.temp.push({ remove: () => { g.scene.remove(pivot); tgeo?.dispose(); } });
    const trunkR = (meta?.trunkR ?? 0.35) * TS;
    // camp dressing
    const at = (a, b) => off(C, a, b);
    let p = at(-0.5, -4.2); S.prop(LORE.stump({ seed: 3, r: 7 }), p.x, p.z);
    p = at(-3.2, 3.6); S.prop(LORE.stump({ seed: 6, r: 6, h: 6 }), p.x, p.z);
    p = at(-1.6, -5.4); S.prop(LORE.logPile(), p.x, p.z, { yaw: Math.atan2(perp.x, perp.z) });
    p = at(-4.0, -1.5); S.prop(LORE.logSection({ len: 46, r: 7, seed: 2 }), p.x, p.z, { yaw: 1.2 });
    p = at(1.2, -3.6);
    try { S.prop(PR.stumpWithAxe(), p.x, p.z, { yaw: -0.6 }); } catch { /* optional prop */ }
    p = at(-3.6, -4.4);
    try { S.prop(PR.firewoodPile({}), p.x, p.z, { yaw: 1.1 }); } catch { /* optional prop */ }
    p = at(-1.8, 2.4);
    const pile = S.prop(LORE.leafPile({ seed: 4 }), p.x, p.z, { yaw: Math.atan2(dir.x, dir.z) });

    // Hank squares up to the trunk; Big Lou supervises from across the clearing
    const HP = off(TP, -(trunkR + 0.95), 0.2);
    const H = S.actor('hankAlive', HP.x, HP.z, Math.atan2(TP.x - HP.x, TP.z - HP.z), 'chop');
    p = at(0.4, -3.4);
    const L = S.actor('lou', p.x, p.z, 0, 'idle');
    L.faceTowards(H.pos.x, H.pos.z);
    L.yaw = L.targetYaw;
    const trunkHit = V(TP.x - dir.x * trunkR, gy(TP.x, TP.z) + 0.8, TP.z - dir.z * trunkR);
    // camera helper in stage space: a = along dir, b = toward the open side, h = height
    const shotAt = (o, a, b, h, look, lh = 1.1, dur = 0, fov = 44) => {
      const q = off(o, a, b);
      return S.cam(V(q.x, gy(q.x, q.z) + h, q.z), V(look.x, gy(look.x, look.z) + lh, look.z), dur, fov);
    };
    const mid = { x: (HP.x + TP.x) / 2, z: (HP.z + TP.z) / 2 };

    // every swing that lands: a thock, chips, a shiver up the tree
    let wob = 0, lastP = 0, chopping = true, hits = 0;
    S.every((dt) => {
      wob = Math.max(0, wob - dt * 2.5);
      if (!pivot.userData.falling) pivot.rotation.z = Math.sin(g.time * 40) * wob * 0.02;
      if (!chopping || H.anim !== 'chop') return false;
      const p = (H.animT % CHOP_CYCLE) / CHOP_CYCLE;
      if (lastP < CHOP_HIT && p >= CHOP_HIT) {
        hits++;
        S.sfx('axe_chop', { volume: 0.9, pitch: 0.92 + Math.random() * 0.16 });
        wob = 1;
        g.chase.shake(0.12);
        for (let k = 0; k < 12; k++) {
          g.effects.ps.spawn({ x: trunkHit.x, y: trunkHit.y, z: trunkHit.z, vx: -1 + Math.random() * -2.5, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.3) * 3, life: 1.4, size: 0.07 + Math.random() * 0.05, sprite: P.chip, color: [1, 0.86, 0.6], gravity: 11, drag: 0.4, spin: (Math.random() - 0.5) * 20, ground: true, rest: 1.2 });
        }
        if (hits % 2 === 0) for (let k = 0; k < 3; k++) g.effects.spawnLeaf(TP.x + (Math.random() - 0.5) * 3, trunkHit.y + 5 + Math.random() * 2, TP.z + (Math.random() - 0.5) * 3, {});
      }
      lastP = p;
      return false;
    });

    // establishing: a slow crane down through the canopy into the clearing
    await shotAt(C, -10, 14, 17, C, 2, 0, 50);
    shotAt(mid, -1.0, 5.2, 2.0, mid, 1.3, 7, 46);
    S.fade(0, 2.4);
    await S.wait(1.4);
    await S.narrate('Autumn. Somewhere in the wilds of Canada...');
    await S.narrate('This is Hank. A lumberjack. A good one, mostly.');
    await shotAt(H.pos, 1.2, 3.1, 1.85, H.pos, 1.45, 1.2, 44);
    await S.say('hank', 'Hup! ...Hup! ...HUP!', { actor: H, expr: 'determined', name: 'Hank' });
    await shotAt(C, -0.4, -1.4, 1.9, L.pos, 1.65, 1.0, 44);
    L.play('idle', 'happy');
    await S.say('lou', 'Atta boy, Hank! Biggest maple on the ridge!', { actor: L, expr: 'happy' });
    await shotAt(H.pos, 0.7, 3.3, 1.75, H.pos, 1.5, 1.0, 42);
    await S.say('hank', 'Stubborn one, Lou. One more ought to do it.', { actor: H, expr: 'smug', name: 'Hank' });
    // the last swing, then the creak
    await S.wait(CHOP_CYCLE * 1.1);
    chopping = false;
    H.play('idle', 'surprised');
    S.sfx('tree_creak');
    for (let k = 0; k < 10; k++) { wob = 1.6; await S.wait(0.12); }
    await shotAt(mid, 1.5, 9.5, 2.4, off(TP, 3.5, 0), 2.8, 0.6, 54);
    H.play('timber', 'shock');
    await S.say('hank', '*TIMBERRRRR!*', { actor: H, expr: 'shock', name: 'Hank', speed: 30 });
    // she goes: away from Hank, gathering speed
    const away = new THREE.Vector3(TP.x - HP.x, 0, TP.z - HP.z).normalize();
    const axis = new THREE.Vector3(away.z, 0, -away.x);
    const q0 = pivot.quaternion.clone();
    pivot.userData.falling = true;
    const FALL = 1.7;
    S.wait(FALL - 0.85).then(() => S.sfx('tree_fall'));
    await S.anim(FALL, (k) => {
      pivot.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (Math.PI / 2) * 0.97 * easeIn(k)));
    });
    // BOOM: shake, dust along the trunk, a blizzard of leaves
    g.chase.shake(1.3);
    g.pipeline.post.uFlash.value = 0.25;
    g.tween(g.pipeline.post.uFlash, 'value', 0, 0.35);
    S.prop(LORE.stump({ seed: 9, r: 8, h: 7 }), TP.x, TP.z);
    for (let i = 0; i < 26; i++) {
      const d = 1 + (i / 26) * 9;
      const px = TP.x + away.x * d, pz = TP.z + away.z * d;
      g.effects.ps.spawn({ x: px, y: gy(px, pz) + 0.2, z: pz, vx: (Math.random() - 0.5) * 3, vy: 0.6 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 3, life: 1.6, size: 0.5, size1: 1.8, sprite: P.dust, color: [0.72, 0.6, 0.46], drag: 2.2, alpha: 0.8 });
      if (i % 2 === 0) g.effects.spawnLeaf(px, gy(px, pz) + 2 + Math.random() * 2, pz, { vy: 1 + Math.random() * 2 });
    }
    g.effects.poof?.(TP.x + away.x * 6, cy + 0.5, TP.z + away.z * 6, { scale: 2.4, count: 10 });
    H.react('jump');
    L.react('yay');
    S.sfx('crowd_cheer', { volume: 0.4 });
    await S.wait(1.0);
    const toCam = off(H.pos, -0.4, 4);
    H.faceTowards(toCam.x, toCam.z);
    H.play('flex', 'happy');
    await shotAt(H.pos, 0.4, 3.2, 1.75, H.pos, 1.4, 0.8, 42);
    await S.say('hank', "Ha! Still got it.", { actor: H, expr: 'happy', name: 'Hank' });
    L.play('cheer', 'laugh');
    await S.say('lou', "Legend! I'll grab lunch. Back in ten!", { actor: L, expr: 'laugh' });
    L.play('idle');
    const exit1 = at(-7, -6), exit2 = at(-15, -12);
    const loGone = L.walkTo([[exit1.x, exit1.z], [exit2.x, exit2.z]], 2.2);
    H.play('yawn', 'sleepy');
    S.sfx('snore', { volume: 0.4, pitch: 1.2 });
    await S.say('hank', "I'll just rest my eyes. One minute.", { actor: H, expr: 'sleepy', name: 'Hank' });
    // into the leaf pile
    await S.fade(1, 0.5);
    loGone.then(() => (L.visible = false));
    L.visible = false;
    H.pos.set(pile.position.x, pile.position.y + 0.22, pile.position.z);
    H.groundSnap = false;
    H.yaw = H.targetYaw = 0.4 + Math.PI / 2;
    H.play('snooze', 'sleepy');
    await shotAt(pile.position, -1.2, 2.8, 1.5, pile.position, 0.4, 0, 42);
    await S.fade(0, 0.6);
    const zz = () => S.emote('zzz', V(H.pos.x, H.pos.y + 0.9, H.pos.z), 2.4);
    zz();
    S.sfx('big_snore');
    await S.narrate('Hank had just one tiny flaw.');
    zz();
    S.sfx('big_snore');
    await S.narrate('Hank could sleep anywhere. For a ~very~ long time.');
    // the afternoon slides by; leaves pile up on him
    shotAt(pile.position, -0.6, 1.8, 1.0, pile.position, 0.35, 5, 40);
    const h0 = A.hour;
    S.anim(5, (k) => (A.hour = h0 + k * 3.6));
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < 4; k++) g.effects.spawnLeaf(H.pos.x + (Math.random() - 0.5) * 2.4, H.pos.y + 3, H.pos.z + (Math.random() - 0.5) * 2.4, {});
      if (i % 3 === 0) { zz(); S.sfx('big_snore', { volume: 0.7 }); }
      await S.wait(0.5);
    }
    // Lou comes back with sandwiches
    L.visible = true;
    const ent = at(-7, -6), stop = off(H.pos, -1.3, -1.3);
    L.pos.set(ent.x, gy(ent.x, ent.z), ent.z);
    const back = L.walkTo([[stop.x, stop.z]], 2.0);
    await shotAt(H.pos, -1.5, 3.6, 1.9, off(H.pos, 0, -0.6), 0.8, 0.8, 46);
    await S.say('lou', 'Hank! I got the pickle sandwiches!', { actor: L, expr: 'happy' });
    await back;
    L.faceTowards(H.pos.x, H.pos.z);
    L.play('point', 'surprised');
    await S.say('lou', '...Hank? Buddy?', { actor: L, expr: 'worried' });
    L.play('push');
    await S.wait(0.5);
    L.react('shock');
    S.sfx('gasp');
    await S.say('lou', '*HANK?!* Somebody get the doctor!!', { actor: L, expr: 'shock', speed: 34 });
    // Dr. Ingrid examines him
    await S.fade(1, 0.5);
    A.hour = Math.max(A.hour, 18.4);
    const ip = off(H.pos, 0.35, -0.85);
    const I = S.actor('ingrid', ip.x, ip.z, 0, 'kneel');
    I.faceTowards(H.pos.x, H.pos.z);
    I.yaw = I.targetYaw;
    L.play('mourn', 'worried');
    await shotAt(H.pos, -1.6, 2.8, 1.4, off(H.pos, 0, 0.4), 0.6, 0, 44);
    await S.fade(0, 0.5);
    await S.say('ingrid', 'No pulse. Cold as a January lake.', { actor: I, expr: 'worried' });
    zz();
    S.sfx('big_snore');
    I.react('flinch');
    await S.wait(1.2);
    await S.say('ingrid', "...That noise is just air leaving the body. I'm sorry, Lou.", { actor: I, expr: 'sheepish' });
    L.play('cry', 'cry');
    await shotAt(L.pos, -1.2, 2.2, 1.7, L.pos, 1.5, 0.8, 40);
    await S.say('lou', 'He never even got his sandwich!', { actor: L, expr: 'cry' });
    await S.fade(1, 1.4);
  });
}

// ---------------------------------------------------------------- 2. the funeral
// A grey October afternoon in Old Pine Cemetery: drizzle, maple leaves coming down, the
// village under black umbrellas round a plain pine coffin with Hank's toque and axe on
// the lid. Father Gilles says a few words, Nana and Lou fewer; a crow watches from the
// dead tree. The coffin goes down on ropes, Nana lets a maple leaf fall after it, and
// then everyone goes home one by one... except Nana, who stays to leave him a mug of
// cocoa. The rain stops, the low sun breaks through, and the crow (with a glint of the
// Reaper's violet in its eye) flies off, leaving the steam rising off the mug.

// the open grave: an earthen pit drawn inside a hole cut out of the ground. The terrain
// is a heightfield, so the opening is a quad that pushes the depth there back to the far
// plane (drawn after everything solid), then the pit walls and whatever goes down into
// it (the coffin, its ropes) are drawn after that, so they show through the hole only.
let HOLE_MAT = null;
function holeMaterial() {
  return (HOLE_MAT ||= new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }',
    colorWrite: false,
  }));
}
const HOLE_ORDER = 10, PIT_ORDER = 11, IN_PIT_ORDER = 12;
const setOrder = (o, n) => o.traverse((m) => (m.renderOrder = n));

function funeral(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    await S.fade(1, 0.01);
    g.setBikeVisible(false);
    A.hour = 16.3;
    A.setWeather('drizzle', true);
    A.cold = 0.12;
    S.music('requiem');
    const gr = POI.grave;
    const gy = (x, z) => g.physics.groundAt(x, z).h;
    const y0 = gy(gr.x, gr.z);
    const at = (lx, lz) => graveAt(lx, lz);
    // a point in grave-local metres (x across the plot, z along it, -z the headstone), up off the ground
    const L3 = (lx, lz, up = 0) => { const p = at(lx, lz); return V(p.x, gy(p.x, p.z) + up, p.z); };
    const yawL = (lx, lz) => GRAVE_YAW + Math.atan2(lx, lz); // world yaw of a grave-local direction
    const XZ = (p, y) => V(p.x, y, p.z);
    const turnTo = (a, lx, lz) => { const p = at(lx, lz); a.faceTowards(p.x, p.z); a.yaw = a.targetYaw; return a; };
    const child = (res, parent, x, y, z, { rx = 0, ry = 0, scale = 1 } = {}) => {
      const geo = meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true });
      const m = voxMesh(geo, sharedVoxelMaterial());
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.scale.setScalar(scale);
      parent.add(m);
      S.temp.push({ remove: () => geo.dispose() });
      return m;
    };

    // ---- the open grave (just in front of Hank's headstone)
    const PIT = { lz: 0.3, w: 1.0, l: 2.3 };
    const pc = at(0, PIT.lz);
    let top = -1e9;
    for (const [lx, lz] of [[-0.5, -0.85], [0.5, -0.85], [-0.5, 1.45], [0.5, 1.45], [0, 0.3], [0, -0.85], [0, 1.45]]) {
      const p = at(lx, lz);
      top = Math.max(top, gy(p.x, p.z));
    }
    top += 0.015;
    const pit = S.prop(LORE.gravePit({ w: 20, l: 46, d: 34 }), pc.x, pc.z, { yaw: GRAVE_YAW, y: top });
    setOrder(pit, PIT_ORDER);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(PIT.w, PIT.l).rotateX(-Math.PI / 2), holeMaterial());
    hole.position.set(pc.x, top, pc.z);
    hole.rotation.y = GRAVE_YAW;
    hole.renderOrder = HOLE_ORDER;
    g.scene.add(hole);
    S.temp.push({ remove: () => { hole.parent?.remove(hole); hole.geometry.dispose(); } });

    // ---- the coffin on two planks across it: plain pine, his toque and his axe on the lid
    const planks = [-0.35, 0.95].map((lz) => { const p = at(0, lz); return S.prop(LORE.plank({ len: 32 }), p.x, p.z, { yaw: GRAVE_YAW, y: top }); });
    const coffin = S.prop(LORE.coffin(), pc.x, pc.z, { yaw: GRAVE_YAW, y: top + 0.1 });
    const lidTop = 0.45 + 0.1;
    child(LORE.coffin({ part: 'lid' }), coffin, 0, 0.45, -1.0);
    child(LORE.toque(), coffin, 0.02, lidTop, -0.74, { ry: 0.5, scale: 0.55 });
    child(LORE.axe(), coffin, 0.07, lidTop + 0.068, -0.12, { rx: -Math.PI / 2, ry: 0.06, scale: 0.85 });
    setOrder(coffin, IN_PIT_ORDER);
    // the lowering ropes: from each pallbearer's hands, over the edge, under the coffin, up
    // the far side and round a stake
    const stakes = [-0.25, 0.85].map((lz) => { const p = at(0.66, lz + PIT.lz - 0.3); return S.prop(LORE.stake(), p.x, p.z, { yaw: GRAVE_YAW, y: gy(p.x, p.z) - 0.05 }); });
    const ropeRes = LORE.rope();
    const ropeGeo = meshVox(ropeRes.vox, { size: ropeRes.size, origin: ropeRes.origin });
    S.temp.push({ remove: () => ropeGeo.dispose() });
    const segs = [];
    const seg = () => {
      const m = voxMesh(ropeGeo, sharedVoxelMaterial());
      m.renderOrder = IN_PIT_ORDER;
      m.visible = false;
      g.scene.add(m);
      S.temp.push({ remove: () => m.parent?.remove(m) });
      segs.push(m);
      return m;
    };
    const span = (m, a, b) => {
      if (!b) { m.visible = false; return; }
      m.position.copy(a);
      m.lookAt(b);
      m.scale.set(0.7, 0.7, Math.max(0.01, a.distanceTo(b)));
      m.visible = true;
    };

    // headstone, wreath on its easel
    const st = at(0, -1.12);
    S.prop(LORE.hankStone(), st.x, st.z, { yaw: GRAVE_YAW, scale: 1.05 });
    const wr = at(-1.6, -1.8);
    S.prop(LORE.wreath(), wr.x, wr.z, { yaw: GRAVE_YAW });

    // ---- everyone came (in their dark coats), under black umbrellas
    const cast = [
      ['pastor', 'pastor', -0.95, -1.6, 'preach'],
      ['lou', 'louMourn', -1.1, -0.25, 'mourn'], ['gus', 'gusMourn', -1.1, 0.85, 'mourn'],
      ['grandma', 'grandmaMourn', -0.1, 2.05, 'mourn'], ['marie', 'marieMourn', 0.55, 2.3, 'brolly'],
      ['pip', 'pip', -0.7, 2.45, 'sad'], ['pop', 'pop', -1.2, 2.7, 'sad'],
      ['doug', 'doug', -1.95, 0.3, 'mourn'], ['ollie', 'ollie', -1.95, -0.85, 'mourn'],
      ['agnes', 'agnesMourn', -1.85, 1.6, 'brolly'], ['ingrid', 'ingridMourn', 1.45, 2.8, 'brolly'],
      ['birdie', 'birdie', 2.2, 1.9, 'brolly'],
    ];
    const who = {};
    for (const [id, look, lx, lz, anim] of cast) {
      const p = at(lx, lz);
      who[id] = turnTo(S.actor(look, p.x, p.z, 0, anim), 0, PIT.lz);
    }
    const N = who.grandma, Lou = who.lou, Gus = who.gus, Pa = who.pastor;
    turnTo(Pa, 0.2, 2.2);

    // ---- the crow on the dead tree (the cemetery's own crows keep out of it)
    const C = g.wildlife?.critters || g.critters;
    const hidden = [];
    for (const k of C?.list || []) if (k.kind === 'crow' && !k.hidden && Math.hypot(k.x - gr.x, k.z - gr.z) < 30) { k.hidden = true; hidden.push(k); }
    const perch = (g.world.ctx?.perches || []).filter((p) => Math.hypot(p.x - gr.x, p.z - gr.z) < 16)
      .sort((a, b) => Math.hypot(a.x - gr.x, a.z - gr.z) - Math.hypot(b.x - gr.x, b.z - gr.z))[0];
    let crow = null;
    if (C && perch) {
      try {
        crow = C.add('crow', perch.x, perch.z, { y: perch.y, anim: 'idle', despawn: 1e9, maxDraw: 300, scale: 1.45, cat: 'funeralCrow', resident: true, yaw: Math.atan2(pc.x - perch.x, pc.z - perch.z) });
        crow.ai = null;
        crow.fade = 0;
        crow.fadeIn = false;
      } catch (e) { console.warn('funeral crow', e); }
    }
    S.temp.push({ remove: () => {
      for (const k of hidden) k.hidden = false;
      if (crow) { crow.resident = false; crow.dead = true; }
    } });
    const caw = (vol = 0.6) => { if (crow) crow.cawK = 1; S.sfx('crow', { volume: vol }); };

    // ---- the weather in the air: drizzle (the atmosphere's), maple leaves coming down
    let pitOpen = true, leafRate = 3.5, leafAcc = 0;
    S.every((dt) => {
      leafAcc += dt * leafRate;
      const lk = g.chase.look;
      while (leafAcc > 1) {
        leafAcc -= 1;
        const x = lk.x + (Math.random() - 0.5) * 14, z = lk.z + (Math.random() - 0.5) * 14;
        // (nothing comes to rest over the open grave: it would hang over the hole)
        if (pitOpen && Math.hypot(x - pc.x, z - pc.z) < 4) continue;
        g.effects.spawnLeaf(x, gy(x, z) + 4 + Math.random() * 3, z, {});
      }
      return false;
    });
    // steam off a mug of cocoa (held, or set down)
    const steam = (p, k = 1) => g.effects.ps.spawn({
      x: p.x + (Math.random() - 0.5) * 0.03, y: p.y, z: p.z + (Math.random() - 0.5) * 0.03, vy: 0.2 + Math.random() * 0.12,
      life: 1.6 + Math.random() * 0.8, size: 0.06 * k, size1: 0.2 * k, sprite: P.steam, color: [1, 1, 1], drag: 0.5, wind: 0.25, alpha: 0.5, fadeIn: 0.3, flutter: 0.12,
    });
    // the ropes follow the hands and the coffin
    let ropesOn = false;
    for (let i = 0; i < 8; i++) seg();
    const _h = V(0, 0, 0), _h2 = V(0, 0, 0);
    const hands = (a) => {
      a.arms.L.hand.getWorldPosition(_h);
      a.arms.R.hand.getWorldPosition(_h2);
      return _h.add(_h2).multiplyScalar(0.5).clone();
    };
    S.every(() => {
      if (!ropesOn) { for (const m of segs) m.visible = false; return false; }
      [Lou, Gus].forEach((a, i) => {
        const rz = i ? 0.55 : -0.55;
        const near = coffin.localToWorld(V(-0.39, 0.05, rz)), far = coffin.localToWorld(V(0.39, 0.05, rz));
        const sk = stakes[i].position.clone().add(V(0, 0.3, 0));
        const hand = hands(a);
        const deep = near.y < top + 0.02;
        const eN = L3(-0.5, PIT.lz + rz, 0), eF = L3(0.5, PIT.lz + rz, 0);
        eN.y = eF.y = top + 0.03;
        span(segs[i * 4], hand, deep ? eN : near);
        span(segs[i * 4 + 1], eN, deep ? near : null);
        span(segs[i * 4 + 2], sk, deep ? eF : far);
        span(segs[i * 4 + 3], eF, deep ? far : null);
      });
      return false;
    });

    // ================================================================ the service
    // 1. high over the cemetery, drifting down through the drizzle; the bell
    const mid = V(pc.x, top, pc.z);
    S.establish(mid, { yaw: yawL(0.8, 0.6), dist: 10, high: 6.4, drop: 3.2, drift: 0.42, dur: 9, fov: 48, lookUp: 0.6 });
    S.fade(0, 2.8);
    S.sfx('funeral_bell', { volume: 0.8 });
    await S.wait(4.2);
    S.sfx('funeral_bell', { volume: 0.6 });
    await S.wait(3.2);
    // 2. low along the coffin lid: the axe, the toque, the headstone beyond
    const lidY = top + 0.1 + 0.62;
    await S.cam(XZ(at(0.22, 2.25), lidY + 0.5), XZ(at(-0.02, -0.7), lidY - 0.05), 0, 40, coffin.position, { creep: 0 });
    S.cam(XZ(at(0.14, 1.75), lidY + 0.36), XZ(at(-0.02, -0.7), lidY - 0.02), 6.5, 38, coffin.position, { ease: 'glide' });
    await S.wait(1.2);
    await S.narrate('They laid Hank to rest on a grey October afternoon.');
    // 3. Father Gilles
    await S.faceShot(Pa, { dist: 2.3, side: 0.8, dur: 0, fov: 38, creep: 0.07 });
    await S.say('ollie', 'Hank gave this valley a strong back... and a soft heart.', { actor: Pa, expr: 'sad', name: 'Father Gilles' });
    // 4. over Nana's shoulder, across the coffin
    await S.ots(N, Pa, { side: -1, back: 0.85, up: 0.16, fov: 40 });
    await S.say('ollie', 'Rest easy now, Hank. Lord knows you were good at it.', { actor: Pa, expr: 'happy', name: 'Father Gilles' });
    // 5. a slow push in on Nana
    await S.faceShot(N, { dist: 2.6, side: 0.55, dur: 0, fov: 40, creep: 0 });
    S.push(0.32, 7);
    await S.wait(1.4);
    await S.say('grandma', 'He waved at my porch every morning. Every single one.', { actor: N, expr: 'sad' });
    // 6. Big Lou
    Lou.play('cry', 'cry');
    await S.closeUp(Lou, { side: -0.4, creep: 0.05 });
    await S.wait(0.6);
    await S.say('lou', 'Save me a pickle sandwich, buddy.', { actor: Lou, expr: 'cry' });
    // 7. from the dead tree a crow watches them (meanwhile the planks come out and the
    // pallbearers take up the ropes)
    Lou.play('lower', 'sad');
    Gus.play('lower', 'sad');
    for (const p of planks) p.visible = false;
    ropesOn = true;
    if (crow) {
      const cw = V(crow.x, crow.y, crow.z);
      const d = V(cw.x - pc.x, 0, cw.z - pc.z).normalize();
      const sd = V(-d.z, 0, d.x);
      const cp = cw.clone().addScaledVector(d, 1.15).addScaledVector(sd, 0.42);
      cp.y += 0.32;
      await S.cam(cp, V(pc.x, top + 0.7, pc.z), 0, 30, V(pc.x, top + 0.7, pc.z), { creep: 0.05 });
      await S.wait(0.9);
      caw(0.7);
      await S.wait(1.7);
      caw(0.5);
      await S.wait(1.3);
    }
    // 8. the coffin goes down
    who.doug.play('salute');
    const lowerCam = (lx, lz, h) => XZ(at(lx, lz), top + h);
    await S.cam(lowerCam(3.7, -0.5, 2.5), lowerCam(-0.6, 0.35, 0.3), 0, 46, coffin.position, { creep: 0 });
    S.cam(lowerCam(3.4, -1.25, 2.8), lowerCam(-0.6, 0.35, 0.1), 6, 46, coffin.position, { ease: 'glide' });
    S.sfx('funeral_bell', { volume: 0.55 });
    const cy0 = coffin.position.y, cy1 = top - 1.7 + 0.01;
    const lowering = S.anim(8.5, (k) => (coffin.position.y = cy0 + (cy1 - cy0) * smooth(k)));
    await S.wait(4.6);
    // looking straight down into the grave as it settles
    await S.cam(lowerCam(0.06, 0.8, 3.6), lowerCam(0, 0.3, -1.6), 0, 46, coffin.position, { creep: 0 });
    S.cam(lowerCam(0.04, 0.65, 3.0), lowerCam(0, 0.3, -1.6), 5, 46, coffin.position, { ease: 'glide' });
    await lowering;
    S.sfx('coffin_thud', { volume: 0.3 });
    await S.wait(0.8);
    ropesOn = false;
    Lou.play('mourn', 'sad');
    Gus.play('mourn', 'sad');
    who.doug.play('mourn');
    // 9. Nana lets a maple leaf fall in after him
    N.play('toss', 'cry');
    await S.cam(L3(0.95, 0.15, 1.05), L3(-0.15, 1.85, 0.75), 0, 40, N, { creep: 0.03 });
    await S.wait(1.4);
    {
      const h = N.arms.R.hand.getWorldPosition(V(0, 0, 0));
      const tgt = coffin.localToWorld(V(0.05, 0.62, 0.55));
      const q = g.effects.spawnLeaf(h.x, h.y - 0.05, h.z, { vx: (tgt.x - h.x) * 0.25, vy: -0.1, vz: (tgt.z - h.z) * 0.25, gravity: 0.9, life: 4.2, rest: 0, size: 0.4 });
      if (q) q.groundHit = false;
    }
    await S.wait(0.9);
    await S.cam(lowerCam(0.05, 0.8, 3.1), lowerCam(0, 0.3, -1.6), 0, 46, coffin.position, { creep: 0.04 });
    await S.wait(3.4);
    await S.fade(1, 1.8);

    // ================================================================ afterwards
    // the grave filled in and heaped with flowers; the drizzle easing off
    pitOpen = false;
    for (const o of [pit, hole, coffin, ...stakes]) o.visible = false;
    S.prop(LORE.graveMound({}), gr.x, gr.z, { yaw: GRAVE_YAW, y: y0 - 0.02 });
    const moundTop = (lx, lz) => {
      const dx = lx / 0.65, dz = lz / 1.15, r = dx * dx + dz * dz;
      return y0 - 0.045 + (Math.round((1 - Math.min(1, r)) * 6) + 1) * 0.05;
    };
    for (const [lx, lz, seed, yaw] of [[0.22, 0.3, 3, 0.5], [-0.2, 0.62, 1, -0.4], [0.05, -0.3, 4, 1.2]]) {
      const p = at(lx, lz);
      S.prop(LORE.bouquet({ seed }), p.x, p.z, { yaw: GRAVE_YAW + yaw, y: moundTop(lx, lz) + 0.05 });
    }
    A.hour = 16.9;
    for (const a of Object.values(who)) if (a.anim === 'lower' || a.anim === 'salute' || a.anim === 'toss' || a.anim === 'cry') a.play('mourn', 'sad');
    N.play('mourn', 'sad');
    // 10. one by one they go home; Nana stays
    const EXIT = [[-3.4, -1.2], [-7.4, -5.5], [-10.2, -7.4], [-15.0, -9.4]];
    const leave = (a, via = []) => {
      const pts = [...via, ...EXIT].map(([lx, lz]) => { const p = at(lx, lz); return [p.x, p.z]; });
      const umb = a.anim === 'brolly';
      a.walkTo(pts, 1.1, umb ? 'walk+brolly' : 'walk').then(() => (a.visible = false));
      a.setExpr('sad');
    };
    await S.cam(L3(3.6, 3.6, 4.3), L3(-5, -3.5, 0.2), 0, 42, N, { creep: 0.03 });
    S.fade(0, 1.6);
    await S.wait(1.2);
    leave(who.ollie);
    await S.wait(1.3);
    who.doug.react('nod');
    await S.wait(0.5);
    leave(who.doug);
    await S.wait(1.2);
    leave(who.agnes);
    await S.wait(1.1);
    leave(who.pop);
    await S.wait(0.4);
    leave(who.pip);
    await S.wait(1.2);
    leave(who.birdie, [[0.6, 3.6]]);
    await S.wait(1.0);
    leave(who.ingrid, [[0.6, 3.6]]);
    await S.wait(1.4);
    // Lou and Gus last, with Marie
    turnTo(Lou, -0.1, 2.05);
    Lou.play('idle', 'sad');
    await S.ots(N, Lou, { side: 1, back: 0.8, up: 0.2, fov: 40 });
    await S.say('lou', 'Come on, Nana. You\'ll catch cold out here.', { actor: Lou, expr: 'sad' });
    turnTo(N, -1.1, -0.25);
    await S.closeUp(N, { side: 0.45, creep: 0.04 });
    await S.say('grandma', 'In a minute, dear. You go on ahead.', { actor: N, expr: 'sad' });
    Lou.react('nod');
    leave(Gus);
    await S.wait(0.6);
    leave(Lou);
    await S.wait(0.6);
    leave(who.marie, [[0.6, 3.6]]);
    leave(Pa, [[-1.6, -1.9]]);
    // Nana alone, small, as the others reach the gate
    await S.cam(L3(4.6, -1.6, 2.6), L3(-1.2, 0.6, 0.7), 0, 42, N, { creep: 0.03 });
    turnTo(N, 0, 0);
    A.setWeather('clear');
    await S.wait(5);

    // ================================================================ the cocoa
    // the rain stops; the low sun finds a way through
    const h1 = A.hour;
    S.anim(30, (k) => (A.hour = h1 + k * 0.75));
    leafRate = 5;
    for (const a of Object.values(who)) if (a !== N) a.visible = false;
    N.play('cradle', 'sad');
    S.every(() => {
      const m = N.held.R;
      if (m && N.visible && Math.random() < 0.3) { const p = m.getWorldPosition(V(0, 0, 0)); p.y += 0.16; steam(p, 0.8); }
      return false;
    });
    await S.faceShot(N, { dist: 2.0, side: -0.55, dur: 0, fov: 38, creep: 0.06 });
    await S.wait(0.8);
    await S.say('grandma', 'I brought your cocoa, dear. Extra marshmallows.', { actor: N, expr: 'sad' });
    // round the mound to the headstone, down on one knee, the mug set on the ground
    const kneelAt = [-0.98, -0.72];
    const walk = N.walkTo([at(-1.05, 1.45), at(...kneelAt)].map((p) => [p.x, p.z]), 0.7, 'walk+cradle');
    await S.cam(L3(1.6, -0.2, 1.3), L3(-0.8, 0.4, 0.6), 0, 42, N, { creep: 0.02 });
    await Promise.race([walk, S.wait(9)]);
    turnTo(N, -0.4, -0.78);
    N.play('kneelPlace', 'sad');
    const MUG = FOOD.cocoaClassic(), MS = 1.25;
    const mugAt = at(-0.52, -0.76);
    const mugY = gy(mugAt.x, mugAt.z) - 0.005;
    // low by the headstone, the mug about to come into frame
    await S.cam(XZ(at(-0.2, 0.15), moundTop(-0.2, 0.15) + 0.28), V(mugAt.x, mugY + 0.12, mugAt.z), 0, 40, V(mugAt.x, mugY + 0.1, mugAt.z), { creep: 0.04 });
    await S.wait(1.2);
    const from = N.held.R ? N.held.R.getWorldPosition(V(0, 0, 0)) : V(mugAt.x, mugY + 0.3, mugAt.z);
    N.play('kneel', 'sad');
    const mug = S.prop(MUG, from.x, from.z, { yaw: GRAVE_YAW + 2.4, scale: MS, y: from.y });
    await S.anim(0.5, (k) => {
      const e = smooth(k);
      mug.position.set(from.x + (mugAt.x - from.x) * e, from.y + (mugY - from.y) * e, from.z + (mugAt.z - from.z) * e);
    });
    const sp = MUG.meta.steam[0];
    const mugTop = V(mugAt.x, mugY + sp.y * MS + 0.01, mugAt.z);
    S.every(() => { if (Math.random() < 0.4) steam(mugTop, 1); return false; });
    await S.wait(1.6);
    await S.say('grandma', 'There. Still hot, just how you like it.', { actor: N, expr: 'happy' });
    N.play('mourn', 'sad');
    await S.wait(1.0);
    await S.faceShot(N, { dist: 1.9, side: 0.45, dur: 0, fov: 36, creep: 0.06 });
    await S.say('grandma', 'Goodnight, Hank.', { actor: N, expr: 'sad', speed: 18 });
    // she goes, into the low sun
    N.walkTo([at(-1.1, -1.6), ...EXIT.map(([lx, lz]) => at(lx, lz))].map((p) => [p.x, p.z]), 0.75, 'walk').then(() => (N.visible = false));
    await S.cam(L3(1.3, 1.7, 1.25), L3(-3.2, -1.6, 0.8), 0, 44, N, { creep: 0.03 });
    await S.wait(5.5);

    // ================================================================ the crow
    if (crow) {
      const cw = V(crow.x, crow.y, crow.z);
      const d = V(pc.x - cw.x, 0, pc.z - cw.z).normalize();
      const sd = V(-d.z, 0, d.x);
      await S.cam(cw.clone().addScaledVector(d, 1.5).addScaledVector(sd, -0.5).add(V(0, -1.25, 0)), cw.clone().add(V(0, 0.2, 0)), 0, 34, cw, { creep: 0.04 });
      crow.yaw = Math.atan2(d.x, d.z) + 0.6;
      await S.wait(1.0);
      crow.yaw = Math.atan2(d.x, d.z);
      await S.wait(0.7);
      // a glint of violet in its eye...
      const eye = cw.clone().addScaledVector(d, 0.2).add(V(0, 0.3, 0));
      g.effects.ps.spawn({ x: eye.x, y: eye.y, z: eye.z, life: 0.7, size: 0.2, size1: 0.05, sprite: P.star, color: [0.72, 0.58, 1], emissive: 1, alpha: 1 });
      S.sfx('magic', { volume: 0.12, pitch: 1.8 });
      await S.wait(0.9);
      caw(0.7);
      await S.wait(0.5);
      // ...and it's off
      crow.anim = 'fly';
      crow.air = true;
      const v = V(-d.x * 2.6 + sd.x * 1.2, 1.8, -d.z * 2.6 + sd.z * 1.2);
      crow.yaw = Math.atan2(v.x, v.z);
      let ft = 0;
      S.every((dt) => {
        ft += dt;
        crow.x += v.x * dt; crow.y += v.y * dt; crow.z += v.z * dt;
        if (ft > 6) { crow.hidden = true; return true; }
        return false;
      });
      await S.wait(1.8);
    }

    // ================================================================ the last shot
    // close on the mug steaming in front of his name, then up and away over the grave
    leafRate = 4;
    S.crane(V(mugAt.x, mugY, mugAt.z), { yaw: yawL(0.25, 1), dist: 0.8, low: 0.42, high: 5.2, back: 4.2, dur: 13, fov: 40, lookUp: 0.3 });
    await S.wait(9.5);
    S.sfx('big_snore', { volume: 0.18, pitch: 0.9 });
    await S.wait(2.5);
    await S.fade(1, 3);
  });
}

// ---------------------------------------------------------------- 3. years go by
function yearsPass(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    const gr = POI.grave;
    const y0 = g.physics.groundAt(gr.x, gr.z).h;
    const st = graveAt(0, -1.12);
    S.prop(LORE.hankStone(), st.x, st.z, { yaw: GRAVE_YAW, scale: 1.05 });
    let mound = S.prop(LORE.graveMound({}), gr.x, gr.z, { yaw: GRAVE_YAW, y: y0 - 0.02 });
    const swap = (opts) => {
      mound.parent.remove(mound);
      mound = S.prop(LORE.graveMound(opts), gr.x, gr.z, { yaw: GRAVE_YAW, y: y0 - 0.02 });
    };
    const cp = graveAt(1.6, 3.4);
    await S.cam(V(cp.x, y0 + 1.5, cp.z), V(gr.x, y0 + 0.45, gr.z), 0, 42);
    const zp = graveAt(1.0, 0.6);
    const zz = () => S.emote('zzz', V(zp.x, y0 + 0.75, zp.z), 2.2);
    // night falls on the fresh grave
    A.hour = 21.5;
    A.setWeather('clear', true);
    S.music('night');
    await S.fade(0, 1.2);
    zz();
    S.sfx('big_snore', { volume: 0.5 });
    await S.narrate('Hank slept through his whole funeral.');
    // winter
    await S.fade(1, 0.6);
    A.hour = 13;
    A.setWeather('snow', true);
    A.cold = 0.5;
    swap({ snow: true });
    await S.fade(0, 0.6);
    zz();
    S.sfx('big_snore', { volume: 0.5 });
    await S.narrate('He slept through the first snow...');
    // spring
    await S.fade(1, 0.6);
    A.hour = 9.5;
    A.setWeather('clear', true);
    A.cold = 0;
    swap({ flowers: true });
    await S.fade(0, 0.6);
    zz();
    S.sfx('chirp');
    await S.narrate('...right through the spring thaw...');
    // autumn again, and again
    await S.fade(1, 0.6);
    A.hour = 16.5;
    A.setWeather('breezy', true);
    swap({});
    await S.fade(0, 0.6);
    for (let k = 0; k < 14; k++) g.effects.spawnLeaf(gr.x + (Math.random() - 0.5) * 4, y0 + 3, gr.z + (Math.random() - 0.5) * 4, {});
    zz();
    await S.narrate('...and quite a few autumns after that.');
    await S.narrate('So long that... *things happened.*');
    await S.fade(1, 1.0);
  });
}

// ---------------------------------------------------------------- 4. the Reaper notices
function revival(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    A.hour = 23.6;
    A.setWeather('misty', true);
    A.cold = 0.6;
    S.music('spooky');
    const gr = POI.grave;
    const gy = g.physics.groundAt(gr.x, gr.z).h;
    const st = graveAt(0, -1.12);
    S.prop(LORE.hankStone(), st.x, st.z, { yaw: GRAVE_YAW, scale: 1.05 });
    const mound = S.prop(LORE.graveMound({}), gr.x, gr.z, { yaw: GRAVE_YAW, y: gy - 0.02 });
    await S.cam(V(gr.x + 4, gy + 1.4, gr.z + 6), V(gr.x, gy + 0.3, gr.z), 0, 45);
    S.cam(V(gr.x + 5.5, gy + 2.0, gr.z + 4.4), V(gr.x, gy + 0.6, gr.z), 6, 47, null, { ease: 'glide' });
    await S.fade(0, 2.2);
    // snoring from under the dirt
    S.emote('zzz', V(gr.x, gy + 0.9, gr.z), 6);
    S.sfx('big_snore', { volume: 0.6 });
    await S.wait(1.6);
    S.sfx('snore');
    await S.cam(V(gr.x + 6.5, gy + 2.4, gr.z + 3.5), V(gr.x, gy + 1.2, gr.z), 2.5, 50);
    // the Grim Reaper arrives, clipboard in hand
    const R = S.actor('reaper', gr.x + 2.6, gr.z + 1.6, -2.2, 'clipboard');
    R.groundSnap = true;
    R.floatY = 0.25;
    R.bb.fade = 1;
    const glow = g.lightPool.addDynamic({ pos: R.pos.clone().add(V(0.6, 1.6, 0.8)), color: [0.55, 0.45, 1.0], radius: 7, intensity: 1.3 });
    S.temp.push({ remove: () => g.lightPool.removeDynamic(glow) });
    R.faceTowards(gr.x + 6.5, gr.z + 4.8);
    S.sfx('reaper');
    g.effects.magic(R.pos.x, R.pos.y + 1, R.pos.z, 18, [0.5, 0.4, 0.8]);
    g.effects.poof?.(R.pos.x, R.pos.y + 0.6, R.pos.z, { scale: 1.6, color: [0.32, 0.26, 0.42], count: 8 });
    for (let k = 0; k <= 10; k++) {
      R.bb.fade = 1 - k / 10;
      await S.wait(0.06);
    }
    R.bb.fade = 0;
    // looming over the grave: low, tilted
    await S.low(R, { dist: 2.7, side: 0.9, h: 0.35, fov: 44, dur: 1.2, roll: -0.08 });
    await S.say('reaper', 'Right then. Next on the list...', { actor: R });
    await S.say('reaper', 'Hank. Lumberjack. Cause of departure... a *nap?*', { actor: R, expr: 'surprised' });
    R.play('facepalm');
    S.sfx('dramatic_sting', { volume: 0.6 });
    await S.closeUp(R, { side: 0.4, roll: 0.1 });
    await S.say('reaper', 'Oh no. Oh no no no no.', { actor: R, expr: 'shock' });
    await S.say('reaper', 'He was never dead! Just *asleep!* For years!', { actor: R, expr: 'sheepish' });
    R.play('float');
    await S.say('reaper', "Awkward. I can't give your old body back...", { actor: R, expr: 'sheepish' });
    await S.say('reaper', '...but I can do the next best thing!', { actor: R, expr: 'happy' });
    R.play('point');
    S.sfx('magic');
    for (let k = 0; k < 4; k++) {
      g.effects.magic(gr.x, gy + 0.3 + k * 0.2, gr.z, 16);
      await S.wait(0.25);
    }
    g.pipeline.post.uFlash.value = 0.9;
    g.tween(g.pipeline.post.uFlash, 'value', 0, 0.8);
    g.chase.shake(1);
    // a hand bursts out of the dirt... then the rest of Hank
    S.sfx('dirt');
    g.effects.dirtBurst(gr.x, gy + 0.2, gr.z, 40);
    g.effects.poof?.(gr.x, gy + 0.3, gr.z, { scale: 1.4, color: [0.5, 0.38, 0.28], count: 8 });
    mound.visible = false;
    const H = S.actor('hankBuried', gr.x, gr.z, 0.6, 'crawl');
    H.yOffset = -0.9;
    await S.faceShot(H, { dist: 2.6, side: 0.9, up: 0.5, lookDown: 0.5, fov: 42 });
    for (let k = 0; k < 12; k++) {
      H.yOffset = -0.9 + (k / 12) * 0.9;
      if (k % 3 === 0) { S.sfx('dirt'); g.effects.dirtBurst(gr.x, gy + 0.1, gr.z, 6); }
      await S.wait(0.12);
    }
    H.yOffset = 0;
    H.play('shiver', 'scared');
    H.bounce(0.6);
    g.effects.frost(H.pos.x, H.pos.y, H.pos.z, 14);
    S.sfx('brrr');
    await S.faceShot(H, { dist: 2.4, side: 0.8, dur: 0.6 });
    await S.say('hankBuried', 'B-b-brrr... did I sleep in?', { actor: H, expr: 'scared' });
    H.react('headpop');
    // a crash zoom
    await S.push(0.38, 0.22, null, { ease: 'out', roll: 0.05 });
    await S.say('hankBuried', 'And why... am I... *all bones?!*', { actor: H, expr: 'shock' });
    R.play('clipboard');
    await S.faceShot(R, { dist: 2.6, side: -0.9, fov: 42 });
    await S.say('reaper', 'Side effects: chills, rattling, being *technically dead.*', { actor: R, expr: 'sheepish' });
    R.play('float');
    await S.say('reaper', 'Have a wonderful afterlife! Toodles!', { actor: R, expr: 'happy' });
    S.sfx('whoosh');
    g.effects.poof?.(R.pos.x, R.pos.y + 1, R.pos.z, { scale: 2, color: [0.3, 0.26, 0.36], count: 12 });
    for (let k = 0; k < 14; k++) g.effects.ps.spawn({ x: R.pos.x + (Math.random() - 0.5), y: R.pos.y + Math.random() * 2, z: R.pos.z + (Math.random() - 0.5), vy: 0.6, life: 1.6, size: 0.6, size1: 1.6, sprite: P.smoke, color: [0.3, 0.26, 0.36], drag: 1, alpha: 0.85 });
    for (let k = 0; k <= 8; k++) {
      R.bb.fade = k / 8;
      await S.wait(0.05);
    }
    R.visible = false;
    g.lightPool.removeDynamic(glow);
    await S.faceShot(H, { dist: 2.2, side: -0.8 });
    H.faceTowards(R.pos.x, R.pos.z);
    await S.say('hankBuried', '...Toodles?', { actor: H, expr: 'sad' });
    await S.fade(1, 0.8);
  });
}

// ---------------------------------------------------------------- 5. a lantern in the woods
function nanaFindsHank(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    A.hour = 23.7;
    A.setWeather('misty', true);
    A.cold = 0.6;
    S.music('night');
    const T = (x, z, up = 0) => V(x, g.physics.groundAt(x, z).h + up, z);
    const H = S.actor('hankBuried', -210.4, -25.2, 0.6, 'shiver');
    H.walkTo([[-208.4, -19.5], [-206.6, -13.6]], 0.85, 'walk+shiver');
    await S.cam(T(-203.2, -8.6, 2.3), T(-208.0, -18.5, 0.7), 0, 46);
    S.fade(0, 1.2);
    await S.narrate('Cold. So cold. Hank stumbled through the dark woods...');
    // a warm lantern bobbing up the trail
    const N = S.actor('grandma', -199.8, 6.5, Math.PI + 0.36, 'walk+lantern');
    const lamp = g.lightPool.addDynamic({ pos: N.pos.clone(), color: [1.0, 0.7, 0.35], radius: 9, intensity: 1.4 });
    S.temp.push({ remove: () => g.lightPool.removeDynamic(lamp) });
    N.onTick = () => {
      lamp.pos.set(N.pos.x + 0.3, N.pos.y + 1.0, N.pos.z);
      g.effects.ps.spawn({ x: N.pos.x + 0.3, y: N.pos.y + 0.75, z: N.pos.z, life: 0.12, size: 0.55, sprite: P.glow, color: [1, 0.72, 0.35], emissive: 1, alpha: 0.5 });
    };
    story.followers = [N];
    const walk = N.walkTo([[-202.6, -2.0], [-205.3, -9.4]], 1.15, 'walk+lantern');
    await S.cam(T(-208.2, -17.6, 2.0), T(-203.6, -4.0, 1.0), 2.0, 44);
    await S.say('grandma', 'Hello? Who is out there?', { actor: N, expr: 'surprised' });
    await walk;
    if (H.path) { H.path = null; H.pos.copy(T(-206.6, -13.6)); }
    N.play('lantern');
    N.faceTowards(H.pos.x, H.pos.z);
    H.faceTowards(N.pos.x, N.pos.z);
    const mid = H.pos.clone().lerp(N.pos, 0.5);
    await S.cam(V(mid.x - 0.34 * 6.4 + 0.94 * 1.4, mid.y + 3.1, mid.z - 0.94 * 6.4 - 0.34 * 1.4), V(mid.x, mid.y + 0.45, mid.z), 1.2, 42);
    N.jump(2.5);
    S.sfx('scream', { volume: 0.4, pitch: 1.4 });
    await S.say('grandma', 'Goodness gracious!', { actor: N, expr: 'shock' });
    await S.say('grandma', "You're frozen to the bone, dear! ...You ARE the bone.", { actor: N, expr: 'sad' });
    await S.say('hankBuried', "I'm Hank. The lumberjack? A little dead?", { actor: H, expr: 'sheepish' });
    await S.faceShot(N, { dist: 2.2, side: -0.7 });
    await S.say('grandma', "*Our* Hank? I *knew* that snoring wasn't the wind.", { actor: N, expr: 'surprised' });
    await S.say('grandma', 'Dead or not, nobody freezes on my watch.', { actor: N, expr: 'smug' });
    await S.say('grandma', "Come along. There's a fire, and *famous* hot cocoa.", { actor: N, expr: 'happy' });
    await S.fade(1, 1.4);
    story.followers = [];
    story.flag('intro', true);
  });
}
