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
import * as FOOD from '../voxel/models/food.js';
import { meshVox, fragmentVox } from '../voxel/mesh.js';
import { Vox } from '../voxel/vox.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

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
      toast: "Have a look around Nana's cabin. When you're ready, sit on the sofa by the fire.",
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
      g.ui.banner(`DAY ${day}`, weatherLine(g.state.weather, day), 2800);
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
      await S.say('grandma', "Maple Cove is down the road to the east, past the covered bridge. Gus lives at the edge of the village. Mind his temper.", { actor: N, expr: 'neutral' });
      await S.say('hank', 'Got it. East. Bridge. Temper.', { actor: H, expr: 'determined' });
      g.villagers.setVisible('grandma', true);
      g.rider.visible = true;
      this.flag('bike', true);
    }).then(() => {
      g.ui.toast('<span class="key">W</span> pedal (tap in rhythm to sprint) · <span class="key">A</span><span class="key">D</span> steer · hold <span class="key">Space</span> and let go to hop · <span class="key">Q</span> wheelie · <span class="key">Shift</span> drift', null, 8000);
      g.ui.toast('Follow the cocoa cups on the compass', 'cocoa', 6000);
    });
  }

  // ---------------------------------------------------------------- 4. the village panics
  villagePanic() {
    const g = this.g;
    return this.scene(async (S) => {
      const V2 = g.villagers;
      g.bike.vel.set(0, 0, 0);
      const bp = g.bike.pos.clone();
      const fwd = g.bike.forward(new THREE.Vector3());
      g.rider.visible = false;
      const H = S.actor('hank', bp.x + fwd.z * 0.9, bp.z - fwd.x * 0.9, g.bike.yaw, 'idle');
      S.music('village');
      const kid = V2.get('kids'), pop = V2.get('pop'), marie = V2.get('marie'), doug = V2.get('doug'), ingrid = V2.get('ingrid'), gus = V2.get('gus');
      const cast = [kid, pop, marie, doug, ingrid, gus].filter(Boolean);
      for (const a of cast) a.scripted = true;
      // whatever happens (even a skip), the cast goes back to their own lives afterwards
      S.temp.push({ remove: () => { for (const a of cast) a.scripted = false; } });
      // gather a little crowd near the street
      const meet = bp.clone().addScaledVector(fwd, 9);
      const spots = [[-3, 2], [-1, 3.5], [1.5, 3], [3, 1.5], [4.5, -1], [0, 5]];
      const crowd = [kid, pop, marie, doug, ingrid];
      crowd.forEach((a, i) => {
        if (!a) return;
        const [ox, oz] = spots[i];
        a.pos.set(meet.x + ox * fwd.z + oz * fwd.x, 0, meet.z - ox * fwd.x + oz * fwd.z);
        a.faceTowards(bp.x, bp.z);
        a.play('idle', 'neutral');
      });
      if (gus) {
        gus.pos.set(meet.x + 7 * fwd.x - 4 * fwd.z, 0, meet.z + 7 * fwd.z + 4 * fwd.x);
        gus.visible = false;
      }
      H.faceTowards(meet.x, meet.z);
      await S.cam(V(bp.x - fwd.x * 4 + fwd.z * 3, bp.y + 2.2, bp.z - fwd.z * 4 - fwd.x * 3), V(meet.x, bp.y + 1, meet.z), 0, 50);
      await S.wait(0.6);
      await S.say('hank', 'Hi there! Cocoa delivery from Nana Marguerite!', { actor: H, expr: 'happy' });
      // a beat of silence...
      for (const a of crowd) a?.showEmote('dots', 1.2);
      await S.wait(1.3);
      kid.showEmote('alert', 2);
      kid.jump(3);
      S.sfx('scream', { pitch: 1.5 });
      await S.frame(kid, [-2.5, 1.0, 3.0], 0.4, 45, 0.9);
      await S.say('pip', "MOM?! THERE'S A SKELETON ON A BICYCLE!", { actor: kid, expr: 'shock' });
      for (const a of crowd) {
        if (!a) continue;
        a.play('scared', 'scared');
        a.showEmote('alert', 2.5);
        a.jump(2.5 + Math.random());
      }
      S.sfx('scream');
      g.chase.shake(0.5);
      await S.cam(V(meet.x - fwd.z * 7, bp.y + 3, meet.z + fwd.x * 7), V(meet.x, bp.y + 1, meet.z), 0.6, 55);
      await S.say('marie', 'Mon dieu! Un mort-vivant!', { actor: marie, expr: 'scared' });
      await S.say('doug', 'Everybody stay calm! I am a trained professional!', { actor: doug, expr: 'scared' });
      doug.walkTo([[doug.pos.x + 3 * fwd.x, doug.pos.z + 3 * fwd.z]], 4, 'walk');
      await S.say('ingrid', 'Clinically speaking... that is extremely interesting.', { actor: ingrid, expr: 'surprised' });
      // Gus bursts out with his shotgun
      gus.visible = true;
      gus.play('aim', 'angry');
      gus.faceTowards(H.pos.x, H.pos.z);
      S.sfx('gun_cock');
      await S.frame(gus, [2.2, 1.0, 2.6], 0.5, 40, 1.1);
      await S.say('gus', 'STAY RIGHT THERE, YOU ROTTEN TURNIP!', { actor: gus, expr: 'angry' });
      H.play('handsup', 'scared');
      H.showEmote('sweat', 3);
      await S.frame(H, [1.8, 1.0, 2.4], 0.4, 40, 1.0);
      await S.say('hank', "WAIT! DON'T SHOOT! I'm just... I'm just *delivering cocoa!*", { actor: H, expr: 'scared' });
      await S.frame(gus, [2.0, 1.0, 2.6], 0.4, 40, 1.1);
      gus.showEmote('question', 2);
      await S.say('gus', '...Cocoa?', { actor: gus, expr: 'surprised' });
      await S.say('gus', 'Is that... *Marguerite\'s* cocoa?', { actor: gus, expr: 'surprised' });
      await S.say('hank', 'Classic. Extra hot. For a... "Gus"?', { actor: H, expr: 'sheepish' });
      gus.play('gun', 'happy');
      await S.say('gus', "Well why in the blue blazes didn't ya say so!", { actor: gus, expr: 'laugh' });
      await S.say('gus', 'Hand it over before it gets cold, ya rattling coat rack.', { actor: gus, expr: 'smug' });
      H.play('offer', 'happy');
      gus.walkTo([[H.pos.x + 1.2 * fwd.x, H.pos.z + 1.2 * fwd.z]], 2);
      await S.wait(1.4);
      const o = g.orders.orderFor('gus');
      if (o) {
        const r = g.orders.deliver(o);
        g.effects.coins(H.pos.x, H.pos.y + 1.2, H.pos.z, 10);
        S.sfx('cash');
        g.ui.toast(`+$${r.pay}${r.tip ? ` (+$${r.tip} tip)` : ''} from Gus`, 'coin');
      }
      gus.play('sip', 'happy');
      for (const a of crowd) a?.play('idle', 'surprised');
      await S.cam(V(meet.x - fwd.z * 6 - fwd.x * 3, bp.y + 2.6, meet.z + fwd.x * 6 - fwd.z * 3), V(meet.x, bp.y + 1, meet.z), 0.8, 52);
      await S.say('doug', '...Technically, being deceased isn\'t against any bylaw I\'m aware of.', { actor: doug, expr: 'sheepish' });
      await S.say('ingrid', 'No pulse at all. Remarkable. Do stop by the clinic sometime. For science.', { actor: ingrid, expr: 'happy' });
      await S.say('marie', "Pah! If he brings Marguerite's cocoa, he can be as dead as he likes! Mine is for the café, mon chou!", { actor: marie, expr: 'happy' });
      await S.say('pip', 'Can you do a WHEELIE?!', { actor: kid, expr: 'laugh' });
      for (const a of crowd) a?.play('cheer', 'happy');
      S.sfx('delivered');
      await S.wait(1.0);
      // everyone goes back home. They've met him now, but only Gus (who got his
      // cocoa) and the kids (who think he's the coolest) are anything like at ease;
      // the rest of the village still has to get used to a skeleton on a bicycle.
      for (const [c, t] of [['gus', 46], ['marie', 24], ['doug', 22], ['ingrid', 26], ['pip', 62], ['pop', 55]]) V2.force(c, t);
      for (const a of cast) {
        a.scripted = false;
        a.play('idle', 'neutral');
        if (a.homePos) a.walkTo([a.homePos], 1.5).then(() => a.face(a.homeYaw));
      }
      g.rider.visible = true;
      this.flag('village1', true);
      g.save();
    });
  }

  // ---------------------------------------------------------------- 5. Poutine
  catRescue() {
    const g = this.g;
    return this.scene(async (S) => {
      const c = POI.catLog;
      const cy = g.physics.groundAt(c.x, c.z).h;
      g.bike.vel.set(0, 0, 0);
      g.rider.visible = false;
      const H = S.actor('hank', c.x + 1.1, c.z + 2.2, 0, 'idle');
      H.faceTowards(c.x, c.z);
      H.yaw = H.targetYaw;
      const cat = voxelPoutine(g);
      cat.setFrame('cat:scared');
      cat.mesh.position.set(c.x + 0.4, cy, c.z);
      g.scene.add(cat.mesh);
      S.temp.push({ remove: () => g.scene.remove(cat.mesh) });
      await S.cam(V(c.x + 3.0, cy + 1.8, c.z + 4.6), V(c.x - 0.3, cy + 0.35, c.z - 0.9), 0, 42);
      S.sfx('meow_sad');
      await S.wait(0.8);
      await S.say('hank', 'Hey there, little buddy. You lost too?', { actor: H, expr: 'neutral' });
      S.sfx('meow', { pitch: 0.8 });
      S.emote('anger', V(c.x + 0.4, cy + 0.8, c.z), 1.6);
      cat.flash = 0.45;
      g.tween(cat.uniforms.uFlash, 'value', 0, 0.35);
      cat.mesh.position.y += 0.15;
      g.tween(cat.mesh.position, 'y', cy, 0.25);
      await S.say('cat', 'HSSSSSSS!', { expr: 'scared' });
      await S.say('hank', 'Yeah... I get that a lot.', { actor: H, expr: 'sheepish' });
      H.play('offer', 'happy');
      await S.say('hank', "I've got one marshmallow. Nana packed an extra. Just in case I... figured out eating.", { actor: H, expr: 'happy' });
      cat.setFrame('cat:sit:side:0');
      S.emote('question', V(c.x + 0.4, cy + 0.8, c.z), 1.4);
      await S.wait(1.4);
      S.sfx('purr');
      S.emote('heart', V(c.x + 0.2, cy + 0.8, c.z), 2);
      // the cat trots over
      for (let k = 0; k < 16; k++) {
        cat.setFrame(`cat:walk:side:${k % 4}`, true);
        cat.mesh.position.lerp(V(H.pos.x + 0.35, cy, H.pos.z), 0.08);
        await S.wait(0.07);
      }
      cat.setFrame('cat:sit:front:2');
      H.faceTowards(c.x + 3.6, c.z + 5.4);
      await S.cam(V(c.x + 4.7, cy + 2.3, c.z + 7.0), V(c.x + 0.7, cy + 0.6, c.z + 1.4), 0.5, 40);
      await S.say('hank', "You don't mind that I'm a little bit dead?", { actor: H, expr: 'surprised' });
      await S.say('cat', 'Mrrp.', { expr: 'happy' });
      await S.say('hank', "Then I'll call you... *Poutine.*", { actor: H, expr: 'happy' });
      S.sfx('meow', { pitch: 1.2 });
      await S.say('cat', 'Mrrrrrp!', { expr: 'love' });
      g.effects.hearts(H.pos.x, H.pos.y + 1.4, H.pos.z, 8);
      this.st.cat = true;
      g.rider.enableCat(true);
      g.rider.visible = true;
      this.flag('catRescued', true);
      g.catEventActive = false;
      g.world.atmosphere.setWeather('overcast');
      g.save();
    }).then(() => g.ui.toast('<b>Poutine</b> joined you! She rides in the basket.', 'cat', 5000));
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
    g.ui.toast(`+$${r.pay}${r.tip ? ` <b>(+$${r.tip} tip!)</b>` : ''} · ${Math.round(r.quality)}% hot`, 'coin');
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
          g.ui.toast(`Nana gave you <b>$20</b> for the ${k.name}.`, 'coin');
        }
        const given = KEEPSAKES.filter((k) => st.keepsakes[k.id] === 'given').length;
        if (given === KEEPSAKES.length && !st.flags.allKeepsakes) {
          st.flags.allKeepsakes = true;
          await g.ui.say('grandma', "That's... all of them. Every last thing he wandered off with.", { expr: 'cry' });
          await g.ui.say('grandma', 'He would have liked you, Hank. Very much.', { expr: 'happy' });
          st.money += 100;
          g.ui.toast('Nana slipped you <b>$100</b> and a very long hug.', 'star');
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
        if (g.orders.carried().length) g.ui.toast(`Packed ${g.orders.carried().length} hot cocoa${g.orders.carried().length > 1 ? 's' : ''}. Go go go!`, 'cocoa');
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
          g.ui.toast("Nana's shopping list is pinned to your note. Moose & Goose is on the boardwalk.", 'basket', 3200);
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
    await this.scene(async (S) => {
      await S.fade(1, 1.2);
      S.music('night');
      await S.wait(0.8);
    });
    g.newDay();
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
      g.ui.banner('THE END', '...of the beginning. Keep delivering!', 6000);
      await S.wait(5);
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
    this.g.ui.toast('Nana (far away): “Hank, dear! Come round to the garage, I want to see you ride!”', 'home', 7000);
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
    if (g.mode !== 'ride') return;
    const st = this.st;
    const p = g.playerPos;
    // first visit to Maple Cove
    if (!st.flags.village1 && Math.hypot(p.x - 130, p.z - 62) < 22) this.villagePanic();
    // Poutine's rescue after the first day's deliveries
    if (st.day === 1 && st.flags.village1 && !st.flags.catRescued && g.orders.pending().length === 0) {
      if (!g.catEventActive) {
        g.catEventActive = true;
        g.world.atmosphere.setWeather('rain');
        g.ui.toast("It's starting to drizzle... and something is meowing near the road home.", 'cat', 6000);
      }
    }
    // Nana calls Hank home at night
    const hr = g.world.atmosphere.hour;
    if (hr > 20.5 && !this.nanaCalled) {
      this.nanaCalled = true;
      g.ui.toast('Nana (far away): “Haaank! It\'s getting dark, dear! Come home!”', 'home', 6000);
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
