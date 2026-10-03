// Live 3D portraits: the real voxel character, animated (blinking, talking, pulling
// faces), drawn into a small canvas for the pop-ups, the dialogue box and the order
// book. One tiny shared WebGL renderer draws every portrait; each portrait copies the
// frame into its own 2D canvas, so any number can be on screen.
//   const p = new LivePortrait(game, { size: 160 });
//   host.appendChild(p.canvas); p.set('gus', 'happy'); p.talk(true);
// A portrait animates by itself while its canvas is in the page and stops when removed.
import * as THREE from 'three';
import { VoxelCharacter } from '../game/vchar.js';
import { G } from '../render/shaderlib.js';

const ID = (id) => (id === 'kids' ? 'pip' : id === 'lou_lh' ? 'ollie' : id === 'hankBuried' ? 'hank' : id);
const STUDIO = [
  ['uSunDir', new THREE.Vector3(0.55, 0.75, 0.6).normalize()],
  ['uSunColor', new THREE.Color(1.05, 0.95, 0.85)],
  ['uSkyAmb', new THREE.Color(0.52, 0.52, 0.62)],
  ['uGroundAmb', new THREE.Color(0.32, 0.25, 0.2)],
  ['uNight', 0], ['uWet', 0], ['uSnow', 0],
];
const FPS = 30;

// the shared renderer: scene -> linear target -> gamma + ink outline -> canvas
let R = null;
function shared() {
  if (R) return R.ok ? R : null;
  R = { ok: false };
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const blit = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, px: { value: new THREE.Vector2() }, outline: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D t; uniform vec2 px; uniform float outline; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(t, vUv);
          if (c.a > 0.01) { gl_FragColor = vec4(pow(clamp(c.rgb, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return; }
          float n = texture2D(t, vUv + vec2(px.x, 0.0)).a + texture2D(t, vUv - vec2(px.x, 0.0)).a
                  + texture2D(t, vUv + vec2(0.0, px.y)).a + texture2D(t, vUv - vec2(0.0, px.y)).a;
          if (outline > 0.5 && n > 0.01 && vUv.y > px.y * 2.0) gl_FragColor = vec4(0.118, 0.078, 0.094, 1.0);
          else gl_FragColor = vec4(0.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit);
    quad.frustumCulled = false;
    const blitScene = new THREE.Scene();
    blitScene.add(quad);
    R = { ok: true, canvas, renderer, blit, blitScene, blitCam: new THREE.Camera(), rt: null, size: 0 };
  } catch (e) {
    console.warn('live portraits unavailable', e);
  }
  return R.ok ? R : null;
}

export class LivePortrait {
  constructor(game, { size = 160, bust = true, yaw = 0.3, outline = true, bg = null } = {}) {
    this.game = game;
    this.size = size;
    this.bust = bust;
    this.yaw = yaw;
    this.outline = outline;
    this.bg = bg;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.canvas.className = 'live3d';
    this.ctx = this.canvas.getContext('2d');
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(bust ? 24 : 28, 1, 0.05, 30);
    this.ch = null;
    this.id = null;
    this.expr = 'happy';
    this.talking = false;
    this.acc = 1;
    this.last = 0;
    this.raf = 0;
    this.moodT = 0;
  }

  // who and which face; a new character is built only when the id changes
  set(id, expr = 'happy') {
    id = ID(id);
    if (id !== this.id) {
      this.ch?.dispose();
      this.ch = null;
      this.id = id;
      try {
        this.ch = new VoxelCharacter({ scene: this.scene, physics: null }, id, { y: 0, yaw: this.yaw, anim: 'idle', expr, cloth: true, shadow: false });
        for (let i = 0; i < 20; i++) this.ch.update(1 / 60, this.cam.position);
        this.frame();
      } catch (e) {
        console.warn('portrait failed', id, e);
      }
    }
    if (expr !== this.expr || !this.ch?._pExpr) {
      this.expr = expr;
      if (this.ch) {
        this.ch._pExpr = true;
        this.ch.setExpr(expr);
        // a big face change gets a little body reaction too
        const R2 = { shock: 'gasp', surprised: 'gasp', laugh: 'laugh', sparkle: 'love', love: 'love', angry: 'angry', worried: 'shake', sheepish: 'nod', happy: 'nod' }[expr];
        if (R2) try { this.ch.react(R2); } catch { /* not every rig knows every reaction */ }
        this.ch.kick?.('sq', 1.2);
      }
    }
    this.start();
    return this;
  }

  talk(on) {
    this.talking = !!on;
    if (this.ch) this.ch.play(on ? 'talk' : 'idle', this.expr);
  }

  // head-and-shoulders (or whole head) framing around the posed character
  frame() {
    const ch = this.ch;
    ch.root.updateMatrixWorld(true);
    const head = ch.headWorld();
    const hH = ch.P.headH;
    const cam = this.cam;
    if (this.bust) {
      const top = head.y + 0.14, bot = head.y - hH - 0.42;
      const cy = (top + bot) / 2, half = (top - bot) / 2;
      const d = half / Math.tan(THREE.MathUtils.degToRad(12));
      cam.position.set(0.12, cy + 0.08, d);
      cam.lookAt(0, cy, 0);
    } else {
      const hy = head.y - hH * 0.45;
      cam.position.set(0.25, hy + 0.05, 1.6 + hH);
      cam.lookAt(0, hy - 0.06, 0);
    }
  }

  start() {
    if (this.raf) return;
    this.last = this.seen = performance.now();
    const loop = (now) => {
      this.raf = 0;
      // stops on its own once the canvas has left the page (a pop-up ducked, a page closed)
      if (this.canvas.isConnected) this.seen = now;
      else if (now - (this.seen || 0) > 600) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  tick(dt) {
    const ch = this.ch;
    if (!ch) return;
    // keep the character alive: glances, little bounces while talking
    this.moodT -= dt;
    if (this.moodT <= 0) {
      this.moodT = 0.8 + Math.random() * 2;
      if (this.talking && Math.random() < 0.5) ch.kick?.('sq', 1.08 + Math.random() * 0.08);
    }
    if (this.talking) ch.say(0.3);
    ch.update(dt, this.cam.position);
    this.acc += dt;
    if (this.acc < 1 / FPS || !this.canvas.isConnected) return;
    this.acc = 0;
    this.render();
  }

  render() {
    const S = shared();
    if (!S) return;
    const n = this.size;
    const { renderer } = S;
    if (S.size !== n) {
      S.size = n;
      renderer.setSize(n, n, false);
      S.rt?.dispose();
      S.rt = new THREE.WebGLRenderTarget(n, n, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    }
    const keep = STUDIO.map(([k]) => G[k].value);
    for (const [k, v] of STUDIO) G[k].value = v;
    try {
      renderer.setRenderTarget(S.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.scene, this.cam);
      renderer.setRenderTarget(null);
      S.blit.uniforms.t.value = S.rt.texture;
      S.blit.uniforms.px.value.set(1 / n, 1 / n);
      S.blit.uniforms.outline.value = this.outline ? 1 : 0;
      renderer.clear();
      renderer.render(S.blitScene, S.blitCam);
    } finally {
      STUDIO.forEach(([k], i) => (G[k].value = keep[i]));
    }
    const c = this.ctx;
    c.clearRect(0, 0, n, n);
    if (this.bg) { c.fillStyle = this.bg; c.fillRect(0, 0, n, n); }
    c.drawImage(S.canvas, 0, 0);
  }

  // build the shaders ahead of time so the first pop-up doesn't hitch
  warm() {
    if (!this.ch) this.set('hank', 'happy');
    this.render();
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ch?.dispose();
    this.ch = null;
    this.id = null;
  }
}
