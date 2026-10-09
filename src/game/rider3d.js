// Hank on the bike as a real voxel character: hips on the saddle, hands on the
// grips and feet on the pedals (IK), leaning with the bike, shifting his weight
// forward when he digs in and back when he brakes, and putting a foot down on the
// ground (swung over from its pedal) when Bessie stops. Every bike move has a
// pose layered on top (wheelie lean-back, stoppie over the bars, crouch and pop,
// tucked flips, a foot dab, a slipped pedal). Big crashes burst him into bones that
// zip back together; small bails just flop him on his back for a moment.
//
// Pedalling hard winds him (bike.stamina / bike.tired): he pants, jaw flapping and ribcage
// heaving, his head droops and his shoulders slump, sweat flicks off his skull and little
// puffs of breath hang in the cold air. Spent, his bones start working loose (the jaw drops
// open, a forearm wanders off its elbow) and clack back. Given a rest he sits up, gets his
// breath back and sighs.
import * as THREE from 'three';
import { VoxelCharacter } from './vchar.js';
import { catVox } from './quests.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { clamp, damp } from '../core/math.js';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const S = Math.sin;
const arm = (T, s, f, o, e, i = 0) => { T['aF' + s] = f; T['aO' + s] = o; T['eB' + s] = e; T['eI' + s] = i; };
const leg = (T, s, f, o, k) => { T['lF' + s] = f; T['lO' + s] = o; T['kB' + s] = k; };

export class VoxelRider {
  constructor(game, charId = 'hank') {
    this.game = game;
    this.visible = true;
    this.cat = null;
    this.mounted = true;
    this.windmill = 0;
    this.cheer = 0;
    this.st = 'pedal';
    // Hank's little life on the bike (see life())
    this.L = { scanT: 0, look: null, lookKind: '', lookD: 99, lookV: new THREE.Vector3(), lookA: null, waveT: 0, waveCool: 4, glanceT: 0, glanceCool: 6, glanceSide: 1,
      humT: 0, humCool: 8, blipT: 0, still: 0, yawnT: 0, yawnCool: 5, tapT: 0, nearCool: 0, flinchT: 0, flinchSide: 1, effort: 0, cruise: 0,
      // winded (see tiredLife)
      breath: 0, breathOut: false, sweatT: 0, looseCool: 4, jawT: 0, boneT: 0, boneSide: 'L', sighT: 0, wipeT: 0 };
    this.bone = null; // { mesh, pos, rot } a bone that has wandered off (put back by fixBones)
    this.popT = -1e9; // the last winded pop-up
    this.poseFn = (c, t, T) => this.bikePose(c, t, T);
    // a foot put down to balance: how far it's swung from its pedal to the ground (0..1),
    // which side, and the spot on the ground it's planted on
    this.dabK = 0;
    this.dabSide = 'R';
    this.dabAt = new THREE.Vector3();
    this.dabSet = false;
    this.dabFoot = new THREE.Vector3();
    this.bAcc = 0; // the bike's smoothed forward acceleration (Hank's weight shifts with it)
    this.lastFwd = 0;
    this.make(charId);
  }

  make(id) {
    if (this.ch) this.ch.dispose();
    this.char = id;
    this.ch = new VoxelCharacter(this.game, id, { y: 0 });
    this.ch.groundSnap = false;
    this.ch.onStep = (c, v, f) => this.footfall(v, f);
    this.ch.onReassembled = () => {
      this.reassembled = true;
      this.game.sound?.play('reassemble');
    };
    this.mounted = false;
    this.wantMount = true;
  }

  // on foot, flat out: every footfall kicks up a little puff of dust behind him
  footfall(v, f) {
    const W = this.game.walker;
    if (!this.onFoot || !W?.sprinting || !W.grounded || W.wet || this.game.interior?.active) return;
    const fx = Math.sin(W.yaw), fz = Math.cos(W.yaw);
    const x = f ? f.x : W.pos.x, z = f ? f.z : W.pos.z, y = f ? f.y : W.pos.y;
    this.game.effects?.dustKick?.(x - fx * 0.12, y + 0.05, z - fz * 0.12, { scale: 0.3 + Math.min(0.12, (v - 5) * 0.03), vx: -fx * 1.2, vz: -fz * 1.2 });
  }

  setOutfit(id) {
    if (id !== this.char) this.make(id);
  }

  get mesh() { return this.ch.root; }

  // Poutine rides in the basket: a little voxel cat who bobs, looks around and cheers on jumps
  enableCat(on) {
    if (on && !this.cat) {
      const r = catVox(0xe8a050, 0xfff0d8, 0x60c0e8);
      const m = voxMesh(meshVox(r.vox, { size: r.size * 0.9, origin: r.origin, jitter: 0.03 }), sharedVoxelMaterial());
      this.cat = { mesh: new THREE.Group() };
      this.cat.mesh.add(m);
      this.catBody = m;
      this.game.scene.add(this.cat.mesh);
      this.catT = 0;
    }
    if (this.cat) this.cat.mesh.visible = on;
    this.catOn = on;
  }

  mount(model) {
    const ch = this.ch;
    this.pedals = [model.pedals[0], model.pedals[1]];
    ch.mount({ seat: model.rider, gripL: model.gripL, gripR: model.gripR, pedalL: this.pedals[0], pedalR: this.pedals[1], armW: 1, legW: 1 });
    this.mounted = true;
  }
  dismount() {
    this.ch.mount(null);
    this.mounted = false;
  }

  // hop between the saddle and the ground with a little arc
  hopOff(target) {
    const ch = this.ch;
    this.fixBones();
    ch.root.updateMatrixWorld(true);
    const from = ch.root.position.clone();
    this.dismount();
    this.onFoot = true;
    this.hop = { t: 0, dur: 0.32, from, to: target, off: true };
    ch.play('idle');
  }
  hopOn(model) {
    const ch = this.ch;
    this.hop = { t: 0, dur: 0.3, from: ch.pos.clone(), model, off: false };
    this.onFoot = false;
    ch.play('air');
  }
  updateHop(dt) {
    const H = this.hop, ch = this.ch;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    const e = k * k * (3 - 2 * k);
    const to = H.off ? H.to : H.model.rider.getWorldPosition(_v);
    ch.groundSnap = false;
    ch.pos.lerpVectors(H.from, to, e);
    ch.pos.y += Math.sin(k * Math.PI) * (H.arc ?? 0.45);
    if (k >= 1) {
      this.hop = null;
      if (H.off) { ch.groundSnap = true; ch.kick('sq', 0.72); H.done?.(); }
      else { this.mount(H.model); ch.kick('sq', 0.8); }
    }
  }

  // the bike crashed: bones everywhere (or, for a small bail, a comic flop)
  crash(bike, e = {}) {
    const ch = this.ch;
    if (ch.broken || this.crashed) return;
    this.fixBones();
    ch.tempExpr?.('shock', 1.2);
    this.crashed = true;
    this.reassembled = false;
    if (e.soft) return this.flop(bike, e);
    this.dismount();
    // stand the (empty) rig up beside the bike so the bones gather into a standing Hank
    const side = Math.random() < 0.5 ? 1 : -1;
    ch.pos.set(bike.pos.x + Math.cos(bike.yaw) * 0.9 * side, bike.pos.y, bike.pos.z - Math.sin(bike.yaw) * 0.9 * side);
    ch.groundSnap = true;
    ch.yaw = ch.targetYaw = bike.yaw;
    ch.play('idle');
    ch.update(0.001, this.game.camera.position);
    ch.explode(_v.copy(bike.vel).multiplyScalar(0.8).setY(1));
    ch.broken.auto = false;
    this.game.chase?.shake(0.8);
  }

  // loop-outs land Hank on his back behind the bike, endos throw him over the bars
  flop(bike, e) {
    const ch = this.ch;
    ch.root.updateMatrixWorld(true);
    const from = ch.root.position.clone();
    this.dismount();
    const fx = Math.sin(bike.yaw), fz = Math.cos(bike.yaw);
    // off a tree trunk he bounces back and sits down hard beside the bike
    const tree = e.why === 'tree';
    const k = tree ? -0.55 : e.kind === 'loopout' ? -1.1 : e.kind === 'endo' ? 1.6 : 0.4;
    const side = tree ? (Math.random() < 0.5 ? 1 : -1) * 0.7 : e.kind === 'tumble' ? (Math.random() < 0.5 ? 1 : -1) * 0.9 : 0;
    const x = bike.pos.x + fx * k + fz * side, z = bike.pos.z + fz * k - fx * side;
    const y = this.game.physics.groundAt(x, z, bike.pos.y + 1).h;
    ch.yaw = ch.targetYaw = e.kind === 'endo' ? bike.yaw + Math.PI : bike.yaw;
    ch.play('flail');
    ch.tempExpr('shock', 0.6);
    this.flopping = true;
    this.hop = {
      t: 0, dur: e.kind === 'endo' ? 0.45 : 0.32, from, to: new THREE.Vector3(x, y, z), off: true, arc: e.kind === 'endo' ? 0.9 : 0.35,
      done: () => {
        ch.play('lie');
        ch.tempExpr('dizzy', tree ? 1.8 : 1.4);
        if (tree) this.game.emotes?.show?.(ch, 'star', 1.6);
        ch.kick('sq', 0.6);
        this.game.sound?.play('bone_rattle');
        this.game.effects?.poof?.(x, y + 0.2, z, { scale: 0.8, count: 6 });
      },
    };
    this.game.chase?.shake(0.45);
  }

  // extra pose on top of vchar's ride pose, from what the bike is doing
  bikePose(c, t, T) {
    const self = this, b = this.game.bike, st = this.st;
    const th = b.wheelie, ts = b.stoppie;
    if (st === 'wheelie' || st === 'manual') {
      const k = clamp(th / 0.7, 0, 1.4);
      // the bike tilts up under him; he hangs back a little but his body stays fairly upright
      T.lean = 0.3 + th * 0.85 - k * 0.32;
      T.bodyZ -= 0.05 * k;
      T.headX -= 0.28 * k;
      T.tilt += b.balance * 4;
      if (st === 'manual') { T.bodyY += 0.03; T.lean -= 0.08; }
    } else if (st === 'stoppie' || st === 'nose') {
      const k = clamp(ts / 0.7, 0, 1.4);
      T.lean = 0.45 + k * 0.4 - ts * 0.4;
      T.bodyY += 0.07 * k;
      T.bodyZ += 0.04 * k;
      T.headX -= 0.25;
      T.tilt += b.balance * 4;
    } else if (st === 'crouch') {
      T.bodyY -= 0.08;
      T.lean += 0.32;
      T.headX -= 0.18;
      T.sq = 0.9;
    } else if (st === 'pop') {
      T.bodyY += 0.07;
      T.lean -= 0.12;
      T.sq = 1.08;
      T.headX -= 0.25;
    } else if (st === 'flip') {
      // tucked tight
      T.lean += 0.5;
      T.bodyY -= 0.05;
      T.headX += 0.35;
      T.sq = 0.94;
    } else if (st === 'dab') {
      const s = b.dabSide > 0 ? 'R' : 'L';
      leg(T, s, 0.25, 0.5, 0.2);
      // slide off the saddle towards the foot that's down
      T.tilt += b.dabSide * 0.1;
      T.lean += 0.08;
      T.bodyY -= 0.09 * this.dabK;
    } else if (st === 'slip') {
      leg(T, 'R', 0.2 + S(t * 22) * 0.9, 0.35, 0.5);
      T.headX -= 0.2;
      T.lean -= 0.1;
    }
    // weight shifts: forward over the bars as he digs in, back as the brakes bite; when the
    // front pops up he hangs back a moment before settling (follow-through)
    if (b.grounded) {
      T.lean += clamp(this.bAcc * 0.035, -0.16, 0.12);
      T.headX -= clamp(this.bAcc * 0.02, -0.08, 0.06);
      if (st === 'wheelie' || st === 'manual') T.lean -= clamp(b.wheelieVel * 0.05, -0.1, 0.12);
      if (st === 'stoppie' || st === 'nose') T.lean += clamp(b.stoppieVel * 0.05, -0.1, 0.12);
    }
    // airborne spins: look into the spin, body twists after
    if (!b.grounded) {
      T.twist -= clamp(b.yawRate * 0.05, -0.35, 0.35);
      T.headY += clamp(b.yawRate * 0.08, -0.6, 0.6);
    }
    // slow wobble: arms and body sway as he fights for balance
    if (b.grounded && b.speed < 1.8 && b.speed > 0.2 && st !== 'dab') T.tilt += S(t * 9) * 0.07 * (1.8 - b.speed);
    // sketchy landing: arms windmill for a moment
    if (self.windmill > 0) {
      const w = self.windmill;
      arm(T, 'L', S(t * 19) * 2.2, 1.4, 0.3);
      arm(T, 'R', S(t * 19 + 2.5) * 2.2, 1.4, 0.3);
      T.tilt += S(t * 13) * 0.12 * w;
    }
    if (self.cheer > 0) { arm(T, 'L', 0.3, 2.6, 0.25); T.headX -= 0.15; }
    this.lifePose(c, t, T, b);
    this.game.tricks?.poseFn?.(c, t, T);
  }

  // ---------------------------------------------------------------- feeling alive
  // what Hank does with himself while riding: looks at people, animals and birds,
  // waves at friends, hums, glances back at the cocoa, grinds uphill, yawns and taps
  // his foot when stopped, flinches at near misses.
  life(dt, bike) {
    const L = this.L, ch = this.ch, g = this.game;
    for (const k of ['waveT', 'waveCool', 'glanceT', 'glanceCool', 'humT', 'humCool', 'yawnT', 'yawnCool', 'nearCool', 'flinchT']) L[k] = Math.max(0, L[k] - dt);
    const p = bike.pos;
    const fx = Math.sin(bike.yaw), fz = Math.cos(bike.yaw);
    // ---- look around: the most interesting thing nearby, ahead of him
    if ((L.scanT -= dt) <= 0) {
      L.scanT = 0.35;
      let best = null, bestS = 0;
      const consider = (pos, kind, interest, y, ref) => {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < 1.2 || d > 18) return;
        const ahead = (dx * fx + dz * fz) / d;
        if (ahead < -0.25) return;
        const sc = (interest * (0.6 + ahead * 0.4)) / (2 + d) * (L.lookA === ref ? 1.35 : 1); // a little stickiness
        if (sc > bestS) { bestS = sc; best = { pos, kind, y, d, ref }; }
      };
      const V = g.villagers;
      if (V?.actors) for (const a of Object.values(V.actors)) if (a?.pos && a.visible !== false) consider(a.pos, 'person', 3, 1.4, a);
      for (const pt of V?.pets?.list || []) consider(pt.root.position, 'pet', 2.4, 0.4, pt);
      for (const c of g.wildlife?.list || []) if (!c.dying && !c.pet && c.kind !== 'bin') consider(c, c.air ? 'bird' : 'animal', c.air ? 1.6 : 2, Math.min(0.9, c.sp?.meta?.headH ?? 0.5), c);
      L.lookA = best?.ref || null;
      L.lookKind = best?.kind || '';
      L.lookD = best?.d ?? 99;
      if (best) {
        L.look = L.lookV.set(best.pos.x, (best.kind === 'bird' ? best.pos.y : best.pos.y + best.y) || p.y + 1, best.pos.z);
        // near miss: someone right beside the line at speed
        if (best.kind === 'person' && best.d < 2.6 && bike.speed > 6 && !L.nearCool) {
          L.nearCool = 4;
          L.flinchT = 0.7;
          const side = (best.pos.x - p.x) * fz - (best.pos.z - p.z) * fx;
          L.flinchSide = side > 0 ? 1 : -1;
          ch.tempExpr(Math.random() < 0.5 ? 'shock' : 'surprised', 1.1);
          ch.kick('sq', 1.25);
          g.sound?.play('bone_rattle', { volume: 0.5 });
        }
        // a friendly villager close by: let go of the bars and wave
        const mood = best.ref?.brain?.mood;
        if (best.kind === 'person' && best.d < 11 && bike.speed < 11 && !L.waveCool && (!mood || mood === 'friendly' || mood === 'fan')) {
          L.waveCool = 22 + Math.random() * 12;
          L.waveT = 1.5;
          ch.tempExpr(Math.random() < 0.5 ? 'excited' : 'happy', 1.8);
        } else if ((best.kind === 'animal' || best.kind === 'pet') && best.d < 9 && Math.random() < 0.05) ch.tempExpr('awe', 1.2);
      } else L.look = null;
    }
    ch.lookTarget = L.glanceT > 0 || L.yawnT > 0 ? null : L.look;
    // ---- glance back at the cocoa
    const carried = g.orders?.carried?.() || [];
    if (carried.length && !L.glanceCool && bike.grounded && bike.speed > 1.5) {
      L.glanceCool = 7 + Math.random() * 9;
      L.glanceT = 0.9;
      L.glanceSide = Math.random() < 0.5 ? 1 : -1;
      const q = Math.min(...carried.map((o) => o.quality));
      ch.tempExpr(q < 35 ? 'worried' : q < 65 ? 'confused' : 'happy', 1.1);
    }
    // ---- humming while cruising along
    const cruising = bike.grounded && bike.speed > 2 && bike.speed < 12.5 && !bike.drifting && bike.wheelie < 0.1 && bike.wobble < 0.2;
    L.cruise = cruising ? L.cruise + dt : 0;
    if (L.cruise > 4 && !L.humCool && !L.humT) { L.humT = 2.5 + Math.random() * 2; L.humCool = 12 + Math.random() * 14; }
    if (L.humT > 0) {
      if (!cruising) L.humT = 0;
      ch.say(0.15);
      if ((L.blipT -= dt) <= 0) { L.blipT = 0.28 + Math.random() * 0.25; g.sound?.blip?.('hank'); }
    }
    // ---- standing still: foot tapping, then a big yawn
    L.still = bike.speed < 0.3 && bike.grounded ? L.still + dt : 0;
    if (L.still > 7 && !L.yawnCool && !L.yawnT) { L.yawnT = 2.2; L.yawnCool = 14 + Math.random() * 10; ch.tempExpr('yawn', 2.2); g.sound?.play('jaw_chatter', { volume: 0.25, pitch: 0.7 }); }
    // ---- uphill: effort
    const up = bike.grounded ? clamp(bike.slopePitch * 4, 0, 1) * clamp(bike.speed / 2, 0, 1) * (bike.pushing ? 1 : 0.3) : 0;
    L.effort += (up - L.effort) * Math.min(1, dt * 3);
    this.tiredLife(dt, bike);
  }

  // ---------------------------------------------------------------- winded
  // breathing, sweat, breath puffs and loose bones (the pose layers are in tiredPose)
  tiredLife(dt, bike) {
    const L = this.L, ch = this.ch, g = this.game, fx = g.effects;
    const k = clamp(bike.tired || 0, 0, 1);
    for (const key of ['sweatT', 'looseCool', 'jawT', 'boneT', 'sighT', 'wipeT']) L[key] = Math.max(0, L[key] - dt);
    // breathing: slow and easy, faster and harder the more winded he is
    L.breath += dt * Math.PI * 2 * (0.3 + 1.7 * k);
    const out = Math.sin(L.breath) < 0;
    if (out && !L.breathOut && k > 0.22 && ch.headPiece) {
      // a huff of breath in the cold air, left hanging behind him
      ch.headPiece.getWorldPosition(_v);
      const f = Math.sin(bike.yaw), z = Math.cos(bike.yaw);
      fx?.dustKick?.(_v.x + f * 0.16, _v.y - 0.02, _v.z + z * 0.16, { color: [0.94, 0.96, 1], scale: 0.16 + 0.16 * k, vx: f * 1.1 + bike.vel.x * 0.85, vz: z * 1.1 + bike.vel.z * 0.85 });
      if (k > 0.5) g.sound?.play('huff', { volume: 0.1 + 0.18 * k, pitch: 0.9 + Math.random() * 0.25 });
    }
    L.breathOut = out;
    // sweat flicking off the skull
    if (k > 0.45 && !L.sweatT && ch.headPiece) {
      L.sweatT = 1.3 - k * 0.8 + Math.random() * 0.4;
      ch.headPiece.getWorldPosition(_v);
      fx?.sweat?.(_v.x, _v.y + 0.18, _v.z, k > 0.85 ? 2 : 1);
    }
    // spent: the jaw drops loose, or a forearm wanders off its elbow; then they clack back
    if (bike.exhausted && !L.looseCool && !L.jawT && !L.boneT) {
      L.looseCool = 3.5 + Math.random() * 3;
      if (Math.random() < 0.5) L.jawT = 1.0;
      else {
        L.boneT = 1.1;
        L.boneSide = Math.random() < 0.5 ? 'L' : 'R';
      }
      g.sound?.play('bone_rattle', { volume: 0.35, pitch: 1.2 });
    }
    const arm = ch.arms?.[L.boneSide];
    if (L.boneT > 0 && arm?.fore) {
      const m = arm.fore;
      if (!this.bone) this.bone = { mesh: m, x: m.position.x, y: m.position.y, z: m.position.z, rz: m.rotation.z };
      const B = this.bone;
      const e = Math.sin(clamp(1 - L.boneT / 1.1, 0, 1) * Math.PI);
      m.position.set(B.x + arm.s * 0.045 * e, B.y - 0.03 * e, B.z);
      m.rotation.z = B.rz + Math.sin(this.ch.t * 23) * 0.25 * e;
      if (L.boneT <= dt * 1.5) this.fixBones(true);
    } else if (this.bone) this.fixBones();
    if (L.jawT > 0 && L.jawT <= dt * 1.5) {
      ch.kick('sq', 0.9);
      g.sound?.play('jaw_chatter', { volume: 0.3, pitch: 1.3 });
    }
  }
  // put a wandered bone back where it belongs (with a clack)
  fixBones(clack = false) {
    const B = this.bone;
    if (!B) return;
    B.mesh.position.set(B.x, B.y, B.z);
    B.mesh.rotation.z = B.rz;
    this.bone = null;
    this.L.boneT = 0;
    if (clack) {
      this.ch.kick('sq', 0.9);
      this.game.sound?.play('bone_rattle', { volume: 0.45, pitch: 1.5 });
    }
  }

  // the winded pose, layered in lifePose
  tiredPose(t, T, b) {
    const L = this.L;
    const k = clamp(b.tired || 0, 0, 1);
    const br = Math.sin(L.breath);
    if (k > 0.02) {
      const resting = !b.pushing;
      // head droops, shoulders slump, hunched over the bars... (sitting up when he gets a rest)
      T.headX += (resting ? 0.12 : 0.32) * k;
      T.shUp -= 0.03 * k;
      T.lean += (resting ? -0.1 : 0.14) * k;
      // ...ribcage heaving, jaw flapping with every pant
      T.sq += br * 0.045 * k;
      T.shUp += br * 0.018 * k;
      T.jaw = Math.max(T.jaw || 0, (0.06 + 0.3 * k) * Math.max(0, -br));
      T.tilt += Math.sin(t * 3.3) * 0.05 * k;
      if (b.exhausted) { T.headZ += Math.sin(t * 2.1) * 0.12; T.headX += Math.abs(Math.sin(t * 1.7)) * 0.08; }
    }
    // spent: the jaw hangs right open and wobbles before it snaps back
    if (L.jawT > 0) T.jaw = 0.75 + Math.sin(t * 19) * 0.12;
    // the relieved sigh: sits right up, shoulders drop
    if (L.sighT > 0) {
      const e = Math.sin(clamp(1 - L.sighT / 1.4, 0, 1) * Math.PI);
      T.lean -= 0.2 * e; T.headX -= 0.25 * e; T.shUp += 0.03 * e; T.sq += 0.05 * e;
    }
    // ...and a wipe of the brow
    if (L.wipeT > 0) {
      const e = Math.sin(clamp(1 - L.wipeT / 1.1, 0, 1) * Math.PI);
      arm(T, 'R', 1.5 + 0.9 * e, 0.25 + Math.sin(t * 9) * 0.25 * e, 2.3, 0.4);
      T.headX += 0.12 * e;
    }
  }

  // the life pose layers, applied inside bikePose
  lifePose(c, t, T, b) {
    const L = this.L;
    const env = (v, d) => Math.sin(clamp(1 - v / d, 0, 1) * Math.PI);
    // lean into turns a touch more than the bike does, with the head looking into the corner
    T.tilt += clamp(b.lean, -0.6, 0.6) * 0.22;
    T.headZ += clamp(b.lean, -0.6, 0.6) * 0.18;
    // little head-bob with the pedal strokes
    if (b.grounded && b.speed > 0.8) T.headX += S(b.crank * 2) * 0.035 * clamp(b.cadence || 0.5, 0, 1);
    // grinding uphill: forward over the bars, head down, shoulders rocking with each stroke
    if (L.effort > 0.05) {
      const e = L.effort;
      T.lean += 0.22 * e; T.headX += 0.12 * e; T.bodyY += Math.abs(S(b.crank)) * 0.04 * e;
      T.tilt += S(b.crank) * 0.08 * e;
      if (e > 0.5 && !c.tmpExpr) c.tempExpr('determined', 0.3);
    }
    this.tiredPose(t, T, b);
    if (L.waveT > 0) {
      const k = env(L.waveT, 1.5);
      arm(T, 'R', 0.25, 2.2 + k * 0.4, 0.35, S(t * 12) * 0.6);
      T.headZ -= 0.12 * k;
    }
    if (L.glanceT > 0) {
      const k = env(L.glanceT, 0.9);
      T.headY += L.glanceSide * 1.55 * k; T.twist += L.glanceSide * 0.25 * k; T.headX += 0.12 * k;
    }
    if (L.humT > 0) { T.headZ += S(t * 4.2) * 0.13; T.tilt += S(t * 4.2) * 0.025; }
    if (L.flinchT > 0) {
      const k = env(L.flinchT, 0.7);
      T.tilt -= L.flinchSide * 0.18 * k; T.lean -= 0.18 * k; T.headY -= L.flinchSide * 0.3 * k; T.bodyY += 0.04 * k;
    }
    if (L.yawnT > 0) {
      const k = env(L.yawnT, 2.2);
      arm(T, 'L', 0.3, 2.4 * k, 0.4); T.lean -= 0.18 * k; T.headX -= 0.35 * k; T.jaw = 0.5 * k;
    } else if (L.still > 1.5 && b.speed < 0.3) {
      // tapping his foot, nodding along to a tune only he can hear
      const tap = Math.max(0, S(t * 9));
      leg(T, 'R', 0.25, 0.35, 0.2 + tap * 0.35);
      T.headX += tap * 0.06;
      T.headZ += S(t * 2.2) * 0.08;
    }
  }

  onBikeEvent(e) {
    const ch = this.ch;
    if (!this.mounted) return;
    switch (e.type) {
      case 'sketchyLand': this.windmill = 0.7; ch.tempExpr('shock', 0.8); break;
      case 'perfectLand': this.cheer = e.streak > 1 ? 0.7 : 0.45; ch.tempExpr('sparkle', 1); break;
      case 'pedalSlip': ch.tempExpr('shock', 0.6); break;
      case 'winded': this.say('winded'); break;
      case 'exhausted': ch.kick('sq', 0.82); this.say('exhausted'); break;
      case 'recovered': {
        // he gets his breath back: sits up, a big sigh, a wipe of the brow
        this.L.sighT = 1.4;
        if (this.game.bike.speed < 7) this.L.wipeT = 1.1;
        this.game.sound?.play('sigh', { volume: 0.5 });
        ch.headPiece?.getWorldPosition(_v);
        const b = this.game.bike;
        if (ch.headPiece) this.game.effects?.dustKick?.(_v.x + Math.sin(b.yaw) * 0.16, _v.y, _v.z + Math.cos(b.yaw) * 0.16, { color: [0.94, 0.96, 1], scale: 0.4, vx: b.vel.x * 0.85, vz: b.vel.z * 0.85 });
        this.say('recovered');
        break;
      }
      case 'wheelieStart': ch.tempExpr('determined', 0.6); break;
      case 'stoppieStart': ch.tempExpr('surprised', 0.6); break;
      case 'jump': ch.kick('sq', e.perfect ? 1.3 : 1.18); if (e.perfect) ch.tempExpr('sparkle', 0.6); break;
      case 'land': ch.kick('sq', clamp(1 - e.impact * 0.045, 0.62, 0.92)); break;
      case 'bump': if (!e.rough || e.size > 0.06) ch.kick('sq', 0.88); break;
      case 'frontSlam': case 'rearSlam': ch.kick('sq', 0.8); break;
      case 'dab': ch.tempExpr('sheepish', 0.7); break;
    }
  }

  // Hank says something about being winded: the first time it happens, then only now and then
  say(kind) {
    const g = this.game, st = g.state;
    const flags = st && (st.flags ||= {});
    const now = g.time || 0;
    const first = flags && !flags['puffed_' + kind];
    if (!first && (now - this.popT < 150 || Math.random() < 0.6)) return;
    if (kind === 'winded' && (flags?.puffed_exhausted || !first)) return; // (only ever once, as a warning)
    const lines = {
      winded: ['Huff... huff... I should coast for a bit before my bones give out.'],
      exhausted: [
        'My femurs are on fire... and I don\'t even have muscles.',
        'Need... a breather. Skeletons aren\'t built for sprints.',
        'Huff... huff... Nana makes this look easy and she\'s ninety-one.',
        'If my jaw falls off again I\'m walking.',
      ],
      recovered: ['Ahh. Good as new. Well, good as old.', 'Bones back in business.'],
    }[kind];
    if (!lines) return;
    const i = first ? 0 : 1 + Math.floor(Math.random() * Math.max(1, lines.length - 1));
    if (flags) flags['puffed_' + kind] = true;
    this.popT = now;
    g.ui?.pop?.(lines[Math.min(i, lines.length - 1)], { expr: kind === 'recovered' ? 'happy' : kind === 'exhausted' ? 'dizzy' : 'worried', key: 'winded' });
  }

  // Stopping: a foot swings off its pedal in a little arc and plants on the ground beside
  // the bike (and stays planted there while Bessie shuffles, unless she gets too far from
  // it); setting off it swings back up onto the pedal.
  dab(dt, bike, on, R) {
    if (on && this.dabK < 0.02) this.dabSide = bike.dabSide > 0 ? 'R' : 'L';
    this.dabK = Math.max(0, Math.min(1, this.dabK + (on ? 5.5 : -6.5) * dt));
    R.footL = R.footR = null;
    if (this.dabK <= 0) { this.dabSet = false; return; }
    const V = bike.view || bike;
    const fx = Math.sin(V.yaw), fz = Math.cos(V.yaw);
    const sgn = this.dabSide === 'R' ? 1 : -1; // the rider's right is the bike's -x
    // where the foot goes: beside the saddle, a little out from the frame
    const gx = V.pos.x - fz * 0.3 * sgn - fx * 0.12, gz = V.pos.z + fx * 0.3 * sgn - fz * 0.12;
    if (!this.dabSet || Math.hypot(this.dabAt.x - gx, this.dabAt.z - gz) > 0.4) {
      this.dabAt.set(gx, this.game.physics.groundAt(gx, gz, bike.pos.y + 0.5).h, gz);
      this.dabSet = true;
    }
    const ped = this.pedals?.[this.dabSide === 'L' ? 0 : 1];
    const k = this.dabK, e = k * k * (3 - 2 * k);
    if (ped) {
      ped.updateWorldMatrix(true, false);
      _p.setFromMatrixPosition(ped.matrixWorld);
      _p.y -= 0.025; // the sole on the pedal
    } else _p.copy(this.dabAt);
    this.dabFoot.lerpVectors(_p, this.dabAt, e);
    this.dabFoot.y += Math.sin(k * Math.PI) * 0.09;
    R['foot' + this.dabSide] = this.dabFoot;
    R['pedal' + this.dabSide] = null;
  }

  update(dt, bike, model, camPos) {
    const ch = this.ch;
    ch.visible = this.visible;
    // the bike's forward acceleration, smoothed (for weight shifts)
    if (dt > 0) {
      const a = clamp((bike.fwdSpeed - this.lastFwd) / dt, -14, 14);
      this.bAcc = damp(this.bAcc, bike.grounded ? a : 0, 5, dt);
      this.lastFwd = bike.fwdSpeed;
    }
    this.windmill = Math.max(0, this.windmill - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    if (this.hop) {
      ch.stepY = 0;
      this.updateHop(dt);
      if (this.hop && !this.hop.off) ch.yaw = ch.targetYaw = bike.yaw;
      ch.update(dt, camPos);
      return;
    }
    if (this.onFoot) {
      // the game's Walker drives position; we only animate
      const W = this.game.walker;
      ch.pos.copy(W.pos);
      ch.stepY = W.stepOffset || 0;
      ch.targetYaw = W.yaw;
      ch.speedOverride = W.speed;
      ch.groundSnap = false;
      // sprinting: strides, arm pumps and lean blend in (and out) over a moment
      ch.sprint = damp(ch.sprint || 0, W.sprinting ? 1 : 0, W.sprinting ? 6 : 4, dt);
      if (ch.anim !== 'kick' || ch.animT > 0.75) ch.play(W.grounded ? 'idle' : 'air');
      ch.setExpr(W.sprinting ? 'determined' : W.speed > 4 ? 'happy' : 'neutral');
      ch.update(dt, camPos);
      ch.speedOverride = null;
      return;
    }
    if (ch.sprint) ch.sprint = 0;
    if (this.crashed) {
      if (ch.broken?.phase === 'scatter' && bike.crash < 1.15) ch.reassemble();
      if (this.flopping && bike.crash < 0.45 && ch.anim === 'lie') { ch.play('idle'); ch.kick('sq', 1.2); }
      if (!this.flopping || ch.anim !== 'lie') ch.faceTowards(bike.pos.x, bike.pos.z);
      if (bike.crash <= 0 && !ch.broken) {
        // hop back on
        this.crashed = false;
        this.flopping = false;
        ch.groundSnap = false;
        this.hopOn(model);
        ch.update(dt, camPos);
        return;
      }
    } else if (!this.mounted && this.wantMount) this.mount(model);
    ch.stepY = 0;
    if (this.mounted) {
      // pose follows the bike
      let st = bike.pose;
      if (st === 'crash') st = 'coast';
      const base = { wheelie: 'pedal', manual: 'coast', stoppie: 'brake', nose: 'coast', crouch: 'coast', pop: 'air', flip: 'air', dab: 'idle', slip: 'pedal' }[st] || st;
      ch.rideStyle = base;
      ch.yaw = ch.targetYaw = bike.yaw; // so looking around is measured from the handlebars
      ch.rideCrank = bike.view?.crank ?? bike.crank;
      ch.rideLean = bike.lean;
      this.st = st;
      ch.trickPose = this.poseFn;
      const R = ch.ride;
      if (R) {
        const tr = this.game.tricks;
        const windmill = this.windmill > 0 || this.cheer > 0;
        R.armW = tr?.poseArms || windmill ? 0 : 1;
        R.legW = tr?.poseLegs ? 0 : 1;
        // a foot slips off its pedal; or comes down to the ground to balance (below)
        R.pedalL = this.pedals?.[0];
        R.pedalR = st === 'slip' ? null : this.pedals?.[1];
        this.dab(dt, bike, st === 'dab', R);
        if ((this.cheer > 0 || this.L.yawnT > 0) && !tr?.poseArms) { R.armW = 1; R.gripL = null; } else R.gripL = model.gripL;
        R.gripR = (this.L.waveT > 0 || this.L.wipeT > 0) && !tr?.poseArms && bike.grounded ? null : model.gripR;
        if (this.L.still > 1.5 && bike.speed < 0.3 && st !== 'dab') R.pedalR = null;
      }
      // faces follow the action
      const Lf = this.L;
      if (bike.airTime > 0.45) ch.setExpr(bike.airTime > 1.6 ? 'excited' : bike.airTime > 1.2 || st === 'flip' ? 'sparkle' : 'happy');
      else if (bike.drifting) ch.setExpr('excited');
      else if (st === 'wheelie' || st === 'stoppie' || st === 'crouch') ch.setExpr('determined');
      else if (st === 'manual' || st === 'nose') ch.setExpr('proud');
      else if (bike.wobble > 0.3) ch.setExpr('worried');
      else if (Lf.sighT > 0) ch.setExpr('sleepy');
      else if (bike.exhausted) ch.setExpr('dizzy');
      else if (bike.tired > 0.5) ch.setExpr('worried');
      else if (Lf.effort > 0.4 || (bike.tired > 0.2 && bike.pushing)) ch.setExpr('determined');
      else if (bike.speed > 16) ch.setExpr('excited');
      else if (bike.speed > 11.5) ch.setExpr('happy');
      else if (Lf.humT > 0) ch.setExpr('happy');
      else if (Lf.still > 12) ch.setExpr('sleepy');
      else ch.setExpr('neutral');
      if (!this.crashed) this.life(dt, bike);
      else ch.lookTarget = null;
    }
    ch.update(dt, camPos);
    // the cat rides in the basket
    if (this.cat && this.catOn) {
      this.catT += dt;
      model.basket.updateWorldMatrix(true, false);
      model.basket.matrixWorld.decompose(this.cat.mesh.position, this.cat.mesh.quaternion, _v);
      const happy = bike.airTime > 0.3 || bike.boostTime > 0 || bike.wheelie > 0.3;
      const bob = Math.max(0, Math.sin(this.catT * 9)) * Math.min(0.05, bike.speed * 0.004) + (happy ? 0.06 : 0);
      this.catBody.position.y = 0.02 + bob;
      this.catBody.rotation.y = Math.sin(this.catT * 0.7) * 0.5;
      this.catBody.scale.y = happy ? 1.15 : 1 + Math.sin(this.catT * 3) * 0.02;
      this.cat.mesh.visible = this.visible && bike.crash <= 0 && model.root.visible;
    }
  }
}
