// The tale of Hank: intro, cabin night, breakfasts, the ride into town (the contest
// freezes, scared stiff) and Gus's invitation to carve, Poutine, keepsakes and the ending.
// Plus world triggers. Lines are kept short: a cutscene says what it must in a line or two
// and shows the rest.
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
import { AFTER_COCOA, ROUND_KEYS } from './contest.js';
import { ENTRY, fixedShots, followShot, faceSpot } from './entryShots.js';
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

const LORE = {
  cane: "Harold's cane! Moose antler handle. He just liked pointing with it.",
  spyglass: 'His spyglass! "For deer," he said. It was for the bakery van.',
  pack: 'His hunting pack. Granola bars, no bullets. That was Harold.',
  clock: 'The mantel clock. Stopped at 4:12, the minute he proposed.',
  coat: 'His plaid coat. Still smells of pipe smoke and pine.',
  medbag: "Dr. Ingrid's bag! He 'borrowed' it in 1987. Let's keep it a while.",
  suitcase: 'Our honeymoon suitcase. We never did see Niagara Falls.',
  keys: 'His keys. So HE left Big Lou those muffins!',
  books: 'His pressed leaves. Fifty-one autumns of them.',
  map: 'Harold\'s blueberry map. X marks the beaver dam. Of course.',
  lantern: 'The brass lantern. He walked me home with it every night.',
  bottles: 'Maple syrup, 1979. Do not drink. ...Hank?',
};

const BREAKFAST = {
  1: { food: 'pancakes', lines: [['grandma', "Pancakes! Harold's favourite.", 'happy']], after: [['hank', "Sorry, Nana. There's a hole in me somewhere.", 'sheepish']] },
  2: { food: 'egg', lines: [['grandma', 'Something smaller? A soft egg.', 'neutral']], after: [['hank', 'Same as the pancakes.', 'sheepish']] },
  3: { food: 'bacon', lines: [['grandma', 'Bacon! Nobody says no to bacon.', 'happy']], after: [['cat', 'Mrrp!', 'happy']] },
  4: { food: 'toast', lines: [['grandma', 'Plain toast. What could go wrong?', 'determined']], after: [['grandma', 'Something went wrong with the toast.', 'sad']] },
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
      await S.say('grandma', 'Mind the step, dear. It creaks. So do I.', { actor: N, expr: 'happy' });
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
      await S.say('grandma', 'Come in, out of the cold.', { actor: N, expr: 'happy' });
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
      await S.say('hankBuried', "Oh... it's *warm* in here.", { actor: H, expr: 'happy' });
      await S.faceShot(N, { dist: 2.3, side: 0.6, dur: 0.8 });
      await S.say('grandma', 'Look around, dear. Then sit by the fire.', { actor: N, expr: 'happy' });
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
      await S.say('grandma', "Let's get you warm, dear.", { actor: N, expr: 'happy' });
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
      await S.say('grandma', "Harold's quilt. Forty-one winters of patches.", { actor: N, expr: 'happy' });
      H.play('sitShiver', 'scared');
      S.sfx('jaw_chatter', { volume: 0.6 });
      await S.say('hankBuried', "Th-thank you, ma'am.", { actor: H, expr: 'scared' });
      await S.cam(L(0.6, 2.0, -1.9), L(2.75, 1.25, -2.6), 0.8, 42);
      N.play('talk');
      await S.say('grandma', "Call me Nana. Here: Harold's sweater and his lucky toque.", { actor: N, expr: 'neutral' });
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
      await S.say('hank', "Oh... that's *cozy.*", { actor: H, expr: 'happy' });
      // the famous cocoa
      N.play('offer');
      await S.cam(L(4.05, 1.55, -0.55), L(2.35, 1.0, -1.95), 1.0, 44);
      await S.say('grandma', 'And this is my famous hot cocoa.', { actor: N, expr: 'smug' });
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
      H.play('sit', 'happy');
      await S.say('hank', "...Can't taste it. But it's *warm.* All the way through.", { actor: H, expr: 'sheepish' });
      N.react('laugh');
      await S.cam(L(0.6, 2.0, -1.9), L(2.75, 1.25, -2.6), 0.8, 40);
      const c = await S.say('grandma', "Fancy a job, dear? Delivering my cocoa on Harold's old bike.", { actor: N, expr: 'happy', choices: ["I'd love to!", 'Do I get paid?', 'Will people scream?'] });
      if (c === 1) await S.say('grandma', 'Of course! Tips if it arrives hot.', { actor: N, expr: 'laugh' });
      else if (c === 2) await S.say('grandma', "...At first. Then they'll love you.", { actor: N, expr: 'sheepish' });
      else await S.say('grandma', 'Wonderful!', { actor: N, expr: 'laugh' });
      await S.say('grandma', 'We start at sunrise. ...Do you sleep?', { actor: N, expr: 'surprised' });
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
          ['grandma', 'Soup. Through a straw. Taped to your chest.', 'determined'],
          ['grandma', 'No breakfast today, dear. Have a hug.', 'happy'],
          ['hank', 'I dreamt I could taste things. Terrifying.', 'happy'],
          ['grandma', 'The raccoons line up at breakfast now. They know.', 'smug'],
        ];
        const gg = gags[day % gags.length];
        await S.say(gg[0], gg[1], { expr: gg[2], actor: gg[0] === 'hank' ? H : N });
      }
      if (day === 2) {
        await S.faceShot(N, { dist: 2.0, side: 0.6, dur: 0.6 });
        await S.say('grandma', "Harold's riding notes are in the garage, dear.", { actor: N, expr: 'happy' });
      }
      if (day === 1) await S.say('grandma', 'Two orders to start: Gus and Marie-Claude, in Maple Cove.', { actor: N, expr: 'neutral' });
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
      await S.say('grandma', 'Maple Cove is east, past the bridge. Mind Gus\'s temper.', { actor: N, expr: 'neutral' });
      await S.say('hank', 'Got it. East. Bridge. Temper.', { actor: H, expr: 'determined' });
      g.villagers.setVisible('grandma', true);
      g.rider.visible = true;
      this.flag('bike', true);
    }).then(() => {
      // (the one riding lesson, once)
      if (g.touch?.on) g.ui.pop('Left thumb steers, right thumb spins the *crank*. Follow the cups!', { expr: 'happy', ms: 6000, prio: 'high' });
      else g.ui.pop('[W] [S] in turn to pedal, [A][D] steer, [Space] hop. Follow the cups!', { expr: 'happy', ms: 7000, prio: 'high' });
    });
  }

  // ---------------------------------------------------------------- 4. into town: the contest freezes
  // Hank's first ride into Maple Cove: the pumpkin carving contest is on in the street,
  // packed, Gus mid-announcement through his tin megaphone... and as Bessie rolls in past
  // the corn sheaves, everyone freezes, scared stiff (townEntry, a short cutscene: no
  // screams, nobody runs). Then it's Hank's move, in the game itself: contest.js runs the
  // cocoa round (Hank hands out cups from the carrier Nana sent along; the street stays
  // frozen and frightened until each of them has one), and once the regulars are all
  // warmed up Gus comes over and invites him to carve (contestInvite below).
  //
  // Flags: contestFreeze (set as the street freezes) marks the cutscene as seen; old saves
  // from before the contest get it on their next ride in; saves from mid-round or after it
  // never see it.
  //
  // Test entry points: ?scene=townEntry plays the cutscene from the top; ?scene=villagePanic
  // rides in from the bridge road (the cutscene starts at the corn sheaves);
  // ?scene=cocoaRound starts at the contest, everyone already frozen; ?scene=carveInvite
  // skips to Gus's invitation (then the carving); ?scene=contestScream (game.js) is a save
  // from before the contest riding in.
  townEntry() {
    const g = this.g, K = g.contest, R = K.round;
    if (this.entering) return this.entering;
    // (a test entry, from far off or once it has all happened: start the first arrival over)
    const p = g.playerPos;
    const replay = !R.needsStart() || Math.hypot(p.x - ENTRY.stop.x, p.z - ENTRY.stop.z) > 45;
    this.entering = (async () => {
      if (replay) {
        this.firstArrival({ at: 'road' });
        // a moment for the crowd to turn out (their bodies build in idle time)
        for (let i = 0; i < 40 && K.crowd.building < K.crowd.list.length; i++) await g.wait(0.25);
        await g.wait(0.6);
      }
      await this.scene((S) => this.townEntryShots(S));
      // (skipped, or cut short: the street freezes all the same)
      if (R.needsStart()) K.beginRound();
      g.save();
    })().finally(() => { this.entering = null; });
    return this.entering;
  }
  async townEntryShots(S) {
    const g = this.g, K = g.contest, VL = g.villagers, b = g.bike, E = ENTRY;
    S.keepFrozen = true; // (contest.js: the street stays frozen while the lens is on it)
    const gy = (x, z) => g.physics.groundAt(x, z).h;
    const V3 = (a) => V(a[0], a[1], a[2]);
    // Bessie (Hank aboard) on the road in, just short of the village (a leaf wipe over
    // the jump when he was somewhere else)
    const faded = Math.hypot(g.playerPos.x - E.start.x, g.playerPos.z - E.start.z) > 12;
    if (faded) await S.fade(1, 0.5);
    if (g.onFoot) g.hopOn();
    g.setBikeVisible(true);
    b.reset(E.start.x, E.start.z, E.yaw);
    const y = gy(E.stop.x, E.stop.z);
    const fx = Math.sin(E.yaw), fz = Math.cos(E.yaw);
    // everyone busy at their places; Gus in the middle of the street, megaphone up
    K.stageEntry();
    const gus = VL.get('gus');
    const gs = CONTEST.spots.gus;
    if (gus) {
      gus.scripted = true;
      gus.path = null;
      gus.pos.set(gs.x, gy(gs.x, gs.z), gs.z);
      gus.yaw = gus.targetYaw = Math.atan2(E.start.x - gs.x, E.start.z - gs.z);
      gus.lookAt(null);
      gus.play('announce', 'happy');
      S.temp.push({ remove: () => { gus.scripted = false; } });
    }
    S.music('village');
    // shot 1: rolling in behind Hank, the packed street ahead
    let rolling = true;
    S.every(() => {
      if (!rolling) return true;
      const rem = (E.stop.x - b.pos.x) * fx + (E.stop.z - b.pos.z) * fz;
      const v = rem <= 0.06 || S.skip ? 0 : Math.min(5.2, Math.sqrt(2 * 1.5 * rem));
      b.vel.x = fx * v;
      b.vel.z = fz * v;
      if (v === 0) rolling = false;
      return !rolling;
    });
    const track = S.every(() => {
      const sh = followShot(b.pos, gy(b.pos.x, b.pos.z));
      g.chase.cut(V3(sh.pos), V3(sh.look), sh.fov);
      g.chase.subject = g.playerChar;
      return false;
    });
    if (faded) await S.fade(0, 0.4);
    await S.wait(0.5);
    if (gus && !S.skip) {
      S.sfx('megaphone', { volume: 0.55 });
      gus.brain?.bubble.set(gus.pos.x, gus.pos.y + gus.P.height + 0.35, gus.pos.z);
      if (gus.brain) VL.bubble(gus.brain, 'TEN MINUTES, CARVERS! TEN MIN—', 2000);
      gus.say(1.4);
    }
    for (let t = 0; t < 4 && !S.skip && b.pos.x < E.freezeX; t += 0.05) await S.wait(0.05);
    // ...and the whole street freezes. Silence.
    K.beginRound({ drop: false });
    S.music('none');
    S.sfx('gasp', { volume: 0.45, pitch: 0.85 });
    if (gus) { gus.say(0); K.freezeActor(gus, 'still'); gus.lookAt(g.playerChar); }
    for (let t = 0; t < 3.5 && !S.skip && rolling; t += 0.05) await S.wait(0.05);
    track();
    if (S.skip) b.reset(E.stop.x, E.stop.z, E.yaw);
    b.vel.set(0, 0, 0);
    const H = g.playerChar;
    const shots = fixedShots(y);
    // shot 2: Hank stops; a little wave
    await S.cam(V3(shots.reverse.pos), V3(shots.reverse.look), 0, shots.reverse.fov, H);
    S.sfx('crickets', { volume: 0.5 });
    H.react('hi');
    await S.wait(0.5);
    H.tempExpr('sheepish', 2.5);
    await S.say('hank', '...Uh. Hi, everybody?', { actor: H, expr: 'sheepish' });
    // shot 3: the whole street, frozen, staring
    const W = shots.wide;
    await S.cam(V3(W.pos), V3(W.look), 0, W.fov, V3(W.look));
    S.cam(V3(W.to), V3(W.look), 2.2, W.fov, V3(W.look));
    await S.wait(1.7);
    // the close-ups: whoever the lens can find a clear spot for, from the street
    const people = () => VL.list.filter((a) => a.visible && !a.hiddenByStory).map((a) => ({ x: a.pos.x, z: a.pos.z, a }));
    const close = async (subj, { dist = 2.1, fov = 38, hold = 1.1, mid = null, before = null } = {}) => {
      if (S.skip || !subj?.visible) return false;
      subj.root.updateMatrixWorld(true);
      const head = subj.headWorld(V(0, 0, 0));
      if (mid) { const h2 = mid.headWorld(V(0, 0, 0)); head.lerp(h2, 0.5); }
      const ppl = people().filter((p) => p.a !== subj && p.a !== mid);
      ppl.push({ x: b.pos.x, z: b.pos.z });
      const at = faceSpot(head, g.playerPos, ppl, { dist, ground: gy(head.x, head.z) });
      if (!at) return false;
      await S.cam(V(at.x, at.y, at.z), V(head.x, head.y - 0.12, head.z), 0, fov, subj);
      before?.();
      await S.wait(hold);
      return true;
    };
    // Marie throws her hands up, and the little pumpkin she was holding drops (Agnes beside
    // her, hands flown to her mouth)
    const marie = VL.get('marie'), agnes = VL.get('agnes');
    await close(marie, { dist: 2.9, fov: 40, hold: 1.4, mid: agnes?.visible ? agnes : null, before: () => K.dropPumpkin(marie) });
    // Josée, with Pop hiding behind her, peeking round
    await close(VL.get('josee'), { dist: 2.5, fov: 40, hold: 1.2 });
    // the dog: tucked in behind its owner, whimpering
    const dw = K.crowd.list.find((m) => m.role === 'dog' && m.shown && m.a && m.dog);
    if (dw && !S.skip) {
      const D = dw.dog, ga = gy(D.x, D.z);
      const at = faceSpot({ x: D.x, y: ga + 0.5, z: D.z }, g.playerPos, people().filter((p) => p.a !== dw.a), { dist: 2.2, ground: ga, up: 0.05 });
      if (at) {
        await S.cam(V(at.x, at.y, at.z), V((D.x + dw.a.pos.x) / 2, ga + 0.45, (D.z + dw.a.pos.z) / 2), 0, 44, dw.a);
        VL.sfx('meow_sad', dw.a.pos, 0.4, 1.45);
        D.whimperT = 6;
        await S.wait(1.3);
      }
    }
    // Gus lowers the megaphone... and gulps
    if (gus) {
      await close(gus, { dist: 2.0, fov: 38, hold: 0.35 });
      if (!S.skip) {
        if (gus._freeze) gus._freeze.anim = 'hostWalk';
        await S.wait(0.4);
        gus.react('gulp');
        S.sfx('pop', { volume: 0.5, pitch: 0.45 });
        gus.showEmote('sweat', 1.6);
        await S.wait(1.1);
      }
    }
    // shot: back on Hank; Nana's carrier of cocoa sits in the crate
    const Hs = shots.hank;
    await S.cam(V3(Hs.pos), V3(Hs.look), 0, Hs.fov, H);
    H.tempExpr('sparkle', 3);
    await S.say('hank', "Frozen stiff... Good thing Nana packed extra cocoa!", { actor: H, expr: 'sparkle' });
  }

  firstArrival({ at = 'road' } = {}) {
    const g = this.g, f = this.st.flags;
    for (const k of ['village1', 'contestFreeze', 'cocoaRound', 'contestScream', 'carveIntro']) f[k] = false;
    this.st.cocoaRound = { given: [], crowd: 0 };
    const h = g.world.atmosphere.hour;
    if (h < 9 || h > 16) g.world.atmosphere.hour = 10;
    for (const b of g.villagers.brains) g.villagers.force(b.char, 0, false);
    g.villagers.syncState();
    if (g.onFoot) g.hopOn();
    if (at === 'road') g.bike.reset(84, 46.5, Math.PI / 2 - 0.08);
    else g.bike.reset(CONTEST.entry.x + 3, CONTEST.entry.z + 0.6, Math.PI / 2);
    g.chase.snap(g.bike);
    if (g.mode === 'cutscene') g.mode = 'ride';
  }
  villagePanic() {
    this.firstArrival({ at: 'road' });
  }
  cocoaRound() {
    this.firstArrival({ at: 'contest' });
  }
  // (test entry point) every regular has a cup: Gus comes over
  async carveInvite() {
    const g = this.g, f = this.st.flags;
    this.firstArrival({ at: 'contest' });
    f.village1 = true;
    f.contestFreeze = true;
    f.cocoaRound = true;
    this.st.cocoaRound = { given: ROUND_KEYS.slice(), crowd: 0 };
    for (const [c, t] of Object.entries(AFTER_COCOA)) g.villagers.force(c, t);
    if (g.onFoot) g.hopOn();
    g.bike.reset(127, 49.4, Math.PI / 2);
    g.chase.snap(g.bike);
    await g.wait(1.5);
    await g.contest.inviteGus();
  }

  // Gus, thawed last, has come over: "Well I'll be." He takes his own cup (the order Hank
  // carries for him), announces the late entry and the carving opens
  contestInvite() {
    const g = this.g, C = CONTEST;
    if (this.flag('carveIntro')) return Promise.resolve();
    return this.scene(async (S) => {
      const V2 = g.villagers;
      const gus = V2.get('gus');
      const p = g.playerPos.clone();
      // Hank stands where he is (beside Bessie if he's riding)
      let hx = p.x, hz = p.z;
      if (!g.onFoot) { const f = g.bike.forward(new THREE.Vector3()); hx = p.x + f.z * 0.9; hz = p.z - f.x * 0.9; }
      g.bike.vel.set(0, 0, 0);
      g.rider.visible = false;
      S.temp.push({ remove: () => { g.rider.visible = true; } });
      const H = S.actor('hank', hx, hz, 0, 'idle');
      const y = g.physics.groundAt(hx, hz, p.y + 1).h;
      if (gus) {
        gus.scripted = true;
        gus.path = null;
        gus.brain?.onScripted?.();
        S.temp.push({ remove: () => { gus.scripted = false; gus.lookAt(null); gus.play('hostWalk', 'neutral'); } });
        const dx = gus.pos.x - hx, dz = gus.pos.z - hz, d = Math.hypot(dx, dz);
        if (d > 2.6 || d < 1.2) {
          // (still on his way over? he's here now)
          const ux = d > 0.01 ? dx / d : 1, uz = d > 0.01 ? dz / d : 0;
          gus.pos.set(hx + ux * 1.8, g.physics.groundAt(hx + ux * 1.8, hz + uz * 1.8, y + 1).h, hz + uz * 1.8);
        }
        gus.faceTowards(hx, hz);
        gus.yaw = gus.targetYaw;
        H.faceTowards(gus.pos.x, gus.pos.z);
        H.yaw = H.targetYaw;
        gus.lookAt(H);
        H.lookAt(gus);
        gus.play('hostWalk', 'surprised');
      }
      const G = gus || H;
      const mx = (hx + G.pos.x) / 2, mz = (hz + G.pos.z) / 2;
      const ux = G.pos.x - hx, uz = G.pos.z - hz, ul = Math.hypot(ux, uz) || 1;
      const sx = -uz / ul, sz = ux / ul; // across the pair
      const side = Math.abs(mz + sz * 3 - C.z) < Math.abs(mz - sz * 3 - C.z) ? 1 : -1; // (the lens on the street side)
      await S.cam(V(mx + sx * 3.2 * side, y + 1.7, mz + sz * 3.2 * side), V(mx, y + 1.2, mz), 0, 44);
      if (gus) {
        await S.say('gus', "...Well I'll be.", { actor: gus, expr: 'surprised' });
        await S.faceShot(gus, { dist: 2.2, side: 0.7, dur: 0.5 });
        await S.say('gus', 'A skeleton. At MY contest.', { actor: gus, expr: 'grumpy' });
        await S.frame(H, [0.7 * side, 1.0, 2.4], 0.4, 40, 1.0);
        H.play('offer', 'sheepish');
        const o = g.orders.orderFor('gus');
        if (o) await S.say('hank', "This one's yours. Extra hot.", { actor: H, expr: 'sheepish' });
        if (o) {
          g.orders.deliver(o);
          g.effects.coins(H.pos.x, H.pos.y + 1.2, H.pos.z, 10);
          S.sfx('cash');
        }
        H.play('idle', 'happy');
        gus.play('sip', 'happy');
        S.sfx('sip');
        await S.wait(1.3);
        await S.faceShot(gus, { dist: 2.2, side: 0.7, dur: 0.5 });
        gus.play('hostPoint', 'smug');
        await S.say('gus', 'Hmph. Any skeleton who brings cocoa can carve.', { actor: gus, expr: 'smug' });
        await S.frame(H, [0.7 * side, 1.0, 2.4], 0.4, 40, 1.0);
        H.play('cheer', 'sparkle');
        S.sfx('bone_rattle', { volume: 0.5 });
        await S.say('hank', 'Really?! I used to whittle!', { actor: H, expr: 'sparkle' });
        // through the megaphone, to the whole street: and the street cheers
        gus.faceTowards(C.x, C.z);
        gus.play('announce', 'laugh');
        S.sfx('megaphone', { volume: 0.7 });
        await S.cam(V(G.pos.x - 2.6 * side * sx + (C.x - G.pos.x) * 0.05, y + 1.9, G.pos.z - 2.6 * side * sz), V(C.x, y + 1.2, C.z), 0.6, 54);
        await S.say('gus', 'FOLKS! WE GOT A LATE ENTRY! THE COCOA SKELETON!', { actor: gus, expr: 'laugh' });
        g.contest.cheer(2, { force: true });
        await S.wait(1.6);
        gus.faceTowards(H.pos.x, H.pos.z);
        gus.play('hostWalk', 'neutral');
        await S.faceShot(gus, { dist: 2.2, side: 0.7, dur: 0.5 });
        await S.say('gus', 'Ninety seconds, bones. Impress me.', { actor: gus, expr: 'neutral' });
      }
      V2.force('gus', Math.max(V2.trustOf('gus'), AFTER_COCOA.gus));
      this.flag('carveIntro', true);
      g.save();
    }).then(() => g.contest.carving.start({ intro: false, invited: true }));
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
      g.ui.pop('Is that a little *cat* on the road home?', { expr: 'worried', ms: 3600 });
    }
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
        await S.say('hank', 'Hello again, little shadow.', { actor: H, expr: 'happy' });
        S.sfx('meow', { pitch: 1.2 });
        cat.pose('sit', 'meow');
        await S.say('cat', 'Mrrp!', { expr: 'happy' });
      } else {
        cat.pose('sit');
        S.sfx('meow_sad');
        await S.wait(0.8);
        await S.say('hank', 'Hey, little buddy. Lost too?', { actor: H, expr: 'neutral' });
        cat.pose('arch', 'meow');
        cat.hopT = 0.4;
        S.sfx('cat_hiss');
        S.emote('anger', V(c.x, cy + 0.75, c.z), 1.6);
        await S.say('cat', 'HSSSSSSS!', { expr: 'scared' });
        await S.say('hank', 'Yeah... I get that a lot.', { actor: H, expr: 'sheepish' });
        H.play('offer', 'happy');
        await S.say('hank', 'Marshmallow?', { actor: H, expr: 'happy' });
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
    });
  }

  // ---------------------------------------------------------------- deliveries
  // (customers come to Hank for their cups now, with a bubble, not a talk: npcs.js, walkup.js)

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
        await g.ui.say('hank', "Nana, meet Poutine.", { expr: 'happy' });
        await g.ui.say('grandma', 'Of course it is. Welcome home, Poutine.', { expr: 'laugh' });
      }
      const found = KEEPSAKES.filter((k) => st.keepsakes[k.id] === 'found');
      if (found.length) {
        for (const k of found) {
          st.keepsakes[k.id] = 'given';
          st.money += 20;
          g.sound.play('collect');
          g.effects.coins(N.pos.x, N.pos.y + 1.2, N.pos.z, 6);
          await g.ui.say('grandma', LORE[k.id], { expr: 'happy' });
        }
        const given = KEEPSAKES.filter((k) => st.keepsakes[k.id] === 'given').length;
        if (given === KEEPSAKES.length && !st.flags.allKeepsakes) {
          st.flags.allKeepsakes = true;
          await g.ui.say('grandma', "That's all of them. He'd have liked you, Hank.", { expr: 'cry' });
          st.money += 100;
          g.effects.hearts(N.pos.x, N.pos.y + 1.8, N.pos.z, 8);
          g.effects.coins(N.pos.x, N.pos.y + 1.2, N.pos.z, 12);
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
      const greet = pending === 0 && board === 0 ? 'All done? Well done, dear.' : board > 0 ? 'More orders on the board.' : 'Hello, dear!';
      const ch = await g.ui.say('grandma', greet, { expr: 'happy', choices: opts.map((o) => o[0]) });
      const what = opts[ch][1];
      if (what === 'board') {
        await new Promise((res) => g.menus.orderBoard(res));
        // the cups go out to Bessie's crate, so out of the cabin first
        if (g.orders.carried().length && g.interior?.active) await g.interior.leave();
        await g.loadCargo?.();
        g.refillBoosts();
      } else if (what === 'sleep') {
        await this.endDay();
        return;
      } else if (what === 'shop') {
        const low = Object.entries(st.pantry || {}).filter(([, n]) => n < 2).map(([k]) => k);
        const names = { milk_bottle: 'milk', cocoa_powder: 'cocoa powder', sugar: 'sugar', marshmallows: 'marshmallows', maple_syrup: 'maple syrup', cinnamon: 'cinnamon', mint: 'fresh mint', pumpkin: 'a pumpkin', nutmeg: 'nutmeg', cream: 'cream', coffee_beans: 'coffee beans', dark_chocolate: 'dark chocolate' };
        if (!low.length) await g.ui.say('grandma', "The pantry's full, dear!", { expr: 'happy' });
        else {
          await g.ui.say('grandma', `We're low on ${low.slice(0, 4).map((k) => names[k] || k).join(', ')}. Mo will sort you out!`, { expr: 'happy' });
          g.quests.q('groceries').state = 'active';
          g.sound.play('quest_new');
        }
      } else if (what === 'chat') {
        const chats = [
          ['grandma', 'My knees are singing today. Thank you, dear.', 'happy'],
          ['grandma', 'Harold watched the sunset from the lookout. Go see.', 'neutral'],
          ['grandma', "Find anything of Harold's out there? Bring it home.", 'sad'],
          ['grandma', 'The ramps in the woods? Harold built them. "For the deer."', 'smug'],
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
      await S.say('hank', first ? '*Yaaawn.* Skeletons get sleepy?' : pick(['*Yaaawn.*', '*Yaaawn.* My femurs are humming.']), { actor: H, expr: 'sleepy' });
      H.play('idle');
      await Promise.race([nw, S.wait(3)]);
      if (N.path) { N.path = null; N.pos.copy(L(2.75, 0, 0.1)); }
      N.faceTowards(H.pos.x, H.pos.z);
      H.faceTowards(N.pos.x, N.pos.z);
      H.lookAt(N);
      N.lookAt(H);
      await S.cam(L(1.0, 1.75, -0.3), L(2.85, 1.05, -0.45), 0.8, 44);
      await S.say('grandma', first ? "Harold's flannel pajamas, dear. Freshly washed. Mostly." : 'In you go, dear.', { actor: N, expr: 'happy' });
      // she hands them over...
      N.play('offer');
      await S.wait(0.4);
      N.hold(null);
      H.hold(bundle, 'R');
      H.play('hold', 'surprised');
      N.play('idle');
      await S.wait(0.5);
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
      if (first) await S.say('hank', 'A nightcap with a pompom!', { actor: H, expr: 'happy' });
      else await S.wait(0.6);
      if (first) N.react('laugh');
      await S.faceShot(H, { dist: 2.3, side: 0.5, up: 0.2, dur: 0.5, fov: 42 });
      await S.say('hank', first ? 'Goodnight, Nana. Thank you.' : 'Goodnight, Nana.', { actor: H, expr: 'happy' });
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
      if (first) await S.say('grandma', 'Sleep tight, dear. Mind you wake up.', { actor: N, expr: 'laugh' });
      else await S.wait(0.6);
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
      await S.say('grandma', 'Look at you two. Harold would be so proud.', { actor: N, expr: 'cry' });
      const R = S.actor('reaper', -141.3, 92.5, -0.8, 'float');
      R.floatY = 0.25;
      S.sfx('reaper');
      g.effects.magic(R.pos.x, R.pos.y + 1, R.pos.z, 20, [0.5, 0.4, 0.8]);
      await S.frame(R, [2.4, 0.8, -3], 1, 42, 1.1);
      await S.say('reaper', 'Knock knock! Your paperwork came through, Hank.', { actor: R, expr: 'happy' });
      R.play('clipboard');
      await S.say('reaper', 'You can rest in peace now. Properly.', { actor: R, expr: 'smug' });
      await S.frame(H, [1.6, 1, 2.6], 0.6, 40, 1);
      const c = await S.say('hank', 'Could I get an extension?', { actor: H, expr: 'sheepish', choices: ['"I\'ve got deliveries."', '"Poutine would miss me."', '"Nana needs me."'] });
      void c;
      await S.frame(R, [2.2, 0.8, -2.6], 0.5, 40, 1.1);
      R.showEmote('question', 2);
      await S.say('reaper', "...Is that Marguerite's cocoa?", { actor: R, expr: 'surprised' });
      N.play('offer', 'happy');
      await S.say('grandma', 'Fresh pot. Maple marshmallow.', { actor: N, expr: 'smug' });
      R.play('sip');
      S.sfx('sip');
      await S.wait(1.4);
      await S.say('reaper', '...Fine. Extension granted. A cup every Friday!', { actor: R, expr: 'happy' });
      g.effects.confetti(H.pos.x, H.pos.y + 2, H.pos.z, 60);
      S.sfx('upgrade');
      await S.cam(V(-133.8, y + 6, 86), V(-144.8, y + 1, 95), 3, 50);
      await S.say('hank', 'The end? Nah. Keep the cocoa coming!', { actor: H, expr: 'laugh' });
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
    this.g.ui.pop('Hank, dear! Come show me at the garage!', { who: 'grandma', expr: 'happy', ms: 4000, prio: 'high' });
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
    // (the first visit to Maple Cove, the contest's frozen welcome: contest.js)
    // Poutine wanders the road home once the first day's deliveries are done (and every day after, until she's found)
    if (st.flags.village1 && !st.flags.catRescued && !g.catEventActive && (st.day > 1 || g.orders.pending().length === 0)) this.startCatEvent(st.day === 1);
    // Nana calls Hank home at night
    const hr = g.world.atmosphere.hour;
    if (hr > 20.5 && !this.nanaCalled) {
      this.nanaCalled = true;
      g.ui.pop('Haaank! Home before dark, dear!', { who: 'grandma', expr: 'worried', ms: 3600, prio: 'high' });
    }
    if (this.pendingEnding && g.mode === 'ride') {
      this.pendingEnding = false;
      this.ending();
    }
  }
}
