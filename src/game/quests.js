// Side quests & fall-fair games: lost cats, lost things, tree planting, bird
// photos, letters, helping the café, lawn bowling, harvest-supper invitations,
// Lou's stunt bet, the grocery run for Nana. Villagers offer them when Hank stops to chat.
import * as THREE from 'three';
import { Vox, tone } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as PR from '../voxel/models/props.js';
import { input } from '../core/input.js';
import { CUSTOMERS, BUILDINGS, POI, MO_SPOT } from '../world/layout.js';
import { PEOPLE } from './npcRoutines.js';

const PEOPLE_LINES = (who) => Object.values(PEOPLE).find((p) => (p.char || '') === who || PEOPLE[who] === p)?.wary;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- a little voxel cat
export function catVox(color = 0x2a2228, belly = 0xf2e6d0, eye = 0xb8e04a) {
  const v = new Vox(9, 9, 14);
  const c = color, d = tone(color, -0.15);
  v.ellipsoid(4, 2.6, 6, 2.6, 2.2, 4, (x, y, z) => (y < 1.6 && Math.abs(x - 4) < 1.2 ? belly : (x + z) % 4 === 0 ? d : c));
  v.ellipsoid(4, 5, 10.2, 2.6, 2.3, 2.3, c); // head
  v.fill(2, 7, 10, 2, 8, 11, c); v.fill(6, 7, 10, 6, 8, 11, c); // ears
  v.set(2, 7, 11, 0xe8a0a8); v.set(6, 7, 11, 0xe8a0a8);
  v.set(3, 5, 12, eye); v.set(5, 5, 12, eye); // eyes
  v.set(4, 4, 12, 0xe87890); // nose
  for (const [x, z] of [[2, 3], [6, 3], [2, 8], [6, 8]]) v.fill(x, 0, z, x, 1, z, d); // paws
  for (let k = 0; k < 6; k++) v.set(4, 2 + k * 0.8, 1 - k * 0.15, c); // tail up
  return { vox: v, size: 0.045, origin: [4.5, 0, 7] };
}

// Poutine as a little voxel cat for cutscenes (Billboard-compatible: mesh + setFrame)
export function voxelPoutine(g) {
  const r = catVox(0xe8a050, 0xfff0d8, 0x60c0e8);
  const body = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.03 }), sharedVoxelMaterial());
  const mesh = new THREE.Group();
  mesh.add(body);
  let t = 0;
  return {
    mesh,
    setFrame(name) {
      t += 0.05;
      const walk = String(name).includes('walk'), scared = String(name).includes('scared');
      body.position.y = walk ? Math.abs(Math.sin(t * 6)) * 0.03 : 0;
      body.scale.set(scared ? 1.1 : 1, scared ? 0.8 + Math.sin(t * 40) * 0.03 : 1, 1);
      body.rotation.y = walk ? 0 : Math.sin(t * 0.8) * 0.4;
    },
  };
}

// ---------------------------------------------------------------- quest data
const CATS = [
  { id: 'mittens', owner: 'agnes', name: 'Mittens', color: 0x8a8a92, belly: 0xf6f0e6, x: -96, z: -60, hint: 'She loves the long grass in the west meadow.' },
  { id: 'pumpkin', owner: 'ollie', name: 'Pumpkin', color: 0xd8782a, belly: 0xf6e0c0, x: 62, z: -112, hint: 'He likes watching the sunset from the lookout.' },
  { id: 'shadow', owner: 'doug', name: 'Sergeant Shadow', color: 0x2a2228, belly: 0x3a3238, x: -219, z: -34, hint: 'Probably hunting mice among the old headstones at the cemetery.' },
];
const LOST = [
  { id: 'glasses', owner: 'agnes', item: 'glasses', name: 'reading glasses', x: 178, z: 6, build: () => PR.compass(), say: 'My reading glasses! I put them down somewhere by the chapel steps, up past the green...' },
  { id: 'puck', owner: 'pip', item: 'puck', name: 'hockey puck', x: 98, z: 116, build: () => PR.hockeyPuck(), say: 'Pop slapped our LUCKY PUCK all the way to the sawmill!!' },
  { id: 'compass', owner: 'ollie', item: 'compass', name: 'brass compass', x: -31, z: 36, build: () => PR.compass(), say: "Lost me brass compass by the covered bridge. Can't find north without it, ha!" },
  { id: 'stetho', owner: 'ingrid', item: 'stetho', name: 'stethoscope', x: -110, z: -146, build: () => PR.stethoscope(), say: 'I left my stethoscope at the old tree stand while birdwatching. Clinically embarrassing.' },
  { id: 'hat', owner: 'doug', item: 'hat', name: 'Mountie hat', x: 214, z: 87, build: () => PR.mountieHat(), say: 'The wind took my hat. Down the harbour boardwalk. Toward the boathouse. Very undignified.' },
];
const BIRDS = ['robin', 'chickadee', 'crow', 'goose'];
const BIRD_NAMES = {
  robin: 'American robin', chickadee: 'Black-capped chickadee', crow: 'Common crow', goose: 'Canada goose', deer: 'White-tailed deer', moose: 'Moose (!!)', beaver: 'Beaver', buck: 'Big buck',
  fawn: 'Spotted fawn', bluejay: 'Blue jay', sparrow: 'Song sparrow', gull: 'Herring gull', mallard: 'Mallard', duckHen: 'Mallard hen', owl: 'Great horned owl', bat: 'Little brown bat',
  fox: 'Red fox', rabbit: 'Cottontail', squirrel: 'Red squirrel', chipmunk: 'Chipmunk', raccoon: 'Raccoon (caught red-handed)', mouse: 'Meadow mouse', frog: 'Leopard frog',
  trout: 'Brook trout', salmon: 'Leaping salmon', monarch: 'Monarch butterfly', sulphur: 'Sulphur butterfly', dragonfly: 'Dragonfly',
  duchess: 'very dignified cat (Duchess)', biscuit: 'very good dog (Biscuit)',
};

export const QUESTS = {
  groceries: { title: 'Groceries for Nana', giver: 'grandma', reward: 0 },
  cats: { title: 'The great cat round-up', giver: 'agnes', reward: 15 },
  lost: { title: 'Lost & found', giver: null, reward: 10 },
  trees: { title: 'Plant six saplings', giver: 'gus', reward: 30 },
  birds: { title: "Birdie's bird book", giver: 'birdie', reward: 35 },
  letter: { title: 'Special delivery', giver: 'doug', reward: 12 },
  cafe: { title: 'Pumpkins for the café', giver: 'marie', reward: 25 },
  bowling: { title: 'Lawn bowling', giver: 'pip', reward: 20 },
  treat: { title: 'Harvest supper invitations', giver: 'pop', reward: 15 },
  stunt: { title: "Lou's stunt bet", giver: 'lou', reward: 40 },
};

const GREET = {
  gus: ['Hmph. Hank.', "Don't track bones on my porch.", 'Nice day for staying inside.'],
  marie: ['Bonjour, mon petit squelette!', 'Ah, Hank! You look... bony today. Chic!', 'The café smells like pumpkin spice, non?'],
  birdie: ['Ahoy, Hank!', 'Wind from the east. Fish are sulking.', "Seen any good birds today, sailor?"],
  agnes: ['Hello, dear! Have you eaten? ...Oh. Right.', 'The cats send their regards. Well, some of them.', 'Knit one, purl two...'],
  doug: ['Citizen.', 'Keep it under the speed limit. Which is... vibes.', 'Everything is under control. Mostly.'],
  ingrid: ['Fascinating. Still no pulse.', 'Have you considered donating yourself to science? Kidding! ...Unless?', 'Doctor Ingrid. Hello.'],
  lou: ['HANK! My guy!', 'Still owe me five bucks, buddy.', 'Lift with your legs. If you have muscles. Do you?'],
  pip: ['SKELETON!!! Hi skeleton!!', 'Can you do a wheelie?! DO A WHEELIE!', 'Pop says you are a skeleton. I say you are AWESOME.'],
  pop: ["I'm not scared. Pip is scared.", 'Do skeletons get cold?', 'Is your skull detachable? Asking for Pip.'],
  ollie: ['Ahh, the bony lad.', 'Lighthouse is lonely work. Nice to see a face. Skull. Face.', 'Mind the gulls.'],
  mo: ['Welcome to Moose & Goose!', 'Fresh pumpkins, fresh milk, fresh gossip!', 'Hank! Cash or... bones?'],
  josee: ['Pip and Pop talk about you non-stop, you know.', 'Thanks for slowing down near the rink.', 'Supper\'s at six. You can come. You don\'t have to eat.'],
  grandma: ['Hello, dear.'],
};

export class Quests {
  constructor(game) {
    this.game = game;
    this.objs = []; // world pickups / cats: { kind, id, mesh, x, y, z, bob }
    this.photo = null;
    this.t = 0;
    this.doors = [];
  }

  get S() {
    const st = this.game.state;
    if (!st.quests) st.quests = {};
    if (!st.pantry) st.pantry = { ...STARTER_PANTRY };
    if (!st.bag) st.bag = {};
    if (!st.photos) st.photos = {};
    return st.quests;
  }
  q(id) {
    return this.S[id] || (this.S[id] = { state: 'new', n: 0, have: {} });
  }

  // spawn world bits for active quests (call after load / state changes)
  sync() {
    for (const o of this.objs) this.game.scene.remove(o.mesh);
    this.objs = [];
    const g = this.game;
    const cats = this.q('cats');
    if (cats.state === 'active') for (const c of CATS) if (!cats.have[c.id]) this.spawn('cat', c.id, c.x, c.z, catVox(c.color, c.belly));
    const lost = this.q('lost');
    for (const L of LOST) {
      const st = this.q(`lost_${L.id}`);
      if (st.state === 'active' && !st.found) {
        const r = L.build();
        this.spawn('lost', L.id, L.x, L.z, r);
      }
    }
    void lost;
    const letter = this.q('letter');
    if (letter.state === 'active' && !letter.picked) { /* carried from the start */ }
    // doors to knock on with the harvest-supper invitations
    this.doors = [];
    const W = g.world;
    for (const b of BUILDINGS) {
      const v = W.buildings?.[b.id]?.voxel;
      if (!v?.meta?.door || !['house', 'cabin'].includes(b.kind) || b.id === 'nana' || b.id === 'store' || b.id === 'cafe') continue;
      const d = v.meta.door;
      const p = V(d.x, d.y, d.z).applyMatrix4(v.M);
      this.doors.push({ id: b.id, owner: b.owner, x: p.x, y: p.y, z: p.z });
    }
  }

  spawn(kind, id, x, z, r) {
    const g = this.game;
    const y = g.physics.groundAt(x, z, 100).h;
    const geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.03 });
    const mesh = voxMesh(geo, sharedVoxelMaterial());
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.position.set(x, y, z);
    grp.rotation.y = Math.random() * 6.28;
    if (kind === 'lost') grp.scale.setScalar(1.6);
    g.scene.add(grp);
    this.objs.push({ kind, id, mesh: grp, x, y, z, bob: Math.random() * 6 });
  }

  // ------------------------------------------------------------ talking to villagers
  // villagers who are still terrified of Hank won't stop for a chat
  canTalk(a) {
    return !!GREET[a.char] && (this.game.villagers?.canChat?.(a) ?? true);
  }
  async talk(a) {
    const g = this.game;
    const ui = g.ui;
    const who = a.char;
    a.faceTowards(g.playerPos.x, g.playerPos.z);
    a.lookAt(g.playerChar);
    g.rider.ch.faceTowards(a.pos.x, a.pos.z);
    g.rider.ch.lookAt(a);
    g.mode = 'menu';
    try {
      // turn-ins first
      if (await this.turnIns(a)) return;
      const offers = this.offersFor(who);
      // still nervous around a skeleton? then it's nervous small talk
      const V = g.villagers;
      const wary = V?.moodOf?.(who) === 'wary';
      const lines = (wary && PEOPLE_LINES(who)) || GREET[who] || ['Hello!'];
      const greet = lines[Math.floor(Math.random() * lines.length)];
      V?.addTrust?.(who, 2.5, 60);
      if (wary) a.tempExpr('worried', 3);
      if (who === 'mo') {
        const c = await ui.say(who, greet, { expr: 'happy', choices: ['Let me see the shelves', 'Just browsing!'] });
        if (c === 0) await this.shop();
        return;
      }
      if (!offers.length) {
        a.react(wary ? 'eep' : Math.random() < 0.5 ? 'nod' : 'bounce');
        await ui.say(who, greet, { expr: wary ? 'worried' : 'happy' });
        return;
      }
      const o = offers[0];
      const c = await ui.say(who, greet + ' ' + o.ask, { expr: o.expr || 'worried', choices: [o.yes || "I'll help!", 'Maybe later'] });
      if (c === 0) {
        a.react('yay');
        V?.addTrust?.(who, 5);
        await o.start();
        g.sound.play('quest_new');
        ui.pop(`Jotted it in my journal: *${QUESTS[o.id]?.title || o.title}*.`, { expr: 'happy', key: 'quest' });
      } else {
        a.react('sad');
        await ui.say(who, 'Oh. Okay. I will just... wait here. Forever.', { expr: 'sad' });
      }
    } finally {
      g.rider.ch.lookAt(null);
      a.lookAt(null);
      if (g.mode === 'menu') g.mode = 'ride';
      g.save();
    }
  }

  offersFor(who) {
    const out = [];
    const day = this.game.state.day;
    const ui = this.game.ui;
    const add = (id, ask, start, extra = {}) => { if (this.q(id).state === 'new') out.push({ id, ask, start, ...extra }); };
    if (who === 'agnes') add('cats', 'Oh, Hank, *three* cats have wandered off! Mittens, Pumpkin and Sergeant Shadow. Could you find them?', async () => {
      this.q('cats').state = 'active';
      for (const c of CATS) await ui.say('agnes', `${c.name}: ${c.hint}`, { expr: 'worried' });
      this.sync();
    });
    for (const L of LOST) if (who === L.owner) {
      const id = `lost_${L.id}`;
      add(id, L.say, async () => { this.q(id).state = 'active'; this.sync(); }, { yes: "I'll find it!" });
    }
    if (who === 'gus' && day >= 1) add('trees', 'The storm knocked over half my trees. Plant these six saplings at the dirt mounds, would you? Not that I care.', async () => {
      const q = this.q('trees'); q.state = 'active'; q.n = 0;
      this.game.ui.pop('Six maple saplings! Now I just look for *dirt mounds*. Not graves. Dirt mounds.', { expr: 'sheepish' });
    }, { expr: 'grumpy' });
    if (who === 'birdie') add('birds', "I'm writing a bird book! Take my old camera and snap a robin, a chickadee, a crow and a Canada goose. Press C to look through it!", async () => {
      this.q('birds').state = 'active';
      this.game.state.hasCamera = true;
    }, { expr: 'happy', yes: 'Say cheese, birds!' });
    if (who === 'doug') add('letter', "This letter is for Dr. Ingrid. It's... personal. Don't read it. That's an order.", async () => {
      this.q('letter').state = 'active';
    }, { expr: 'sheepish' });
    if (who === 'marie') add('cafe', 'My pumpkin spice is out of pumpkins! Kick three pumpkins to my café door — gently!', async () => {
      const q = this.q('cafe'); q.state = 'active'; q.n = 0;
    }, { expr: 'shock' });
    if (who === 'pip') add('bowling', 'BOWLING! Kick the big ball up the path on the green into the pins! Knock down ALL SIX!', async () => {
      this.q('bowling').state = 'active';
    }, { expr: 'sparkle', yes: "Let's bowl!" });
    if (who === 'pop' && this.game.world.atmosphere.hour > 14) add('treat', "Mom's harvest supper is tonight! Knock on six doors and invite the neighbours. I'm too shy.", async () => {
      const q = this.q('treat'); q.state = 'active'; q.n = 0; q.have = {};
    }, { expr: 'sheepish', yes: "I'll knock!" });
    if (who === 'lou') add('stunt', 'Bet you can\'t chain *four tricks* in one combo on that old bike! Five bucks says no!', async () => {
      const q = this.q('stunt'); q.state = 'active'; q.best = 0;
    }, { expr: 'smug', yes: "You're on!" });
    return out;
  }

  async turnIns(a) {
    const g = this.game, ui = g.ui, who = a.char;
    const done = async (id, line, expr = 'happy') => {
      const q = this.q(id);
      q.state = 'done';
      g.villagers?.addTrust?.(who, 25);
      const reward = QUESTS[id]?.reward ?? 10;
      a.react('yay');
      g.effects.hearts(a.pos.x, a.pos.y + 1.6, a.pos.z, 6);
      await ui.say(who, line, { expr });
      if (reward) {
        g.state.money += reward;
        g.sound.play('cash_coins');
        ui.pop(`Favour done! *+$${reward}*. Being helpful pays!`, { expr: 'sparkle' });
      }
      g.sound.play('quest_done');
      return true;
    };
    // lost cats ride home in the basket
    const cats = this.q('cats');
    if (who === 'agnes' && cats.state === 'active') {
      const found = CATS.filter((c) => cats.have[c.id] === 'carried');
      if (found.length) {
        for (const c of found) cats.have[c.id] = 'home';
        if (CATS.every((c) => cats.have[c.id] === 'home')) return done('cats', 'All my babies, home safe! You are the sweetest skeleton in Canada.', 'love');
        await ui.say('agnes', `${found.map((c) => c.name).join(' and ')}! Oh, thank you! ${CATS.length - CATS.filter((c) => cats.have[c.id] === 'home').length} still out there...`, { expr: 'happy' });
        return true;
      }
    }
    for (const L of LOST) {
      const q = this.q(`lost_${L.id}`);
      if (who === L.owner && q.state === 'active' && q.found) return done(`lost_${L.id}`, `My ${L.name}! You found it! Thank you, Hank!`);
    }
    const trees = this.q('trees');
    if (who === 'gus' && trees.state === 'active' && trees.n >= 6) return done('trees', "...Fine. They look good. Don't let it go to your skull.", 'smug');
    const birds = this.q('birds');
    if (who === 'birdie' && birds.state === 'active' && BIRDS.every((b) => g.state.photos[b])) return done('birds', 'Look at these beauties! My bird book will be a best-seller! Keep the camera, sailor.', 'love');
    const letter = this.q('letter');
    if (who === 'ingrid' && letter.state === 'active') {
      await ui.say('ingrid', '"Dear Ingrid. Your stitches are the neatest in the province." ...Oh my.', { expr: 'sheepish' });
      return done('letter', 'Tell the Constable... I will think about dinner.', 'love');
    }
    const cafe = this.q('cafe');
    if (who === 'marie' && cafe.state === 'active' && cafe.n >= 3) return done('cafe', 'Magnifique! Pumpkin spice is BACK! You are a hero, mon squelette!', 'love');
    const bowling = this.q('bowling');
    if (who === 'pip' && bowling.state === 'active' && bowling.strike) return done('bowling', 'STRIIIIKE!!! You are the BEST SKELETON EVER!!!', 'sparkle');
    const treat = this.q('treat');
    if (who === 'pop' && treat.state === 'active' && treat.n >= 6) return done('treat', "Six doors?! Everybody's coming! Mom says you get the first slice of pie.", 'sparkle');
    const stunt = this.q('stunt');
    if (who === 'lou' && stunt.state === 'active' && stunt.best >= 4) return done('stunt', 'NO WAY! Four in a row! ...Here. Five bucks. And thirty-five more for the show.', 'shock');
    // groceries handed to Nana
    if (who === 'grandma' && Object.keys(g.state.bag || {}).length) {
      const bag = g.state.bag;
      for (const [k, n] of Object.entries(bag)) g.state.pantry[k] = (g.state.pantry[k] || 0) + n;
      g.state.bag = {};
      const gq = this.q('groceries');
      if (gq.state === 'active') gq.state = 'new';
      a.react('love');
      await ui.say('grandma', 'Oh, you went shopping! What a thoughtful boy. The pantry is full again!', { expr: 'love' });
      g.sound.play('quest_done');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ the grocery
  async shop() {
    const g = this.game;
    await new Promise((res) => g.menus.shop?.(res) ?? res());
  }

  // ------------------------------------------------------------ events from the world
  event(name, data) {
    const g = this.game;
    if (name === 'smash' || name === 'kick') {
      // pumpkins kicked to the café door
      const cafe = this.q('cafe');
      if (cafe.state === 'active' && data?.kind === 'pumpkin') {
        const door = CUSTOMERS.marie;
        const p = data.pivot.position;
        if (Math.hypot(p.x - door.x, p.z - door.z) < 4 && !data.counted && name !== 'smash') {
          data.counted = true;
          cafe.n++;
          data.respawnT = 0;
          g.wait(0.6).then(() => { g.world.physprops.smash(data); g.world.physprops.list.find((x) => x === data).respawnT = 30; });
          g.ui.pop(cafe.n >= 3 ? 'Three pumpkins at the café! Marie-Claude will be thrilled.' : `Pumpkin delivered! *${cafe.n}/3*. Gently does it.`, { expr: 'happy', key: 'cafe' });
        }
      }
    }
    if (name === 'trick') {
      // Lou's bet: four tricks in one combo
      const q = this.q('stunt');
      if (q.state === 'active' && (q.best || 0) < 4 && data?.combo >= 4) {
        q.best = data.combo;
        g.ui.pop('Four in a row! Lou owes me *five bucks*!', { expr: 'sparkle', key: 'stunt', ms: 2600 });
      }
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    this.t += dt;
    const p = g.playerPos;
    for (const o of this.objs) {
      // bob, spin, sparkle; cats sit and look around
      o.bob += dt;
      if (o.kind === 'lost') {
        o.mesh.position.y = o.y + 0.25 + Math.sin(o.bob * 2.5) * 0.08;
        o.mesh.rotation.y += dt * 1.2;
        if (Math.random() < dt * 3) g.effects.magic(o.x, o.y + 0.4, o.z, 2, [1, 0.9, 0.5]);
      } else {
        o.mesh.rotation.y = Math.sin(o.bob * 0.4) * 1.2;
        o.mesh.scale.y = 1 + Math.sin(o.bob * 2) * 0.03;
        if (Math.random() < dt * 0.15 && Math.hypot(o.x - p.x, o.z - p.z) < 25) g.sound.play('cat_meow_happy', { volume: 0.4 });
      }
    }
    // bowling: count knocked pins
    const bowl = this.q('bowling');
    if (bowl.state === 'active' && !bowl.strike) {
      const pins = g.world.physprops?.list.filter((x) => x.kind === 'pin') || [];
      const down = pins.filter((x) => x.gone || new THREE.Vector3(0, 1, 0).applyQuaternion(x.pivot.quaternion).y < 0.6 || x.pivot.position.distanceTo(new THREE.Vector3(x.home.x, x.pivot.position.y, x.home.z)) > 0.6).length;
      if (down >= 6) {
        bowl.strike = true;
        g.sound.play('crowd_cheer');
        g.ui.pop('STRIKE!!! Pip has to see this!', { shout: true, key: 'strike', expr: 'sparkle', ms: 2200 });
        g.effects.confetti(pins[0].pivot.position.x, pins[0].pivot.position.y + 1, pins[0].pivot.position.z, 50);
      }
    }
    if (g.mode === 'ride') this.updatePhoto(dt);
  }

  // what Hank can do right here (shown as a prompt)
  action(g) {
    const p = g.playerPos;
    if (!g.onFoot && g.bike.speed > 3) return null;
    for (const o of this.objs) {
      if (Math.hypot(o.x - p.x, o.z - p.z) > 1.8) continue;
      if (o.kind === 'cat') {
        const c = CATS.find((x) => x.id === o.id);
        return { text: `Scoop up ${c.name}`, fn: () => this.pickCat(o, c) };
      }
      const L = LOST.find((x) => x.id === o.id);
      return { text: `Pick up the ${L.name}`, fn: () => this.pickLost(o, L) };
    }
    // saplings at dirt mounds
    const trees = this.q('trees');
    if (trees.state === 'active' && trees.n < 6) {
      for (const s of g.world.voxel?.plantSpots || []) {
        if (!s.planted && Math.hypot(s.x - p.x, s.z - p.z) < 2) return { text: 'Plant a sapling', fn: () => this.plant(s) };
      }
    }
    // harvest-supper invitations: knock on the neighbours' doors
    const treat = this.q('treat');
    if (treat.state === 'active' && g.onFoot) {
      for (const d of this.doors) if (!treat.have[d.id] && Math.hypot(d.x - p.x, d.z - p.z) < 2.2) return { text: 'Knock knock!', fn: () => this.knock(d) };
    }
    return null;
  }

  pickCat(o, c) {
    const g = this.game;
    const q = this.q('cats');
    q.have[c.id] = 'carried';
    g.scene.remove(o.mesh);
    this.objs = this.objs.filter((x) => x !== o);
    g.sound.play('cat_meow_happy');
    g.rider.ch.react('love');
    g.effects.hearts(o.x, o.y + 0.6, o.z, 5);
    g.ui.pop(`*${c.name}* hopped in my basket! Back to Agnes we go.`, { expr: 'love' });
    g.save();
  }

  pickLost(o, L) {
    const g = this.game;
    this.q(`lost_${L.id}`).found = true;
    g.scene.remove(o.mesh);
    this.objs = this.objs.filter((x) => x !== o);
    g.sound.play('item_get');
    g.rider.ch.react('yay');
    g.ui.pop(`Found the *${L.name}*! That goes back to ${CUSTOMERS[L.owner]?.name || L.owner}.`, { expr: 'sparkle' });
    g.save();
  }

  async plant(s) {
    const g = this.game;
    const q = this.q('trees');
    const ch = g.rider.ch;
    g.mode = 'menu';
    ch.play('dig');
    g.sound.play('plant_dig');
    g.effects.dirtBurst(s.x, s.y + 0.2, s.z, 18);
    await g.wait(1.1);
    s.planted = true;
    q.n++;
    const r = PR.youngSapling({ seed: q.n, leaves: ['maple', 'gold', 'orange'][q.n % 3] });
    const geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 });
    const m = voxMesh(geo, sharedVoxelMaterial());
    m.position.set(s.x, s.y, s.z);
    m.scale.setScalar(0.01);
    g.scene.add(m);
    g.tween(m.scale, 'x', 1, 0.5);
    g.tween(m.scale, 'y', 1, 0.5);
    g.tween(m.scale, 'z', 1, 0.5);
    g.sound.play('sapling_grow');
    g.effects.magic(s.x, s.y + 0.6, s.z, 16, [0.6, 1, 0.5]);
    ch.play('idle');
    ch.react('yay');
    g.ui.pop(q.n >= 6 ? 'Six trees planted! Gus has to be impressed. Inside. Deep down.' : `Sapling planted! *${q.n}/6*. Grow, little buddy.`, { expr: 'happy', key: 'trees' });
    g.mode = 'ride';
    g.save();
  }

  async knock(d) {
    const g = this.game;
    const q = this.q('treat');
    q.have[d.id] = true;
    q.n++;
    g.mode = 'menu';
    g.rider.ch.play('knock');
    g.sound.play('knock');
    await g.wait(0.9);
    g.sound.play('door_creak');
    g.rider.ch.play('idle');
    g.effects.confetti(d.x, d.y + 1.2, d.z, 20);
    const owner = d.owner && CUSTOMERS[d.owner] ? (d.owner === 'kids' ? 'pip' : d.owner === 'lou_lh' ? 'ollie' : d.owner) : null;
    const lines = ["A harvest supper? We'll bring the beans!", "Pie at the Gagnons'? Count us in, dear.", "Supper! I'll dust off my good sweater.", "Tell your mother we're coming. With the casserole."];
    await g.ui.say(owner, lines[q.n % lines.length], { expr: 'happy', name: owner ? undefined : 'A voice behind the door' });
    g.ui.pop(q.n >= 6 ? 'Six doors! Back to Pop with the good news.' : `Invitation delivered! *${q.n}/6* doors.`, { expr: 'happy', key: 'treat' });
    g.mode = 'ride';
  }

  // ------------------------------------------------------------ the camera (bird photos)
  updatePhoto(dt) {
    const g = this.game;
    if (!g.state.hasCamera || !g.onFoot) { if (this.photo) this.closePhoto(); return; }
    if (input.pressed('camera') && !g.ui.inputSwallowed()) {
      if (this.photo) this.closePhoto();
      else this.openPhoto();
    }
    if (this.photo && input.pressed('jump')) this.snap();
  }
  openPhoto() {
    const g = this.game;
    const v = document.createElement('div');
    v.className = 'viewfinder';
    v.innerHTML = '<div class="vf-frame"></div><div class="vf-hint">SPACE snap · C put away</div>';
    g.ui.root.appendChild(v);
    this.photo = { el: v, fov: g.camera.fov };
    g.chase.zoom = 0.55;
    g.sound.play('ui_open');
  }
  closePhoto() {
    this.photo?.el.remove();
    this.photo = null;
    this.game.chase.zoom = 1;
  }
  snap() {
    const g = this.game;
    g.sound.play('camera_shutter');
    g.sound.play('flash_pop', { volume: 0.5 });
    this.photo.el.classList.remove('flash');
    void this.photo.el.offsetWidth;
    this.photo.el.classList.add('flash');
    // what's in frame?
    const cam = g.camera;
    let best = null;
    const p = new THREE.Vector3();
    for (const c of g.wildlife.list) {
      if (c.dying || c.hidden || c.kind === 'bin') continue;
      p.set(c.x, c.y + c.bob + 0.2, c.z);
      const d = p.distanceTo(cam.position);
      if (d > 45) continue;
      const v = p.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.55 || Math.abs(v.y) > 0.55) continue;
      const score = Math.abs(v.x) + Math.abs(v.y) + d * 0.01;
      if (!best || score < best.score) best = { c, score };
    }
    const kind = best?.c.kind === 'buck' ? 'buck' : best?.c.kind;
    if (kind) {
      const first = !g.state.photos[kind];
      g.state.photos[kind] = (g.state.photos[kind] || 0) + 1;
      g.ui.pop(`Snap! A ${BIRD_NAMES[kind] || kind}${first ? '! New for the bird book!' : '. Smile!'}`, { expr: first ? 'sparkle' : 'happy', key: 'photo' });
      if (first) g.sound.play('item_get');
    } else g.ui.pop('Snap! A lovely photo of... nothing in particular.', { expr: 'sheepish', key: 'photo' });
  }

  // ------------------------------------------------------------ HUD & compass
  noteLines() {
    const out = [];
    const g = this.game;
    const S = this.S;
    if (S.cats?.state === 'active') {
      const n = CATS.filter((c) => S.cats.have[c.id] === 'home').length;
      const carried = CATS.filter((c) => S.cats.have[c.id] === 'carried').length;
      out.push(`Cats for Agnes ${n}/3${carried ? ` (${carried} in basket)` : ''}`);
    }
    for (const L of LOST) { const q = S[`lost_${L.id}`]; if (q?.state === 'active') out.push(q.found ? `Return ${L.name}` : `Find ${L.name}`); }
    if (S.trees?.state === 'active') out.push(S.trees.n >= 6 ? 'Tell Gus: trees planted' : `Saplings ${S.trees.n}/6`);
    if (S.birds?.state === 'active') out.push(`Bird photos ${BIRDS.filter((b) => g.state.photos?.[b]).length}/4`);
    if (S.letter?.state === 'active') out.push('Letter for Dr. Ingrid');
    if (S.cafe?.state === 'active') out.push(`Pumpkins to café ${S.cafe.n}/3`);
    if (S.bowling?.state === 'active') out.push(S.bowling.strike ? 'Tell Pip: STRIKE!' : 'Bowl a strike');
    if (S.treat?.state === 'active') out.push(S.treat.n >= 6 ? 'Tell Pop: everyone is coming' : `Supper invitations ${S.treat.n}/6`);
    if (S.stunt?.state === 'active') out.push(S.stunt.best >= 4 ? 'Tell Lou: four-trick combo!' : 'Chain a 4-trick combo');
    if (Object.keys(g.state.bag || {}).length) out.push('Groceries: bring home');
    else if (S.groceries?.state === 'active') out.push('Buy groceries at Moose & Goose');
    return out.slice(0, 5);
  }

  markers() {
    const m = [];
    const S = this.S;
    for (const o of this.objs) m.push({ id: `q:${o.id}`, x: o.x, z: o.z, icon: o.kind === 'cat' ? 'cat' : 'star' });
    if (S.groceries?.state === 'active' && !Object.keys(this.game.state.bag || {}).length) m.push({ id: 'shop', x: MO_SPOT.x, z: MO_SPOT.z, icon: 'basket' });
    return m;
  }

  // a "!" over villagers who have something to ask
  updateHints(villagers) {
    if ((this.hintT = (this.hintT || 0) - 1) > 0) return;
    this.hintT = 90;
    for (const a of Object.values(villagers.actors)) {
      const has = this.offersFor(a.char).length > 0;
      if (has && a.visible && this.canTalk(a)) this.game.emotes?.show(a, 'alert', 1.4);
    }
  }
}

// what Nana keeps in the pantry (units = cups)
export const STARTER_PANTRY = { milk_bottle: 4, cocoa_powder: 6, sugar: 6, marshmallows: 2, maple_syrup: 1, cinnamon: 1, mint: 0, pumpkin: 0, nutmeg: 1, cream: 1, coffee_beans: 0, dark_chocolate: 1 };
export const RECIPES = {
  classic: ['milk_bottle', 'cocoa_powder', 'sugar'],
  maple: ['milk_bottle', 'cocoa_powder', 'maple_syrup', 'marshmallows'],
  cinnamon: ['milk_bottle', 'cocoa_powder', 'cinnamon', 'sugar'],
  mint: ['milk_bottle', 'cocoa_powder', 'mint', 'cream'],
  pumpkin: ['milk_bottle', 'cocoa_powder', 'pumpkin', 'nutmeg'],
  mocha: ['milk_bottle', 'cocoa_powder', 'coffee_beans', 'dark_chocolate'],
};
export const SHOP = ['milk_bottle', 'cocoa_powder', 'sugar', 'marshmallows', 'maple_syrup', 'cinnamon', 'mint', 'pumpkin', 'nutmeg', 'cream', 'coffee_beans', 'dark_chocolate'];
export { CATS, LOST, BIRDS, BIRD_NAMES };
