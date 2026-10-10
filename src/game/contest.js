// The pumpkin carving contest on Main Street (props: src/world/contest.js). Villagers
// come here in their day plans ({ k: 'contest' } in npcRoutines.js): carvers saw away
// at their pumpkins, scoop out guts, stand back to admire, giggle with the neighbour;
// the kids scoop and bounce; Dr. Ingrid judges with her clipboard and does the rounds;
// Constable Doug keeps order with a coffee; Josée cheers her two on. Gus hosts, in the
// game itself (not just in scenes): he makes announcements through a dented tin
// megaphone from the middle of the street, then strolls along the tables (the
// townsfolk's too) for a close look at every entry (leans in, hums, nods, points, has
// his say), calls the finished ones and hands out the hourly ribbons. Around them, two
// dozen and more townsfolk (src/game/crowd.js) carve, chat, sip cider, take photos,
// play tag, stroll hand in hand, walk a dog and push a stroller.
//
// The crowd cheers (arms up, pennants waved, kids jumping, "Hooray!", a hip-hip-hooray
// and applause: cheer()) when Gus announces, when a pumpkin is judged or finished, when
// a winner is named and when Hank's own carving gets its ribbon (src/game/carving.js,
// the mini-game at Hank's table).
//
// The first time Hank rides in, the whole contest FREEZES mid-action, scared stiff, and
// stares at him (Story.townEntry, a short cutscene): no screams, no running, just silence,
// crickets, trembling, hands flown to mouths, heads turning to follow him, a pumpkin
// dropped, a kid hiding behind a parent, the dog whimpering. Nana sent a carrier of extra
// cocoa along: Hank offers everyone a cup, and one by one they hesitate, take it, sip,
// soften and go back to their pumpkins (the neighbours thaw with them). Until then they
// stay frozen and frightened. Once the eight regulars have a cup, Gus comes over and
// invites him to carve (the cocoa round: cocoaRound.js keeps the rules and flags;
// Story.contestInvite the invitation). Ever after, anyone at the contest who is still
// frightened of Hank just freezes and watches.
import * as THREE from 'three';
import { extendVChar, POSE_KIT, REACT } from './vchar.js';
import { CONTEST } from '../world/contest.js';
import * as CM from '../voxel/models/contest.js';
import * as PR from '../voxel/models/props.js';
import { P } from '../render/particles.js';
import { Carving } from './carving.js';
import { RIBBONS } from './carveScore.js';
import { Crowd } from './crowd.js';
import { CocoaRound, ROUND_KEYS, NEED } from './cocoaRound.js';
import { frightOverlay, styleFor } from './fright.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as FOOD from '../voxel/models/food.js';

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
    // frozen mid-action: whatever they were doing when Hank rode up, held stock still
    // (Contest.freezeActor keeps the pose and the moment), stiff, wide-eyed and trembling,
    // with a fright layered on top (fright.js: hands to the mouth, hands up, clutching...)
    frozen(c, t, T) {
      const f = c._freeze;
      const fn = f && f.anim !== 'frozen' && POSES[f.anim];
      (fn || POSES.idle)(c, f ? f.t : 0, T);
      T.shUp += 0.035; T.lean -= 0.05; T.headX -= 0.06;
      frightOverlay(c, t, T);
    },
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

// Hank holds out a cup of cocoa (a reaction layered over whatever he's doing, so it
// works on foot, where the walk owns his pose)
const CUP = { geo: null };
function cupMesh() {
  if (!CUP.geo) { const r = FOOD.cocoaTakeaway(); CUP.geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 }); }
  const m = voxMesh(CUP.geo, sharedVoxelMaterial());
  m.userData.upright = true;
  m.userData.cup = true;
  return m;
}
Object.assign(REACT, {
  offerCup: {
    d: 1.5, expr: 'happy',
    start(c) { if (!c.held.R) c.hold(cupMesh(), 'R'); },
    f(c, t, T) {
      const k = Math.min(1, t / 0.25) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.3) : 1);
      const mix = (key, v) => { T[key] += (v - T[key]) * k; };
      mix('aFR', 1.35); mix('aOR', 0.12); mix('eBR', 0.35); mix('eIR', -0.1);
      T.lean += 0.1 * k; T.headX += 0.1 * k;
      if (t > 0.95 && c.held.R?.userData.cup) c.hold(null, 'R'); // handed over
    },
  },
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
// how the regulars take fright at the first sight of Hank (fright.js)
const FRIGHT_OF = { agnes: 'mouth', marie: 'hands', kids: 'still', birdie: 'clutch', lou: 'hands', ingrid: 'still', doug: 'clutch', josee: 'clutch', gus: 'still' };
const CATEGORIES = ['Best Moustache', 'Spookiest Grin', 'Most Seeds Saved', 'Best Use of a Nose', 'Cutest Cat', 'Neatest Lid', 'Most Teeth'];

// Gus's rounds: in front of each place at the tables (the street side), looking at the
// work; west along the north tables, across, back east along the south ones, Hank's last
const HOST_ROUND = (() => {
  const out = [];
  const T = CONTEST.tables;
  const front = (t, lx) => (t.yaw ? { x: t.x - lx, z: t.z - 0.98, yaw: 0 } : { x: t.x + lx, z: t.z + 0.98, yaw: PI });
  for (const t of [T[0], T[1], T[5]]) for (const lx of [-0.9, 0.9]) out.push(front(t, lx));
  for (const t of [T[4], T[3], T[2]]) for (const lx of [-0.9, 0.9]) out.push(front(t, lx));
  out.push({ ...front(CONTEST.hank, 0), hank: true });
  return out;
})();

const _v = new THREE.Vector3();
// how close to the contest Hank gets before the first-look cutscene starts (the corn
// sheaves at the west end, coming in along the road from Nana's)
const ENTRY_R = CONTEST.r + 10;

export class Contest {
  constructor(game) {
    this.g = game;
    this.C = CONTEST;
    this.carving = new Carving(game, this);
    this._cheerT = -99;
    this.crowd = new Crowd(game, this);
    this.round = new CocoaRound(() => game.state);
    this.served = new Set(); // (others at the contest given a cup this round: Lou, say)
    this.carrier = null;
    this.cricketT = 0;
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
          this.cheer(1, { except: b, force: true });
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
        if (r.hank ? !this.carving.hasCarving() && Math.random() < 0.5 : Math.random() < 0.3) continue;
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
    const folk = this.crowd.present().filter((m) => m.role === 'carve' && !m.frozen);
    if (n % 3 === 2 && (carvers.length || folk.length)) {
      // this hour's ribbon: a drum roll... and the winner
      const win = carvers.length && (Math.random() < 0.6 || !folk.length) ? pick(carvers) : null;
      const wf = win ? null : pick(folk);
      b.say(`And this hour's ribbon for ${pick(CATEGORIES)} goes to...`, 2600);
      a.say(2);
      await w(2.6);
      b.say(`${(win ? g.villagerName(win.char) : wf.name).toUpperCase()}!`, 2200);
      a.say(1);
      const wa = (win || wf).a;
      wa.play('present', 'proud');
      wa.react((win ? win.cfg.kid : wf.kid) ? 'yay' : 'love');
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
      this.cheer(1, { force: true });
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
    const folk = this.crowd.watchHost(r.x, r.z, a);
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
    this.crowd.doneWatching(folk);
    // now and then that one's done: Gus calls it, and the street cheers
    if (!r.hank && (who.length || folk.length) && Math.random() < 0.3) {
      const o = who.length && (Math.random() < 0.5 || !folk.length) ? pick(who) : null;
      const f = o ? null : pick(folk);
      a.play('announce', 'laugh');
      this.sfx('megaphone', a.pos, 0.5);
      b.say(`${o ? this.g.villagerName(o.char) : f.name}'s pumpkin is DONE! Let's hear it!`, 2600);
      a.say(1.5);
      await w(0.7);
      (o || f).a.play('present', 'proud');
      this.cheer(1, { except: o, force: true });
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
    const folk = this.crowd.cheer(level);
    kids += folk.kids;
    const n = crowd.length + actors.length + folk.n;
    if (!n) return 0;
    const at = _v.set(CONTEST.x - 4, (g.playerPos?.y ?? 0) + 1, CONTEST.z);
    this.sfx('crowd_hooray', at, 0.65 + level * 0.15);
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

  // the prompts: "Offer cocoa to ..." during the cocoa round, "Carve a pumpkin" at Hank's table
  action(p, slow) {
    return this.offerAction(p) || this.carving.action(p, slow);
  }

  // ------------------------------------------------------------ frozen mid-action
  // hold whatever pose they were in (and what's in their hand), scared stiff: trembling,
  // with a fright style on top (fright.js)
  freezeActor(a, style = null) {
    if (a.anim === 'frozen') {
      if (style && a._freeze) a._freeze.style = style;
      return;
    }
    a._freeze = { anim: a.anim, t: a.animT, style: style || styleFor(a.anim), shake: rand(0.45, 0.95) };
    const h = a.held.R;
    if (h?.userData.held) h.userData.held = 'frozen';
    a.reaction = null;
    a.play('frozen', pick(['scared', 'scared', 'shock', 'worried']));
  }
  // how each regular takes fright (the rest get one to suit what they were doing)
  styleOf(key) {
    return FRIGHT_OF[key] || null;
  }
  // the brains at the contest, frozen or not
  atContest() {
    return (this.g.villagers?.brains || []).filter((b) => b._act?.k === 'contest' && !b.a.scripted && b.shown && hyp(b.a.pos.x - CONTEST.x, b.a.pos.z - CONTEST.z) < CONTEST.r + 4 && !b.path);
  }
  servedBrain(b) {
    return this.round.has(b.key) || this.served.has(b.key);
  }

  // ------------------------------------------------------------ the cocoa round (cocoaRound.js)
  // Hank rides in for the first time: everyone freezes, scared stiff, and stares. Silence;
  // crickets. (Story.townEntry films it; this is what happens in the street.)
  beginRound({ drop = true } = {}) {
    const g = this.g, R = this.round;
    const here = this.atContest();
    // (an old save: regulars who already like him just wave; they count as served)
    const already = here.filter((b) => b.mood === 'friendly' || b.mood === 'fan').map((b) => b.key);
    R.start(already);
    this.served.clear();
    for (const b of here) {
      if (R.has(b.key)) { b.a.faceTowards(g.playerPos.x, g.playerPos.z); b.a.react('hi'); continue; }
      b.freeze(b.key === 'pop' ? g.villagers.get('josee') : null);
    }
    for (const m of this.crowd.present()) this.crowd.freeze(m);
    if (drop) this.dropPumpkin();
    this.cricketT = 1.2;
    this.hintT = 28; // (one nudge, later, if nobody has had a cup yet)
    g.save();
  }
  // the first-look cutscene (Story.townEntry): everyone busy at their places, wherever
  // they had wandered off to, so the street is packed and nobody is caught mid-walk
  stageEntry() {
    const g = this.g, V = g.villagers, R = this.round;
    for (const b of V?.brains || []) {
      const s = CONTEST.spots[b.key];
      if (!s || !R.pinned(b.key) || b.a.scripted || b.mode === 'frozen') continue;
      b.cancel();
      b.leash = null;
      b.kids = null;
      b.mode = 'routine';
      b._act = { k: 'contest', block: 'pinned' };
      b.a.path = null;
      b.a.pos.set(s.x, g.physics.groundAt(s.x, s.z, b.a.pos.y + 2).h, s.z);
      b.a.yaw = b.a.targetYaw = s.yaw;
      b.inside = false;
      b.setShown(true);
    }
    this.crowd.stageEntry();
  }
  // somebody had just picked up a little pumpkin: it slips out of their hands
  // (who: whose hands; left out, whoever is carving nearest Hank)
  dropPumpkin(who = null) {
    const g = this.g, V = g.villagers;
    const p = g.playerPos;
    const near = (q) => hyp(q.a.pos.x - p.x, q.a.pos.z - p.z);
    const m = who ? null : this.crowd.list.filter((q) => q.role === 'carve' && q.shown && q.a).sort((x, y) => near(x) - near(y))[0];
    const a = who || m?.a || V?.get('marie');
    if (!a || !V) return;
    const r = CM.simplePumpkin({ r: 0.14, seed: 23 });
    const pk = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 }), sharedVoxelMaterial());
    a.root.updateMatrixWorld(true);
    a.arms.L.hand.getWorldPosition(pk.position);
    if (a.root.visible === false || !(pk.position.y > a.pos.y + 0.3)) pk.position.set(a.pos.x + Math.sin(a.yaw) * 0.4, a.pos.y + 1.05, a.pos.z + Math.cos(a.yaw) * 0.4);
    g.scene.add(pk);
    this.dropped = { a, at: pk.position };
    g.wait(0.3).then(() => { V.litter.drop(pk); g.wait(0.4).then(() => { this.sfx('pumpkin_bonk', pk.position, 0.55); g.wait(0.25).then(() => this.sfx('pumpkin_roll', pk.position, 0.35)); }); });
  }

  // the "Offer cocoa" prompt: the nearest frozen soul in reach
  offerAction(p) {
    const g = this.g, R = this.round;
    if (!R.isActive() || this.offering || g.interior?.active) return null;
    if (!g.onFoot && g.bike.speed > 1.6) return null;
    const reach = g.onFoot ? 2.3 : 2.9;
    let best = null, bd = reach;
    for (const b of this.atContest()) {
      if (b.mode !== 'frozen' || b.thawing) continue;
      const d = hyp(b.a.pos.x - p.x, b.a.pos.z - p.z);
      if (d < bd && Math.abs(b.a.pos.y - p.y) < 2.5) { bd = d; best = { b }; }
    }
    const m = this.crowd.nearestFrozen(p, bd);
    if (m) best = { m };
    if (!best) return null;
    const name = best.b ? (best.b.char === 'pip' ? 'Pip' : g.villagerName(best.b.char)) : best.m.name;
    return { text: `Offer cocoa to ${name}`, fn: () => this.offer(best) };
  }
  async offer(t) {
    const g = this.g, R = this.round;
    if (this.offering) return;
    this.offering = true;
    const a = t.b ? t.b.a : t.m.a;
    try {
      // Hank turns to them and holds out a cup from the carrier
      const p = g.playerPos;
      if (g.onFoot) g.walker.yaw = Math.atan2(a.pos.x - p.x, a.pos.z - p.z);
      g.playerChar?.react('offerCup');
      g.sound.play('cup', { volume: 0.6 });
      // (the cup leaves his hand even if something else interrupts the reaching out)
      g.wait(1.6).then(() => { const ch = g.playerChar; if (ch?.held.R?.userData.cup) ch.hold(null, 'R'); });
      if (t.b) {
        await Promise.race([t.b.acceptCocoa(), g.wait(7)]);
        if (R.isKey(t.b.key)) {
          const r = R.give(t.b.key);
          if (r.fresh) this.onServed(t.b.a, r);
        } else {
          this.served.add(t.b.key);
          this.crowd.thawNear(a.pos.x, a.pos.z, 1);
        }
      } else {
        await Promise.race([this.crowd.thaw(t.m, true), g.wait(7)]);
        R.giveCrowd();
        this.crowd.thawNear(a.pos.x, a.pos.z, 1);
      }
      g.save();
    } finally {
      this.offering = false;
    }
  }
  // a regular took a cup: the people round them thaw too, and Hank keeps count
  onServed(a, r) {
    const g = this.g;
    const share = Math.ceil(this.crowd.list.length / NEED);
    this.crowd.thawNear(a.pos.x, a.pos.z, share);
    g.sound.play(r.complete ? 'quest_done' : 'item_get', { volume: 0.5 });
    if (r.complete) this.finishRound();
  }
  // everyone has a cup: the last of the crowd thaws, the music comes back... and Gus comes over
  finishRound() {
    const g = this.g, V = g.villagers, R = this.round;
    R.finish();
    for (const b of this.atContest()) {
      if (b.key === 'gus') continue;
      V.force(b.char, Math.max(V.trustOf(b.char), b.cfg.kid ? 60 : 30));
      if (b.mode === 'frozen') b.unfreeze();
    }
    V.force('gus', Math.max(V.trustOf('gus'), 46));
    this.gusComing = true; // (he hands himself his own cup in the invitation: no walk-up)
    this.crowd.thawNear(CONTEST.x, CONTEST.z, 99);
    this.showCarrier(false);
    g.wait(1.0).then(() => this.cheer(1, { force: true }));
    g.save();
    g.wait(2.6).then(() => this.inviteGus());
  }
  // Gus thaws last: "...Well I'll be." He marches over (no megaphone at Hank, just a look),
  // and the invitation (Story.contestInvite) opens the carving
  async inviteGus() {
    const g = this.g;
    if (this.inviting) return;
    this.inviting = true;
    try {
      while (g.mode !== 'ride') await g.wait(0.5);
      const gus = g.villagers.get('gus');
      const b = gus?.brain;
      if (b && gus.visible && !gus.scripted) await Promise.race([b.approachHank(1.8), g.wait(9)]);
      await g.story.contestInvite();
    } finally {
      this.inviting = false;
      this.gusComing = false;
    }
  }
  // the carrier of extra cocoa: in Bessie's crate, or in Hank's hand when he's walking
  showCarrier(on) {
    const g = this.g;
    const want = on ? Math.max(1, NEED - this.round.progress().count) : 0;
    const c = this.carrier;
    if (c && c.n === want && (want ? c.parent === (g.onFoot ? g.playerChar?.arms.L.hand : g.bikeModel?.crateAnchor) : !c.mesh.parent)) return;
    if (c) {
      if (c.parent === g.playerChar?.arms.L.hand) g.playerChar.hold(null, 'L');
      else c.mesh.parent?.remove(c.mesh);
    }
    if (!want) { this.carrier = null; return; }
    let mesh = c?.n === want ? c.mesh : null;
    if (!mesh) {
      const r = CM.cocoaCarrier({ cups: want });
      mesh = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 }), sharedVoxelMaterial());
      mesh.userData.upright = true;
      mesh.userData.held = 'carrier';
    }
    let parent;
    if (g.onFoot && g.playerChar) {
      parent = g.playerChar.arms.L.hand;
      mesh.position.set(0, -0.02, 0.02);
      mesh.scale.setScalar(0.85);
      g.playerChar.hold(mesh, 'L');
    } else {
      parent = g.bikeModel?.crateAnchor;
      if (!parent) return;
      mesh.position.set(0, 0.32, 0.02);
      mesh.quaternion.identity();
      mesh.scale.setScalar(0.7);
      parent.add(mesh);
    }
    this.carrier = { mesh, n: want, parent };
  }
  // the clipboard line while the round is on
  objective() {
    return this.round.objective();
  }
  // a cocoa cup on the compass: the nearest regular still waiting for one
  markers() {
    const R = this.round;
    if (!R.isActive()) return [];
    const p = this.g.playerPos;
    let best = null, bd = 1e9;
    for (const b of this.atContest()) {
      if (this.servedBrain(b) || !R.isKey(b.key)) continue;
      const d = hyp(b.a.pos.x - p.x, b.a.pos.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return [{ id: 'cocoaRound', x: CONTEST.x, z: CONTEST.z, icon: 'cocoa' }];
    return [{ id: 'cocoaRound', x: best.a.pos.x, z: best.a.pos.z, icon: 'cocoa' }];
  }
  // the music hushes while the street stands frozen (until half of them have a cup)
  hush() {
    const g = this.g, R = this.round;
    if (!R.isActive() || g.mode !== 'ride') return false;
    const p = g.playerPos;
    return hyp(p.x - CONTEST.x, p.z - CONTEST.z) < 58 && R.progress().count < NEED / 2;
  }

  // who should stand frozen this frame: during the round everyone at the contest who
  // hasn't had a cup, while Hank is about; afterwards anyone still terrified of him,
  // while he's close (they freeze and watch: nobody screams or runs off at the contest)
  roundUpdate(dt) {
    const g = this.g, R = this.round;
    if (!g.state) return;
    R.migrate();
    const p = g.playerPos;
    const dC = hyp(p.x - CONTEST.x, p.z - CONTEST.z);
    // (the first-look cutscene films the frozen street: it stays frozen for the lens)
    const staged = !!g.currentScene?.keepFrozen;
    const live = ((g.mode === 'ride' || g.mode === 'menu') && !g.interior?.active) || staged;
    if (R.needsStart()) {
      // Hank comes into town for the first time: the cutscene (Story.townEntry) begins the round
      const free = g.mode === 'ride' && !g.currentScene && !g.ui?.dialogueTick && !g.interior?.active;
      if (free && dC < ENTRY_R && (this.atContest().length || this.crowd.present().length)) g.story?.townEntry();
      return;
    }
    const active = R.isActive();
    for (const b of this.atContest()) {
      if (b.thawing || b.mode === 'cocoa') continue;
      const want = live && (active ? dC < 60 && !this.servedBrain(b) : b.mood === 'terrified' && b.d < 15 && b.key !== 'gus');
      if (want && b.mode === 'routine') b.freeze(b.key === 'pop' && active ? g.villagers.get('josee') : null);
      else if (!want && b.mode === 'frozen') b.unfreeze();
    }
    if (active) {
      const near = live && dC < 60;
      for (const m of this.crowd.list) {
        if (!m.shown || m.thawed || m.thawing) continue;
        if (near && !m.frozen) this.crowd.freeze(m);
        else if (!near && m.frozen) this.crowd.unfreeze(m);
      }
      this.showCarrier(live);
      // crickets in the silence
      if (this.hush() && (this.cricketT -= dt) <= 0) {
        this.cricketT = rand(2.2, 3.6);
        g.sound.play('crickets', { volume: 0.55, pitch: rand(0.95, 1.05) });
      }
      // a frozen face that Hank walks right up to: a little gulp
      if (g.onFoot && (this.gulpT = (this.gulpT || 0) - dt) <= 0) {
        this.gulpT = 1.5;
        const m = this.crowd.nearestFrozen(p, 1.6);
        if (m && Math.random() < 0.5) { m.a.react('gulp'); g.emotes?.show(m.a, 'sweat', 1.2); }
      }
      // nobody has had a cup a good while after the cutscene: one short nudge (once)
      if (g.mode === 'ride' && this.hintT > 0 && (this.hintT -= dt) <= 0 && !R.progress().count && !R.rec.crowd && !g.state.flags.cocoaHint) {
        g.state.flags.cocoaHint = true;
        g.ui.pop(`Ride up slow and offer a cup ${g.touch?.on ? '' : '[E]'}`.trim(), { expr: 'happy', key: 'cocoaHint', prio: 'high', ms: 3800 });
      }
    } else if (this.carrier) this.showCarrier(false);
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
    this.crowd.update(dt, near);
    this.roundUpdate(dt);
  }
}

// how the regulars feel about Hank once they've had a cup (the kids think he's the
// coolest thing ever; Gus has been won over by Marguerite's cocoa)
export const AFTER_COCOA = { gus: 46, marie: 32, doug: 30, ingrid: 34, agnes: 32, birdie: 30, josee: 30, pip: 62, pop: 58 };
export { ROUND_KEYS };
