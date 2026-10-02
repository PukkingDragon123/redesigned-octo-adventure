// Safe wrapper around the procedural audio system (never throws into gameplay).
import { audio } from '../audio/audio.js';

const safe = (fn) => (...a) => {
  try {
    return fn(...a);
  } catch (e) {
    if (!safe.warned) {
      safe.warned = true;
      console.warn('audio error', e);
    }
  }
};

export const sound = {
  init: safe(() => audio.init()),
  play: safe((name, opts) => audio.play(name, opts)),
  blip: safe((voice) => audio.blip(voice)),
  music: safe((mood) => audio.setMusic(mood)),
  bike: safe((p) => audio.setBike(p)),
  motor: safe((p) => audio.setMotor(p)),
  ambience: safe((p) => audio.setAmbience(p)),
  volumes: safe((v) => audio.setVolumes(v)),
  update: safe((dt) => audio.update(dt)),
  suspend: safe(() => audio.suspend()),
  resume: safe(() => audio.resume()),
};
