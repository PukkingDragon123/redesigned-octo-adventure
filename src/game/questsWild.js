// Backcountry quests and the four folk who live out there:
//   Ranger Rosie (Mont Écho's fire tower): a hot cocoa from Café du Rang, up the switchbacks
//     before it goes cold; then a race against Gérard the moose down the trail.
//   Gisèle (the cottage on Lac des Huards): her paddle drifted off to Moose Marsh.
//   Monsieur Tremblay (the orchard): eight windfall apples for the cider press.
//   Odile (Gare Sainte-Rose): Old Ollie's letter, and beating the old express down the rail trail.
// Quest state lives in the save with the others (Quests.q); quests.js hands the calls through.
import * as THREE from 'three';
import { VoxelCharacter, extendVChar } from './vchar.js';
import { CHARACTERS } from '../voxel/models/characters.js';
import * as L from '../world/layout.js';
import { roadSamples } from '../world/terrain.js';
import * as PR from '../voxel/models/props.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

// ---------------------------------------------------------------- the folk (specs like the villagers')
const FOLK_SPECS = {
  rosie: {
    name: 'Ranger Rosie', skin: 0xd8a274, head: { w: 11, h: 11, d: 10 }, torso: { w: 11, h: 12, d: 7 },
    arm: { len: 12, t: 3 }, leg: { len: 15, t: 3 },
    hair: { style: 'braid', color: 0xa0401c }, hat: { type: 'campaign', color: 0x5e6a3a, band: 0x3a2a1e },
    top: { type: 'shirt', color: 0x8a9a5a, accent: 0x4a5a2a }, legs: { color: 0x3e4a2c }, shoes: 0x3a2618, boots: true,
    eyes: 'bean', blush: true, voice: 'ingrid',
  },
  gisele: {
    name: 'Gisèle', skin: 0xf2c8a2, head: { w: 12, h: 11, d: 11, chub: 0.6 }, torso: { w: 12, h: 10, d: 9, belly: 1 },
    arm: { len: 10, t: 3 }, leg: { len: 8, t: 3 },
    hair: { style: 'bun', color: 0xc8c4c8 }, glasses: 'round',
    top: { type: 'cardigan', color: 0x2f7f7a, accent: 0xf2e6cc }, skirt: { color: 0x3a3a5a, len: 6 }, shoes: 0x5a3a2a,
    scarf: { color: 0xe8a02a, stripe: 0xc8361f }, eyes: 'lash', blush: true, voice: 'agnes',
  },
  odile: {
    name: 'Odile', skin: 0x9c6844, head: { w: 10, h: 11, d: 10 }, torso: { w: 10, h: 12, d: 7 },
    arm: { len: 13, t: 2 }, leg: { len: 15, t: 3 },
    hair: { style: 'bob', color: 0xd8d0c4 }, hat: { type: 'captain', color: 0x24346a, band: 0xdcae44 },
    top: { type: 'coat', color: 0x24346a, accent: 0xdcae44 }, legs: { color: 0x1e2244 }, shoes: 0x1e1418,
    eyes: 'lash', voice: 'marie',
  },
  tremblay: {
    name: 'Monsieur Tremblay', skin: 0xf4c2a6, head: { w: 12, h: 11, d: 11 }, torso: { w: 15, h: 11, d: 10, belly: 2 },
    arm: { len: 11, t: 4 }, leg: { len: 10, t: 4 },
    hair: { style: 'short', color: 0x9a9894 }, beard: { style: 'full', color: 0xd8d4cc }, brows: 'bushy',
    hat: { type: 'flatcap', color: 0x5a4a3a },
    top: { type: 'plaid', color: 0xc8261e, accent: 0x1e1418, suspenders: 0x3a2a1e }, legs: { color: 0x34507e }, shoes: 0x3a2618, boots: true,
    eyes: 'tiny', voice: 'gus',
  },
};
for (const [id, spec] of Object.entries(FOLK_SPECS)) CHARACTERS[id] ||= spec;
extendVChar({
  persona: {
    rosie: { idle: 'hips', walk: 'normal', bounce: 1.0, gest: 1.2, fidgets: ['look', 'stretch', 'tap'] },
    gisele: { idle: 'clasp', walk: 'waddle', bounce: 1.1, gest: 1.2, fidgets: ['look', 'glasses', 'hum'] },
    odile: { idle: 'behind', walk: 'normal', bounce: 0.9, gest: 1.1, fidgets: ['look', 'watch', 'tap'] },
    tremblay: { idle: 'hips', walk: 'lumber', bounce: 0.9, gest: 0.9, fidgets: ['look', 'scratch', 'stretch'] },
  },
});

// where each stands (the station master on her platform, the ranger under her tower...)
function homes() {
  const B = (id) => L.BUILDINGS.find((b) => b.id === id);
  const st = B('station'), cot = B('cottage'), cd = B('cidrerie'), ft = L.POI.firetower;
  return {
    rosie: { x: ft.x + 3, z: ft.z + 5.5, yaw: 0.3 },
    gisele: { x: cot.x - 3, z: cot.z + 8.5, yaw: -Math.PI / 2 - 0.4 },
    odile: { x: st.x - 2.6, z: st.z + 6.2, yaw: 0.2 },
    tremblay: { x: cd.x + 6, z: cd.z - 4.2, yaw: Math.PI * 0.75 },
  };
}

export const WILD_QUESTS = {
  ranger: { title: 'Hot cocoa for the ranger', giver: 'rosie', reward: 30 },
  moose: { title: 'Race Gérard down Mont Écho', giver: 'rosie', reward: 40 },
  paddle: { title: "Gisèle's lost paddle", giver: 'gisele', reward: 15 },
  apples: { title: 'Apples for the press', giver: 'tremblay', reward: 25 },
  railLetter: { title: 'A letter by rail', giver: 'ollie', reward: 35 },
  express: { title: 'Beat the old express', giver: 'odile', reward: 30 },
};
const NAMES = { rosie: 'Ranger Rosie', gisele: 'Gisèle', odile: 'Odile', tremblay: 'Monsieur Tremblay' };
const GREET = {
  rosie: ['Mont Écho. Best view in the county.', 'Seen any smoke? No? Good.', 'Mind the switchbacks!'],
  gisele: ['Bonjour, Hank! The loons are singing today.', 'Sit by the fire a while, dear.', 'The lake is like glass this morning.'],
  odile: ['Gare Sainte-Rose. Last train: 1962.', 'All aboard! ...For nothing.', 'Mind the gap. There is no train.'],
  tremblay: ['Pommes! Best in Québec.', "Don't eat the cider apples, eh.", 'Mind the ladders.'],
};
const CAFE_HEAT = 150; // seconds a cocoa from the café stays hot
const APPLES = 8;
const EXPRESS = 40; // seconds, the old express's time down the rail trail
const MOOSE_SPEED = 7.4;

export class WildQuests {
  constructor(quests) {
    this.Q = quests;
    this.game = quests.game;
    this.folk = {};
    this.objs = [];
    this.race = null;
    this.hintT = 0;
  }
  q(id) {
    return this.Q.q(id);
  }

  // ------------------------------------------------------------ the folk
  spawnFolk() {
    const g = this.game;
    if (this.spawned || !g.scene || !g.physics) return;
    this.spawned = true;
    for (const [id, h] of Object.entries(homes())) {
      const a = new VoxelCharacter(g, id, { x: h.x, z: h.z, yaw: h.yaw });
      a.homePos = a.pos.clone();
      a.homeYaw = h.yaw;
      a.wild = true;
      this.folk[id] = a;
    }
  }

  // ------------------------------------------------------------ world bits for active quests
  sync() {
    const g = this.game;
    for (const o of this.objs) g.scene.remove(o.mesh);
    this.objs = [];
    const paddle = this.q('paddle');
    if (paddle.state === 'active' && !paddle.found) this.spawn('paddle', 'paddle', -442.9, 162.3, PR.paddle(), 2.2);
    const ap = this.q('apples');
    if (ap.state === 'active' && (ap.n || 0) < APPLES) {
      const trees = g.world.voxel?.orchardTrees || [];
      ap.got ||= {};
      for (let k = 0; k < APPLES; k++) {
        if (ap.got[k]) continue;
        const t = trees[(k * 7 + 3) % Math.max(1, trees.length)] || { x: L.POI.orchard.x + k * 3, z: L.POI.orchard.z };
        const a = k * 2.1;
        this.spawn('apple', k, t.x + Math.cos(a) * 1.4, t.z + Math.sin(a) * 1.4, PR.apple({ seed: k }), 2.4);
      }
    }
  }
  spawn(kind, id, x, z, r, scale = 1.6) {
    const g = this.game;
    const y = Math.max(g.physics.groundAt(x, z, 100).h, 0.02);
    const mesh = new THREE.Group();
    mesh.add(voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.03 }), sharedVoxelMaterial()));
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    g.scene.add(mesh);
    this.objs.push({ kind, id, mesh, x, y, z, bob: Math.random() * 6 });
  }

  // ------------------------------------------------------------ talking
  // the prompt when Hank stands by one of the folk (or the café's hatch)
  action(g) {
    const p = g.playerPos;
    const slow = g.onFoot || g.bike.speed < 3;
    // café du Rang: a hot cocoa to go for the ranger
    const r = this.q('ranger');
    if (r.state === 'active' && !(r.cup > 0) && slow) {
      const c = L.frontOf('cafehut', 1.4);
      if (Math.hypot(c.x - p.x, c.z - p.z) < 3) return { text: 'Hot cocoa to go ($2)', fn: () => this.buyCocoa() };
    }
    // pick-ups (apples are ridden over, see update)
    for (const o of this.objs) {
      if (o.kind !== 'paddle' || !slow || Math.hypot(o.x - p.x, o.z - p.z) > 2) continue;
      return { text: "Pick up Gisèle's paddle", fn: () => this.pickPaddle(o) };
    }
    if (!slow) return null;
    let best = null, bd = 3.2;
    for (const [id, a] of Object.entries(this.folk)) {
      if (!a.visible) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd && Math.abs(a.pos.y - p.y) < 2.5) { bd = d; best = id; }
    }
    if (best && !this.race) return { text: `Chat with ${NAMES[best]}`, fn: () => this.talk(best) };
    return null;
  }

  async talk(id) {
    const g = this.game, ui = g.ui, a = this.folk[id];
    a.faceTowards(g.playerPos.x, g.playerPos.z);
    a.lookAt(g.playerChar);
    g.rider.ch.faceTowards(a.pos.x, a.pos.z);
    g.rider.ch.lookAt(a);
    g.mode = 'menu';
    const say = (text, o = {}) => ui.say(id, text, { actor: a, ...o });
    let race = false;
    try {
      if (await this.turnIn(id, a, say)) return;
      const offer = this.offersFor(id)[0];
      const lines = GREET[id];
      const greet = lines[Math.floor(Math.random() * lines.length)];
      if (!offer) {
        a.react(Math.random() < 0.5 ? 'nod' : 'bounce');
        await say(greet, { expr: 'happy' });
        return;
      }
      const c = await say(offer.ask, { expr: offer.expr || 'happy', choices: [offer.yes || "I'll help!", 'Maybe later'] });
      if (c !== 0) { a.react('sad'); await say(offer.no || 'Another time, then.', { expr: 'sad' }); return; }
      a.react('yay');
      race = offer.id === 'moose';
      await offer.start();
      if (!race) {
        g.sound.play('quest_new');
        ui.pop(`In the journal: *${WILD_QUESTS[offer.id].title}*.`, { expr: 'happy', key: 'quest' });
      }
    } finally {
      g.rider.ch.lookAt(null);
      a.lookAt(null);
      if (g.mode === 'menu') g.mode = 'ride';
      g.save();
    }
  }

  offersFor(id) {
    const out = [];
    const add = (qid, ask, start, extra = {}) => { const st = this.q(qid).state; if (st === 'new' || (extra.retry && st === 'active')) out.push({ id: qid, ask, start, ...extra }); };
    if (id === 'rosie') {
      add('ranger', 'Six weeks up here, just me and the moose. I would trade my binoculars for a hot cocoa.', async () => {
        const q = this.q('ranger'); q.state = 'active'; q.cup = 0;
        this.game.ui.pop('Café du Rang does cocoa to go. Then *up the hill, fast*.', { expr: 'happy' });
      }, { yes: "I'll bring one!" });
      if (this.q('ranger').state === 'done') {
        const again = this.q('moose').state === 'active';
        add('moose', again ? 'Rematch with Gérard? He is warming up already.' : 'Gérard the moose races everyone down the trail. Nobody beats him. Want to try?', async () => {
          this.q('moose').state = 'active';
          this.startRace();
        }, { yes: 'Ready, set...', retry: true, expr: 'smug' });
      }
    }
    if (id === 'gisele') add('paddle', 'The wind took my good paddle! It always drifts down to the marsh.', async () => {
      this.q('paddle').state = 'active'; this.sync();
    }, { expr: 'worried', yes: "I'll find it!" });
    if (id === 'tremblay') add('apples', 'Windfalls everywhere, and my back is not what it was. Eight apples for the press?', async () => {
      const q = this.q('apples'); q.state = 'active'; q.n = 0; q.got = {}; this.sync();
    }, { yes: 'On it!' });
    if (id === 'odile' && this.q('railLetter').state !== 'active') add('express', `The old express ran the rail trail, tree stand to here, in ${EXPRESS} seconds. Can you beat it?`, async () => {
      const q = this.q('express'); q.state = 'active'; q.t = null;
      this.game.ui.pop('Start at the tree stand. *The clock starts when I ride off.*', { expr: 'happy' });
    }, { expr: 'smug', yes: "I'm faster!" });
    return out;
  }

  // Old Ollie's side of the letter (quests.js asks here for his offer; he takes the reply back in quests.js)
  ollieOffer() {
    if (this.q('railLetter').state !== 'new' || this.game.state.day < 1) return null;
    return {
      id: 'railLetter', ask: 'Odile, at the old station... we wrote letters, back in sixty-two. Would you carry one more?', yes: 'Special delivery!', expr: 'sheepish',
      start: async () => { const q = this.q('railLetter'); q.state = 'active'; q.step = 'odile'; },
    };
  }
  async turnIn(id, a, say) {
    const g = this.game, ui = g.ui;
    const done = async (qid, line, expr = 'happy') => {
      this.q(qid).state = 'done';
      a.react('yay');
      g.effects.hearts(a.pos.x, a.pos.y + 1.6, a.pos.z, 6);
      await say(line, { expr });
      this.reward(qid);
      return true;
    };
    if (id === 'rosie') {
      const r = this.q('ranger');
      if (r.state === 'active' && r.cup > 0) { r.cup = 0; return done('ranger', 'Still steaming! You are a good egg, Hank. Even if you are mostly bones.', 'love'); }
    }
    if (id === 'gisele') {
      const p = this.q('paddle');
      if (p.state === 'active' && p.found) return done('paddle', 'My paddle! Now I can go see the loons. Merci, Hank!', 'love');
    }
    if (id === 'tremblay') {
      const p = this.q('apples');
      if (p.state === 'active' && (p.n || 0) >= APPLES) return done('apples', 'Into the press they go! The first jug is yours. Well. Nana\'s.', 'happy');
    }
    if (id === 'odile') {
      const l = this.q('railLetter');
      if (l.state === 'active' && l.step === 'odile') {
        l.step = 'ollie';
        a.react('love');
        await say('Ollie? After all these years... Wait here. I will write back.', { expr: 'love' });
        ui.pop("Odile's reply! *Back to the lighthouse.*", { expr: 'sparkle', key: 'quest' });
        g.sound.play('item_get');
        return true;
      }
    }
    return false;
  }

  reward(qid) {
    const g = this.game;
    const n = WILD_QUESTS[qid]?.reward ?? 10;
    g.state.money += n;
    g.sound.play('cash_coins');
    g.sound.play('quest_done');
    g.ui.pop(`Favour done! *+$${n}*.`, { expr: 'sparkle' });
  }

  // ------------------------------------------------------------ the ranger's cocoa
  buyCocoa() {
    const g = this.game, q = this.q('ranger');
    if (g.state.money < 2) { g.ui.pop('Two dollars short. Bones are not legal tender.', { expr: 'sheepish' }); return; }
    g.state.money -= 2;
    q.cup = CAFE_HEAT;
    q.warned = 0;
    g.sound.play('cash_coins');
    g.ui.pop('Hot cocoa to go! Up Mont Écho before it cools: *2:30*.', { expr: 'sparkle', key: 'ranger' });
    g.save();
  }

  pickPaddle(o) {
    const g = this.game;
    this.q('paddle').found = true;
    g.scene.remove(o.mesh);
    this.objs = this.objs.filter((x) => x !== o);
    g.sound.play('item_get');
    g.rider.ch.react('yay');
    g.ui.pop("Gisèle's paddle! Back to the lake.", { expr: 'sparkle' });
    g.save();
  }

  pickApple(o) {
    const g = this.game, q = this.q('apples');
    q.got ||= {};
    q.got[o.id] = true;
    q.n = (q.n || 0) + 1;
    g.scene.remove(o.mesh);
    this.objs = this.objs.filter((x) => x !== o);
    g.sound.play('item_get', { volume: 0.6 });
    g.effects.magic(o.x, o.y + 0.4, o.z, 8, [1, 0.5, 0.4]);
    g.ui.pop(q.n >= APPLES ? 'Eight apples! To the press.' : `Apple! *${q.n}/${APPLES}*`, { expr: 'happy', key: 'apples', ms: 1400 });
  }

  // ------------------------------------------------------------ Gérard's race
  startRace() {
    const g = this.game, C = g.critters;
    const S = roadSamples(L.ROADS.find((r) => r.id === 'towerTrail'), 2).slice().reverse();
    const path = S.map((p) => ({ x: p.x, z: p.z }));
    const lens = [0];
    for (let k = 1; k < path.length; k++) lens.push(lens[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z));
    const top = path[0], next = path[3];
    const R = (this.race = { path, lens, total: lens[lens.length - 1], s: 0, t: -3.5, beat: 3, finish: path[path.length - 1], moose: null });
    this.raceAt(R);
    if (C) {
      const m = C.add('moose', top.x, top.z, { resident: true, despawn: Infinity, maxDraw: 400, cat: 'raceMoose', yaw: Math.atan2(next.x - top.x, next.z - top.z), ai: (c, dt, M) => this.raceMooseAI(c, dt, M) });
      R.moose = m;
    }
    g.ui.pop('Gérard snorts. *To the bottom of the trail!*', { expr: 'shock', key: 'race', ms: 1800 });
  }
  raceMooseAI(c, dt, M) {
    const R = this.race;
    if (!R || R.done) {
      // after the race he ambles off into the trees and is gone
      c.spd = Math.max(0, (c.spd || 0) - dt * 2);
      c.x += Math.sin(c.yaw) * c.spd * dt;
      c.z += Math.cos(c.yaw) * c.spd * dt;
      c.y = M.height(c.x, c.z);
      c.anim = c.spd > 0.2 ? 'walk' : 'graze';
      return;
    }
    // (updateRace moves him along the trail; this just puts the puppet there)
    c.x = R.mx; c.z = R.mz; c.yaw = R.myaw;
    c.y = M.height(c.x, c.z);
    c.anim = R.t < 0 ? 'idle' : 'walk';
  }
  // Gérard's place on the trail, s metres down from the top
  raceAt(R) {
    let k = 1;
    while (k < R.lens.length - 1 && R.lens[k] < R.s) k++;
    const a = R.path[k - 1], b = R.path[k], t = (R.s - R.lens[k - 1]) / Math.max(1e-3, R.lens[k] - R.lens[k - 1]);
    R.mx = a.x + (b.x - a.x) * t;
    R.mz = a.z + (b.z - a.z) * t;
    R.myaw = Math.atan2(b.x - a.x, b.z - a.z);
  }
  updateRace(dt) {
    const g = this.game, R = this.race, ui = g.ui;
    if (!R) return;
    if (R.done) {
      if ((R.after -= dt) <= 0) {
        if (R.moose) { R.moose.resident = false; R.moose.dying = true; }
        this.race = null;
      }
      return;
    }
    const was = R.t;
    R.t += dt;
    if (was < 0) {
      const n = Math.ceil(-R.t);
      if (R.t < 0 && n < R.beat) { R.beat = n; ui.pop(`*${n + 1}...*`, { shout: true, key: 'race', ms: 800 }); }
      if (R.t >= 0) { ui.pop('*GO!*', { shout: true, key: 'race', ms: 900 }); g.sound.play('crowd_cheer', { volume: 0.4 }); }
      return;
    }
    R.s = Math.min(R.total, R.s + Math.min(MOOSE_SPEED, R.t * 3.5) * dt);
    this.raceAt(R);
    const p = g.playerPos, f = R.finish;
    const q = this.q('moose');
    if (Math.hypot(p.x - f.x, p.z - f.z) < 7 && R.s < R.total) {
      R.done = true; R.after = 12;
      q.state = 'done';
      g.effects.confetti(p.x, p.y + 1.5, p.z, 40);
      g.rider.ch.react('yay');
      ui.pop('Beat Gérard to the bottom! Rosie will hear about this.', { expr: 'sparkle', key: 'race', ms: 3000 });
      this.reward('moose');
      g.save();
    } else if (R.s >= R.total || Math.hypot(p.x - f.x, p.z - f.z) > 260) {
      R.done = true; R.after = 12;
      ui.pop(R.s >= R.total ? 'Gérard wins. Snort. *Ask Rosie for a rematch.*' : 'Lost Gérard. Ask Rosie for a rematch.', { expr: 'sheepish', key: 'race', ms: 3000 });
      g.save();
    }
  }

  // ------------------------------------------------------------ the express
  updateExpress(dt) {
    const g = this.game, q = this.q('express');
    if (q.state !== 'active') return;
    const p = g.playerPos;
    const R = L.ROADS.find((r) => r.id === 'railTrail').pts;
    const start = R[R.length - 1], st = L.BUILDINGS.find((b) => b.id === 'station');
    const dS = Math.hypot(p.x - start[0], p.z - start[1]);
    if (q.t == null) {
      if (dS < 8) q.armed = true;
      else if (q.armed && dS > 8 && !g.onFoot) { q.t = 0; q.armed = false; g.ui.pop('*GO!* Beat the express to the station!', { shout: true, key: 'express', ms: 1200 }); }
      return;
    }
    q.t += dt;
    const fin = Math.hypot(p.x - st.x, p.z - (st.z + 9));
    if (fin < 9) {
      const tt = q.t.toFixed(1);
      if (q.t <= EXPRESS) {
        q.state = 'done';
        g.effects.confetti(p.x, p.y + 1.5, p.z, 40);
        g.rider.ch.react('yay');
        g.ui.pop(`*${tt} s!* Faster than the express!`, { expr: 'sparkle', key: 'express', ms: 3000 });
        this.reward('express');
      } else g.ui.pop(`${tt} s. The express wins. Try again from the tree stand.`, { expr: 'sheepish', key: 'express', ms: 3000 });
      q.t = null;
      g.save();
    } else if (q.t > EXPRESS * 3) q.t = null; // wandered off
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    if (!this.spawned) { this.spawnFolk(); this.sync(); }
    const p = g.playerPos, cam = g.camera?.position;
    for (const a of Object.values(this.folk)) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      a.visible = d < 110 && g.mode !== 'title';
      if (!a.visible && !a.root.visible) continue;
      if (d > 40 && (a._lodN = (a._lodN || 0) + 1) % 3) { a._lodT = (a._lodT || 0) + dt; continue; }
      a.update(Math.min(0.1, dt + (a._lodT || 0)), cam);
      a._lodT = 0;
      // face the rider as he comes close, then back to minding their own business
      if (g.mode === 'ride') { if (d < 6) a.faceTowards(p.x, p.z); else a.targetYaw = a.homeYaw; }
    }
    for (const o of this.objs) {
      o.bob += dt;
      o.mesh.position.y = o.y + 0.25 + Math.sin(o.bob * 2.5) * 0.08;
      o.mesh.rotation.y += dt * 1.2;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < 40 && Math.random() < dt * 3) g.effects.magic(o.x, o.y + 0.4, o.z, 2, o.kind === 'apple' ? [1, 0.55, 0.45] : [1, 0.9, 0.5]);
      if (o.kind === 'apple' && d < 1.5 && Math.abs(p.y - o.y) < 2.5 && g.mode === 'ride') this.pickApple(o);
    }
    // the ranger's cocoa cools down
    const r = this.q('ranger');
    if (r.state === 'active' && r.cup > 0) {
      r.cup -= dt;
      if (r.cup <= 60 && (r.warned || 0) < 1) { r.warned = 1; g.ui.pop("Rosie's cocoa: *one minute* of heat left!", { expr: 'worried', key: 'ranger' }); }
      if (r.cup <= 0) { r.cup = 0; g.ui.pop('It went cold. Back to Café du Rang for a fresh one.', { expr: 'sad', key: 'ranger' }); }
    }
    this.updateRace(dt);
    this.updateExpress(dt);
  }

  // a "!" over the folk who have something to ask
  updateHints() {
    if ((this.hintT -= 1) > 0) return;
    this.hintT = 90;
    for (const [id, a] of Object.entries(this.folk)) if (a.visible && this.offersFor(id).length) this.game.emotes?.show(a, 'alert', 1.4);
  }

  // ------------------------------------------------------------ journal, HUD & map
  noteLines() {
    const out = [];
    const S = (id) => this.Q.S[id];
    const r = S('ranger');
    if (r?.state === 'active') out.push(r.cup > 0 ? `Cocoa for Rosie ${Math.floor(r.cup / 60)}:${String(Math.floor(r.cup % 60)).padStart(2, '0')}` : 'Cocoa to go: Café du Rang');
    if (S('moose')?.state === 'active' && !this.race) out.push('Rematch Gérard: ask Rosie');
    const pd = S('paddle');
    if (pd?.state === 'active') out.push(pd.found ? 'Paddle back to Gisèle' : "Find Gisèle's paddle");
    const ap = S('apples');
    if (ap?.state === 'active') out.push((ap.n || 0) >= APPLES ? 'Apples to Tremblay' : `Apples ${ap.n || 0}/${APPLES}`);
    const lt = S('railLetter');
    if (lt?.state === 'active') out.push(lt.step === 'ollie' ? "Odile's reply to Ollie" : 'Letter for Odile');
    const ex = S('express');
    if (ex?.state === 'active') out.push(ex.t != null ? `Express ${ex.t.toFixed(0)}/${EXPRESS} s` : `Beat the express: ${EXPRESS} s`);
    return out;
  }

  markers() {
    const m = [];
    for (const o of this.objs) m.push({ id: `w:${o.kind}:${o.id}`, x: o.x, z: o.z, icon: 'star' });
    const r = this.Q.S.ranger;
    if (r?.state === 'active') {
      if (r.cup > 0) m.push({ id: 'w:rosie', x: L.POI.firetower.x, z: L.POI.firetower.z, icon: 'cocoa' });
      else { const c = L.frontOf('cafehut', 1.4); m.push({ id: 'w:cafe', x: c.x, z: c.z, icon: 'cocoa' }); }
    }
    const lt = this.Q.S.railLetter;
    if (lt?.state === 'active') {
      const st = L.BUILDINGS.find((b) => b.id === 'station');
      m.push(lt.step === 'ollie' ? { id: 'w:ollie', x: L.CUSTOMERS.lou_lh.x, z: L.CUSTOMERS.lou_lh.z, icon: 'star' } : { id: 'w:odile', x: st.x, z: st.z + 6, icon: 'star' });
    }
    if (this.Q.S.apples?.state === 'active' && (this.Q.S.apples.n || 0) >= APPLES) { const c = L.BUILDINGS.find((b) => b.id === 'cidrerie'); m.push({ id: 'w:press', x: c.x + 6, z: c.z - 4, icon: 'star' }); }
    if (this.Q.S.express?.state === 'active' && this.Q.S.express.t == null) { const s = L.ROADS.find((r) => r.id === 'railTrail').pts.at(-1); m.push({ id: 'w:express', x: s[0], z: s[1], icon: 'star' }); }
    return m;
  }
}
