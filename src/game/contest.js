// The pumpkin carving contest on Main Street (props: src/world/contest.js). Villagers
// come here in their day plans ({ k: 'contest' } in npcRoutines.js): carvers saw away
// at their pumpkins, scoop out guts, stand back to admire, giggle with the neighbour;
// the kids scoop and bounce; Dr. Ingrid judges with her clipboard and does the rounds;
// Constable Doug keeps order with a coffee; Josée cheers her two on. Gus hosts: he
// makes announcements through a dented tin megaphone from the middle of the street,
// then strolls along the tables for a close look at every entry (leans in, hums, nods,
// points, has his say), calls the finished ones and hands out the hourly ribbons.
//
// The crowd cheers (arms up, pennants waved, kids jumping, "Hooray!", a hip-hip-hooray
// and applause: cheer()) when Gus announces, when a pumpkin is judged or finished, when
// a winner is named and when Hank's own carving gets its ribbon (src/game/carving.js,
// the mini-game at Hank's table).
//
// The first time Hank rides in, the whole crowd freezes, stares and SCREAMS (the
// story's first-arrival scene, or groupScream() below for saves from before the
// contest), then scatters behind the tables and hay bales; as they get used to him
// (npcBrain.js) they drift back to their pumpkins.
import * as THREE from 'three';
import { extendVChar, POSE_KIT } from './vchar.js';
import { CONTEST } from '../world/contest.js';
import * as CM from '../voxel/models/contest.js';
import * as PR from '../voxel/models/props.js';
import { P } from '../render/particles.js';
import { Carving } from './carving.js';
import { RIBBONS } from './carveScore.js';

const { arm, leg, POSES } = POSE_KIT;
const S = Math.sin;
const PI = Math.PI;
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- poses & tools
const megaphone = { fn: CM.tinMegaphone, scale: 1, upright: true };
extendVChar({
  poses: {
    // bent over the table: the left hand steadies the pumpkin, the right saws the knife up and down
    carve(c, t, T) {
      const k = S(t * 10), slow = S(t * 1.3 + c.seed);
      arm(T, 'L', 1.0, 0.18, 1.0, 0.55);
      arm(T, 'R', 0.95 + k * 0.12, 0.08, 1.15 - k * 0.3, 0.4, 0.2);
      T.lean += 0.3 + slow * 0.03; T.headX += 0.32; T.headY += slow * 0.12; T.twist += 0.06;
      leg(T, 'L', 0.1, 0.1, 0.15); leg(T, 'R', -0.05, 0.1, 0.1);
    },
    // scooping out the guts: dig in, lift out, flick it into the bowl
    scoop(c, t, T) {
      const p = (t % 1.6) / 1.6;
      const k = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
      arm(T, 'L', 0.95, 0.2, 0.9, 0.5);
      arm(T, 'R', 0.75 + k * 0.6, 0.1 + k * 0.15, 1.3 - k * 0.6, 0.35);
      T.lean += 0.35 - k * 0.1; T.headX += 0.35;
      leg(T, 'L', 0.1, 0.1, 0.15); leg(T, 'R', -0.05, 0.1, 0.1);
    },
    // ta-da: both hands out to the pumpkin, a proud little bounce
    present(c, t, T) {
      arm(T, 'L', 0.95, 0.4, 0.25); arm(T, 'R', 0.95, 0.4, 0.25);
      T.lean -= 0.04; T.headZ += 0.12; T.bodyY += Math.abs(S(t * 5)) * 0.02;
    },
    // the judge leans in for a close look, pencil going
    judge(c, t, T) {
      POSES.clipboard(c, t, T);
      T.lean += 0.22 + S(t * 0.8) * 0.04; T.headX += 0.15; T.headY += S(t * 0.6) * 0.25;
    },
    // the host: the megaphone up to his mouth, the free arm sweeping out to the crowd
    announce(c, t, T) {
      arm(T, 'R', 1.3, 0.05, 2.0, 0.72);
      arm(T, 'L', 0.55 + S(t * 2.2) * 0.2, 1.05 + S(t * 3.1) * 0.25, 0.5);
      T.lean -= 0.1; T.headX -= 0.12;
      T.jaw = 0.25 + Math.abs(S(t * 9)) * 0.22;
      T.bodyY += Math.abs(S(t * 4.5)) * 0.012;
    },
    // strolling the tables: one hand behind his back, the megaphone in the other
    hostWalk(c, t, T) {
      arm(T, 'L', -0.38, 0.12, 0.7, 0.7);
      arm(T, 'R', 0.25, 0.12, 0.45, 0.1);
      T.lean += 0.04;
    },
    // a close look at an entry: leaning right in, hand on his chin, head tipping side to side
    inspect(c, t, T) {
      arm(T, 'L', 1.25, 0.25, 2.3, 0.65);
      arm(T, 'R', 0.1, 0.15, 0.3);
      T.lean += 0.38 + S(t * 0.9) * 0.04; T.headX += 0.25;
      T.headY += S(t * 0.7) * 0.35; T.headZ += S(t * 0.5) * 0.1;
      leg(T, 'L', 0.2, 0.08, 0.35); leg(T, 'R', 0.2, 0.08, 0.35);
      T.bodyY -= 0.03;
    },
    // "now THAT is a nose": pointing at the pumpkin with his free hand
    hostPoint(c, t, T) {
      arm(T, 'L', 1.3, 0.12, 0.08);
      arm(T, 'R', 0.15, 0.12, 0.35);
      T.lean += 0.14; T.twist += 0.12; T.headX += 0.12;
    },
    // the crowd: a pennant waved high, the other fist pumping, bouncing on their toes
    cheerFlag(c, t, T) {
      const k = Math.abs(S(t * 6));
      arm(T, 'R', 0.25, 2.5 + S(t * 9) * 0.3, 0.3);
      arm(T, 'L', 0.3, 2.2 + k * 0.35, 0.5 + k * 0.3);
      T.bodyY += k * 0.05 * c.persona.bounce; T.headX -= 0.12; T.jaw = 0.3;
      leg(T, 'L', 0.08 * k, 0.1, 0.2 * k); leg(T, 'R', 0.08 * k, 0.1, 0.2 * k);
    },
    cheerFlag2(c, t, T) { POSES.cheerFlag(c, t + 0.4, T); },
  },
  held: {
    carve: { fn: CM.carvingKnife, scale: 1 },
    scoop: { fn: CM.carvingScoop, scale: 1 },
    judge: { fn: () => PR.letter({}), scale: 1.2 }, // (the clipboard)
    announce: megaphone,
    hostWalk: megaphone,
    inspect: megaphone,
    hostPoint: megaphone,
    cheerFlag: { fn: () => CM.pennant({ color: 0xc8382e }), scale: 1 },
    cheerFlag2: { fn: () => CM.pennant({ color: 0xe8b830 }), scale: 1 },
  },
  loco: ['hostWalk'],
});

const LINES = {
  carve: ['Is this nose too big?', 'Almost done!', 'Steady... steady...', 'Mine has a moustache!', 'Ooh, that eye is crooked.'],
  kid: ['EWWW, GUTS!', 'Look at mine!!', 'Mine is a MOOSE!', 'Can I have the seeds?', 'I got pumpkin in my hair!'],
  judge: ['Hmm. Bold use of the nose.', 'Exquisite symmetry.', 'A solid seven.', 'The guts were... handled well.', 'Noted. Noted.'],
  score: ['A solid EIGHT!', 'Nine point five!', 'Seven! ...Out of seven.', 'Full marks for the teeth!'],
  watch: ['Knives pointed AWAY from each other, folks.', 'Everything is under control.', 'No running with pumpkins.'],
  cheer: ['That is lovely, Pip!', 'Pop, careful with the scoop!', 'Ooh, so spooky! I mean... cozy!'],
  finished: ['Finished!', 'Ta-daaa!', 'DONE! Look!'],
  // Gus, the host
  announce: ['TEN MINUTES, CARVERS! TEN MINUTES!', 'Mind your fingers, folks! We only got the one doctor!', "Seeds in the bowl, guts in the bucket, NOT the other way round!", 'Cocoa at the judges\' table! Paid for by NOBODY, so be grateful!', 'Keep carvin\', Maple Cove! Lookin\' good out there!'],
  look: ['Now THAT is a nose.', "Hmph. That's a fine grin.", 'Good clean cuts. Steady hand.', 'Spooky. I like spooky.', "Them teeth! Ha! Them TEETH!"],
  hum: ['Hmmm...', 'Hmmmmm.', 'Mm-hm. Mm-hm.', 'Huh.'],
  hankNone: ['Hank\'s spot. Still empty.', 'Where\'s that bag of bones got to?'],
  hankDone: ["Hank's. Not bad for a fella with no thumbs. ...He's got thumbs? Huh.", 'The skeleton\'s pumpkin. Spooky. Fittin\'.'],
};
const HOORAY = ['Hooray!', 'Woo-hoo!', 'Bravo!', 'Hip hip HOORAY!', 'Encore!', 'Yeah!!'];
const KID_HOORAY = ['YAAAY!', 'WOOOO!', 'BEST DAY EVER!', 'HOORAY!!'];
const CATEGORIES = ['Best Moustache', 'Spookiest Grin', 'Most Seeds Saved', 'Best Use of a Nose', 'Cutest Cat', 'Neatest Lid', 'Most Teeth'];

// Gus's rounds: in front of each place at the tables (the street side), looking at the
// work; west along the north tables, across, back east along the south ones, Hank's last
const HOST_ROUND = (() => {
  const out = [];
  const T = CONTEST.tables;
  const front = (t, lx) => (t.yaw ? { x: t.x - lx, z: t.z - 0.98, yaw: 0 } : { x: t.x + lx, z: t.z + 0.98, yaw: PI });
  for (const t of [T[0], T[1]]) for (const lx of [-0.9, 0.9]) out.push(front(t, lx));
  for (const t of [T[3], T[2]]) for (const lx of [-0.9, 0.9]) out.push(front(t, lx));
  out.push({ ...front(CONTEST.hank, 0), hank: true });
  return out;
})();

const _v = new THREE.Vector3();

export class Contest {
  constructor(game) {
    this.g = game;
    this.C = CONTEST;
    this.carving = new Carving(game, this);
    this._cheerT = -99;
  }
  spotFor(key) {
    return CONTEST.spots[key] || null;
  }
  // the contest-goers who are here right now
  present() {
    return (this.g.villagers?.brains || []).filter((b) => b._act?.k === 'contest' && !b.a.scripted && b.shown && hyp(b.a.pos.x - CONTEST.x, b.a.pos.z - CONTEST.z) < CONTEST.r + 4);
  }
  // Gus, if he's hosting right now
  host() {
    return this.present().find((b) => b.key === 'gus') || null;
  }

  // ------------------------------------------------------------ a villager's time at the contest (npcBrain doActivity)
  async perform(b, w, s, stillOn) {
    const a = b.a;
    a.face(s.yaw);
    if (s.role === 'judge') return this.judge(b, w, s, stillOn);
    if (s.role === 'host') return this.hosting(b, w, s, stillOn);
    while (stillOn()) {
      a.face(s.yaw);
      if (s.role === 'carve' || s.role === 'kid') {
        const kid = s.role === 'kid';
        a.play(kid && Math.random() < 0.6 ? 'scoop' : 'carve', kid ? 'happy' : 'determined');
        await w(rand(4, 8));
        if (!stillOn()) break;
        this.bits(a, s);
        const r = Math.random();
        if (r < 0.3) {
          a.play('scoop', 'neutral');
          this.sfx('squish', a.pos, 0.25);
          await w(rand(3, 5));
          this.bits(a, s);
        } else if (r < 0.5) {
          a.play('present', 'proud');
          a.react(kid ? 'yay' : 'bounce');
          // ...and sometimes that one's finished: the whole street cheers
          if (Math.random() < 0.25) { b.say(pick(LINES.finished), 1800); this.cheer(1, { except: b }); }
          else if (Math.random() < 0.5) b.say(pick(LINES[s.role]), 2000);
          await w(rand(1.6, 2.4));
        } else if (r < 0.75) {
          // a word with the neighbour at the same table
          const n = this.present().find((o) => o !== b && CONTEST.spots[o.key]?.table === s.table && CONTEST.spots[o.key]?.table != null);
          a.play('idle', 'happy');
          if (n) {
            a.lookAt(n.a);
            a.say(rand(1.6, 2.8));
            a.tempExpr(pick(['giggle', 'happy', 'surprised', 'smug']), 2);
            n.a.react(pick(['laugh', 'nod']));
          } else a.react('nod');
          await w(rand(2.2, 3.2));
          a.lookAt(null);
        } else {
          a.play('idle', 'happy');
          a.react(kid ? pick(['yay', 'spin', 'laugh']) : 'laugh');
          if (kid && Math.random() < 0.4) b.say(pick(LINES.kid), 1800);
          await w(1.4);
        }
      } else if (s.role === 'watch') {
        a.play(Math.random() < 0.5 ? 'sip' : 'idle', 'neutral');
        await w(rand(5, 9));
        const r = Math.random();
        if (r < 0.3) a.react('nod');
        else if (r < 0.5) { a.react('clap'); this.sfx('applause', a.pos, 0.18); }
        else if (r < 0.65) b.say(pick(LINES.watch), 2200);
        await w(1.2);
      } else {
        // cheering from the kerb
        a.play('idle', 'happy');
        await w(rand(4, 7));
        const r = Math.random();
        if (r < 0.35) { a.react('clap'); this.sfx('applause', a.pos, 0.15); }
        else if (r < 0.6) a.react('laugh');
        else if (r < 0.75) b.say(pick(LINES.cheer), 2000);
        else a.react('hi');
        await w(1.4);
      }
    }
    a.lookAt(null);
  }

  async judge(b, w, s, stillOn) {
    const a = b.a;
    while (stillOn()) {
      a.face(s.yaw);
      a.play('clipboard', 'neutral');
      await w(rand(6, 10));
      if (!stillOn()) break;
      // the rounds: a close look at each table's work
      for (const r of CONTEST.round) {
        if (!stillOn()) break;
        await w.walk([{ x: r.x, z: r.z }], 0.8);
        a.face(r.yaw);
        a.play('judge', 'neutral');
        this.sfx('pencil_scribble', a.pos, 0.35);
        if (Math.random() < 0.6) b.say(pick(LINES.judge), 2200);
        const near = this.present().filter((o) => o !== b && hyp(o.a.pos.x - r.x, o.a.pos.z - r.z) < 2.6);
        for (const o of near) {
          o.a.react('bounce');
          o.a.tempExpr(pick(['sheepish', 'proud', 'worried']), 2.2);
        }
        await w(rand(3, 4.5));
        a.react('nod');
        // judged: up goes the score card, and the table's carvers (and everyone else) cheer
        if (near.length && Math.random() < 0.4) {
          a.play('clipboard', 'happy');
          b.say(pick(LINES.score), 2200);
          await w(0.6);
          for (const o of near) o.a.react(o.cfg.kid ? 'yay' : 'love');
          this.cheer(1, { except: b });
          await w(1.6);
        }
        await w(0.8);
      }
      if (!stillOn()) break;
      await w.walk([{ x: s.x, z: s.z }], 0.8);
      a.face(s.yaw);
      // a round of applause for the work so far
      a.play('clipboard', 'happy');
      for (const o of this.present()) if (o !== b && Math.random() < 0.7) o.a.react('clap');
      this.sfx('applause', a.pos, 0.3);
    }
  }

  // ------------------------------------------------------------ Gus, the host
  async hosting(b, w, s, stillOn) {
    const a = b.a;
    let n = 0;
    while (stillOn()) {
      await this.announce(b, w, s, n++);
      if (!stillOn()) break;
      for (const r of HOST_ROUND) {
        if (!stillOn()) break;
        if (r.hank && !this.carving.hasCarving() && Math.random() < 0.5) continue;
        await w.walk([{ x: r.x, z: r.z }], 0.85, 'hostWalk');
        a.face(r.yaw);
        await this.inspect(b, w, r);
      }
    }
    a.lookAt(null);
  }
  // from the middle of the street, megaphone up: news, a ribbon, or a big hand for Hank
  async announce(b, w, s, n) {
    const a = b.a, g = this.g;
    await w.walk([{ x: s.x, z: s.z }], 0.9, 'hostWalk');
    a.face(s.yaw);
    a.play('hostWalk', 'neutral');
    await w(rand(1.5, 3));
    a.play('announce', 'happy');
    this.sfx('megaphone', a.pos, 0.6);
    await w(0.45);
    const carvers = this.present().filter((o) => ['carve', 'kid'].includes(CONTEST.spots[o.key]?.role) && o.mode === 'routine');
    const st = g.state?.carving;
    if (n % 3 === 2 && carvers.length) {
      // this hour's ribbon: a drum roll... and the winner
      const win = pick(carvers);
      b.say(`And this hour's ribbon for ${pick(CATEGORIES)} goes to...`, 2600);
      a.say(2);
      await w(2.6);
      b.say(`${g.villagerName(win.char).toUpperCase()}!`, 2200);
      a.say(1);
      win.a.play('present', 'proud');
      win.a.react(win.cfg.kid ? 'yay' : 'love');
      this.cheer(2, { except: win });
      await w(3);
    } else if (st?.day === g.state.day && st.ribbon && st.ribbon !== 'part' && Math.random() < 0.5) {
      b.say(`And let's hear it again for Hank's ${RIBBONS[st.ribbon].name}! The skeleton can CARVE, folks!`, 3000);
      a.say(2.5);
      await w(1.4);
      this.cheer(2);
      await w(2.6);
    } else {
      b.say(pick(LINES.announce), 2800);
      a.say(2);
      await w(1.3);
      this.cheer(1);
      await w(2.2);
    }
    a.play('hostWalk', 'neutral');
  }
  // a close look at one entry: lean in, hum, nod or point, a word; the carvers hold their breath
  async inspect(b, w, r) {
    const a = b.a;
    a.play('inspect', 'neutral');
    const who = this.present().filter((o) => o !== b && hyp(o.a.pos.x - r.x, o.a.pos.z - r.z) < 2.4);
    for (const o of who) { o.a.lookAt(a); o.a.tempExpr(pick(['worried', 'proud', 'sheepish']), 3); }
    if (Math.random() < 0.6) {
      this.g.emotes?.show(a, 'note', 1.8);
      this.sfx('hum_hmm', a.pos, 0.35);
    }
    await w(rand(1.8, 2.8));
    if (r.hank) {
      a.react('nod');
      b.say(pick(this.carving.hasCarving() ? LINES.hankDone : LINES.hankNone), 2600);
    } else {
      const roll = Math.random();
      if (roll < 0.4) { a.play('hostPoint', 'happy'); b.say(pick(LINES.look), 2400); }
      else if (roll < 0.75) { a.react('nod'); b.say(pick(LINES.hum), 1800); }
      else a.react('nod');
    }
    a.say(1);
    await w(rand(1.3, 2));
    for (const o of who) { o.a.lookAt(null); o.a.react(o.cfg.kid ? 'yay' : 'bounce'); }
    // now and then that one's done: Gus calls it, and the street cheers
    if (!r.hank && who.length && Math.random() < 0.3) {
      const o = pick(who);
      a.play('announce', 'laugh');
      this.sfx('megaphone', a.pos, 0.5);
      b.say(`${this.g.villagerName(o.char)}'s pumpkin is DONE! Let's hear it!`, 2600);
      a.say(1.5);
      await w(0.7);
      o.a.play('present', 'proud');
      this.cheer(1, { except: o });
      await w(2.4);
    }
    a.play('hostWalk', 'neutral');
  }

  // ------------------------------------------------------------ the crowd cheers
  // level 1: a happy cheer; 2: the big one (winners). actors: scripted cast in a scene
  // who join in. Returns how many cheered.
  cheer(level = 1, { except = null, actors = [], force = false } = {}) {
    const g = this.g;
    const cam = g.camera.position;
    if (hyp(cam.x - CONTEST.x, cam.z - CONTEST.z) > 80 && !actors.length) return 0;
    if (!force && level < 2 && g.time - this._cheerT < 5) return 0;
    if (g.time - this._cheerT < 1.2) return 0;
    this._cheerT = g.time;
    const crowd = this.present().filter((b) => b !== except && b.mode === 'routine' && !b.path && b.key !== 'gus');
    let kids = 0;
    for (const b of crowd) {
      const role = CONTEST.spots[b.key]?.role;
      if (b.cfg.kid) kids++;
      this.cheerOne(b.a, { kid: !!b.cfg.kid, clap: role === 'judge' || role === 'watch', level, say: (t, ms) => b.say(t, ms) });
    }
    for (const a of actors) {
      const kid = a.char === 'pip' || a.char === 'pop';
      if (kid) kids++;
      this.cheerOne(a, { kid, level, say: (t, ms) => g.ui.tag(`cheer:${a.char}`, t, a.pos.clone().setY(a.pos.y + a.P.height + 0.45), ms) });
    }
    const n = crowd.length + actors.length;
    if (!n) return 0;
    const at = _v.set(CONTEST.x - 4, (g.playerPos?.y ?? 0) + 1, CONTEST.z);
    this.sfx('crowd_hooray', at, 0.45 + level * 0.15);
    if (kids) g.wait(0.15).then(() => this.sfx('kids_yay', at, 0.35));
    if (level > 1) g.wait(0.4).then(() => this.sfx('applause', at, 0.35));
    return n;
  }
  cheerOne(a, { kid, clap = false, level, say }) {
    const g = this.g;
    g.wait(rand(0, 0.35)).then(() => {
      if (kid) {
        a.react('yay');
        g.wait(0.95).then(() => a.react(level > 1 && Math.random() < 0.5 ? 'spin' : 'yay'));
        if (Math.random() < 0.6) say(pick(KID_HOORAY), 1500);
        return;
      }
      if (clap) { a.react('clap'); if (Math.random() < 0.3) say(pick(HOORAY), 1500); return; }
      const prev = a.anim, pose = pick(['cheerFlag', 'cheerFlag2', 'cheer', 'cheerFlag']);
      a.play(pose);
      a.tempExpr(pick(['excited', 'happy', 'laugh']), 2.4);
      g.wait(level > 1 ? 2.6 : 1.8).then(() => { if (a.anim === pose) a.play(prev); });
      if (Math.random() < 0.45) say(pick(HOORAY), 1600);
    });
  }

  // a few bits of pumpkin flick off the knife
  bits(a, s) {
    const g = this.g;
    if (!g.effects?.ps || hyp(a.pos.x - g.playerPos.x, a.pos.z - g.playerPos.z) > 25) return;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const x = a.pos.x + fx * 0.75, z = a.pos.z + fz * 0.75, y = a.pos.y + 1.0;
    for (let k = 0; k < 4; k++) {
      const seed = k % 3 === 0;
      g.effects.ps.spawn({ x, y, z, vx: rand(-0.8, 0.8), vy: rand(1.2, 2.4), vz: rand(-0.8, 0.8), life: rand(0.6, 1.0), size: seed ? 0.05 : 0.07, sprite: seed ? P.chip : P.dirt, color: seed ? [1, 0.95, 0.8] : [1, 0.55, 0.15], gravity: 9, drag: 0.4, spin: rand(-10, 10), ground: true, rest: 0.6 });
    }
  }
  sfx(name, pos, vol) {
    this.g.villagers?.sfx(name, pos, vol);
  }

  // the "Carve a pumpkin" prompt at Hank's table (game.interactions)
  action(p, slow) {
    return this.carving.action(p, slow);
  }

  // ------------------------------------------------------------ the big scream (saves from before the contest)
  // Everyone at the contest who is still nervous of Hank stares, screams, drops their
  // tools and scatters; the friendly ones just wave.
  groupScream() {
    const g = this.g, V = g.villagers, X = V.ctx;
    g.state.flags.contestScream = true;
    let n = 0;
    for (const b of this.present()) {
      if (b.mode !== 'routine') { if (['startle', 'flee', 'hide', 'standoff', 'cowerOpen'].includes(b.mode)) n++; continue; }
      if (b.mood === 'terrified') { b.startle(X); n++; }
      else if (b.mood === 'wary') { this.yelp(b, X); n++; }
      else { b.a.faceTowards(X.p.x, X.p.z); b.a.react('hi'); }
    }
    if (n >= 2) {
      g.sound.play('scream', { volume: 0.5, pitch: 1.2 });
      g.chase?.shake?.(0.25);
      g.wait(2.4).then(() => g.ui.pop('...Was it something I said?', { expr: 'sheepish', key: 'contestScream' }));
    }
    g.save();
  }
  // a wary villager's version: a shriek and dropped tools, then a sheepish "oh, it's you"
  yelp(b, X) {
    b.seq(async (w) => {
      const a = b.a;
      b.mode = 'keepAway';
      a.faceTowards(X.p.x, X.p.z);
      a.lookAt(this.g.playerChar);
      a.react('doubletake');
      await w(0.75);
      b.dropHeld();
      b.scream(0.8);
      b.say(pick(b.cfg.scare || ['AAAH!']), 2000, true);
      a.react('scream');
      await w(1.4);
      a.play('idle', 'sheepish');
      a.react('shake');
      b.say(pick(b.cfg.wary || ["...Oh. It's you."]), 2200, true);
      await w(2.6);
      b.mode = 'routine';
      b.busy = false;
    });
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g;
    // the little things are only drawn when Hank is near enough to see them
    const m = g.world.voxel?.contestDetail;
    const cam = g.camera.position;
    const near = hyp(cam.x - CONTEST.x, cam.z - CONTEST.z) < (g.settings?.quality === 'high' ? 95 : 70);
    if (m) m.visible = near;
    this.carving.update(dt, near);
    const st = g.state;
    if (g.mode !== 'ride' || !st?.flags?.village1 || st.flags.contestScream) return;
    const p = g.playerPos;
    if (hyp(p.x - CONTEST.x, p.z - CONTEST.z) < CONTEST.r + 12 && this.present().length) this.groupScream();
  }
}

// how the contest crowd feels after the first-arrival scene (still terrified; the
// kids think he's the coolest thing ever)
export const AFTER_SCREAM = { marie: 14, doug: 16, ingrid: 18, agnes: 6, birdie: 8, josee: 10, pip: 62, pop: 55 };
