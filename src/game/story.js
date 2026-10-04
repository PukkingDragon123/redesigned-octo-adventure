// The tale of Hank: intro, cabin night, breakfasts, the village panic, Poutine,
// deliveries, keepsakes and the ending. Plus world triggers.
import * as THREE from 'three';
import { Scene } from './cutscene.js';
import { runPrologue, PROLOGUE } from './prologue.js';
import { Billboard } from '../render/sprites.js';
import { POI, CUSTOMERS, KEEPSAKES, HOME_SPOTS, HOME_SPAWN } from '../world/layout.js';
import { CHARACTERS } from '../art/characters.js';
import { P } from '../render/particles.js';
import { charForSpot } from './npcs.js';
import { voxelPoutine } from './quests.js';
import { StrayCat } from './strayCat.js';
import { AFTER_SCREAM } from './contest.js';
import { CONTEST } from '../world/contest.js';
import { nearestRoad } from '../world/terrain.js';
import * as FOOD from '../voxel/models/food.js';
import { meshVox, fragmentVox } from '../voxel/mesh.js';
import { Vox } from '../voxel/vox.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as BED from './bedtime.js';

// a plate of voxel food that steams; returns { mesh, res, steam: [world points] }
function voxelFood(g, builder, x, y, z, yaw = 0) {
  const res = builder();
  const geo = meshVox(res.vox, { size: res.size, origin: res.origin, jitter: 0.03 });
  const mesh = voxMesh(geo, sharedVoxelMaterial());
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  g.scene.add(mesh);
  mesh.updateMatrixWorld(true);
  const steam = (res.meta?.steam || []).map((s) => new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(mesh.matrixWorld));
  return { mesh, res, steam };
}
const FOOD_FOR = { pancakes: 'pancakes', egg: 'eggsToast', bacon: 'eggsToast', toast: 'eggsToast' };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const DELIVERY_LINES = {
  gus: { hot: ['Hmph. Hot. ...Thanks, kid.', "Not bad for a walking coat rack.", 'Tell Marguerite the marshmallows were... adequate.'], cold: ["This is colder than my ex-wife's heart.", "Lukewarm. Like your personality. Kidding. Mostly."] },
  marie: { hot: ['Magnifique! Still steaming!', 'Ahh, Marguerite, you angel. And you too, mon petit squelette.', 'My customers will riot with joy!'], cold: ['Hmm, a little tiède... but I forgive you. You are cute for a skeleton.'] },
  birdie: { hot: ['Hot as a ship\'s boiler! Fair winds, Hank!', 'Warms the old bones. You know about bones, eh?'], cold: ['Bit nippy, sailor. Pedal faster next time!'] },
  agnes: { hot: ['Oh lovely! The cats and I thank you.', 'You poor dear, you look peaky. Have you tried eating?'], cold: ['Room temperature. Just like my tea. Thank you, dear.'] },
  doug: { hot: ['Excellent. Strictly for official purposes.', 'Citizen, your service is noted in my report.'], cold: ['I could ticket you for this temperature. I won\'t. But I could.'] },
  ingrid: { hot: ['Still no pulse, but excellent cocoa.', 'May I take a tiny sample of your... no? Fair.'], cold: ['Cold. Like your extremities. Fascinating.'] },
  pip: { hot: ['SKELETON COCOA!!! BEST DAY EVER!!!', 'Can you do a wheelie? DO A WHEELIE!'], cold: ['It\'s cold but you\'re a SKELETON so it\'s still awesome.'] },
  lou: { hot: ['Hank, buddy! Back from the dead AND bringing cocoa? Legend.', 'Boys! Hank brought cocoa!'], cold: ['Lukewarm! Still drinking it! You still owe me five bucks.'] },
  ollie: { hot: ['Ahh, warm as a lighthouse lamp. Thank ye.', 'Long ride out here. Mind the gulls.'], cold: ['Cold as the North Atlantic, lad. Still welcome.'] },
};

const LORE = {
  cane: "Harold's cane! He carved that handle from a moose antler he found. Took him eleven winters. He never needed a cane — he just liked pointing at things with it.",
  spyglass: 'His spyglass! He told everyone it was for spotting deer. I caught him using it to watch for the bakery van every Tuesday.',
  pack: "Oh, his hunting pack. Three granola bars and not a single bullet. That was my Harold — he'd go 'hunting' and come back with mushrooms and a sunburn.",
  clock: "The mantel clock... it stopped at 4:12. That's the minute he proposed. On this very porch, with a ring made of birch bark.",
  coat: 'His plaid coat. It still smells of pipe smoke and pine. Would you mind if I kept it on the rocking chair?',
  medbag: "Dr. Ingrid's bag! He 'borrowed' it in 1987 to splint a raccoon's leg. Return it to her someday, would you? Actually... let's keep it a little longer.",
  suitcase: 'Our honeymoon suitcase. We were going to see Niagara Falls. Then the roof needed fixing. Then the boat. Then... well. Life is what happens, dear.',
  keys: 'His ring of keys. Opens every door in Maple Cove. Including, it turns out, the sawmill. Big Lou never found out who kept leaving him muffins.',
  books: 'His pressed-flower books... every page has a maple leaf from a different autumn. Fifty-one autumns. Fifty-one leaves.',
  map: 'Harold\'s map! "X marks the best blueberries." The X is right on the beaver dam. The beavers never did let him have any.',
  lantern: 'The brass lantern. Harold walked me home with it every night we were courting. Even after we were married. Even though we lived together.',
  bottles: 'Maple syrup, vintage 1979. Do not drink. ...Hank, did you drink some? Your face is doing a thing.',
};

const BREAKFAST = {
  1: { food: 'pancakes', lines: [['grandma', 'Breakfast! Buttermilk pancakes, the way Harold liked them.', 'happy'], ['hank', 'Oh, I could eat a moose.', 'happy']], after: [['grandma', '...Hm.', 'surprised'], ['hank', 'Sorry, Nana. I think there\'s a hole in me somewhere.', 'sheepish'], ['grandma', 'Never you mind. The squirrels will be delighted.', 'laugh']] },
  2: { food: 'egg', lines: [['grandma', 'I thought — maybe something smaller? A nice soft egg.', 'neutral']], after: [['hank', '...It went about as well as the pancakes.', 'sheepish'], ['grandma', 'Soup tomorrow, then.', 'smug'], ['hank', 'Soup goes faster, Nana.', 'sad']] },
  3: { food: 'bacon', lines: [['grandma', 'Bacon! Nobody says no to bacon.', 'happy']], after: [['hank', 'I said yes. My stomach said "next floor down".', 'sheepish'], ['cat', 'Mrrrp!', 'happy'], ['grandma', 'Well, Poutine has never been happier.', 'laugh']] },
  4: { food: 'toast', lines: [['grandma', 'Plain toast. Very solid. Nothing can go wrong with toast.', 'determined']], after: [['grandma', 'Something went wrong with the toast.', 'sad'], ['hank', 'It\'s the thought that counts. And I thought about it a lot.', 'happy']] },
};

export class Story {
  constructor(game) {
    this.g = game;
    this.debris = [];
    this.nanaCalled = false;
  }
  get st() {
    return this.g.state;
  }
  flag(k, v) {
    if (v === undefined) return !!this.st.flags[k];
    this.st.flags[k] = v;
    return v;
  }

  async scene(fn) {
    const g = this.g;
    const S = new Scene(g);
    g.currentScene = S;
    const prev = g.mode;
    g.mode = 'cutscene';
    g.ui.showHUD(false);
    g.ui.prompt(null);
    g.ui.letterbox(true);
    try {
      await fn(S);
    } catch (e) {
      console.error('cutscene error', e);
    } finally {
      S.cleanup();
      g.ui.hideDialogue();
      g.ui.letterbox(false);
      g.currentScene = null;
      for (const d of this.debris) g.scene.remove(d.b.mesh);
      this.debris = [];
      if (g.mode === 'cutscene') g.mode = prev === 'title' || prev === 'boot' ? 'cutscene' : prev;
      // back on the road: the chase camera glides back behind Hank and the HUD returns
      if (g.mode === 'ride') {
        g.chase.release();
        g.ui.showHUD(true);
      }
    }
  }

  // ---------------------------------------------------------------- 1. the prologue (src/game/prologue.js)
  intro() {
    return runPrologue(this);
  }
  // test entry points: ?scene=lumberCamp | funeral | yearsPass | revival | nanaFindsHank
  lumberCamp() { return PROLOGUE.lumberCamp(this); }
  funeral() { return PROLOGUE.funeral(this); }
  yearsPass() { return PROLOGUE.yearsPass(this); }
  revival() { return PROLOGUE.revival(this); }
  nanaFindsHank() { return PROLOGUE.nanaFindsHank(this); }

  // ---------------------------------------------------------------- 2. by the fire, inside Nana's cabin
  // Nana brings Hank up the porch and inside; the player looks around (free control) and sits on
  // the sofa by the fire; Nana covers him with Harold's quilt and the talk goes on from there.
  async cabinNight() {
    const g = this.g;
    this.nanaCalled = true;
    await this.cabinArrive();
    await this.cabinLookAround();
    await this.cabinSofa();
    g.interior.reset();
    g.villagers.setVisible('grandma', true);
    this.flag('cabin', true);
    g.world.atmosphere.cold = 0;
  }
  // (test entry points: ?scene=cabinArrive | cabinSofa)
  // 1. up the yard and in through the front door
  cabinArrive() {
    const g = this.g;
    const I = g.interior, R = I.room;
    const A = g.world.atmosphere;
    const L = (x, y, z) => R.wp(x, y, z); // room-local -> world
    return this.scene(async (S) => {
      A.hour = 22.6;
      A.setWeather('clear', true);
      A.cold = 0.25;
      g.setBikeVisible(false);
      g.setOutfit('hankBuried');
      g.rider.visible = false;
      g.villagers.setVisible('grandma', false);
      S.music('cabin');
      const h0 = L(0.8, 0, 12.6), n0 = L(-0.5, 0, 11.4);
      const H = S.actor('hankBuried', h0.x, h0.z, R.wyaw(Math.PI), 'walk+shiver');
      const N = S.actor('grandma', n0.x, n0.z, R.wyaw(Math.PI), 'walk+lantern');
      const lamp = g.lightPool.addDynamic({ pos: N.pos.clone(), color: [1.0, 0.7, 0.35], radius: 8, intensity: 1.2 });
      S.temp.push({ remove: () => g.lightPool.removeDynamic(lamp) });
      S.every(() => void lamp.pos.set(N.pos.x, N.pos.y + 1.0, N.pos.z));
      // the cabin glowing in the dark woods, smoke curling from the chimney
      await S.cam(L(8.5, 3.8, 17.5), L(0, 2.0, 4.5), 0, 46);
      S.cam(L(5.6, 2.7, 13.2), L(-0.1, 1.4, 6.0), 6.5, 44);
      await S.fade(0, 1.6);
      S.sfx('owl', { volume: 0.5 });
      const nw = N.walkTo([L(-0.45, 0, 7.8), L(-0.2, 0, 5.3)], 1.0, 'walk+lantern');
      const hw = H.walkTo([L(0.5, 0, 8.6), L(0.3, 0, 6.2)], 0.85, 'walk+shiver');
      await S.wait(2.2);
      await S.say('grandma', 'Here we are. Mind the step, dear, it creaks. So does the next one. So do I.', { actor: N, expr: 'happy' });
      await nw;
      N.faceTowards(L(0, 0, 4.4).x, L(0, 0, 4.4).z);
      N.play('lantern');
      S.sfx('door_creak', { volume: 0.8 });
      await hw;
      await S.fade(1, 0.6);
      // inside: the door swings open and in they come
      I.stage(true);
      R.setDoor(1);
      R.doorOpen = 1;
      N.path = H.path = null;
      N.pos.copy(L(-0.15, 0, 4.75));
      H.pos.copy(L(0.35, 0, 5.7));
      N.yaw = N.targetYaw = R.wyaw(Math.PI);
      H.yaw = H.targetYaw = R.wyaw(Math.PI);
      await S.cam(L(-2.0, 2.05, 0.5), L(0, 1.05, 3.7), 0, 50);
      await S.fade(0, 0.6);
      const n2 = N.walkTo([L(-0.95, 0, 2.6)], 1.0, 'walk+lantern');
      await S.wait(0.6);
      const h2 = H.walkTo([L(0.25, 0, 3.1)], 0.7, 'walk+shiver');
      await S.say('grandma', 'Come in, come in, out of that cold.', { actor: N, expr: 'happy' });
      await h2;
      await n2;
      R.setDoor(0);
      S.sfx('door', { volume: 0.5 });
      // side by side, taking in the room
      N.face(R.wyaw(Math.PI - 0.45));
      H.face(R.wyaw(Math.PI + 0.2));
      N.play('idle');
      H.play('shiver', 'surprised');
      g.effects.frost(H.pos.x, H.pos.y + 0.3, H.pos.z, 6);
      await S.cam(L(-0.35, 1.65, 0.4), L(-0.35, 1.15, 2.8), 0.8, 46);
      await S.faceShot(H, { dist: 2.3, side: -0.6, dur: 0.8 });
      await S.say('hankBuried', "Oh... it's *warm* in here. And it smells like... cinnamon? I think? I can't actually smell.", { actor: H, expr: 'happy' });
      await S.faceShot(N, { dist: 2.3, side: 0.6, dur: 0.8 });
      await S.say('grandma', "Make yourself at home, dear. Have a look around. Then sit yourself down on the sofa by the fire, and I'll fix you something warm.", { actor: N, expr: 'happy' });
      // she heads for the stove; a look across the room at the fire
      const nk = N.walkTo([L(-1.9, 0, 0.2), L(-3.75, 0, -2.35)], 1.1, 'walk');
      await S.cam(L(-1.05, 2.35, 3.35), L(3.0, 0.9, -1.4), 3.2, 52);
      await Promise.race([nk, S.wait(2.5)]);
      if (N.path) { N.path = null; N.pos.copy(L(-3.75, 0, -2.35)); }
    });
  }
  // 2. free to look around; sitting on the sofa moves the story on
  cabinLookAround() {
    const g = this.g, I = g.interior;
    g.villagers.setVisible('grandma', true);
    I.moveNana(true);
    return I.freeRoam({
      at: { x: 0.25, z: 3.1, yaw: Math.PI },
      hint: 'Sit on the sofa by the fire',
      toast: "Nana's cabin! Smells like cocoa and wool. I'll have a look around, then sit on the sofa by the fire.",
    });
  }
  // 3. on the sofa, under Harold's quilt
  cabinSofa() {
    const g = this.g;
    const I = g.interior, R = I.room;
    const A = g.world.atmosphere;
    const L = (x, y, z) => R.wp(x, y, z); // room-local -> world
    const Q = Math.PI / 2;
    return this.scene(async (S) => {
      I.stage(true);
      A.hour = Math.max(A.hour, 22.7);
      g.setBikeVisible(false);
      g.villagers.setVisible('grandma', false);
      g.rider.visible = false;
      const seat = L(1.98, 0, -1.31);
      const H = S.actor('hankBuried', seat.x, seat.z, R.wyaw(Q), 'sitShiver');
      H.yaw = H.targetYaw;
      const nh = L(-3.75, 0, -2.35);
      const N = S.actor('grandma', nh.x, nh.z, R.wyaw(Q), 'carry');
      const fq = R.foldedQuilt;
      fq.visible = true;
      fq.position.set(0, -0.05, 0.12);
      fq.rotation.set(0, 0, 0);
      N.hold(fq);
      S.temp.push({ remove: () => { R.root.add(fq); fq.visible = false; R.lapQuilt.visible = false; } });
      await S.cam(L(3.8, 1.5, 0.3), L(2.15, 0.75, -1.4), 0, 48);
      S.sfx('brrr', { volume: 0.5 });
      g.effects.frost(H.pos.x, H.pos.y + 0.6, H.pos.z, 6);
      const walk = N.walkTo([L(-1.6, 0, -2.9), L(0.4, 0, -3.15), L(2.6, 0, -3.05), L(2.75, 0, -2.6)], 1.15, 'carry');
      await S.say('grandma', 'There we are. Now, let me get you properly warm.', { actor: N, expr: 'happy' });
      await walk;
      N.faceTowards(H.pos.x, H.pos.z);
      N.play('offer');
      await S.wait(0.45);
      // Harold's quilt billows out and settles over his lap
      N.hold(null);
      R.root.add(fq);
      fq.visible = false;
      const lq = R.lapQuilt;
      lq.position.set(1.98, 0, -1.31);
      lq.rotation.set(0, Q, 0);
      lq.visible = true;
      S.sfx('whoosh', { volume: 0.35, pitch: 0.7 });
      const back = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      await S.anim(0.75, (k) => {
        const e = back(k);
        lq.scale.set(0.35 + 0.65 * e, 0.2 + 0.8 * e, 0.35 + 0.65 * e);
        lq.position.y = (1 - k) * 0.45;
      });
      g.effects.poof?.(H.pos.x, H.pos.y + 0.6, H.pos.z, { scale: 0.7, color: [1, 0.95, 0.85], count: 5 });
      lq.userData.breathe = true;
      H.play('sit', 'happy');
      N.play('idle');
      await S.faceShot(H, { dist: 2.5, side: -0.6, up: 0.3, dur: 0.7, fov: 42 });
      await S.say('grandma', 'Harold\'s quilt. Forty-one patches, one for every winter we had together. Sit close, dear. Get that fire into you.', { actor: N, expr: 'happy' });
      H.play('sitShiver', 'scared');
      S.sfx('jaw_chatter', { volume: 0.6 });
      await S.say('hankBuried', "Th-thank you, ma'am. My t-teeth won't stop chattering.", { actor: H, expr: 'scared' });
      await S.cam(L(0.6, 2.0, -1.9), L(2.75, 1.25, -2.6), 0.8, 42);
      N.play('talk');
      await S.say('grandma', "Marguerite, dear. Everyone calls me Nana. Here, these were my Harold's. His good sweater, and his lucky toque.", { actor: N, expr: 'neutral' });
      N.play('hug');
      await S.wait(0.6);
      // outfit change, ta-da!
      await S.cam(L(3.8, 1.5, 0.3), L(2.1, 0.85, -1.35), 0, 46);
      H.play('sit', 'surprised');
      S.sfx('magic');
      g.effects.magic(H.pos.x, H.pos.y + 1, H.pos.z, 20, [1, 0.85, 0.5]);
      g.effects.confetti(H.pos.x, H.pos.y + 1.4, H.pos.z, 24);
      g.effects.poof?.(H.pos.x, H.pos.y + 0.9, H.pos.z, { scale: 1.1, color: [1, 0.92, 0.8], count: 6 });
      H.char = 'hank';
      H.bounce(0.5);
      g.setOutfit('hank');
      N.play('idle');
      await S.wait(0.5);
      await S.faceShot(H, { dist: 2.5, side: -0.6, up: 0.3, dur: 0.6, fov: 42 });
      await S.say('hank', "Oh... oh, that's *cozy.*", { actor: H, expr: 'happy' });
      await S.cam(L(0.6, 2.0, -1.9), L(2.75, 1.25, -2.6), 0.7, 42);
      await S.say('grandma', 'Harold was a hunter. A terrible one. Fifty years and he never hit a single thing. Too soft-hearted.', { actor: N, expr: 'laugh' });
      // the famous cocoa
      N.play('offer');
      await S.cam(L(4.05, 1.55, -0.55), L(2.35, 1.0, -1.95), 1.0, 44);
      await S.say('grandma', 'And this... is my famous hot cocoa. Fifty years, and not one complaint.', { actor: N, expr: 'smug' });
      N.play('idle');
      // the first sip... straight through the ribs
      H.play('sitSip');
      S.sfx('slurp');
      await S.faceShot(H, { dist: 2.3, side: -0.55, up: 0.25, dur: 0.7, fov: 40 });
      await S.wait(0.5);
      S.sfx('pour_cocoa', { volume: 0.6 });
      for (let k = 0; k < 18; k++) g.effects.ps.spawn({ x: H.pos.x + (Math.random() - 0.5) * 0.12, y: H.pos.y + 0.8, z: H.pos.z + (Math.random() - 0.5) * 0.12, vy: -0.4, life: 0.9, size: 0.06, sprite: P.drop, color: [0.45, 0.24, 0.12], gravity: 9, drag: 0.2, ground: true, rest: 0.6 });
      await S.wait(1.0);
      N.react('gasp');
      await S.say('grandma', '...Oh. Oh dear. That quilt has seen worse. Harold once spilled a whole moose stew on it.', { actor: N, expr: 'surprised' });
      H.play('sit', 'happy');
      await S.say('hank', "...I can't taste a thing. But it's *warm.* I can feel it all the way down.", { actor: H, expr: 'happy' });
      await S.say('hank', '...And all the way out, apparently.', { actor: H, expr: 'sheepish' });
      N.react('laugh');
      await S.cam(L(4.05, 1.55, -0.55), L(2.35, 1.0, -1.95), 0.8, 44);
      await S.say('grandma', 'Now then. Tell me: can you feel the cold, dear?', { actor: N, expr: 'neutral' });
      await S.say('hank', 'Not anymore. Not... really anything, actually.', { actor: H, expr: 'neutral' });
      await S.cam(L(0.6, 2.0, -1.9), L(2.75, 1.25, -2.6), 0.8, 40);
      await S.say('grandma', 'Perfect. Then I have a proposition for you.', { actor: N, expr: 'smug' });
      await S.say('grandma', "My cocoa keeps half of Maple Cove going through the autumn, and my knees aren't what they used to be.", { actor: N, expr: 'neutral' });
      const c = await S.say('grandma', "How would you like a job? Delivering cocoa. Harold's old bicycle is just sitting in the garage.", { actor: N, expr: 'happy', choices: ["I'd love to!", 'Do I get paid?', 'Will people scream at me?'] });
      if (c === 1) await S.say('grandma', 'Of course you do! And tips, if it arrives hot.', { actor: N, expr: 'laugh' });
      else if (c === 2) await S.say('grandma', "...Probably. At first. They'll come around. Everybody loves cocoa.", { actor: N, expr: 'sheepish' });
      else await S.say('grandma', 'Wonderful!', { actor: N, expr: 'laugh' });
      await S.say('grandma', 'We start at sunrise. Sleep well, dear. ...Do you sleep?', { actor: N, expr: 'surprised' });
      H.react('headpop');
      await S.faceShot(H, { dist: 2.5, side: -0.6, up: 0.3, dur: 0.6, fov: 42 });
      await S.say('hank', "Oh, I *sleep.* That's how I got into this mess.", { actor: H, expr: 'sheepish' });
      // she tucks the quilt in and turns the lamp down; he dozes off by the fire
      N.walkTo([L(2.55, 0, -0.75)], 0.8, 'walk');
      await S.wait(0.8);
      N.play('hug');
      H.play('sitSleep', 'sleepy');
      S.sfx('big_snore', { volume: 0.35 });
      await S.cam(L(-1.3, 2.55, 2.4), L(2.6, 0.8, -1.35), 0, 50);
      S.cam(L(-0.6, 2.4, 1.6), L(2.6, 0.8, -1.35), 5, 48);
      H.showEmote('zzz', 5);
      await S.wait(3.2);
      await S.fade(1, 1.6);
    });
  }

  // ---------------------------------------------------------------- 3. mornings, at Nana's table
  morning(day) {
    const g = this.g;
    const I = g.interior, R = I.room;
    const L = (x, y, z) => R.wp(x, y, z);
    return this.scene(async (S) => {
      const A = g.world.atmosphere;
      A.hour = 8.2;
      A.cold = 0;
      I.reset();
      I.stage(true);
      S.temp.push({ remove: () => I.stage(false) });
      g.setBikeVisible(true);
      g.parkBike();
      g.rider.visible = false;
      S.music('cabin');
      g.ui.pop(`Day ${day}! ${weatherLine(g.state.weather, day)}`, { expr: 'happy', key: 'day' });
      S.sfx('day_start');
      const b = BREAKFAST[day];
      // breakfast on the table by the front windows, steaming hot (Hank's plate and Nana's cocoa)
      const top = R.floorY + 0.8;
      const pp = L(-2.6, 0, 1.62), mp = L(-3.55, 0, 1.95);
      const plate = b ? voxelFood(g, FOOD[FOOD_FOR[b.food] || 'pancakes'], pp.x, top, pp.z, R.wyaw(Math.PI / 2)) : voxelFood(g, FOOD.soupBowl, pp.x, top, pp.z);
      const mug = voxelFood(g, FOOD.cocoaMaple, mp.x, top, mp.z, R.wyaw(-1.2));
      this.steamers = [...plate.steam, ...mug.steam];
      S.temp.push({ remove: () => { g.scene.remove(plate.mesh); g.scene.remove(mug.mesh); this.steamers = []; } });
      g.villagers.setVisible('grandma', false);
      const hc = L(-2.6, 0, 1.22), nc = L(-4.55, 0, 1.9);
      const H = S.actor('hank', hc.x, hc.z, R.wyaw(0), 'sit');
      const N = S.actor('grandma', nc.x, nc.z, R.wyaw(Math.PI), 'idle');
      H.faceTowards(L(-2.6, 0, 3).x, L(-2.6, 0, 3).z);
      N.faceTowards(H.pos.x, H.pos.z);
      H.yaw = H.targetYaw;
      N.yaw = N.targetYaw;
      let cat = null;
      if (g.state.cat) {
        cat = voxelPoutine(g);
        cat.mesh.position.copy(L(-1.7, 0, 1.0));
        cat.mesh.rotation.y = R.wyaw(-2.4);
        g.scene.add(cat.mesh);
        S.temp.push({ remove: () => g.scene.remove(cat.mesh) });
      }
      const wide = [L(-1.1, 1.95, 3.55), L(-3.2, 0.95, 1.7)];
      await S.cam(wide[0], wide[1], 0, 46);
      await S.fade(0, 1.2);
      if (b) {
        for (const [who, text, expr] of b.lines) await S.say(who, text, { expr, actor: who === 'hank' ? H : N });
        // close on Hank for the big bite...
        await S.cam(L(-2.05, 1.5, 3.25), L(-2.6, 0.95, 1.35), 0.5, 40);
        H.play('sitEat');
        await S.wait(0.8);
        // ...and the food falls straight through him
        S.sfx('food_fall');
        const toCam = g.camera.position.clone().sub(H.pos).setY(0).normalize().multiplyScalar(0.3);
        // bites of the real voxel food tumble through his ribs
        const bites = fragmentVox(plate.res.vox, 4, Vox).filter((f) => f.n > 6).slice(0, 3);
        for (let k = 0; k < 3; k++) {
          const f = bites[k % Math.max(1, bites.length)];
          const at = V(H.pos.x + toCam.x, R.floorY + 1.2 - k * 0.06, H.pos.z + toCam.z);
          if (f) {
            const m = voxMesh(meshVox(f.vox, { size: plate.res.size, origin: [f.vox.w / 2, f.vox.h / 2, f.vox.d / 2] }), sharedVoxelMaterial());
            this.dropMesh(m, at, V((Math.random() - 0.5) * 0.5, -0.4, (Math.random() - 0.5) * 0.5));
          } else this.drop(`food:${b.food}`, at, V(0, -0.4, 0), 1.2);
          await S.wait(0.22);
        }
        plate.mesh.scale.setScalar(0.7);
        await S.wait(0.5);
        S.sfx('plate');
        H.play('sit', 'sheepish');
        H.showEmote('sweat', 2.2);
        N.showEmote('question', 2.2);
        await S.wait(1.2);
        await S.cam(wide[0], wide[1], 0.6, 46);
        if (cat && day >= 3) {
          cat.setFrame('cat:walk:side:0');
          S.sfx('purr');
        }
        for (const [who, text, expr] of b.after) {
          if (who === 'cat' && !cat) continue;
          await S.say(who, text, { expr, actor: who === 'hank' ? H : who === 'grandma' ? N : null });
        }
      } else {
        const gags = [
          ['grandma', 'I made soup. Through a straw. Into a thermos. Taped to your chest.', 'determined'],
          ['grandma', "I've given up on breakfast, dear. Have a hug instead.", 'happy'],
          ['hank', 'Morning, Nana! I dreamt I could taste things. It was terrifying.', 'happy'],
          ['grandma', 'The raccoons have started lining up outside at breakfast time. They know.', 'smug'],
          ['grandma', 'Mrs. Agnes asked if you were seeing anyone. I told her you were seeing *everyone*. Twice. Through your stomach.', 'laugh'],
        ];
        const gg = gags[day % gags.length];
        await S.say(gg[0], gg[1], { expr: gg[2], actor: gg[0] === 'hank' ? H : N });
      }
      if (day === 2) {
        await S.faceShot(N, { dist: 2.0, side: 0.6, dur: 0.6 });
        await S.say('grandma', 'Oh! Harold kept his riding notes in the garage, dear. Wheelies, hops, all sorts of nonsense. Have a read when you pass by.', { actor: N, expr: 'happy' });
      }
      await S.say('grandma', day === 1 ? 'Now, the orders are pinned on the board. Two to start — Gus and Marie-Claude, down in Maple Cove.' : "Today's orders are on the board, dear. Bundle up! ...Out of habit.", { actor: N, expr: 'neutral' });
      await S.fade(1, 0.5);
      I.stage(false);
      g.villagers.setVisible('grandma', true);
      g.parkBike();
      g.chase.release();
      g.chase.snap(g.bike);
      await S.fade(0, 0.6);
    });
  }

  // Harold's bicycle reveal (day 1)
  garageReveal() {
    const g = this.g;
    return this.scene(async (S) => {
      g.setBikeVisible(true);
      // parked a few metres out from the doors, so the chase camera has room behind her
      g.parkBike(-144.3, 94, Math.PI / 2);
      g.rider.visible = false;
      const H = S.actor('hank', -145.3, 96.2, Math.PI, 'idle');
      const N = S.actor('grandma', -142.8, 97.3, -2.4, 'idle');
      g.villagers.setVisible('grandma', false);
      const y = g.bike.pos.y;
      await S.cam(V(-139.3, y + 1.6, 91.5), V(-144.8, y + 0.8, 94.5), 0, 45);
      await S.say('grandma', "Ta-da! Harold's old roadster. He called her *Bessie.*", { actor: N, expr: 'happy' });
      await S.say('hank', "She's... beautiful.", { actor: H, expr: 'happy' });
      await S.say('grandma', 'She\'s held together with hope and duct tape. Harold always said: "just pedal, and don\'t think about it."', { actor: N, expr: 'laugh' });
      await S.say('grandma', "Maple Cove is down the road to the east, past the covered bridge. Gus is hosting the pumpkin carving contest on Main Street. Mind his temper.", { actor: N, expr: 'neutral' });
      await S.say('hank', 'Got it. East. Bridge. Temper.', { actor: H, expr: 'determined' });
      g.villagers.setVisible('grandma', true);
      g.rider.visible = true;
      this.flag('bike', true);
    }).then(() => {
      if (g.touch?.on) g.ui.pop('Right! Thumb on the wheel to steer, hold *PEDAL* to go, *HOP* to hop, *TRICK* to show off.', { expr: 'happy', ms: 7000 });
      else g.ui.pop('Right! [W] pedals (tap in rhythm to sprint), [A][D] steer, hold [Space] and let go to hop, [Q] wheelie, [Shift] drift.', { expr: 'happy', ms: 8000 });
      g.ui.pop('And I just follow the little cocoa cups on the compass. Easy!', { expr: 'sparkle' });
    });
  }

  // ---------------------------------------------------------------- 4. the village panics
  // Hank's first ride into Maple Cove: the pumpkin carving contest is on in the street,
  // Gus is hosting through his tin megaphone and everyone is busy at their pumpkins...
  // until they see who has come to visit. (Every shot is out in the open street.)
  villagePanic() {
    const g = this.g;
    return this.scene(async (S) => {
      const V2 = g.villagers, X = V2.ctx;
      const C = CONTEST, E = C.entry;
      g.bike.vel.set(0, 0, 0);
      // (coming in some other way than the road from Nana's? start him at the west end of Main Street)
      const p0 = g.playerPos;
      const moved = g.onFoot || p0.x > C.west - 4 || Math.abs(p0.z - E.z) > 7;
      if (moved) {
        await S.fade(1, 0.35);
        if (g.onFoot) g.hopOn();
        g.parkBike(E.x, E.z, E.yaw);
      }
      const bp = g.bike.pos.clone();
      const fwd = g.bike.forward(new THREE.Vector3());
      const y = bp.y;
      g.rider.visible = false;
      const H = S.actor('hank', bp.x + fwd.z * 0.9, bp.z - fwd.x * 0.9, g.bike.yaw, 'idle');
      S.music('village');
      const crowd = ['kids', 'pop', 'marie', 'agnes', 'birdie', 'ingrid', 'doug', 'josee'].map((k) => V2.get(k)).filter(Boolean);
      const kid = V2.get('kids'), marie = V2.get('marie'), doug = V2.get('doug'), ingrid = V2.get('ingrid'), gus = V2.get('gus');
      const cast = [...crowd, gus].filter(Boolean);
      for (const a of cast) {
        a.scripted = true;
        if (a.brain) { a.brain.scripted = true; a.brain.onScripted(); }
      }
      // whatever happens (even a skip), the cast goes back to their own lives afterwards
      S.temp.push({ remove: () => { for (const a of cast) a.scripted = false; } });
      // everyone busy at the contest
      const POSE = { carve: 'carve', kid: 'scoop', judge: 'clipboard', watch: 'sip', cheer: 'idle' };
      for (const a of crowd) {
        const s = C.spots[a.spot];
        if (!s) continue;
        a.pos.set(s.x, g.physics.groundAt(s.x, s.z, y + 2).h, s.z);
        a.yaw = a.targetYaw = s.yaw;
        a.lookAt(null);
        a.play(POSE[s.role] || 'idle', s.role === 'kid' || s.role === 'cheer' ? 'happy' : 'determined');
      }
      // Gus hosts: out in the street at the west end, megaphone in hand, greeting whoever comes in
      const GS = { x: C.west + 1.4, z: E.z - 1.1 };
      if (gus) {
        gus.path = null;
        gus.pos.set(GS.x, g.physics.groundAt(GS.x, GS.z, y + 2).h, GS.z);
        gus.yaw = gus.targetYaw = -Math.PI / 2;
        gus.lookAt(null);
        gus.visible = true;
        gus.play('hostWalk', 'neutral');
      }
      const shout = (a, text, ms = 2200) => a && g.ui.tag(`npc:${a.spot}`, text, V(a.pos.x, a.pos.y + a.P.height + 0.45, a.pos.z), ms);
      const busy = S.every((dt) => {
        for (const a of crowd) if (Math.random() < dt * 0.3) a.react(['nod', 'bounce', 'laugh'][Math.floor(Math.random() * 3)]);
        return false;
      });
      // the first look: the bunting, the tables, the crowd, Gus out front
      const look = V(125, y + 1.6, E.z);
      await S.cam(V(bp.x - fwd.x * 5 - fwd.z * 1.6, y + 2.5, bp.z - fwd.z * 5 + fwd.x * 1.6), look, 0, 50);
      if (moved) await S.fade(0, 0.4);
      S.cam(V(bp.x - fwd.x * 1.5 - fwd.z * 1.2, y + 2.1, bp.z - fwd.z * 1.5 + fwd.x * 1.2), look, 3.2, 46);
      await S.wait(1.4);
      await S.say('hank', 'Ooh! A *pumpkin carving contest!*', { actor: H, expr: 'sparkle' });
      // the host, through his tin megaphone; and the street cheers
      if (gus) {
        await S.cam(V(GS.x - 2.4, y + 1.55, GS.z + 1.1), V(GS.x + 0.6, y + 1.45, GS.z - 0.1), 0, 42);
        gus.play('announce', 'happy');
        S.sfx('megaphone', { volume: 0.7 });
        await S.say('gus', 'TEN MINUTES, CARVERS! TEN MINUTES! ...And mind your fingers!', { actor: gus, expr: 'laugh' });
        g.contest.cheer(1, { actors: crowd, force: true });
        await S.wait(0.6);
        gus.play('hostWalk', 'neutral');
      }
      await S.cam(V(128.2, y + 1.8, E.z + 1.2), V(125.4, y + 0.95, 46.4), 0, 44);
      shout(marie, 'Non, non, the nose goes HERE...');
      V2.get('agnes')?.react('laugh');
      await S.wait(1.4);
      shout(V2.get('pop'), 'EWWW, GUTS!', 1600);
      kid?.react('yay');
      await S.wait(1.4);
      await S.frame(H, [2.6, 1.0, 1.2], 0, 45);
      H.play('wave', 'happy');
      await S.say('hank', 'Hi there! Cocoa delivery from Nana Marguerite!', { actor: H, expr: 'happy' });
      H.play('idle', 'happy');
      // ...they freeze, and turn, and stare (Gus too)
      busy();
      for (const a of [...crowd, gus].filter(Boolean)) {
        if (a !== gus) a.play('idle', 'neutral');
        a.faceTowards(H.pos.x, H.pos.z);
        a.lookAt(H);
        a.showEmote('dots', 1.6);
      }
      await S.cam(V(120.0, y + 2.2, E.z + 1.6), V(129, y + 1.1, 47.6), 0, 50);
      await S.wait(1.5);
      for (const a of crowd) a.tempExpr('shock', 3);
      gus?.tempExpr('shock', 3);
      S.sfx('gasp', { volume: 0.5 });
      await S.wait(0.5);
      if (kid) {
        kid.react('shock');
        S.sfx('scream', { pitch: 1.5 });
        await S.frame(kid, [-2.5, 1.0, 3.0], 0.4, 45, 0.9);
        await S.say('pip', "MOM?! THERE'S A SKELETON ON A BICYCLE!", { actor: kid, expr: 'shock' });
      }
      // EVERYBODY SCREAMS: tools fly, and they scatter behind the tables and the hay bales
      await S.cam(V(115.5, y + 5.5, 57.5), V(128, y + 0.6, 49.5), 0, 55);
      S.sfx('scream');
      g.chase.shake(0.5);
      H.play('handsup', 'scared');
      H.showEmote('sweat', 3);
      for (const a of crowd) {
        a.scripted = false;
        const b = a.brain;
        if (!b) continue;
        b.scripted = false;
        b.mode = 'routine';
        b.busy = false;
        b._act = null;
        b.startle(X);
      }
      // ...all but Gus, who has hosted forty-one of these and isn't about to stop now:
      // he marches straight up the street to the intruder
      const GT = { x: H.pos.x + fwd.x * 2.4 + fwd.z * 0.3, z: H.pos.z + fwd.z * 2.4 - fwd.x * 0.3 };
      if (gus) {
        gus.tempExpr('angry', 8);
        gus.walkTo([[GT.x, GT.z]], 1.7, 'hostWalk').then(() => gus.faceTowards(H.pos.x, H.pos.z));
      }
      await S.wait(3.6);
      await S.say('marie', 'Mon dieu! Un mort-vivant!', { actor: marie, expr: 'scared' });
      await S.say('doug', 'Everybody stay calm! I am a trained professional!', { actor: doug, expr: 'scared' });
      await S.say('ingrid', 'Clinically speaking... that is extremely interesting.', { actor: ingrid, expr: 'surprised' });
      H.play('idle', 'sheepish');
      if (gus) {
        // (still on his way? he's there now)
        gus.path = null;
        gus.pos.set(GT.x, g.physics.groundAt(GT.x, GT.z, y + 2).h, GT.z);
        gus.faceTowards(H.pos.x, H.pos.z);
        H.faceTowards(GT.x, GT.z);
        gus.play('announce', 'angry');
        S.sfx('megaphone', { volume: 0.9, pitch: 0.9 });
        g.chase.shake(0.3);
        // out in the street, in front of Gus: his face, the contest behind him
        await S.cam(V(GT.x - 1.9, y + 1.6, GT.z + 1.7), V(GT.x, y + 1.45, GT.z), 0.5, 42);
        await S.say('gus', 'STAY RIGHT THERE, YOU ROTTEN TURNIP!', { actor: gus, expr: 'angry' });
        H.play('handsup', 'scared');
        H.showEmote('sweat', 3);
        await S.frame(H, [0.6, 1.0, 2.6], 0.4, 40, 1.0);
        await S.say('hank', "WAIT! Don't... *megaphone* me! I'm just... I'm just *delivering cocoa!*", { actor: H, expr: 'scared' });
        gus.play('hostWalk', 'surprised');
        await S.cam(V(GT.x - 1.9, y + 1.6, GT.z + 1.7), V(GT.x, y + 1.45, GT.z), 0.4, 40);
        gus.showEmote('question', 2);
        await S.say('gus', '...Cocoa?', { actor: gus, expr: 'surprised' });
        await S.say('gus', 'Is that... *Marguerite\'s* cocoa?', { actor: gus, expr: 'surprised' });
        await S.say('hank', 'Classic. Extra hot. For a... "Gus"?', { actor: H, expr: 'sheepish' });
        await S.say('gus', "Well why in the blue blazes didn't ya say so!", { actor: gus, expr: 'laugh' });
        await S.say('gus', 'Hand it over before it gets cold, ya rattling coat rack.', { actor: gus, expr: 'smug' });
        H.play('offer', 'happy');
        await S.wait(1.0);
        const o = g.orders.orderFor('gus');
        if (o) {
          const r = g.orders.deliver(o);
          g.effects.coins(H.pos.x, H.pos.y + 1.2, H.pos.z, 10);
          S.sfx('cash');
          g.ui.pop(`*$${r.pay}*${r.tip ? ` and a *$${r.tip}* tip` : ''} from Gus! I think he almost smiled.`, { expr: 'happy' });
        }
        gus.play('sip', 'happy');
        S.sfx('sip');
        await S.wait(1.2);
        // the all-clear, through the megaphone; the kids, at least, cheer
        gus.faceTowards(C.x, C.z);
        gus.play('announce', 'happy');
        S.sfx('megaphone', { volume: 0.7 });
        await S.cam(V(GT.x - 2.6, y + 1.8, GT.z + 2.2), V(GT.x + 6, y + 1.3, GT.z - 0.6), 0.6, 50);
        await S.say('gus', "ALL CLEAR, FOLKS! IT'S JUST THE COCOA BOY! BACK TO YOUR PUMPKINS!", { actor: gus, expr: 'laugh' });
        for (const k of [kid, V2.get('pop')]) if (k) { k.react('yay'); g.wait(0.9).then(() => k.react('yay')); }
        S.sfx('kids_yay', { volume: 0.6 });
        gus.play('hostWalk', 'neutral');
      }
      // the contest peeks out from behind its tables and hay bales
      H.play('idle', 'sheepish');
      await S.cam(V(bp.x - fwd.x * 1.5 - fwd.z * 4.5, y + 3.4, bp.z - fwd.z * 1.5 + fwd.x * 4.5), V(129, y + 0.8, 49.5), 0.8, 52);
      await S.say('doug', '...Technically, being deceased isn\'t against any bylaw I\'m aware of.', { actor: doug, expr: 'sheepish' });
      await S.say('ingrid', 'No pulse at all. Remarkable. I shall observe... from back here.', { actor: ingrid, expr: 'worried' });
      await S.say('marie', "If he brings Marguerite's cocoa, he can be as dead as he likes! ...Mine goes on the café step, mon chou!", { actor: marie, expr: 'scared' });
      await S.say('pip', 'MOM! Let go! I want to see him do a WHEELIE!', { actor: kid, expr: 'laugh' });
      await S.wait(0.6);
      // and the entry form, so to speak
      if (gus) {
        gus.faceTowards(H.pos.x, H.pos.z);
        H.faceTowards(gus.pos.x, gus.pos.z);
        const mx = (H.pos.x + gus.pos.x) / 2, mz = (H.pos.z + gus.pos.z) / 2;
        await S.cam(V(mx + fwd.z * 3.2, y + 1.7, mz - fwd.x * 3.2), V(mx, y + 1.3, mz), 0.6, 44);
        H.play('idle', 'happy');
        await S.say('hank', 'So... can anybody enter?', { actor: H, expr: 'happy' });
        gus.play('inspect', 'neutral');
        gus.showEmote('question', 2);
        await S.say('gus', 'A skeleton... carving a face?', { actor: gus, expr: 'surprised' });
        gus.react('shake');
        await S.say('gus', "Well, it IS a fair contest. Little table at the end's yours. One pumpkin a day.", { actor: gus, expr: 'smug' });
        H.play('cheer', 'sparkle');
        await S.say('hank', 'Yes! I used to whittle! Mostly canoe paddles!', { actor: H, expr: 'sparkle' });
        this.flag('carveIntro', true);
      }
      // they've met him now, but only Gus (who got his cocoa) and the kids (who think he's
      // the coolest) are anything like at ease; the rest drift back to their pumpkins as
      // they get used to a skeleton on a bicycle (npcBrain.js). Gus goes back to hosting.
      for (const [c, t] of Object.entries({ gus: 46, ...AFTER_SCREAM })) V2.force(c, t);
      if (gus) {
        gus.scripted = false;
        gus.play('hostWalk', 'neutral');
      }
      g.rider.visible = true;
      this.flag('village1', true);
      this.flag('contestScream', true);
      g.save();
    }).then(() => g.ui.pop('...Was it something I said?', { expr: 'sheepish', ms: 3500 }));
  }

  // (test entry point: ?scene=carve) straight into the pumpkin carving mini-game at Hank's
  // contest table (add &intro for Gus's verdict on skeletons entering first)
  carve() {
    return this.g.contest.carving.debug();
  }

  // ---------------------------------------------------------------- 5. Poutine
  // A little stray wanders the verges of the road home (strayCat.js). This starts that.
  startCatEvent(rain = false) {
    const g = this.g;
    g.catEventActive = true;
    this.spawnStray();
    if (rain) {
      g.world.atmosphere.setWeather('rain');
      g.ui.pop('Is that drizzle? ...And is that a little *cat* trotting along the road home?', { expr: 'worried', ms: 4500 });
    } else g.ui.pop('That little stray cat is still wandering by the road home...', { expr: 'worried', ms: 4000 });
  }
  spawnStray(at) {
    this.stray?.remove();
    this.stray = new StrayCat(this.g, at || POI.catLog);
    return this.stray;
  }
  despawnStray() {
    this.stray?.remove();
    this.stray = null;
  }

  // Hank crouches by the stray: a hiss (unless she already likes him), a marshmallow, a name
  catRescue() {
    const g = this.g;
    let cat = this.stray;
    if (!cat) {
      // (test entry: a stray right in front of Hank)
      const p = g.playerPos, f = g.bike.forward(new THREE.Vector3());
      cat = this.spawnStray({ x: p.x + f.x * 2.4, z: p.z + f.z * 2.4 });
    }
    const friendly = cat.friendly;
    return this.scene(async (S) => {
      cat.script(true);
      S.temp.push({ remove: () => { if (!this.flag('catRescued')) cat.script(false); } });
      const c = cat.pos.clone();
      const p = g.playerPos;
      g.bike.vel.set(0, 0, 0);
      g.rider.visible = false;
      // Hank kneels a step away from her, on his side; the lens looks across from the open road side
      const u = V(p.x - c.x, 0, p.z - c.z);
      if (u.lengthSq() < 0.04) u.set(1, 0, 0);
      u.normalize();
      let n = V(u.z, 0, -u.x);
      const side = (k) => nearestRoad(c.x + n.x * 3 * k, c.z + n.z * 3 * k)?.d ?? 0;
      if (side(-1) < side(1)) n.multiplyScalar(-1);
      const hx = c.x + u.x * 1.35, hz = c.z + u.z * 1.35;
      const H = S.actor('hank', hx, hz, 0, 'idle');
      H.faceTowards(c.x, c.z);
      H.yaw = H.targetYaw;
      cat.yaw = cat.yawTo = Math.atan2(hx - c.x, hz - c.z);
      const cy = c.y;
      const mx = (c.x + hx) / 2, mz = (c.z + hz) / 2;
      await S.cam(V(mx + n.x * 3.4 - u.x * 0.8, cy + 1.7, mz + n.z * 3.4 - u.z * 0.8), V(mx, cy + 0.45, mz), 0, 42);
      if (friendly) {
        cat.pose('sit', 'blink');
        S.sfx('purr');
        await S.wait(0.6);
        await S.say('hank', "Well, hello again, little shadow. You've been following me, huh?", { actor: H, expr: 'happy' });
        S.sfx('meow', { pitch: 1.2 });
        cat.pose('sit', 'meow');
        await S.say('cat', 'Mrrp!', { expr: 'happy' });
        await S.say('hank', 'Lost too? Yeah. I know the feeling.', { actor: H, expr: 'neutral' });
      } else {
        cat.pose('sit');
        S.sfx('meow_sad');
        await S.wait(0.8);
        await S.say('hank', 'Hey there, little buddy. You lost too?', { actor: H, expr: 'neutral' });
        cat.pose('arch', 'meow');
        cat.hopT = 0.4;
        S.sfx('cat_hiss');
        S.emote('anger', V(c.x, cy + 0.75, c.z), 1.6);
        await S.say('cat', 'HSSSSSSS!', { expr: 'scared' });
        await S.say('hank', 'Yeah... I get that a lot.', { actor: H, expr: 'sheepish' });
        H.play('offer', 'happy');
        await S.say('hank', "I've got one marshmallow. Nana packed an extra. Just in case I... figured out eating.", { actor: H, expr: 'happy' });
        cat.pose('sit');
        S.emote('question', V(c.x, cy + 0.75, c.z), 1.4);
        await S.wait(1.4);
        S.sfx('purr');
        S.emote('heart', V(c.x, cy + 0.75, c.z), 2);
        // she trots over to sniff it, then sits at his feet
        if (!S.skip) await Promise.race([cat.walkTo(hx - u.x * 0.45, hz - u.z * 0.45, 0.7, 'crouch'), g.wait(2.5)]);
        cat.pose('sit', 'blink');
        cat.yawTo = Math.atan2(hx - cat.pos.x, hz - cat.pos.z);
      }
      H.play('idle', 'happy');
      await S.cam(V(mx + n.x * 2.2 + u.x * 0.4, cy + 1.1, mz + n.z * 2.2 + u.z * 0.4), V(mx - u.x * 0.2, cy + 0.5, mz - u.z * 0.2), 0.5, 40);
      await S.say('hank', "You don't mind that I'm a little bit dead?", { actor: H, expr: 'surprised' });
      cat.pose('sit', 'meow');
      S.sfx('meow', { pitch: 1.3 });
      await S.say('cat', 'Mrrp.', { expr: 'happy' });
      await S.say('hank', "Then I'll call you... *Poutine.*", { actor: H, expr: 'happy' });
      S.sfx('meow', { pitch: 1.2 });
      cat.pose('sit', 'meow');
      await S.say('cat', 'Mrrrrrp!', { expr: 'love' });
      g.effects.hearts(H.pos.x, H.pos.y + 1.4, H.pos.z, 8);
      this.st.cat = true;
      g.rider.enableCat(true);
      g.rider.visible = true;
      this.flag('catRescued', true);
      g.catEventActive = false;
      this.despawnStray();
      g.world.atmosphere.setWeather('overcast');
      g.save();
    }).then(() => g.ui.pop("*Poutine* is riding in my basket now. Purr-fect!", { expr: 'love' }));
  }

  // ---------------------------------------------------------------- deliveries
  async deliver(o, actor) {
    const g = this.g;
    const r = g.orders.deliver(o);
    const lines = DELIVERY_LINES[o.customer] || DELIVERY_LINES.marie;
    const pool = r.quality > 55 ? lines.hot : lines.cold;
    const line = pool[Math.floor(Math.random() * pool.length)];
    actor.faceTowards(g.playerPos.x, g.playerPos.z);
    actor.lookAt(g.playerChar);
    actor.play('sip', r.quality > 55 ? 'happy' : 'sad');
    actor.jump(2);
    g.effects.coins(actor.pos.x, actor.pos.y + 1.4, actor.pos.z, 8 + Math.round(r.tip / 2));
    if (r.quality > 70) g.effects.hearts(actor.pos.x, actor.pos.y + 1.8, actor.pos.z, 4);
    g.sound.play('delivered');
    setTimeout(() => g.sound.play('cash'), 300);
    const q = Math.round(r.quality);
    const heat = q > 80 ? 'Still piping hot!' : q > 55 ? `Cocoa ${q}% hot.` : q > 30 ? `Only ${q}% hot... oops.` : `${q}% hot. More like iced cocoa.`;
    g.ui.pop(`*$${r.pay}*${r.tip ? ` plus a *$${r.tip}* tip` : ''}! ${heat}`, { expr: q > 55 ? 'happy' : 'sheepish' });
    g.ui.tag(`d${o.id}`, r.quality > 55 ? 'Toasty!' : 'Brr...', actor.pos.clone().setY(actor.pos.y + 2.4), 1600);
    g.mode = 'menu';
    await g.ui.say(o.customer, line, { expr: r.quality > 55 ? 'happy' : 'sad' });
    g.mode = 'ride';
    setTimeout(() => actor.play(actor.char === 'agnes' ? 'knit' : actor.char === 'pip' ? 'hockey' : 'idle', 'neutral'), 2500);
    g.save();
  }

  // ---------------------------------------------------------------- the porch
  async homeTalk() {
    const g = this.g;
    const st = this.st;
    const N = g.villagers.get('grandma');
    N.faceTowards(g.playerPos.x, g.playerPos.z);
    N.lookAt(g.playerChar);
    g.mode = 'menu';
    try {
      await g.quests.turnIns(N);
      // homecoming after the first day's rescue
      if (st.flags.catRescued && !st.flags.catIntro) {
        st.flags.catIntro = true;
        await g.ui.say('grandma', 'Oh! You brought a friend! Poor little thing, she\'s soaked through.', { expr: 'surprised' });
        await g.ui.say('hank', "Her name's Poutine.", { expr: 'happy' });
        await g.ui.say('grandma', 'Of course it is. Welcome home, Poutine.', { expr: 'laugh' });
        await g.ui.say('cat', 'Mrrp!', { expr: 'happy' });
      }
      const found = KEEPSAKES.filter((k) => st.keepsakes[k.id] === 'found');
      if (found.length) {
        await g.ui.say('hank', `Nana, I found ${found.length > 1 ? 'some things' : 'something'} of Harold's out there...`, { expr: 'happy' });
        for (const k of found) {
          st.keepsakes[k.id] = 'given';
          st.money += 20;
          g.sound.play('collect');
          await g.ui.say('grandma', LORE[k.id], { expr: 'happy' });
          g.ui.pop(`Nana gave me *$20* for the ${k.name}. I'd blush if I had cheeks.`, { expr: 'sheepish' });
        }
        const given = KEEPSAKES.filter((k) => st.keepsakes[k.id] === 'given').length;
        if (given === KEEPSAKES.length && !st.flags.allKeepsakes) {
          st.flags.allKeepsakes = true;
          await g.ui.say('grandma', "That's... all of them. Every last thing he wandered off with.", { expr: 'cry' });
          await g.ui.say('grandma', 'He would have liked you, Hank. Very much.', { expr: 'happy' });
          st.money += 100;
          g.ui.pop('Nana slipped me *$100* and a very long hug. My ribs creaked.', { expr: 'love' });
        }
        g.save();
      }
      const pending = g.orders.pending().length;
      const board = g.orders.board().length;
      const opts = [];
      if (board > 0) opts.push(['Show me the order board', 'board']);
      if (pending === 0 || g.world.atmosphere.hour > 18) opts.push(['Call it a day', 'sleep']);
      opts.push(['Need anything from the store?', 'shop']);
      opts.push(['How are you, Nana?', 'chat']);
      opts.push(['See you later!', 'bye']);
      const greet = pending === 0 && board === 0 ? 'All done for today? Wonderful work, dear.' : board > 0 ? 'Back for more? There are still orders on the board.' : 'Hello, dear! Remember — hot cocoa makes happy customers.';
      const ch = await g.ui.say('grandma', greet, { expr: 'happy', choices: opts.map((o) => o[0]) });
      const what = opts[ch][1];
      if (what === 'board') {
        await new Promise((res) => g.menus.orderBoard(res));
        // the cups go out to Bessie's crate, so out of the cabin first
        if (g.orders.carried().length && g.interior?.active) await g.interior.leave();
        await g.loadCargo?.();
        if (g.orders.carried().length) g.ui.pop(`${g.orders.carried().length} hot cocoa${g.orders.carried().length > 1 ? 's' : ''} packed. Go go go!`, { expr: 'sparkle', key: 'packed' });
        g.refillBoosts();
      } else if (what === 'sleep') {
        await this.endDay();
        return;
      } else if (what === 'shop') {
        const low = Object.entries(st.pantry || {}).filter(([, n]) => n < 2).map(([k]) => k);
        const names = { milk_bottle: 'milk', cocoa_powder: 'cocoa powder', sugar: 'sugar', marshmallows: 'marshmallows', maple_syrup: 'maple syrup', cinnamon: 'cinnamon', mint: 'fresh mint', pumpkin: 'a pumpkin', nutmeg: 'nutmeg', cream: 'cream', coffee_beans: 'coffee beans', dark_chocolate: 'dark chocolate' };
        if (!low.length) await g.ui.say('grandma', "The pantry's full, dear! But thank you for asking.", { expr: 'happy' });
        else {
          await g.ui.say('grandma', `Oh, would you? We're low on ${low.slice(0, 4).map((k) => names[k] || k).join(', ')}. Mo at Moose & Goose will sort you out. Here's my list!`, { expr: 'happy' });
          g.quests.q('groceries').state = 'active';
          g.sound.play('quest_new');
          g.ui.pop("Nana's list is pinned to my note. Moose & Goose is down on the boardwalk!", { expr: 'happy' });
        }
      } else if (what === 'chat') {
        const chats = [
          ['grandma', 'My knees are singing the song of their people today. Thank you for running about for me.', 'happy'],
          ['grandma', 'Harold used to ride that bike to the lookout every evening to watch the sunset. Take a look sometime.', 'neutral'],
          ['grandma', 'If you find anything of Harold\'s out there, bring it home, would you? He was forever losing things.', 'sad'],
          ['grandma', 'Big Lou at the sawmill swears you owe him five dollars. I swear you don\'t. Let\'s not tell him you\'re back... oh, too late.', 'laugh'],
          ['grandma', 'There\'s a covered bridge, a beaver dam, a lighthouse... Maple Hollow is small, but it\'s full of corners.', 'happy'],
          ['grandma', 'The ramps in the woods? Harold built those. "For the deer," he said. The deer have never used them.', 'smug'],
        ];
        const c = chats[Math.floor(Math.random() * chats.length)];
        await g.ui.say(c[0], c[1], { expr: c[2] });
      }
    } finally {
      if (g.mode === 'menu') g.mode = 'ride';
    }
  }

  async endDay() {
    const g = this.g;
    g.mode = 'menu';
    g.sound.play('day_end');
    await new Promise((res) => g.menus.summary(res));
    await this.bedtime();
    g.newDay();
  }

  // ---------------------------------------------------------------- bedtime, in Harold's old pajamas
  // (test entry point: ?scene=bedtime) Hank yawns by the fire, Nana brings Harold's flannel
  // pajamas, *poof*, nightcap and all; he says goodnight and stretches out on the sofa, she
  // tucks the quilt round him and turns the lamps down. Ends on black; the morning follows.
  bedtime() {
    const g = this.g;
    const I = g.interior, R = I.room;
    const A = g.world.atmosphere;
    const L = (x, y, z) => R.wp(x, y, z); // room-local -> world
    const first = !this.flag('pajamas');
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return this.scene(async (S) => {
      await S.fade(1, 1.0);
      I.reset();
      I.stage(true);
      S.temp.push({ remove: () => I.stage(false) });
      A.hour = Math.min(23.8, Math.max(A.hour, 21.6));
      A.cold = 0;
      g.setBikeVisible(false);
      g.rider.visible = false;
      g.villagers.setVisible('grandma', false);
      S.temp.push({ remove: () => g.villagers.setVisible('grandma', true) });
      S.music('night');
      const floor = R.floorY;
      // Hank by the fire, Nana coming over from the dining table with the folded pajamas
      const hs = L(2.95, 0, -0.95), ns = L(0.2, 0, 1.4);
      const H = S.actor('hank', hs.x, hs.z, R.wyaw(-Math.PI / 2), 'idle');
      H.yaw = H.targetYaw;
      const N = S.actor('grandma', ns.x, ns.z, R.wyaw(Math.PI / 2), 'carry');
      const pjRes = BED.pajamaBundle();
      const pjGeo = meshVox(pjRes.vox, { size: pjRes.size, origin: pjRes.origin, jitter: 0.02 });
      const bundle = voxMesh(pjGeo, sharedVoxelMaterial());
      bundle.position.set(0, -0.05, 0.12);
      N.hold(bundle);
      S.temp.push({ remove: () => { bundle.parent?.remove(bundle); pjGeo.dispose(); } });
      // the quilt that goes over him later (room-local, so it sits on the sofa whatever way the cabin faces)
      const qRes = BED.sleepQuilt();
      const qGeo = meshVox(qRes.vox, { size: qRes.size, origin: qRes.origin, jitter: 0 });
      const quilt = voxMesh(qGeo, R.mat, { cast: false, receive: true });
      quilt.position.set(qRes.at.x, 0, qRes.at.z);
      quilt.visible = false;
      R.root.add(quilt);
      S.temp.push({ remove: () => { R.root.remove(quilt); qGeo.dispose(); } });
      // the two lamps by the sofa, put back the way they were afterwards
      const lamps = [R.lights[1], R.lights[2]].filter(Boolean);
      const lampBase = lamps.map((l) => l.intensity);
      S.temp.push({ remove: () => lamps.forEach((l, i) => (l.intensity = lampBase[i])) });

      const wide = [L(-0.5, 2.3, 1.9), L(2.7, 0.95, -0.9)];
      await S.cam(wide[0], wide[1], 0, 48);
      S.cam(L(0.2, 2.15, 1.3), wide[1], 4, 46);
      const nw = N.walkTo([L(1.4, 0, 1.05), L(2.3, 0, 0.7), L(2.75, 0, 0.1)], 1.0, 'carry');
      await S.fade(0, 1.2);
      // a big yawn
      H.play('yawn', 'sleepy');
      S.sfx('bone_rattle', { volume: 0.3 });
      await S.faceShot(H, { dist: 2.4, side: 0.5, dur: 0.8, fov: 42 });
      await S.say('hank', first ? "*Yaaawn.* ...Huh. I didn't know skeletons could get sleepy. My bones feel all heavy." : pick(['*Yaaawn.* Bedtime already? My knees are clacking.', '*Yaaawn.* I pedalled so much today my femurs are humming.', '*Yaaawn.* ...Sorry, Nana. My jaw nearly came off that time.']), { actor: H, expr: 'sleepy' });
      H.play('idle');
      await Promise.race([nw, S.wait(3)]);
      if (N.path) { N.path = null; N.pos.copy(L(2.75, 0, 0.1)); }
      N.faceTowards(H.pos.x, H.pos.z);
      H.faceTowards(N.pos.x, N.pos.z);
      H.lookAt(N);
      N.lookAt(H);
      await S.cam(L(1.0, 1.75, -0.3), L(2.85, 1.05, -0.45), 0.8, 44);
      await S.say('grandma', first ? "Of course you're sleepy, dear, you've been up and down every hill in Maple Cove. Here: Harold's old flannel pajamas. Freshly washed. Mostly." : 'Your pajamas have been warming by the fire, dear. In you go.', { actor: N, expr: 'happy' });
      // she hands them over...
      N.play('offer');
      await S.wait(0.4);
      N.hold(null);
      H.hold(bundle, 'R');
      H.play('hold', 'surprised');
      N.play('idle');
      if (first) await S.say('hank', "Pajamas? For me? I haven't worn pajamas since... well, since I had skin.", { actor: H, expr: 'surprised' });
      else await S.wait(0.5);
      // ...and *poof*: striped flannel, a nightcap and slippers
      S.sfx('flash_pop');
      S.sfx('magic', { volume: 0.6 });
      g.effects.poof?.(H.pos.x, H.pos.y + 0.9, H.pos.z, { scale: 1.3, color: [1, 0.96, 0.9], count: 9 });
      g.effects.poof?.(H.pos.x, H.pos.y + 0.3, H.pos.z, { scale: 0.9, color: [1, 0.96, 0.9], count: 5 });
      await S.wait(0.15);
      H.hold(null, 'R');
      bundle.parent?.remove(bundle);
      H.char = 'hankPajamas';
      H.play('idle', 'happy');
      H.react('spin');
      g.effects.confetti?.(H.pos.x, H.pos.y + 1.4, H.pos.z, 12);
      await S.wait(0.8);
      await S.faceShot(H, { dist: 2.4, side: 0.5, up: 0.2, dur: 0.6, fov: 42 });
      await S.say('hank', first ? 'Ooh! Striped flannel! And a nightcap with a pompom! I look like a very distinguished candy cane.' : pick(['Ahh, flannel. Best part of the day.', 'Nightcap: on. Pompom: magnificent.', "Snug as a bug in a... well, a bug's skeleton."]), { actor: H, expr: 'happy' });
      if (first) {
        N.react('laugh');
        await S.cam(L(1.0, 1.75, -0.3), L(2.85, 1.05, -0.45), 0.6, 44);
        await S.say('grandma', "Harold wore those every winter for forty years. He'd be tickled they're keeping somebody's bones warm again.", { actor: N, expr: 'laugh' });
      }
      await S.faceShot(H, { dist: 2.3, side: 0.5, up: 0.2, dur: 0.5, fov: 42 });
      await S.say('hank', first ? 'Goodnight, Nana. And... thank you. For all of it.' : 'Goodnight, Nana.', { actor: H, expr: 'happy' });
      this.flag('pajamas', true);
      // he stretches out on the sofa, head on the armrest by the lamp
      await S.cam(L(3.95, 1.85, -0.35), L(2.15, 0.62, -1.45), 0, 46);
      const stand = L(2.95, 0, -1.5), lie = L(2.15, 0, -1.5);
      const lw = H.walkTo([stand], 1.0, 'walk');
      H.lookAt(null);
      await Promise.race([lw, S.wait(1.2)]);
      H.path = null;
      H.groundSnap = false;
      H.yaw = H.targetYaw = R.wyaw(Math.PI);
      H.play('sofaSleep', 'sleepy');
      S.sfx('whoosh', { volume: 0.3, pitch: 0.8 });
      const from = H.pos.clone();
      await S.anim(0.5, (k) => {
        H.pos.x = from.x + (lie.x - from.x) * k;
        H.pos.z = from.z + (lie.z - from.z) * k;
        H.pos.y = floor + 0.46 * k + Math.sin(k * Math.PI) * 0.3;
      });
      H.pos.set(lie.x, floor + 0.46, lie.z);
      S.sfx('creak', { volume: 0.5 });
      S.sfx('bone_rattle', { volume: 0.25 });
      // Nana tucks Harold's quilt round him
      const nt = N.walkTo([L(2.9, 0, -0.45), L(2.95, 0, -1.2)], 0.9, 'walk');
      await Promise.race([nt, S.wait(2.2)]);
      if (N.path) { N.path = null; N.pos.copy(L(2.95, 0, -1.2)); }
      N.faceTowards(H.pos.x, H.pos.z);
      N.lookAt(null);
      N.play('tuck');
      quilt.visible = true;
      S.sfx('whoosh', { volume: 0.35, pitch: 0.7 });
      await S.anim(0.7, (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        quilt.scale.set(0.45 + 0.55 * e, 1, 0.45 + 0.55 * e);
        quilt.position.y = (1 - e) * 0.45;
      });
      quilt.scale.set(1, 1, 1);
      quilt.position.y = 0;
      const qt0 = g.time;
      S.every(() => void (quilt.scale.y = 1 + Math.sin((g.time - qt0) * 1.4) * 0.015));
      await S.wait(0.6);
      await S.say('grandma', first ? "Sleep tight, dear. Don't let the bedbugs bite. ...Not that there's much left to bite." : pick(['Sleep tight, dear. Sweet dreams.', "Night night. I'll have breakfast waiting. For the squirrels, mostly.", 'Goodnight, Hank. Mind you wake up this time.']), { actor: N, expr: first ? 'laugh' : 'happy' });
      // and the lamps go down
      N.play('idle');
      const nl = N.walkTo([L(2.5, 0, -0.1)], 0.8, 'walk');
      await Promise.race([nl, S.wait(1.4)]);
      N.path = null;
      N.faceTowards(L(2.0, 0, 0.12).x, L(2.0, 0, 0.12).z);
      N.play('reach');
      await S.cam(L(-1.3, 2.55, 2.4), L(2.4, 0.75, -1.3), 0, 50);
      await S.wait(0.5);
      S.sfx('ui_click', { volume: 0.6 });
      await S.anim(1.2, (k) => lamps.forEach((l, i) => (l.intensity = lampBase[i] * (1 - 0.82 * k))));
      N.play('idle');
      H.setExpr('sleepy');
      H.showEmote('zzz', 6);
      S.sfx('snore', { volume: 0.4 });
      S.cam(L(-0.6, 2.4, 1.6), L(2.3, 0.7, -1.4), 5, 48);
      await S.wait(2.4);
      S.sfx('big_snore', { volume: 0.3 });
      await S.wait(1.0);
      await S.fade(1, 1.6);
      await S.wait(0.5);
    });
  }

  // ---------------------------------------------------------------- the ending
  async ending() {
    const g = this.g;
    await this.scene(async (S) => {
      g.parkBike(-144.3, 94, Math.PI / 2);
      g.rider.visible = false;
      const H = S.actor('hank', -145.0, 96.6, Math.PI, 'idle');
      const N = S.actor('grandma', -142.8, 97.6, -2.4, 'idle');
      g.villagers.setVisible('grandma', false);
      const y = g.bike.pos.y;
      await S.cam(V(-138.8, y + 1.8, 91), V(-144.3, y + 0.9, 95), 0, 46);
      await S.say('grandma', "Look at you two. Bessie hasn't been ridden like that since Harold was courting me. He'd be so proud of you, dear.", { actor: N, expr: 'cry' });
      const R = S.actor('reaper', -141.3, 92.5, -0.8, 'float');
      R.floatY = 0.25;
      S.sfx('reaper');
      g.effects.magic(R.pos.x, R.pos.y + 1, R.pos.z, 20, [0.5, 0.4, 0.8]);
      await S.frame(R, [2.4, 0.8, -3], 1, 42, 1.1);
      await S.say('reaper', 'Knock knock! Good news, Hank! The paperwork finally came through.', { actor: R, expr: 'happy' });
      R.play('clipboard');
      await S.say('reaper', "You can rest in peace now. Properly. Lovely pine box, soft pillow, the works.", { actor: R, expr: 'smug' });
      await S.frame(H, [1.6, 1, 2.6], 0.6, 40, 1);
      await S.say('hank', "That's... very kind. But...", { actor: H, expr: 'neutral' });
      const c = await S.say('hank', 'Could I maybe get an extension? I\'ve got deliveries.', { actor: H, expr: 'sheepish', choices: ['"I\'ve got deliveries."', '"Poutine would miss me."', '"Nana needs me."'] });
      void c;
      await S.frame(R, [2.2, 0.8, -2.6], 0.5, 40, 1.1);
      R.showEmote('question', 2);
      await S.say('reaper', '...Is that Marguerite\'s cocoa I smell?', { actor: R, expr: 'surprised' });
      N.play('offer', 'happy');
      await S.say('grandma', 'Fresh pot. Maple marshmallow.', { actor: N, expr: 'smug' });
      R.play('sip');
      S.sfx('sip');
      await S.wait(1.4);
      await S.say('reaper', '...Fine. FINE. Extension granted. Indefinitely.', { actor: R, expr: 'happy' });
      await S.say('reaper', 'But put me down for a cup every Friday. Extra hot.', { actor: R, expr: 'laugh' });
      g.effects.confetti(H.pos.x, H.pos.y + 2, H.pos.z, 60);
      S.sfx('upgrade');
      await S.cam(V(-133.8, y + 6, 86), V(-144.8, y + 1, 95), 3, 50);
      await S.say('hank', 'The end? Nah. The end... *of the beginning!* Keep the cocoa coming!', { actor: H, expr: 'laugh' });
      await S.wait(1.5);
      g.villagers.setVisible('grandma', true);
      g.rider.visible = true;
      this.flag('ending', true);
      g.save();
    });
  }

  // riding Bessie like Harold did (enough of his riding notes mastered): Nana wants to see,
  // and the ending plays the next time Hank opens the notes at the garage
  onMastery(total, max, need = 20) {
    if (total < need || this.flag('ending') || this.flag('masteryReady')) return;
    this.flag('masteryReady', true);
    this.g.ui.pop('Hank, dear! Come round to the garage, I want to see you *ride*!', { who: 'grandma', expr: 'happy', ms: 5000 });
  }

  // ---------------------------------------------------------------- world triggers
  drop(frame, pos, vel, scale = 1) {
    const g = this.g;
    const b = new Billboard(g.atlas, frame, { castShadow: true, upright: 0.7 });
    b.mesh.position.copy(pos);
    b.setScale(scale, scale);
    g.scene.add(b.mesh);
    this.debris.push({ b, vel: vel.clone(), spin: (Math.random() - 0.5) * 12, landed: false });
  }

  dropMesh(mesh, pos, vel) {
    mesh.position.copy(pos);
    this.g.scene.add(mesh);
    const b = { mesh, get roll() { return mesh.rotation.z; }, set roll(v) { mesh.rotation.z = v; mesh.rotation.x = v * 0.7; } };
    this.debris.push({ b, vel: vel.clone(), spin: (Math.random() - 0.5) * 12, landed: false });
  }

  update(dt) {
    const g = this.g;
    // hot food steams
    for (const s of this.steamers || []) {
      if (Math.random() < dt * 9) g.effects.ps.spawn({ x: s.x + (Math.random() - 0.5) * 0.04, y: s.y, z: s.z + (Math.random() - 0.5) * 0.04, vx: (Math.random() - 0.5) * 0.08, vy: 0.35 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.08, life: 1.6, size: 0.06, size1: 0.2, sprite: P.steam, color: [1, 1, 1], alpha: 0.55, drag: 0.6, flutter: 0.4, wind: 0.3 });
    }
    for (const d of this.debris) {
      d.vel.y -= 9.8 * dt;
      d.b.mesh.position.addScaledVector(d.vel, dt);
      d.b.roll += d.spin * dt;
      const p = d.b.mesh.position;
      const h = g.physics.groundAt(p.x, p.z, p.y + 0.5).h;
      if (p.y < h) {
        p.y = h;
        if (!d.landed) {
          d.landed = true;
          g.sound.play('squish', { volume: 0.5, pitch: 1.3 + Math.random() * 0.3 });
          g.effects.ps.burst(5, (k, r) => ({ x: p.x, y: h + 0.05, z: p.z, vx: r.range(-0.8, 0.8), vy: r.range(0.3, 0.9), vz: r.range(-0.8, 0.8), life: 0.6, size: 0.18, size1: 0.35, sprite: P.dust, color: [0.8, 0.72, 0.6], drag: 2, alpha: 0.8 }));
        }
        d.vel.y = Math.abs(d.vel.y) * 0.3;
        d.vel.x *= 0.5;
        d.vel.z *= 0.5;
        d.spin *= 0.5;
      }
    }
    for (const f of this.followers || []) f.onTick?.();
    // the stray on the road home (gone again once she's rescued or the day is over)
    if (this.stray) {
      if (!g.catEventActive && !this.stray.scripted) this.despawnStray();
      else this.stray.update(dt);
    }
    if (g.mode !== 'ride') return;
    const st = this.st;
    const p = g.playerPos;
    // first visit to Maple Cove
    if (!st.flags.village1 && Math.hypot(p.x - CONTEST.x, p.z - CONTEST.z) < CONTEST.r) this.villagePanic();
    // Poutine wanders the road home once the first day's deliveries are done (and every day after, until she's found)
    if (st.flags.village1 && !st.flags.catRescued && !g.catEventActive && (st.day > 1 || g.orders.pending().length === 0)) this.startCatEvent(st.day === 1);
    // Nana calls Hank home at night
    const hr = g.world.atmosphere.hour;
    if (hr > 20.5 && !this.nanaCalled) {
      this.nanaCalled = true;
      g.ui.pop("Haaank! It's getting dark, dear! Come home!", { who: 'grandma', expr: 'worried', ms: 4500 });
    }
    if (this.pendingEnding && g.mode === 'ride') {
      this.pendingEnding = false;
      this.ending();
    }
  }
}

function weatherLine(w, day) {
  return { clear: 'Crisp and clear', breezy: 'Breezy — leaves everywhere', misty: 'Misty morning', overcast: 'Grey and gentle', rain: 'Rainy day — cocoa weather', snow: 'First snow!' }[w] || '';
}
