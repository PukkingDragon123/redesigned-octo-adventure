// The loading screen: plain black, with the real 3D voxel Hank running on the
// spot above a thin progress bar. The little stage (RunStage) is a tiny scene of
// its own: one skeleton, a blob shadow and a few road dashes slipping past, lit
// by a studio key light. It renders through the game's pipeline (so it gets the
// same outlines and grading) while the world builds, and the title screen reuses
// it on a dark plum background.
import * as THREE from 'three';
import { VoxelCharacter } from '../game/vchar.js';
import { G } from '../render/shaderlib.js';

const TIPS = [
  'the cocoa is getting cold...',
  'reattaching femurs...',
  'stacking firewood...',
  'polishing skulls...',
  'warming the marshmallows...',
  'raking the maple leaves...',
  'waking up the lumberjack...',
];

const DASHES = 14, DASH_GAP = 0.9;

// ---------------------------------------------------------------- the running stage
export class RunStage {
  constructor({ bg = 0x000000, dash = 0x4a3c42, speed = 4.2 } = {}) {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(bg);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    this.speed = speed;
    this.t = 0;
    // framing: fx/fy slide Hank across the screen (fractions of the half-size),
    // size is his height as a fraction of the screen height
    this.fx = 0;
    this.fy = 0.1;
    this.size = 0.3;
    this.ang = 0.95;
    this.fade = null; // own fade to black (null: follow the pipeline's)
    this.hank = new VoxelCharacter(null, 'hank', { parent: scene, y: 0, shadow: false });
    this.hank.scripted = true;
    // a soft blob shadow that runs with him
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    scene.add(this.shadow);
    // road dashes: recycled ahead of him as he passes them
    this.dashes = [];
    const dg = new THREE.BoxGeometry(0.05, 0.01, 0.45);
    const dm = new THREE.MeshBasicMaterial({ color: dash });
    for (let i = 0; i < DASHES; i++) {
      const m = new THREE.Mesh(dg, dm);
      m.position.set(0.32, 0.005, (i - 5) * DASH_GAP);
      scene.add(m);
      this.dashes.push(m);
    }
    this.geos = [this.shadow.geometry, dg];
    this.mats = [this.shadow.material, dm];
    // studio lights (swapped into the shared uniforms only while this stage renders)
    this.pl = Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 1));
    this.plc = Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0));
    this.plc[0].set(0.95, 0.5, 0.22); // a warm back glow, like a hearth behind him
    this.plc[1].set(0.2, 0.26, 0.45); // a cool fill from the other side
    this.update(0);
  }

  update(dt) {
    this.t += dt;
    const h = this.hank;
    // he really runs forward (so his scarf streams); the camera keeps pace
    h.pos.z += this.speed * dt;
    h.speedOverride = this.speed;
    h.targetYaw = 0;
    h.update(dt, this.camera.position);
    this.shadow.position.x = h.pos.x;
    this.shadow.position.z = h.pos.z + 0.03;
    const s = 1 - Math.min(0.4, h.hop * 0.8);
    this.shadow.scale.set(s, s, 1);
    for (const d of this.dashes) if (d.position.z < h.pos.z - 5 * DASH_GAP - 0.5) d.position.z += DASHES * DASH_GAP;
    this.frame();
  }

  frame() {
    const cam = this.camera, h = this.hank;
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
    cam.aspect = W / H;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const height = h.P.height;
    const r = height / (this.size * 2 * tan);
    const ang = this.ang + Math.sin(this.t * 0.23) * 0.12;
    const cy = h.pos.y + height * 0.52;
    cam.position.set(h.pos.x + Math.sin(ang) * r, cy + r * 0.12, h.pos.z + Math.cos(ang) * r);
    cam.lookAt(h.pos.x, cy, h.pos.z);
    // slide the lens so he sits where the layout wants him
    cam.translateX(-this.fx * r * tan * cam.aspect);
    cam.translateY(-this.fy * r * tan);
    cam.updateProjectionMatrix();
  }

  // render through the game's pipeline with studio lighting, then put the world's back
  render(pipeline) {
    const h = this.hank, P = pipeline.post;
    this.pl[0].set(h.pos.x - 1.1, h.pos.y + 1.5, h.pos.z - 1.3, 4.5);
    this.pl[1].set(h.pos.x - 2.2, h.pos.y + 1.0, h.pos.z + 0.6, 4);
    const keep = {
      dir: G.uSunDir.value.clone(), sun: G.uSunColor.value.clone(), sky: G.uSkyAmb.value.clone(), gnd: G.uGroundAmb.value.clone(),
      night: G.uNight.value, wet: G.uWet.value, snow: G.uSnow.value, pl: G.uPL.value, plc: G.uPLc.value,
      fog: P.uFogDensity.value, rays: P.uRays.value, cold: P.uCold.value, sat: P.uSaturation.value, fade: P.uFade.value, refl: pipeline.reflections,
    };
    G.uSunDir.value.set(0.55, 0.75, 0.45).normalize();
    G.uSunColor.value.setRGB(1.2, 0.98, 0.78);
    G.uSkyAmb.value.setRGB(0.34, 0.37, 0.56);
    G.uGroundAmb.value.setRGB(0.16, 0.1, 0.08);
    G.uNight.value = 0;
    G.uWet.value = 0;
    G.uSnow.value = 0;
    G.uPL.value = this.pl;
    G.uPLc.value = this.plc;
    P.uFogDensity.value = 0;
    P.uRays.value = 0;
    P.uCold.value = 0;
    P.uSaturation.value = 1.1;
    if (this.fade != null) P.uFade.value = this.fade;
    pipeline.reflections = false;
    pipeline.render(this.scene, this.camera);
    G.uSunDir.value.copy(keep.dir);
    G.uSunColor.value.copy(keep.sun);
    G.uSkyAmb.value.copy(keep.sky);
    G.uGroundAmb.value.copy(keep.gnd);
    G.uNight.value = keep.night;
    G.uWet.value = keep.wet;
    G.uSnow.value = keep.snow;
    G.uPL.value = keep.pl;
    G.uPLc.value = keep.plc;
    P.uFogDensity.value = keep.fog;
    P.uRays.value = keep.rays;
    P.uCold.value = keep.cold;
    P.uSaturation.value = keep.sat;
    P.uFade.value = keep.fade;
    pipeline.reflections = keep.refl;
  }

  dispose() {
    this.hank.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------- the loading screen
export class Loader3D {
  constructor(pipeline) {
    this.pl = pipeline;
    this.p = 0;
    this.shown = 0;
    this.running = false;
    this.tipI = 0;
    this.tipT = 0;
    this.last = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // the 3D stage draws into the game canvas, so the black boot cover goes
    // (the game's own UI stays hidden until the loader is gone)
    const boot = document.getElementById('boot');
    if (boot) boot.style.display = 'none';
    this.ui = document.getElementById('ui');
    if (this.ui) this.ui.style.visibility = 'hidden';
    const root = document.createElement('div');
    root.id = 'loader3d';
    root.style.cssText = 'position:fixed;inset:0;z-index:150;pointer-events:none;font-family:Monogram,monospace;';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:50%;top:72%;width:min(50vw,360px);height:3px;transform:translateX(-50%);background:#2a2024;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0;background:#f0a040;';
    bar.appendChild(fill);
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;left:0;right:0;top:calc(72% + 14px);text-align:center;color:#8a7a70;font-size:clamp(16px,2.6vmin,26px);line-height:1;';
    root.append(bar, tip);
    document.body.appendChild(root);
    this.dom = root;
    this.fill = fill;
    this.tip = tip;
    tip.textContent = TIPS[0];
    try {
      this.stage = new RunStage({ bg: 0x000000 });
      this.stage.fy = 0.12;
      this.stage.size = innerWidth < innerHeight ? 0.22 : 0.3;
    } catch (e) {
      // no WebGL stage? the bar alone will do
      console.warn(e);
      this.stage = null;
      root.style.background = '#000';
    }
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.frame(Math.min(0.05, (now - this.last) / 1000));
      this.last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.frame(0);
  }

  progress(p, label) {
    this.p = Math.max(this.p, p);
    // long synchronous build steps starve rAF; keep him running between them
    const now = performance.now();
    if (this.running && now - this.last > 50) {
      this.frame(Math.min(1 / 30, (now - this.last) / 1000));
      this.last = now;
    }
    void label;
  }

  frame(dt) {
    if (!this.running) return;
    this.shown += (this.p - this.shown) * Math.min(1, dt * 6);
    this.tipT += dt;
    if (this.tipT > 2.6) {
      this.tipT = 0;
      this.tipI = (this.tipI + 1) % TIPS.length;
      this.tip.textContent = TIPS[this.tipI];
    }
    this.fill.style.width = `${(Math.min(1, this.shown) * 100).toFixed(1)}%`;
    if (this.stage) {
      this.stage.update(dt);
      this.stage.render(this.pl);
    }
  }

  // fade to black (the title fades itself in underneath)
  async finish(quick = false) {
    if (!this.running) return;
    this.p = 1;
    if (!quick) {
      const t0 = performance.now();
      await new Promise((r) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 350);
          this.dom.style.opacity = String(1 - k);
          if (this.stage) this.stage.fade = k;
          if (k < 1) requestAnimationFrame(step);
          else r();
        };
        step();
      });
    }
    this.running = false;
    this.dom.remove();
    if (this.ui) this.ui.style.visibility = '';
    this.stage?.dispose();
    this.stage = null;
  }
}
