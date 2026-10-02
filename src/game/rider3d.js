// Hank on the bike as a real voxel character: hips on the saddle, hands on the
// grips and feet on the pedals (IK), leaning with the bike. Crashes make him
// burst into bones that zip back together next to the bike.
import * as THREE from 'three';
import { VoxelCharacter } from './vchar.js';
import { Billboard } from '../render/sprites.js';

const _v = new THREE.Vector3();

export class VoxelRider {
  constructor(game, charId = 'hank') {
    this.game = game;
    this.visible = true;
    this.cat = null;
    this.mounted = true;
    this.make(charId);
  }

  make(id) {
    if (this.ch) this.ch.dispose();
    this.char = id;
    this.ch = new VoxelCharacter(this.game, id, { y: 0 });
    this.ch.groundSnap = false;
    this.ch.onReassembled = () => {
      this.reassembled = true;
      this.game.sound?.play('reassemble');
    };
    this.mounted = false;
    this.wantMount = true;
  }

  setOutfit(id) {
    if (id !== this.char) this.make(id);
  }

  get mesh() { return this.ch.root; }

  enableCat(on) {
    if (on && !this.cat) {
      this.cat = new Billboard(this.game.atlas, 'cat:basket:back:0', { castShadow: false, upright: 0.85 });
      this.game.scene.add(this.cat.mesh);
      this.catT = 0;
    }
    if (this.cat) this.cat.mesh.visible = on;
    this.catOn = on;
  }

  mount(model) {
    const ch = this.ch;
    const bike = !model.isMotor;
    ch.mount({
      seat: model.rider,
      gripL: bike ? model.gripL : null, gripR: bike ? model.gripR : null,
      pedalL: bike ? model.pedals[0] : null, pedalR: bike ? model.pedals[1] : null,
      armW: bike ? 1 : 0, legW: bike ? 1 : 0,
    });
    this.mounted = true;
    this.isMotor = model.isMotor;
  }
  dismount() {
    this.ch.mount(null);
    this.mounted = false;
  }

  // hop between the saddle and the ground with a little arc
  hopOff(target) {
    const ch = this.ch;
    ch.root.updateMatrixWorld(true);
    const from = ch.root.position.clone();
    this.dismount();
    this.onFoot = true;
    this.hop = { t: 0, dur: 0.32, from, to: target, off: true };
    ch.play('idle');
  }
  hopOn(model) {
    const ch = this.ch;
    this.hop = { t: 0, dur: 0.3, from: ch.pos.clone(), model, off: false };
    this.onFoot = false;
    ch.play('air');
  }
  updateHop(dt) {
    const H = this.hop, ch = this.ch;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    const e = k * k * (3 - 2 * k);
    const to = H.off ? H.to : H.model.rider.getWorldPosition(_v);
    ch.groundSnap = false;
    ch.pos.lerpVectors(H.from, to, e);
    ch.pos.y += Math.sin(k * Math.PI) * 0.45;
    if (k >= 1) {
      this.hop = null;
      if (H.off) { ch.groundSnap = true; ch.kick('sq', 0.72); }
      else { this.mount(H.model); ch.kick('sq', 0.8); }
    }
  }

  // the bike crashed: bones everywhere
  crash(bike) {
    const ch = this.ch;
    if (ch.broken) return;
    this.dismount();
    // stand the (empty) rig up beside the bike so the bones gather into a standing Hank
    const side = Math.random() < 0.5 ? 1 : -1;
    ch.pos.set(bike.pos.x + Math.cos(bike.yaw) * 0.9 * side, bike.pos.y, bike.pos.z - Math.sin(bike.yaw) * 0.9 * side);
    ch.groundSnap = true;
    ch.yaw = ch.targetYaw = bike.yaw;
    ch.play('idle');
    ch.update(0.001, this.game.camera.position);
    ch.explode(_v.copy(bike.vel).multiplyScalar(0.8).setY(1));
    ch.broken.auto = false;
    this.reassembled = false;
    this.crashed = true;
  }

  update(dt, bike, model, camPos) {
    const ch = this.ch;
    ch.visible = this.visible;
    if (this.hop) {
      this.updateHop(dt);
      if (this.hop && !this.hop.off) ch.yaw = ch.targetYaw = bike.yaw;
      ch.update(dt, camPos);
      return;
    }
    if (this.onFoot) {
      // the game's Walker drives position; we only animate
      const W = this.game.walker;
      ch.pos.copy(W.pos);
      ch.targetYaw = W.yaw;
      ch.speedOverride = W.speed;
      ch.groundSnap = false;
      if (ch.anim !== 'kick' || ch.animT > 0.75) ch.play(W.grounded ? 'idle' : 'air');
      ch.setExpr(W.speed > 4 ? 'happy' : 'neutral');
      ch.update(dt, camPos);
      ch.speedOverride = null;
      return;
    }
    if (this.crashed) {
      if (ch.broken?.phase === 'scatter' && bike.crash < 1.15) ch.reassemble();
      ch.faceTowards(bike.pos.x, bike.pos.z);
      if (bike.crash <= 0 && !ch.broken) {
        // hop back on
        this.crashed = false;
        ch.groundSnap = false;
        ch.jump(2.5);
        this.mount(model);
      }
    } else if (!this.mounted && this.wantMount) this.mount(model);
    if (this.mounted && model.isMotor !== this.isMotor) this.mount(model);
    if (this.mounted) {
      // pose follows the bike
      let st = bike.pose;
      if (model.isMotor) st = 'motor';
      if (st === 'crash') st = 'coast';
      ch.rideStyle = st;
      ch.rideCrank = bike.crank;
      ch.rideLean = bike.lean;
      const R = ch.ride;
      if (R && !model.isMotor) {
        // glide: hands up on the quilt; drift: one foot dabs the ground
        R.armW = st === 'glide' || ch.trickArms ? 0 : 1;
        R.legW = st === 'glide' || ch.trickLegs ? 0 : 1;
      }
      // faces follow the action
      if (bike.boostTime > 0) ch.setExpr('determined');
      else if (bike.airTime > 0.45) ch.setExpr(bike.airTime > 1.2 ? 'sparkle' : 'happy');
      else if (bike.drifting) ch.setExpr('determined');
      else if (bike.speed > 12) ch.setExpr('happy');
      else ch.setExpr('neutral');
      ch.lookTarget = null;
    }
    ch.update(dt, camPos);
    // the cat rides in the basket
    if (this.cat && this.catOn) {
      this.catT += dt;
      const b = model.basket.getWorldPosition(_v);
      const toCam = camPos.clone().sub(b).setY(0).normalize();
      const blink = Math.floor(this.catT * 1.3) % 6 === 0 ? 1 : 0;
      const happy = bike.airTime > 0.3 || bike.boostTime > 0;
      const back = Math.cos(bike.yaw) * toCam.z + Math.sin(bike.yaw) * toCam.x < 0;
      this.cat.setFrame(back ? 'cat:basket:back:0' : `cat:basket:front:${happy ? 2 : blink}`);
      this.cat.mesh.position.copy(b).addScaledVector(toCam, 0.1);
      this.cat.mesh.position.y += 0.02 + Math.max(0, Math.sin(this.catT * 9)) * Math.min(0.06, bike.speed * 0.004);
      this.cat.mesh.visible = this.visible && bike.crash <= 0 && model.root.visible;
    }
  }
}
