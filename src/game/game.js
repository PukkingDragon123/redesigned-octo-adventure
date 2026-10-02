// Top-level game: owns the world, the rider and the main loop.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { PhysicsWorld } from '../world/collide.js';
import { Bike } from './bike.js';
import { BikeModel } from './bikeModel.js';
import { ChaseCamera } from './camera.js';
import { G } from '../render/shaderlib.js';
import { SpriteAtlas } from '../render/sprites.js';
import { buildSheets } from '../art/sheets.js';
import { Rider } from './actor.js';
import * as L from '../world/layout.js';

const STEP = 1 / 120;

export class Game {
  constructor(pipeline, world, camera, params) {
    this.pipeline = pipeline;
    this.world = world;
    this.camera = camera;
    this.params = params;
    this.scene = world.scene;
    this.time = 0;
    this.acc = 0;
    this.paused = false;
    this.listeners = [];
  }

  init() {
    const W = this.world;
    this.atlas = new SpriteAtlas(2048);
    const ms = buildSheets(this.atlas);
    this.atlas.finalize();
    console.log(`sprites: ${this.atlas.frames.size} frames in ${ms.toFixed(0)}ms`);
    this.physics = W.physics || new PhysicsWorld(W.terrain, W.forest.colliders);
    W.physics = this.physics;
    this.bike = new Bike(this.physics);
    this.bikeModel = new BikeModel();
    this.scene.add(this.bikeModel.root);
    this.chase = new ChaseCamera(this.camera, this.physics);
    const sp = this.params.get('spawn')?.split(',').map(Number);
    if (sp) this.bike.reset(sp[0], sp[1], sp[2] ?? 0);
    else this.bike.reset(L.HOME_SPAWN.x, L.HOME_SPAWN.z, L.HOME_SPAWN.yaw);
    this.bikeModel.applyUpgrades(this.bike.stats);
    this.rider = new Rider(this, this.params.get('outfit') || 'hank');
    if (this.params.has('cat')) this.rider.enableCat(true);
    this.chase.snap(this.bike);
    // debug autopilot for automated tests: ?auto=throttle,steer,jumpEvery
    const auto = this.params.get('auto');
    this.auto = auto ? auto.split(',').map(Number) : null;
  }

  controls() {
    if (this.auto) {
      const [thr = 1, steer = 0, jumpEvery = 0, drift = 0] = this.auto;
      const t = this.time;
      return {
        throttle: thr, brake: 0, steer: steer * Math.sin(t * 0.7),
        jump: false, jumpPressed: jumpEvery > 0 && Math.floor(t / jumpEvery) !== Math.floor((t - STEP) / jumpEvery),
        drift: drift > 0 && Math.sin(t * 0.7) > 0.5, boostPressed: false,
      };
    }
    return {
      throttle: input.throttle(),
      brake: input.brake(),
      steer: input.steer(),
      jump: input.down('jump'),
      jumpPressed: input.pressed('jump'),
      drift: input.down('drift'),
      boostPressed: input.pressed('boost'),
    };
  }

  update(dt) {
    input.update();
    if (this.paused) return;
    this.time += dt;
    const c = this.controls();
    // fixed-step physics; edge-triggered inputs only on the first substep
    this.acc += dt;
    let first = true;
    const events = [];
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.bike.update(STEP, first ? c : { ...c, jumpPressed: false, boostPressed: false });
      for (const e of this.bike.events) events.push(e);
      first = false;
    }
    this.handleEvents(events);
    this.bikeModel.update(dt, this.bike, c.steer);
    G.uPlayer.value.copy(this.bike.pos);
    this.chase.update(dt, this.bike, input.look());
    this.bikeModel.root.updateMatrixWorld(true);
    this.rider.update(dt, this.bike, this.bikeModel, this.camera.position);
  }

  handleEvents(events) {
    for (const e of events) {
      if (e.type === 'land' && e.impact > 3) this.chase.shake(Math.min(1, e.impact / 10));
      if (e.type === 'crash') this.chase.shake(1);
      if (e.type === 'bonk') this.chase.shake(0.4);
      for (const l of this.listeners) l(e);
    }
    if (this.bike.sinking > 1.4) {
      const s = this.bike.lastSafe;
      this.bike.reset(s.x, s.z, s.yaw);
      this.chase.snap(this.bike);
    }
  }

  focus() {
    return this.bike.pos;
  }
}
