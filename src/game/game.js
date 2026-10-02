// The game director: owns the world, the rider, the day loop, modes and all systems.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { PhysicsWorld } from '../world/collide.js';
import { Bike } from './bike.js';
import { BikeModel } from './bikeModel.js';
import { ChaseCamera } from './camera.js';
import { G } from '../render/shaderlib.js';
import { SpriteAtlas, Billboard } from '../render/sprites.js';
import { buildSheets } from '../art/sheets.js';
import { VoxelRider } from './rider3d.js';
import { Emotes3D } from './emotes3d.js';
import { Walker } from './walker.js';
import { Interactables } from './interact.js';
import { Tricks } from './tricks.js';
import { Quests } from './quests.js';
import { drawTV } from '../world/voxelWorld.js';
import { Effects } from './effects.js';
import { Wildlife } from './wildlife.js';
import { Villagers } from './npcs.js';
import { Keepsakes } from './keepsakes.js';
import { Orders } from './orders.js';
import { Story } from './story.js';
import { Menus } from './menus.js';
import { UI } from '../ui/ui.js';
import { sound } from './sound.js';
import { TouchControls } from '../ui/touch.js';
import { TitleScreen } from '../ui/title.js';
import { computeStats } from './upgrades.js';
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
    this.listeners.push((e) => this.effects.onBikeEvent(e));
    this.listeners.push((e) => this.onBikeEvent(e));
    this.wildlife = new Wildlife(this);
    this.sfx = (name, pos, vol = 1) => this.spatial(name, pos, vol);
    this.ui = new UI(this);
    this.touch = new TouchControls(this);
    this.menus = new Menus(this);
    this.orders = new Orders(this);
    this.story = new Story(this);
    this.settings = loadSettings();
    this.state = newState();
    this.villagers = new Villagers(this);
    this.keepsakes = new Keepsakes(this);
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

  // test entry: jump straight into one story beat (?scene=cabinNight|morning|garageReveal|villagePanic|catRescue|ending)
  async debugScene(name) {
    this.debugRide();
    if (name === 'villagePanic') {
      this.state.flags.village1 = false;
      this.villagers.scaredOfHank = true;
    }
    if (name === 'catRescue') this.state.cat = false;
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
    if (this.params.has('upgrades')) for (const id of this.params.get('upgrades').split(',')) this.state.upgrades[id] = true;
    this.villagers.scaredOfHank = !this.state.flags.village1;
    this.orders.makeBoard(this.state.day, this.params.has('panic') ? ['gus', 'marie'] : null);
    this.applyUpgrades();
    for (const o of this.orders.board().slice(0, this.bike.stats.capacity)) this.orders.pack(o);
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
    this.applyUpgrades();
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
    this.applyUpgrades();
    this.setOutfit(s.outfit || 'hank');
    this.rider.enableCat(!!s.cat);
    this.world.atmosphere.hour = clamp(s.hour || 8, 7.5, 21);
    this.world.atmosphere.setWeather(s.weather || 'clear', true);
    this.orders.syncCups();
    this.parkBike();
    this.ui.banner(`DAY ${s.day}`, 'Welcome back, Hank', 2200);
    this.beginRide();
  }

  beginRide() {
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
    this.refillBoosts();
    this.story.nanaCalled = false;
    this.catEventActive = false;
    this.save();
    this.story.morning(st.day).then(async () => {
      // straight to the board after breakfast, like on the first morning
      this.mode = 'menu';
      await new Promise((res) => this.menus.orderBoard(res));
      if (!this.orders.carried().length) for (const o of this.orders.board().slice(0, this.bike.stats.capacity)) this.orders.pack(o);
      this.orders.syncCups();
      this.beginRide();
    });
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
  applyUpgrades() {
    const before = this.bike.stats.boostCharges;
    this.bike.stats = computeStats(this.state.upgrades);
    // newly bought boosters come filled
    if (this.bike.stats.boostCharges > before) this.bike.boostCharges = this.bike.stats.boostCharges;
    this.bike.boostCharges = Math.min(this.bike.boostCharges ?? 0, this.bike.stats.boostCharges);
    this.bikeModel.applyUpgrades(this.bike.stats);
    this.orders.syncCups();
  }
  refillBoosts() {
    this.bike.boostCharges = this.bike.stats.boostCharges;
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
      const size = q === 'low' ? 1024 : q === 'medium' ? 1536 : 2048;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      this.pipeline.reflections = q !== 'low';
      this.world.water.material.uniforms.uReflOn.value = q !== 'low' ? 1 : 0;
      this.world.forest.lodScale = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1;
      if (this.world.voxelForest) {
        this.world.voxelForest.lodScale = q === 'low' ? 0.7 : q === 'medium' ? 0.85 : 1.15;
        this.world.voxelForest.last.set(1e9, 0, 1e9);
      }
      const grid = q === 'low' ? 90 : q === 'medium' ? 120 : 150;
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
    const zero = { throttle: 0, brake: 0, steer: 0, jump: false, jumpPressed: false, drift: false, boostPressed: false };
    if (this.mode !== 'ride' || this.ui.dialogueTick || this.ui.menuStack.length || this.onFoot) return zero;
    if (this.auto) {
      const [thr = 1, steer = 0, jumpEvery = 0, drift = 0] = this.auto;
      const t = this.time;
      return {
        throttle: thr, brake: 0, steer: steer * Math.sin(t * 0.7),
        jump: false, jumpPressed: jumpEvery > 0 && Math.floor(t / jumpEvery) !== Math.floor((t - 1 / 30) / jumpEvery),
        drift: drift > 0 && Math.sin(t * 0.7) > 0.5, boostPressed: false,
      };
    }
    const swallowed = this.ui.inputSwallowed();
    return {
      throttle: input.throttle(),
      brake: input.brake(),
      steer: input.steer(),
      jump: input.down('jump') && !swallowed,
      jumpPressed: input.pressed('jump') && !swallowed,
      drift: input.down('drift'),
      boostPressed: input.pressed('boost') && !swallowed,
    };
  }

  interactions() {
    const ui = this.ui;
    const b = this.bike;
    const p = this.playerPos;
    const slow = this.onFoot || b.speed < 4;
    let action = null;
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (near(L.HOME_SPOTS.porch.x, L.HOME_SPOTS.porch.z, L.HOME_SPOTS.porch.r + 1.5) && slow) action = { text: 'Talk to Nana', fn: () => this.story.homeTalk() };
    else if (near(L.HOME_SPOTS.garage.x, L.HOME_SPOTS.garage.z, L.HOME_SPOTS.garage.r + 1) && slow) action = { text: "Harold's garage (upgrades)", fn: () => this.openMenu(() => this.menus.garage(() => this.resumeFromMenu())) };
    if (!action) {
      for (const o of this.orders.carried()) {
        const a = this.villagers.get(o.spot);
        if (!a) continue;
        if (near(a.pos.x, a.pos.z, 4.5) && slow && Math.abs(a.pos.y - p.y) < 2.5) {
          action = { text: `Deliver ${o.label} to ${a.char === 'pip' ? 'Pip & Pop' : this.villagerName(a.char)}`, fn: () => this.story.deliver(o, a) };
          break;
        }
      }
    }
    if (!action && this.catEventActive && near(L.POI.catLog.x, L.POI.catLog.z, 7) && slow) action = { text: 'Investigate the meowing', fn: () => this.story.catRescue() };
    if (!action) action = this.quests.action(this);
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
    return { gus: 'Gus', marie: 'Marie-Claude', birdie: 'Captain Birdie', agnes: 'Agnes', doug: 'Constable Doug', ingrid: 'Dr. Ingrid', lou: 'Big Lou', ollie: 'Old Ollie', mo: 'Mo', pip: 'Pip', pop: 'Pop', grandma: 'Nana' }[char] || char;
  }

  compassMarkers() {
    const m = [];
    for (const o of this.orders.carried()) {
      const c = L.CUSTOMERS[o.spot];
      m.push({ id: `o${o.id}`, x: c.x, z: c.z, icon: 'cocoa' });
    }
    if (!this.orders.carried().length) m.push({ id: 'home', x: L.POI.cabin.x + 8, z: L.POI.cabin.z, icon: 'home' });
    if (this.catEventActive) m.push({ id: 'cat', x: L.POI.catLog.x, z: L.POI.catLog.z, icon: 'cat' });
    for (const q of this.quests?.markers() || []) m.push(q);
    const k = this.keepsakes.nearest(this.playerPos);
    if (k && k.d < 80) m.push({ id: 'ks', x: k.it.x, z: k.it.z, icon: 'star' });
    return m;
  }

  objective() {
    const carried = this.orders.carried().length;
    const board = this.orders.board().length;
    if (this.catEventActive) return 'Something is meowing by the road home...';
    if (carried) return '';
    if (board) return "More orders on Nana's board";
    return this.world.atmosphere.hour > 17 ? 'All done! Home to bed' : 'All done! Explore or chat';
  }

  // ---------------------------------------------------------------- bike events -> sound, cocoa, stats
  onBikeEvent(e) {
    const st = this.state;
    const b = this.bike;
    switch (e.type) {
      case 'jump': sound.play('jump', { pitch: 0.9 + Math.random() * 0.2 }); st.stats.jumps++; break;
      case 'land':
        if (e.impact > 6) { sound.play('land_hard'); this.orders.slosh(3); }
        else if (e.impact > 2) sound.play('land', { volume: clamp(e.impact / 6, 0.3, 1) });
        if (e.airTime > 0.6) {
          st.stats.bestAir = Math.max(st.stats.bestAir, e.airTime);
          st.stats.dayAir = Math.max(st.stats.dayAir || 0, e.airTime);
          if (e.airTime > 1.2) this.ui.tag('air', `${e.airTime.toFixed(1)}s of air!`, b.pos.clone().setY(b.pos.y + 2.4), 1300);
          if (e.airTime > 1.0) sound.play('squish');
        }
        break;
      case 'crash':
        sound.play('crash');
        this.orders.slosh(st.upgrades.thermos ? 8 : 15);
        st.stats.crashes++;
        st.stats.dayCrashes = (st.stats.dayCrashes || 0) + 1;
        this.crashGag();
        // onlookers gasp... then can't help laughing
        for (const a of Object.values(this.villagers.actors)) {
          if (!a.visible || a.scripted || a.pos.distanceTo(b.pos) > 16) continue;
          a.faceTowards(b.pos.x, b.pos.z);
          a.react(this.villagers.scaredOfHank ? 'flinch' : 'gasp');
          if (!this.villagers.scaredOfHank) this.wait(1.0 + Math.random() * 0.5).then(() => a.react('laugh'));
        }
        break;
      case 'reassemble': break;
      case 'bonk': sound.play('wobble', { volume: 0.6 }); this.orders.slosh(1); break;
      case 'gear': sound.play(e.dir > 0 ? 'gear_up' : 'gear_down', { volume: 0.5 }); break;
      case 'boost': sound.play('boost'); sound.play('fizz'); break;
      case 'noBoost': if (b.stats.boostCharges) this.ui.toast('Out of Maple-Cola! It refills at home.', 'cola', 1800); break;
      case 'driftBoost': sound.play('drift_boost'); break;
      case 'glideStart': sound.play('glider'); break;
      case 'splash': sound.play('splash', { volume: 0.5 }); break;
      case 'sink':
        sound.play('splash');
        this.orders.slosh(25);
        this.ui.toast("Glub glub... good thing Hank doesn't need to breathe.", null, 3000);
        break;
    }
  }

  // Hank bursts into bones, which zip back together beside the bike
  crashGag() {
    this.rider.crash(this.bike);
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
    else if (s.pixel < 2) s.pixel = s.pixel < 1 ? 1 : s.pixel < 1.5 ? 1.5 : 2;
    else return;
    pf.steps++;
    this.applySettings();
    this.saveSettings();
    this.ui.toast('Eased the graphics a little for smoother riding (Settings to change).', 'gears', 3500);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    input.update();
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
      if (this.world.atmosphere.hour > 23.6 && !this.forcedHome) this.forceHome();
    } else if (this.mode === 'cutscene' && this.currentScene && input.pressed('pause')) {
      this.currentScene.skip = true;
      this.ui.hideDialogue();
    }
    // (re-check: an interaction above may have just opened a talk or a menu)
    if (this.mode === 'menu' && !(this.ui.dialogueTick || this.ui.menuStack.length)) this.mode = this.prevMode && this.prevMode !== 'menu' ? this.prevMode : 'ride';
    if (this.mode !== 'ride') this.ui.prompt(null);

    const c = this.controls();
    if (this.onFoot) this.updateWalker(dt);
    this.acc = Math.min(this.acc + dt, 0.1);
    let first = true;
    const events = [];
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.mode !== 'title') this.bike.update(STEP, first ? c : { ...c, jumpPressed: false, boostPressed: false });
      for (const e of this.bike.events) events.push(e);
      first = false;
    }
    for (const e of events) for (const l of this.listeners) l(e);
    if (this.bike.sinking > 1.4) {
      const s = this.bike.lastSafe;
      this.bike.reset(s.x, s.z, s.yaw);
      this.chase.snap(this.bike);
    }
    if (this.mode === 'ride' && !busy) this.orders.update(dt);

    this.tricks.update(dt);
    this.bikeModel.update(dt, this.bike, c.steer);
    G.uPlayer.value.copy(this.playerPos);
    if (this.mode === 'title') this.title ? this.title.update(dt) : this.titleCamera(dt);
    else {
      this.chase.walk = this.onFoot;
      this.chase.update(dt, this.onFoot ? this.walker : this.bike, this.mode === 'ride' && !busy ? input.look() : { x: 0, y: 0 });
    }
    this.bikeModel.root.updateMatrixWorld(true);
    this.rider.update(dt, this.bike, this.bikeModel, this.camera.position);
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
    this.effects.update(dt, this.camera);
    this.wildlife.update(dt);
    this.villagers.update(dt);
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
      mx: input.steer(), mz: input.throttle() - input.brake(), run: input.down('drift') || input.touch.run,
      jumpPressed: input.pressed('jump') && !sw, kickPressed: input.pressed('boost') && !sw,
    } : { mx: 0, mz: 0 };
    const W = this.walker;
    const ev = W.update(dt, wc, this.chase.yaw + this.chase.orbitYaw);
    const ch = this.rider.ch;
    for (const e of ev) {
      if (e.type === 'jump') { sound.play('jump_foot'); ch.kick('sq', 1.25); }
      if (e.type === 'land') { sound.play('land_foot', { volume: Math.min(1, e.impact / 8) }); ch.kick('sq', 0.75); }
      if (e.type === 'kick') { ch.play('kick'); ch.animT = 0; this.world.interactables?.kick(W.pos, W.yaw, this); }
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

  updateLamp() {
    const on = !!this.bike.stats.light && G.uNight.value > 0.25 && this.bikeModel.root.visible;
    this.headlamp.on = on;
    if (on) {
      // a point light thrown ~4 m ahead reads as a beam pooling on the road
      const b = this.bike;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      const ax = b.pos.x + fx * 4.2, az = b.pos.z + fz * 4.2;
      this.headlamp.pos.set(ax, Math.max(this.physics.groundAt(ax, az, b.pos.y + 2).h, b.pos.y - 1) + 1.3, az);
      this.headlamp.intensity = (this.bikeModel.isMotor ? 2.2 : 1.7) * G.uNight.value;
    }
  }

  updateAudio(dt) {
    const b = this.bike;
    const riding = this.mode === 'ride' || this.mode === 'menu';
    if (!b.stats.motor) sound.bike({ speed: riding && b.crash <= 0 ? b.speed : 0, cadence: b.cadence, surface: b.surface, grounded: b.grounded, drifting: b.drifting, freewheel: b.throttleIn < 0.1 && b.speed > 1 });
    else sound.bike({ speed: 0 });
    sound.motor({ active: !!b.stats.motor && riding && this.bikeModel.root.visible, rpm: clamp(b.speed / b.stats.topSpeed, 0, 1), throttle: b.throttleIn });
    const p = this.mode === 'title' ? this.camera.position : b.pos;
    const A = this.world.atmosphere;
    const night = G.uNight.value;
    const r = riverInfo(p.x, p.z);
    const villageD = Math.hypot(p.x - L.POI.village.x, p.z - L.POI.village.z);
    const fire = this.world.ctx.fires[0];
    sound.ambience({
      forest: clamp(forestNoise(p.x, p.z) * 1.3, 0, 1) * (1 - night * 0.7) * (1 - A.weather.rain * 0.5),
      village: clamp(1 - villageD / 110, 0, 1) * (1 - night * 0.6),
      river: clamp(1 - (r.d - r.w / 2) / 35, 0, 1),
      wind: clamp(A.weather.wind * 0.4 + b.speed * 0.02, 0, 1),
      rain: A.weather.rain,
      fire: fire ? clamp(1 - fire.distanceTo(p) / 18, 0, 1) : 0,
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
