// The game's name written in the sky over Maple Cove as one big fluffy cloud.
//
// The letters are set in the game's bold pixel face (ui/type.js textMask) and every inked
// pixel becomes a soft round puff: puffs deep inside a stroke are bigger and sit a little
// forward, the ones on its edge small, so each letter is a rounded, pillowy stroke rather
// than a stack of balls. The words rest on a low cloud bank, and a few wisps trail off the
// ends and drift by. The puffs are shaded like the sky's own clouds (render/sky.js: the
// same lit and shade colours, so the low sun paints them gold and the shade goes lavender),
// banded into a few flat tones for the pixel-art look, with a warm rim where the sun
// catches their edges and a glowing belly from the light below the horizon. They condense
// out of the air one by one when the title comes up, and breathe and bob gently after.
//
// CloudTitle is a THREE.Group in world units (1 = one letter pixel; the title scales it).
import * as THREE from 'three';
import { textMask } from '../ui/type.js';
import { G } from '../render/shaderlib.js';
import { SKY } from '../render/sky.js';

const VERT = /* glsl */ `
attribute vec4 aPuff;   // phase, tone bias, appear delay (0..1), drift
uniform float uTime;
uniform float uGrow;    // 0..1.6: the cloud condensing
uniform float uH;       // the letters' height (local units), for the belly shading
varying vec3 vN;
varying vec3 vW;
varying float vH;
varying float vBias;
void main() {
  float g = smoothstep(aPuff.z, aPuff.z + 0.55, uGrow);
  float br = 1.0 + 0.06 * sin(uTime * 0.8 + aPuff.x * 6.2831);
  vec3 p = position * br * g * (0.6 + 0.4 * g);
  vec4 lp = instanceMatrix * vec4(p, 1.0);
  lp.xyz += vec3(sin(uTime * 0.27 + aPuff.x * 9.0), cos(uTime * 0.33 + aPuff.x * 7.0) * 0.6, 0.0) * 0.18 * aPuff.w;
  // (they rise a little as they condense)
  lp.y -= (1.0 - g) * 1.5;
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  // (a puff is a sphere: its normal is its own direction, smooth across the facets)
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * position);
  vH = clamp(lp.y / uH, -0.4, 1.2);
  vBias = aPuff.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uCloudLit, uCloudShade, uSunGlow, uSunColor;
uniform vec3 uCamPos;
uniform float uNight;
uniform float uBright;
varying vec3 vN;
varying vec3 vW;
varying float vH;
varying float vBias;
void main() {
  vec3 n = normalize(vN);
  vec3 s = normalize(uSunDir);
  // soft wrap light from the low sun, plus the sky above
  float sun = clamp(dot(n, s) * 0.55 + 0.45, 0.0, 1.0);
  float sky = n.y * 0.5 + 0.5;
  float lit = sun * 0.68 + sky * 0.32;
  // the lower parts of the cloud sit in its own shade
  lit *= mix(0.72, 1.0, clamp(vH, 0.0, 1.0));
  lit = clamp(lit + vBias, 0.0, 1.0);
  // a few flat tones (pixel-art clouds, like the sky's): cream-gold where the low sun
  // falls, rose in the half-light, lavender in the shade (tinted by the sky's own colours)
  float band = floor(lit * 4.0 + 0.5) / 4.0;
  vec3 sunC = mix(vec3(1.0, 0.78, 0.48) * 1.2, uCloudLit * 0.45 + uSunColor * 0.8, 0.3);
  vec3 midC = mix(vec3(0.94, 0.6, 0.58), uCloudLit, 0.25);
  vec3 shadeC = mix(vec3(0.46, 0.4, 0.66), uCloudShade, 0.25);
  vec3 col = band > 0.6 ? mix(midC, sunC, (band - 0.5) * 2.0) : mix(shadeC, midC, band * 1.6);
  vec3 v = normalize(uCamPos - vW);
  float facing = max(dot(n, v), 0.0);
  // the gold lining where the sun catches the edges (on its side only)
  float rim = pow(1.0 - facing, 3.0) * smoothstep(0.45, 0.85, sun);
  col += uSunGlow * step(0.4, rim) * 0.5;
  // the glow of the low sun under the belly
  col += uSunGlow * max(-n.y, 0.0) * (1.0 - clamp(vH, 0.0, 1.0)) * 0.3;
  col = mix(col, col * vec3(0.55, 0.6, 0.85), uNight * 0.7);
  gl_FragColor = vec4(col * uBright, 1.0);
}
`;

// puffs for one block of text: [x, y, z, radius, tone bias]
function puffsFor(lines, px) {
  const masks = lines.map((t) => textMask(t, px, true));
  const lh = Math.round(px * 1.12);
  const W = Math.max(...masks.map((m) => m.w));
  const out = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  masks.forEach((m, li) => {
    // centred lines, baselines lh apart (first line on top)
    const ox = (W - m.w) / 2, oy = (lines.length - 1 - li) * lh;
    // how deep each inked pixel sits inside its stroke (a small chamfer distance)
    const D = new Float32Array(m.w * m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.on(x, y)) continue;
      let d = 4;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!m.on(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      D[y * m.w + x] = d;
    }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const d = D[y * m.w + x];
      if (!d) continue;
      // interior pixels: fewer, bigger puffs; the edge keeps every one so the letters stay sharp
      if (d > 1.5 && rnd() < 0.45) continue;
      const r = 0.78 + Math.min(d, 3) * 0.28 + rnd() * 0.18;
      const wx = ox + x + (rnd() - 0.5) * 0.35;
      const wy = oy + (m.base - y) + (rnd() - 0.5) * 0.35;
      const wz = Math.min(d, 3) * 0.45 + (rnd() - 0.5) * 0.5;
      out.push([wx, wy, wz, r, (rnd() - 0.5) * 0.08]);
    }
  });
  const H = (lines.length - 1) * lh + Math.max(...masks.map((m) => m.base));
  return { puffs: out, W, H, lh };
}

export class CloudTitle extends THREE.Group {
  constructor(lines, { px = 18 } = {}) {
    super();
    this.name = 'titleCloud';
    const { puffs, W, H } = puffsFor(lines, px);
    this.w = W;
    this.h = H;
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // the low cloud bank the words rest on (behind and under them), and wisps trailing off
    // both ends that thin out into nothing
    const bank = [];
    for (let x = -3; x <= W + 3; x += 2.2) {
      const e = Math.min(x + 3, W + 3 - x) / 8; // thinning at the ends
      const k = Math.min(1, Math.max(0.25, e));
      bank.push([x + rnd() * 1.4, -2.2 + rnd() * 1.8 * k, -2.6 - rnd() * 2, (2.0 + rnd() * 1.6) * (0.4 + 0.6 * k), -0.1 - rnd() * 0.06]);
      if (rnd() < 0.5 * k) bank.push([x + 1 + rnd(), -0.6 + rnd() * 1.6 * k, -4 - rnd() * 1.5, (2.2 + rnd() * 1.4) * k, -0.08]);
    }
    for (const side of [-1, 1]) {
      let x = side < 0 ? -3 : W + 3, y = -1.4, r = 1.9;
      for (let i = 0; i < 7; i++) {
        x += side * (1.5 + i * 0.35);
        y += (rnd() - 0.3) * 0.7;
        r *= 0.82;
        bank.push([x, y, -2 - rnd(), r, -0.05]);
      }
    }
    const all = [...bank, ...puffs];
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const aPuff = new Float32Array(all.length * 4);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: G.uTime, uSunDir: G.uSunDir, uSunColor: G.uSunColor, uNight: G.uNight, uCamPos: G.uCamPos,
        uCloudLit: SKY.uCloudLit, uCloudShade: SKY.uCloudShade, uSunGlow: SKY.uSunGlow,
        uGrow: { value: 0 }, uH: { value: H }, uBright: { value: 1.08 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, all.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    all.forEach(([x, y, z, r, bias], i) => {
      // slightly squashed puffs, flatter underneath like real cumulus
      sc.set(r * 1.08, r * 0.92, r);
      q.setFromAxisAngle(p.set(0, 0, 1), (rnd() - 0.5) * 0.6);
      m4.compose(p.set(x - W / 2, y, z), q, sc);
      mesh.setMatrixAt(i, m4);
      const appear = Math.min(1, Math.max(0, (x + 6) / (W + 12))) * 0.75 + rnd() * 0.25;
      aPuff.set([rnd(), bias, appear, i < bank.length ? 1 : 0.25], i * 4);
    });
    geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(aPuff, 4));
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.mesh = mesh;
    this.mat = mat;
    this.add(mesh);
    // a few loose cloudlets drifting past on their own
    this.drifters = [];
    for (let i = 0; i < 3; i++) {
      const n = 5 + Math.floor(rnd() * 4);
      const dm = new THREE.InstancedMesh(geo, mat, n);
      const a2 = new Float32Array(n * 4);
      let cx = 0;
      for (let k = 0; k < n; k++) {
        const r = 0.9 + rnd() * 1.3 - Math.abs(k - n / 2) * 0.12;
        cx += 1.1 + rnd() * 0.6;
        m4.compose(p.set(cx, (rnd() - 0.5) * 0.8 + (k === Math.floor(n / 2) ? 0.6 : 0), (rnd() - 0.5) * 1.2), q.identity(), sc.set(r * 1.1, r * 0.85, r));
        dm.setMatrixAt(k, m4);
        a2.set([rnd(), -0.03, 0, 1], k * 4);
      }
      // (their own copy of the attribute: same geometry object, so clone it)
      dm.geometry = geo.clone();
      dm.geometry.setAttribute('aPuff', new THREE.InstancedBufferAttribute(a2, 4));
      dm.frustumCulled = false;
      dm.userData = { speed: 0.5 + rnd() * 0.5, y: H * (i === 1 ? 1.25 : -0.35) + rnd() * 3, z: -6 - rnd() * 8, x0: rnd(), len: cx };
      this.add(dm);
      this.drifters.push(dm);
    }
    this.t = 0;
    this.grow = 0;
  }

  // dt seconds; grow: true while it should be (or become) visible
  update(dt) {
    this.t += dt;
    this.grow = Math.min(1.6, this.grow + dt * 0.75);
    this.mat.uniforms.uGrow.value = this.grow;
    const W = this.w;
    for (const d of this.drifters) {
      const u = d.userData;
      const span = W + 60;
      const x = ((u.x0 * span + this.t * u.speed) % span) - span / 2;
      d.position.set(x - u.len / 2, u.y, u.z);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    for (const d of this.drifters) d.geometry.dispose();
    this.mat.dispose();
    this.removeFromParent();
  }
}
