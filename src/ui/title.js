// Title screen: a live shot in the real world at golden hour. Hank sits in the grass on the
// knoll above Maple Cove (layout.js TITLE_HILL) with a steaming mug of Nana's cocoa, the
// village, the green and the harbour below him, the wind in the grass and the leaves; now
// and then a blue jay flutters in and lands on his toque (game/titleHill.js runs the little
// scene). The camera sits behind him over his left shoulder and drifts slowly.
//
// There is no flat interface on top. The game's name is written across the sky as a big
// fluffy cloud lit gold by the low sun (game/titleCloud.js), and the menu is a wooden
// signpost standing in the grass beside him, its painted arrows pointing the way: Continue,
// New Game, Settings, Controls (game/titleSign.js). Point at a board (or step through them
// with the arrow keys / d-pad) and it lights up and wiggles; click or tap it (Enter / A)
// and it swings round on its nail. Continue and New Game send the camera off the way the
// arrow points as the picture fades; Settings and Controls open Hank's journal over the
// shot. Behind the scenes the boards are mirrored by plain buttons (visually hidden) in
// the game's menu stack, so keyboard, gamepad and screen readers work exactly like
// every other menu.
import * as THREE from 'three';
import { hasSave } from '../game/state.js';
import { HillScene } from '../game/titleHill.js';
import { CloudTitle } from '../game/titleCloud.js';
import { Signpost } from '../game/titleSign.js';
import { fontsReady } from './type.js';
import { leafCover } from './leaves.js';
import { clamp, smoothstep, wrapAngle, easeInOut } from '../core/math.js';

// the light: a low autumn sun in the west-southwest, gold on the rooftops; the villagers
// keep a late-afternoon routine
const LIGHT_HOUR = 17.8;
const SCHED_HOUR = 16.6;
const FADE_IN = 1.8;
const SHADOW_SIZE = 90; // a wider shadow box so the village below keeps its shadows (gameplay uses 70)
// The camera, around Hank: its bearing from where he faces (a, radians towards his left;
// lean: the bearing it drifts round to while the bird visits, so his smile shows), distance
// d and height y (m), how far across the screen he sits (sx, 0 left .. 1 right), the pitch
// (radians, down < 0) and the horizontal field of view (degrees). Tall screens get him in
// the middle, a bit further off.
const CAM_WIDE = { a: 2.5, lean: 2.3, d: 4.7, y: 2.0, sx: 0.68, pitch: -0.19, hfov: 64 };
const CAM_TALL = { a: 2.7, lean: 2.5, d: 4.9, y: 2.3, sx: 0.53, pitch: -0.22, hfov: 58 };
// Where the cloud and the signpost go on the screen (NDC: -1 left/bottom .. 1 right/top),
// how much of the screen they may take, and the cloud's distance (m)
const CLOUD_WIDE = { x: -0.02, y: 0.7, w: 0.66, h: 0.3, d: 40 };
const CLOUD_TALL = { x: 0, y: 0.66, w: 0.84, h: 0.26, d: 40 };
const SIGN_WIDE = { x: -0.5, y: -0.08, w: 0.4, h: 0.48 };
const SIGN_TALL = { x: -0.12, y: -0.62, w: 0.84, h: 0.3 };
// the menu boards, top to bottom (Continue only with a saved game)
const BOARDS = {
  continue: { label: 'Continue', paint: 'green', dir: 1, go: true },
  new: { label: 'New Game', paint: 'red', dir: -1, go: true },
  settings: { label: 'Settings', paint: 'mustard', dir: 1 },
  controls: { label: 'Controls', paint: 'blue', dir: -1 },
};
// each board's resting angle round the post (radians; with its direction, the tip turns away)
const FAN = [0.32, 0.22, 0.4, 0.16];

const el = (tag, css = '', html = '') => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.innerHTML = html;
  return e;
};

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class TitleScreen {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.scene = null;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._rest = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.leaving = null;
    this.peek = null;
  }

  async show({ onContinue, onNew, onSettings, onControls }) {
    const g = this.g;
    // the scene goes up at once (black, fading in) so nothing pops in
    this.stage();
    // the letters are made from the pixel font: wait for it (never for long)
    await Promise.race([fontsReady(), new Promise((r) => setTimeout(r, 2500))]);
    if (!this.scene) return;
    const save = hasSave();
    const ids = save ? ['continue', 'new', 'settings', 'controls'] : ['new', 'settings', 'controls'];
    const fns = { continue: onContinue, new: onNew, settings: onSettings, controls: onControls };
    this.items = ids.map((id) => ({ id, ...BOARDS[id], fn: fns[id], sub: id === 'continue' ? `Day ${g.peekSave()?.day ?? 1}` : '' }));
    // the world: the signpost by Hank, the name in the sky
    this.sign = new Signpost(this.items);
    this.sign.setFan(this.items.map((it, i) => FAN[i % FAN.length] * it.dir));
    g.world.scene.add(this.sign);
    this.layout3d();
    // the DOM: the credits in the corner, and the boards' stand-in buttons (hidden: the
    // game's menu navigation, keyboard, gamepad and screen readers use them)
    const root = el('div', 'position:fixed;inset:0;z-index:40;pointer-events:none;color:#fff4e0;opacity:0;');
    root.id = 'title3d';
    const shade = el('div', 'position:absolute;left:0;right:0;bottom:0;height:calc(var(--us) * 40);background:linear-gradient(to top, rgba(24,14,20,0.45), rgba(24,14,20,0));');
    const foot = el('div', 'position:absolute;right:calc(var(--us) * 4);bottom:calc(var(--us) * 3);font-size:var(--tfs);line-height:calc(var(--us) * 12);text-align:right;color:#f2dcc0;text-shadow:var(--us) var(--us) 0 #1e1418;',
      'Autumn in Maple Cove<br>type: Pixelify Sans by Stefie Justprince (OFL) &middot; monogram by datagoblin (CC0) &middot; BoldPixels by YukiPixels (CC BY-SA 4.0)');
    const sr = el('div', 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;');
    sr.setAttribute('role', 'menu');
    sr.setAttribute('aria-label', 'Deli-very-dead');
    this.buttons = this.items.map((it, i) => {
      const b = el('button', '', it.label + (it.sub ? `, ${it.sub}` : ''));
      b.className = 'title-sb';
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      b.addEventListener('click', () => this.activate(i));
      // left / right step through the boards too
      b.nudge = (d) => this.select((this.m.sel + d + this.items.length) % this.items.length);
      sr.appendChild(b);
      return b;
    });
    root.append(shade, foot, sr);
    document.body.appendChild(root);
    this.root = root;
    this.onResize = () => { this.layoutDirty = true; };
    addEventListener('resize', this.onResize);
    // hook into the game's menu navigation (arrow keys / pad / confirm)
    const m = { ov: root, items: this.buttons, sel: 0, onBack: null, title: true };
    this.m = m;
    g.ui.menuStack.push(m);
    this.select(0);
    // the pointer: aim at a board to pick it, click / tap to go
    this.onMove = (e) => this.pointer(e, false);
    this.onDown = (e) => this.pointer(e, true);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerdown', this.onDown);
  }

  // is the signpost the thing being used (no book open over it, not on the way out)?
  live() {
    const S = this.g.ui.menuStack;
    return !!this.m && !this.leaving && S[S.length - 1] === this.m;
  }

  select(i, sound = false) {
    if (!this.m || i < 0) return;
    if (i !== this.m.sel && sound) this.g.sound?.play?.('ui_hover');
    this.m.sel = i;
    this.g.ui.highlight(this.m);
  }

  pointer(e, down) {
    if (!this.sign || !this.live()) return;
    // only over the picture itself (not a button or a sheet of the interface)
    const t = e.target;
    if (t && t.closest && t.closest('button, .overlay, .bk-layer, a, input')) return;
    const c = this.g.pipeline?.renderer?.domElement;
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    _p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0);
    this.ray.setFromCamera(_p, this.g.camera);
    const i = this.sign.pick(this.ray);
    document.body.style.cursor = i >= 0 ? 'pointer' : '';
    if (i < 0) return;
    if (i !== this.m.sel) this.select(i, true);
    if (down) {
      e.preventDefault?.();
      this.activate(i);
    }
  }

  // a board picked: swing it; Continue / New Game head off that way, the others open the book
  activate(i) {
    const it = this.items?.[i];
    if (!it || this.leaving) return;
    const g = this.g;
    this.select(i);
    this.sign.swing(i);
    g.sound?.play?.('knock');
    if (it.go) {
      g.sound?.play?.('whoosh');
      g.ui.menuStack = g.ui.menuStack.filter((x) => x !== this.m);
      document.body.style.cursor = '';
      this.leaving = { i, t: 0, dir: this.sign.pointing(i) };
      // off along the arrow as the picture fades, then the game takes over
      setTimeout(() => {
        leafCover({ dur: 0.4 }).then(() => this.close(it.fn));
      }, 520);
    } else {
      g.sound?.play?.('ui_click');
      this.peek = { i, t: 0, dir: this.sign.pointing(i) };
      it.fn?.();
    }
  }

  // ---------------------------------------------------------------- placing things
  // the camera's resting shot: its position, yaw, pitch and fields of view
  shot(t, lean, out = {}) {
    const H = this.scene, cam = this.g.camera;
    const aspect = cam.aspect || innerWidth / innerHeight;
    const tall = aspect < 1;
    const K = tall ? CAM_TALL : CAM_WIDE;
    const a = K.a + (K.lean - K.a) * lean + Math.sin(t * 0.06) * 0.05;
    const d = K.d + Math.sin(t * 0.067 + 2) * 0.15;
    const pos = H.local(Math.sin(a) * d, K.y + Math.sin(t * 0.083 + 1) * 0.08, Math.cos(a) * d, out.pos || new THREE.Vector3());
    const vfov = clamp(2 * Math.atan(Math.tan((K.hfov * Math.PI) / 360) / aspect), 0.5, tall ? 1.25 : 1.05);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // the yaw that puts Hank at sx across the screen (from where the camera rests: drifting
    // round to his side, it keeps looking the same way and he slides over a little)
    const s = H.spot, rest = H.local(Math.sin(K.a) * K.d, 0, Math.cos(K.a) * K.d, this._rest);
    const yawH = Math.atan2(s.x - rest.x, s.z - rest.z);
    const yaw = yawH + Math.atan((2 * K.sx - 1) * Math.tan(hfov / 2)) + Math.sin(t * 0.05) * 0.015;
    const pitch = K.pitch + Math.sin(t * 0.07) * 0.008;
    return Object.assign(out, { pos, yaw, pitch, vfov, hfov, tall });
  }

  // a point on the screen (NDC) at distance D from the resting camera
  along(S, nx, ny, D, out) {
    _f.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch));
    _r.crossVectors(_f, UP).normalize();
    _u.crossVectors(_r, _f).normalize();
    const tx = Math.tan(S.hfov / 2), ty = Math.tan(S.vfov / 2);
    return out.copy(S.pos).addScaledVector(_f, D).addScaledVector(_r, nx * tx * D).addScaledVector(_u, ny * ty * D);
  }

  groundAt(x, z) {
    const g = this.g, ph = g.physics;
    return ph ? ph.groundAt(x, z, 1e9, 0).h : g.world.terrain.heightAt(x, z);
  }

  // stand the signpost and hang the cloud for this screen's shape
  layout3d() {
    this.layoutDirty = false;
    if (!this.scene || !this.sign) return;
    const S = this.shot(0, 0);
    const tall = S.tall;
    // the cloud: rebuilt when the screen turns (two lines on a tall one)
    if (!this.cloud || this.cloud.userData.tall !== tall) {
      const grow = this.cloud?.grow ?? 0;
      this.cloud?.dispose();
      this.cloud = new CloudTitle(tall ? ['DELI-VERY-', 'DEAD'] : ['DELI-VERY-DEAD']);
      this.cloud.userData.tall = tall;
      this.cloud.grow = grow;
      this.g.world.scene.add(this.cloud);
    }
    const CL = tall ? CLOUD_TALL : CLOUD_WIDE;
    const cw = 2 * CL.d * Math.tan(S.hfov / 2), ch = 2 * CL.d * Math.tan(S.vfov / 2);
    const kc = Math.min((CL.w * cw) / this.cloud.w, (CL.h * ch) / this.cloud.h);
    this.cloud.scale.setScalar(kc);
    // (the letters' middle on the mark)
    this.along(S, CL.x, CL.y, CL.d, this.cloud.position);
    this.cloud.position.y -= (this.cloud.h * kc) / 2;
    this.cloudBase = this.cloud.position.clone();
    this.cloud.rotation.set(0, Math.atan2(S.pos.x - this.cloud.position.x, S.pos.z - this.cloud.position.z), 0);
    // the signpost: far enough off that its boards fit their share of the screen
    const SG = tall ? SIGN_TALL : SIGN_WIDE;
    const sign = this.sign;
    const span = (sign.reachL + sign.reachR) * 1.08;
    const tx = Math.tan(S.hfov / 2);
    const D0 = Math.max(sign.stackH / (SG.h * 2 * Math.tan(S.vfov / 2)), span / (SG.w * 2 * tx), 2.2);
    // It stands in the grass: where the hillside rises into the spot, it comes nearer (and
    // is made a little smaller to keep its size on the screen) until its boards clear the
    // ground by a hand's breadth or so.
    let D = D0, p = sign.position, k = 1, gy = 0;
    for (let i = 0; i < 14; i++) {
      k = D / D0;
      // (the post sits off the middle of the boards' spread when they reach further one way)
      this.along(S, SG.x + ((sign.reachL - sign.reachR) * k) / 2 / (D * tx), SG.y, D, p);
      gy = this.groundAt(p.x, p.z);
      if (p.y - (sign.stackH * k) / 2 >= gy + 0.25 * k || D < 1.2) break;
      D *= 0.88;
    }
    sign.scale.setScalar(k);
    if (p.y - (sign.stackH * k) / 2 < gy + 0.2 * k) p.y = gy + 0.2 * k + (sign.stackH * k) / 2;
    sign.plant((p.y - (sign.stackH * k) / 2 - gy) / k + 0.05);
    sign.rotation.set(0, Math.atan2(S.pos.x - p.x, S.pos.z - p.z), 0);
    sign.updateMatrixWorld(true);
  }

  // Set the world up for the title: golden-hour light, a friendly village, Bessie tucked
  // away out of sight and Hank on his hill with his cocoa. (restore() puts it all back.)
  stage() {
    const g = this.g;
    if (this.staged) return;
    this.staged = true;
    const W = g.world, A = W.atmosphere;
    A.lightHour = LIGHT_HOUR;
    A.hour = SCHED_HOUR;
    A.setWeather('breezy', true);
    // everyone already knows Hank (a save or a new game sets the real feelings when the title closes)
    const st = g.state;
    st.flags.village1 = true;
    st.flags.contestScream = true;
    st.npc = { _day: st.day, _base: 70 };
    g.villagers.syncState();
    // no speech bubbles or voices over the title
    g.villagers.bubble = () => {};
    const sc = W.sun?.shadow?.camera;
    if (sc) {
      this.shadowWas = sc.right;
      sc.left = sc.bottom = -SHADOW_SIZE;
      sc.right = sc.top = SHADOW_SIZE;
      sc.updateProjectionMatrix();
    }
    // Bessie (and the riding Hank) wait out of sight up the hill behind him
    this.bikeWas = g.bikeModel.root.visible;
    this.riderWas = g.rider.visible;
    g.setBikeVisible(false);
    this.scene = new HillScene(g);
    const b = this.scene.local(0, 0, -26, new THREE.Vector3());
    g.parkBike(b.x, b.z, this.scene.yaw);
    g.pipeline.post.uFade.value = 1;
    this.frame(0, true);
  }

  // over his left shoulder, framed by the screen's shape, drifting slowly; heading off the
  // way the chosen arrow points when leaving, a glance along it for the other boards
  frame(dt, snap = false) {
    const g = this.g, H = this.scene;
    if (!H) return;
    const S = this.shot(this.t, H.camLean, this._shot || (this._shot = { pos: this._pos }));
    let { yaw, pitch } = S;
    const pos = S.pos;
    const turn = (o, amt) => {
      const want = Math.atan2(o.dir.x, o.dir.z);
      return wrapAngle(want - yaw) * amt;
    };
    if (this.leaving) {
      const L = this.leaving;
      L.t += dt;
      const k = easeInOut(clamp(L.t / 1.3, 0, 1));
      yaw += turn(L, 0.55) * k;
      pitch += 0.06 * k;
      pos.x += L.dir.x * 2.2 * k;
      pos.z += L.dir.z * 2.2 * k;
      pos.y += 0.3 * k;
    } else if (this.peek) {
      const P = this.peek;
      P.t += dt;
      const k = Math.sin(clamp(P.t / 1.1, 0, 1) * Math.PI);
      yaw += turn(P, 0.08) * k;
      if (P.t > 1.1) this.peek = null;
    }
    const c = Math.cos(pitch) * 60;
    const look = this._look.set(pos.x + Math.sin(yaw) * c, pos.y + Math.sin(pitch) * 60, pos.z + Math.cos(yaw) * c);
    const C = g.chase, fov = (S.vfov * 180) / Math.PI;
    if (snap || C.mode !== 'shot') C.cut(pos, look, fov);
    else {
      C.pos.copy(pos);
      C.look.copy(look);
      C.fov = fov;
    }
    C.apply(dt);
  }

  update(dt) {
    if (!this.scene) return;
    const g = this.g;
    this.t += dt;
    // fade in from the loading screen
    if (!this.leaving) g.pipeline.post.uFade.value = 1 - smoothstep(0, FADE_IN, this.t);
    if (this.layoutDirty) this.layout3d();
    this.frame(dt);
    this.scene.update(dt);
    // the cloud: condensing out of the air, then bobbing and drifting gently
    const cl = this.cloud;
    if (cl) {
      if (this.t > 0.6) cl.update(dt);
      const s = cl.scale.x, t = this.t;
      cl.position.copy(this.cloudBase);
      cl.position.y += Math.sin(t * 0.45) * 0.55 * s + Math.sin(t * 0.17 + 1) * 0.3 * s;
      _r.set(Math.cos(cl.rotation.y), 0, -Math.sin(cl.rotation.y));
      cl.position.addScaledVector(_r, Math.sin(t * 0.11) * 1.4 * s);
      cl.rotation.z = Math.sin(t * 0.3 + 0.5) * 0.015;
    }
    if (this.sign) this.sign.update(dt, this.leaving ? this.leaving.i : this.m ? this.m.sel : -1);
    if (!this.root) return;
    if (this.t < 2.5) this.root.style.opacity = String(clamp((this.t - 1) / 1.2, 0, 1));
    else if (this.root.style.opacity !== '1') this.root.style.opacity = '1';
  }

  close(fn) {
    const g = this.g;
    if (!this.root) return;
    g.ui.menuStack = g.ui.menuStack.filter((x) => x !== this.m);
    const r = this.root;
    this.root = null;
    removeEventListener('resize', this.onResize);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown);
    document.body.style.cursor = '';
    r.remove();
    this.restore();
    fn?.();
  }

  // hand the world back to the game the way the title found it
  restore() {
    const g = this.g, W = g.world;
    this.scene?.dispose();
    this.scene = null;
    this.cloud?.dispose();
    this.cloud = null;
    this.sign?.dispose();
    this.sign = null;
    W.atmosphere.lightHour = null;
    const sc = W.sun?.shadow?.camera;
    if (sc && this.shadowWas) {
      sc.left = sc.bottom = -this.shadowWas;
      sc.right = sc.top = this.shadowWas;
      sc.updateProjectionMatrix();
    }
    delete g.villagers.bubble;
    if (this.bikeWas !== undefined) {
      g.bikeModel.root.visible = this.bikeWas;
      g.rider.visible = this.riderWas;
    }
    g.parkBike();
    g.pipeline.post.uFade.value = 0;
  }
}
