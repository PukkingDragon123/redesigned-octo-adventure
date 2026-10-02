// On-screen controls for phones and tablets: a steering stick on the left,
// pedal / brake / hop / drift / boost / bell on the right, and a context
// button that lights up whenever there's someone to talk to.
import { input } from '../core/input.js';
import { el } from './ui.js';
import { iconURL } from '../art/icons.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.root = el('div');
    this.root.id = 'touch';
    document.getElementById('ui').appendChild(this.root);

    // steering stick: x steers, pushing up pedals, pulling down brakes
    this.stick = el('div', 'stick', '<div class="knob"></div>');
    this.knob = this.stick.querySelector('.knob');
    this.root.appendChild(this.stick);
    let sid = null;
    const moveStick = (e) => {
      const r = this.stick.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      const k = len > 1 ? 1 / len : 1;
      this.knob.style.left = `${50 + dx * k * 40}%`;
      this.knob.style.top = `${50 + dy * k * 40}%`;
      input.touch.steer = clamp(dx * 1.25, -1, 1);
      input.touch.stickThrottle = clamp(-dy * 1.4 - 0.15, 0, 1);
      input.touch.stickBrake = clamp(dy * 1.4 - 0.35, 0, 1);
    };
    const endStick = () => {
      sid = null;
      this.knob.style.left = this.knob.style.top = '50%';
      input.touch.steer = 0;
      input.touch.stickThrottle = input.touch.stickBrake = 0;
    };
    this.stick.addEventListener('pointerdown', (e) => {
      sid = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      moveStick(e);
      e.preventDefault();
    });
    this.stick.addEventListener('pointermove', (e) => e.pointerId === sid && moveStick(e));
    this.stick.addEventListener('pointerup', endStick);
    this.stick.addEventListener('pointercancel', endStick);

    // buttons: [label | icon, action, right, bottom, size, kind]
    this.held = { pedal: false, brake: false };
    const B = [
      ['pedal', 'PEDAL', 'pedal', 8, 10, 30],
      ['brake', 'BRAKE', 'brake', 42, 6, 20],
      ['jump', 'HOP', 'jump', 12, 44, 22],
      ['drift', 'DRIFT', 'drift', 40, 32, 20],
      ['boost', null, 'boost', 66, 14, 18, 'cola'],
      ['bell', null, 'bell', 66, 38, 16, 'bell'],
    ];
    this.buttons = {};
    for (const [id, label, action, right, bottom, size, icon] of B) {
      const b = el('div', `tbtn t-${id}`, icon ? `<img src="${iconURL(icon)}">` : label);
      b.style.right = `calc(var(--u) * ${right})`;
      b.style.bottom = `calc(var(--u) * ${bottom})`;
      b.style.width = b.style.height = `calc(var(--u) * ${size})`;
      this.bindButton(b, action);
      this.root.appendChild(b);
      this.buttons[id] = b;
    }
    // talk / deliver / garage: only when there's something to do
    this.talk = el('div', 'tbtn t-talk', 'E');
    this.bindButton(this.talk, 'interact');
    this.root.appendChild(this.talk);
    // pause & map in the top corner
    this.pause = el('div', 'tbtn t-pause', '||');
    this.bindButton(this.pause, 'pause');
    this.root.appendChild(this.pause);
    this.mapBtn = el('div', 'tbtn t-map', `<img src="${iconURL('map')}">`);
    this.bindButton(this.mapBtn, 'map');
    this.root.appendChild(this.mapBtn);

    // turn on with the first touch, off again if a keyboard or pad takes over
    window.addEventListener('touchstart', () => this.enable(true), { passive: true });
    window.addEventListener('keydown', () => this.enable(false));
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable(true);
  }

  bindButton(b, action) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      if (action === 'pedal') input.touch.throttle = 1;
      else if (action === 'brake') input.touch.brake = 1;
      else {
        input.touch.buttons.add(action);
        input.tapAction(action);
      }
    };
    const up = () => {
      b.classList.remove('down');
      if (action === 'pedal') input.touch.throttle = 0;
      else if (action === 'brake') input.touch.brake = 0;
      else input.touch.buttons.delete(action);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  enable(on) {
    if (on === this.on) return;
    this.on = on;
    document.getElementById('ui').classList.toggle('touchmode', on);
    if (on) input.lastDevice = 'touch';
  }

  update() {
    const g = this.game;
    const show = this.on && g.mode === 'ride' && !g.ui.dialogueTick && !g.ui.menuStack.length;
    this.root.classList.toggle('on', show);
    if (!show) return;
    this.talk.classList.toggle('lit', !!g.ui.prompted);
    this.buttons.boost.style.display = g.bike.stats.boostCharges > 0 ? '' : 'none';
  }
}
