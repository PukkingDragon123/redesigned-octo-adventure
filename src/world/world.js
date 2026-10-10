// Assembles the static world: terrain, water, sky, mountains, lights.
import * as THREE from 'three';
import { Terrain, riverInfo } from './terrain.js';
import { Forest } from './forest.js';
import { Grass, buildGrassMask } from './grass.js';
import * as L from './layout.js';
import { PhysicsWorld } from './collide.js';
import { buildWorldAtlas } from '../art/atlas.js';
import { pixTexture } from '../render/textures.js';
import { Builder } from '../render/builder.js';
import { createPropMaterial, propMesh } from '../render/propMaterial.js';
import { buildBuildings } from './buildings.js';
import { buildProps, boatGeometry } from './props.js';
import { LightPool } from './lights.js';
import { createTerrainMaterial, createTerrainMeshes, createWorldTextures } from './terrainMesh.js';
import { createSky, createMountains } from '../render/sky.js';
import { createWater } from './water.js';
import { Atmosphere } from './atmosphere.js';
import { G } from '../render/shaderlib.js';
import { DECOR } from './decor.js';
import { VoxelWorld, startBuildingJobs } from './voxelWorld.js';
import { Forest2D } from './forest2d.js';
import { PhysProps } from './physprops.js';
import * as VOXPROPS from '../voxel/models/props.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3(), _lup = new THREE.Vector3(), _snap = new THREE.Vector3();

export class World {
  constructor(pipeline, progress = () => {}) {
    this.pipeline = pipeline;
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.progress = progress;
  }

  async build() {
    const step = async (p, label) => {
      this.progress(p, label);
      await new Promise((r) => setTimeout(r, 0));
    };
    await step(0.05, 'shaping the hills');
    this.terrain = new Terrain();
    // the voxel houses are built in workers while the forest grows on this thread
    if (!this.noVoxelTown) this.buildingJobs = startBuildingJobs(this.terrain);
    await step(0.25, 'painting the ground');
    this.textures = createWorldTextures(this.terrain);
    this.terrainMat = createTerrainMaterial();
    this.terrainMeshes = createTerrainMeshes(this.terrain, this.terrainMat);
    this.scene.add(this.terrainMeshes);

    await step(0.32, 'planting the forest');
    this.forest = new Forest(this.terrain, { density: this.density ?? 1 });
    this.forest.place(riverInfo);
    this.scene.add(this.forest.buildMeshes());
    console.log('forest', JSON.stringify(this.forest.stats));
    if (!this.noVoxelTrees) {
      // pixel-art trees; voxelForest is the old name (settings and cutscenes still use it)
      this.forest2d = this.voxelForest = new Forest2D(this.forest);
      const t0 = performance.now();
      this.scene.add(await this.forest2d.build((k) => this.progress(0.32 + k * 0.06, 'growing the trees')));
      console.log(`forest sprites in ${(performance.now() - t0).toFixed(0)}ms`, JSON.stringify(this.forest2d.stats));
    }

    await step(0.4, 'raising the village');
    this.physics = new PhysicsWorld(this.terrain, this.forest.colliders);
    await this.buildTown(step);

    await step(0.45, 'growing the grass');
    const blockers = L.BUILDINGS.map((b) => ({ x: b.x, z: b.z, w: b.w + (b.porch ? 3 : 0.5), d: b.d + (b.porch ? 3 : 0.5), yaw: b.facing || 0 }));
    blockers.push({ x: L.POI.cabin.x + 8, z: L.POI.cabin.z + 8, w: 26, d: 26, yaw: 0, keep: 0.8, short: true });
    // the town: lawn on the green, nothing under the sidewalks, the rink or the bike park
    const MS = L.MAIN_ST;
    blockers.push({ x: (MS.x0 + MS.x1) / 2, z: MS.z, w: MS.x1 - MS.x0 + 4, d: MS.road + MS.walk * 2 + 1.2, yaw: 0, keep: 0 });
    blockers.push({ x: L.POI.plaza.x, z: L.POI.plaza.z, w: 40, d: 36, yaw: 0, keep: 0.9, short: true });
    blockers.push({ x: L.POI.rink.x, z: L.POI.rink.z, w: 32, d: 20, yaw: 0, keep: 0 });
    blockers.push({ x: L.POI.bikePark.x, z: L.POI.bikePark.z, w: 44, d: 34, yaw: 0, keep: 0.25, short: true });
    blockers.push({ x: L.POI.pumpkinPatch.x, z: L.POI.pumpkinPatch.z, w: 26, d: 26, yaw: 0, keep: 0.35, short: true });
    blockers.push({ x: L.POI.campground.x, z: L.POI.campground.z, w: 22, d: 22, yaw: 0, keep: 0.6, short: true });
    blockers.push({ x: L.POI.picnic.x, z: L.POI.picnic.z, w: 16, d: 16, yaw: 0, keep: 0.7, short: true });
    // cutscene stages: short, sparse grass so low cameras see the actors (lumber camp, Hank's grave)
    const lc = L.POI.lumberCamp;
    if (lc) blockers.push({ x: lc.x, z: lc.z, w: lc.r * 2 + 4, d: lc.r * 2 + 4, yaw: Math.PI / 4, keep: 0.4, short: true });
    blockers.push({ x: L.POI.grave.x, z: L.POI.grave.z, w: 20, d: 20, yaw: Math.PI / 4, keep: 0.4, short: true });
    blockers.push({ x: L.POI.graveyard.x, z: L.POI.graveyard.z, w: 30, d: 30, yaw: 0, keep: 0.9, short: true });
    blockers.push({ x: L.POI.garage.x + 6, z: L.POI.garage.z, w: 12, d: 10, yaw: 0, keep: 0.7, short: true });
    for (const b of this.deco2d?.lawns || []) blockers.push(b); // mown patches under the 2D furniture
    this.grassMask = buildGrassMask(this.terrain, blockers);
    this.grass = new Grass(this.grassMask, { gridN: this.grassGrid ?? 150, spacing: 0.42 });
    this.scene.add(this.grass.mesh);

    await step(0.5, 'filling the cove');
    this.water = createWater(this.pipeline, this.terrain);
    this.scene.add(this.water);
    this.sky = createSky();
    this.scene.add(this.sky);
    this.mountains = createMountains(this.pipeline.post);
    this.scene.add(this.mountains);

    // sun light used for shadows only (our shaders do their own lighting)
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 70;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.atmosphere = new Atmosphere(this.pipeline, sun);
  }

  async buildTown(step = async () => {}) {
    const atlas = buildWorldAtlas();
    this.worldAtlasTex = pixTexture(atlas.pix, { repeat: false, mips: true });
    this.propMat = createPropMaterial(this.worldAtlasTex);
    const ctx = {
      terrain: this.terrain, physics: this.physics,
      lights: [], smoke: [], boats: [], fires: [], flags: [], perches: [],
    };
    this.ctx = ctx;
    const areas = { village: new Builder(), home: new Builder(), grave: new Builder(), misc: new Builder() };
    // buildings grouped by area for frustum culling
    const byArea = (x, z) => (x > 90 ? 'village' : x < -140 && z > 0 ? 'home' : x < -180 ? 'grave' : 'misc');
    const groups = {};
    for (const b of L.BUILDINGS) (groups[byArea(b.x, b.z)] ||= []).push(b);
    this.buildings = {};
    // the old low-poly buildings still provide collision, porches, smoke & lamps;
    // their geometry is thrown away and voxel buildings stand in their place
    const voxel = !this.noVoxelTown;
    const scrap = new Builder();
    for (const [area, list] of Object.entries(groups)) Object.assign(this.buildings, buildBuildings(ctx, voxel ? scrap : areas[area], list));
    DECOR.on = voxel;
    DECOR.list = [];
    buildProps(ctx, areas);
    DECOR.on = false;
    if (voxel) {
      const t0 = performance.now();
      this.voxel = new VoxelWorld(this);
      this.voxelProps = VOXPROPS;
      this.physprops = new PhysProps(null, this.scene, ctx.lights);
      await step(0.41, 'building voxel houses');
      await this.voxel.buildings(this.buildings, () => step(0.42, 'building voxel houses'));
      const t1 = performance.now();
      await step(0.43, 'raking the leaves');
      this.voxel.decor(DECOR.list, this.physprops);
      this.voxel.dress(this.physprops);
      const t2 = performance.now();
      this.voxel.buildStatic();
      for (const l of this.voxel.lights) ctx.lights.push(l);
      const ms = (a, b) => (b - a).toFixed(0);
      console.log(`voxel town in ${ms(t0, performance.now())}ms (buildings ${ms(t0, t1)}, props ${ms(t1, t2)}, merge ${ms(t2, performance.now())}), ${this.voxel.cache.size} prop models, ${this.physprops.list.length} physics props`);
    }
    this.townMeshes = [];
    for (const [name, B] of Object.entries(areas)) {
      if (!B.count) continue;
      const m = propMesh(B.build(), this.propMat);
      m.name = `town:${name}`;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      this.townMeshes.push(m);
    }
    // boats bob on the water as separate meshes (voxel lobster boats, dinghies & canoes)
    const HULLS = { hull: 0xb8352c, hullBlue: 0x2e5a8a, hullGreen: 0x3a7a5a };
    const boatGeo = new Map();
    const voxBoat = (kind, hull) => {
      const key = kind + ':' + hull;
      if (!boatGeo.has(key)) {
        const col = HULLS[hull] ?? 0x2e5a8a;
        const r = kind === 'fishing' ? VOXPROPS.fishingBoat({ hull: col }) : kind === 'rowboat' ? VOXPROPS.rowboat({ color: col }) : VOXPROPS.canoe({ color: 0xb83a2a });
        boatGeo.set(key, { geo: meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0 }), y: kind === 'fishing' ? 0 : kind === 'rowboat' ? -0.22 : -0.12 });
      }
      return boatGeo.get(key);
    };
    this.boats = ctx.boats.map((bt, i) => {
      let m, baseY = 0;
      if (voxel) {
        const vb = voxBoat(bt.kind, bt.hull);
        m = voxMesh(vb.geo, sharedVoxelMaterial());
        baseY = vb.y;
      } else {
        const B = new Builder();
        boatGeometry(B, bt.kind, bt.hull);
        m = propMesh(B.build(), this.propMat);
      }
      m.position.set(bt.x, baseY, bt.z);
      m.rotation.y = bt.yaw;
      m.userData = { ...bt, phase: i * 1.7, baseY };
      this.scene.add(m);
      if (bt.kind !== 'canoe') this.physics.addBox({ x: bt.x, z: bt.z, yaw: bt.yaw, w: bt.kind === 'fishing' ? 2.3 : 1.4, l: bt.kind === 'fishing' ? 6.5 : 3.2, y0: -2, y1: 2.5, kind: 'boat' });
      return m;
    });
    // flags
    this.flags = ctx.flags.map((f) => {
      const g = new THREE.PlaneGeometry(f.w, f.h, 8, 3);
      g.translate(f.w / 2, 0, 0);
      const B = new Builder();
      B.add(g, new THREE.Matrix4(), { tile: 'flag' });
      B.add(g.clone().rotateY(Math.PI), new THREE.Matrix4(), { tile: 'flag' });
      const geo = B.build();
      const m = propMesh(geo, this.propMat, { cast: true });
      m.position.copy(f.pos);
      m.userData.base = Float32Array.from(geo.attributes.position.array);
      this.scene.add(m);
      return m;
    });
    this.lightPool = new LightPool(ctx.lights);
  }

  updateTown(dt) {
    const t = G.uTime.value;
    for (const b of this.boats || []) {
      const ph = b.userData.phase;
      b.position.y = (b.userData.baseY || 0) + Math.sin(t * 1.1 + ph) * 0.06 - 0.02;
      b.rotation.z = Math.sin(t * 0.9 + ph) * 0.035;
      b.rotation.x = Math.sin(t * 0.7 + ph * 1.3) * 0.02;
    }
    for (const f of this.flags || []) {
      const pos = f.geometry.attributes.position;
      const base = f.userData.base;
      const wind = 0.6 + G.uWindStrength.value;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const k = x / 1.8;
        pos.setZ(i, base[i * 3 + 2] + Math.sin(t * 6 * wind - x * 3) * 0.12 * k * wind);
        pos.setY(i, base[i * 3 + 1] - k * k * 0.12 / wind);
      }
      pos.needsUpdate = true;
      f.rotation.y = Math.atan2(-G.uWind.value.y, G.uWind.value.x);
    }
  }

  // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer
  updateShadow(focus) {
    const sun = this.sun;
    const cam = sun.shadow.camera;
    const size = cam.right - cam.left;
    const texel = size / sun.shadow.mapSize.x;
    const dir = G.uSunDir.value;
    // build light space basis
    const fwd = _fwd.copy(dir).negate();
    const up = Math.abs(fwd.y) > 0.99 ? _up.set(1, 0, 0) : _up.set(0, 1, 0);
    const right = _right.crossVectors(up, fwd).normalize();
    const lup = _lup.crossVectors(fwd, right).normalize();
    const px = Math.round(focus.dot(right) / texel) * texel;
    const py = Math.round(focus.dot(lup) / texel) * texel;
    const pz = focus.dot(fwd);
    const snapped = _snap.set(0, 0, 0).addScaledVector(right, px).addScaledVector(lup, py).addScaledVector(fwd, pz);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(dir, 200);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  update(dt, camera, focus) {
    G.uTime.value += dt;
    this.atmosphere.update(dt);
    this.sky.position.copy(camera.position);
    this.forest2d?.update(camera.position, camera);
    this.fences?.update(camera);
    this.forest?.updateVisibility(camera.position);
    this.voxel?.updateFar?.(camera.position);
    this.grass?.update(camera.position);
    this.updateShadow(focus);
    this.updateTown(dt);
    this.lightPool?.update(dt, focus, G.uNight.value);
  }
}
