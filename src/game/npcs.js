// Villagers of Maple Cove (and Nana at home). Each villager has a brain
// (npcBrain.js) with their own trust in Hank, kept in the save; this module
// spawns them, runs their days, hands out Hank's bell / crashes / tricks, and
// works out how a delivery happens when the customer is too scared to stand still.
import * as THREE from 'three';
import { VoxelCharacter as Actor, CHARACTERS } from './vchar.js';
import './npcPoses.js';
import { CUSTOMERS, BUILDINGS, MO_SPOT, MAIN_ST, frontOf } from '../world/layout.js';
import { NpcBrain, TRUST, moodOf } from './npcBrain.js';
import { PEOPLE } from './npcRoutines.js';
import { Nav } from './npcNav.js';
import { bootVox, LORE } from './npcPoses.js';
import { meshVox } from '../voxel/mesh.js';
import { tone } from '../voxel/vox.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as FOOD from '../voxel/models/food.js';
import { clamp } from '../core/math.js';

const IDLE = { agnes: 'knit', pip: 'hockey', pop: 'hockey' };
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);

export function charForSpot(spot) {
  return spot === 'kids' ? 'pip' : spot === 'lou_lh' ? 'ollie' : spot;
}

export class Villagers {
  constructor(game) {
    this.game = game;
    this.actors = {};
    this.brains = [];
    this.nav = new Nav(game.physics);
    this.litter = new Litter(game);
    this.benchClaims = new Map();
    this._umb = new Map();
    for (const [spot, c] of Object.entries(CUSTOMERS)) {
      const char = charForSpot(spot);
      const house = BUILDINGS.find((b) => b.id === c.house);
      const yaw = house ? house.facing || 0 : 0;
      this.addActor(spot, char, c.x, c.z, yaw);
    }
    // Pip plays hockey on the rink, Pop too; Mo minds the store's porch counter
    this.actors.kids.homeYaw = Math.PI / 2;
    const kids = CUSTOMERS.kids;
    this.addActor('pop', 'pop', kids.x + 4, kids.z - 1.5, -Math.PI / 2 - 0.3);
    this.addActor('mo', 'mo', MO_SPOT.x, MO_SPOT.z, MO_SPOT.yaw);
    // Josée keeps an eye on her two from the side of the rink
    const J = PEOPLE.josee.spot;
    this.addActor('josee', 'josee', J.x, J.z, J.yaw);
    // Nana lives on the porch
    const nana = new Actor(game, 'grandma', { x: -169.5, z: 66.5, yaw: Math.PI / 2 });
    nana.homePos = nana.pos.clone();
    nana.homeYaw = Math.PI / 2;
    this.actors.grandma = nana;
    for (const [key, a] of Object.entries(this.actors)) {
      if (!PEOPLE[key]) continue;
      a.brain = new NpcBrain(this, a, key);
      this.brains.push(a.brain);
    }
    this.waveCooldown = {};
    this.ctx = makeCtx(game);
    game.listeners?.push((e) => this.onBikeEvent(e));
  }

  addActor(key, char, x, z, yaw) {
    const a = new Actor(this.game, char, { x, z, yaw });
    a.spot = key;
    a.homeYaw = yaw;
    a.homePos = a.pos.clone();
    a.play(IDLE[char] || 'idle');
    this.actors[key] = a;
    return a;
  }

  get(id) {
    return this.actors[id];
  }

  // ------------------------------------------------------------ trust, kept in the save
  // (the old flag still works: true until the village has met Hank in the story)
  get scaredOfHank() {
    return !this.game.state?.flags?.village1;
  }
  set scaredOfHank(v) {
    this.syncState();
  }
  syncState() {
    const st = this.game.state;
    if (!st) return;
    const P = this.game.params;
    const forced = P?.has?.('trust') ? clamp(parseFloat(P.get('trust')) || 0, 0, 100) : null;
    if (!st.npc) {
      // saves from before villagers had feelings already know Hank a little
      st.npc = { _day: st.day, _base: forced ?? (st.flags?.village1 && st.stats?.deliveries > 0 ? 30 : 0) };
    }
    if (forced != null) {
      st.npc._base = forced;
      for (const k of Object.keys(st.npc)) if (!k.startsWith('_')) st.npc[k].trust = forced;
    }
    for (const b of this.brains) { b.scripted = false; b.leash = null; b.kids = null; b.snapToSchedule(); }
  }
  rec(char) {
    const st = this.game.state;
    if (!st.npc) this.syncState();
    const N = st.npc;
    return N[char] || (N[char] = { trust: N._base ?? 0, met: (N._base ?? 0) >= TRUST.WARY });
  }
  trustOf(char) {
    if (char === 'grandma') return 100;
    return this.rec(char).trust;
  }
  moodOf(char) {
    return moodOf(this.trustOf(char));
  }
  // story beats can set how a villager feels about Hank
  force(char, trust, met = true) {
    const r = this.rec(char);
    r.trust = trust;
    r.met = met;
  }
  addTrust(char, n, cap) {
    const b = this.brains.find((q) => q.char === char);
    if (b) b.addTrust(n, cap);
    else if (char !== 'grandma') { const r = this.rec(char); r.trust = clamp(r.trust + n, 0, cap ?? 100); }
  }
  moodToast(b, mood) {
    if (this.game.mode === 'title') return;
    const name = this.game.villagerName?.(b.char) || b.char;
    const txt = { wary: `${name} isn't quite so scared of you now`, friendly: `${name} likes you now!`, fan: `${name} is your biggest fan!` }[mood];
    if (txt) this.game.ui?.toast(txt, mood === 'wary' ? 'skull' : 'star', 2600);
    if (mood === 'friendly' || mood === 'fan') this.game.effects?.hearts(b.a.pos.x, b.a.pos.y + 1.8, b.a.pos.z, 5);
  }

  // story scenes hide a villager while a scripted double stands in for them
  setVisible(id, v) {
    const a = this.actors[id];
    if (!a) return;
    a.hiddenByStory = !v;
    a.visible = v && (a.brain ? a.brain.shown : true);
    a.mesh.visible = a.visible;
  }

  // ------------------------------------------------------------ the day plan
  blockOf(b) {
    const g = this.game;
    const h = g.world.atmosphere.hour;
    const day = b.cfg.day;
    let idx = -1;
    for (let i = 0; i < day.length; i++) if (h >= day[i][0] && h < day[i][1]) { idx = i; break; }
    const expect = idx >= 0 && g.orders?.carried?.().some((o) => o.spot === b.key) ? 1 : 0;
    return `${idx}|${expect}|${this.raining ? 1 : 0}`;
  }
  activityFor(b) {
    const key = this.blockOf(b);
    if (b._act?.block === key) return b._act;
    const [idx, expect, rain] = key.split('|').map(Number);
    let act;
    if (idx < 0) act = { k: 'inside' };
    else if (expect) act = { k: 'home', pose: null };
    else {
      let opts = b.cfg.day[idx][2];
      if (rain) {
        const dry = opts.filter((o) => o.k !== 'bench' && o.k !== 'jog' && !(o.k === 'at' && ['garden', 'water'].includes(o.pose)));
        opts = dry.length ? dry : [{ k: 'home' }];
      }
      act = opts[Math.floor(Math.random() * opts.length)];
    }
    b._act = { ...act, block: key };
    return b._act;
  }
  idlePose(b) {
    if (this.raining && b.cfg.umbrella && !b.cfg.kid) return 'umbrella';
    return IDLE[b.char] || 'idle';
  }
  get raining() {
    return (this.game.world.atmosphere.weather?.rain || 0) > 0.45;
  }
  meetMembers(meet) {
    const h = this.game.world.atmosphere.hour;
    return this.brains.filter((b) => b.cfg.day.some(([h0, h1, opts]) => h >= h0 && h < h1 && opts.some((o) => o.k === 'chat' && o.meet === meet))).map((b) => b.key).sort();
  }
  meetPresent(meet, self) {
    return this.brains.filter((b) => b !== self && b.mode === 'routine' && b._act?.k === 'chat' && b._act.meet === meet && !b.path && b.shown);
  }
  kidBrains() {
    return this.brains.filter((b) => b.cfg.kid);
  }
  claimBench(b, near) {
    this.releaseBench(b);
    const spots = this.game.world.voxel?.spots?.filter((s) => s.action === 'sit') || [];
    const taken = new Set(this.benchClaims.values());
    const sitting = this.game.interact?.sitting;
    let best = null, bd = 10;
    for (const s of spots) {
      if (taken.has(s) || s === sitting) continue;
      const d = hyp(s.x - near.x, s.z - near.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) this.benchClaims.set(b.key, best);
    return best;
  }
  releaseBench(b) {
    this.benchClaims.delete(b.key);
  }
  doorOf(id) {
    const b = BUILDINGS.find((q) => q.id === id);
    if (!b) return null;
    const v = this.game.world.buildings?.[id]?.voxel;
    let x, z;
    if (v?.meta?.door && v.M) {
      const d = v.meta.door;
      const p = new THREE.Vector3(d.x, d.y, d.z).applyMatrix4(v.M);
      x = p.x; z = p.z;
    } else ({ x, z } = frontOf(id, 0.35));
    // which wall is the door in? (most are at the front)
    const f = b.facing || 0, c = Math.cos(f), s = Math.sin(f);
    const lx = (x - b.x) * c - (z - b.z) * s, lz = (x - b.x) * s + (z - b.z) * c;
    let nx = s, nz = c;
    if (Math.abs(lx) / (b.w / 2) > Math.abs(lz) / (b.d / 2)) { const k = Math.sign(lx); nx = c * k; nz = -s * k; }
    else if (lz < 0) { nx = -s; nz = -c; }
    return { x, z, nx, nz, yaw: Math.atan2(nx, nz) };
  }

  // ------------------------------------------------------------ voices, bubbles, sounds
  bubble(b, text, ms) {
    const g = this.game;
    g.ui?.tag(`npc:${b.key}`, text, b.bubble, ms);
    const voice = CHARACTERS[b.char]?.voice;
    if (voice && b.d < 25) {
      g.sound.blip(voice);
      setTimeout(() => g.sound.blip(voice), 120);
    }
  }
  sfx(name, pos, vol = 1, pitch = 1) {
    const cam = this.game.camera;
    const d = pos.distanceTo(cam.position);
    if (d > 60) return;
    const right = _r.setFromMatrixColumn(cam.matrixWorld, 0);
    const pan = clamp(_p.copy(pos).sub(cam.position).normalize().dot(right), -1, 1);
    this.game.sound.play(name, { volume: vol * clamp(1 - d / 60, 0, 1), pan, pitch: pitch * rand(0.95, 1.05) });
  }
  slamFx(b) {
    const D = b.door, g = this.game;
    if (!D) return;
    const y = g.physics.groundAt(D.x, D.z).h;
    g.effects?.poof?.(D.x + D.nx * 0.4, y + 0.3, D.z + D.nz * 0.4, { scale: 0.5, count: 3 });
    if (b.d < 30) g.ui?.tag(`slam:${b.key}`, 'SLAM!', new THREE.Vector3(D.x + D.nx * 0.5, y + 2.2, D.z + D.nz * 0.5), 900, 'trick-bail');
    g.chase?.shake?.(b.d < 12 ? 0.12 : 0);
  }
  umbrellaMesh(color, key) {
    let geo = this._umb.get(color);
    if (!geo) {
      const r = LORE.umbrella({ color, trim: tone(color, -0.22) });
      geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 });
      this._umb.set(color, geo);
    }
    const m = voxMesh(geo, sharedVoxelMaterial());
    m.scale.setScalar(0.85);
    m.userData.held = 'umbrella';
    m.userData.upright = true;
    m.userData.colorKey = key;
    return m;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    const X = this.ctx;
    X.refresh(dt);
    const cam = g.camera.position;
    this.litter.update(dt);
    if (g.state?.npc && g.state.day > (g.state.npc._day ?? g.state.day)) this.newDay();
    for (const [id, a] of Object.entries(this.actors)) {
      const b = a.brain;
      if (a.scripted) {
        if (b && !b.scripted) { b.scripted = true; b.onScripted(); }
        a.update(dt, cam);
        continue;
      }
      if (b?.scripted) { b.scripted = false; b.mode = 'routine'; b.busy = false; b._act = null; }
      const d = X.dist(a);
      if (d > 140) {
        a.mesh.visible = false;
        a.visible = false;
        for (const c of a.cloths) c.setVisible(false);
        if (b) b.asleep += dt;
        continue;
      }
      if (b && b.asleep > 0) {
        if (b.asleep > 20) b.snapToSchedule();
        else b.setShown(b.shown);
        b.asleep = 0;
      }
      // a story walk (the actor's own path) is still taking them home
      if (a.path) { a.update(dt, cam); continue; }
      if (b) {
        if (g.mode === 'menu' && d < 6) b.engage();
        else if (b.mode === 'engaged' && g.mode !== 'menu') b.release();
        b.update(dt, X);
      } else this.nana(a, d, dt);
      // far away: animate at a third of the rate
      if (d > 55) {
        a._lodT = (a._lodT || 0) + dt;
        if ((a._lodN = (a._lodN || 0) + 1) % 3) continue;
        a.update(Math.min(0.1, a._lodT), cam);
        a._lodT = 0;
      } else a.update(dt, cam);
    }
  }
  // Nana is always pleased to see him
  nana(a, d, dt) {
    const g = this.game, p = g.playerPos;
    a.visible = !a.hiddenByStory;
    if (d < 9) {
      a.faceTowards(p.x, p.z);
      a.lookAt(g.playerChar);
      if ((g.onFoot || g.bike.speed < 3) && !(this.waveCooldown.grandma > 0) && d < 6) {
        this.waveCooldown.grandma = 25;
        a.react('hi');
      }
    } else {
      if (a.lookTarget === g.playerChar) a.lookAt(null);
      a.face(a.homeYaw);
    }
    this.waveCooldown.grandma = (this.waveCooldown.grandma || 0) - dt;
  }
  newDay() {
    const N = this.game.state.npc;
    N._day = this.game.state.day;
    // a night's sleep: everyone who has met Hank is a little less jumpy
    for (const b of this.brains) if (b.rec.met) b.addTrust(4, TRUST.FAN);
  }

  // ------------------------------------------------------------ Hank's antics
  onBell() {
    const X = this.ctx;
    for (const b of this.brains) if (b.d < 26 && !b.a.scripted && b.mode !== 'engaged') b.onBell(X);
    if (this.game.onFoot) this.game.playerChar?.react?.('hi');
    const n = this.actors.grandma;
    if (n && X.dist(n) < 22) { n.react('hi'); n.showEmote('heart', 1.6); }
  }
  onBikeEvent(e) {
    const X = this.ctx;
    if (!X.live) return;
    if (e.type === 'crash') {
      for (const b of this.brains) if (!b.a.scripted) b.onCrash(X);
      return;
    }
    const trick = e.type === 'flip' || e.type === 'perfectLand' || (e.type === 'land' && e.airTime > 0.9) || (e.type === 'spin' && e.deg >= 360);
    if (trick) for (const b of this.brains) if (!b.a.scripted) b.onTrick(e.type, X);
  }

  // ------------------------------------------------------------ deliveries
  // what the E prompt does for an order, depending on how the customer feels
  deliveryAction(o, p, slow) {
    const a = this.get(o.spot);
    if (!a || !slow) return null;
    const g = this.game;
    const b = a.brain;
    const name = a.char === 'pip' ? 'Pip & Pop' : g.villagerName(a.char);
    const near = (x, z, y, r) => hyp(p.x - x, p.z - z) < r && Math.abs(y - p.y) < 2.5;
    const mood = b ? b.mood : 'friendly';
    const busy = b && ['script'].includes(b.mode);
    if (busy) return null;
    if (mood !== 'terrified' || !b) {
      if (a.visible && near(a.pos.x, a.pos.z, a.pos.y, 4.5)) return { text: `Deliver ${o.label} to ${name}`, fn: () => this.deliver(o, a) };
      // wary folk indoors still answer the door
      if (b?.door && b.inside && near(b.door.x, b.door.z, a.pos.y, 3.5)) return { text: `Knock for ${name}`, fn: () => { this.game.sound.play('knock'); b.answerDoor(); this.deliver(o, a); } };
      return null;
    }
    if (a.visible && near(a.pos.x, a.pos.z, a.pos.y, 7.5)) return { text: `Hold out the cocoa for ${name}`, fn: () => b.snatch(o) };
    if (b.door && near(b.door.x, b.door.z, a.pos.y, 4.6)) return { text: `Leave the cocoa on ${name}'s step`, fn: () => b.leaveOnStep(o) };
    return null;
  }
  async deliver(o, a) {
    const g = this.game, b = a.brain;
    if (b && b.mood === 'wary') {
      g.mode = 'menu';
      await b.nervousGrab();
    }
    const quality = o.quality;
    this.afterDelivery(b, quality, a);
    await g.story.deliver(o, a);
  }
  afterDelivery(b, quality, a) {
    if (b) b.addTrust(quality > 55 ? 22 : 12);
    // neighbours who saw it warm up a little too
    for (const q of this.brains) if (q !== b && q.d < 20 && q.shown && hyp(q.a.pos.x - a.pos.x, q.a.pos.z - a.pos.z) < 20) q.addTrust(3, TRUST.FRIENDLY + 5);
  }
  // pay for an order handed over at arm's length or left on the step (no talk scene)
  payFor(o, b, how) {
    const g = this.game, a = b.a;
    const r = g.orders.deliver(o);
    const at = how === 'step' && b.door ? new THREE.Vector3(b.door.x + b.door.nx * 0.6, a.pos.y + 0.6, b.door.z + b.door.nz * 0.6) : g.playerPos.clone().setY(g.playerPos.y + 1.2);
    g.effects.coins(at.x, at.y, at.z, 6 + Math.round(r.tip / 2));
    g.sound.play('delivered');
    setTimeout(() => g.sound.play('cash'), 300);
    const name = g.villagerName(a.char);
    const money = `+$${r.pay}${r.tip ? ` <b>(+$${r.tip} tip)</b>` : ''}`;
    if (how === 'step') {
      g.ui.toast(`${money} · Left on ${name}'s step. The money was under the mat.`, 'coin', 3400);
      g.ui.tag(`note:${b.key}`, `"Leave it on the step!! Money's under the mat. -${name}"`, new THREE.Vector3(b.door.x + b.door.nx * 0.5, a.pos.y + 1.9, b.door.z + b.door.nz * 0.5), 3800);
    } else g.ui.toast(`${money} · ${name} snatched the cocoa and ran!`, 'coin', 3000);
    this.afterDelivery(null, r.quality, a);
    g.save();
    return r;
  }
  // the compass points at the customer (or their door when they're hiding inside)
  markerFor(spot) {
    const a = this.actors[spot];
    const c = CUSTOMERS[spot];
    if (!a) return c;
    const b = a.brain;
    if (b?.inside && b.door) return { x: b.door.x, z: b.door.z };
    if (a.visible) return { x: a.pos.x, z: a.pos.z };
    return c;
  }
  // can Hank stop for a chat? (not while they're running away or hiding)
  canChat(a) {
    const b = a.brain;
    if (!b) return true;
    if (b.mood === 'terrified') return false;
    return !['flee', 'hide', 'indoors', 'startle', 'script', 'cowerOpen'].includes(b.mode) && a.visible;
  }
  // a gentle nudge when a frightened villager is peeking at Hank
  hint(p, slow) {
    if (!slow) return null;
    for (const b of this.brains) {
      if (b.mood === 'terrified' && b.peeking && b.d < 14 && b.d > 3) return { text: `${this.game.villagerName(b.char)} is scared. Stay calm, or ring the bell to say hi`, key: 'R', passive: true };
    }
    return null;
  }
}

const _r = new THREE.Vector3(), _p = new THREE.Vector3();

// what the villagers know about Hank this frame
function makeCtx(g) {
  const X = {
    p: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), speed: 0, onFoot: false, live: false, crashed: false, dRoad: 99,
    refresh() {
      X.p.copy(g.playerPos);
      X.onFoot = !!g.onFoot;
      X.speed = X.onFoot ? g.walker.speed || 0 : g.bike.speed || 0;
      X.crashed = !X.onFoot && g.bike.crash > 0;
      X.live = g.mode === 'ride' && !g.interior?.active;
      if (!X.onFoot) g.bike.forward?.(X.fwd);
      X.dRoad = Math.abs(X.p.z - MAIN_ST.z);
    },
    dist(a) { return hyp(a.pos.x - X.p.x, a.pos.z - X.p.z); },
    // how far off the bike's line a villager stands (Infinity when behind it)
    headingAt(a) {
      const rx = a.pos.x - X.p.x, rz = a.pos.z - X.p.z;
      const along = rx * X.fwd.x + rz * X.fwd.z;
      if (along < 0) return Infinity;
      return Math.abs(rx * X.fwd.z - rz * X.fwd.x);
    },
  };
  return X;
}

// ---------------------------------------------------------------- things on the ground
// dropped mugs and knitting, thrown boots, cocoa left on doorsteps
class Litter {
  constructor(game) {
    this.g = game;
    this.items = [];
    this.geo = {};
  }
  mesh(kind, build) {
    let geo = this.geo[kind];
    if (!geo) {
      const r = build();
      geo = this.geo[kind] = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 });
    }
    const m = voxMesh(geo, sharedVoxelMaterial());
    m.castShadow = true;
    return m;
  }
  drop(m) {
    this.g.scene.attach(m);
    this.items.push({ m, v: new THREE.Vector3(rand(-1.2, 1.2), rand(1.5, 3), rand(-1.2, 1.2)), w: new THREE.Vector3(rand(-9, 9), rand(-4, 4), rand(-9, 9)), life: 30, r: 0.05 });
  }
  throwBoot(a, target) {
    const g = this.g;
    const m = this.mesh('boot', () => bootVox(a.char === 'birdie' ? 0x2a2a30 : 0x4a3220));
    a.arms.R.hand.getWorldPosition(m.position);
    g.scene.add(m);
    const hit = (g.onFoot || g.bike.speed < 2) && Math.random() < 0.45;
    const tx = target.x + (hit ? 0 : rand(-1.4, 1.4)), tz = target.z + (hit ? 0 : rand(-1.4, 1.4));
    const ty = target.y + (hit ? 1.55 : 0.1);
    const dist = hyp(tx - m.position.x, tz - m.position.z);
    const T = clamp(dist / 9, 0.45, 0.95);
    const G = 14;
    const v = new THREE.Vector3((tx - m.position.x) / T, (ty - m.position.y) / T + 0.5 * G * T, (tz - m.position.z) / T);
    this.items.push({ m, v, w: new THREE.Vector3(rand(-14, 14), rand(-6, 6), rand(-14, 14)), life: 16, r: 0.12, hit, tHit: T, t: 0 });
    g.sound.play('whoosh', { volume: 0.5, pitch: 1.3 });
  }
  stepCup(D) {
    const g = this.g;
    const m = this.mesh('cup', FOOD.cocoaTakeaway);
    const x = D.x + D.nx * 0.55, z = D.z + D.nz * 0.55;
    m.position.set(x, g.physics.groundAt(x, z).h, z);
    m.rotation.y = Math.random() * 6;
    g.scene.add(m);
    this.items.push({ m, still: true, life: 120 });
    g.effects?.chimneySmoke?.(x, m.position.y + 0.3, z, { scale: 0.25 });
    return m;
  }
  remove(m) {
    this.g.scene.remove(m);
    this.items = this.items.filter((i) => i.m !== m);
  }
  update(dt) {
    if (!this.items.length) return;
    const g = this.g;
    for (const it of this.items) {
      it.life -= dt;
      if (it.life < 0.5) it.m.scale.setScalar(Math.max(0.01, it.life / 0.5));
      if (it.still || it.rest) continue;
      const m = it.m;
      it.t = (it.t || 0) + dt;
      it.v.y -= 14 * dt;
      m.position.addScaledVector(it.v, dt);
      m.rotation.x += it.w.x * dt; m.rotation.y += it.w.y * dt; m.rotation.z += it.w.z * dt;
      // a boot to the skull
      if (it.hit && !it.didHit && it.t >= it.tHit) {
        it.didHit = true;
        const ch = g.playerChar;
        ch?.react?.('headpop');
        g.sound.play('bone_rattle');
        g.sound.play('pumpkin_bonk', { volume: 0.6, pitch: 1.4 });
        g.effects?.impact?.(m.position.x, m.position.y, m.position.z, 0.6);
        g.chase?.shake?.(0.2);
        it.v.set(-it.v.x * 0.25, 3, -it.v.z * 0.25);
      }
      const gy = g.physics.groundAt(m.position.x, m.position.z, m.position.y + 0.5).h + it.r;
      if (m.position.y < gy) {
        m.position.y = gy;
        if (it.v.y < -2) g.sound.play('footstep_wood', { volume: 0.25, pitch: 1.4 });
        it.v.y = -it.v.y * 0.3;
        it.v.x *= 0.5; it.v.z *= 0.5;
        it.w.multiplyScalar(0.5);
        if (Math.abs(it.v.y) < 0.6) { it.rest = true; m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * (Math.PI / 2); m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * (Math.PI / 2); }
      }
    }
    const gone = this.items.filter((i) => i.life <= 0);
    if (gone.length) {
      for (const i of gone) g.scene.remove(i.m);
      this.items = this.items.filter((i) => i.life > 0);
    }
  }
}
