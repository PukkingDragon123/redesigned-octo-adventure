// A villager's mind: how much they trust Hank (persisted in the save), what
// they're doing this hour, and how they react to a skeleton on a bicycle.
//
//   trust  0-20  terrified  double-take, scream, drop things, run for cover, hide
//                           and peek, slam doors, faint, pray, throw a boot...
//         20-45  wary       keep their distance, back off, nervous small talk
//         45-75  friendly   wave, smile, step aside, gasp then laugh at crashes
//         75+    fan        cheer tricks, clap, run over to chat
//
// Trust grows when Hank delivers cocoa, rings his bell from a polite distance,
// stays calm and slow nearby, or helps them out; speeding at people knocks it back.
// Movement is simple steering along waypoints (npcNav.js), pushed out of solids.
import * as THREE from 'three';
import { PEOPLE, MEETS } from './npcRoutines.js';
import { UMBRELLA_COLORS } from './npcPoses.js';

export const TRUST = { WARY: 20, FRIENDLY: 45, FAN: 75 };
export const moodOf = (t) => (t < TRUST.WARY ? 'terrified' : t < TRUST.FRIENDLY ? 'wary' : t < TRUST.FAN ? 'friendly' : 'fan');
const CANCEL = Symbol('cancel');
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const STAND_POSES = new Set(['idle', 'clipboard', 'knit', 'sip', 'lookout', 'paper']);

export class NpcBrain {
  constructor(V, actor, key) {
    this.V = V;
    this.g = V.game;
    this.a = actor;
    this.key = key;
    this.cfg = PEOPLE[key];
    this.char = actor.char;
    this.mode = 'routine';
    this.waits = [];
    this.tok = 0;
    this.busy = false;
    this.path = null;
    this.home = { x: actor.homePos.x, z: actor.homePos.z, yaw: actor.homeYaw ?? 0 };
    this.door = this.cfg.house ? V.doorOf(this.cfg.house) : null;
    this.cool = {};
    this.bubble = new THREE.Vector3();
    this.lastD = 1e9;
    this.closing = 0;
    this.d = 1e9;
    this.block = null;
    this.goneT = 0;
    this.asleep = 0;
    this.shown = true;
    this.inside = false;
  }

  // ------------------------------------------------------------ trust
  get rec() { return this.V.rec(this.char); }
  get trust() { return this.rec.trust; }
  get mood() { return moodOf(this.trust); }
  addTrust(n, cap = 100) {
    const r = this.rec;
    const before = moodOf(r.trust);
    if (n > 0) {
      if (r.trust >= cap) return;
      r.trust = Math.min(cap, r.trust + n);
    } else r.trust = Math.max(0, r.trust + n);
    const after = moodOf(r.trust);
    if (after !== before) this.onMoodChange(before, after);
  }
  onMoodChange(before, after) {
    const up = ['terrified', 'wary', 'friendly', 'fan'].indexOf(after) > ['terrified', 'wary', 'friendly', 'fan'].indexOf(before);
    if (!up) return;
    this.V.moodToast(this, after);
    if (after === 'wary' && ['hide', 'indoors', 'keepAway', 'cowerOpen'].includes(this.mode)) this.comeOut();
  }

  // ------------------------------------------------------------ tiny coroutines
  // run an async behaviour; starting another cancels this one
  seq(fn) {
    this.cancel();
    const tok = this.tok;
    const w = (s) => {
      if (this.tok !== tok) return Promise.reject(CANCEL);
      return new Promise((res, rej) => this.waits.push({ t: s, res, rej, tok }));
    };
    w.walk = (pts, speed, anim, o) => {
      if (this.tok !== tok) return Promise.reject(CANCEL);
      return this.walk(pts, speed, anim, o);
    };
    w.alive = () => this.tok === tok;
    this.busy = true;
    Promise.resolve()
      .then(() => fn(w))
      .catch((e) => { if (e !== CANCEL) console.error('npc', this.key, e); })
      .finally(() => { if (this.tok === tok) this.busy = false; });
  }
  cancel() {
    this.tok++;
    const ws = this.waits;
    this.waits = [];
    for (const x of ws) x.rej(CANCEL);
    this.stopWalk();
    this.busy = false;
    this.faceHank = false;
    this.peeking = false;
    this.a.onThrow = null;
  }
  tickWaits(dt) {
    if (!this.waits.length) return;
    const due = [];
    for (const x of this.waits) if ((x.t -= dt) <= 0) due.push(x);
    if (!due.length) return;
    this.waits = this.waits.filter((x) => x.t > 0);
    for (const x of due) x.res();
  }

  // ------------------------------------------------------------ walking
  walk(pts, speed = 1.2, anim = null, { faceHank = false, stop = 0.15 } = {}) {
    this.stopWalk();
    const a = this.a;
    if (anim) a.play(anim);
    else if (!['idle', 'umbrella', 'flee', 'sneak', 'carryBag', 'jog', 'pull', 'dragged', 'lantern', 'paper', 'eyes', 'shoo'].includes(a.anim)) a.play(this.walkPose());
    this.path = pts.map((p) => ({ x: p.x, z: p.z, cross: !!p.cross }));
    this.speed = speed;
    this.stopAt = stop;
    this.faceHank = faceHank;
    this.stuckT = 0;
    this.bestD = Infinity;
    return new Promise((res, rej) => { this.walkRes = res; this.walkRej = rej; });
  }
  stopWalk() {
    this.path = null;
    const rej = this.walkRej;
    this.walkRes = this.walkRej = null;
    rej?.(CANCEL);
  }
  walkPose() {
    return this.umbrellaOn() ? 'umbrella' : 'idle';
  }
  walkStep(dt, X) {
    const a = this.a, P = this.path;
    const t = P[0];
    const dx = t.x - a.pos.x, dz = t.z - a.pos.z, d = hyp(dx, dz);
    const last = P.length === 1;
    // wait at the kerb while a bike comes down the road
    if (t.cross && !this.crossing && X.live && !X.onFoot && X.speed > 3 && X.dRoad < 16 && Math.abs(X.p.x - a.pos.x) < 18) {
      a.faceTowards(X.p.x, X.p.z);
      a.lookAt(this.g.playerChar);
      return;
    }
    if (d < (last ? this.stopAt : 0.45)) {
      this.crossing = false;
      P.shift();
      this.stuckT = 0;
      this.bestD = Infinity;
      if (!P.length) {
        this.path = null;
        const res = this.walkRes;
        this.walkRes = this.walkRej = null;
        res?.();
      } else if (P[0].cross) this.crossing = false;
      return;
    }
    if (t.cross) this.crossing = true;
    // slow down near Hank unless running away
    let sp = this.speed;
    if (this.mood !== 'terrified' && sp < 2 && this.d < 2.2) sp *= 0.5;
    const step = Math.min(d, sp * dt);
    a.pos.x += (dx / d) * step;
    a.pos.z += (dz / d) * step;
    // keep out of walls, benches and lamp posts
    this.g.physics.resolve(a.pos, 0.22, 1.6);
    if (this.faceHank) a.faceTowards(X.p.x, X.p.z);
    else a.targetYaw = Math.atan2(dx, dz);
    // stuck? skip the waypoint (or give up)
    if (d < this.bestD - 0.05) { this.bestD = d; this.stuckT = 0; }
    else if ((this.stuckT += dt) > 1.6) {
      this.stuckT = 0;
      this.bestD = Infinity;
      if (last) { this.path = [{ x: a.pos.x, z: a.pos.z }]; }
      else P.shift();
    }
  }

  // ------------------------------------------------------------ helpers
  setShown(v) {
    this.shown = v;
    const a = this.a;
    a.visible = v && !a.hiddenByStory;
  }
  say(text, ms = 2300, force = false) {
    if (!text || !this.shown || (!force && this.d > 32)) return;
    this.V.bubble(this, text, ms);
  }
  scream(vol = 1) {
    this.V.sfx('scream', this.a.pos, vol, this.cfg.scream ?? 1);
  }
  umbrellaOn() {
    return this.V.raining && !!this.cfg.umbrella;
  }
  // out comes the umbrella (unless they're fishing, chopping or playing hockey in it)
  rainPose(pose) {
    return this.umbrellaOn() && !this.cfg.kid && !['fish', 'chop', 'hockey', 'lantern'].includes(pose) ? 'umbrella' : pose;
  }
  // the umbrella in their own colour (the pose's default one is black)
  fixUmbrella() {
    const a = this.a;
    if (a.anim !== 'umbrella' || !this.cfg.umbrella) return;
    const h = a.held.R;
    if (h?.userData.colorKey === this.cfg.umbrella) return;
    a.hold(this.V.umbrellaMesh(UMBRELLA_COLORS[this.cfg.umbrella] ?? 0x24222c, this.cfg.umbrella), 'R');
  }
  dropHeld() {
    const a = this.a;
    const h = a.held.R;
    if (!h || !h.userData.held) return;
    this.V.litter.drop(h);
    a.held.R = null;
  }
  hankVisible() {
    return this.g.rider.visible !== false || this.g.onFoot;
  }

  // ------------------------------------------------------------ per frame
  update(dt, X) {
    const a = this.a;
    this.tickWaits(dt);
    for (const k in this.cool) this.cool[k] -= dt;
    const d = (this.d = X.dist(a));
    const cl = Math.max(-20, Math.min(20, (this.lastD - d) / Math.max(dt, 1e-3)));
    this.closing += (cl - this.closing) * Math.min(1, dt * 6);
    this.lastD = d;
    if (this.path) this.walkStep(dt, X);
    if (this.leash) this.followLeash(dt, X);
    else if (X.live && this.mode !== 'engaged' && this.mode !== 'script') this.perceive(dt, X);
    // the hour moved on (or it started raining, or Hank picked up their order): drop what they're doing
    if (this.mode === 'routine' && this.busy && this._act && (this._chk = (this._chk || 0) - dt) < 0) {
      this._chk = 1;
      if (this.V.blockOf(this) !== this._act.block) this.cancel();
    }
    if (!this.busy && !this.leash) this.next(X);
    if (this.mode === 'routine' && !this.path) this.fixUmbrella();
    // heads turn as Hank goes by
    if (this.mode === 'routine' && X.live) {
      if (d < 10 && this.shown) { if (a.lookTarget !== this.g.playerChar) a.lookAt(this.g.playerChar); }
      else if (a.lookTarget === this.g.playerChar) a.lookAt(null);
    }
    this.bubble.set(a.pos.x, a.pos.y + a.hop + a.P.height + 0.35, a.pos.z);
  }

  // what happens around Hank (only while he's riding about, not in cutscenes)
  perceive(dt, X) {
    const a = this.a, d = this.d, sp = X.speed, mood = this.mood;
    const calm = sp < 1.7 && d < 24 && d > 2.4 && !X.crashed;
    const seen = this.shown && this.hankVisible();
    if (mood === 'terrified') {
      if (this.mode === 'routine' && seen && d < 13 + Math.min(11, sp * 0.9)) return this.startle(X);
      // a mum won't let her kids go near the skeleton
      if (this.cfg.fear === 'kids' && this.mode === 'routine' && d < 45 && this.V.kidBrains().some((k) => k.d < 9 && k.shown && !k.leash)) return this.startle(X);
      if (['hide', 'indoors', 'keepAway', 'cowerOpen'].includes(this.mode)) {
        // calm, slow Hank wins them over little by little
        if (calm && (this.peeking || this.mode === 'keepAway')) this.addTrust(dt * (X.onFoot ? 1.7 : 1.2), TRUST.WARY + 6);
        else if (calm && this.mode !== 'indoors') this.addTrust(dt * 0.45, TRUST.WARY + 6);
        if (this.mood !== 'terrified') return;
        const pushy = d < 3.2 || (d < 7 && sp > 5 && this.closing > 2);
        if (pushy && !(this.cool.panic > 0)) { this.cool.panic = 2.5; return this.panicAgain(X); }
        if (d > 30) { if ((this.goneT += dt) > 5) { this.goneT = 0; return this.allClear(); } }
        else this.goneT = 0;
      }
      return;
    }
    if (this.mode !== 'routine') return;
    if (mood === 'wary') {
      if (d < 3.4 && (sp > 1.2 || this.closing > 0.8 || d < 2) && !(this.cool.back > 0)) { this.cool.back = 2.5; return this.backOff(X); }
      if (d < 7 && sp < 3 && !(this.cool.talk > 0) && seen) {
        this.cool.talk = rand(18, 30);
        a.tempExpr('worried', 2.5);
        this.say(pick(this.cfg.wary || ['...Hello.']));
      }
      return;
    }
    // friendly & fans: get out of the way of a speeding bike, wave, chat
    if (!X.onFoot && sp > 5.5 && d < 7 && !(this.cool.aside > 0) && X.headingAt(a) < 1.4) { this.cool.aside = 3; return this.stepAside(X); }
    if (d < 9 && sp < 4 && seen && !(this.cool.wave > 0)) {
      this.cool.wave = rand(35, 55);
      a.react('hi');
      if (Math.random() < 0.7) this.say(pick(this.cfg.hello || ['Hi, Hank!']));
      a.tempExpr('happy', 2);
    }
    if (mood === 'fan' && sp < 0.6 && d < 11 && d > 3 && !(this.cool.fan > 0)) { this.cool.fan = rand(50, 80); return this.fanChat(X); }
  }

  // pick up the day's plan again
  next(X) {
    if (this.mode !== 'routine' && this.mode !== 'engaged') { this.mode = 'routine'; }
    if (this.mode === 'engaged') return;
    const act = this.V.activityFor(this);
    this.block = act.block;
    this.seq((w) => this.doActivity(w, act, X));
  }

  // ------------------------------------------------------------ everyday life
  async doActivity(w, act, X) {
    const a = this.a, V = this.V;
    const stillOn = () => V.blockOf(this) === act.block;
    const walkTo = async (pt, speed = 1.15) => {
      if (hyp(pt.x - a.pos.x, pt.z - a.pos.z) < 0.3) return;
      if (this.inside) await this.comeOutside(w);
      const pts = V.nav.route(a.pos, pt);
      await w.walk(pts, speed);
    };
    const settle = (yaw, pose, expr = 'neutral') => {
      if (yaw != null) a.face(yaw);
      a.play(pose && pose !== 'idle' ? pose : this.umbrellaOn() ? 'umbrella' : 'idle', expr);
      this.fixUmbrella();
    };
    // idle variety while standing about: glance round, nod, a little shuffle
    const linger = async (pose, yaw) => {
      while (stillOn()) {
        await w(rand(6, 12));
        if (!stillOn()) break;
        const r = Math.random();
        if (r < 0.25 && STAND_POSES.has(a.anim)) a.react(pick(['nod', 'bounce']));
        else if (r < 0.35 && a.anim !== 'sit' && !a.anim.startsWith('sit')) {
          // a little shuffle on the spot
          const h = { x: a.pos.x + rand(-0.6, 0.6), z: a.pos.z + rand(-0.6, 0.6) };
          if (V.nav.clear(a.pos, h)) { await w.walk([h], 0.7); settle(yaw, pose); }
        }
      }
    };
    switch (act.k) {
      case 'inside': {
        if (this.door && this.d < 120) {
          if (!this.inside) {
            await walkTo({ x: this.door.x + this.door.nx * 0.3, z: this.door.z + this.door.nz * 0.3 });
            this.goIndoors(false);
          }
        } else this.setShown(false);
        while (stillOn()) await w(3);
        return;
      }
      case 'home': {
        const pose = this.rainPose(act.pose || V.idlePose(this));
        await walkTo(this.home);
        settle(this.home.yaw, pose);
        if (this.cfg.kid) return this.kidPlay(w, stillOn);
        await linger(pose, this.home.yaw);
        return;
      }
      case 'at': {
        await walkTo(act);
        const pose = this.rainPose(act.pose);
        settle(act.yaw, pose);
        await linger(pose, act.yaw);
        return;
      }
      case 'bench': {
        const b = V.claimBench(this, act);
        if (!b) { await walkTo(this.home); settle(this.home.yaw, V.idlePose(this)); await linger(); return; }
        try {
          const front = { x: b.x + Math.sin(b.yaw) * 0.7, z: b.z + Math.cos(b.yaw) * 0.7 };
          await walkTo(front);
          a.pos.set(b.x, a.pos.y, b.z);
          a.yaw = a.targetYaw = b.yaw;
          a.play(act.pose || 'sit', 'neutral');
          a.jump(1.2);
          while (stillOn()) {
            await w(rand(8, 14));
            if (Math.random() < 0.3) a.react('nod');
          }
          a.play('idle');
          a.jump(1.8);
          await w(0.4);
          await w.walk([front], 1);
        } finally { V.releaseBench(this); }
        return;
      }
      case 'patrol': {
        const pts = act.pts;
        let i = pts.reduce((bi, p, k) => (hyp(p.x - a.pos.x, p.z - a.pos.z) < hyp(pts[bi].x - a.pos.x, pts[bi].z - a.pos.z) ? k : bi), 0);
        while (stillOn()) {
          i = (i + 1) % pts.length;
          await w.walk(V.nav.route(a.pos, pts[i]), 1.1, act.pose || null);
          if (act.pose) a.play(act.pose);
          else settle(null, 'idle');
          a.react('nod');
          await w(rand(3, 7));
        }
        return;
      }
      case 'jog': {
        if (this.umbrellaOn()) { await walkTo(this.home); settle(this.home.yaw, 'umbrella'); await linger(); return; }
        for (const p of act.pts) {
          if (!stillOn()) break;
          await w.walk([p], 2.7, 'jog');
        }
        a.play('idle');
        await w(2);
        return;
      }
      case 'errand': {
        await walkTo(act.to);
        settle(0, 'idle');
        a.react('nod');
        await w(rand(5, 8));
        a.play(act.carry || 'carryBag');
        await w.walk(V.nav.route(a.pos, this.home), 1.05, act.carry || 'carryBag');
        a.react('nod');
        settle(this.home.yaw, 'idle');
        await linger();
        return;
      }
      case 'chat': {
        const M = MEETS[act.meet];
        const ppl = V.meetMembers(act.meet);
        const i = Math.max(0, ppl.indexOf(this.key));
        const ang = (i / Math.max(2, ppl.length)) * Math.PI * 2 + 0.6;
        const spot = { x: M.x + Math.sin(ang) * M.r, z: M.z + Math.cos(ang) * M.r };
        await walkTo(spot);
        a.faceTowards(M.x, M.z);
        settle(null, 'idle');
        while (stillOn()) {
          // take turns: talk with gestures, then listen (nod, laugh)
          const mates = V.meetPresent(act.meet, this);
          if (mates.length) {
            a.faceTowards(M.x, M.z);
            const mate = pick(mates);
            a.lookAt(mate.a);
            if (Math.random() < 0.5) { a.say(rand(1.8, 3.2)); a.tempExpr(pick(['happy', 'neutral', 'surprised']), 2); }
            else if (Math.random() < 0.3) a.react(pick(['laugh', 'nod', 'nod', 'shake']));
          }
          await w(rand(2.2, 3.6));
        }
        a.lookAt(null);
        return;
      }
      default:
        await w(2);
    }
  }

  // Pip & Pop: hockey on the rink, skating little circles, shouting
  async kidPlay(w, stillOn) {
    const a = this.a;
    while (stillOn()) {
      await w(rand(3, 7));
      if (!stillOn()) break;
      if (Math.random() < 0.5) {
        const h = { x: this.home.x + rand(-2.5, 2.5), z: this.home.z + rand(-2, 2) };
        await w.walk([h], 1.8, 'hockey');
        a.play('hockey');
      } else if (Math.random() < 0.4) a.react(pick(['yay', 'spin']));
      a.face(this.home.yaw + rand(-0.8, 0.8));
    }
  }

  // ------------------------------------------------------------ meeting a skeleton
  startle(X) {
    const first = !this.rec.met;
    this.rec.met = true;
    this.mode = 'startle';
    const style = this.cfg.fear;
    if (style === 'cool') return this.kidsMeet(X, first);
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      const P = X.p;
      a.faceTowards(P.x, P.z);
      a.lookAt(g.playerChar);
      if (this.inside) { this.setShown(true); this.inside = false; }
      if (first || Math.random() < 0.4) { a.react('doubletake'); await w(0.72); }
      else { a.react('eep'); await w(0.25); }
      this.dropHeld();
      a.showEmote('alert', 1.6);
      a.tempExpr('shock', 2);
      switch (style) {
        case 'faint':
          this.scream(0.7);
          this.say(pick(this.cfg.scare), 2200, true);
          if (first) {
            await w(0.6);
            a.play('swoon', 'ko');
            this.g.effects?.dizzy?.(a.pos.x, a.pos.y + 0.6, a.pos.z);
            await w(4.2);
            a.play('idle', 'dizzy');
            a.jump(1.6);
            await w(1.0);
            a.tempExpr('scared', 2);
          } else { a.play('eyes', 'scared'); await w(1.4); }
          break;
        case 'shoe':
          this.say(pick(this.cfg.scare), 2200, true);
          a.play('angry', 'angry');
          await w(0.3);
          a.onThrow = () => this.V.litter.throwBoot(a, X.p);
          a.react('throw');
          await w(1.0);
          break;
        case 'whistle':
          this.say(pick(this.cfg.scare), 2400, true);
          a.play('whistle', 'angry');
          this.V.sfx('whistle', a.pos, 0.9);
          await w(0.9);
          this.V.sfx('whistle', a.pos, 0.8);
          await w(0.9);
          return this.keepAway();
        case 'hands':
          this.scream();
          this.say(pick(this.cfg.scare), 2200, true);
          a.react('scream');
          await w(0.9);
          a.play('eyes', 'scared');
          await w(2.0);
          break;
        case 'pray':
          this.say(pick(this.cfg.scare), 2600, true);
          a.play('pray', 'scared');
          await w(2.8);
          break;
        case 'notes':
          this.scream(0.6);
          this.say(pick(this.cfg.scare), 2400, true);
          a.react('gasp');
          await w(1.2);
          break;
        case 'duck':
          this.say(pick(this.cfg.scare), 2400, true);
          a.react('eep');
          await w(0.5);
          return this.hide({ kind: 'here', x: a.pos.x, z: a.pos.z, yaw: a.yaw, pose: 'cower', peekPose: 'peekLow' });
        case 'kids':
          return this.fetchKids(X, w);
        default:
          this.scream(1.1);
          this.say(pick(this.cfg.scare), 2200, true);
          a.react('scream');
          await w(1.1);
      }
      await this.runForCover(w, X);
    });
  }

  async runForCover(w, X, avoid = null) {
    const a = this.a, V = this.V;
    const c = V.nav.cover(a.pos, X.p, { door: this.door, preferDoor: this.cfg.fear === 'faint' || this.cfg.fear === 'hands' || this.cfg.fear === 'pray', avoid });
    this.mode = 'flee';
    a.lookAt(null);
    if (Math.random() < 0.6) this.scream(0.6);
    await w.walk(c.path, this.cfg.run ?? 3.4, 'flee');
    if (c.kind === 'door') return this.goIndoors(true);
    return this.hide(c);
  }

  // hide behind cover and peek out now and then
  hide(c) {
    this.mode = c.kind === 'open' ? 'cowerOpen' : 'hide';
    this.cover = c;
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      this.mode = c.kind === 'open' ? 'cowerOpen' : 'hide';
      a.face(c.yaw);
      a.play(c.pose, 'scared');
      a.lookAt(null);
      // Dr. Ingrid can't help taking notes on the specimen
      const peekPose = this.cfg.fear === 'notes' && c.kind !== 'low' ? 'clipboard' : c.peekPose;
      await w(rand(1.2, 2.2));
      for (;;) {
        a.peekSide = c.side || (Math.random() < 0.5 ? 1 : -1);
        a.play(peekPose, 'worried');
        a.lookAt(g.playerChar);
        this.peeking = true;
        if (Math.random() < 0.35 && !(this.cool.peekTalk > 0)) { this.cool.peekTalk = 9; this.say(pick(this.cfg.peek || ['Is it gone?']), 2000); }
        await w(rand(1.6, 3.0));
        this.peeking = false;
        a.lookAt(null);
        a.play(c.pose, 'scared');
        await w(rand(1.6, 3.6));
      }
    });
  }

  // indoors with the door shut, peeking out when Hank isn't too close
  goIndoors(slam) {
    const a = this.a, D = this.door;
    this.mode = slam ? 'indoors' : this.mode;
    this.inside = true;
    if (D) a.pos.set(D.x - D.nx * 0.2, a.pos.y, D.z - D.nz * 0.2);
    this.setShown(false);
    a.lookAt(null);
    if (slam) {
      this.V.sfx('door_slam', a.pos, 1);
      this.V.slamFx(this);
      this.seq(async (w) => {
        this.mode = 'indoors';
        for (;;) {
          await w(rand(3.5, 6.5));
          if (this.d > 30 || this.d < 5 || this.V.ctx.speed > 5) continue;
          await this.peekOutDoor(w);
        }
      });
    }
  }
  async peekOutDoor(w) {
    const a = this.a, D = this.door, g = this.g;
    if (!D) return;
    this.V.sfx('door_creak', a.pos, 0.35);
    a.pos.set(D.x + D.nx * 0.12, a.pos.y, D.z + D.nz * 0.12);
    a.yaw = a.targetYaw = D.yaw;
    a.peekSide = Math.random() < 0.5 ? 1 : -1;
    a.play('peekDoor', 'worried');
    this.setShown(true);
    a.lookAt(g.playerChar);
    this.peeking = true;
    if (Math.random() < 0.4) this.say(pick(this.cfg.peek || ['...']), 1800);
    // a nosy look: the door snaps shut again if Hank comes at them
    let t = rand(2.2, 3.6);
    while (t > 0) {
      await w(0.2);
      t -= 0.2;
      if (this.d < 4.5 || (this.V.ctx.speed > 5 && this.closing > 2)) {
        a.react('eep');
        await w(0.25);
        this.V.sfx('door_slam', a.pos, 0.9);
        this.V.slamFx(this);
        break;
      }
    }
    this.peeking = false;
    a.lookAt(null);
    this.setShown(false);
  }
  // used by routines: step back out of the front door
  async comeOutside(w) {
    const a = this.a, D = this.door;
    this.inside = false;
    if (D) {
      a.pos.set(D.x + D.nx * 0.3, a.pos.y, D.z + D.nz * 0.3);
      a.yaw = a.targetYaw = D.yaw;
      this.V.sfx('door', a.pos, 0.3);
    }
    this.setShown(true);
    await w(0.3);
  }

  // someone knocked: open up and stand on the step
  answerDoor() {
    const a = this.a, D = this.door;
    this.cancel();
    this.inside = false;
    if (D) {
      a.pos.set(D.x + D.nx * 0.45, a.pos.y, D.z + D.nz * 0.45);
      a.yaw = a.targetYaw = D.yaw;
    }
    this.setShown(true);
    a.play('idle', 'surprised');
    this.mode = 'routine';
  }

  // Hank came at them again: eep! and off to somewhere else
  panicAgain(X) {
    this.seq(async (w) => {
      const a = this.a;
      if (this.mode === 'indoors') return this.goIndoors(true);
      a.faceTowards(X.p.x, X.p.z);
      a.react(Math.random() < 0.5 ? 'scream' : 'eep');
      if (Math.random() < 0.5) this.scream(0.8);
      this.addTrust(-1.5);
      await w(0.6);
      await this.runForCover(w, X, this.cover);
    });
  }
  // Hank's gone: back to what they were doing, a bit jumpy
  allClear() {
    this.seq(async (w) => {
      const a = this.a;
      if (this.inside) await this.comeOutside(w);
      a.play('idle', 'worried');
      a.react('shake');
      await w(1.2);
      this.mode = 'routine';
      this.busy = false;
    });
  }
  // won over enough to come out (still nervous)
  comeOut() {
    this.releaseKids?.();
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      if (this.inside) await this.comeOutside(w);
      this.mode = 'keepAway';
      a.play('idle', 'worried');
      a.faceTowards(g.playerPos.x, g.playerPos.z);
      a.lookAt(g.playerChar);
      a.showEmote('question', 1.5);
      await w(0.6);
      this.say(pick(this.cfg.wary || ['...Hello?']), 2400, true);
      await w(3.0);
      this.mode = 'routine';
      this.busy = false;
    });
  }
  // Constable Doug keeps an eye on the suspect from a safe distance
  keepAway() {
    this.mode = 'keepAway';
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      this.mode = 'keepAway';
      a.lookAt(g.playerChar);
      let t = 0;
      for (;;) {
        const P = g.playerPos;
        const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
        if (d < 2.6 && this.V.ctx.speed > 4) return this.runForCover(w, this.V.ctx);
        if (d < 6.5) {
          const to = { x: P.x + (dx / d) * 8.5, z: P.z + (dz / d) * 8.5 };
          a.play('point', 'scared');
          await w.walk([to], 2.4, 'point', { faceHank: true, stop: 0.6 }).catch((e) => { if (e === CANCEL && !w.alive()) throw e; });
        }
        a.faceTowards(P.x, P.z);
        a.play(t % 3 < 1 ? 'whistle' : 'point', 'angry');
        if (t % 3 < 1 && Math.random() < 0.5) this.V.sfx('whistle', a.pos, 0.5);
        if (Math.random() < 0.15) this.say(pick(this.cfg.peek), 2000);
        await w(1.0);
        t++;
      }
    });
  }
  // wary: a couple of steps back if Hank crowds them
  backOff(X) {
    this.seq(async (w) => {
      const a = this.a;
      this.mode = 'keepAway';
      const dx = a.pos.x - X.p.x, dz = a.pos.z - X.p.z, d = hyp(dx, dz) || 1;
      a.react('eep');
      a.tempExpr('worried', 2.5);
      const to = { x: a.pos.x + (dx / d) * 2.6, z: a.pos.z + (dz / d) * 2.6 };
      if (this.V.nav.clear(a.pos, to)) await w.walk([to], 2.2, 'idle', { faceHank: true });
      a.lookAt(this.g.playerChar);
      await w(2.2);
      this.mode = 'routine';
      this.busy = false;
    });
  }
  stepAside(X) {
    this.seq(async (w) => {
      const a = this.a;
      const f = X.fwd;
      // which side of the bike's path are we on?
      const rx = a.pos.x - X.p.x, rz = a.pos.z - X.p.z;
      const side = Math.sign(rx * f.z - rz * f.x) || 1;
      const to = { x: a.pos.x + f.z * side * 1.5, z: a.pos.z - f.x * side * 1.5 };
      a.react('eep');
      if (this.V.nav.clear(a.pos, to)) await w.walk([to], 3.2, 'idle', { faceHank: true });
      if (this.mood !== 'fan' && Math.random() < 0.6) { a.react('angry'); this.say(pick(['Slow down, Hank!', 'Watch it!', 'Sidewalk\'s for walking!', 'Whoa there!']), 1800); this.addTrust(-1); }
      else if (Math.random() < 0.5) { a.react('yay'); this.say(pick(['Woo! Go Hank!', 'Look at him go!']), 1600); }
      await w(1.4);
      this.mode = 'routine';
      this.busy = false;
    });
  }
  fanChat(X) {
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      const P = g.playerPos;
      const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
      const to = { x: P.x + (dx / d) * 2.2, z: P.z + (dz / d) * 2.2 };
      if (this.V.nav.clear(a.pos, to)) await w.walk([to], 2.2, 'idle', { faceHank: true });
      a.faceTowards(P.x, P.z);
      a.lookAt(g.playerChar);
      a.react('yay');
      this.say(pick(this.cfg.fan || this.cfg.hello || ['Hank!']), 2600, true);
      a.say(2);
      await w(3);
      this.busy = false;
    });
  }

  // ------------------------------------------------------------ the kids and their mum
  kidsMeet(X, first) {
    this.seq(async (w) => {
      const a = this.a, g = this.g;
      a.faceTowards(X.p.x, X.p.z);
      a.lookAt(g.playerChar);
      a.react('doubletake');
      await w(0.8);
      this.say(pick(this.cfg.scare), 2400, true);
      a.play('excited', 'sparkle');
      g.sound.play('gasp', { volume: 0.3, pitch: 1.6 });
      this.addTrust(first ? 48 : 30, 60);
      await w(1.2);
      // run up to have a closer look
      const P = g.playerPos;
      const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
      if (d > 3.5) {
        const to = { x: P.x + (dx / d) * 2.6, z: P.z + (dz / d) * 2.6 };
        await w.walk(this.V.nav.clear(a.pos, to) ? [to] : [{ x: a.pos.x, z: a.pos.z }], 3.2, 'idle');
      }
      a.faceTowards(P.x, P.z);
      a.play('excited', 'sparkle');
      await w(2.5);
      this.mode = 'routine';
      this.busy = false;
    });
  }
  // Josée sees a skeleton near her children
  fetchKids(X, w) {
    const kids = this.V.kidBrains().filter((k) => hyp(k.a.pos.x - this.a.pos.x, k.a.pos.z - this.a.pos.z) < 45 && k.a.visible);
    return (async () => {
      const a = this.a, g = this.g;
      this.scream(1.2);
      this.say(pick(this.cfg.scare), 2600, true);
      a.react('scream');
      await w(1.0);
      if (kids.length) {
        const cx = kids.reduce((s, k) => s + k.a.pos.x, 0) / kids.length, cz = kids.reduce((s, k) => s + k.a.pos.z, 0) / kids.length;
        await w.walk([{ x: cx, z: cz }], this.cfg.run, 'flee', { stop: 0.9 });
        for (const k of kids) k.grab(this);
        a.play('pull', 'angry');
        this.kids = kids;
      }
      const c = this.V.nav.cover(a.pos, g.playerPos, { door: null });
      this.mode = 'flee';
      await w.walk(c.path, kids.length ? 2.6 : this.cfg.run, kids.length ? 'pull' : 'flee');
      return this.hide(c);
    })();
  }
  releaseKids() {
    for (const k of this.kids || []) k.letGo();
    this.kids = null;
  }
  grab(mum) {
    this.cancel();
    this.leash = mum;
    this.mode = 'script';
    this.a.play('dragged', 'happy');
    this.a.lookAt(this.g.playerChar);
  }
  letGo() {
    this.leash = null;
    this.mode = 'routine';
    this.busy = false;
    this.a.lookAt(null);
  }
  followLeash(dt, X) {
    const m = this.leash, a = this.a;
    if (!m || m.mode === 'routine' || !m.a.visible) return this.letGo();
    const i = m.kids?.indexOf(this) ?? 0;
    const f = { x: Math.sin(m.a.yaw), z: Math.cos(m.a.yaw) };
    const side = i % 2 ? 1 : -1;
    const tx = m.a.pos.x - f.x * 0.75 + f.z * side * 0.55, tz = m.a.pos.z - f.z * 0.75 - f.x * side * 0.55;
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = hyp(dx, dz);
    if (d > 0.05) {
      const sp = Math.min(d, Math.max(1, d * 4) * dt * 1.0 + (m.path ? m.speed * dt : 0));
      a.pos.x += (dx / d) * sp;
      a.pos.z += (dz / d) * sp;
    }
    const hiding = m.mode === 'hide';
    if (hiding) {
      // peek round mum and wave at the nice skeleton
      a.faceTowards(X.p.x, X.p.z);
      if (a.anim !== 'peek' && a.anim !== 'excited') { a.peekSide = side; a.play('peek', 'happy'); }
      if (!(this.cool.kidwave > 0)) { this.cool.kidwave = rand(2, 4); a.react('hi'); if (Math.random() < 0.3) this.say(pick(['Bye, skeleton!', 'Mom, he\'s NICE!', 'Hi Hank!!']), 1600, true); }
    } else {
      a.targetYaw = m.a.yaw;
      if (a.anim !== 'dragged') a.play('dragged', 'happy');
    }
  }

  // ------------------------------------------------------------ reactions to Hank's antics
  onBell(X) {
    const a = this.a, d = this.d, mood = this.mood;
    if (!this.shown && this.mode !== 'indoors') return;
    if (this.cool.bell > 0) return;
    this.cool.bell = 4;
    if (mood === 'terrified') {
      if (d > 5) { this.addTrust(3, TRUST.WARY + 6); if (this.shown) { a.react('flinch'); a.showEmote('question', 1.4); } }
      else if (this.shown) { a.react('eep'); a.showEmote('alert', 1.2); }
      if (this.mode === 'indoors' && d < 25 && d > 5 && !this.busy) this.goIndoors(true);
      return;
    }
    if (mood === 'wary') { this.addTrust(2, TRUST.FRIENDLY + 4); a.faceTowards(X.p.x, X.p.z); a.react('nod'); a.showEmote('sweat', 1.4); return; }
    this.addTrust(0.6);
    a.faceTowards(X.p.x, X.p.z);
    a.react('hi');
    a.showEmote(Math.random() < 0.5 ? 'note' : 'heart', 1.6);
    if (Math.random() < 0.4) this.say(pick(this.cfg.hello || ['Hi, Hank!']), 1800);
  }
  onCrash(X) {
    const a = this.a, mood = this.mood;
    if (!this.shown || this.d > 18 || this.mode === 'engaged') return;
    if (mood === 'terrified') {
      if (this.mode === 'routine') return this.startle(X);
      a.react('eep');
      return;
    }
    a.faceTowards(X.p.x, X.p.z);
    if (this.mode !== 'routine' || this.busy && this.path) { a.react('gasp'); return; }
    this.seq(async (w) => {
      a.react('gasp');
      a.lookAt(this.g.playerChar);
      await w(rand(0.9, 1.4));
      if (mood === 'wary') { a.tempExpr('worried', 2); if (Math.random() < 0.4) a.react('laugh'); await w(1); this.busy = false; return; }
      a.react('laugh');
      if (Math.random() < 0.4) this.say(pick(['Ha! You okay, Hank?', 'Ooh, that one rattled!', 'Bones everywhere!', 'Ten out of ten!']), 1900);
      await w(1.4);
      // friends come over to check he's all in one piece
      if (this.d < 11 && !(this.cool.help > 0)) {
        this.cool.help = 40;
        const P = this.g.playerPos;
        const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
        const to = { x: P.x + (dx / d) * 1.4, z: P.z + (dz / d) * 1.4 };
        if (this.V.nav.clear(a.pos, to)) {
          await w.walk([to], 2.6, 'idle', { faceHank: true });
          a.play('offer', 'worried');
          this.say(pick(['Up you get, Hank!', 'Need a hand? Or... a femur?', 'All your bits there?']), 2200, true);
          await w(2.4);
          a.play('idle', 'happy');
        }
      }
      this.busy = false;
    });
  }
  onTrick(kind, X) {
    const a = this.a, mood = this.mood;
    if (!this.shown || this.d > 26 || this.mode === 'engaged') return;
    if (mood === 'terrified') { if (this.peeking || this.mode === 'routine') a.react('eep'); return; }
    if (this.mode !== 'routine' || this.cool.trick > 0) return;
    this.cool.trick = 2.5;
    a.faceTowards(X.p.x, X.p.z);
    if (mood === 'wary') { a.react('gasp'); a.tempExpr('surprised', 1.5); this.addTrust(0.8, TRUST.FRIENDLY - 1); return; }
    if (mood === 'friendly') { a.react(Math.random() < 0.5 ? 'gasp' : 'clap'); this.addTrust(0.4); return; }
    a.react(Math.random() < 0.5 ? 'yay' : 'clap');
    a.tempExpr('sparkle', 1.5);
    if (Math.random() < 0.5) this.say(pick(['WOOO!', 'Bravo!', 'Do it again!', 'HANK! HANK! HANK!', 'Magnifique!']), 1500);
    this.addTrust(0.4);
  }

  // ------------------------------------------------------------ deliveries while they're scared
  // edge in, snatch the cup, scurry off (the game never gets stuck)
  snatch(o) {
    const g = this.g;
    this.mode = 'script';
    this.seq(async (w) => {
      const a = this.a;
      const P = g.playerPos;
      a.faceTowards(P.x, P.z);
      a.lookAt(g.playerChar);
      a.showEmote('sweat', 2);
      const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
      const to = { x: P.x + (dx / d) * 1.15, z: P.z + (dz / d) * 1.15 };
      if (d > 1.4) await w.walk([to], 0.9, 'sneak', { faceHank: true });
      a.react('flinch');
      g.sound.play('paper', { volume: 0.4 });
      const r = this.V.payFor(o, this, 'snatch');
      a.play('flee', 'scared');
      this.say(pick(['Th-thank you! Please don\'t haunt me!', 'Money\'s on the ground! Bye!', 'EEP! Merci!', 'Keep the change!']), 2000, true);
      await w(0.4);
      this.addTrust(r.quality > 55 ? 16 : 11, TRUST.FRIENDLY - 1);
      a.tempExpr('scared', 2);
      this.mode = 'startle';
      if (this.mood === 'terrified') await this.runForCover(w, this.V.ctx);
      else { const away = { x: a.pos.x + (dx / d) * 3, z: a.pos.z + (dz / d) * 3 }; await w.walk([away], 2.4, 'idle', { faceHank: true }); this.mode = 'routine'; this.busy = false; }
    });
  }
  // leave it on the step; they dart out for it once Hank has backed off
  leaveOnStep(o) {
    const D = this.door, g = this.g;
    const cup = this.V.litter.stepCup(D);
    this.V.payFor(o, this, 'step');
    this.mode = 'script';
    this.seq(async (w) => {
      const a = this.a;
      for (let t = 0; t < 40; t += 0.5) {
        await w(0.5);
        if (this.d > 6.5 && t > 1.5) break;
      }
      this.V.sfx('door_creak', a.pos, 0.4);
      a.pos.set(D.x + D.nx * 0.2, a.pos.y, D.z + D.nz * 0.2);
      a.yaw = a.targetYaw = D.yaw;
      this.setShown(true);
      a.play('sneak', 'worried');
      await w.walk([{ x: cup.position.x, z: cup.position.z }], 1.8, 'sneak', { stop: 0.35 });
      a.react('pickup');
      await w(0.5);
      this.V.litter.remove(cup);
      a.lookAt(g.playerChar);
      a.showEmote('heart', 1.4);
      this.addTrust(13, TRUST.FRIENDLY - 1);
      await w(0.6);
      if (this.mood === 'terrified') {
        await w.walk([{ x: D.x + D.nx * 0.2, z: D.z + D.nz * 0.2 }], 2.6, 'flee');
        this.goIndoors(true);
      } else { a.play('sip', 'happy'); this.say(pick(this.cfg.wary || ['...Thank you.']), 2000); await w(2.5); this.mode = 'routine'; this.busy = false; }
    });
  }
  // wary customers take the cup at arm's length
  async nervousGrab() {
    const a = this.a, g = this.g;
    this.cancel();
    this.mode = 'engaged';
    const P = g.playerPos;
    a.faceTowards(P.x, P.z);
    a.lookAt(g.playerChar);
    const dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = hyp(dx, dz) || 1;
    const to = { x: P.x + (dx / d) * 1.2, z: P.z + (dz / d) * 1.2 };
    a.tempExpr('worried', 3);
    if (d > 1.5) {
      this.path = [to]; this.speed = 0.8; this.stopAt = 0.15; this.faceHank = true; this.stuckT = 0; this.bestD = Infinity;
      a.play('sneak');
      await new Promise((res) => { this.walkRes = res; this.walkRej = res; setTimeout(res, 3500); });
    }
    this.stopWalk();
    a.react('flinch');
    a.play('idle', 'worried');
    const back = { x: a.pos.x + (dx / d) * 1.2, z: a.pos.z + (dz / d) * 1.2 };
    a.pos.x += (back.x - a.pos.x) * 0.5;
    a.pos.z += (back.z - a.pos.z) * 0.5;
  }

  // ------------------------------------------------------------ story & housekeeping
  engage() {
    if (this.mode === 'engaged' || this.mode === 'script') return;
    this.cancel();
    this.mode = 'engaged';
    if (this.inside) { this.inside = false; this.setShown(true); }
  }
  release() {
    if (this.mode !== 'engaged') return;
    this.mode = 'routine';
    this.busy = false;
    this.cool.wave = 30;
  }
  // a cutscene took over this actor: clean up, keep them visible
  onScripted() {
    this.cancel();
    this.leash = null;
    this.kids = null;
    this.inside = false;
    this.mode = 'routine';
    this.setShown(true);
    this.a.peekSide = 0;
  }
  // back in range after a long time away: snap to wherever the day says they'd be
  snapToSchedule() {
    this.cancel();
    this.a.path = null; // (a story walk home that stalled while nobody was near)
    this.a.onArrive = null;
    this.leash = null;
    this.kids = null;
    this.mode = 'routine';
    const act = this.V.activityFor(this);
    const a = this.a;
    let pt = null;
    if (act.k === 'home' || act.k === 'chat' || act.k === 'errand') pt = act.k === 'chat' ? MEETS[act.meet] : this.home;
    else if (act.k === 'at') pt = act;
    else if (act.k === 'inside' && this.door) { this.inside = true; this.setShown(false); a.pos.set(this.door.x, a.pos.y, this.door.z); return; }
    else if (act.k === 'patrol' || act.k === 'jog') pt = act.pts[Math.floor(Math.random() * act.pts.length)];
    if (pt) {
      a.pos.set(pt.x, a.pos.y, pt.z);
      if (pt.yaw != null) a.yaw = a.targetYaw = pt.yaw;
    }
    this.inside = false;
    this.setShown(true);
  }
}
