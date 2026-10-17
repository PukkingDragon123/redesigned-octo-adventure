// The title screen's little scene: Hank sits in the grass on the knoll above Maple Cove
// (layout.js TITLE_HILL) at golden hour with a steaming mug of Nana's cocoa, sipping now
// and then and looking out over the rooftops. After a few seconds a chickadee flutters in
// and lands on his toque: he freezes, eyes rolling up, then turns his head a little and
// smiles; the bird hops about, chirps and fluffs up, stays a while, then flies off (Hank
// waves it goodbye) and comes back again later.
//
// HillScene owns its own Hank (a VoxelCharacter in the world scene) and drives one bird
// from the wildlife (critters.js) directly; dispose() takes both away again.
import * as THREE from 'three';
import { VoxelCharacter, extendVChar, POSE_KIT } from './vchar.js';
import * as FOOD from '../voxel/models/food.js';
import { P as PX } from '../render/particles.js';
import { G } from '../render/shaderlib.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { meshVox } from '../voxel/mesh.js';
import * as L from '../world/layout.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';

const { arm, leg } = POSE_KIT;
const S = Math.sin;

// ---------------------------------------------------------------- poses
// Sitting in the grass, knees up, the mug in his left hand (the camera's side) and the
// right cupping it. The scene drives it through a few fields on the character: hill.sip
// (0..1, the mug up at the jaw), hill.still (0..1, holding his breath with a bird on his
// head), hill.turn (head turned back over his left shoulder), hill.peek (eyes and brow up),
// hill.wave (0..1 the right hand waving).
// (without a scene driving it, e.g. in tools/charpreview.html, it uses HILL_POSE)
export const HILL_POSE = { sip: 0, still: 0, turn: 0, peek: 0, wave: 0, tiltHead: 0 };
extendVChar({
  poses: {
    hillSit(c, t, T) {
      const h = c.hill || HILL_POSE;
      const sip = h.sip || 0, still = h.still || 0, wave = h.wave || 0;
      const calm = 1 - still * 0.85;
      leg(T, 'L', 1.98, 0.2, 2.3);
      leg(T, 'R', 1.9, 0.12, 2.2);
      T.bodyY = -c.P.hipH + 0.13;
      T.bodyRx -= 0.12; // sat back a little on his tailbone
      T.lean += 0.2 - sip * 0.08 + S(t * 0.45) * 0.015 * calm;
      T.tilt += S(t * 0.31 + 1) * 0.02 * calm;
      // the mug in the left hand, the right cupping it; up to the jaw for a sip
      arm(T, 'L', lerp(0.95, 1.45, sip), 0.06, lerp(1.25, 2.12, sip), lerp(0.42, 0.62, sip));
      if (wave > 0) arm(T, 'R', lerp(0.9, 0.3, wave), lerp(0.02, 2.4, wave), lerp(1.45, 0.4, wave), S(t * 10) * 0.5 * wave);
      else arm(T, 'R', lerp(0.9, 1.2, sip), 0.0, lerp(1.45, 1.75, sip), lerp(0.72, 0.8, sip));
      // (lookComp undoes the nod the look-at would add: with a bird up there only the eyes move)
      T.headX += -0.04 - sip * 0.2 + S(t * 0.27) * 0.04 * calm - (h.peek || 0) * 0.06 + (h.lookComp || 0);
      // a look back over his shoulder turns the shoulders a little too
      const turn = h.turn || 0;
      T.headY += turn * 0.8 + S(t * 0.19 + 2) * 0.12 * calm * Math.max(0, 1 - Math.abs(turn) * 2);
      T.twist += turn * 0.2;
      T.headZ += (h.tiltHead || 0) + S(t * 0.23) * 0.03 * calm;
      T.jaw = sip * 0.12;
    },
  },
});

// ---------------------------------------------------------------- helpers
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const BIRD = 'bluejay';
const BIRD_SCALE = 1.7;
// where the bird stands on the toque, in the head's own space (x to his left): on the knit
// crown, on the camera's side of the floppy tip and the pompom
const PERCH = new THREE.Vector3(0.1, 0.77, 0.05);
const CYCLE = { first: 4.5, gap: 9, fly: 2.8, stay: 13, leave: 3.2 };

// ---------------------------------------------------------------- the scene
export class HillScene {
  constructor(game) {
    this.g = game;
    const T = L.TITLE_HILL;
    const ph = game.physics;
    const y = ph ? ph.groundAt(T.x, T.z, 1e9, 0).h : game.world.terrain.heightAt(T.x, T.z);
    this.spot = new THREE.Vector3(T.x, y, T.z);
    this.yaw = T.yaw;
    const h = (this.hank = new VoxelCharacter(game, 'hank', { x: T.x, z: T.z, y, yaw: T.yaw, anim: 'hillSit', expr: 'neutral' }));
    h.scripted = true;
    h.hill = { sip: 0, still: 0, turn: 0, peek: 0, wave: 0, tiltHead: 0, lookComp: 0 };
    // the mug (in his left hand, so the camera sees it) steams like the cups in Bessie's crate
    const m = FOOD.cocoaClassic();
    this.mugGeo = meshVox(m.vox, { size: m.size, origin: m.origin, jitter: 0.02 });
    this.mug = voxMesh(this.mugGeo, sharedVoxelMaterial());
    this.mug.scale.setScalar(1.15);
    this.mug.userData.upright = true;
    this.mug.userData.held = 'hillMug';
    h.hold(this.mug, 'L');
    if (this.mug && game.effects?.cups) game.effects.cups.push(this.mug);
    this.t = 0;
    this.sipT = 2.2; // next sip
    this.sipK = 0;
    this.bird = null;
    this.phase = 'quiet';
    this.phaseT = 0;
    this.quietFor = CYCLE.first;
    this.ev = [];
    this.camLean = 0; // 0..1: the title camera drifts round to his side while the bird visits
  }

  // ------------------------------------------------------------ the bird
  spawnBird() {
    const C = this.g.critters;
    if (!C || this.bird) return this.bird;
    try {
      const c = C.add(BIRD, this.spot.x, this.spot.z, { y: this.spot.y + 3, anim: 'fly', air: true, despawn: Infinity, maxDraw: 400, scale: BIRD_SCALE, cat: 'titleBird' });
      c.ai = null;
      c.resident = true; // never culled for being far from the (parked) bike
      c.hidden = true;
      c.flyT = 9;
      this.bird = c;
    } catch (e) {
      console.warn('title bird', e);
    }
    return this.bird;
  }

  // a point in the world from Hank's own frame (x to his left, z ahead)
  local(x, y, z, out = _v) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return out.set(this.spot.x + x * c + z * s, this.spot.y + y, this.spot.z - x * s + z * c);
  }

  perchWorld(out) {
    const hp = this.hank.headPiece;
    hp.updateWorldMatrix(true, false);
    return out.copy(PERCH).applyMatrix4(hp.matrixWorld);
  }

  chirp(c, big = false) {
    c.cawK = 1;
    const g = this.g;
    g.sfx?.('chirp', _w.set(c.x, c.y, c.z), big ? 0.55 : 0.4);
    g.effects?.ps.spawn({ x: c.x + (Math.random() - 0.5) * 0.1, y: c.y + 0.22, z: c.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.55, life: 1.3, size: 0.13, size1: 0.17, sprite: PX.note, color: [1, 0.92, 0.7], drag: 0.6, alpha: 0.9, fadeIn: 0.1, flutter: 0.4 });
  }

  // a little heart floats up beside his face when he smiles
  heart() {
    const g = this.g;
    const p = this.local(0.45, 0, 0.2, _v);
    g.effects?.ps.spawn({ x: p.x, y: this.perchWorld(_w).y - 0.25, z: p.z, vy: 0.4, life: 1.5, size: 0.16, size1: 0.2, sprite: PX.heart, color: [1, 0.45, 0.55], drag: 0.5, alpha: 0.95, fadeIn: 0.15, flutter: 0.2 });
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    const h = this.hank, H = h.hill;
    this.phaseT += dt;
    const c = this.bird || this.spawnBird();
    let still = 0, peek = 0, turn = 0, tiltHead = 0, wave = 0, sipOK = true;
    switch (this.phase) {
      case 'quiet': {
        if (c) c.hidden = true;
        if (this.phaseT > this.quietFor && c) this.go('fly');
        break;
      }
      case 'fly': {
        // a fluttering arc in from his left and ahead, braking onto the toque
        const k = clamp(this.phaseT / CYCLE.fly, 0, 1);
        const from = this.local(6.5, 3.4, 7.5, new THREE.Vector3());
        const to = this.perchWorld(new THREE.Vector3());
        const mid = this.local(2.2, 2.9, 1.6, new THREE.Vector3());
        const e = 1 - (1 - k) * (1 - k) * (1 - k) * 0.55 - (1 - k) * 0.45; // fast in, a soft brake at the end
        const u = clamp(e, 0, 1);
        const x = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * mid.x + u * u * to.x;
        const y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * mid.y + u * u * to.y;
        const z = (1 - u) * (1 - u) * from.z + 2 * (1 - u) * u * mid.z + u * u * to.z;
        if (c) {
          if (c.hidden) { c.hidden = false; c.fade = 1; c.fadeIn = true; c.lx = undefined; }
          const dx = x - c.x, dz = z - c.z;
          if (dx * dx + dz * dz > 1e-6) c.yaw = Math.atan2(dx, dz);
          c.x = x; c.y = y; c.z = z; c.bob = 0;
          c.anim = 'fly';
          c.air = true;
          c.flyT = 9;
        }
        if (k >= 1) {
          this.go('perch');
          if (c) { c.anim = 'idle'; c.air = false; c.hopK = 0; c.byaw = 0.9; c.cawK = 0; this.ev = [
            [0.15, () => { c.fluffK = 1; }],
            [1.3, () => this.chirp(c)],
            [2.6, () => { this.heart(); }],
            [3.4, () => this.hop(c, Math.PI)],
            [4.6, () => this.chirp(c, true)],
            [4.85, () => this.chirp(c)],
            [6.2, () => { c.fluffK = 1; }],
            [7.6, () => this.hop(c, -Math.PI)],
            [9.2, () => this.chirp(c)],
            [10.6, () => this.hop(c, 0.5)],
            [11.8, () => this.chirp(c, true)],
          ]; }
        }
        break;
      }
      case 'perch': {
        const u = this.phaseT;
        // he freezes the moment it lands, eyes up; then a slow, careful turn and a smile
        still = 1 - smoothstep(9, 11, u);
        peek = smoothstep(0, 0.3, u) * (1 - smoothstep(8.5, 10, u));
        turn = 1.45 * smoothstep(1.6, 3.0, u) * (1 - smoothstep(8, 10.5, u));
        tiltHead = 0.1 * smoothstep(1.8, 2.8, u) * (1 - smoothstep(8, 10.5, u));
        h.expr = u < 1.9 ? 'surprised' : 'happy';
        sipOK = u > 5.2 && u < 9.5;
        if (c) this.perched(c, dt);
        while (this.ev.length && u >= this.ev[0][0]) this.ev.shift()[1]();
        if (u > CYCLE.stay) {
          this.go('leave');
          if (c) { c.anim = 'fly'; c.air = true; c.flyT = 0; this.chirp(c, true); this.leaveFrom = new THREE.Vector3(c.x, c.y, c.z); }
        }
        break;
      }
      case 'leave': {
        // off past his right shoulder and away over the village; he watches it go and waves
        const k = clamp(this.phaseT / CYCLE.leave, 0, 1);
        const to = this.local(-8, 3.2, 16, new THREE.Vector3());
        const a = this.leaveFrom;
        const e = k * k;
        if (c) {
          const x = lerp(a.x, to.x, e), y = lerp(a.y, to.y, k * (2 - k)), z = lerp(a.z, to.z, e);
          const dx = x - c.x, dz = z - c.z;
          if (dx * dx + dz * dz > 1e-6) c.yaw = Math.atan2(dx, dz);
          c.x = x; c.y = y; c.z = z; c.bob = 0;
          c.flyT += dt;
          if (k > 0.85 && !c.fadeOut) { c.fadeOut = true; }
          if (c.fadeOut) c.fade = Math.min(1, c.fade + dt * 3);
        }
        h.expr = 'happy';
        turn = -0.3 * smoothstep(0, 0.8, k) * (1 - smoothstep(0.75, 1, k));
        wave = smoothstep(0.05, 0.25, k) * (1 - smoothstep(0.7, 0.95, k));
        sipOK = false;
        if (k >= 1) {
          if (c) { c.hidden = true; c.fadeOut = false; }
          this.go('quiet');
          this.quietFor = CYCLE.gap;
        }
        break;
      }
    }
    if (this.phase === 'quiet' && this.phaseT > 2.5) h.expr = 'neutral';
    // sips: slow and easy, now and then (never with a bird about to land)
    this.sipT -= dt;
    if (this.sipT < 0 && this.sipK <= 0 && sipOK && !(this.phase === 'quiet' && this.quietFor - this.phaseT < 2.5)) {
      this.sipK = 0.001;
      this.sipT = 5 + Math.random() * 3;
    }
    let sip = 0;
    if (this.sipK > 0) {
      this.sipK += dt / 2.4;
      sip = Math.sin(clamp(this.sipK, 0, 1) * Math.PI);
      sip = Math.min(1, sip * 1.6);
      if (this.sipK >= 1) this.sipK = 0;
    }
    H.sip = damp(H.sip, sip * (1 - still * 0.6), 6, dt);
    H.still = damp(H.still, still, 8, dt);
    H.peek = damp(H.peek, peek, 10, dt);
    H.turn = damp(H.turn, turn, 2.2, dt);
    H.tiltHead = damp(H.tiltHead, tiltHead, 2.5, dt);
    H.wave = damp(H.wave, wave, 5, dt);
    const lean = this.phase === 'perch' ? 1 - smoothstep(9, 13, this.phaseT) : this.phase === 'fly' ? smoothstep(0.3, 1, this.phaseT / CYCLE.fly) * 0.6 : 0;
    this.camLean = damp(this.camLean, lean, 0.6, dt);
    // the eyes: up at the bird while it sits there, otherwise out over the village
    const up = peek > 0.1;
    h.lookTarget = up ? this.local(0, 6, 1.2, this._lt || (this._lt = new THREE.Vector3())) : null;
    H.lookComp = up ? 0.36 : 0;
    h.update(dt, this.g.camera.position);
    // the grass around him lies flat where he sits (the game pushes it away from the rider,
    // who is parked out of sight)
    G.uPlayer.value.set(this.spot.x, this.spot.y, this.spot.z);
  }

  // the bird on the toque: rides along with every nod, hops about, glances around
  perched(c, dt) {
    const p = this.perchWorld(_w);
    let hopY = 0;
    if (c.hopT > 0) {
      c.hopT -= dt;
      c.hopK = clamp(1 - c.hopT / 0.26, 0, 1);
      c.byaw += c.hopTurn * dt / 0.26;
      hopY = Math.sin(c.hopK * Math.PI) * 0.07;
      c.anim = 'hop';
      if (c.hopT <= 0) { c.anim = 'idle'; c.hopK = 0; }
    }
    c.x = p.x; c.y = p.y; c.z = p.z;
    c.bob = hopY;
    c.yaw = wrapAngle(this.yaw + c.byaw);
  }

  hop(c, turn) {
    c.hopT = 0.26;
    c.hopTurn = turn;
    c.hopK = 0;
  }

  go(phase) {
    this.phase = phase;
    this.phaseT = 0;
  }

  dispose() {
    const g = this.g;
    const cups = g.effects?.cups;
    if (cups && this.mug) {
      const i = cups.indexOf(this.mug);
      if (i >= 0) cups.splice(i, 1);
    }
    this.hank.dispose();
    this.mugGeo.dispose();
    if (this.bird) {
      this.bird.dead = true;
      this.bird.hidden = true;
      this.bird.resident = false;
    }
    this.bird = null;
  }
}
