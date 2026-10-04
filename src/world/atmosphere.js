// Time of day + weather -> sun, sky, ambient, fog and grading.
import * as THREE from 'three';
import { G } from '../render/shaderlib.js';
import { SKY } from '../render/sky.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const C = (hex) => new THREE.Color(hex);
// keyframes by hour
const KEYS = [
  { t: 0, zen: C(0x080c24), hor: C(0x1e2442), glow: C(0x000000), sun: [0, 0, 0], sky: C(0x2e3c6e), gnd: C(0x161a2a), fog: C(0x222a4a), cl: C(0x2e3452), cs: C(0x14182e) },
  { t: 5.5, zen: C(0x101634), hor: C(0x3a3456), glow: C(0x301830), sun: [0, 0, 0], sky: C(0x262c50), gnd: C(0x141218), fog: C(0x2e2c48), cl: C(0x4a4466), cs: C(0x221f38) },
  { t: 7, zen: C(0x5a6aa8), hor: C(0xf4a688), glow: C(0xff7a48), sun: [1.2, 0.62, 0.42], sky: C(0x6a6c98), gnd: C(0x40302a), fog: C(0xc49090), cl: C(0xffc0a0), cs: C(0x806080) },
  { t: 9, zen: C(0x6f96cc), hor: C(0xecd8c0), glow: C(0xffc890), sun: [1.55, 1.3, 1.0], sky: C(0x8a98b8), gnd: C(0x4a3a2a), fog: C(0xc8c4c0), cl: C(0xfff0e0), cs: C(0xa0a0b8) },
  { t: 13, zen: C(0x6a9ad4), hor: C(0xdce2e4), glow: C(0xfff0d0), sun: [1.7, 1.58, 1.38], sky: C(0x96a6c4), gnd: C(0x4e4030), fog: C(0xc8d0d8), cl: C(0xffffff), cs: C(0xa8b0c4) },
  { t: 16, zen: C(0x8a8cc8), hor: C(0xf6d2b0), glow: C(0xffb878), sun: [1.75, 1.3, 0.85], sky: C(0x9a90b0), gnd: C(0x503a2a), fog: C(0xe0b8a8), cl: C(0xfff0d8), cs: C(0xa890b0) },
  { t: 17.6, zen: C(0xa682bc), hor: C(0xffc6a4), glow: C(0xffa870), sun: [1.8, 1.05, 0.62], sky: C(0x9a8ca8), gnd: C(0x5a3c30), fog: C(0xf0b4a4), cl: C(0xffd8b8), cs: C(0x9a78a8) },
  { t: 18.8, zen: C(0x6e5aa2), hor: C(0xff9a7c), glow: C(0xff7040), sun: [1.5, 0.66, 0.38], sky: C(0x7a6494), gnd: C(0x40282a), fog: C(0xd88a8a), cl: C(0xffa888), cs: C(0x6a4a7a) },
  { t: 19.8, zen: C(0x262c66), hor: C(0x9a5a7a), glow: C(0xa04040), sun: [0.34, 0.2, 0.18], sky: C(0x3a4a7c), gnd: C(0x1e1a26), fog: C(0x4e4a78), cl: C(0x8a6a90), cs: C(0x30305a) },
  { t: 21, zen: C(0x0a0f2c), hor: C(0x262a50), glow: C(0x000000), sun: [0, 0, 0], sky: C(0x2e3a6c), gnd: C(0x161a28), fog: C(0x242a4c), cl: C(0x323656), cs: C(0x161a32) },
  { t: 24, zen: C(0x080c24), hor: C(0x1e2442), glow: C(0x000000), sun: [0, 0, 0], sky: C(0x2e3c6e), gnd: C(0x161a2a), fog: C(0x222a4a), cl: C(0x2e3452), cs: C(0x14182e) },
];

const tmp = new THREE.Color();
function lerpKey(t, field, out) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  if (field === 'sun') {
    out.setRGB(lerp(a.sun[0], b.sun[0], k), lerp(a.sun[1], b.sun[1], k), lerp(a.sun[2], b.sun[2], k));
  } else {
    out.copy(a[field]).lerp(b[field], k);
  }
  return out;
}

export const WEATHERS = {
  clear: { cloud: 0.32, sun: 1, fog: 1, wet: 0, rain: 0, snow: 0, wind: 0.6, grey: 0 },
  breezy: { cloud: 0.45, sun: 1, fog: 0.9, wet: 0, rain: 0, snow: 0, wind: 1.4, grey: 0 },
  misty: { cloud: 0.5, sun: 0.75, fog: 3.2, wet: 0.15, rain: 0, snow: 0, wind: 0.3, grey: 0.25 },
  overcast: { cloud: 0.85, sun: 0.4, fog: 1.6, wet: 0.1, rain: 0, snow: 0, wind: 0.8, grey: 0.45 },
  rain: { cloud: 0.95, sun: 0.22, fog: 2.2, wet: 1, rain: 1, snow: 0, wind: 1.1, grey: 0.6 },
  snow: { cloud: 0.9, sun: 0.35, fog: 2.0, wet: 0, rain: 0, snow: 1, wind: 0.5, grey: 0.4 },
};

export class Atmosphere {
  constructor(pipeline, sunLight) {
    this.pipeline = pipeline;
    this.sun = sunLight;
    this.hour = 17.4;
    this.lightHour = null; // when set, the sun and sky follow this instead of `hour`
    this.weather = { ...WEATHERS.clear };
    this.weatherTarget = 'clear';
    this.snowCover = 0;
    this.cold = 0;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
  }

  setWeather(name, instant = false) {
    this.weatherTarget = name;
    if (instant) Object.assign(this.weather, WEATHERS[name]);
  }

  update(dt) {
    // blend weather params
    const tgt = WEATHERS[this.weatherTarget] || WEATHERS.clear;
    const k = 1 - Math.exp(-dt * 0.25);
    for (const key of Object.keys(tgt)) this.weather[key] = lerp(this.weather[key], tgt[key], k);
    if (tgt.snow > 0.5) this.snowCover = Math.min(1, this.snowCover + dt * 0.01);
    else this.snowCover = Math.max(0, this.snowCover - dt * 0.004);
    this.apply();
  }

  apply() {
    const W = this.weather;
    // the title can light the scene at one hour while the village keeps another's routine
    const h = this.lightHour ?? this.hour;
    // sun path: rises in the east (+x), arcs through the south (+z), sets west
    const dayT = (h - 7) / (19.4 - 7); // 0 sunrise .. 1 sunset
    const elev = Math.sin(clamp(dayT, -0.2, 1.2) * Math.PI) * 0.72 - 0.02;
    const az = lerp(-0.35, Math.PI + 0.35, dayT); // angle from +x towards +z
    this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
    // moon roughly opposite
    const nightT = ((h + 24 - 19.5) % 24) / 11.5;
    const melev = Math.sin(clamp(nightT, 0, 1) * Math.PI) * 0.8 + 0.05;
    const maz = lerp(-0.2, Math.PI + 0.2, nightT);
    this.moonDir.set(Math.cos(maz) * Math.cos(melev), Math.sin(melev), Math.sin(maz) * Math.cos(melev)).normalize();

    const night = 1 - smoothstep(-0.12, 0.04, this.sunDir.y);
    G.uNight.value = night;
    SKY.uStars.value = night * (1 - W.cloud * 0.8);
    SKY.uMoonDir.value.copy(this.moonDir);

    const grey = W.grey;
    const greyCol = tmp.setRGB(0.52, 0.54, 0.58);
    const greyIt = (c, amt) => {
      const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
      c.lerp(tmp.setRGB(l, l * 1.02, l * 1.08), amt);
      return c;
    };
    lerpKey(h, 'zen', SKY.uZenith.value);
    greyIt(SKY.uZenith.value, grey);
    lerpKey(h, 'hor', SKY.uHorizon.value);
    greyIt(SKY.uHorizon.value, grey * 0.8);
    lerpKey(h, 'glow', SKY.uSunGlow.value).multiplyScalar(1 - grey * 0.7);
    lerpKey(h, 'cl', SKY.uCloudLit.value);
    greyIt(SKY.uCloudLit.value, grey);
    SKY.uCloudLit.value.multiplyScalar(1 - grey * 0.35);
    lerpKey(h, 'cs', SKY.uCloudShade.value);
    greyIt(SKY.uCloudShade.value, grey);
    SKY.uCloudCover.value = W.cloud;

    // light direction: sun by day, moon by night
    const useMoon = night > 0.5;
    const ld = useMoon ? this.moonDir : this.sunDir;
    G.uSunDir.value.copy(ld);
    if (ld.y < 0.06) G.uSunDir.value.y = 0.06;
    G.uSunDir.value.normalize();
    const sc = lerpKey(h, 'sun', G.uSunColor.value);
    sc.multiplyScalar(W.sun);
    if (useMoon) G.uSunColor.value.setRGB(0.3, 0.38, 0.62).multiplyScalar(lerp(1, 0.45, W.cloud));
    lerpKey(h, 'sky', G.uSkyAmb.value);
    greyIt(G.uSkyAmb.value, grey * 0.6);
    G.uSkyAmb.value.multiplyScalar(lerp(1, 1.15, grey));
    G.uSkyAmb.value.multiplyScalar(1.5);
    lerpKey(h, 'gnd', G.uGroundAmb.value);
    G.uGroundAmb.value.multiplyScalar(1.6);
    G.uWet.value = W.wet;
    G.uSnow.value = this.snowCover;
    G.uWindStrength.value = W.wind;

    const P = this.pipeline.post;
    lerpKey(h, 'fog', P.uFogColor.value);
    greyIt(P.uFogColor.value, grey);
    P.uFogDensity.value = 0.0016 * W.fog;
    P.uFogMax.value = clamp(0.82 + (W.fog - 1) * 0.06, 0.5, 0.97);
    P.uRays.value = (1 - grey) * (1 - night);
    P.uBloom.value = lerp(0.55, 0.3, grey);
    P.uCold.value = this.cold;
    P.uSaturation.value = lerp(1.14, 0.92, grey);
    // light shadows follow the light direction
    if (this.sun) this.sun.intensity = 1;
  }
}
