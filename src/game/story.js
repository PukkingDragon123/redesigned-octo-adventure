// The tale of Hank: intro, cabin night, breakfasts, the village panic, Poutine,
// deliveries, keepsakes and the ending. Plus world triggers.
import * as THREE from 'three';
import { Scene } from './cutscene.js';
import { Billboard } from '../render/sprites.js';
import { Builder } from '../render/builder.js';
import { propMesh } from '../render/propMaterial.js';
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

  // ---------------------------------------------------------------- 1. the intro
  intro() {
    const g = this.g;
    return this.scene(async (S) => {
      const A = g.world.atmosphere;
      g.setBikeVisible(false);
      g.pipeline.post.uFade.value = 1;
      // storybook opening: drifting over the forest at golden hour
      A.hour = 17.9;
      A.setWeather('breezy', true);
      A.cold = 0;
      S.music('title');
      await S.cam(V(-10, 34, 46), V(-110, 16, 30), 0, 50);
      S.cam(V(-55, 26, 38), V(-150, 14, 30), 24, 50);
      S.fade(0, 2.5);
      await S.wait(1.2);
      await S.narrate('Autumn. Somewhere in the wilds of Canada...');
      await S.narrate('Hank was a lumberjack. A good one, mostly. He had just one tiny flaw.');
      await S.narrate('Hank could sleep. Anywhere. Any time. For a ~very, very~ long time.');
      await S.narrate('One afternoon he lay down in the leaves for a quick nap... and nobody could wake him up.');
      await S.fade(1, 1.2);
      // ...that night, at the old cemetery
      A.hour = 23.6;
      A.setWeather('misty', true);
      A.cold = 0.6;
      S.music('spooky');
      const gr = POI.grave;
      const gy = g.physics.groundAt(gr.x, gr.z).h;
      await S.cam(V(gr.x + 4, gy + 1.4, gr.z + 6), V(gr.x, gy + 0.3, gr.z), 0, 45);
      await S.narrate('The village held a lovely funeral. Everyone cried. Hank snored.');
      await S.fade(0, 2.2);
      // snoring from under the dirt
      const zz = S.emote('zzz', V(gr.x, gy + 0.9, gr.z), 6);
      S.sfx('snore');
      await S.wait(1.6);
      S.sfx('snore');
      await S.cam(V(gr.x + 6.5, gy + 2.4, gr.z + 3.5), V(gr.x, gy + 1.2, gr.z), 2.5, 50);
      // the Grim Reaper arrives, clipboard in hand
      const R = S.actor('reaper', gr.x + 2.6, gr.z + 1.6, -2.2, 'clipboard');
      R.groundSnap = true;
      R.floatY = 0.25;
      R.bb.fade = 1;
      // an eerie violet glow travels with him, so the black robe reads against the night
      const glow = g.lightPool.addDynamic({ pos: R.pos.clone().add(V(0.6, 1.6, 0.8)), color: [0.55, 0.45, 1.0], radius: 7, intensity: 1.3 });
      S.temp.push({ remove: () => g.lightPool.removeDynamic(glow) });
      R.faceTowards(gr.x + 6.5, gr.z + 4.8);
      S.sfx('reaper');
      g.effects.magic(R.pos.x, R.pos.y + 1, R.pos.z, 18, [0.5, 0.4, 0.8]);
      for (let k = 0; k <= 10; k++) {
        R.bb.fade = 1 - k / 10;
        await S.wait(0.06);
      }
      R.bb.fade = 0;
      await S.frame(R, [2.5, 0.6, 3.2], 1.2, 40, 1.1);
      await S.say('reaper', 'Right then. Next on the list...', { actor: R });
      await S.say('reaper', 'Hank. Lumberjack. Aged forty-seven. Cause of departure... a *nap?*', { actor: R, expr: 'surprised' });
      R.play('facepalm');
      await S.say('reaper', 'Oh no. Oh no no no no.', { actor: R, expr: 'shock' });
      await S.say('reaper', "You're not due for another *sixty years!* Somebody in Accounting is getting a very stern memo.", { actor: R, expr: 'sheepish' });
      R.play('float');
      await S.say('reaper', "Ahem. Well. This is awkward. I can't exactly un-bury you...", { actor: R, expr: 'sheepish' });
      await S.say('reaper', '...but I can do the next best thing!', { actor: R, expr: 'happy' });
      R.play('point');
      S.sfx('magic');
      for (let k = 0; k < 4; k++) {
        g.effects.magic(gr.x, gy + 0.3 + k * 0.2, gr.z, 16);
        await S.wait(0.25);
      }
      g.pipeline.post.uFlash.value = 0.9;
      g.tween(g.pipeline.post.uFlash, 'value', 0, 0.8);
      g.chase.shake(1);
      // a hand bursts out of the dirt... then the rest of Hank
      S.sfx('dirt');
      g.effects.dirtBurst(gr.x, gy + 0.2, gr.z, 30);
      const H = S.actor('hankBuried', gr.x, gr.z, 0.6, 'crawl');
      H.lockView = 'front';
      H.yOffset = -0.9;
      await S.frame(H, [1.8, 0.9, 2.6], 0.8, 42, 0.4);
      for (let k = 0; k < 12; k++) {
        H.yOffset = -0.9 + (k / 12) * 0.9;
        if (k % 3 === 0) { S.sfx('dirt'); g.effects.dirtBurst(gr.x, gy + 0.1, gr.z, 6); }
        await S.wait(0.12);
      }
      H.yOffset = 0;
      H.lockView = null;
      H.play('shiver', 'scared');
      H.bounce(0.6);
      g.effects.frost(H.pos.x, H.pos.y, H.pos.z, 14);
      S.sfx('brrr');
      await S.frame(H, [1.6, 1.1, 2.8], 0.6, 40, 1.1);
      await S.say('hankBuried', 'B-b-brrr... wh-why is it so c-c-cold?', { actor: H, expr: 'scared' });
      await S.say('hankBuried', 'And why... am I... *all bones?!*', { actor: H, expr: 'shock' });
      R.play('clipboard');
      await S.frame(R, [2.2, 0.8, 3.0], 0.8, 42, 1.1);
      await S.say('reaper', 'Side effects may include: chills, rattling, a slight lack of skin, and being *technically dead.*', { actor: R, expr: 'sheepish' });
      R.play('float');
      await S.say('reaper', "But hey — you're up! Have a wonderful afterlife! Toodles!", { actor: R, expr: 'happy' });
      S.sfx('whoosh');
      for (let k = 0; k < 14; k++) g.effects.ps.spawn({ x: R.pos.x + (Math.random() - 0.5), y: R.pos.y + Math.random() * 2, z: R.pos.z + (Math.random() - 0.5), vy: 0.6, life: 1.6, size: 0.6, size1: 1.6, sprite: P.smoke, color: [0.3, 0.26, 0.36], drag: 1, alpha: 0.85 });
      for (let k = 0; k <= 8; k++) {
        R.bb.fade = k / 8;
        await S.wait(0.05);
      }
      R.visible = false;
      g.lightPool.removeDynamic(glow);
      await S.frame(H, [1.5, 1.0, 2.4], 0.8, 40, 1.1);
      H.faceTowards(R.pos.x, R.pos.z);
      await S.say('hankBuried', '...Toodles?', { actor: H, expr: 'sad' });
      // out through the cemetery gate and down the dark trail
      await S.fade(1, 0.8);
      S.music('night');
      const T = (x, z, up = 0) => V(x, g.physics.groundAt(x, z).h + up, z);
      H.pos.copy(T(-210.4, -25.2));
      H.walkTo([[-208.4, -19.5], [-206.6, -13.6]], 0.85, 'walk+shiver');
      await S.cam(T(-203.2, -8.6, 2.3), T(-208.0, -18.5, 0.7), 0, 46);
      S.fade(0, 1.2);
      await S.narrate('Cold. So very cold. Hank stumbled through the dark woods for what felt like hours...');
      // a warm lantern bobbing up the trail
      const N = S.actor('grandma', -199.8, 6.5, Math.PI + 0.36, 'walk+lantern');
      const lamp = g.lightPool.addDynamic({ pos: N.pos.clone(), color: [1.0, 0.7, 0.35], radius: 9, intensity: 1.4 });
      N.onTick = () => {
        lamp.pos.set(N.pos.x + 0.3, N.pos.y + 1.0, N.pos.z);
        // the lantern itself glows
        g.effects.ps.spawn({ x: N.pos.x + 0.3, y: N.pos.y + 0.75, z: N.pos.z, life: 0.12, size: 0.55, sprite: P.glow, color: [1, 0.72, 0.35], emissive: 1, alpha: 0.5 });
      };
      this.followers = [N];
      const walk = N.walkTo([[-202.6, -2.0], [-205.3, -9.4]], 1.15, 'walk+lantern');
      await S.cam(T(-208.2, -17.6, 2.0), T(-203.6, -4.0, 1.0), 2.0, 44);
      await S.say('grandma', 'Hello? Is someone out there? I heard the most dreadful racket from the cemetery!', { actor: N, expr: 'surprised' });
      await walk;
      if (H.path) { H.path = null; H.pos.copy(T(-206.6, -13.6)); }
      N.play('lantern');
      N.faceTowards(H.pos.x, H.pos.z);
      H.faceTowards(N.pos.x, N.pos.z);
      // two-shot along the trail, over Hank's shoulder
      const mid = H.pos.clone().lerp(N.pos, 0.5);
      await S.cam(V(mid.x - 0.34 * 6.4 + 0.94 * 1.4, mid.y + 3.1, mid.z - 0.94 * 6.4 - 0.34 * 1.4), V(mid.x, mid.y + 0.45, mid.z), 1.2, 42);
      N.jump(2.5);
      await S.say('grandma', 'Goodness gracious!', { actor: N, expr: 'shock' });
      await S.say('grandma', "You're frozen to the bone, dear! Well. You ARE the bone, dear.", { actor: N, expr: 'sad' });
      await S.say('hankBuried', 'I think I might be... dead? A little?', { actor: H, expr: 'sheepish' });
      await S.say('grandma', "Dead or not, nobody freezes on my watch. I was married to a hunter for fifty years — I've seen worse things come out of these woods.", { actor: N, expr: 'smug' });
      await S.say('grandma', 'Come along now. There\'s a fire going, and I make a *famous* hot cocoa.', { actor: N, expr: 'happy' });
      await S.fade(1, 1.4);
      g.lightPool.removeDynamic(lamp);
      this.followers = [];
      this.flag('intro', true);
    });
  }

  // ---------------------------------------------------------------- 2. by the fire
  cabinNight() {
    const g = this.g;
    return this.scene(async (S) => {
      const A = g.world.atmosphere;
      A.hour = 23.9;
      A.setWeather('clear', true);
      A.cold = 0.25;
      g.setBikeVisible(false);
      g.villagers.setVisible('grandma', false);
      S.music('cabin');
      const fire = g.world.ctx.fires[0];
      const fx = fire.x, fz = fire.z;
      // both on the cabin side of the fire, so the glowing windows sit behind them
      const H = S.actor('hankBuried', fx + Math.cos(4.0) * 2.0, fz + Math.sin(4.0) * 2.0, 0.6, 'shiver');
      H.faceTowards(fx, fz);
      const N = S.actor('grandma', fx + Math.cos(5.3) * 2.1, fz + Math.sin(5.3) * 2.1, -0.6, 'idle');
      N.faceTowards(fx, fz);
      H.yaw = H.targetYaw;
      N.yaw = N.targetYaw;
      const fy = g.physics.groundAt(fx, fz).h;
      await S.cam(V(fx + 0.6, fy + 1.7, fz + 5.0), V(fx - 0.1, fy + 0.9, fz - 1.4), 0, 45);
      await S.fade(0, 1.6);
      await S.say('grandma', 'There we are. Sit close, dear. Get that fire into you.', { actor: N, expr: 'happy' });
      await S.say('grandma', 'Here — these were my Harold\'s. His good sweater, and his lucky toque.', { actor: N, expr: 'neutral' });
      N.play('offer');
      await S.wait(0.6);
      // outfit change, ta-da!
      S.sfx('magic');
      g.effects.magic(H.pos.x, H.pos.y + 1, H.pos.z, 20, [1, 0.85, 0.5]);
      g.effects.confetti(H.pos.x, H.pos.y + 1.4, H.pos.z, 24);
      H.char = 'hank';
      H.bounce(0.5);
      H.play('idle', 'happy');
      g.setOutfit('hank');
      N.play('idle');
      await S.frame(H, [0.9, 0.7, 2.6], 0.6, 38, 1.0);
      await S.say('hank', 'Oh... oh, that\'s *cozy.*', { actor: H, expr: 'happy' });
      await S.say('grandma', "Harold was a hunter. A terrible one. Fifty years and he never hit a single thing. Too soft-hearted.", { actor: N, expr: 'laugh' });
      N.play('offer');
      await S.say('grandma', 'And this... is my famous hot cocoa. Fifty years, and not one complaint.', { actor: N, expr: 'smug' });
      H.play('sip');
      S.sfx('sip');
      await S.wait(1.4);
      await S.say('hank', '...I can\'t taste a thing.', { actor: H, expr: 'sad' });
      await S.say('hank', 'But it\'s *warm.* I can feel it all the way down.', { actor: H, expr: 'happy' });
      H.play('idle', 'happy');
      N.play('idle');
      await S.say('grandma', 'Now then. Tell me — can you feel the cold, dear?', { actor: N, expr: 'neutral' });
      await S.say('hank', 'Not anymore. Not... really anything, actually.', { actor: H, expr: 'neutral' });
      await S.say('grandma', 'Perfect. Then I have a proposition for you.', { actor: N, expr: 'smug' });
      await S.say('grandma', "My cocoa keeps half of Maple Cove going through the autumn, and my knees aren't what they used to be.", { actor: N, expr: 'neutral' });
      const c = await S.say('grandma', "How would you like a job? Delivering cocoa. Harold's old bicycle is just sitting in the garage.", { actor: N, expr: 'happy', choices: ["I'd love to!", 'Do I get paid?', 'Will people scream at me?'] });
      if (c === 1) await S.say('grandma', 'Of course you do! And tips, if it arrives hot.', { actor: N, expr: 'laugh' });
      else if (c === 2) await S.say('grandma', '...Probably. At first. They\'ll come around. Everybody loves cocoa.', { actor: N, expr: 'sheepish' });
      else await S.say('grandma', 'Wonderful!', { actor: N, expr: 'laugh' });
      await S.say('grandma', 'We start at sunrise. Sleep well, dear. ...Do you sleep?', { actor: N, expr: 'surprised' });
      await S.say('hank', 'Oh, I *sleep.* That\'s how I got into this mess.', { actor: H, expr: 'sheepish' });
      await S.fade(1, 1.4);
      g.villagers.setVisible('grandma', true);
      this.flag('cabin', true);
      A.cold = 0;
    });
  }

  // ---------------------------------------------------------------- 3. mornings
  morning(day) {
    const g = this.g;
    return this.scene(async (S) => {
      const A = g.world.atmosphere;
      A.hour = 8.2;
      A.cold = 0;
      g.setBikeVisible(true);
      g.parkBike();
      g.rider.visible = false;
      S.music('cabin');
      g.ui.banner(`DAY ${day}`, weatherLine(g.state.weather, day), 2800);
      S.sfx('day_start');
      const b = BREAKFAST[day];
      // breakfast in the yard, with the porch and Nana's sign behind
      const tx = -165.2, tz = 68.2;
      const ty = g.physics.groundAt(tx, tz).h;
      const table = this.table || (this.table = makeTable(g, tx, ty, tz));
      table.visible = true;
      // breakfast on the table, steaming hot (Hank's plate and Nana's cocoa)
      const plate = b ? voxelFood(g, FOOD[FOOD_FOR[b.food] || 'pancakes'], tx - 0.3, ty + 0.77, tz, Math.PI / 2) : voxelFood(g, FOOD.soupBowl, tx - 0.3, ty + 0.77, tz);
      const mug = voxelFood(g, FOOD.cocoaMaple, tx + 0.28, ty + 0.77, tz + 0.18, -1.2);
      this.steamers = [...plate.steam, ...mug.steam];
      S.temp.push({ remove: () => { g.scene.remove(plate.mesh); g.scene.remove(mug.mesh); this.steamers = []; } });
      g.villagers.setVisible('grandma', false);
      const H = S.actor('hank', tx - 0.85, tz, Math.PI / 2, 'sit');
      const N = S.actor('grandma', tx + 0.25, tz + 1.05, Math.PI, 'idle');
      H.yaw = H.targetYaw;
      N.yaw = N.targetYaw;
      let cat = null;
      if (g.state.cat) {
        cat = voxelPoutine(g);
        cat.mesh.position.set(tx + 0.1, ty, tz - 0.95);
        g.scene.add(cat.mesh);
        S.temp.push({ remove: () => g.scene.remove(cat.mesh) });
      }
      await S.cam(V(tx + 7.0, ty + 2.5, tz + 1.5), V(tx - 0.7, ty + 0.5, tz + 0.2), 0, 40);
      await S.fade(0, 1.2);
      if (b) {
        for (const [who, text, expr] of b.lines) await S.say(who, text, { expr, actor: who === 'hank' ? H : N });
        // close on Hank for the big bite...
        const wide = [g.chase.pos.clone(), g.chase.look.clone()];
        await S.cam(V(tx + 2.7, ty + 1.65, tz - 2.4), V(tx - 0.85, ty + 0.8, tz), 0.5, 40);
        H.play('eat');
        await S.wait(0.8);
        // ...and the food falls straight through him
        S.sfx('food_fall');
        const toCam = g.camera.position.clone().sub(H.pos).setY(0).normalize().multiplyScalar(0.3);
        // bites of the real voxel food tumble through his ribs
        const bites = fragmentVox(plate.res.vox, 4, Vox).filter((f) => f.n > 6).slice(0, 3);
        for (let k = 0; k < 3; k++) {
          const f = bites[k % Math.max(1, bites.length)];
          if (f) {
            const m = voxMesh(meshVox(f.vox, { size: plate.res.size, origin: [f.vox.w / 2, f.vox.h / 2, f.vox.d / 2] }), sharedVoxelMaterial());
            this.dropMesh(m, V(H.pos.x + toCam.x, ty + 1.2 - k * 0.06, H.pos.z + toCam.z), V((Math.random() - 0.5) * 0.5, -0.4, (Math.random() - 0.5) * 0.5));
          } else this.drop(`food:${b.food}`, V(H.pos.x + toCam.x, ty + 1.2 - k * 0.06, H.pos.z + toCam.z), V(0, -0.4, 0), 1.2);
          await S.wait(0.22);
        }
        plate.mesh.scale.setScalar(0.7);
        await S.wait(0.5);
        S.sfx('plate');
        H.play('sit', 'sheepish');
        H.showEmote('sweat', 2.2);
        N.showEmote('question', 2.2);
        await S.wait(1.2);
        await S.cam(wide[0], wide[1], 0.6, 40);
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
        await S.say('grandma', 'Oh! And with what you earned yesterday, you could fix up Harold\'s bike in the garage. He\'d have loved that.', { actor: N, expr: 'happy' });
      }
      await S.say('grandma', day === 1 ? 'Now, the orders are pinned on the board. Two to start — Gus and Marie-Claude, down in Maple Cove.' : "Today's orders are on the board, dear. Bundle up! ...Out of habit.", { actor: N, expr: 'neutral' });
      await S.fade(1, 0.5);
      table.visible = false;
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
      g.ui.toast('<span class="key">W</span> pedal · <span class="key">A</span><span class="key">D</span> steer · <span class="key">Space</span> hop · <span class="key">Shift</span> drift', null, 7000);
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
      // everyone goes back home
      V2.scaredOfHank = false;
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
      await S.say('grandma', "Look at her. Harold's motorbike, purring like a kitten. He'd be so proud of you, dear.", { actor: N, expr: 'cry' });
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

  onUpgrade(u) {
    if (u.id === 'motor' && !this.flag('ending')) {
      this.pendingEnding = true;
    }
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

function makeTable(g, x, y, z) {
  const B = new Builder();
  B.box([0, 0.72, 0], [1.1, 0.06, 0.8], { tile: 'planks', tileMeters: 2.5 });
  for (const [a, b] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) B.box([a, 0.36, b], [0.07, 0.72, 0.07], { color: 0x6a4428 });
  B.box([-0.85, 0.42, 0], [0.4, 0.06, 0.45], { color: 0x8a5a30 });
  B.box([0, 0.76, 0], [0.8, 0.01, 0.55], { color: 0xc8361f });
  for (const [a, b] of [[-0.25, 0], [0.25, 0.1]]) B.tube([a, 0.76, b], [a, 0.79, b], 0.13, 0.13, { color: 0xf4f0e6 }, 10);
  B.tube([0.05, 0.76, -0.2], [0.05, 0.86, -0.2], 0.04, 0.045, { color: 0xf4ecdc }, 7);
  const m = propMesh(B.build(), g.world.propMat);
  m.position.set(x, y, z);
  g.scene.add(m);
  return m;
}
