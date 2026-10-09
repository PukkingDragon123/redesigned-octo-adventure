// The contest crowd: two dozen and more townsfolk out on Main Street for the pumpkin
// carving contest, in the real game (not just in cutscenes), whenever the contest is on.
// They carve at the spare places and the two tables at the east end, chat in little
// circles on the sidewalks (laughing, pointing at the pumpkins), sip hot cider by the
// judges' table, wander from table to table for a look, take photos, play tag through
// the leaf pile, stroll hand in hand, walk a dog on a leash, push a stroller with a kid
// tagging along, and lean on their canes taking it all in. They cheer and clap when Gus
// announces (Contest.cheer), lean in when he inspects a table near them, and wave at
// Hank once they know him.
//
// The first time Hank rides in they all freeze mid-action and stare (contest.js runs the
// cocoa round): no screams, no running; a cup of cocoa thaws them one by one.
//
// Cheap on phones: each townsperson is a full voxel rig (vchar.js, no cloth) only while
// among the nearest few to the camera (12 / 8 / 5 by quality); everyone else is a baked
// impostor: their whole posed body merged into one mesh (one draw call, plus the face
// decal), with a second bake for cheering. Rigs animate every frame up close and every
// second or third frame further off; the lot is hidden when the contest is far away or
// the camera looks elsewhere, and bodies are built a few at a time in idle time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VoxelCharacter, CHARACTERS, extendVChar, POSE_KIT } from './vchar.js';
import { makeCrowd } from './crowdGen.js';
import { CONTEST } from '../world/contest.js';
import * as CM from '../voxel/models/contest.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { P as PX } from '../render/particles.js';
import * as FOOD from '../voxel/models/food.js';

const { arm, POSES } = POSE_KIT;
const hyp = Math.hypot;
const PI = Math.PI;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const C = CONTEST.crowd;
const NK = CONTEST.spots.agnes.z - 0.12, SK = CONTEST.spots.birdie.z + 0.12; // the kerbs (46 and 54)

// ---------------------------------------------------------------- poses and props
extendVChar({
  poses: {
    // leaning on a cane in the right hand, a little stooped
    cane(c, t, T) {
      POSES.idle(c, t, T);
      arm(T, 'R', 0.32, 0.2, 0.3, 0.05);
      T.lean += 0.12; T.headX -= 0.08;
    },
    // both hands on a stroller's handle
    stroll(c, t, T) {
      arm(T, 'L', 0.72, 0.06, 0.6, 0.3); arm(T, 'R', 0.72, 0.06, 0.6, 0.3);
      T.lean += 0.07;
    },
    // holding hands: the hand on the partner's side reaches across
    handL(c, t, T) { POSES.idle(c, t, T); arm(T, 'L', 0.1, 0.42, 0.12); T.headY += Math.sin(t * 0.7) * 0.2 + 0.15; },
    handR(c, t, T) { POSES.idle(c, t, T); arm(T, 'R', 0.1, 0.42, 0.12); T.headY += Math.sin(t * 0.6) * 0.2 - 0.15; },
    // the dog's leash in the right hand
    leash(c, t, T) { POSES.idle(c, t, T); arm(T, 'R', 0.5, 0.16, 0.45, 0.05); },
    // a paper cup of hot cider, sipped now and then
    sipCider(c, t, T) { POSES.sip(c, t, T); },
    // the cocoa cup Hank gave them, warming both hands
    sipCup(c, t, T) { POSES.sip(c, t, T); arm(T, 'L', 1.0, 0.25, 1.9, 0.75); },
  },
  held: {
    cane: { fn: () => CM.cane(), scale: 1 },
    sipCider: { fn: CM.ciderCup, scale: 1, upright: true },
    sipCup: { fn: FOOD.cocoaTakeaway, scale: 1, upright: true },
  },
  loco: ['cane', 'stroll', 'handL', 'handR', 'leash', 'sipCider', 'sipCup'],
});

// a rig for a townsperson: no cloth (their scarves are the knotted ring)
class Townsfolk extends VoxelCharacter {
  buildCloth() { this.cloths = []; }
}

// ---------------------------------------------------------------- what they say
const LINES = {
  chat: ["Did you see Marie's pumpkin? It has a MOUSTACHE.", 'Best contest in years!', "Gus is in fine voice today.", "Is that a moose? I think it's a moose.", 'Mine has a unibrow. On purpose.', "Remember the year it snowed on the pumpkins?", 'Pass the seeds, eh?', 'Lovely day for it.', 'Ha! No!', 'You did NOT.'],
  carve: ['Steady... steady...', "Oops. That's a dimple now.", 'Mine is a lighthouse!', 'Seeds EVERYWHERE.', 'Ta-da!', 'Is this nose too big?'],
  kidCarve: ['EWWW, GUTS!', "Mine's a GHOST!", 'Look! LOOK!', 'I got seeds in my sleeve!'],
  tag: ["TAG! You're it!", "Can't catch me!", 'Wheee!', 'No tag-backs!', 'Into the leaves!'],
  admire: ['Ooh, look at that one.', "Now that's a grin.", 'Hmm! Lovely work.', 'The giant one! Holy moly!', 'Spooky!'],
  photo: ['Say "pumpkin"!', 'Hold still... got it!', 'One more!', 'Ooh, the light is perfect.'],
  cider: ['Mmm, cinnamon.', 'Warms you right up.', "Another cup? Don't mind if I do.", 'Hot hot hot!'],
  elder: ['In my day we carved turnips.', 'Hmph. Not bad at all.', 'Lovely. Just lovely.'],
  thaw: ["...Oh. Oh, that's lovely.", "Is this Marguerite's? It IS!", 'Thank you... Mr. Skeleton.', 'Warm right down to my toes!', "Well, aren't you sweet.", 'Mmm! Marshmallows!', 'Huh. Friendly bones.'],
  kidThaw: ['A SKELETON GAVE ME COCOA!', 'Cool! Thanks, bones!', 'Can I touch your skull? ...Later.', 'Best. Day. EVER.'],
  ripple: ['...Is it okay?', 'He brought cocoa?', 'Oh! He seems nice.', 'Huh.'],
  hello: ['Hi, Hank!', 'Thanks for the cocoa!', "Hey, it's the cocoa skeleton!", 'Lovely day for it, Hank!', 'Hiya, bones!'],
  kidHello: ['HANK!!', 'Do a wheelie!', 'HI SKELETON!'],
  cheer: ['Hooray!', 'Woo-hoo!', 'Bravo!', 'Yeah!!', 'Whoo!'],
  kidCheer: ['YAAAY!', 'WOOOO!', 'HOORAY!!'],
};

// ---------------------------------------------------------------- getting about
// the tables stand along both kerbs; between the sidewalks and the road there are gaps
const GAPS_N = [122.6, 127.6, 134.0, 141.9, 146.6, 152.6];
const GAPS_S = [120.0, 123.5, 129.4, 135.8, 144.85, 150.3];
const side = (z) => (z < NK + 0.2 ? -1 : z > SK - 0.2 ? 1 : 0); // -1 north sidewalk, 1 south sidewalk, 0 the road
function route(a, b) {
  const sa = side(a.z), sb = side(b.z);
  if (sa === sb) return [{ x: b.x, z: b.z }];
  const out = [];
  const cross = (s, x0, x1) => {
    const gaps = s < 0 ? GAPS_N : GAPS_S;
    let g = gaps[0], bd = 1e9;
    for (const x of gaps) { const d = Math.abs(x - x0) + Math.abs(x - x1); if (d < bd) { bd = d; g = x; } }
    return g;
  };
  let x = a.x;
  if (sa !== 0) {
    const g = cross(sa, a.x, b.x);
    out.push({ x: g, z: sa < 0 ? C.laneN : C.laneS }, { x: g, z: sa < 0 ? C.stripN : C.stripS });
    x = g;
  }
  if (sb !== 0) {
    const g = cross(sb, x, b.x);
    out.push({ x: g, z: sb < 0 ? C.stripN : C.stripS }, { x: g, z: sb < 0 ? C.laneN : C.laneS });
  }
  out.push({ x: b.x, z: b.z });
  return out;
}

const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const _ro = { px: 0, pz: 0 };
const RIGS = { high: 12, medium: 8, low: 5 };

// bake a rig's current pose into one merged mesh (+ its face decal) for the far view
function bake(a, pose) {
  a.play(pose, 'happy');
  a.reaction = null;
  a.lookAt(null);
  a.computeTargets(0);
  Object.assign(a.J, a.T);
  a.pelvis = 0;
  const hop = a.hop;
  a.hop = 0;
  a.apply();
  a.hop = hop;
  a.root.updateMatrixWorld(true);
  _inv.copy(a.root.matrixWorld).invert();
  const geos = [];
  let face = null;
  a.root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    if (o === a.faceMesh) { face = _rel.clone(); return; }
    const src = o.geometry;
    if (!src.attributes.color4 || !src.index) return;
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color4', 'detail']) if (src.attributes[k]) g.setAttribute(k, src.attributes[k].clone());
    g.setIndex(src.index.clone());
    g.applyMatrix4(_rel);
    if (_rel.determinant() < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    geos.push(g);
  });
  const ok = geos.every((g) => Object.keys(g.attributes).length === Object.keys(geos[0].attributes).length);
  const merged = ok && geos.length ? mergeGeometries(geos, false) : null;
  for (const g of geos) g.dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = voxMesh(merged, sharedVoxelMaterial());
  mesh.matrixAutoUpdate = false;
  const grp = new THREE.Group();
  grp.add(mesh);
  if (face) {
    const fm = new THREE.Mesh(a.faceMesh.geometry, a.faceMat);
    fm.matrixAutoUpdate = false;
    fm.matrix.copy(face);
    grp.add(fm);
  }
  return grp;
}

export class Crowd {
  constructor(game, contest) {
    this.g = game;
    this.contest = contest;
    this.list = makeCrowd();
    for (const m of this.list) {
      CHARACTERS[m.id] = m.spec;
      extendVChar({ persona: { [m.id]: m.persona } });
      m.a = null; // the rig, built in idle time
      m.imp = null; // { stand, cheer } baked bodies
      m.base = new THREE.Group(); // the impostor and anything they push about (the stroller)
      m.base.visible = false;
      m.tier = 'none';
      m.shown = false;
      m.yaw = 0;
      m.path = null;
      m.gen = null;
      m.waitT = 0;
      m.frozen = false;
      m.thawed = false;
      m.cheerT = 0;
      m.cool = 0;
      m.lodN = m.i;
      m.lodT = 0;
      m.d = 1e9;
      m.homePose = { carve: m.kid ? 'scoop' : 'carve', cider: 'sipCider', photo: 'photo', couple: m.entry.lead ? 'handR' : 'handL', dog: 'leash', stroller: 'stroll', elder: 'cane' }[m.role] || 'idle';
    }
    // who goes with whom
    const by = (role) => this.list.filter((m) => m.role === role);
    const [lead, partner] = by('couple');
    if (lead && partner) { lead.partner = partner; partner.follows = lead; }
    const parent = by('stroller')[0], tot = by('tagalong')[0];
    if (parent && tot) { tot.parent = parent; parent.kid2 = tot; }
    this.groups = [by('chat').filter((m) => m.entry.group === 0), by('chat').filter((m) => m.entry.group === 1)];
    this.tagKids = by('tag');
    this.it = this.tagKids[0] || null;
    this.building = 0;
    this.on = false;
    this.lodT = 0;
    this.sayT = 0;
    this.frame = 0;
  }

  // ------------------------------------------------------------ presence
  // the contest is on (8:30 to 5) and the crowd turns out; during the cocoa round they stay
  // (contest.js pins them) whatever the hour
  wanted() {
    const g = this.g, h = g.world.atmosphere.hour;
    if (this.contest.round?.pinned()) return true;
    return h >= 8.5 && h < 17;
  }
  // the members who are out at the contest right now (and built)
  present() {
    return this.list.filter((m) => m.shown);
  }

  // ------------------------------------------------------------ building, a body or two per idle slot
  build(m) {
    const g = this.g;
    const s = this.startSpot(m);
    const a = new Townsfolk(g, m.id, { x: s.x, z: s.z, yaw: s.yaw ?? 0, anim: m.homePose });
    a.crowd = m;
    a.visible = false;
    a.root.visible = false;
    m.a = a;
    m.yaw = a.yaw;
    this.fixHeld(m);
    // the far view: their home pose, and a cheer
    m.imp = { stand: bake(a, m.homePose), cheer: bake(a, m.role === 'elder' ? 'cane' : 'cheer') };
    for (const k of ['stand', 'cheer']) if (m.imp[k]) { m.imp[k].visible = k === 'stand'; m.base.add(m.imp[k]); }
    // (and settle the rig itself into the home pose)
    a.play(m.homePose, 'neutral');
    a.computeTargets(0);
    Object.assign(a.J, a.T);
    a.apply();
    this.fixHeld(m);
    if (m.role === 'stroller') {
      const r = CM.stroller({ color: pick([0x3a5a9a, 0x8a2a3a, 0x2f6e3a, 0x4a4a5a]), hat: pick([0xd8361f, 0xf2c430, 0x2a5aa8, 0xd86a8a]), skin: pick([0xf2c8a2, 0xd8a274, 0x9c6844, 0xf4c2a6]) });
      const sm = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 }), sharedVoxelMaterial());
      sm.position.set(0, 0, 0.5);
      m.base.add(sm);
      m.stroller = sm;
    }
    if (m.role === 'dog') this.buildDog(m);
    g.scene.add(m.base);
    g.villagers?.list.push(a); // (bodies don't overlap: npcs.js keeps everyone apart)
    m.gen = this.behaviour(m);
  }
  buildDog(m) {
    const g = this.g;
    const r = CM.leashDog({ color: pick([0xb8844a, 0x3a2a22, 0xe8d0a0, 0x8a5a3a]), spot: 0xf2e6cc });
    const mk = (part) => voxMesh(meshVox(part.vox, { size: part.size, origin: part.origin }), sharedVoxelMaterial());
    const grp = new THREE.Group();
    const body = mk(r.body), tail = mk(r.tail), front = mk(r.legs), back = mk(r.legs);
    tail.position.set(...r.meta.tail);
    front.position.set(...r.meta.front);
    back.position.set(...r.meta.back);
    grp.add(body, tail, front, back);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x5a2a1a }));
    line.frustumCulled = false;
    g.scene.add(grp, line);
    grp.visible = line.visible = false;
    m.dog = { grp, tail, front, back, line, collar: r.meta.collar, x: m.a.pos.x - 0.8, z: m.a.pos.z, yaw: 0, ph: 0, sniff: 0 };
  }
  // the cane is cut to their height; a carver's knife (or scoop) as their pose wants
  fixHeld(m) {
    const a = m.a, h = a.held.R;
    if (h && a.anim === 'cane') {
      const P = a.P;
      const hand = P.hipH + P.shoulderY - (P.upperL + P.foreL) * 0.93;
      h.scale.setScalar(Math.max(0.35, Math.min(1.2, hand / 0.86)));
    }
  }
  startSpot(m) {
    const role = m.role;
    if (role === 'carve') return C.carve[m.entry.slot];
    if (role === 'chat') return this.chatSpot(m);
    if (role === 'cider') return C.cider[m.entry.slot];
    if (role === 'elder') return C.elder[m.entry.slot];
    if (role === 'admire') return C.exhibits[(m.i * 3) % C.exhibits.length];
    if (role === 'photo') return C.photo[0];
    if (role === 'tag') return { x: rand(C.tag.x0, C.tag.x1), z: rand(C.tag.z0, C.tag.z1), yaw: 0 };
    if (role === 'couple') return { x: 128 + (m.follows ? 0 : 0.6), z: C.stripN, yaw: PI / 2 };
    if (role === 'dog') return { x: 131, z: C.laneN, yaw: PI / 2 };
    if (role === 'stroller') return { x: 127.5, z: C.laneS, yaw: PI / 2 };
    if (role === 'tagalong') return { x: 126.8, z: C.laneS + 0.4, yaw: PI / 2 };
    return { x: 133, z: C.laneN, yaw: 0 };
  }
  chatSpot(m) {
    const grp = this.groups[m.entry.group] || [m], G = C.chat[m.entry.group] || C.chat[0];
    const k = Math.max(0, grp.indexOf(m));
    const ang = (k / grp.length) * PI * 2 + 0.4;
    const x = G.x + Math.sin(ang) * G.r, z = G.z + Math.cos(ang) * G.r;
    return { x, z, yaw: Math.atan2(G.x - x, G.z - z) };
  }

  // ------------------------------------------------------------ behaviours (generators: yield seconds to wait,
  // or { walk: [pts], speed } to walk there first)
  *behaviour(m) {
    switch (m.role) {
      case 'carve': yield* this.carve(m); break;
      case 'chat': yield* this.chat(m); break;
      case 'cider': yield* this.cider(m); break;
      case 'admire': yield* this.admire(m); break;
      case 'photo': yield* this.photo(m); break;
      case 'tag': yield* this.tag(m); break;
      case 'couple': yield* (m.follows ? this.follow(m) : this.couple(m)); break;
      case 'dog': yield* this.walkDog(m); break;
      case 'stroller': yield* this.stroller(m); break;
      case 'tagalong': yield* this.follow(m); break;
      case 'elder': yield* this.elder(m); break;
      default: for (;;) yield 5;
    }
  }
  *goTo(m, s, speed = 1.1) {
    const a = m.a;
    if (hyp(s.x - a.pos.x, s.z - a.pos.z) > 0.25) yield { walk: route(a.pos, s), speed };
    if (s.yaw != null) a.face(s.yaw);
  }
  *carve(m) {
    const a = m.a, s = C.carve[m.entry.slot];
    yield* this.goTo(m, s);
    for (;;) {
      a.face(s.yaw);
      this.pose(m, m.kid && Math.random() < 0.6 ? 'scoop' : 'carve', m.kid ? 'happy' : 'determined');
      yield rand(4, 8);
      this.contest.bits(a, s);
      const r = Math.random();
      if (r < 0.25) { this.pose(m, 'scoop', 'neutral'); this.sfx('squish', a.pos, 0.2); yield rand(2.5, 4); this.contest.bits(a, s); }
      else if (r < 0.45) {
        this.pose(m, 'present', 'proud');
        a.react(m.kid ? 'yay' : 'bounce');
        if (Math.random() < 0.35) this.say(m, pick(m.kid ? LINES.kidCarve : LINES.carve));
        yield rand(1.6, 2.4);
      } else if (r < 0.7) {
        // a word with whoever is carving next to them
        const n = this.neighbour(m, 2.4);
        this.pose(m, 'idle', 'happy');
        if (n) { a.lookAt(n); a.say(rand(1.5, 2.6)); a.tempExpr(pick(['giggle', 'happy', 'surprised', 'smug']), 2); n.react?.(pick(['laugh', 'nod'])); }
        else a.react('laugh');
        yield rand(2, 3);
        a.lookAt(null);
      } else {
        this.pose(m, 'idle', 'happy');
        a.react(m.kid ? pick(['yay', 'spin', 'laugh']) : 'laugh');
        if (m.kid && Math.random() < 0.4) this.say(m, pick(LINES.kidCarve));
        yield 1.4;
      }
    }
  }
  *chat(m) {
    const a = m.a, s = this.chatSpot(m), G = C.chat[m.entry.group] || C.chat[0];
    yield* this.goTo(m, s);
    yield rand(0, 2);
    for (;;) {
      a.faceTowards(G.x, G.z);
      const mates = this.groups[m.entry.group].filter((o) => o !== m && o.shown && !o.frozen && o.a);
      const r = Math.random();
      if (mates.length && r < 0.45) {
        // talking, with their hands
        this.pose(m, 'idle', 'happy');
        a.lookAt(pick(mates).a);
        a.say(rand(1.8, 3.2));
        a.tempExpr(pick(['happy', 'giggle', 'surprised', 'excited', 'smug', 'awe']), 2);
        if (Math.random() < 0.3) this.say(m, pick(LINES.chat), 2400);
        for (const o of mates) if (Math.random() < 0.6) { o.a.lookAt(a); if (Math.random() < 0.5) o.a.react(pick(['nod', 'laugh'])); }
      } else if (r < 0.65) {
        a.react(pick(['laugh', 'laugh', 'nod', 'clap']));
      } else if (r < 0.8) {
        // "look at THAT one": pointing at a pumpkin
        const e = pick(C.exhibits);
        a.faceTowards(e.lx, e.lz);
        this.pose(m, 'point', 'excited');
        yield 1.8;
        this.pose(m, 'idle', 'happy');
      } else if (r < 0.9) this.pose(m, 'sipCider', 'happy');
      yield rand(2.2, 3.8);
    }
  }
  *cider(m) {
    const a = m.a, s = C.cider[m.entry.slot];
    yield* this.goTo(m, s);
    for (;;) {
      a.face(s.yaw);
      this.pose(m, 'sipCider', 'happy');
      yield rand(3, 6);
      if (this.near(m)) this.steam(a);
      const r = Math.random();
      if (r < 0.4) { const o = this.list.find((q) => q.role === 'cider' && q !== m); if (o?.a) { a.lookAt(o.a); a.say(rand(1.5, 2.5)); } if (Math.random() < 0.3) this.say(m, pick(LINES.cider)); }
      else if (r < 0.55) { a.react('laugh'); }
      yield rand(2, 4);
      a.lookAt(null);
    }
  }
  *admire(m) {
    const a = m.a;
    for (;;) {
      const free = C.exhibits.filter((e) => !this.list.some((o) => o !== m && o.shown && o.a && hyp(o.a.pos.x - e.x, o.a.pos.z - e.z) < 0.8));
      const e = pick(free.length ? free : C.exhibits);
      this.pose(m, 'idle', 'neutral');
      yield* this.goTo(m, e, rand(0.9, 1.2));
      a.faceTowards(e.lx, e.lz);
      const r = Math.random();
      this.pose(m, r < 0.35 ? 'point' : r < 0.6 ? 'think' : 'idle', pick(['awe', 'happy', 'surprised']));
      if (Math.random() < 0.3) this.say(m, pick(LINES.admire));
      yield rand(3, 6);
      if (Math.random() < 0.4) a.react(pick(['nod', 'clap', 'laugh']));
      yield rand(1.5, 3);
    }
  }
  *photo(m) {
    const a = m.a;
    let k = 0;
    for (;;) {
      const s = C.photo[k++ % C.photo.length];
      this.pose(m, 'idle', 'happy');
      yield* this.goTo(m, s, 1.15);
      a.faceTowards(s.lx, s.lz);
      this.pose(m, 'photo', 'determined');
      yield rand(1, 1.8);
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        this.snap(m);
        yield rand(0.6, 1.1);
      }
      if (Math.random() < 0.35) this.say(m, pick(LINES.photo));
      this.pose(m, 'idle', 'happy');
      a.react('nod');
      yield rand(3, 6);
    }
  }
  // a click and a flash
  snap(m) {
    const a = m.a, g = this.g;
    if (!this.near(m, 30)) return;
    this.sfx('camera_shutter', a.pos, 0.5);
    a.headWorld(_v);
    _f.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    g.effects?.glint?.(_v.x + _f.x * 0.25, _v.y - 0.08, _v.z + _f.z * 0.25, { size: 0.5, life: 0.18 });
  }
  *tag(m) {
    const a = m.a, T = C.tag;
    for (;;) {
      if (this.it === m) {
        // it: chase whoever is nearest
        const prey = this.tagKids.filter((o) => o !== m && o.shown && !o.frozen && o.a);
        const q = prey.sort((p, o) => hyp(p.a.pos.x - a.pos.x, p.a.pos.z - a.pos.z) - hyp(o.a.pos.x - a.pos.x, o.a.pos.z - a.pos.z))[0];
        if (!q) { yield 1; continue; }
        this.pose(m, 'idle', 'excited');
        yield { walk: [{ x: q.a.pos.x, z: q.a.pos.z }], speed: rand(2.6, 3.2), chase: q, stop: 0.45 };
        if (hyp(q.a.pos.x - a.pos.x, q.a.pos.z - a.pos.z) < 0.7 && this.it === m) {
          // TAG!
          this.it = q;
          a.react('yay');
          q.a.react('spin');
          q.cool = 1.2;
          this.say(m, pick(LINES.tag), 1300);
          if (this.near(m, 25) && Math.random() < 0.5) this.sfx('kids_yay', a.pos, 0.18);
          yield rand(0.8, 1.4);
        }
      } else {
        // run off somewhere in the playground, away from it
        const it = this.it?.a;
        let x = rand(T.x0, T.x1), z = rand(T.z0, T.z1);
        if (it && hyp(x - it.pos.x, z - it.pos.z) < 2.5) x = it.pos.x < (T.x0 + T.x1) / 2 ? T.x1 - rand(0, 2) : T.x0 + rand(0, 2);
        this.pose(m, 'idle', pick(['laugh', 'excited', 'happy']));
        if (m.cool > 0) yield m.cool;
        yield { walk: [{ x, z }], speed: rand(2.3, 3.0) };
        a.faceTowards(it ? it.pos.x : x, it ? it.pos.z : z);
        if (Math.random() < 0.3) a.react(pick(['yay', 'spin', 'laugh']));
        yield rand(0.4, 1.4);
      }
    }
  }
  *couple(m) {
    const a = m.a;
    const loop = [{ x: C.x0 + 1, z: C.stripN }, { x: C.x1 - 2, z: C.stripN }, { x: C.x1 - 2, z: C.stripS }, { x: C.x0 + 1, z: C.stripS }];
    let k = 1;
    for (;;) {
      const p = loop[k++ % loop.length];
      this.pose(m, 'handR', 'happy');
      // a stop to look at the tables on the way
      const mid = { x: (a.pos.x + p.x) / 2 + rand(-3, 3), z: p.z };
      yield { walk: [mid], speed: 0.85 };
      const e = C.exhibits.reduce((b, q) => (hyp(q.x - a.pos.x, q.z - a.pos.z) < hyp(b.x - a.pos.x, b.z - a.pos.z) ? q : b));
      a.faceTowards(e.lx, e.lz);
      if (Math.random() < 0.5) { this.pose(m, 'point', 'happy'); m.partner?.a?.react('love'); } else a.react('laugh');
      yield rand(2.5, 4.5);
      this.pose(m, 'handR', 'happy');
      yield { walk: [p], speed: 0.85 };
      yield rand(0.5, 1.5);
    }
  }
  // the partner (hand in hand) and the toddler behind the stroller just keep up
  *follow(m) {
    for (;;) yield 5;
  }
  *walkDog(m) {
    const a = m.a;
    for (;;) {
      const x = m.dir === 1 ? C.x0 + rand(0, 2) : C.x1 - rand(0, 3);
      m.dir = m.dir === 1 ? -1 : 1;
      this.pose(m, 'leash', 'happy');
      const stops = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < stops; i++) {
        yield { walk: [{ x: a.pos.x + (x - a.pos.x) * rand(0.3, 0.6), z: C.laneN }], speed: 0.95 };
        // the dog has found something to sniff
        if (m.dog) m.dog.sniff = rand(3, 6);
        a.faceTowards(a.pos.x, NK + 2);
        yield rand(3, 6);
      }
      yield { walk: [{ x, z: C.laneN }], speed: 0.95 };
      yield rand(2, 4);
    }
  }
  *stroller(m) {
    const a = m.a;
    for (;;) {
      const x = m.dir === 1 ? C.x0 + rand(1, 3) : C.x1 - rand(2, 5);
      m.dir = m.dir === 1 ? -1 : 1;
      this.pose(m, 'stroll', 'happy');
      yield { walk: [{ x: a.pos.x + (x - a.pos.x) * rand(0.35, 0.65), z: C.laneS }], speed: 0.7 };
      // a stop to look at the tables (the kid in tow points)
      a.faceTowards(a.pos.x, SK - 2);
      m.kid2?.a?.react(pick(['yay', 'hi']));
      yield rand(4, 7);
      yield { walk: [{ x, z: C.laneS }], speed: 0.7 };
      yield rand(2, 4);
    }
  }
  *elder(m) {
    const a = m.a, s = C.elder[m.entry.slot];
    yield* this.goTo(m, s, 0.55);
    for (;;) {
      a.face(s.yaw);
      this.pose(m, 'cane', 'happy');
      yield rand(6, 11);
      const r = Math.random();
      if (r < 0.3) { a.react('nod'); if (Math.random() < 0.4) this.say(m, pick(LINES.elder)); }
      else if (r < 0.55) {
        // a slow little turn along the sidewalk and back
        const h = { x: s.x + rand(-2.5, 2.5), z: s.z };
        yield { walk: [h], speed: 0.45 };
        yield rand(2, 4);
        yield { walk: [s], speed: 0.45 };
      } else if (r < 0.7) a.react('laugh');
    }
  }

  // ------------------------------------------------------------ little helpers
  pose(m, name, expr) {
    if (m.frozen) return;
    m.a.play(name, expr);
    if (name === 'cane') this.fixHeld(m);
  }
  near(m, r = 40) {
    const c = this.g.camera.position;
    return hyp(m.a.pos.x - c.x, m.a.pos.z - c.z) < r;
  }
  neighbour(m, r) {
    let best = null, bd = r;
    for (const o of this.list) {
      if (o === m || !o.shown || !o.a) continue;
      const d = hyp(o.a.pos.x - m.a.pos.x, o.a.pos.z - m.a.pos.z);
      if (d < bd) { bd = d; best = o.a; }
    }
    for (const b of this.contest.present()) {
      const d = hyp(b.a.pos.x - m.a.pos.x, b.a.pos.z - m.a.pos.z);
      if (d < bd) { bd = d; best = b.a; }
    }
    return best;
  }
  say(m, text, ms = 2000) {
    const g = this.g;
    if (!m.a || m.d > 24 || g.time - this.sayT < 1.6) return;
    this.sayT = g.time;
    g.ui?.tag(`crowd:${m.i}`, text, _w.set(m.a.pos.x, m.a.pos.y + m.a.P.height + 0.4, m.a.pos.z).clone(), ms);
    m.a.say(Math.min(2.5, ms / 1000));
  }
  sfx(name, pos, vol) {
    this.g.villagers?.sfx(name, pos, vol);
  }
  steam(a) {
    const g = this.g;
    a.headWorld(_v);
    g.effects?.ps.spawn({ x: _v.x + Math.sin(a.yaw) * 0.2, y: _v.y - 0.25, z: _v.z + Math.cos(a.yaw) * 0.2, vx: 0, vy: 0.35, vz: 0, life: 1.4, size: 0.05, size1: 0.18, sprite: PX.steam, color: [1, 1, 1], alpha: 0.5, drag: 0.6, flutter: 0.4 });
  }

  // ------------------------------------------------------------ the cocoa round (contest.js)
  freeze(m) {
    if (m.frozen || !m.a) return;
    m.frozen = true;
    m.path = null;
    const a = m.a;
    this.contest.freezeActor(a);
    a.lookAt(this.g.playerChar);
    a.tempExpr(pick(['shock', 'surprised']), rand(0.6, 1.4));
    m.cheerT = 0;
    // the toddler hides behind the parent's legs and peeks out
    if (m.role === 'tagalong' && m.parent?.a) {
      const pa = m.parent.a, P = this.g.playerPos;
      const dx = pa.pos.x - P.x, dz = pa.pos.z - P.z, d = hyp(dx, dz) || 1;
      m.hideAt = { x: pa.pos.x + (dx / d) * 0.55, z: pa.pos.z + (dz / d) * 0.55 };
      a.peekSide = Math.random() < 0.5 ? 1 : -1;
      a.play('peek', 'worried');
    }
  }
  unfreeze(m) {
    if (!m.frozen) return;
    m.frozen = false;
    m.hideAt = null;
    m.a.lookAt(null);
    m.a.play(m.homePose, 'neutral');
    m.gen = this.behaviour(m);
    m.waitT = rand(0, 0.6);
  }
  // given a cup (or won over by the neighbours): back to the contest, happy
  async thaw(m, given = false) {
    const g = this.g, a = m.a;
    if (!m.frozen || m.thawing) return;
    m.thawing = true;
    try {
      if (given) {
        // a hesitant look at the cup... and then they take it
        a.tempExpr('worried', 1);
        a.react('flinch');
        await g.wait(0.7);
        a.play('offer', 'surprised');
        await g.wait(0.6);
        a.play('sipCup', 'happy');
        this.sfx('sip', a.pos, 0.5);
        await g.wait(0.9);
        this.steam(a);
        a.tempExpr('love', 1.5);
        g.effects?.hearts(a.pos.x, a.pos.y + a.P.height + 0.2, a.pos.z, 3);
        g.emotes?.show(a, 'heart', 1.5);
        this.say(m, pick(m.kid ? LINES.kidThaw : LINES.thaw), 2400);
        await g.wait(1.4);
      } else {
        await g.wait(rand(0, 1.2));
        a.react('shake');
        a.tempExpr(pick(['happy', 'sheepish', 'surprised']), 1.5);
        if (Math.random() < 0.25) this.say(m, pick(LINES.ripple), 1800);
        await g.wait(0.9);
      }
      m.thawed = true;
      this.unfreeze(m);
      if (given) a.play('sipCup', 'happy');
    } finally {
      m.thawing = false;
    }
  }
  // the neighbours of someone who just took a cup thaw too (nearest first)
  thawNear(x, z, n) {
    const fr = this.list.filter((m) => m.frozen && !m.thawing && m.a).sort((p, q) => hyp(p.a.pos.x - x, p.a.pos.z - z) - hyp(q.a.pos.x - x, q.a.pos.z - z));
    for (const m of fr.slice(0, n)) this.thaw(m, false);
    return Math.min(n, fr.length);
  }
  frozenCount() {
    return this.list.filter((m) => m.frozen).length;
  }
  // the nearest frozen townsperson Hank could offer a cup
  nearestFrozen(p, r) {
    let best = null, bd = r;
    for (const m of this.list) {
      if (!m.frozen || m.thawing || !m.shown || !m.a) continue;
      const d = hyp(m.a.pos.x - p.x, m.a.pos.z - p.z);
      if (d < bd && Math.abs(m.a.pos.y - p.y) < 2.5) { bd = d; best = m; }
    }
    return best;
  }

  // ------------------------------------------------------------ the crowd's reactions
  cheer(level = 1) {
    const g = this.g;
    let n = 0, kids = 0, said = 0;
    for (const m of this.list) {
      if (!m.shown || m.frozen || !m.a || m.path) continue;
      n++;
      if (m.kid) kids++;
      g.wait(rand(0, 0.4)).then(() => {
        if (m.frozen || !m.a) return;
        m.cheerT = level > 1 ? 2.6 : 1.8;
        const a = m.a;
        if (m.kid) { a.react('yay'); g.wait(0.95).then(() => a.react(level > 1 && Math.random() < 0.5 ? 'spin' : 'yay')); }
        else if (m.role === 'elder' || m.role === 'stroller' || m.role === 'dog' || Math.random() < 0.4) a.react('clap');
        else {
          const prev = a.anim;
          a.play('cheer');
          a.tempExpr(pick(['excited', 'happy', 'laugh']), 2.4);
          g.wait(m.cheerT).then(() => { if (a.anim === 'cheer' && !m.frozen) a.play(prev); });
        }
        if (said < 3 && m.d < 20 && Math.random() < 0.3) { said++; this.say(m, pick(m.kid ? LINES.kidCheer : LINES.cheer), 1500); }
      });
    }
    return { n, kids };
  }
  // Gus leans in at a table: whoever is carving there holds their breath
  watchHost(x, z, host, r = 2.6) {
    const out = [];
    for (const m of this.list) {
      if (!m.shown || m.frozen || !m.a || hyp(m.a.pos.x - x, m.a.pos.z - z) > r) continue;
      m.a.lookAt(host);
      m.a.tempExpr(pick(['worried', 'proud', 'sheepish']), 3);
      out.push(m);
    }
    return out;
  }
  doneWatching(list) {
    for (const m of list) { if (m.frozen) continue; m.a.lookAt(null); m.a.react(m.kid ? 'yay' : 'bounce'); }
  }
  onBell() {
    for (const m of this.list) {
      if (!m.shown || m.frozen || !m.a || m.d > 22 || !this.friendly()) continue;
      this.g.wait(rand(0, 0.5)).then(() => { m.a.faceTowards(this.g.playerPos.x, this.g.playerPos.z); m.a.react(m.kid ? 'yay' : 'hi'); });
    }
  }
  friendly() {
    return this.contest.round?.isDone?.() ?? true;
  }
  // Hank strolls (or rolls slowly) past someone who knows him: a wave, a hello
  greet() {
    const g = this.g;
    if (g.mode !== 'ride' || !this.friendly()) return;
    const p = g.playerPos, slow = g.onFoot || g.bike.speed < 4;
    if (!slow || g.time < (this.greetT || 0)) return;
    for (const m of this.list) {
      if (!m.shown || m.frozen || m.thawing || !m.a || m.path || g.time < (m.helloT || 0)) continue;
      const d = hyp(m.a.pos.x - p.x, m.a.pos.z - p.z);
      if (d > 4.5 || d < 1.2) continue;
      m.helloT = g.time + rand(40, 70);
      this.greetT = g.time + rand(1.5, 3);
      m.a.lookAt(g.playerChar);
      m.a.react(m.kid ? 'yay' : 'hi');
      if (Math.random() < 0.6) this.say(m, pick(m.kid ? LINES.kidHello : LINES.hello), 1800);
      g.wait(3).then(() => { if (!m.frozen && m.a.lookTarget === g.playerChar) m.a.lookAt(null); });
      return;
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, near) {
    const g = this.g;
    this.frame++;
    const want = this.wanted();
    // build the bodies a couple at a time while the browser idles (once the contest is in reach)
    const cam = g.camera.position;
    const camD = hyp(cam.x - CONTEST.x, cam.z - CONTEST.z);
    if (this.building < this.list.length && !this.pending && (camD < 260 || g.mode === 'title')) {
      this.pending = true;
      const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 16);
      idle(() => {
        this.pending = false;
        const t0 = performance.now();
        while (this.building < this.list.length && performance.now() - t0 < 8) this.build(this.list[this.building++]);
      }, { timeout: 500 });
    }
    const vis = near && want;
    if (!vis && this.on) this.hideAll();
    this.on = vis;
    if (!vis) return;
    const camF = g.camera.getWorldDirection(_f);
    // tiers: the nearest few (in view) get a full rig, the rest are impostors
    if ((this.lodT -= dt) <= 0) {
      this.lodT = 0.25;
      const K = RIGS[g.settings?.quality] ?? 8;
      const cands = [];
      for (const m of this.list) {
        if (!m.a) continue;
        const a = m.a;
        m.d = hyp(a.pos.x - cam.x, a.pos.z - cam.z);
        const ahead = (a.pos.x - cam.x) * camF.x + (a.pos.z - cam.z) * camF.z;
        m.inView = ahead > -3 || m.d < 6;
        if (m.d < 30 && m.inView) cands.push(m);
      }
      cands.sort((p, q) => p.d - (p.tier === 'rig' ? 2 : 0) - (q.d - (q.tier === 'rig' ? 2 : 0)));
      this.greet();
      const rigs = new Set(cands.slice(0, K));
      for (const m of this.list) if (m.a) this.setTier(m, rigs.has(m) ? 'rig' : 'imp');
    }
    for (const m of this.list) if (m.a) this.tick(m, dt, cam);
  }
  setTier(m, tier) {
    if (!m.shown) {
      m.shown = true;
      m.a.visible = true;
      // back after a while away: straight to where they'd be
      this.snapHome(m);
    }
    if (m.tier === tier) return;
    m.tier = tier;
    const rig = tier === 'rig';
    m.a.root.visible = rig;
    if (m.imp) for (const k of ['stand', 'cheer']) if (m.imp[k]) m.imp[k].visible = !rig && k === (m.cheerT > 0 ? 'cheer' : 'stand');
    m.base.visible = true;
    m.lodT = 0;
  }
  hideAll() {
    for (const m of this.list) {
      if (!m.a) continue;
      m.shown = false;
      m.tier = 'none';
      m.a.visible = false;
      m.a.root.visible = false;
      m.base.visible = false;
      if (m.dog) m.dog.grp.visible = m.dog.line.visible = false;
    }
  }
  snapHome(m) {
    if (m.frozen) return;
    const s = this.startSpot(m);
    m.a.pos.set(s.x, this.g.physics.groundAt(s.x, s.z, m.a.pos.y + 2).h, s.z);
    if (s.yaw != null) m.a.yaw = m.a.targetYaw = s.yaw;
    m.path = null;
    m.gen = this.behaviour(m);
    m.waitT = rand(0, 1.5);
    if (m.dog) { m.dog.x = s.x - 0.8; m.dog.z = s.z; }
  }

  tick(m, dt, cam) {
    const a = m.a, g = this.g;
    // the plan
    if (!m.frozen && !m.thawing) {
      if (m.cool > 0) m.cool -= dt;
      if (m.path) this.walkStep(m, dt);
      else if ((m.waitT -= dt) <= 0) this.advance(m);
    } else if (m.hideAt) {
      // (the toddler scurrying round behind mum or dad)
      const dx = m.hideAt.x - a.pos.x, dz = m.hideAt.z - a.pos.z, d = hyp(dx, dz);
      if (d > 0.05) { const s = Math.min(d, 2.2 * dt); a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s; }
      a.faceTowards(g.playerPos.x, g.playerPos.z);
    }
    if (m.follows || m.parent) this.keepUp(m, dt);
    if (m.cheerT > 0) m.cheerT -= dt;
    // the body: a rig up close (animated less often further off), else the impostor
    if (m.tier === 'rig') {
      const every = m.d < 12 ? 1 : m.d < 20 ? 2 : 3;
      m.lodT += dt;
      if (++m.lodN % every === 0) {
        a.update(Math.min(0.1, m.lodT), cam);
        m.lodT = 0;
      }
      m.base.position.set(a.pos.x, a.pos.y, a.pos.z);
      m.base.rotation.y = a.yaw;
    } else {
      // impostors: turn and bob a little; the cheer bake while they cheer
      m.yaw = a.yaw = a.yaw + wrap(a.targetYaw - a.yaw) * Math.min(1, dt * 6);
      const moving = !!m.path;
      if (moving || (this.frame + m.i) % 30 === 0) a.pos.y = g.physics.groundAt(a.pos.x, a.pos.z, a.pos.y + 1).h;
      const bob = moving ? Math.abs(Math.sin(g.time * 7 + m.i)) * 0.035 : 0;
      const hop = m.cheerT > 0 && m.kid ? Math.abs(Math.sin(g.time * 8 + m.i)) * 0.15 : 0;
      m.base.position.set(a.pos.x, a.pos.y + bob + hop, a.pos.z);
      m.base.rotation.y = a.yaw;
      if (m.imp) {
        const ch = m.cheerT > 0 && !m.frozen;
        if (m.imp.cheer && m.imp.cheer.visible !== ch) { m.imp.cheer.visible = ch; if (m.imp.stand) m.imp.stand.visible = !ch; }
      }
    }
    if (m.dog) this.dogStep(m, dt);
  }
  // step the generator on to the next thing
  advance(m) {
    if (!m.gen) return;
    let r;
    try { r = m.gen.next(); } catch (e) { console.error('crowd', m.id, e); m.gen = null; return; }
    if (r.done) { m.gen = this.behaviour(m); m.waitT = 1; return; }
    const v = r.value;
    if (typeof v === 'number') m.waitT = v;
    else if (v?.walk) {
      m.path = v.walk.slice();
      m.speed = v.speed || 1.1;
      m.chase = v.chase || null;
      m.stopAt = v.stop ?? 0.12;
      m.stuck = 0;
      m.best = 1e9;
      m.walkT = 0;
    } else m.waitT = 0.5;
  }
  walkStep(m, dt) {
    const a = m.a, g = this.g;
    const t = m.path[0];
    if (m.chase?.a && m.path.length === 1) { t.x = m.chase.a.pos.x; t.z = m.chase.a.pos.z; }
    const dx = t.x - a.pos.x, dz = t.z - a.pos.z, d = hyp(dx, dz);
    const last = m.path.length === 1;
    m.walkT += dt;
    if (d < (last ? m.stopAt : 0.35) || m.walkT > 25) {
      m.path.shift();
      m.best = 1e9;
      m.stuck = 0;
      if (!m.path.length) { m.path = null; m.waitT = 0; this.advance(m); }
      return;
    }
    // ease in at the end
    const sp = last ? Math.min(m.speed, Math.max(0.35, d * 2.5)) : m.speed;
    const s = Math.min(d, sp * dt);
    _ro.px = a.pos.x;
    _ro.pz = a.pos.z;
    a.pos.x += (dx / d) * s;
    a.pos.z += (dz / d) * s;
    g.physics.resolve(a.pos, 0.2, 1.6, _ro);
    a.targetYaw = Math.atan2(dx, dz);
    // kids running through the leaf pile
    if (m.kid && sp > 2) for (const L of C.leaves) if (hyp(L.x - a.pos.x, L.z - a.pos.z) < 0.7 && g.time - (L.t || -9) > 1.5 && m.d < 40) { L.t = g.time; g.effects?.leafBurst(L.x, a.pos.y, L.z, 16, 0.8); this.sfx('leaf_rustle', a.pos, 0.4); }
    if (d < m.best - 0.05) { m.best = d; m.stuck = 0; }
    else if ((m.stuck += dt) > 1.5) { m.stuck = 0; m.best = 1e9; m.path.shift(); if (!m.path.length) { m.path = null; this.advance(m); } }
  }
  // hand in hand beside the lead / a step behind the stroller
  keepUp(m, dt) {
    const a = m.a, L = (m.follows || m.parent)?.a;
    if (!L || m.frozen) return;
    const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
    let tx, tz;
    if (m.follows) { tx = L.pos.x - fz * 0.55; tz = L.pos.z + fx * 0.55; } // on the lead's right
    else { tx = L.pos.x - fx * 0.6 - fz * 0.55; tz = L.pos.z - fz * 0.6 + fx * 0.55; } // behind and beside the stroller
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = hyp(dx, dz);
    if (d > 0.04) {
      const s = Math.min(d, Math.max(0.6, d * 4) * dt);
      a.pos.x += (dx / d) * s;
      a.pos.z += (dz / d) * s;
    }
    const lead = m.follows ? m.follows : m.parent;
    if (d > 0.15 || lead.path) a.targetYaw = d > 0.3 ? Math.atan2(dx, dz) : L.yaw;
    else a.targetYaw = L.targetYaw;
    if (m.follows && a.anim !== 'handL' && !m.thawing && a.anim !== 'cheer') a.play('handL');
  }
  // the dog trots along at the end of the leash, sniffs about when they stop, wags its tail
  dogStep(m, dt) {
    const D = m.dog, a = m.a, g = this.g;
    const show = m.shown && m.d < 70;
    D.grp.visible = D.line.visible = show;
    if (!show) return;
    D.ph += dt;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    let tx = a.pos.x + fz * 0.55 + fx * 0.35, tz = a.pos.z - fx * 0.55 + fz * 0.35;
    if (D.sniff > 0) { D.sniff -= dt; tx += Math.sin(D.ph * 0.7) * 0.5; tz += Math.cos(D.ph * 0.5) * 0.4; }
    if (m.frozen) { tx = D.x; tz = D.z; }
    const dx = tx - D.x, dz = tz - D.z, d = hyp(dx, dz);
    let sp = 0;
    if (d > 0.08) {
      sp = Math.min(3, d * 3);
      D.x += (dx / d) * Math.min(d, sp * dt);
      D.z += (dz / d) * Math.min(d, sp * dt);
      D.yaw += wrap(Math.atan2(dx, dz) - D.yaw) * Math.min(1, dt * 8);
    } else if (m.frozen) D.yaw += wrap(Math.atan2(g.playerPos.x - D.x, g.playerPos.z - D.z) - D.yaw) * Math.min(1, dt * 4);
    const y = a.pos.y;
    D.grp.position.set(D.x, y, D.z);
    D.grp.rotation.y = D.yaw;
    const k = Math.min(1, sp / 1.2);
    D.front.rotation.x = Math.sin(D.ph * 14) * 0.6 * k;
    D.back.rotation.x = -Math.sin(D.ph * 14) * 0.6 * k;
    // the tail: a wag (a happy blur once Hank has handed out the cocoa; tucked still while frozen)
    D.tail.rotation.set(-0.6, 0, m.frozen ? 0 : Math.sin(D.ph * (this.friendly() ? 22 : 9)) * 0.7);
    // the leash from the hand to the collar
    const pos = D.line.geometry.attributes.position;
    if (m.tier === 'rig') a.arms.R.hand.getWorldPosition(_v);
    else _v.set(a.pos.x + fx * 0.25 - fz * 0.25, y + a.P.hipH * 0.95, a.pos.z + fz * 0.25 + fx * 0.25);
    const c = D.collar, cs = Math.cos(D.yaw), sn = Math.sin(D.yaw);
    pos.setXYZ(0, _v.x, _v.y, _v.z);
    pos.setXYZ(1, D.x + c[2] * sn + c[0] * cs, y + c[1], D.z + c[2] * cs - c[0] * sn);
    pos.needsUpdate = true;
  }
}
