// Harold's old roadster, Bessie: voxel frame, steering front with the wicker basket,
// a crate on the rear rack, a brass lamp that lights up after dark, and a bell.
// The wheels and the drivetrain are real little machines: cream-wall tyres with tread
// on chrome rims, 32 crossed spokes that smear into a blur at speed, a toothed
// chainring that turns with the cranks and drags a moving chain to the rear cog.
// The model is deliberately rubbery: it squashes on landings, stretches on pops,
// shimmies its handlebars, pivots on the back wheel for wheelies and on the front
// wheel for stoppies, and flops over in a crash.
import * as THREE from 'three';
import { Builder } from '../render/builder.js';
import { createPropMaterial, propMesh } from '../render/propMaterial.js';
import { worldUniforms, LIGHT_PARS_VERT, LIGHT_PARS_FRAG, SHADOW_VERT } from '../render/shaderlib.js';
import { damp, clamp } from '../core/math.js';
import { bikeFrame, bikeFront, bikeCrate, bikeLamp } from '../voxel/models/bike.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const R = 0.34; // wheel radius
const WB = 0.54; // half wheelbase
const SCALE = 0.86; // chibi riders: the roadster is scaled to fit the voxel villagers
export const WHEEL_R = R * SCALE; // the real rolling radius, for the spin
const COL = {
  chrome: 0xdadde4, chromeD: 0x8a8e98, black: 0x1e1a1a, tyre: 0x2a2422, tread: 0x3a3330, wall: 0xe6d6b4,
  rim: 0xc8ccd4, spoke: 0xb8bcc6, hub: 0xe0e2e8, chain: 0x4a4650, chainHi: 0x8a8890, rubber: 0x2a2220, amber: 0xf0a020,
};
const BB = [0, 0.3, -0.02];
const DRIVE_X = -0.078; // the chain runs on the rider's right (-x)
const RING_R = 0.095, COG_R = 0.042, PITCH = 0.0254;
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();

// the spoke blur: a see-through disc between hub and rim, lit like the rest of the world
function blurMaterial() {
  const uniforms = worldUniforms({ uBlur: { value: 0 }, uSpin: { value: 0 } });
  return new THREE.ShaderMaterial({
    uniforms, lights: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
${LIGHT_PARS_VERT}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vLocal;
void main() {
  vLocal = position.yz;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec3 transformedNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  ${SHADOW_VERT}
}`,
    fragmentShader: /* glsl */ `
${LIGHT_PARS_FRAG}
uniform float uBlur;
uniform float uSpin;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vLocal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  float r = length(vLocal) / ${(R - 0.064).toFixed(3)};
  float a = atan(vLocal.y, vLocal.x);
  // spokes smear into a grey haze, denser near the hub; a few faint streaks turn with the wheel
  float haze = mix(0.75, 0.38, smoothstep(0.15, 1.0, r));
  float streak = 0.82 + 0.18 * sin(a * 3.0 + r * 5.0 - uSpin);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 col = shadeWorld(vec3(0.62, 0.64, 0.68), n, vWorldPos, 1.0, 1.0);
  gl_FragColor = vec4(col, uBlur * haze * streak * 0.55);
}`,
  });
}

// one wheel's parts, built once: tyre + rim + hub (always shown), spokes (hidden at speed)
function wheelGeometry() {
  const T = new Builder();
  const r = R;
  const ry = [0, Math.PI / 2, 0];
  // fat balloon tyre, a cream gumwall either side and a chunky zig-zag tread
  T.geom(new THREE.TorusGeometry(r - 0.03, 0.03, 6, 44), [0, 0, 0], ry, [1, 1, 1], { color: COL.tyre });
  for (const s of [-1, 1]) T.geom(new THREE.TorusGeometry(r - 0.047, 0.011, 4, 44), [s * 0.02, 0, 0], ry, [1, 1, 1], { color: COL.wall });
  const N = 36;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const off = i % 2 ? 0.009 : -0.009;
    T.box([off, Math.cos(a) * (r - 0.003), Math.sin(a) * (r - 0.003)], [0.036, 0.012, 0.026], { color: COL.tread }, [-a, 0, 0]);
  }
  // chrome rim with a darker braking track, the valve, and the hub with its two flanges
  T.geom(new THREE.TorusGeometry(r - 0.064, 0.01, 4, 44), [0, 0, 0], ry, [1, 1, 1.6], { color: COL.rim });
  T.geom(new THREE.TorusGeometry(r - 0.058, 0.006, 3, 44), [0, 0, 0], ry, [1, 1, 2.2], { color: COL.chromeD });
  T.box([0, r - 0.085, 0], [0.012, 0.03, 0.012], { color: COL.chrome });
  T.box([0, r - 0.102, 0], [0.008, 0.008, 0.008], { color: COL.black });
  T.tube([-0.05, 0, 0], [0.05, 0, 0], 0.016, 0.016, { color: COL.hub }, 8);
  T.tube([-0.035, 0, 0], [0.035, 0, 0], 0.024, 0.024, { color: COL.hub }, 8);
  for (const s of [-1, 1]) T.tube([s * 0.03, 0, 0], [s * 0.038, 0, 0], 0.036, 0.036, { color: COL.chromeD }, 10);
  T.tube([-0.065, 0, 0], [0.065, 0, 0], 0.008, 0.008, { color: COL.chromeD }, 6); // axle nuts
  // 32 spokes laced three-cross: each leaves a flange at a tangent and crosses its neighbours
  const S = new Builder();
  const rr = r - 0.07, rf = 0.034;
  for (let side = 0; side < 2; side++) {
    const sx = side ? 0.034 : -0.034;
    for (let i = 0; i < 16; i++) {
      const ah = (i / 16) * Math.PI * 2 + (side ? Math.PI / 16 : 0);
      const dir = i % 2 ? 1 : -1;
      const ar = ah + dir * ((3 * Math.PI * 2) / 16) * 0.5;
      S.tube([sx, Math.cos(ah) * rf, Math.sin(ah) * rf], [sx * 0.15, Math.cos(ar) * rr, Math.sin(ar) * rr], 0.0045, 0.0045, { color: COL.spoke }, 3);
    }
  }
  return { body: T.build(), spokes: S.build() };
}

// chainring with teeth and a five-arm spider (turns with the cranks), and the rear cog
function ringGeometry(rad, teeth, spider) {
  const B = new Builder();
  B.geom(new THREE.TorusGeometry(rad - 0.008, 0.008, 4, 32), [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1.2], { color: COL.chrome });
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    B.box([0, Math.cos(a) * rad, Math.sin(a) * rad], [0.008, 0.012, 0.009], { color: COL.chromeD }, [-a, 0, 0]);
  }
  if (spider) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.tube([0, 0, 0], [0, Math.cos(a) * (rad - 0.012), Math.sin(a) * (rad - 0.012)], 0.009, 0.006, { color: COL.chrome }, 4);
    }
  } else B.tube([-0.006, 0, 0], [0.006, 0, 0], rad * 0.6, rad * 0.6, { color: COL.chromeD }, 8);
  return B.build();
}

// one straight run of chain: alternating inner/outer plates, a spare link each end so it can scroll
function chainRun(len) {
  const B = new Builder();
  const n = Math.ceil(len / PITCH) + 1;
  for (let i = -1; i < n; i++) {
    const z = i * PITCH;
    const outer = (i & 1) === 0;
    B.box([0, 0, z + PITCH / 2], [outer ? 0.014 : 0.01, 0.009, PITCH * 0.98], { color: outer ? COL.chainHi : COL.chain });
  }
  return B.build();
}

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'bike';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mat = createPropMaterial(null, { side: THREE.DoubleSide });
    this.steer = 0;
    this.isMotor = false;
    this.t = 0;
    this.wheelSq = 1;
    this.stretch = 1;
    this.spinF = this.spinR = 0; // wheel angles
    this.wF = this.wR = 0; // wheel angular speeds (rad/s)
    this.buildBicycle();
    this.voxelizeBicycle();
  }

  buildBicycle() {
    const g = new THREE.Group();
    this.bicycle = g;
    this.tip = new THREE.Group();
    this.body.add(this.tip);
    this.tip.add(g);
    const rearAx = [0, R, -WB];
    // (the frame and front are voxel meshes, see voxelizeBicycle; these anchors match them)
    const front = new THREE.Group();
    front.position.set(0, 0.66, 0.42);
    front.rotation.x = -0.28; // steering axis tilts back a bit
    g.add(front);
    this.front = front;
    const steerG = new THREE.Group();
    front.add(steerG);
    this.steerG = steerG;
    const ax = new THREE.Vector3(0, R - 0.66, WB - 0.42).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.28);
    const bz = ax.z + 0.12, by = 0.22;
    this.basketAnchor = new THREE.Object3D();
    this.basketAnchor.position.set(0, by + 0.03, bz);
    steerG.add(this.basketAnchor);
    // where the rider's hands go (+x is the rider's left)
    this.gripL = new THREE.Object3D();
    this.gripL.position.set(0.34, 0.39, -0.18);
    this.gripR = new THREE.Object3D();
    this.gripR.position.set(-0.34, 0.39, -0.18);
    steerG.add(this.gripL, this.gripR);
    // rod-brake levers in front of the grips, with a cable stub down to the head tube
    const lv = new Builder();
    for (const s of [-1, 1]) {
      lv.box([s * 0.27, 0.383, -0.158], [0.022, 0.026, 0.026], { color: COL.chromeD });
      lv.tube([s * 0.27, 0.378, -0.142], [s * 0.37, 0.352, -0.098], 0.008, 0.006, { color: COL.chrome }, 5);
      lv.box([s * 0.375, 0.35, -0.094], [0.014, 0.012, 0.012], { color: COL.chrome });
    }
    lv.tube([0.27, 0.383, -0.158], [0.06, 0.25, -0.04], 0.0045, 0.0045, { color: COL.black }, 3);
    lv.tube([-0.27, 0.383, -0.158], [-0.06, 0.25, -0.04], 0.0045, 0.0045, { color: COL.black }, 3);
    steerG.add(propMesh(lv.build(), this.mat));

    // wheels: tyre/rim/hub bodies, spokes, and a blur disc that takes over at speed
    const wg = wheelGeometry();
    this.blurMats = [];
    const mkWheel = (parent, x, y, z) => {
      const w = new THREE.Group();
      w.position.set(x, y, z);
      parent.add(w);
      const spin = new THREE.Group();
      w.add(spin);
      spin.add(propMesh(wg.body, this.mat));
      const spokes = propMesh(wg.spokes, this.mat, { cast: false });
      spin.add(spokes);
      const bm = blurMaterial();
      this.blurMats.push(bm);
      const disc = new THREE.Mesh(new THREE.RingGeometry(0.03, R - 0.064, 28, 1).rotateY(Math.PI / 2), bm);
      disc.renderOrder = 2;
      disc.visible = false;
      w.add(disc);
      return { w, spin, spokes, disc, bm };
    };
    this.wf = mkWheel(steerG, 0, ax.y, ax.z);
    this.wr = mkWheel(g, ...rearAx);
    this.wheelF = this.wf.w; // old names: position sources for effects
    this.wheelR = this.wr.w;

    // crank, chainring, pedals; the chain and the rear cog
    const crank = new THREE.Group();
    crank.position.set(...BB);
    g.add(crank);
    this.crank = crank;
    const cb = new Builder();
    // tapered cotterless arms and the axle through the bottom bracket
    cb.tube([0.1, 0, 0], [0.1, -0.15, 0], 0.016, 0.011, { color: COL.chrome }, 5);
    cb.tube([-0.1, 0, 0], [-0.1, 0.15, 0], 0.016, 0.011, { color: COL.chrome }, 5);
    cb.tube([-0.1, 0, 0], [0.1, 0, 0], 0.012, 0.012, { color: COL.chromeD }, 6);
    for (const s of [-1, 1]) cb.tube([s * 0.09, 0, 0], [s * 0.106, 0, 0], 0.02, 0.02, { color: COL.chrome }, 8);
    crank.add(propMesh(cb.build(), this.mat));
    const ring = propMesh(ringGeometry(RING_R, 30, true), this.mat);
    ring.position.x = DRIVE_X;
    crank.add(ring);
    this.pedals = [];
    for (const [x, y] of [[0.15, -0.15], [-0.15, 0.15]]) {
      const pb = new Builder();
      // rubber block pedals with an amber reflector front and back
      pb.box([0, 0, 0], [0.085, 0.024, 0.055], { color: COL.rubber });
      for (const s of [-1, 1]) pb.box([0, 0.004, s * 0.022], [0.088, 0.02, 0.012], { color: 0x3a3230 });
      for (const s of [-1, 1]) pb.box([0, 0, s * 0.03], [0.04, 0.012, 0.006], { color: COL.amber, emissive: 0.4 });
      pb.tube([x > 0 ? -0.05 : 0.05, 0, 0], [x > 0 ? 0.045 : -0.045, 0, 0], 0.006, 0.006, { color: COL.chrome }, 4);
      const p = propMesh(pb.build(), this.mat);
      p.position.set(x, y, 0);
      crank.add(p);
      this.pedals.push(p);
    }
    this.cog = propMesh(ringGeometry(COG_R, 16, false), this.mat);
    this.cog.position.set(DRIVE_X, R, -WB);
    g.add(this.cog);
    // the chain: two straight runs between ring and cog that scroll with the cranks
    this.chain = [];
    for (const top of [true, false]) {
      const a = new THREE.Vector3(DRIVE_X, BB[1] + (top ? RING_R : -RING_R), BB[2]);
      const b = new THREE.Vector3(DRIVE_X, R + (top ? COG_R : -COG_R), -WB);
      const len = a.distanceTo(b);
      const pivot = new THREE.Group();
      pivot.position.copy(b);
      pivot.rotation.set(Math.atan2(-(a.y - b.y), a.z - b.z), 0, 0);
      const m = propMesh(chainRun(len), this.mat, { cast: false });
      pivot.add(m);
      g.add(pivot);
      this.chain.push({ m, top, len });
    }

    // the crate on the rear rack (voxels); cups of cocoa ride in it (see cargo.js)
    this.rearAnchor = new THREE.Object3D();
    this.rearAnchor.position.set(0, 0.85, -0.56);
    g.add(this.rearAnchor);
    this.crateAnchor = new THREE.Object3D(); // the crate floor, where cups stand
    this.crateAnchor.position.set(0, 0.83, -0.56);
    g.add(this.crateAnchor);
    this.nozzles = [];

    this.lampLight = new THREE.Object3D(); // position source for the game's light pool
    this.lampLight.position.set(0, 0.95, 1.4);
    g.add(this.lampLight);
    this.riderAnchor = new THREE.Object3D();
    this.riderAnchor.position.set(0, 0.96, -0.22);
    g.add(this.riderAnchor);
    g.scale.setScalar(SCALE);
  }

  // Bessie's frame, front end, crate and lamp are voxel models (src/voxel/models/bike.js)
  voxelizeBicycle() {
    const mk = (r, jitter = 0.02) => voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter }), sharedVoxelMaterial());
    this.bicycle.add(mk(bikeFrame()));
    this.steerG.add(mk(bikeFront()));
    this.crateMesh = mk(bikeCrate(), 0.03);
    this.bicycle.add(this.crateMesh);
    this.lampMesh = mk(bikeLamp('body'), 0.01);
    this.lensOn = mk(bikeLamp('lit'), 0);
    this.lensOff = mk(bikeLamp('unlit'), 0);
    this.steerG.add(this.lampMesh, this.lensOn, this.lensOff);
    this.setLamp(false);
  }

  get rider() {
    return this.riderAnchor;
  }
  get basket() {
    return this.basketAnchor;
  }

  setLamp(on) {
    this.lensOn.visible = on;
    this.lensOff.visible = !on;
  }

  // Bessie has no upgrades any more; kept so older callers don't break
  applyUpgrades() {}

  // each wheel rolls with the ground while it touches it, and free-spins (slowly losing
  // speed, driven by the pedals for the back one, stopped by the brakes) while it doesn't
  spinWheels(dt, bike) {
    const roll = bike.fwdSpeed / WHEEL_R;
    const crashed = bike.crash > 0;
    const rearDown = bike.grounded && !crashed && bike.stoppie < 0.1;
    const frontDown = bike.grounded && !crashed && bike.wheelie < 0.1;
    const brake = bike.brakeIn || 0;
    if (rearDown) this.wR = roll;
    else {
      this.wR *= Math.exp(-(0.35 + brake * 6) * dt);
      if (bike.cadence > 0.05 && !crashed) this.wR = Math.max(this.wR, bike.cadence * 9.5 * (RING_R / COG_R));
    }
    if (frontDown) this.wF = roll * (bike.stoppie > 0.1 ? 0.6 : 1);
    else this.wF *= Math.exp(-(0.35 + brake * 6) * dt);
    this.spinF += this.wF * dt;
    this.spinR += this.wR * dt;
    this.wf.spin.rotation.x = this.spinF;
    this.wr.spin.rotation.x = this.spinR;
    // past ~2.5 turns a second the spokes smear into a blur
    for (const [W, w, a] of [[this.wf, this.wF, this.spinF], [this.wr, this.wR, this.spinR]]) {
      const blur = clamp((Math.abs(w) - 10) / 14, 0, 1);
      W.spokes.visible = blur < 0.65;
      W.disc.visible = blur > 0.02;
      W.bm.uniforms.uBlur.value = blur;
      W.bm.uniforms.uSpin.value = a * 0.15;
    }
  }

  update(dt, bike, steerInput) {
    this.t += dt;
    this.root.position.copy(bike.pos);
    this.root.rotation.set(0, bike.yaw, 0);
    // attitude: slope pitch and lean about the contact patch (about the middle in the air), then
    // the wheelie / stoppie tip about whichever wheel is still on the ground
    const down = bike.grounded || bike.crash > 0;
    const tipA = bike.crash > 0 ? bike.pitch - bike.slopePitch : down ? bike.wheelie - bike.stoppie : 0;
    const wantY = down ? 0 : 0.5;
    this.pivY = dt > 0 ? damp(this.pivY ?? 0, wantY, 10, dt) : wantY;
    _e.set(-(bike.pitch - tipA), 0, bike.lean, 'YXZ');
    _q.setFromEuler(_e);
    this.body.quaternion.copy(_q);
    _p.set(0, this.pivY, 0).applyQuaternion(_q);
    this.body.position.set(-_p.x, this.pivY - _p.y, -_p.z);
    const pz = tipA >= 0 ? -WB * SCALE : WB * SCALE;
    this.tip.rotation.x = -tipA;
    this.tip.position.set(0, -pz * Math.sin(tipA), pz - pz * Math.cos(tipA));
    // squash on landings, stretch on pops, a jelly wobble while balancing
    const sq = bike.squash.value;
    const jelly = 1 + Math.sin(this.t * 31) * Math.min(0.04, Math.abs(bike.balance) * 0.6);
    this.body.scale.set(jelly / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    // the handlebars: steering about the raked head tube (so the wheel leans into the turn), drift
    // counter-steer, a shimmy when slow or knocked about, and the front flops toward the lean when parked
    const shimmy = bike.shimmy * 2.2 + (bike.grounded && bike.speed > 0.3 && bike.speed < 2 ? Math.sin(this.t * 11) * 0.06 * (2 - bike.speed) : 0);
    const flop = bike.speed < 1.2 && bike.crash <= 0 ? clamp(bike.lean, -0.4, 0.4) * 0.9 * (1 - bike.speed / 1.2) : 0;
    this.steer = damp(this.steer, -steerInput * 0.45 * Math.max(0.25, 1 - bike.speed / 14) + (bike.drifting ? bike.driftDir * 0.35 : 0) + (bike.dab > 0.5 ? -steerInput * 0.3 : 0) - flop, 10, dt);
    this.steerG.rotation.y = this.steer + clamp(shimmy, -0.35, 0.35);
    if (dt > 0) this.spinWheels(dt, bike);
    // tyres squish a little on hard landings (the bottom flattens, the sides bulge)
    this.wheelSq = damp(this.wheelSq, 1, 9, dt);
    if (sq < this.wheelSq) this.wheelSq = sq;
    const ws = 0.78 + this.wheelSq * 0.22;
    for (const W of [this.wf, this.wr]) W.w.scale.set(1 + (1 - ws) * 0.6, ws, 1 + (1 - ws) * 0.35);
    // cranks turn with the cadence; pedals stay level; the chain scrolls ring -> cog on top
    this.crank.rotation.x = bike.crank;
    for (const p of this.pedals) p.rotation.x = -bike.crank;
    this.cog.rotation.x = bike.crank * (RING_R / COG_R);
    const run = (((bike.crank * RING_R) % (2 * PITCH)) + 2 * PITCH) % (2 * PITCH);
    for (const c of this.chain) c.m.position.z = c.top ? run - PITCH : PITCH - run;
    // crash: the bike flops over and skids round
    if (bike.crash > 0) {
      this.root.rotation.y = bike.yaw + (1.9 - bike.crash) * bike.crashSpin * Math.max(0, bike.crash - 1) * 0.4;
    }
  }

  // world positions for effects
  worldOf(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.bicycle.matrixWorld);
  }
}
