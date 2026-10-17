// The loading screen: a dark, warm room with Hank's voxel skull (red toque and all)
// turning slowly in a soft hearth-coloured rim light, and a thin progress bar. No words.
//
// The skull has a tiny renderer of its own (a second, small WebGL canvas: one mesh, two
// little shaders), drawn at a low resolution and scaled up by whole pixels with a one-pixel
// ink outline, so it reads as crisp pixel art like the game. It costs a few milliseconds to
// set up and well under one to draw, so it never holds up the world being built behind it;
// it is torn down (and its context released) as soon as the loading screen goes.
import * as THREE from 'three';
import { CHARACTERS, buildHead, buildJaw, VS } from '../voxel/models/characters.js';
import { meshVox } from '../voxel/mesh.js';
import { EMIT } from '../voxel/vox.js';
import { leafCover, leafReveal } from '../ui/leaves.js';

const ART = 104; // the skull's canvas, in art pixels (square)
const INK = [0x1e / 255, 0x14 / 255, 0x18 / 255];
const BG = '#1a1014';

// voxel colours carry baked AO (rgb) and glow (a); lit by a warm key, a plum sky fill and
// a strong warm rim from behind, output straight to sRGB
const VERT = /* glsl */ `
attribute vec4 color4;
varying vec4 vC;
varying vec3 vN;
varying vec3 vV;
void main() {
  vC = color4;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */ `
precision highp float;
varying vec4 vC;
varying vec3 vN;
varying vec3 vV;
uniform vec3 uKey;
uniform vec3 uRim;
uniform float uGlow;
void main() {
  vec3 n = normalize(vN);
  float key = max(dot(n, uKey), 0.0);
  float rim = max(dot(n, uRim), 0.0);
  float edge = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.0);
  float sky = 0.5 + 0.5 * n.y;
  // the hearth sits behind and to the right: faces turning away catch it, and anything
  // seen edge-on picks up a warm fringe (stronger on the hearth's side)
  vec3 light = vec3(1.0, 0.84, 0.64) * key * 1.05
    + mix(vec3(0.04, 0.02, 0.03), vec3(0.13, 0.09, 0.15), sky)
    + vec3(1.0, 0.42, 0.14) * (rim * 1.9 + edge * (0.35 + 1.1 * rim));
  vec3 c = vC.rgb * light;
  c = mix(c, vC.rgb * (1.4 + uGlow * 0.6), vC.a);
  c = c / (1.0 + c * 0.18); // soft shoulder so the rim never clips flat
  gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;
// the low-res frame, upscaled 1:1 with a one-pixel ink line around the silhouette
const OUT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const OUT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uPx;
uniform vec3 uInk;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  if (c.a > 0.5) { gl_FragColor = vec4(c.rgb, 1.0); return; }
  float a = texture2D(uTex, vUv + vec2(uPx.x, 0.0)).a + texture2D(uTex, vUv - vec2(uPx.x, 0.0)).a
    + texture2D(uTex, vUv + vec2(0.0, uPx.y)).a + texture2D(uTex, vUv - vec2(0.0, uPx.y)).a;
  gl_FragColor = a > 0.5 ? vec4(uInk, 1.0) : vec4(0.0);
}`;

// ---------------------------------------------------------------- the skull stage
class SkullStage {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' }));
    r.setPixelRatio(1);
    r.setSize(ART, ART, false);
    r.setClearColor(0x000000, 0);
    this.rt = new THREE.WebGLRenderTarget(ART, ART, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    this.camera.position.set(0, 0.12, 2.95);
    this.camera.lookAt(0, 0.0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uKey: { value: new THREE.Vector3(-0.55, 0.55, 0.65).normalize() }, uRim: { value: new THREE.Vector3(0.9, 0.3, -0.3).normalize() }, uGlow: { value: 0 } },
    });
    // Hank's own head (the game's model), with a warm ember in each socket
    const spec = CHARACTERS.hank;
    const head = buildHead(spec);
    for (const s of head.face.sockets) {
      const x = Math.round(s.x - 1), z = head.face.z - 1;
      for (const dx of [0, 1]) for (const y of [5, 6]) head.vox.set(x + dx, y, z, (y === 6 && dx === 0 ? 0xfff0c0 : 0xffb050) | EMIT);
    }
    const jaw = buildJaw(spec);
    this.geos = [meshVox(head.vox, { size: VS, origin: head.origin }), meshVox(jaw.vox, { size: VS, origin: jaw.origin })];
    // spin about the skull's middle: the pivot sits half a head up, toque included
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    const off = -0.47;
    this.head = new THREE.Mesh(this.geos[0], this.mat);
    this.head.position.y = off;
    this.pivot.add(this.head);
    this.jawJ = new THREE.Group();
    this.jawJ.position.set(0, off, (3 - spec.head.d / 2) * VS);
    this.pivot.add(this.jawJ);
    this.jawJ.add(new THREE.Mesh(this.geos[1], this.mat));
    // the outline pass
    this.outMat = new THREE.ShaderMaterial({
      vertexShader: OUT_VERT, fragmentShader: OUT_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: this.rt.texture }, uPx: { value: new THREE.Vector2(1 / ART, 1 / ART) }, uInk: { value: new THREE.Vector3(...INK) } },
    });
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeo, this.outMat);
    this.quad.frustumCulled = false;
    this.outScene = new THREE.Scene();
    this.outScene.add(this.quad);
    this.t = 0;
  }

  draw(dt) {
    this.t += dt;
    const t = this.t;
    // a slow turn that lingers a little when the face comes round, a gentle bob and nod
    const p = this.pivot;
    p.rotation.y = t * 0.7 - Math.sin(t * 0.7) * 0.22 + 0.5;
    p.rotation.x = Math.sin(t * 0.9) * 0.05;
    p.rotation.z = Math.sin(t * 0.6 + 1) * 0.06;
    p.position.y = Math.sin(t * 1.4) * 0.025;
    // now and then a little clack of the jaw
    const c = (t % 3.4) / 3.4;
    this.jawJ.rotation.x = c > 0.86 ? Math.sin(((c - 0.86) / 0.14) * Math.PI * 2) ** 2 * 0.28 : 0;
    this.mat.uniforms.uGlow.value = 0.5 + 0.5 * Math.sin(t * 2.2);
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.outScene, this.camera);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.quadGeo.dispose();
    this.mat.dispose();
    this.outMat.dispose();
    this.rt.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

// ---------------------------------------------------------------- the loading screen
export class Loader3D {
  constructor(pipeline) {
    this.pl = pipeline;
    this.p = 0;
    this.shown = 0;
    this.running = false;
    this.last = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const boot = document.getElementById('boot');
    if (boot) boot.style.display = 'none';
    this.ui = document.getElementById('ui');
    if (this.ui) this.ui.style.visibility = 'hidden';
    const root = document.createElement('div');
    root.id = 'loader3d';
    root.style.cssText = `position:fixed;inset:0;z-index:150;pointer-events:none;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;`;
    // a warm glow in the middle of the dark, like a hearth just out of sight
    root.style.backgroundImage = 'radial-gradient(circle at 50% 46%, rgba(120,52,30,0.38) 0%, rgba(70,30,26,0.2) 22%, rgba(26,16,20,0) 48%)';
    const skull = document.createElement('canvas');
    skull.width = skull.height = ART;
    skull.style.cssText = 'image-rendering:pixelated;';
    const track = document.createElement('div');
    track.style.cssText = 'width:min(180px,46vw);height:2px;background:#3a2a32;overflow:hidden;';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:100%;width:100%;background:#e8dcc0;transform-origin:left;transform:scaleX(0);';
    track.appendChild(bar);
    root.append(skull, track);
    document.body.appendChild(root);
    this.dom = root;
    this.bar = bar;
    try {
      this.stage = new SkullStage(skull);
    } catch (e) {
      // no WebGL for a second canvas: the bar alone will do
      console.warn('loader skull', e);
      skull.remove();
      this.stage = null;
    }
    this.place = () => {
      // a whole number of device pixels per art pixel
      const dpr = window.devicePixelRatio || 1;
      const P = Math.max(1, Math.round((Math.min(innerWidth, innerHeight) * dpr * 0.42) / ART));
      skull.style.width = skull.style.height = `${(ART * P) / dpr}px`;
    };
    this.place();
    addEventListener('resize', this.place);
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

  // the world calls this between building steps (the main thread is busy in between, so
  // the skull also turns here)
  progress(p, label) {
    this.p = Math.max(this.p, p);
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
    if (this.p >= 1 && this.shown > 0.97) this.shown = 1;
    this.bar.style.transform = `scaleX(${this.shown.toFixed(3)})`;
    try {
      this.stage?.draw(dt);
    } catch (e) {
      console.warn('loader skull', e);
      this.stage = null;
    }
  }

  // fill the bar, then fade away
  async finish(quick = false) {
    if (!this.running) return;
    this.p = 1;
    if (!quick) {
      const t0 = performance.now();
      await new Promise((r) => {
        const wait = () => (this.shown >= 1 || performance.now() - t0 > 1200 ? r() : requestAnimationFrame(wait));
        wait();
      });
      await leafCover({ layer: 'front', dur: 0.3 });
    }
    this.running = false;
    removeEventListener('resize', this.place);
    this.stage?.dispose();
    this.stage = null;
    this.dom.remove();
    if (this.ui) this.ui.style.visibility = '';
    if (!quick) leafReveal({ layer: 'front', dur: 0.4 });
  }
}
