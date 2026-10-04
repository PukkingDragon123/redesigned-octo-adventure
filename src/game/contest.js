// The pumpkin carving contest on Main Street (props: src/world/contest.js). Villagers
// come here in their day plans ({ k: 'contest' } in npcRoutines.js): carvers saw away
// at their pumpkins, scoop out guts, stand back to admire, giggle with the neighbour;
// the kids scoop and bounce; Dr. Ingrid judges with her clipboard and does the rounds;
// Constable Doug keeps order with a coffee; Josée cheers her two on.
//
// The first time Hank rides in, the whole crowd freezes, stares and SCREAMS (the
// story's first-arrival scene, or groupScream() below for saves from before the
// contest), then scatters behind the tables and hay bales; as they get used to him
// (npcBrain.js) they drift back to their pumpkins.
import { extendVChar, POSE_KIT } from './vchar.js';
import { CONTEST } from '../world/contest.js';
import * as CM from '../voxel/models/contest.js';
import * as PR from '../voxel/models/props.js';
import { P } from '../render/particles.js';

const { arm, leg, POSES } = POSE_KIT;
const S = Math.sin;
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- poses & tools
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
  },
  held: {
    carve: { fn: CM.carvingKnife, scale: 1 },
    scoop: { fn: CM.carvingScoop, scale: 1 },
    judge: { fn: () => PR.letter({}), scale: 1.2 }, // (the clipboard)
  },
});

const LINES = {
  carve: ['Is this nose too big?', 'Almost done!', 'Steady... steady...', 'Mine has a moustache!', 'Ooh, that eye is crooked.'],
  kid: ['EWWW, GUTS!', 'Look at mine!!', 'Mine is a MOOSE!', 'Can I have the seeds?', 'I got pumpkin in my hair!'],
  judge: ['Hmm. Bold use of the nose.', 'Exquisite symmetry.', 'A solid seven.', 'The guts were... handled well.', 'Noted. Noted.'],
  watch: ['Knives pointed AWAY from each other, folks.', 'Everything is under control.', 'No running with pumpkins.'],
  cheer: ['That is lovely, Pip!', 'Pop, careful with the scoop!', 'Ooh, so spooky! I mean... cozy!'],
};

export class Contest {
  constructor(game) {
    this.g = game;
    this.C = CONTEST;
  }
  spotFor(key) {
    return CONTEST.spots[key] || null;
  }
  // the contest-goers who are here right now
  present() {
    return (this.g.villagers?.brains || []).filter((b) => b._act?.k === 'contest' && !b.a.scripted && b.shown && hyp(b.a.pos.x - CONTEST.x, b.a.pos.z - CONTEST.z) < CONTEST.r + 4);
  }

  // ------------------------------------------------------------ a villager's time at the contest (npcBrain doActivity)
  async perform(b, w, s, stillOn) {
    const a = b.a;
    a.face(s.yaw);
    if (s.role === 'judge') return this.judge(b, w, s, stillOn);
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
          if (Math.random() < 0.5) b.say(pick(LINES[s.role]), 2000);
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
        for (const o of this.present()) {
          if (hyp(o.a.pos.x - r.x, o.a.pos.z - r.z) > 2.6 || o === b) continue;
          o.a.react('bounce');
          o.a.tempExpr(pick(['sheepish', 'proud', 'worried']), 2.2);
        }
        await w(rand(3, 4.5));
        a.react('nod');
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
  update() {
    const g = this.g;
    // the little things are only drawn when Hank is near enough to see them
    const m = g.world.voxel?.contestDetail;
    if (m) {
      const cam = g.camera.position;
      const far = g.settings?.quality === 'high' ? 95 : 70;
      m.visible = hyp(cam.x - CONTEST.x, cam.z - CONTEST.z) < far;
    }
    const st = g.state;
    if (g.mode !== 'ride' || !st?.flags?.village1 || st.flags.contestScream) return;
    const p = g.playerPos;
    if (hyp(p.x - CONTEST.x, p.z - CONTEST.z) < CONTEST.r + 12 && this.present().length) this.groupScream();
  }
}

// how the contest crowd feels after the first-arrival scene (still terrified; the
// kids think he's the coolest thing ever)
export const AFTER_SCREAM = { marie: 14, doug: 16, ingrid: 18, agnes: 6, birdie: 8, josee: 10, pip: 62, pop: 55 };
