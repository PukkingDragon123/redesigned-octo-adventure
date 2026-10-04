// The game director: owns the world, the rider, the day loop, modes and all systems.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { PhysicsWorld } from '../world/collide.js';
import { Bike, STATS } from './bike.js';
import { BikeModel } from './bikeModel.js';
import { ChaseCamera } from './camera.js';
import { G } from '../render/shaderlib.js';
import { SpriteAtlas, Billboard } from '../render/sprites.js';
import { buildSheets } from '../art/sheets.js';
import { VoxelRider } from './rider3d.js';
import { Emotes3D } from './emotes3d.js';
import { Walker } from './walker.js';
import { Interior } from './interior.js';
import { Interactables } from './interact.js';
import { Tricks } from './tricks.js';
import { Quests } from './quests.js';
import { drawTV } from '../world/voxelWorld.js';
import { Effects } from './effects.js';
import { Wildlife } from './wildlife.js';
import { Villagers } from './npcs.js';
import { Contest } from './contest.js';
import { Keepsakes } from './keepsakes.js';
import { Orders } from './orders.js';
import { Cargo } from './cargo.js';
import { Story } from './story.js';
import { Menus } from './menus.js';
import { UI } from '../ui/ui.js';
import { sound } from './sound.js';
import { TouchControls } from '../ui/touch.js';
import { TitleScreen } from '../ui/title.js';
import { Skills, SKILLS } from './skills.js';
import { newState, saveGame, loadGame, loadSettings, saveSettings } from './state.js';
import { riverInfo, forestNoise } from '../world/terrain.js';
import { Grass } from '../world/grass.js';
import { clamp } from '../core/math.js';
import * as L from '../world/layout.js';

const STEP = 1 / 120;
const GAME_MIN_PER_SEC = 2; // in-game minutes per real second while riding

export class Game {
  constructor(pipeline, world, camera, params) {
    this.pipeline = pipeline;
    this.world = world;
    this.camera = camera;
    this.params = params;
    this.scene = world.scene;
    this.time = 0;
    this.acc = 0;
    this.mode = 'boot';
    this.listeners = [];
    this.timers = [];
    this.tweens = [];
    this.sound = sound;
    this.catEventActive = false;
    // a stand-in scene drawn instead of the world ({ render(pipeline) }): the title's running Hank
    this.overrideScene = null;
  }

  // ---------------------------------------------------------------- setup
  init() {
    const W = this.world;
    this.atlas = new SpriteAtlas(2048);
    const ms = buildSheets(this.atlas);
    this.atlas.finalize();
    console.log(`sprites: ${this.atlas.frames.size} frames in ${ms.toFixed(0)}ms`);
    this.physics = W.physics || new PhysicsWorld(W.terrain, W.forest.colliders);
    this.lightPool = W.lightPool;
    this.bike = new Bike(this.physics);
    this.bikeModel = new BikeModel();
    this.scene.add(this.bikeModel.root);
    this.chase = new ChaseCamera(this.camera, this.physics);
    this.emotes = new Emotes3D(this);
    this.rider = new VoxelRider(this, 'hank');
    this.walker = new Walker(this);
    this.onFoot = false;
    this.interact = new Interactables(this);
    this.tricks = new Tricks(this);
    this.quests = new Quests(this);
    this.effects = new Effects(this);
    this.skills = new Skills(this);
    this.listeners.push((e) => this.effects.onBikeEvent(e));
    this.listeners.push((e) => this.onBikeEvent(e));
    this.listeners.push((e) => this.tricks.onBikeEvent(e));
    this.listeners.push((e) => this.skills.event(e));
    this.listeners.push((e) => this.rider.onBikeEvent(e));
    this.hitStop = 0;
    if (this.params.has('assist')) this.assist = this.params.get('assist') !== '0';
    this.wildlife = new Wildlife(this);
    this.sfx = (name, pos, vol = 1) => this.spatial(name, pos, vol);
    this.ui = new UI(this);
    this.touch = new TouchControls(this);
    this.menus = new Menus(this);
    this.orders = new Orders(this);
    this.cargo = new Cargo(this);
    this.listeners.push((e) => this.cargo.onBikeEvent(e));
    this.story = new Story(this);
    this.settings = loadSettings();
    this.state = newState();
    this.contest = new Contest(this);
    this.villagers = new Villagers(this);
    this.keepsakes = new Keepsakes(this);
    this.interior = new Interior(this);
    this.headlamp = this.lightPool.addDynamic({ pos: new THREE.Vector3(), color: [1.0, 0.9, 0.7], radius: 16, intensity: 0, on: false });
    this.applySettings();
    this.bike.reset(L.HOME_SPAWN.x, L.HOME_SPAWN.z, L.HOME_SPAWN.yaw);
    this.chase.snap(this.bike);
    // the first user gesture unlocks audio
    const unlock = () => {
      sound.init();
      this.applySettings();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => (document.hidden ? sound.suspend() : sound.resume()));
    // debug / test entry points
    const auto = this.params.get('auto');
    this.auto = auto ? auto.split(',').map(Number) : null;
    const start = this.params.get('start');
    if (this.params.has('scene')) this.debugScene(this.params.get('scene'));
    else if (start === 'ride' || this.auto || this.params.has('spawn')) this.debugRide();
    else if (start === 'intro') this.startNewGame();
    else this.showTitle();
  }

  // test entry: jump straight into one story beat (?scene=cabinNight|morning|garageReveal|villagePanic|contestScream|carve|catRescue|strayCat|ending)
  async debugScene(name) {
    this.debugRide();
    if (name === 'villagePanic') {
      this.state.flags.village1 = false;
      this.villagers.scaredOfHank = true;
    }
    if (name === 'catRescue') this.state.cat = false;
    if (name === 'contestScream') {
      // a save from before the contest: ride in from the bridge road at mid-morning, the crowd still nervous
      this.state.flags.contestScream = false;
      this.world.atmosphere.hour = 10;
      for (const b of this.villagers.brains) this.villagers.force(b.char, b.cfg.kid ? 50 : 8, true);
      this.villagers.syncState();
      this.bike.reset(84, 46.5, Math.PI / 2 - 0.08);
      this.chase.snap(this.bike);
      return;
    }
    if (name === 'strayCat') {
      // the little stray wandering the road home, Hank riding up from the bridge side
      this.state.cat = false;
      this.state.flags.catRescued = false;
      this.rider.enableCat(false);
      this.story.startCatEvent(true);
      this.bike.reset(-64, 39.4, -Math.PI / 2 + 0.35);
      this.chase.snap(this.bike);
      return;
    }
    if (name === 'loadCargo') {
      for (const o of this.orders.carried()) o.loaded = false;
      this.orders.syncCups();
      await this.loadCargo();
      if (this.mode === 'cutscene') this.beginRide();
      return;
    }
    const fn = this.story[name];
    if (!fn) return;
    if (name === 'morning') await this.story.morning(this.state.day);
    else await fn.call(this.story);
    if (this.mode === 'cutscene') this.beginRide();
  }

  debugRide() {
    this.state = newState();
    this.state.outfit = this.params.get('outfit') || 'hank';
    this.state.flags = { intro: true, cabin: true, bike: true, village1: !this.params.has('panic'), catRescued: true, catIntro: true };
    if (this.params.has('cat')) this.state.cat = true;
    if (this.params.has('day')) this.state.day = parseInt(this.params.get('day'));
    if (this.params.has('money')) this.state.money = parseInt(this.params.get('money'));
    // &skills=max (or a number of tiers per skill) pre-fills Harold's riding notes for testing
    if (this.params.has('skills')) {
      const n = this.params.get('skills') === 'max' ? 3 : parseInt(this.params.get('skills')) || 1;
      const best = {};
      for (const sk of SKILLS) for (const [stat, need] of sk.tiers.slice(0, n)) best[stat] = Math.max(best[stat] || 0, need);
      this.state.skills = { best, tiers: Object.fromEntries(SKILLS.map((sk) => [sk.id, Math.min(n, sk.tiers.length)])), poses: {} };
    }
    this.villagers.scaredOfHank = !this.state.flags.village1;
    this.orders.makeBoard(this.state.day, this.params.has('panic') ? ['gus', 'marie'] : null);
    this.applyBike();
    for (const o of this.orders.board().slice(0, this.bike.stats.capacity)) this.orders.pack(o);
    for (const o of this.orders.carried()) o.loaded = true;
    this.orders.syncCups();
    this.setOutfit(this.state.outfit);
    this.rider.enableCat(!!this.state.cat);
    const sp = this.params.get('spawn')?.split(',').map(Number);
    if (sp) this.bike.reset(sp[0], sp[1], sp[2] ?? 0);
    this.chase.snap(this.bike);
    this.mode = 'ride';
    this.ui.showHUD(true);
    this.quests?.sync();
  }

  // where Hank is, on foot or on the bike
  get playerPos() {
    return this.onFoot ? this.walker.pos : this.bike.pos;
  }
  get playerChar() {
    return this.rider.ch;
  }

  // hop off the bike and walk around
  hopOff() {
    if (this.onFoot || this.bike.speed > 3 || this.bike.crash > 0 || !this.bike.grounded) return false;
    const b = this.bike;
    const side = 0.75;
    const x = b.pos.x + Math.cos(b.yaw) * side, z = b.pos.z - Math.sin(b.yaw) * side;
    const y = this.physics.groundAt(x, z, b.pos.y + 1).h;
    this.walker.place(x, y, z, b.yaw);
    this.onFoot = true;
    this.rider.hopOff(this.walker.pos);
    sound.play('bike_dismount');
    return true;
  }
  hopOn() {
    if (!this.onFoot) return false;
    this.onFoot = false;
    this.rider.hopOn(this.bikeModel);
    this.chase.yaw = this.bike.yaw;
    sound.play('bike_mount');
    return true;
  }
  nearBike(r = 2.4) {
    return this.onFoot && Math.hypot(this.walker.pos.x - this.bike.pos.x, this.walker.pos.z - this.bike.pos.z) < r;
  }

  peekSave() {
    return loadGame();
  }

  // ---------------------------------------------------------------- title & flow
  showTitle() {
    this.mode = 'title';
    this.ui.showHUD(false);
    this.titleT = 0;
    sound.music('title');
    this.title = new TitleScreen(this);
    this.title.show({
      onContinue: () => { this.title = null; this.continueGame(); },
      onNew: () => { this.title = null; this.startNewGame(); },
      onSettings: () => this.menus.settings(),
      onControls: () => this.menus.controls(),
    });
  }

  async startNewGame() {
    sound.init();
    this.mode = 'cutscene';
    this.state = newState();
    this.villagers.scaredOfHank = true;
    this.keepsakes.sync();
    this.applyBike();
    this.setOutfit('hankBuried');
    this.rider.enableCat(false);
    this.orders.makeBoard(1, ['gus', 'marie']);
    await this.story.intro();
    await this.story.cabinNight();
    this.state.day = 1;
    this.state.weather = 'clear';
    this.world.atmosphere.setWeather('clear', true);
    await this.story.morning(1);
    // day 1: the board (Gus & Marie-Claude)
    this.mode = 'menu';
    await new Promise((res) => this.menus.orderBoard(res));
    if (!this.orders.carried().length) for (const o of this.orders.board()) this.orders.pack(o);
    await this.story.garageReveal();
    await this.loadCargo();
    this.beginRide();
  }

  continueGame() {
    sound.init();
    const s = loadGame();
    if (!s) return this.startNewGame();
    this.state = s;
    this.orders.restore(s.orders);
    this.villagers.scaredOfHank = !s.flags.village1;
    this.keepsakes.sync();
    this.applyBike();
    this.setOutfit(s.outfit || 'hank');
    this.rider.enableCat(!!s.cat);
    this.world.atmosphere.hour = clamp(s.hour || 8, 7.5, 21);
    this.world.atmosphere.setWeather(s.weather || 'clear', true);
    this.orders.syncCups();
    this.parkBike();
    this.ui.pop(`Day ${s.day}! Back in the saddle. Well, back on the *bones*.`, { expr: 'happy' });
    this.beginRide();
  }

  beginRide() {
    this.interior?.reset();
    this.quests?.sync();
    this.mode = 'ride';
    this.setBikeVisible(true);
    this.rider.visible = true;
    this.chase.release();
    this.chase.snap(this.bike);
    this.ui.showHUD(true);
    this.pipeline.post.uFade.value = 0;
    this.save();
  }

  newDay() {
    const st = this.state;
    st.day++;
    st.hour = 8.2;
    const s = st.stats;
    s.dayEarned = s.dayTips = s.dayDeliveries = s.dayCrashes = 0;
    s.dayAir = 0;
    st.weather = this.pickWeather(st.day);
    this.world.atmosphere.setWeather(st.weather, true);
    this.orders.makeBoard(st.day);
    this.story.nanaCalled = false;
    this.catEventActive = false;
    this.save();
    this.story.morning(st.day).then(async () => {
      // straight to the board after breakfast, like on the first morning
      this.mode = 'menu';
      await new Promise((res) => this.menus.orderBoard(res));
      if (!this.orders.carried().length) for (const o of this.orders.board().slice(0, this.bike.stats.capacity)) this.orders.pack(o);
      await this.loadCargo();
      this.beginRide();
    });
  }

  // after Nana's order board: Hank carries the picked cups out and packs them into Bessie's crate
  // (a short skippable scene; resolves at once when nothing is waiting to be loaded)
  loadCargo() {
    return this.cargo.load();
  }

  pickWeather(day) {
    const r = Math.random();
    if (day >= 7 && r < 0.2) return 'snow';
    if (r < 0.4) return 'clear';
    if (r < 0.6) return 'breezy';
    if (r < 0.73) return 'misty';
    if (r < 0.85) return 'overcast';
    return 'rain';
  }

  // ---------------------------------------------------------------- helpers used by the story
  wait(s) {
    return new Promise((res) => this.timers.push({ t: s, res }));
  }
  tween(obj, key, to, dur) {
    return new Promise((res) => this.tweens.push({ obj, key, from: obj[key], to, dur: Math.max(1e-3, dur), t: 0, res }));
  }
  setBikeVisible(v) {
    this.bikeModel.root.visible = v;
    this.rider.visible = v;
  }
  parkBike(x = L.HOME_SPAWN.x, z = L.HOME_SPAWN.z, yaw = L.HOME_SPAWN.yaw) {
    this.bike.reset(x, z, yaw);
    this.bikeModel.update(0, this.bike, 0);
  }
  setOutfit(id) {
    this.state.outfit = id;
    this.rider.setOutfit(id);
  }
  // Bessie is the same bike every day (old saves may still carry `upgrades`; they're ignored)
  applyBike() {
    this.bike.stats = { ...STATS };
    this.bike.boostCharges = 0;
    this.orders.syncCups();
  }
  // old names some callers still use
  applyUpgrades() { this.applyBike(); }
  refillBoosts() {}

  // the garage: Harold's riding notes (the Skill Book)
  openSkillBook() {
    if (this.state.flags.masteryReady && !this.state.flags.ending) {
      this.story.ending();
      return;
    }
    if (typeof this.menus.skillBook === 'function') {
      this.openMenu(() => this.menus.skillBook(() => this.resumeFromMenu()));
      sound.play('book_open');
    } else {
      const t = this.skills.total();
      this.ui.pop(`Harold's notes say ${t} marks: ${this.skills.summary()}. Next: ${this.skills.list().find((s) => s.tier < s.maxTier)?.goal || 'nothing! I mastered it all!'}`, { expr: 'think', ms: 6000 });
    }
  }
  save() {
    this.state.hour = this.world.atmosphere.hour;
    this.state.orders = this.orders.list;
    saveGame(this.state);
  }
  resumeFromMenu() {
    if (this.mode === 'menu') this.mode = this.prevMode && this.prevMode !== 'menu' ? this.prevMode : 'ride';
  }
  openMenu(fn) {
    this.prevMode = this.mode;
    this.mode = 'menu';
    fn();
  }

  applySettings() {
    const s = this.settings;
    const px = this.params.has('px') ? parseFloat(this.params.get('px')) : s.pixel;
    if (px !== this.pipeline.pixelScale) {
      this.pipeline.setPixelScale(px);
      this.camera.aspect = this.pipeline.w / this.pipeline.h;
      this.camera.updateProjectionMatrix();
    }
    sound.volumes({ master: s.master, music: s.music, sfx: s.sfx });
    const q = s.quality;
    if (q !== this._quality) {
      this._quality = q;
      const sun = this.world.sun;
      const touch = matchMedia?.('(pointer: coarse)').matches;
      const hi = q === 'high', lo = q === 'low';
      const size = lo ? 1024 : hi && !touch ? 4096 : 2048;
      const P = this.pipeline;
      // high on a desktop supersamples; everything else renders at (or in whole
      // steps below) the screen's own pixels, which keeps it crisp and cheap
      P.supersample = hi && !touch ? 1.5 : 1;
      P.maxDpr = touch ? (hi ? 2 : lo ? 1 : 1.5) : 3;
      P.maxPixels = touch ? (hi ? 2.4e6 : lo ? 0.9e6 : 1.4e6) : lo ? 1.6e6 : q === 'medium' ? 3.2e6 : 5.2e6;
      P.bloom = hi;
      P.rays = hi && !touch;
      P.shadowEvery = hi && !touch ? 1 : lo ? 3 : 2;
      P.resize();
      this.camera.aspect = P.w / P.h;
      this.camera.updateProjectionMatrix();
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      // the water mirror is a whole second scene render: high on desktops only
      this.pipeline.reflections = hi && !touch;
      this.world.voxel?.setBuildingDetail?.(q); // full-detail houses up close (none on low)
      this.world.water.material.uniforms.uReflOn.value = this.pipeline.reflections ? 1 : 0;
      this.world.forest.lodScale = lo ? 0.55 : q === 'medium' ? 0.8 : 1;
      if (this.world.voxelForest) {
        // 3D trees only up close; past that the pixel-art cards carry the forest
        this.world.voxelForest.lodScale = lo ? 0.42 : q === 'medium' ? 0.6 : touch ? 0.8 : 1;
        this.world.voxelForest.last.set(1e9, 0, 1e9);
        const L3 = this.world.voxelForest.f3d?.L;
        if (L3) L3.mid.mesh.castShadow = hi; // the far 3D band adds little to the shadow map
      }
      const grid = lo ? 70 : q === 'medium' ? (touch ? 96 : 120) : touch ? 120 : 150;
      if (this.world.grass.gridN !== grid) {
        this.scene.remove(this.world.grass.mesh);
        this.world.grass = new Grass(this.world.grassMask, { gridN: grid, spacing: 0.42 * (150 / grid) ** 0.35 });
        this.scene.add(this.world.grass.mesh);
      }
    }
    this.chase.distScale = s.camDist;
    this.showFps(s.fps);
  }
  saveSettings() {
    saveSettings(this.settings);
  }
  showFps(on) {
    if (on && !this.fpsEl) {
      this.fpsEl = document.createElement('div');
      Object.assign(this.fpsEl.style, { position: 'fixed', left: '50%', bottom: '4px', transform: 'translateX(-50%)', font: '12px monospace', color: '#ffe08a', zIndex: 50, pointerEvents: 'none' });
      document.body.appendChild(this.fpsEl);
      this.fpsFrames = 0;
      this.fpsT = 0;
    } else if (!on && this.fpsEl) {
      this.fpsEl.remove();
      this.fpsEl = null;
    }
  }

  spatial(name, pos, vol = 1) {
    const d = pos.distanceTo(this.camera.position);
    if (d > 60) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const pan = clamp(pos.clone().sub(this.camera.position).normalize().dot(right), -1, 1);
    sound.play(name, { volume: vol * clamp(1 - d / 60, 0, 1), pan });
  }

  // ---------------------------------------------------------------- controls & interactions
  controls() {
    const zero = { throttle: 0, brake: 0, steer: 0, jump: false, jumpPressed: false, drift: false, leanBack: 0, leanFwd: 0, trick: false, assist: false };
    if (this.mode !== 'ride' || this.ui.dialogueTick || this.ui.menuStack.length || this.onFoot) return zero;
    // riding assists on touch screens: steadier balance, forgiving landings, no slide-outs
    const assist = this.assist ?? (!!this.touch?.on || input.lastDevice === 'touch');
    if (this.auto) {
      const [thr = 1, steer = 0, jumpEvery = 0, drift = 0] = this.auto;
      const t = this.time;
      return {
        ...zero, throttle: thr, steer: steer * Math.sin(t * 0.7), assist,
        jump: jumpEvery > 0 && t % jumpEvery < 0.3, drift: drift > 0 && Math.sin(t * 0.7) > 0.5,
      };
    }
    const swallowed = this.ui.inputSwallowed();
    const lean = input.lean();
    return {
      throttle: input.throttle(),
      brake: input.brake(),
      steer: input.steer(),
      jump: input.down('jump') && !swallowed,
      jumpPressed: input.pressed('jump') && !swallowed,
      drift: input.down('drift'),
      leanBack: lean.back,
      leanFwd: lean.fwd,
      trick: input.down('drift') || !!input.touch.trick,
      assist,
    };
  }

  interactions() {
    const ui = this.ui;
    const b = this.bike;
    const p = this.playerPos;
    const slow = this.onFoot || b.speed < 4;
    let action = null;
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    // inside Nana's cabin only the room's own things are on offer
    if (this.interior?.active) {
      action = this.interior.action();
      ui.prompt(action?.text || null, 'E');
      if (action && !action.passive && input.pressed('interact') && !ui.inputSwallowed()) {
        ui.prompt(null);
        action.fn();
      }
      return;
    }
    if (this.onFoot && this.interior?.nearDoorOutside(p)) action = { text: "Go inside Nana's cabin", fn: () => this.interior.enter() };
    else if (near(L.HOME_SPOTS.porch.x, L.HOME_SPOTS.porch.z, L.HOME_SPOTS.porch.r + 1.5) && slow && !(this.onFoot && this.interior?.nearDoorOutside(p, 3))) action = { text: 'Talk to Nana', fn: () => this.story.homeTalk() };
    else if (near(L.HOME_SPOTS.garage.x, L.HOME_SPOTS.garage.z, L.HOME_SPOTS.garage.r + 1) && slow) action = { text: "Harold's riding notes", fn: () => this.openSkillBook() };
    if (!action) {
      // (scared customers snatch the cup at arm's length, or want it left on the step)
      for (const o of this.orders.carried()) {
        action = this.villagers.deliveryAction(o, p, slow);
        if (action) break;
      }
    }
    if (!action && this.catEventActive) action = this.story.stray?.action(p, slow) || null;
    if (!action) action = this.quests.action(this);
    if (!action) action = this.contest.action(p, slow); // "Carve a pumpkin" at Hank's contest table
    // stop for a chat with whoever is nearby
    if (!action && slow) {
      let best = null, bd = 3.2;
      for (const a of Object.values(this.villagers.actors)) {
        if (!a.visible || a.scripted || !this.quests.canTalk(a)) continue;
        const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        if (d < bd && Math.abs(a.pos.y - p.y) < 2.5) { bd = d; best = a; }
      }
      if (best && best.char !== 'grandma') action = { text: `Chat with ${this.villagerName(best.char)}`, fn: () => this.quests.talk(best) };
    }
    if (!action && this.world.interactables) action = this.world.interactables.nearestAction(this) || null;
    if (!action && this.onFoot && this.nearBike()) action = { text: 'Hop on the bike', fn: () => this.hopOn() };
    if (!action && !this.onFoot && b.speed < 2.5 && b.grounded && b.crash <= 0) action = { text: 'Hop off', fn: () => this.hopOff(), quiet: true };
    ui.prompt(action && !(action.quiet && b.speed > 0.6) ? action.text : null, action?.key || 'E');
    if (action?.passive) return;
    if (action && input.pressed('interact') && !ui.inputSwallowed()) {
      ui.prompt(null);
      action.fn();
    }
  }

  villagerName(char) {
    return { gus: 'Gus', marie: 'Marie-Claude', birdie: 'Captain Birdie', agnes: 'Agnes', doug: 'Constable Doug', ingrid: 'Dr. Ingrid', lou: 'Big Lou', ollie: 'Old Ollie', mo: 'Mo', pip: 'Pip', pop: 'Pop', josee: 'Josée', grandma: 'Nana' }[char] || char;
  }

  compassMarkers() {
    const m = [];
    for (const o of this.orders.carried()) {
      const c = this.villagers.markerFor(o.spot) || L.CUSTOMERS[o.spot];
      m.push({ id: `o${o.id}`, x: c.x, z: c.z, icon: 'cocoa' });
    }
    if (!this.orders.carried().length) m.push({ id: 'home', x: L.POI.cabin.x + 8, z: L.POI.cabin.z, icon: 'home' });
    const cat = this.catEventActive && this.story.stray;
    if (cat) m.push({ id: 'cat', x: cat.pos.x, z: cat.pos.z, icon: 'cat' });
    for (const q of this.quests?.markers() || []) m.push(q);
    const k = this.keepsakes.nearest(this.playerPos);
    if (k && k.d < 80) m.push({ id: 'ks', x: k.it.x, z: k.it.z, icon: 'star' });
    return m;
  }

  objective() {
    if (this.interior?.hint) return this.interior.hint;
    const carried = this.orders.carried().length;
    const board = this.orders.board().length;
    if (this.catEventActive) return this.story.stray?.friendly ? 'The little cat likes me! Scoop her up' : 'A little stray cat is wandering the road home...';
    if (carried) return '';
    if (board) return "More orders on Nana's board";
    return this.world.atmosphere.hour > 17 ? 'All done! Home to bed' : 'All done! Explore or chat';
  }

  // ---------------------------------------------------------------- bike events -> sound, cocoa, stats
  onBikeEvent(e) {
    const st = this.state;
    const b = this.bike;
    const ch = this.chase;
    switch (e.type) {
      case 'jump':
        sound.play('jump', { pitch: 0.85 + (e.power || 1) * 0.2 + Math.random() * 0.1 });
        if (e.perfect) { sound.play('pop', { volume: 0.5, pitch: 1.3 }); ch.punch(3); }
        st.stats.jumps++;
        break;
      case 'land':
        if (e.impact > 6) { sound.play('land_hard'); this.orders.slosh(3); }
        else if (e.impact > 2) sound.play('land', { volume: clamp(e.impact / 6, 0.3, 1) });
        if (e.impact > 7) { ch.shake(Math.min(0.9, e.impact * 0.06)); this.freeze(0.05); this.touch?.buzz?.(25); }
        if (e.airTime > 0.6) {
          st.stats.bestAir = Math.max(st.stats.bestAir, e.airTime);
          st.stats.dayAir = Math.max(st.stats.dayAir || 0, e.airTime);
          if (e.airTime > 1.0) sound.play('squish');
        }
        break;
      case 'perfectLand':
        this.freeze(0.06);
        ch.punch(-6);
        ch.shake(0.25);
        sound.play('combo_ding', { volume: 0.6, pitch: 1.5 + Math.min(6, e.streak) * 0.05 });
        break;
      case 'sketchyLand': sound.play('wobble', { volume: 0.8 }); this.orders.slosh(4); break;
      case 'flip': sound.play('trick_whoosh', { pitch: 0.8 + e.count * 0.1 }); ch.punch(5); break;
      case 'spin': if (e.deg % 360 === 0) sound.play('trick_whoosh', { pitch: 1.1, volume: 0.6 }); break;
      case 'wheelieStart': case 'stoppieStart': sound.play('whoosh', { volume: 0.25, pitch: 0.7 }); break;
      case 'frontSlam': case 'rearSlam':
        sound.play('land', { volume: clamp(e.power / 6, 0.2, 0.7) });
        if (e.power > 4) { this.freeze(0.03); ch.shake(0.2); this.orders.slosh(2); }
        break;
      case 'bump':
        if (!e.rough) { sound.play('wobble', { volume: clamp(e.size * 3, 0.2, 0.7) }); this.orders.slosh(Math.min(3, e.size * 8)); }
        if (e.size > 0.15) ch.shake(0.2);
        break;
      case 'pedalSlip': sound.play('bone_rattle'); sound.play('whoosh', { volume: 0.4, pitch: 1.4 }); break;
      case 'pedalStroke': if (e.rhythm > 0.3) sound.play('footstep_wood', { volume: 0.08 + e.rhythm * 0.14, pitch: 1.5 + e.rhythm * 0.3 }); break;
      case 'dab': sound.play('footstep_stone', { volume: 0.45 }); break;
      case 'crash':
        sound.play('crash');
        // trees shake (and drop leaves) when Hank rides into them; phones buzz
        if (e.tree) this.world.forest?.shake?.(e.tree, clamp(e.impact / 6, 0.6, 1.5));
        this.touch?.buzz?.(e.soft ? [30, 40, 50] : [60, 40, 120]);
        this.orders.slosh(e.soft ? 8 : 15);
        st.stats.crashes++;
        st.stats.dayCrashes = (st.stats.dayCrashes || 0) + 1;
        this.freeze(e.soft ? 0.07 : 0.12);
        ch.punch(-8);
        this.crashGag(e);
        // (onlookers gasp, laugh or run over to help: villagers.onBikeEvent)
        break;
      case 'reassemble': break;
      case 'bonk':
        sound.play('wobble', { volume: 0.6 });
        this.orders.slosh(1);
        if (e.impact > 4) this.freeze(0.04);
        if (e.tree) this.world.forest?.shake?.(e.tree, clamp(e.impact / 7, 0.2, 0.5));
        this.touch?.buzz?.(15);
        break;
      case 'treeBump': this.world.forest?.shake?.(e.tree, clamp(e.impact / 8, 0.1, 0.3)); break;
      case 'gear': sound.play(e.dir > 0 ? 'gear_up' : 'gear_down', { volume: 0.5 }); break;
      case 'driftBoost': sound.play('drift_boost'); break;
      case 'splash': sound.play('splash', { volume: 0.5 }); break;
      case 'sink':
        sound.play('splash');
        this.orders.slosh(25);
        break;
    }
  }

  // impact frames: the action freezes for a few frames on big moments
  freeze(s) {
    if (this.params.has('nofreeze')) return;
    this.hitStop = Math.max(this.hitStop, s);
  }

  // Hank bursts into bones, which zip back together beside the bike
  crashGag(e) {
    this.rider.crash(this.bike, e);
  }
  updateGag() {}

  // Steps graphics down when real frame rate stays low while riding (unless the
  // player picked their own settings). Swiftshader test runs pass ?frames and skip this.
  governQuality() {
    const now = performance.now();
    const pf = this.perf || (this.perf = { t: 0, n: 0, last: now, steps: 0, warm: 0, low: 0 });
    const real = (now - pf.last) / 1000;
    pf.last = now;
    if (!this.settings.autoQuality || this.params.has('frames') || this.mode !== 'ride' || real > 1.5 || document.hidden) return;
    // let shaders warm up first, and only react to slowness that sticks around
    pf.warm += real;
    if (pf.warm < 8) return;
    pf.t += real;
    pf.n++;
    if (pf.t < 5) return;
    const fps = pf.n / pf.t;
    pf.t = pf.n = 0;
    pf.low = fps < 38 ? pf.low + 1 : 0;
    if (pf.low < 2 || pf.steps >= 4) return;
    pf.low = 0;
    const s = this.settings;
    if (s.quality === 'high') s.quality = 'medium';
    else if (s.quality === 'medium') s.quality = 'low';
    else if (s.pixel < 1.5) s.pixel = 1.5; // never drops into the retro pixel look on its own
    else return;
    pf.steps++;
    this.applySettings();
    this.saveSettings();
    this.ui.pop('My bones were lagging, so I eased the graphics a bit. (Settings to change.)', { expr: 'sheepish' });
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    input.update(dt);
    this.governQuality();
    this.time += dt;
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.res();
    for (const tw of this.tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.obj[tw.key] = tw.from + (tw.to - tw.from) * (k * k * (3 - 2 * k));
      if (k >= 1) tw.res();
    }
    this.tweens = this.tweens.filter((tw) => tw.t < tw.dur);
    this.ui.update(dt);
    this.touch.update(dt);

    const busy = this.ui.dialogueTick || this.ui.menuStack.length;
    if (this.mode === 'ride' && !busy) {
      this.world.atmosphere.hour += (dt * GAME_MIN_PER_SEC) / 60;
      const free = !this.ui.inputSwallowed();
      if (free && input.pressed('pause')) this.openMenu(() => this.menus.pause());
      else if (free && input.pressed('map')) this.openMenu(() => this.wrapClose(this.menus.map()));
      else if (free && input.pressed('keepsakes')) this.openMenu(() => this.wrapClose(this.menus.keepsakes()));
      if (input.pressed('bell')) {
        sound.play(this.bike.stats.bellType || 'bell');
        this.villagers.onBell();
      }
      this.interactions();
      if (this.world.atmosphere.hour > 23.6 && !this.forcedHome && !this.interior?.active) this.forceHome();
    } else if (this.mode === 'cutscene' && this.currentScene && input.pressed('pause')) {
      this.currentScene.skip = true;
      this.ui.hideDialogue();
    }
    // (re-check: an interaction above may have just opened a talk or a menu)
    if (this.mode === 'menu' && !(this.ui.dialogueTick || this.ui.menuStack.length)) this.mode = this.prevMode && this.prevMode !== 'menu' ? this.prevMode : 'ride';
    if (this.mode !== 'ride') this.ui.prompt(null);

    const c = this.controls();
    this.ctl = c;
    if (this.onFoot) this.updateWalker(dt);
    // hit-stop: bike, rider and particles hold still for a few frames (the camera keeps shaking)
    const frozen = this.hitStop > 0;
    if (frozen) this.hitStop -= dt;
    const sdt = frozen ? 0 : dt;
    this.acc = Math.min(this.acc + sdt, 0.1);
    let first = true;
    const events = [];
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.mode !== 'title') this.bike.update(STEP, first ? c : { ...c, jumpPressed: false });
      for (const e of this.bike.events) events.push(e);
      first = false;
    }
    // draw Bessie between her last two physics steps (smooth at any frame rate)
    this.bike.lerpView(this.acc / STEP);
    for (const e of events) for (const l of this.listeners) l(e);
    if (this.bike.sinking > 1.4) {
      const s = this.bike.lastSafe;
      this.bike.reset(s.x, s.z, s.yaw);
      this.chase.snap(this.bike);
    }
    if (this.mode === 'ride' && !busy) this.orders.update(dt);

    this.tricks.update(sdt);
    this.skills.update(dt);
    this.bikeModel.update(sdt, this.bike, c.steer);
    this.cargo.update(sdt);
    G.uPlayer.value.copy(this.playerPos);
    if (this.mode === 'title') this.title ? this.title.update(dt) : this.titleCamera(dt);
    else {
      this.interior.update(dt);
      this.chase.walk = this.onFoot;
      this.chase.update(dt, this.onFoot ? this.walker : this.bike, this.mode === 'ride' && !busy ? input.look() : { x: 0, y: 0 });
    }
    this.bikeModel.root.updateMatrixWorld(true);
    this.rider.update(sdt, this.bike, this.bikeModel, this.camera.position);
    this.emotes.update(dt);
    this.interact.update(dt);
    // the porch TV ticks over twice a second
    const tv = this.world.voxel?.tv;
    if (tv && (this._tvT = (this._tvT || 0) + dt) > 0.5 && Math.hypot(this.playerPos.x - tv.x, this.playerPos.z - tv.z) < 40) {
      this._tvT = 0;
      const hr = this.world.atmosphere.hour;
      const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
      const helpers = Object.values(this.villagers.actors).filter((a) => this.quests.offersFor(a.char).length).map((a) => `${this.villagerName(a.char)} needs a hand`);
      drawTV(tv, { time: `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`, weather: this.world.atmosphere.weatherTarget, news: [...helpers, ...(this.orders.board().length ? ['Fresh orders on Nana\'s board'] : [])] });
    }
    this.quests.update(dt);
    if (this.mode === 'ride') this.quests.updateHints(this.villagers);
    this.effects.ps.setViewport(this.pipeline.h, this.camera.fov);
    this.effects.update(sdt, this.camera);
    this.updateSpeedLines();
    this.wildlife.update(dt);
    this.villagers.update(dt);
    this.contest.update(dt);
    this.currentScene?.update(dt);
    this.keepsakes.update(dt);
    this.story.update(dt);
    this.updateLamp();
    this.updateAudio(dt);
    if (this.mode === 'ride' || this.mode === 'menu') {
      this.ui.updateHUD(dt);
      this.ui.setObjective(this.objective());
    }
    if (this.fpsEl) {
      this.fpsFrames++;
      this.fpsT += dt;
      if (this.fpsT > 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsT)} fps · ${this.pipeline.w}x${this.pipeline.h}`;
        this.fpsFrames = 0;
        this.fpsT = 0;
      }
    }
  }

  updateWalker(dt) {
    const free = this.mode === 'ride' && !(this.ui.dialogueTick || this.ui.menuStack.length);
    const sw = this.ui.inputSwallowed();
    const wc = free ? {
      mx: input.moveX(), mz: input.moveY(), run: input.down('drift') || input.touch.run,
      jumpPressed: input.pressed('jump') && !sw, kickPressed: input.pressed('boost') && !sw,
    } : { mx: 0, mz: 0 };
    const W = this.walker;
    const ev = W.update(dt, wc, this.chase.yaw + this.chase.orbitYaw);
    const ch = this.rider.ch;
    for (const e of ev) {
      if (e.type === 'jump') { sound.play('jump_foot'); ch.kick('sq', 1.25); }
      if (e.type === 'land') { sound.play('land_foot', { volume: Math.min(1, e.impact / 8) }); ch.kick('sq', 0.75); }
      if (e.type === 'kick') { ch.play('kick'); ch.animT = 0; if (!this.interior?.active) { this.world.interactables?.kick(W.pos, W.yaw, this); this.wait(0.2).then(() => this.world.forest?.kick?.(W.pos, W.yaw)); } }
    }
  }

  wrapClose(m) {
    const close = m.onBack;
    m.onBack = () => {
      close();
      this.resumeFromMenu();
    };
    for (const b of m.ov.querySelectorAll('.btn')) {
      if (b.textContent.trim() === 'Close') b.addEventListener('click', () => this.resumeFromMenu());
    }
    return m;
  }

  async forceHome() {
    this.forcedHome = true;
    await this.story.scene(async (S) => {
      await S.fade(1, 1.2);
      await S.narrate('Hank got a little lost in the dark... Nana found him by following the sound of rattling bones.');
      this.parkBike();
      this.world.atmosphere.hour = 22;
    });
    this.forcedHome = false;
    this.mode = 'ride';
    this.pipeline.post.uFade.value = 0;
    this.story.endDay();
  }

  titleCamera(dt) {
    this.titleT += dt;
    const t = this.titleT * 0.03;
    const k = (Math.sin(t - Math.PI / 2) + 1) / 2;
    const a = new THREE.Vector3(-64, 12.5, 38), b = new THREE.Vector3(-116, 13.5, 60);
    const pos = a.clone().lerp(b, k);
    const look = pos.clone().add(new THREE.Vector3(-40, 1.5, 16 + Math.sin(t * 0.7) * 6));
    this.chase.cut(pos, look, 55);
    this.chase.apply(dt);
  }

  // anime speed lines when Bessie is really flying (or flipping)
  updateSpeedLines() {
    const b = this.bike;
    const riding = this.mode === 'ride' && !this.onFoot && b.crash <= 0;
    const k = riding ? clamp((b.speed - 8.5) / 4, 0, 1) + (b.boostTime > 0 ? 0.35 : 0) + (!b.grounded && Math.abs(b.airPitchVel) > 3 ? 0.4 : 0) : 0;
    const on = k > 0.04;
    if (on || this._lines) this.effects.speedLines?.(on, clamp(k, 0, 1));
    this._lines = on;
  }

  updateLamp() {
    const night = G.uNight.value > 0.25;
    this.bikeModel.setLamp?.(night);
    const on = !!this.bike.stats.light && night && this.bikeModel.root.visible;
    this.headlamp.on = on;
    if (on) {
      // a point light thrown ~4 m ahead reads as a beam pooling on the road
      const b = this.bike;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      const ax = b.pos.x + fx * 4.2, az = b.pos.z + fz * 4.2;
      this.headlamp.pos.set(ax, Math.max(this.physics.groundAt(ax, az, b.pos.y + 2).h, b.pos.y - 1) + 1.3, az);
      this.headlamp.intensity = 1.7 * G.uNight.value;
    }
  }

  updateAudio(dt) {
    const b = this.bike;
    const riding = this.mode === 'ride' || this.mode === 'menu';
    sound.bike({ speed: riding && b.crash <= 0 ? b.speed : 0, cadence: b.cadence, surface: b.surface, grounded: b.grounded && b.stoppie < 0.1, drifting: b.drifting || b.skidding, freewheel: b.throttleIn < 0.1 && b.speed > 1 });
    const p = this.mode === 'title' ? this.camera.position : b.pos;
    const A = this.world.atmosphere;
    const night = G.uNight.value;
    const r = riverInfo(p.x, p.z);
    const villageD = Math.hypot(p.x - L.POI.village.x, p.z - L.POI.village.z);
    let fireD = 1e9;
    for (const f of this.world.ctx.fires) fireD = Math.min(fireD, f.distanceTo(p));
    sound.ambience({
      forest: clamp(forestNoise(p.x, p.z) * 1.3, 0, 1) * (1 - night * 0.7) * (1 - A.weather.rain * 0.5),
      village: clamp(1 - villageD / 110, 0, 1) * (1 - night * 0.6),
      river: clamp(1 - (r.d - r.w / 2) / 35, 0, 1),
      wind: clamp(A.weather.wind * 0.4 + b.speed * 0.02, 0, 1),
      rain: A.weather.rain,
      fire: clamp(1 - fireD / 18, 0, 1),
      night,
    });
    // music follows place & time
    if (this.mode === 'ride' && !this.ui.dialogueTick) {
      let mood = 'forest';
      if (villageD < 100) mood = 'village';
      if (this.orders.carried().length && villageD >= 100) mood = 'delivery';
      if (A.weather.rain > 0.5) mood = 'rain';
      if (night > 0.6) mood = 'night';
      if (Math.hypot(p.x - L.POI.cabin.x, p.z - L.POI.cabin.z) < 40) mood = night > 0.6 ? 'night' : 'cabin';
      if (mood !== this.mood) {
        this.moodT = (this.moodT || 0) + dt;
        if (this.moodT > 2.5 || !this.mood) {
          this.mood = mood;
          this.moodT = 0;
          sound.music(mood);
        }
      } else this.moodT = 0;
    }
    sound.update(dt);
  }

  focus() {
    return this.mode === 'title' ? this.camera.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(this.camera.quaternion)) : this.playerPos;
  }
}
