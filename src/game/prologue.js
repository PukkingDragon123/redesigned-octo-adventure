// The prologue, fully staged in 3D: Hank the lumberjack fells one last maple,
// lies down for "a quick nap", is declared dead, gets a lovely funeral (which he
// snores through), sleeps for years... and then the Reaper notices the mistake.
import * as THREE from 'three';
import { POI } from '../world/layout.js';
import { P } from '../render/particles.js';
import { buildTree } from '../voxel/models/trees.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as PR from '../voxel/models/props.js';
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
    const tres = buildTree('maple', { seed: 5, lod: 0 });
    const tgeo = meshVox(tres.vox, { size: tres.size, origin: tres.origin, greedy: true });
    const tree = voxMesh(tgeo, sharedVoxelMaterial());
    const TS = 0.9;
    tree.scale.setScalar(TS);
    pivot.add(tree);
    S.temp.push({ remove: () => { g.scene.remove(pivot); tgeo.dispose(); } });
    const trunkR = (tres.meta?.trunkR ?? 0.35) * TS;
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
    await S.narrate('This is Hank. Hank was a lumberjack. A good one, mostly.');
    await shotAt(H.pos, 0.7, 2.0, 1.55, H.pos, 1.35, 1.2, 40);
    await S.say('hank', 'Hup! ...Hup! ...HUP!', { actor: H, expr: 'determined', name: 'Hank' });
    await shotAt(L.pos, 2.2, 1.6, 1.8, L.pos, 1.5, 1.0, 42);
    L.play('idle', 'happy');
    await S.say('lou', "Atta boy, Hank! That's the biggest maple on the whole ridge!", { actor: L, expr: 'happy' });
    await shotAt(H.pos, 1.0, 1.7, 1.45, H.pos, 1.4, 1.0, 38);
    await S.say('hank', "She's a stubborn one, Lou. Like my Aunt Bev. ...One more ought to do it.", { actor: H, expr: 'smug', name: 'Hank' });
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
      pivot.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, -(Math.PI / 2) * 0.97 * easeIn(k)));
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
    await shotAt(H.pos, 0.2, 2.1, 1.5, H.pos, 1.3, 0.8, 38);
    await S.say('hank', "Ha! Still got it.", { actor: H, expr: 'happy', name: 'Hank' });
    L.play('cheer', 'laugh');
    await S.say('lou', "Legend! I'll go grab us some lunch. Back in ten — don't go anywhere!", { actor: L, expr: 'laugh' });
    L.play('idle');
    const exit1 = at(-7, -6), exit2 = at(-15, -12);
    const loGone = L.walkTo([[exit1.x, exit1.z], [exit2.x, exit2.z]], 2.2);
    H.play('yawn', 'sleepy');
    S.sfx('snore', { volume: 0.4, pitch: 1.2 });
    await S.say('hank', "Where would I go? ...Phew. I'll just rest my eyes for one minute.", { actor: H, expr: 'sleepy', name: 'Hank' });
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
    await S.narrate('Hank could sleep. Anywhere. Any time. For a ~very, very~ long time.');
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
    await S.say('lou', 'Hank! I got the good sandwiches! The ones with the pickles!', { actor: L, expr: 'happy' });
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
    await S.say('ingrid', 'No pulse that I can find. Not breathing. Cold as a January lake.', { actor: I, expr: 'worried' });
    zz();
    S.sfx('big_snore');
    I.react('flinch');
    await S.wait(1.2);
    await S.say('ingrid', "...That noise is just, um. Air leaving the body. It happens. I'm so sorry, Lou.", { actor: I, expr: 'sheepish' });
    L.play('cry', 'cry');
    await shotAt(L.pos, -1.2, 2.2, 1.7, L.pos, 1.5, 0.8, 40);
    await S.say('lou', "He was the best lumberjack in Maple Cove! And he never even got his sandwich!", { actor: L, expr: 'cry' });
    await S.fade(1, 1.4);
  });
}

// ---------------------------------------------------------------- 2. the funeral
function funeral(story) {
  const g = story.g;
  return story.scene(async (S) => {
    const A = g.world.atmosphere;
    g.setBikeVisible(false);
    A.hour = 10.8;
    A.setWeather('rain', true);
    A.cold = 0.15;
    S.music('rain');
    const gr = POI.grave;
    const gy = (x, z) => g.physics.groundAt(x, z).h;
    const y0 = gy(gr.x, gr.z);
    const at = (lx, lz) => graveAt(lx, lz);
    const face = (a) => { a.faceTowards(gr.x, gr.z); a.yaw = a.targetYaw; return a; };
    // the coffin rests over the open grave on two planks
    const cpos = at(0, 0);
    const coffin = S.prop(LORE.coffin(), cpos.x, cpos.z, { yaw: GRAVE_YAW, y: y0 + 0.12 });
    const lidHinge = new THREE.Group();
    coffin.add(lidHinge);
    lidHinge.position.set(0, 0.45, -1.0);
    const lidGeo = (() => { const r = LORE.coffin({ part: 'lid' }); return meshVox(r.vox, { size: r.size, origin: r.origin, greedy: true }); })();
    const lid = voxMesh(lidGeo, sharedVoxelMaterial());
    lidHinge.add(lid);
    S.temp.push({ remove: () => lidGeo.dispose() });
    const wr = at(-1.6, -1.8);
    S.prop(LORE.wreath(), wr.x, wr.z, { yaw: GRAVE_YAW });
    const st = at(0, -1.12);
    S.prop(LORE.hankStone(), st.x, st.z, { yaw: GRAVE_YAW, scale: 1.05 });

    // everyone came
    const cast = [
      ['pastor', 1.7, -1.5, 'preach'], ['lou', 0.1, 2.7, 'cry'], ['grandma', -1.25, 2.95, 'brolly'], ['marie', 1.35, 2.9, 'brolly'],
      ['doug', -2.35, 1.5, 'salute'], ['ingrid', 2.45, 1.25, 'mourn'], ['gus', -2.55, 0.1, 'idle'], ['pip', 0.75, 3.85, 'sad'],
      ['pop', -0.55, 3.9, 'sad'], ['agnes', 2.6, -0.1, 'mourn'], ['birdie', -1.95, 3.9, 'brolly'], ['ollie', 2.05, 3.85, 'mourn'],
    ];
    const who = {};
    for (const [id, lx, lz, anim] of cast) {
      const p = at(lx, lz);
      who[id] = face(S.actor(id, p.x, p.z, 0, anim));
      if (id === 'pastor') who[id].faceTowards(at(0, 1).x, at(0, 1).z);
    }
    const N = who.grandma, Lou = who.lou, Pa = who.pastor;

    const wide = at(7.8, 4.2);
    await S.cam(V(wide.x, y0 + 6.5, wide.z), V(gr.x, y0 + 0.6, gr.z), 0, 46);
    const wide2 = at(5.8, -0.6);
    S.cam(V(wide2.x, y0 + 2.3, wide2.z), V(gr.x, y0 + 0.9, gr.z + 0), 6, 46);
    S.fade(0, 2.2);
    S.sfx('funeral_bell');
    await S.wait(1.6);
    await S.narrate('The whole village came out to say goodbye.');
    S.sfx('funeral_bell', { volume: 0.7 });
    await S.faceShot(Pa, { dist: 2.4, side: -0.9, dur: 1.0 });
    await S.say('ollie', 'Dearly beloved. We are gathered here to say farewell to Hank: lumberjack, neighbour... and champion napper.', { actor: Pa, expr: 'sad', name: 'Father Gilles' });
    await S.faceShot(Lou, { dist: 2.4, side: 0.8 });
    await S.say('lou', 'He could drop a pine in three swings... *sniff* ...and he always shared his pickles... *HONNNK*', { actor: Lou, expr: 'cry' });
    const G2 = who.gus;
    await S.faceShot(G2, { dist: 2.2, side: 0.9, dur: 0.7 });
    await S.say('gus', 'He still owes me five bucks.', { actor: G2, expr: 'grumpy' });
    who.marie.react('angry');
    await S.say('marie', '*Gus!*', { actor: who.marie, expr: 'angry' });
    const kids = who.pip;
    await S.faceShot(kids, { dist: 2.4, side: -0.7, dur: 0.7, fov: 44 });
    await S.say('pip', 'Can I have his axe?', { actor: kids, expr: 'happy' });
    await S.say('pip', 'Can I have his BEARD?', { actor: who.pop, expr: 'happy', name: 'Pop' });
    await S.faceShot(N, { dist: 2.2, side: -0.7 });
    await S.say('grandma', "Children... Hush. He waved at my porch every single morning on his way into the woods. Every single morning.", { actor: N, expr: 'sad' });
    who.doug.react('nod');
    await S.say('doug', 'Hank. You were a credit to the forest.', { actor: who.doug, expr: 'sad' });

    // ...and from inside the coffin: snoring
    const cc = at(0.9, 1.6);
    await S.cam(V(cc.x, y0 + 1.0, cc.z), V(cpos.x, y0 + 0.4, cpos.z), 0.9, 40);
    S.sfx('big_snore', { volume: 0.55 });
    S.emote('zzz', V(cpos.x, y0 + 0.9, cpos.z), 2.4);
    await S.wait(1.4);
    await S.narrate('Everyone cried. Hank snored.');
    // lowered on ropes
    await S.cam(V(wide2.x, y0 + 2.6, wide2.z), V(gr.x, y0 + 0.2, gr.z), 0.8, 46);
    Lou.play('lower', 'sad');
    who.gus.play('lower', 'sad');
    const cy0 = coffin.position.y;
    await S.anim(3.2, (k) => (coffin.position.y = cy0 - smooth(k) * 1.6));
    S.sfx('coffin_thud');
    coffin.visible = false;
    // shovels of dirt, then the mound
    Lou.play('dig', 'sad');
    for (let k = 0; k < 3; k++) {
      S.sfx('shovel_dirt');
      g.effects.dirtBurst(gr.x, y0 + 0.3, gr.z, 18);
      await S.wait(0.7);
    }
    S.prop(LORE.graveMound({}), gr.x, gr.z, { yaw: GRAVE_YAW, y: y0 - 0.02 });
    const bq = at(0.3, 0.4);
    S.prop(LORE.bouquet({ seed: 3 }), bq.x, bq.z, { yaw: GRAVE_YAW + 0.5, y: y0 + 0.28 });
    for (const a of Object.values(who)) if (a !== Lou) a.play('mourn');
    await S.faceShot(Lou, { dist: 2.2, side: 0.7, dur: 1.0 });
    Lou.play('mourn', 'cry');
    await S.say('lou', 'Sleep tight, buddy.', { actor: Lou, expr: 'cry' });
    S.sfx('funeral_bell', { volume: 0.8 });
    await S.fade(1, 1.6);
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
    const zz = () => S.emote('zzz', V(gr.x, y0 + 0.7, gr.z), 2.2);
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
    await S.narrate('In fact, Hank slept for so long that, well... *things happened.*');
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
    S.cam(V(gr.x + 5.5, gy + 2.0, gr.z + 4.4), V(gr.x, gy + 0.6, gr.z), 6, 47);
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
    await S.faceShot(R, { dist: 2.8, side: 1.0, dur: 1.2 });
    await S.say('reaper', 'Right then. Next on the list...', { actor: R });
    await S.say('reaper', 'Hank. Lumberjack. Cause of departure... a *nap?*', { actor: R, expr: 'surprised' });
    R.play('facepalm');
    S.sfx('dramatic_sting', { volume: 0.6 });
    await S.say('reaper', 'Oh no. Oh no no no no.', { actor: R, expr: 'shock' });
    await S.say('reaper', "He was never dead! He was *asleep!* For... *checks notes*... quite a few years! Somebody in Accounting is getting a very stern memo.", { actor: R, expr: 'sheepish' });
    R.play('float');
    await S.say('reaper', "Ahem. Well. This is awkward. I can't exactly give you your old body back...", { actor: R, expr: 'sheepish' });
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
    await S.say('hankBuried', 'B-b-brrr... wh-why is it so c-c-cold? Did I sleep in?', { actor: H, expr: 'scared' });
    H.react('headpop');
    await S.say('hankBuried', 'And why... am I... *all bones?!*', { actor: H, expr: 'shock' });
    R.play('clipboard');
    await S.faceShot(R, { dist: 2.6, side: -0.9, fov: 42 });
    await S.say('reaper', 'Side effects may include: chills, rattling, a slight lack of skin, and being *technically dead.*', { actor: R, expr: 'sheepish' });
    R.play('float');
    await S.say('reaper', "But hey, you're up! Have a wonderful afterlife! Toodles!", { actor: R, expr: 'happy' });
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
    await S.narrate('Cold. So very cold. Hank stumbled through the dark woods for what felt like hours...');
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
    await S.say('grandma', 'Hello? Is someone out there? I heard the most dreadful racket from the cemetery!', { actor: N, expr: 'surprised' });
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
    await S.say('grandma', "You're frozen to the bone, dear! Well. You ARE the bone, dear.", { actor: N, expr: 'sad' });
    await S.say('hankBuried', "I think I might be... dead? A little? I'm Hank. The lumberjack?", { actor: H, expr: 'sheepish' });
    await S.faceShot(N, { dist: 2.2, side: -0.7 });
    await S.say('grandma', "Hank? *Our* Hank? From the funeral? Oh, you poor dear. I *knew* that snoring wasn't the wind.", { actor: N, expr: 'surprised' });
    await S.say('grandma', "Dead or not, nobody freezes on my watch. I was married to a hunter for fifty years. I've seen worse things come out of these woods.", { actor: N, expr: 'smug' });
    await S.say('grandma', "Come along now. There's a fire going, and I make a *famous* hot cocoa.", { actor: N, expr: 'happy' });
    await S.fade(1, 1.4);
    story.followers = [];
    story.flag('intro', true);
  });
}
