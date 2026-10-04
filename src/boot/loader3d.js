// The loading screen: plain black and wordless, with the real 3D voxel Hank running
// on the spot above a pixel-art skull - his own, red toque and all - that fills up
// bone-white from the jaw to the pom-pom as the village builds; at 100% its eyes
// light up a warm orange and a gust of leaves sweeps the loading screen away.
// The little stage (RunStage) is a tiny scene of
// its own: one skeleton, a blob shadow and a few road dashes slipping past, lit
// by a studio key light. It renders through the game's pipeline (so it gets the
// same outlines and grading) while the world builds, and the title screen reuses
// it on a dark plum background.
import * as THREE from 'three';
import { VoxelCharacter } from '../game/vchar.js';
import { G } from '../render/shaderlib.js';
import { leafCover, leafReveal } from '../ui/leaves.js';

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

// ---------------------------------------------------------------- the skull progress bar
// Hank's skull in his red toque, 30 x 32 art pixels, painted in code: `full` is the
// finished picture, `empty` its dark silhouette, `eyes` the socket centres.
const SW = 30, SH = 32;
const INK = 0x1e1418;
const BONE = [0xfff4dc, 0xe8dcc0, 0xc8b898, 0x9a8a72];
const RED = [0xf05a3a, 0xc8361f, 0x8a1e14];
const CREAM = [0xfffbea, 0xf2e6c8, 0xc8b898];
let SKULL = null;
function skullArt() {
  if (SKULL) return SKULL;
  const col = new Int32Array(SW * SH).fill(-1);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < SW && y < SH) col[y * SW + x] = c; };
  const cx = 14.5;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const px = x + 0.5, py = y + 0.5;
    // cranium and cheekbones, then the jaw
    const cr = ((px - cx) / 11) ** 2 + ((py - 19) / 9) ** 2 <= 1 && (py < 23 || Math.abs(px - cx) <= 10.2 - (py - 23) * 1.3);
    const jaw = py >= 23 && py <= 30 && Math.abs(px - cx) <= (py > 28.5 ? 5.5 : 6.5);
    if (cr || jaw) {
      const l = -(px - cx) * 0.55 - (py - 18) * 0.7;
      set(x, y, l > 4.5 ? BONE[0] : l > -3.5 ? BONE[1] : l > -7.5 ? BONE[2] : BONE[3]);
    }
  }
  // teeth and the mouth line
  for (let x = 9; x <= 20; x++) {
    set(x, 25, INK);
    if (x % 2 === 0) { set(x, 24, BONE[3]); set(x, 26, BONE[3]); }
  }
  // the nose
  set(14, 22, INK); set(15, 22, INK); set(14, 23, INK); set(15, 23, BONE[3]);
  // eye sockets
  const eyes = [[9.5, 19.5], [19.5, 19.5]];
  for (const [ex, ey] of eyes) for (let y = 15; y < 24; y++) for (let x = Math.floor(ex - 4); x < ex + 4; x++) {
    if (((x + 0.5 - ex) / 3.1) ** 2 + ((y + 0.5 - ey) / 2.7) ** 2 <= 1) set(x, y, INK);
  }
  // the toque: a ribbed red dome, a cream turned-up band and a pom-pom
  for (let y = 4; y <= 12; y++) for (let x = 0; x < SW; x++) {
    if (((x + 0.5 - cx) / 11.5) ** 2 + ((y + 0.5 - 12.5) / 8.2) ** 2 > 1) continue;
    set(x, y, (x + 1) % 3 === 0 ? RED[2] : x < 11 && y < 10 ? RED[0] : RED[1]);
  }
  for (let y = 11; y <= 14; y++) for (let x = 3; x <= 26; x++) {
    if ((y === 11 || y === 14) && (x === 3 || x === 26)) continue;
    set(x, y, y === 14 ? CREAM[2] : x % 2 ? CREAM[1] : CREAM[0]);
  }
  for (let y = 0; y < 7; y++) for (let x = 10; x < 20; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 3.4);
    if (d <= 3.1) set(x, y, d < 1.6 && x < 15 ? CREAM[0] : x + y > 19 ? CREAM[2] : CREAM[1]);
  }
  // an ink outline around everything
  const out = col.slice();
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (col[y * SW + x] >= 0) continue;
    if ((x > 0 && col[y * SW + x - 1] >= 0) || (x < SW - 1 && col[y * SW + x + 1] >= 0) || (y > 0 && col[(y - 1) * SW + x] >= 0) || (y < SH - 1 && col[(y + 1) * SW + x] >= 0)) out[y * SW + x] = INK;
  }
  const full = new Uint8ClampedArray(SW * SH * 4), empty = new Uint8ClampedArray(SW * SH * 4);
  const put = (d, i, c) => { d[i * 4] = (c >> 16) & 255; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255; };
  for (let i = 0; i < SW * SH; i++) {
    const c = out[i];
    if (c < 0) continue;
    put(full, i, c);
    // the empty skull: a dim plum silhouette with a slightly lighter rim
    put(empty, i, col[i] < 0 ? 0x4a3842 : c === INK ? 0x140c10 : 0x2a1e26);
  }
  SKULL = { full, empty, eyes, bone: col };
  return SKULL;
}

// ---------------------------------------------------------------- the loading screen
export class Loader3D {
  constructor(pipeline) {
    this.pl = pipeline;
    this.p = 0;
    this.shown = 0;
    this.running = false;
    this.last = 0;
    this.glowT = 0;
    this.key = '';
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
    root.style.cssText = 'position:fixed;inset:0;z-index:150;pointer-events:none;';
    // no words anywhere: the skull is the progress bar
    const skull = document.createElement('canvas');
    skull.width = SW;
    skull.height = SH;
    skull.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;';
    root.appendChild(skull);
    document.body.appendChild(root);
    this.dom = root;
    this.skull = skull;
    this.sctx = skull.getContext('2d');
    this.simg = this.sctx.createImageData(SW, SH);
    this.place = () => {
      // a whole number of device pixels per art pixel, on whole device pixels
      const dpr = window.devicePixelRatio || 1;
      const dw = innerWidth * dpr, dh = innerHeight * dpr;
      const P = Math.max(1, Math.floor(Math.min(dw, dh) / 180));
      const s = skull.style;
      s.width = `${(SW * P) / dpr}px`;
      s.height = `${(SH * P) / dpr}px`;
      s.left = `${Math.round((dw - SW * P) / 2) / dpr}px`;
      s.top = `${Math.round(dh * (innerWidth < innerHeight ? 0.64 : 0.68)) / dpr}px`;
    };
    this.place();
    addEventListener('resize', this.place);
    try {
      this.stage = new RunStage({ bg: 0x000000 });
      this.stage.fy = 0.12;
      this.stage.size = innerWidth < innerHeight ? 0.22 : 0.3;
    } catch (e) {
      // no WebGL stage? the skull alone will do
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

  // the skull fills from the jaw up in whole art-pixel rows; redrawn only when a row changes
  drawSkull(dt) {
    const art = skullArt();
    const rows = Math.round(Math.min(1, this.shown) * SH);
    const done = this.shown >= 1;
    if (done) this.glowT += dt;
    const glow = done ? (Math.floor(this.glowT * 7) % 6 === 5 ? 1 : 2) : 0;
    const key = `${rows}|${glow}`;
    if (key === this.key) return;
    this.key = key;
    const d = this.simg.data, cut = SH - rows;
    for (let y = 0; y < SH; y++) d.set((y >= cut ? art.full : art.empty).subarray(y * SW * 4, (y + 1) * SW * 4), y * SW * 4);
    // the rising level catches the light
    if (rows > 0 && rows < SH) for (let x = 0; x < SW; x++) {
      const c = art.bone[cut * SW + x];
      if (c < 0 || c === INK) continue;
      const i = (cut * SW + x) * 4;
      d[i] = 255; d[i + 1] = 251; d[i + 2] = 234; d[i + 3] = 255;
    }
    // full: the eyes light up a warm orange with a bright core (and flicker now and then)
    if (glow) for (const [ex, ey] of art.eyes) {
      const px = (x, y, c) => { const i = (y * SW + x) * 4; d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; };
      const x0 = Math.floor(ex), y0 = Math.floor(ey);
      const hot = glow === 2;
      for (let y = y0 - 1; y <= y0 + 1; y++) for (let x = x0 - 2; x <= x0 + 1; x++) px(x, y, hot ? 0xc8461c : 0x8e2e16);
      px(x0 - 1, y0, hot ? 0xff9a3a : 0xe86a26);
      px(x0, y0, hot ? 0xff9a3a : 0xe86a26);
      px(x0 - 1, y0 - 1, hot ? 0xffd84a : 0xffa040);
      px(x0, y0 - 1, hot ? 0xfff2a0 : 0xffb347);
    }
    this.sctx.putImageData(this.simg, 0, 0);
  }

  frame(dt) {
    if (!this.running) return;
    this.shown += (this.p - this.shown) * Math.min(1, dt * 6);
    if (this.p >= 1 && this.shown > 0.97) this.shown = 1;
    this.drawSkull(dt);
    if (this.stage) {
      // never let the little stage break the world build that calls progress()
      try {
        this.stage.update(dt);
        this.stage.render(this.pl);
      } catch (e) {
        console.warn(e);
        this.stage = null;
        this.dom.style.background = '#000';
      }
    }
  }

  // the skull fills and its eyes light up, then a gust of leaves sweeps the loading
  // screen away and blows off the title underneath
  async finish(quick = false) {
    if (!this.running) return;
    this.p = 1;
    if (!quick) {
      const t0 = performance.now();
      await new Promise((r) => {
        const wait = () => ((this.shown >= 1 && this.glowT > 0.45) || performance.now() - t0 > 1500 ? r() : requestAnimationFrame(wait));
        wait();
      });
      await leafCover({ layer: 'front', dur: 0.6, dir: 1 });
    }
    this.running = false;
    removeEventListener('resize', this.place);
    this.dom.remove();
    if (this.ui) this.ui.style.visibility = '';
    this.stage?.dispose();
    this.stage = null;
    if (!quick) leafReveal({ layer: 'front', dur: 0.85, dir: 1 });
  }
}
