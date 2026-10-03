// Harold's riding notes: skill-based progression. Every move is done with real input
// timing and balance; practice goals unlock mastery tiers. Mastery is pride (plus a
// small tip from Nana and Harold's next note), never stats: Bessie stays the same bike.
//
// state.skills = { best: { stat: number }, tiers: { skillId: tier } }
// game.skills.list() -> [{ id, name, icon, how, desc, tier, maxTier, goal, progress, best, unit, note }]
// game.skills.event(e) takes bike events (bike.js) and trick events ({ type: 'combo', count }, { type: 'trick', id })

const ROMAN = ['', 'I', 'II', 'III'];
const TIP = [0, 3, 6, 12]; // Nana's pocket money per tier

// tiers: [stat, need, goal text]. note: Harold's scribble unlocked with each tier.
export const SKILLS = [
  {
    id: 'wheelie', name: 'Wheelie', icon: 'skill_wheelie', unit: 's',
    how: 'Pedal and hold Q to lift the front wheel. Let go before it tips back too far, tap Q again when it drops. Squeeze the brake to save a loop-out.',
    desc: 'Harold once rode a wheelie from the mill to the chapel. Nana insists it was downhill.',
    tiers: [['wheelie', 2, 'Hold a wheelie for 2 seconds'], ['wheelie', 5, 'Hold a wheelie for 5 seconds'], ['wheelie', 12, 'Hold a wheelie for 12 seconds']],
    notes: ['"Small taps, not big yanks. The balance point is lower than you think."', '"Keep pedalling soft and steady. The pedals hold the front up."', '"Twelve seconds! Past the bakery! Marguerite, did you SEE?"'],
  },
  {
    id: 'manual', name: 'Manual', icon: 'skill_manual', unit: 's',
    how: 'Get some speed, stop pedalling, then lean back with Q. No pedal power: it is all balance, and it bleeds speed.',
    desc: 'A wheelie without pedalling. Harold called it "the coast of honour".',
    tiers: [['manual', 1.5, 'Manual for 1.5 seconds'], ['manual', 4, 'Manual for 4 seconds'], ['manual', 8, 'Manual for 8 seconds']],
    notes: ['"Hips back, arms straight. Speed is your friend."', '"Feather the lean, let the bike roll under you."', '"Rolled the whole covered bridge on one wheel. The trolls clapped."'],
  },
  {
    id: 'bunnyhop', name: 'Bunny Hop', icon: 'skill_hop', unit: 'm',
    how: 'Hold Space to crouch, let go to pop. A quick tap is a little hop; crouch for about a third of a second for the full pop.',
    desc: 'Up and over: logs, kerbs, ducks.',
    tiers: [['hop', 0.55, 'Hop 0.55 m high'], ['hop', 0.85, 'Hop 0.85 m high'], ['hop', 1.12, 'Hop 1.12 m high (perfect timing)']],
    notes: ['"Crouch... wait for it... POP."', '"One-and-POP. Count it out loud. The neighbours will understand."', '"Cleared Agnes\'s hedge. She has not forgiven me."'],
  },
  {
    id: 'cadence', name: 'Pedal Rhythm', icon: 'skill_cadence', unit: 's',
    how: 'Instead of holding W, tap it in a steady beat (about three taps a second). In rhythm, Hank sprints faster. Mash too fast and his foot slips off.',
    desc: 'Bessie has three gears and one speed: whatever your legs can keep up.',
    tiers: [['cadence', 4, 'Keep the rhythm for 4 seconds'], ['cadence', 10, 'Keep the rhythm for 10 seconds'], ['cadence', 25, 'Keep the rhythm for 25 seconds']],
    notes: ['"Hum a waltz. One, two, three, one, two, three."', '"Downhill, let her roll. Uphill, dance on the pedals."', '"Beat the mail van to the lighthouse. Don\'t tell the postman."'],
  },
  {
    id: 'drift', name: 'Drift', icon: 'skill_drift', unit: 's',
    how: 'At speed, hold Shift and steer into a corner. Hold the slide, let go of Shift for a little kick.',
    desc: 'The back wheel goes one way, Hank goes the other, the cocoa stays (mostly) in the cup.',
    tiers: [['drift', 1.5, 'Drift for 1.5 seconds'], ['drift', 3, 'Drift for 3 seconds'], ['drift', 5, 'Drift for 5 seconds']],
    notes: ['"Look where you want to go, not where you are going."', '"Gravel drifts long, grass drifts wild."', '"Drifted round the whole gazebo. Got a ticket from Doug\'s father."'],
  },
  {
    id: 'stoppie', name: 'Stoppie', icon: 'skill_stoppie', unit: 's',
    how: 'While rolling, hold the brake (S) and lean forward (F): the back wheel lifts. Ease off F before you go over the bars.',
    desc: 'Stopping, but with style and a small risk of flying.',
    tiers: [['stoppie', 0.8, 'Stoppie for 0.8 seconds'], ['stoppie', 2, 'Stoppie for 2 seconds'], ['stoppie', 4, 'Stoppie for 4 seconds']],
    notes: ['"Brakes first, then lean. Never the other way round."', '"Faster in, longer stoppie. Braver in, shorter hospital stay."', '"Stopped on a dime. Then I picked up the dime."'],
  },
  {
    id: 'nose', name: 'Nose Manual', icon: 'skill_nose', unit: 's',
    how: 'Rolling fast without braking, lean forward with F to ride on the front wheel. Lean back (Q) to drop the rear again.',
    desc: 'A manual, but on the wrong wheel. Showing off, basically.',
    tiers: [['nose', 1, 'Nose manual for 1 second'], ['nose', 2.5, 'Nose manual for 2.5 seconds'], ['nose', 5, 'Nose manual for 5 seconds']],
    notes: ['"Weight over the bars, eyes up."', '"Pop off a bump and tip the nose. Easier than it looks. It looks very hard."', '"Five seconds on the front wheel. Marguerite fainted. On purpose, I think."'],
  },
  {
    id: 'spin', name: 'Spins', icon: 'skill_spin', unit: 'deg',
    how: 'In the air, hold A or D to spin. Let go a little early: the spin carries on. Land facing the way you are moving.',
    desc: 'Round and round. The skull is the only bit that gets dizzy.',
    tiers: [['spin', 180, 'Land a 180'], ['spin', 360, 'Land a 360'], ['spin', 540, 'Land a 540']],
    notes: ['"Spot your landing. Turn your head first, the bike follows."', '"A 360 needs a ramp and a little faith."', '"Five-forty. The weathervane was jealous."'],
  },
  {
    id: 'backflip', name: 'Backflip', icon: 'skill_backflip', unit: '',
    how: 'Off a big ramp, pop at the lip and hold Q to flip backwards. Let go early and land level with the ground.',
    desc: 'Harold never managed this. He would have loved to watch.',
    tiers: [['backflip', 1, 'Land a backflip'], ['backflip', 5, 'Land 5 backflips'], ['backflip2', 1, 'Land a double backflip']],
    notes: ['"Hold on to your hat. And your skull."', '"Open up early. The flip finishes itself."', '"(This page is blank except for a very proud doodle.)"'],
  },
  {
    id: 'frontflip', name: 'Frontflip', icon: 'skill_frontflip', unit: '',
    how: 'Off a big ramp, pop at the lip and hold F to flip forwards. Ease off and pull back level before you land.',
    desc: 'Scarier than a backflip because you can see the ground coming.',
    tiers: [['frontflip', 1, 'Land a frontflip'], ['frontflip', 5, 'Land 5 frontflips'], ['frontflip2', 1, 'Land a double frontflip']],
    notes: ['"Tuck, look for the ground, lean back to land."', '"Fast in, early pop, long tuck."', '"Two front flips. Somewhere, Harold spilled his tea."'],
  },
  {
    id: 'drop', name: 'Wheelie Drop', icon: 'skill_drop', unit: '',
    how: 'Ride off a ledge or a ramp end in a wheelie and land back wheel first.',
    desc: 'Docks, porches, the boardwalk steps: everything is a drop if you are brave.',
    tiers: [['drop', 1, 'Land a wheelie drop'], ['drop', 3, 'Land 3 wheelie drops'], ['drop', 8, 'Land 8 wheelie drops']],
    notes: ['"Front up BEFORE the edge, not on it."', '"Back wheel first, soft knees, roll away."', '"Dropped off the dock. Into the boat. Captain Birdie\'s boat. Sorry Birdie."'],
  },
  {
    id: 'perfect', name: 'Perfect Landings', icon: 'skill_perfect', unit: '',
    how: 'Land level with the slope and pointing the way you are going. A perfect landing gives a little burst of speed. Chain them!',
    desc: 'Soft as a falling maple leaf.',
    tiers: [['streak', 2, '2 perfect landings in a row'], ['streak', 4, '4 perfect landings in a row'], ['streak', 8, '8 perfect landings in a row']],
    notes: ['"Lean back a hair before you touch down."', '"Match the hill. Downhill landings are the softest."', '"Eight in a row. My knees thank me."'],
  },
  {
    id: 'longjump', name: 'Long Jump', icon: 'skill_longjump', unit: 'm',
    how: 'Hit a ramp fast, pop at the lip, keep the bike level and stick the landing.',
    desc: 'Measured lip to landing. Nana keeps a tape measure for exactly this.',
    tiers: [['longjump', 7, 'Jump 7 metres'], ['longjump', 13, 'Jump 13 metres'], ['longjump', 20, 'Jump 20 metres']],
    notes: ['"Speed is distance. Pedal in rhythm into the ramp."', '"Pop right at the lip, not before."', '"Twenty metres. I could see Nova Scotia."'],
  },
  {
    id: 'combo', name: 'Combos', icon: 'skill_combo', unit: 'x',
    how: 'Chain tricks, spins and flips one after another before the combo timer runs out.',
    desc: 'The crowd loves a show. The crowd is mostly geese.',
    tiers: [['combo', 2, 'x2 combo'], ['combo', 4, 'x4 combo'], ['combo', 7, 'x7 combo']],
    notes: ['"Keep moving. Land and go again."', '"Wheelies count. So do spins. So does showing off."', '"Seven! The geese were speechless. Honking, but speechless."'],
  },
  {
    id: 'tricks', name: 'Air Poses', icon: 'skill_tricks', unit: '',
    how: 'In the air, hold Shift with a direction: Superman (W), No-Hander (S), Can-Can (A), Nothin\' (D), Skull Toss (none). Let go before you land!',
    desc: 'Different poses landed clean.',
    tiers: [['poses', 1, 'Land 1 kind of pose'], ['poses', 3, 'Land 3 kinds of pose'], ['poses', 5, 'Land all 5 poses']],
    notes: ['"Let go of the pose BEFORE the wheels touch. Trust me."', '"Superman needs big air. Can-can works off a hop."', '"Tossed my hat, caught my hat. Hank tossed his HEAD. Show-off."'],
  },
];

export const MAX_TIERS = SKILLS.reduce((n, s) => n + s.tiers.length, 0);
export const ENDING_TIERS = 20; // riding Bessie like Harold did brings on the ending

export class Skills {
  constructor(game) {
    this.game = game;
    this.rhythmT = 0;
    this.queue = [];
  }

  get S() {
    const st = this.game.state;
    if (!st.skills || typeof st.skills !== 'object') st.skills = {};
    st.skills.best ??= {};
    st.skills.tiers ??= {};
    st.skills.poses ??= {};
    return st.skills;
  }

  best(stat) {
    return this.S.best[stat] || 0;
  }

  tierOf(sk) {
    let t = 0;
    for (const [stat, need] of sk.tiers) {
      if (this.best(stat) >= need) t++;
      else break;
    }
    return t;
  }

  list() {
    return SKILLS.map((sk) => {
      const tier = Math.max(this.S.tiers[sk.id] || 0, this.tierOf(sk));
      const next = sk.tiers[tier];
      const top = sk.tiers[sk.tiers.length - 1];
      const progress = next ? Math.min(1, this.best(next[0]) / next[1]) : 1;
      return {
        id: sk.id, name: sk.name, icon: sk.icon, how: sk.how, desc: sk.desc,
        tier, maxTier: sk.tiers.length, goal: next ? next[2] : 'Mastered!', progress,
        best: this.best((next || top)[0]), unit: sk.unit,
        note: tier > 0 ? sk.notes[tier - 1] : '', tiers: sk.tiers.map((t) => t[2]),
      };
    });
  }

  total() {
    return SKILLS.reduce((n, sk) => n + Math.max(this.S.tiers[sk.id] || 0, this.tierOf(sk)), 0);
  }

  // raise a personal best; `live` values (mid-wheelie etc.) can unlock a tier on the spot
  record(stat, v, mode = 'max') {
    const B = this.S.best;
    const old = B[stat] || 0;
    const nv = mode === 'add' ? old + v : Math.max(old, v);
    if (nv <= old) return;
    B[stat] = Math.round(nv * 100) / 100;
    for (const sk of SKILLS) if (sk.tiers.some((t) => t[0] === stat)) this.check(sk);
  }

  check(sk) {
    const T = this.S.tiers;
    const now = this.tierOf(sk);
    const had = T[sk.id] || 0;
    if (now <= had) return;
    T[sk.id] = now;
    for (let t = had + 1; t <= now; t++) this.queue.push({ sk, t });
  }

  // called every frame by the game: live practice timers and the tier-up fanfare
  update(dt) {
    const g = this.game;
    const b = g.bike;
    if (g.mode === 'ride' && !g.onFoot && b && b.crash <= 0) {
      if (b.wheelieT > 0) this.record(b.wheeliePedalT < b.wheelieT * 0.15 ? 'manual' : 'wheelie', b.wheelieT);
      if (b.stoppieT > 0) this.record(b.stoppieBrakeT < b.stoppieT * 0.2 ? 'nose' : 'stoppie', b.stoppieT);
      if (b.drifting) this.record('drift', b.driftTime);
      this.rhythmT = b.rhythm > 0.75 && b.grounded ? this.rhythmT + dt : 0;
      if (this.rhythmT > 0) this.record('cadence', this.rhythmT);
    } else this.rhythmT = 0;
    // one fanfare at a time, and never in the middle of a cutscene or a menu
    if (this.queue.length && g.mode === 'ride' && !g.ui?.dialogueTick && !(this._cool > 0)) this.celebrate(this.queue.shift());
    this._cool = (this._cool || 0) - dt;
  }

  event(e) {
    switch (e.type) {
      case 'wheelieEnd': this.record(e.manual ? 'manual' : 'wheelie', e.time); break;
      case 'stoppieEnd': this.record(e.nose ? 'nose' : 'stoppie', e.time); break;
      case 'driftEnd': this.record('drift', e.time || 0); break;
      case 'perfectLand': this.record('streak', e.streak || 1); this.record('perfects', 1, 'add'); break;
      case 'land': {
        if (e.hop && !e.ramp && e.airTime < 1.6) this.record('hop', e.height || 0);
        if (e.airTime > 0.5) this.record('longjump', e.dist || 0);
        if (e.spin) this.record('spin', e.spin);
        if (e.flips > 0) { this.record('backflip', e.flips, 'add'); if (e.flips >= 2) this.record('backflip2', 1, 'add'); }
        if (e.flips < 0) { this.record('frontflip', -e.flips, 'add'); if (e.flips <= -2) this.record('frontflip2', 1, 'add'); }
        if (e.wheelieDrop) this.record('drop', 1, 'add');
        break;
      }
      case 'combo': this.record('combo', e.count || 0); break;
      case 'trick':
        if (e.id && !this.S.poses[e.id]) {
          this.S.poses[e.id] = true;
          this.record('poses', Object.keys(this.S.poses).length);
        }
        break;
    }
  }

  celebrate({ sk, t }) {
    const g = this.game;
    this._cool = 2.2;
    const tip = TIP[t] || 0;
    g.state.money += tip;
    g.ui?.pop(`*${sk.name} ${ROMAN[t]}!*${tip ? ` (+$${tip})` : ''} Harold wrote: ${sk.notes[t - 1]}`, { expr: 'sparkle', key: 'skill', ms: 5000 });
    g.sound?.play('stamp');
    g.sound?.play('combo_ding', { pitch: 0.9 + t * 0.12 });
    const p = g.bike.pos;
    g.effects?.confetti?.(p.x, p.y + 1.6, p.z, 16 + t * 10);
    g.rider?.ch?.react?.('yay');
    g.story?.onMastery?.(this.total(), MAX_TIERS, ENDING_TIERS);
    g.save?.();
  }

  // a plain-text summary for when the Skill Book page isn't available
  summary() {
    const done = this.list().filter((s) => s.tier > 0).map((s) => `${s.name} ${ROMAN[s.tier]}`);
    return done.length ? done.join(', ') : 'nothing yet';
  }
}

export { ROMAN };
