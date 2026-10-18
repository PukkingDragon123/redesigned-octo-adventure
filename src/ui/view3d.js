// The 3D interface: the brass compass Hank holds up in front of his face, and the
// little 3D compass in the screen corner. Both are drawn as pixel art: rendered small,
// one render pixel per art pixel of the UI kit (--u), into a target with no
// anti-aliasing, then blown up nearest-neighbour onto the canvas, so their edges are
// the same crisp whole pixels as the rest of the interface.
//
// It is drawn straight onto the game canvas after the frame is finished (main.js calls
// render() once the pipeline has composited the world), with its own small scene,
// lights and camera, the way a first-person game draws the hands in front of the
// world: the depth is cleared, so the book never pokes into a wall. The corner things
// (the brass compass, the little journal) get their own scissored viewports.
//
// FirstPerson moves the game camera into Hank's skull while something is held up: it
// eases from wherever the chase camera (or a cutscene) has it to his eyes and back
// again, and hides his body so we look out from behind his eye sockets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { G } from '../render/shaderlib.js';
import { scale } from './kit.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

// ---------------------------------------------------------------- the camera in Hank's skull
export class FirstPerson {
  constructor(game) {
    this.g = game;
    this.t = 0; // 0 chase .. 1 in his eyes (linear; eased when applied)
    this.want = 0;
    this.k = 0;
    this.pitch = -0.2; // where he looks: a little down at what he holds
    this.yawOff = 0; // looking about (the compass view lets you turn your head)
    this.pitchOff = 0;
    this.eye = new THREE.Vector3();
    this.haveEye = false;
    this.fov = 58;
    this.from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 55 };
  }
  enter({ pitch = -0.2, fov = 58 } = {}) {
    this.want = 1;
    this.pitch = pitch;
    this.fov = fov;
    this.yawOff = this.pitchOff = 0;
  }
  exit() {
    this.want = 0;
  }
  get active() { return this.k > 0.001; }
  // whose eyes: Hank on the bike or on foot (not on the title, not while a cutscene has
  // put him somewhere else)
  char() {
    const g = this.g;
    if (g.mode === 'title' || !g.rider?.ch) return null;
    if (!g.rider.visible && !g.onFoot) return null;
    return g.rider.ch;
  }
  // called once a frame after everything has moved (game.update's very end)
  late(dt) {
    const g = this.g, cam = g.camera;
    const rate = this.want ? 1 / 0.55 : 1 / 0.45;
    this.t = Math.max(0, Math.min(1, this.t + (this.want ? rate : -rate) * dt));
    const ch = this.char();
    this.k = ch ? ease(this.t) : 0;
    if (this.k <= 0) { this.haveEye = false; return; }
    // the eye: in the skull, a touch forward of the face, smoothed so the head's little
    // idle nods don't shake the view
    const head = ch.headPiece;
    head.updateWorldMatrix(true, false);
    _v.set(0, ch.P.headH * 0.5, 0.09).applyMatrix4(head.matrixWorld);
    if (!this.haveEye || this.eye.distanceToSquared(_v) > 4) this.eye.copy(_v);
    else this.eye.lerp(_v, 1 - Math.exp(-dt * 14));
    this.haveEye = true;
    const yaw = (g.onFoot ? g.walker.yaw : g.bike.view?.yaw ?? g.bike.yaw) + this.yawOff;
    // characters face +z; a camera looks down its -z
    _e.set(this.pitch + this.pitchOff, yaw + Math.PI, 0, 'YXZ');
    _q.setFromEuler(_e);
    // blend from the chase camera's pose this frame
    const k = this.k;
    cam.position.lerp(this.eye, k);
    cam.quaternion.slerp(_q, k);
    const fov = cam.fov + (this.fov - cam.fov) * k;
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    // look out through his eye sockets, not at the back of his skull
    if (k > 0.35) {
      ch.root.visible = false;
      for (const c of ch.cloths || []) c.setVisible?.(false);
    }
  }
}

// ---------------------------------------------------------------- the overlay renderer
export class View3D {
  constructor(game) {
    this.g = game;
    const r = (this.r = game.pipeline.renderer);
    this.fp = new FirstPerson(game);
    // the held things (full screen) and the corner things (scissored)
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
    this.corner = new THREE.Scene();
    this.lights = [this.addLights(this.scene), this.addLights(this.corner)];
    try {
      const pm = new THREE.PMREMGenerator(r);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      this.scene.environment = this.env;
      this.corner.environment = this.env;
    } catch (e) {
      console.warn('view3d: no environment map', e);
    }
    // things that register: { visible(), render(view, r) } for full-screen and corner widgets
    this.held = [];
    this.widgets = [];
    // the low-resolution pass and the nearest-neighbour blow-up
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    this.blitMat = new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, depthTest: false, depthWrite: false });
    this.blitScene = new THREE.Scene();
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat));
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._cc = new THREE.Color();
    this.canvasRect = null;
    window.addEventListener('resize', () => (this.canvasRect = null));
  }
  addLights(scene) {
    const hemi = new THREE.HemisphereLight(0xfff0dc, 0x4a3428, 0.75);
    const key = new THREE.DirectionalLight(0xfff2de, 1.5);
    key.position.set(-0.5, 1.1, 1.3);
    const rim = new THREE.DirectionalLight(0xffc890, 0.7);
    rim.position.set(1.2, 0.4, -0.6);
    scene.add(hemi, key, rim);
    return { hemi, key, rim };
  }
  // the canvas's box in CSS pixels (the 3D pages and the corner buttons are placed in it)
  rect() {
    if (!this.canvasRect) {
      const b = this.g.pipeline.canvas.getBoundingClientRect();
      this.canvasRect = { left: b.left, top: b.top, width: b.width || innerWidth, height: b.height || innerHeight };
    }
    return this.canvasRect;
  }
  // a CSS-pixel box -> canvas pixels [x, y-from-bottom, w, h]
  toCanvas(box) {
    const R = this.rect(), P = this.g.pipeline;
    const sx = P.w / R.width, sy = P.h / R.height;
    const x = Math.round((box.left - R.left) * sx), w = Math.round(box.width * sx), h = Math.round(box.height * sy);
    const y = Math.round(P.h - (box.top - R.top) * sy - h);
    return [x, y, w, h];
  }
  // daylight on the held things: bright by day, a warm low lantern glow at night
  light() {
    const night = G.uNight?.value ?? 0;
    const sc = G.uSunColor?.value;
    for (const L of this.lights) {
      L.hemi.intensity = 0.75 - night * 0.35;
      L.key.intensity = 1.5 - night * 0.75;
      if (sc) L.key.color.setRGB(0.75 + Math.min(0.25, sc.r * 0.2), 0.7 + Math.min(0.25, sc.g * 0.2), 0.62 + Math.min(0.3, sc.b * 0.2));
      L.rim.intensity = 0.7 + night * 0.5;
    }
    const e = 0.45 - night * 0.2;
    this.scene.environmentIntensity = e;
    this.corner.environmentIntensity = e;
  }
  update(dt) {
    for (const h of this.held) h.update?.(dt);
    for (const w of this.widgets) w.update?.(dt);
  }
  // once a frame, after the game moved everything (the first-person camera goes last)
  late(dt) {
    this.fp.late(dt);
  }
  // one art pixel in canvas pixels
  artPx() {
    const R = this.rect();
    return Math.max(1, Math.round((scale.u * this.g.pipeline.w) / R.width));
  }
  // draw a scene into the canvas box [x, y-from-bottom, w, h] at k canvas pixels a pixel
  pixelRender(scene, cam, x, y, w, h, k) {
    const r = this.r;
    const lw = Math.max(1, Math.ceil(w / k)), lh = Math.max(1, Math.ceil(h / k));
    if (this.rt.width !== lw || this.rt.height !== lh) this.rt.setSize(lw, lh);
    r.setRenderTarget(this.rt);
    r.setScissorTest(false);
    r.setViewport(0, 0, lw, lh);
    r.clear(true, true, false);
    cam.aspect = (lw * k) / (lh * k);
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    r.setRenderTarget(null);
    // the top-left corner stays put (on the UI's pixel grid); the overhang is clipped
    r.setScissorTest(true);
    r.setScissor(x, y, w, h);
    r.setViewport(x, y + h - lh * k, lw * k, lh * k);
    r.render(this.blitScene, this.blitCam);
    r.setScissorTest(false);
  }
  render() {
    const P = this.g.pipeline, r = this.r;
    const held = this.held.filter((h) => h.visible());
    const fade = P.post.uFade.value;
    const corners = fade < 0.25 ? this.widgets.filter((w) => w.visible()) : [];
    if (!held.length && !corners.length) return;
    const prevAuto = r.autoClear, prevCS = r.outputColorSpace;
    r.getClearColor(this._cc);
    const prevA = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.light();
    const k = this.artPx();
    if (held.length) {
      for (const h of this.held) h.root.visible = held.includes(h);
      this.pixelRender(this.scene, this.cam, 0, 0, P.w, P.h, k);
    }
    if (corners.length) {
      for (const w of this.widgets) w.root.visible = false;
      for (const w of corners) {
        const [x, y, cw, ch] = this.toCanvas(w.box());
        if (cw < 2 || ch < 2) continue;
        w.root.visible = true;
        this.pixelRender(this.corner, w.cam, x, y, cw, ch, k);
        w.root.visible = false;
      }
    }
    r.setViewport(0, 0, P.w, P.h);
    r.setClearColor(this._cc, prevA);
    r.autoClear = prevAuto;
    r.outputColorSpace = prevCS;
  }
}

export { ease };
