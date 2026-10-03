// Bessie's cargo: one lidded paper cup of cocoa per carried order, standing in the crate
// behind the saddle. Each cup sits on its own little spring, so it rocks when the bike
// speeds up, brakes, lands or bumps; hot cups steam; a crash throws them out onto the
// ground and they hop back into the crate when Hank picks himself up.
// load() is the bit after Nana's order board: Hank carries the cups out on a tray and
// packs them into the crate one by one (skippable like any cutscene).
import * as THREE from 'three';
import { Builder } from '../render/builder.js';
import { propMesh } from '../render/propMaterial.js';
import { clamp } from '../core/math.js';
import * as L from '../world/layout.js';

// crate-floor slots (bike-local metres before the bike's scale), front pair first
const SLOTS = [[-0.085, 0.08], [0.085, 0.08], [-0.085, -0.08], [0.085, -0.08], [0, 0]];
// sleeve colours, so each cocoa reads as its own cup
const SLEEVE = { classic: 0xc8361f, maple: 0xe08a2a, cinnamon: 0x8a2418, mint: 0x3a9a6a, pumpkin: 0xe8702a, mocha: 0x5a3a2a };
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

const geoCache = new Map();
function cupGeometry(cocoa) {
  if (geoCache.has(cocoa)) return geoCache.get(cocoa);
  const B = new Builder();
  const sleeve = SLEEVE[cocoa] ?? 0xb98250;
  // tapered paper cup, a card sleeve with a cream stripe, a snap-on lid with a sip hole
  B.tube([0, 0, 0], [0, 0.13, 0], 0.042, 0.054, { color: 0xf6efe2 }, 10);
  B.tube([0, 0.034, 0], [0, 0.092, 0], 0.0472, 0.0528, { color: sleeve }, 10);
  B.tube([0, 0.058, 0], [0, 0.068, 0], 0.0496, 0.0508, { color: 0xf4e4c0 }, 10);
  B.tube([0, 0.127, 0], [0, 0.142, 0], 0.059, 0.057, { color: 0xffffff }, 10);
  B.tube([0, 0.142, 0], [0, 0.153, 0], 0.05, 0.038, { color: 0xeee6dc }, 10);
  B.box([0, 0.154, 0.024], [0.02, 0.006, 0.01], { color: 0x3a2418 });
  const g = B.build();
  geoCache.set(cocoa, g);
  return g;
}
function trayGeometry() {
  const B = new Builder();
  const W = 0xa0703a, D = 0x6e4622;
  B.box([0, 0, 0], [0.34, 0.02, 0.26], { color: W });
  for (const s of [-1, 1]) {
    B.box([0, 0.025, s * 0.125], [0.34, 0.04, 0.012], { color: D });
    B.box([s * 0.165, 0.025, 0], [0.012, 0.04, 0.26], { color: D });
  }
  return B.build();
}

export class Cargo {
  constructor(game) {
    this.game = game;
    this.cups = []; // { o, g (pivot group), mesh, steam, ax, az, vx, vz }
    this.spilled = null; // cups out on the ground after a crash
    this.prevVel = new THREE.Vector3();
    this.steamT = 0;
  }

  get model() {
    return this.game.bikeModel;
  }

  // which orders have a cup in the crate (picked but not yet carried out = not shown)
  shown() {
    return this.game.orders.carried().filter((o) => o.loaded !== false);
  }

  makeCup(o) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const mesh = propMesh(cupGeometry(o.cocoa), this.game.world.propMat, { cast: false });
    g.add(mesh);
    const steam = new THREE.Object3D(); // effects puff steam 0.1 m above this
    steam.position.y = 0.06;
    g.add(steam);
    return { o, g, mesh, steam, ax: 0, az: 0, vx: 0, vz: 0 };
  }

  // rebuild the crate's cups from the orders (cheap: a few small meshes)
  sync() {
    if (this.spilled) this.gather(true);
    const want = this.shown();
    const anchor = this.model.crateAnchor;
    this.cups = this.cups.filter((c) => {
      if (want.includes(c.o)) return true;
      c.g.parent?.remove(c.g);
      return false;
    });
    for (const o of want) if (!this.cups.find((c) => c.o === o)) this.cups.push(this.makeCup(o));
    this.cups.sort((a, b) => want.indexOf(a.o) - want.indexOf(b.o));
    this.cups.forEach((c, i) => {
      const [x, z] = SLOTS[i % SLOTS.length];
      if (c.g.parent !== anchor) anchor.add(c.g);
      c.slot = [x, z];
      c.g.position.set(x, 0, z);
      c.g.rotation.set(0, (c.o.id * 1.7) % (Math.PI * 2), 0);
    });
    this.updateSteam();
  }

  // hot cups steam (the effects system puffs from whatever is in game.effects.cups)
  updateSteam() {
    const fx = this.game.effects;
    if (!fx) return;
    fx.cups = this.spilled ? [] : this.cups.filter((c) => c.o.quality > 35).map((c) => c.steam);
  }

  kick(power) {
    for (const c of this.cups) {
      c.vx += (Math.random() - 0.5) * power * 2;
      c.vz += (Math.random() - 0.5) * power * 2;
    }
  }

  onBikeEvent(e) {
    switch (e.type) {
      case 'land': this.kick(clamp(e.impact * 0.9, 0.5, 9)); break;
      case 'sketchyLand': this.kick(7); break;
      case 'bump': this.kick(clamp(e.size * 22, 0.4, 6)); break;
      case 'bonk': this.kick(clamp(e.impact * 1.2, 1, 7)); break;
      case 'frontSlam': case 'rearSlam': this.kick(clamp(e.power * 0.8, 1, 6)); break;
      case 'jump': this.kick(1.5); break;
      case 'crash': this.spill(e); break;
      case 'reassemble': this.gather(); break;
    }
  }

  // a crash throws the cups out of the crate (lids stay on: Nana's lids are legendary)
  spill(e) {
    if (this.spilled || !this.cups.length) return;
    const b = this.game.bike;
    const scene = this.game.scene;
    this.model.root.updateMatrixWorld(true);
    const power = clamp((e.impact || 4) / 8, 0.5, 1.3);
    this.spilled = { t: 0, back: null };
    for (const c of this.cups) {
      scene.attach(c.g);
      const a = Math.random() * Math.PI * 2;
      c.fly = {
        v: new THREE.Vector3(b.vel.x * 0.7 + Math.cos(a) * 1.4 * power, 2.4 + Math.random() * 1.6 * power, b.vel.z * 0.7 + Math.sin(a) * 1.4 * power),
        wx: (Math.random() - 0.5) * 18, wz: (Math.random() - 0.5) * 18, rest: false,
      };
    }
    this.updateSteam();
  }

  // ...and they hop back into the crate, one after another
  gather(instant = false) {
    const S = this.spilled;
    if (!S) return;
    if (instant) {
      for (const c of this.cups) this.reseat(c);
      this.spilled = null;
      this.updateSteam();
      return;
    }
    if (S.back) return;
    S.back = { t: 0 };
    for (const c of this.cups) c.from = c.g.position.clone();
  }

  reseat(c) {
    const anchor = this.model.crateAnchor;
    anchor.add(c.g);
    c.g.position.set(c.slot[0], 0, c.slot[1]);
    c.g.rotation.set(0, (c.o.id * 1.7) % (Math.PI * 2), 0);
    c.fly = null;
    c.ax = c.az = 0;
    c.vx = c.vz = 0;
  }

  updateSpilled(dt) {
    const S = this.spilled;
    const g = this.game;
    S.t += dt;
    const vis = this.model.root.visible;
    for (const c of this.cups) c.g.visible = vis;
    if (!S.back && (S.t > 4 || g.mode === 'cutscene' || g.bike.crash <= 0)) this.gather(g.mode === 'cutscene');
    if (!this.spilled) return;
    if (S.back) {
      // arc back into the crate slots, staggered
      S.back.t += dt;
      this.model.root.updateMatrixWorld(true);
      let done = true;
      this.cups.forEach((c, i) => {
        const k = clamp((S.back.t - i * 0.12) / 0.42, 0, 1);
        if (k < 1) done = false;
        if (k <= 0) return;
        const to = this.model.crateAnchor.localToWorld(_w.set(c.slot[0], 0, c.slot[1]));
        const e = k * k * (3 - 2 * k);
        c.g.position.lerpVectors(c.from, to, e);
        c.g.position.y += Math.sin(k * Math.PI) * 0.7;
        c.g.rotation.x *= 1 - e;
        c.g.rotation.z *= 1 - e;
        if (k >= 1 && c.fly) {
          this.reseat(c);
          g.sfx?.('cup', g.bike.pos, 0.5);
        }
      });
      if (done) {
        for (const c of this.cups) if (c.fly) this.reseat(c);
        this.spilled = null;
        this.updateSteam();
      }
      return;
    }
    // tumbling through the air, bouncing, then lying on their sides
    for (const c of this.cups) {
      const F = c.fly;
      if (!F || F.rest) continue;
      F.v.y -= 9.8 * dt;
      const p = c.g.position;
      p.addScaledVector(F.v, dt);
      c.g.rotation.x += F.wx * dt;
      c.g.rotation.z += F.wz * dt;
      const gh = g.physics.groundAt(p.x, p.z, p.y + 0.5).h + 0.03;
      if (p.y < gh) {
        p.y = gh;
        if (F.v.y < -1.2) {
          F.v.y *= -0.35;
          F.v.x *= 0.55;
          F.v.z *= 0.55;
          F.wx *= 0.5;
          F.wz *= 0.5;
        } else {
          F.rest = true;
          c.g.rotation.x = Math.PI / 2;
          c.g.rotation.z = 0;
        }
      }
    }
  }

  update(dt) {
    if (!this.cups.length || dt <= 0) return;
    const vis = this.model.root.visible;
    for (const c of this.cups) c.steam.visible = vis;
    if (this.spilled) return this.updateSpilled(dt);
    // safety net: cups that were picked but never carried out pop in once Hank rides off
    const g = this.game;
    if (g.mode === 'ride' && !g.onFoot && g.bike.speed > 0.8 && g.orders.carried().some((o) => o.loaded === false)) {
      for (const o of g.orders.carried()) o.loaded = true;
      this.sync();
    }
    // the crate's acceleration (bike-local) pushes each cup over on its spring
    const b = g.bike;
    const ax = (b.vel.x - this.prevVel.x) / dt, az = (b.vel.z - this.prevVel.z) / dt;
    this.prevVel.copy(b.vel);
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const fwd = clamp(ax * fx + az * fz, -25, 25), side = clamp(ax * fz - az * fx, -25, 25);
    for (const c of this.cups) {
      // tipping back when Bessie surges forward, forward when she brakes, out in turns
      const tx = -fwd * 0.012, tz = side * 0.01;
      c.vx += ((tx - c.ax) * 160 - c.vx * 9) * dt;
      c.vz += ((tz - c.az) * 160 - c.vz * 9) * dt;
      c.ax = clamp(c.ax + c.vx * dt, -0.45, 0.45);
      c.az = clamp(c.az + c.vz * dt, -0.45, 0.45);
      c.g.rotation.x = c.ax;
      c.g.rotation.z = c.az;
    }
    // cooling cups stop steaming
    this.steamT += dt;
    if (this.steamT > 0.5) {
      this.steamT = 0;
      this.updateSteam();
    }
  }

  // ---------------------------------------------------------------- packing the crate
  // Hank brings the cups out on a tray and puts them in the crate. Resolves when done.
  async load() {
    const g = this.game;
    const pending = g.orders.carried().filter((o) => o.loaded === false);
    if (!pending.length) return;
    const finish = () => {
      for (const o of g.orders.carried()) o.loaded = true;
      this.sync();
    };
    await g.story.scene(async (S) => {
      const b = g.bike;
      // Bessie waits at the homestead; if she's off somewhere, she's wheeled home first
      const porch = L.HOME_SPOTS.porch;
      if (Math.hypot(b.pos.x - porch.x, b.pos.z - porch.z) > 40 || b.crash > 0) g.parkBike();
      b.vel.set(0, 0, 0);
      g.setBikeVisible(true);
      g.bikeModel.update(0, b, 0);
      g.bikeModel.root.updateMatrixWorld(true);
      g.rider.visible = false;
      const wasOnFoot = g.onFoot;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
      // Hank walks over from wherever he is (the porch if he was on the bike)
      const src = wasOnFoot ? g.walker.pos : new THREE.Vector3(porch.x, 0, porch.z);
      let dx = src.x - b.pos.x, dz = src.z - b.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const far = clamp(d, 2.6, 5.2);
      const side = dx * rx + dz * rz >= 0 ? 1 : -1;
      const H = S.actor('hank', b.pos.x + dx * far, b.pos.z + dz * far, Math.atan2(-dx, -dz), 'idle');
      H.play('carry', 'happy');
      // the tray of cups he carries, held out in front between his hands
      const tray = new THREE.Group();
      tray.scale.setScalar(1.25);
      tray.add(propMesh(trayGeometry(), g.world.propMat, { cast: false }));
      const onTray = pending.map((o, i) => {
        const m = propMesh(cupGeometry(o.cocoa), g.world.propMat, { cast: false });
        m.position.set(-0.08 + (i % 3) * 0.08, 0.01, i < 3 ? 0.04 : -0.06);
        m.scale.setScalar(0.86);
        tray.add(m);
        return m;
      });
      g.scene.add(tray);
      S.temp.push({ remove: () => tray.parent?.remove(tray) });
      const fxSteam = g.effects.cups;
      g.effects.cups = onTray;
      const holdTray = () => {
        const hl = H.arms?.L?.hand, hr = H.arms?.R?.hand;
        if (hl && hr) {
          hl.getWorldPosition(_v);
          hr.getWorldPosition(_w);
          tray.position.addVectors(_v, _w).multiplyScalar(0.5);
          tray.position.y += 0.02;
        } else tray.position.set(H.pos.x + Math.sin(H.yaw) * 0.3, H.pos.y + 0.6, H.pos.z + Math.cos(H.yaw) * 0.3);
        tray.rotation.y = H.yaw;
        return false;
      };
      S.every(holdTray);
      // the camera looks across the crate from the far side, so Hank faces it as he packs
      const crate = g.bikeModel.crateAnchor.getWorldPosition(new THREE.Vector3());
      await S.cam(
        new THREE.Vector3(crate.x - rx * side * 2.6 - fx * 0.15, crate.y + 1.2, crate.z - rz * side * 2.6 - fz * 0.15),
        new THREE.Vector3(crate.x + rx * side * 0.35, crate.y + 0.35, crate.z + rz * side * 0.35), 0, 44);
      const skipped = new Promise((res) => S.every(() => (S.skip ? (res(), true) : false)));
      // walk up beside the crate and turn to face it
      const stand = [crate.x + rx * side * 0.62 - fx * 0.3, crate.z + rz * side * 0.62 - fz * 0.3];
      await Promise.race([H.walkTo([stand], 2.1, 'walk+carry'), skipped]);
      H.face(Math.atan2(-rx * side, -rz * side));
      await S.wait(0.25);
      // one cup at a time: lift it off the tray, arc it into its slot, clink
      for (let i = 0; i < pending.length && !S.skip; i++) {
        const o = pending[i];
        const m = onTray[i];
        m.updateWorldMatrix(true, false);
        const from = m.getWorldPosition(new THREE.Vector3());
        const idx = g.orders.carried().filter((x) => x.loaded !== false || x === o).indexOf(o);
        const slot = SLOTS[Math.max(0, idx) % SLOTS.length];
        const to = g.bikeModel.crateAnchor.localToWorld(new THREE.Vector3(slot[0], 0, slot[1]));
        g.scene.attach(m);
        H.kick('sq', 0.9);
        await S.anim(0.38, (k) => {
          m.position.lerpVectors(from, to, k);
          m.position.y += Math.sin(k * Math.PI) * 0.22;
        }, (k) => k * k * (3 - 2 * k));
        m.parent?.remove(m);
        o.loaded = true;
        this.sync();
        g.effects.cups = onTray.filter((x) => x.parent === tray);
        S.sfx('cup', { volume: 0.7, pitch: 0.9 + i * 0.08 });
        this.kick(3);
        await S.wait(0.12);
      }
      finish();
      g.effects.cups = fxSteam;
      // a pat on the crate, then up onto the saddle
      if (!S.skip) {
        H.play('idle', 'happy');
        H.kick('sq', 1.2);
        S.sfx('footstep_wood', { volume: 0.5 });
        await S.wait(0.45);
      }
      if (g.onFoot) {
        g.onFoot = false;
        const r = g.rider;
        r.onFoot = false;
        r.hop = null;
        r.ch.groundSnap = false;
        r.mount(g.bikeModel);
      }
      g.rider.visible = true;
      g.sound.play('bike_mount');
    });
    finish();
    // (called from a menu or talk, the scene hands back to that mode: glide back behind Hank)
    if (g.mode === 'menu' || g.mode === 'ride') {
      g.chase.release();
      g.ui.showHUD(true);
    }
  }
}
