// Deli-very-dead audio system. Everything is synthesized with the Web Audio
// API — no asset files. Import the singleton:
//
//   import { audio } from './audio/audio.js';
//   button.onclick = () => audio.init();   // from a user gesture
//   audio.play('bell', { pitch: 1, volume: 1, pan: 0 });
//   audio.setMusic('forest');  audio.update(dt);  // every frame
//
// Every method is a safe no-op before init() or without Web Audio (node,
// headless tests) and never throws.
//
// Graph: sources -> music / sfx buses -> master -> compressor -> out,
//        with a shared convolution reverb fed by per-bus sends.
import { Kit, clamp, impulse } from './synth.js';
import { SFX } from './sfx.js';
import { SFX2 } from './sfx2.js';
import { blipVoice, VOICE_NAMES } from './voices.js';
import { Music, MOOD_NAMES } from './music.js';
import { Ambience, AMB_NAMES } from './ambience.js';
import { Bike, Motor } from './vehicle.js';

const LIB = Object.assign(Object.create(null), SFX, SFX2);
export const SFX_NAMES = Object.keys(LIB);
export { VOICE_NAMES, MOOD_NAMES, AMB_NAMES };

// Per-sound level trims so peaks land near -6 dBFS before the master
// (UI ticks, footsteps and critters deliberately quieter). Measured offline.
const TRIM = {
  bell: 1.15, horn_moose: 1.41, coin: 2.07, cash: 1.15, jump: 0.91, land: 0.83, land_hard: 0.82, crash: 0.79,
  bones: 1.49, reassemble: 0.76, ui_click: 0.81, ui_hover: 1.16, ui_open: 1.13, ui_close: 1.29, ui_error: 2.11,
  gear_up: 0.93, gear_down: 1.01, splash: 0.99, pop: 0.69, boost: 1.34, fizz: 0.61, cup: 0.73, pour: 2.07,
  door: 0.98, gun_cock: 1.34, glider: 1.0, engine_start: 1.22, plate: 0.64, food_fall: 0.96, footstep: 0.98,
  wobble: 0.99, drift_boost: 3.42, whoosh: 2.14, sip: 1.2, squish: 0.85, paper: 1.46, dirt: 2.05,
  thunder: 1.46, meow: 1.09, meow_sad: 1.17, purr: 1.13, scream: 1.28, gasp: 1.65, brrr: 1.57, reaper: 2.41,
  magic: 1.68, chirp: 1.4, goose: 1.2, moose: 0.91, deer: 1.53, crow: 0.89, owl: 0.87, rooster: 0.81,
  snore: 0.85, upgrade: 1.24, delivered: 0.62, collect: 2.32, day_start: 1.28, day_end: 1.39,
};

const MAX_SFX = 40;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'mousedown'];

function num(v, def, lo, hi) {
  const x = typeof v === 'number' ? v : v == null ? NaN : Number(v);
  return Number.isFinite(x) ? clamp(x, lo, hi) : def;
}

export class AudioSys {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.kit = null;
    this.vol = { master: 0.8, music: 0.5, sfx: 0.8 };
    this.mood = 'none';
    this.sfxNames = SFX_NAMES;
    this.voiceNames = VOICE_NAMES;
    this.moodNames = MOOD_NAMES;
    this.ambienceNames = AMB_NAMES;
    this._amb = {};
    this._active = [];
    this._last = Object.create(null);
    this._trash = [];
    this._paused = false;
    this._failed = false;
    this._fails = 0;
    this._unlocked = false;
    this._unlockFn = null;
    this._initAt = 0;
    this._blipLast = 0;
    this._warm = [];
  }

  /** Create the AudioContext (lazily) and the mix graph. Call from a user gesture; safe to repeat. */
  init() {
    try {
      if (this.ctx) {
        this._kick();
        return;
      }
      if (this._failed) return;
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) {
        this._failed = true;
        return;
      }
      let ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      this.ctx = ctx;
      this._initAt = Date.now();
      this.kit = new Kit(ctx);
      const gain = (v, dest) => {
        const g = ctx.createGain();
        g.gain.value = v;
        if (dest) g.connect(dest);
        return g;
      };
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.006;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      this.comp = comp;
      this.master = gain(this.vol.master, comp);
      this.verb = ctx.createConvolver(); // impulse arrives with the first warm-up job
      this.verbOut = gain(0.9, this.master);
      this.verb.connect(this.verbOut);
      this.musicBus = gain(this.vol.music, this.master);
      this.sfxBus = gain(this.vol.sfx, this.master);
      this.musicVerb = gain(this.vol.music, this.verb); // reverb sends follow their bus volume
      this.sfxVerb = gain(this.vol.sfx, this.verb);
      this.ambBus = gain(1, this.sfxBus);
      this.voiceBus = gain(1, this.sfxBus);
      this.voiceBus.connect(gain(0.08, this.sfxVerb));
      this.music = new Music(this);
      this.amb = new Ambience(this);
      this.bike = new Bike(this);
      this.motor = new Motor(this);
      this._warm = [() => { this.verb.buffer = impulse(ctx, 2.2); }, ...this.kit.warmJobs()];
      this.ready = true;
      if (this.mood !== 'none') this.music.set(this.mood);
      this.amb.set(this._amb);
      this._kick();
    } catch (e) {
      this._fails = (this._fails || 0) + 1;
      if (this._fails >= 3) this._failed = true; // give a transient failure a couple more gestures
      this.ready = false;
      try { if (this.ctx) this.ctx.close(); } catch (e2) { /* noop */ }
      this.ctx = null;
    }
  }

  /** master / music / sfx, each 0..1, any subset. */
  setVolumes(v) {
    try {
      if (!v || typeof v !== 'object') return;
      for (const k of ['master', 'music', 'sfx']) this.vol[k] = num(v[k], this.vol[k], 0, 1);
      if (!this.ready) return;
      const now = this.ctx.currentTime, vol = this.vol;
      this.master.gain.setTargetAtTime(vol.master, now, 0.03);
      this.musicBus.gain.setTargetAtTime(vol.music, now, 0.03);
      this.musicVerb.gain.setTargetAtTime(vol.music, now, 0.03);
      this.sfxBus.gain.setTargetAtTime(vol.sfx, now, 0.03);
      this.sfxVerb.gain.setTargetAtTime(vol.sfx, now, 0.03);
    } catch (e) { /* never throw */ }
  }

  /** One-shot SFX. opts: { pitch=1, volume=1, pan=0, delay=0 }. Unknown names are ignored. */
  play(name, opts) {
    if (!this.ready) return;
    try {
      const fn = LIB[name];
      if (!fn || !this._canSchedule()) return;
      const ctx = this.ctx, now = ctx.currentTime, o = opts || {};
      const at = now + 0.006 + num(o.delay, 0, 0, 10);
      if (Math.abs(at - (this._last[name] ?? -1)) < 0.03) return; // same sound stacked in one frame
      this._sweep(now);
      if (this._active.length >= MAX_SFX) return;
      this._last[name] = at;
      const out = ctx.createGain();
      out.gain.value = num(o.volume, 1, 0, 4) * (TRIM[name] ?? 1);
      let tail = out;
      const pan = num(o.pan, 0, -1, 1);
      if (pan && ctx.createStereoPanner) {
        tail = ctx.createStereoPanner();
        tail.pan.value = pan;
        out.connect(tail);
      }
      tail.connect(this.sfxBus);
      const wet = ctx.createGain();
      wet.gain.value = 0.12;
      tail.connect(wet);
      wet.connect(this.sfxVerb);
      const c = { k: this.kit, ctx, out, wet, t: at, p: num(o.pitch, 1, 0.25, 4), end: now };
      fn(c);
      const end = Math.max(c.end, c.t + 0.05);
      this._active.push(end);
      this.dispose(end + 0.25, out, tail, wet);
    } catch (e) { /* never throw */ }
  }

  /** Single dialogue typewriter blip in a character's voice. */
  blip(voice) {
    if (!this.ready) return;
    try {
      if (this._canSchedule()) blipVoice(this, voice);
    } catch (e) { /* never throw */ }
  }

  /** Per-frame bicycle state. */
  setBike(p) {
    if (!this.ready) return;
    try { this.bike.set(p); } catch (e) { /* never throw */ }
  }

  /** Motorcycle engine loop. */
  setMotor(p) {
    if (!this.ready) return;
    try { this.motor.set(p); } catch (e) { /* never throw */ }
  }

  /** Ambient layers 0..1 (any subset), smoothly crossfaded. Remembered before init. */
  setAmbience(o) {
    try {
      if (!o || typeof o !== 'object') return;
      for (const k of AMB_NAMES) if (k in o) this._amb[k] = num(o[k], 0, 0, 1);
      if (this.ready) this.amb.set(o);
    } catch (e) { /* never throw */ }
  }

  /** Crossfade (~2 s) to a music mood; 'none' fades to silence. Remembered before init. */
  setMusic(mood) {
    try {
      if (typeof mood !== 'string' || !MOOD_NAMES.includes(mood)) return;
      this.mood = mood;
      if (this.ready) this.music.set(mood);
    } catch (e) { /* never throw */ }
  }

  /** Drive schedulers and random ambience. Call every frame. */
  update(dt) { // eslint-disable-line no-unused-vars
    if (!this.ready) return;
    try {
      const now = this.ctx.currentTime;
      this.music.update(now);
      this.amb.update(now);
      this.bike.update(now);
      this.motor.update(now);
      this._sweep(now);
      if (this._unlockFn && this.ctx.state === 'running') this._unbind();
      if (this._warm.length) { // pre-render buffers a few ms per frame so first uses don't hitch
        const t0 = clock();
        do this._warm.shift()(); while (this._warm.length && clock() - t0 < 3);
      }
    } catch (e) { /* never throw */ }
  }

  /** Pause all audio (pause menu / hidden tab). */
  suspend() {
    if (!this.ready) return;
    try {
      this._paused = true;
      if (this.ctx.state === 'running') {
        const p = this.ctx.suspend();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* never throw */ }
  }

  resume() {
    if (!this.ready) return;
    try {
      this._paused = false;
      this._kick();
    } catch (e) { /* never throw */ }
  }

  // ------------------------------------------------------------ internals

  /** Queue nodes for disconnection once audio time passes `at`. */
  dispose(at, ...nodes) {
    this._trash.push({ at, nodes });
  }

  _sweep(now) {
    const tr = this._trash;
    if (tr.length) {
      let j = 0;
      for (let i = 0; i < tr.length; i++) {
        const e = tr[i];
        if (e.at <= now) {
          for (const n of e.nodes) { try { n.disconnect(); } catch (err) { /* noop */ } }
        } else tr[j++] = e;
      }
      tr.length = j;
    }
    const act = this._active;
    if (act.length) {
      let j = 0;
      for (let i = 0; i < act.length; i++) if (act[i] > now) act[j++] = act[i];
      act.length = j;
    }
  }

  /** Avoid queueing a burst of sounds into a paused/locked context. */
  _canSchedule() {
    const s = this.ctx.state;
    if (s === 'running') return true;
    if (s === 'closed' || this._paused) return false;
    return Date.now() - this._initAt < 1500; // a gesture just asked it to start
  }

  _kick() {
    const ctx = this.ctx;
    if (!ctx || this._paused) return;
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      this._initAt = Date.now(); // sounds requested during this gesture may queue until it starts
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
    if (!this._unlocked) { // iOS: play a silent buffer inside the gesture
      this._unlocked = true;
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
      } catch (e) { /* noop */ }
    }
    if (ctx.state !== 'running' && !this._unlockFn && typeof window !== 'undefined' && window.addEventListener) {
      const fn = () => {
        if (!this.ctx || this._paused) return;
        this._initAt = Date.now();
        const p = this.ctx.resume();
        const done = () => { if (this.ctx && this.ctx.state === 'running') this._unbind(); };
        if (p && p.then) p.then(done, () => {});
        else done();
      };
      this._unlockFn = fn;
      for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, fn, true);
    }
  }

  _unbind() {
    if (!this._unlockFn || typeof window === 'undefined') return;
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this._unlockFn, true);
    this._unlockFn = null;
  }
}

export const audio = new AudioSys();
export default audio;
