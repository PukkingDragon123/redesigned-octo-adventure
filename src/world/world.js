// Assembles the static world: terrain, water, sky, mountains, lights.
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { createTerrainMaterial, createTerrainMeshes, createWorldTextures } from './terrainMesh.js';
import { createSky, createMountains } from '../render/sky.js';
import { createWater } from './water.js';
import { Atmosphere } from './atmosphere.js';
import { G } from '../render/shaderlib.js';

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
    await step(0.25, 'painting the ground');
    this.textures = createWorldTextures(this.terrain);
    this.terrainMat = createTerrainMaterial();
    this.terrainMeshes = createTerrainMeshes(this.terrain, this.terrainMat);
    this.scene.add(this.terrainMeshes);

    await step(0.35, 'filling the cove');
    this.water = createWater(this.pipeline);
    this.scene.add(this.water);
    this.sky = createSky();
    this.scene.add(this.sky);
    this.mountains = createMountains();
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

  // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer
  updateShadow(focus) {
    const sun = this.sun;
    const cam = sun.shadow.camera;
    const size = cam.right - cam.left;
    const texel = size / sun.shadow.mapSize.x;
    const dir = G.uSunDir.value;
    // build light space basis
    const fwd = dir.clone().negate();
    const up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const lup = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const px = Math.round(focus.dot(right) / texel) * texel;
    const py = Math.round(focus.dot(lup) / texel) * texel;
    const pz = focus.dot(fwd);
    const snapped = new THREE.Vector3().addScaledVector(right, px).addScaledVector(lup, py).addScaledVector(fwd, pz);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(dir, 200);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  update(dt, camera, focus) {
    G.uTime.value += dt;
    this.atmosphere.update(dt);
    this.sky.position.copy(camera.position);
    this.updateShadow(focus);
  }
}
