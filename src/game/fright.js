// Frightened stiff: the poses for the contest's first look at Hank (contest.js, crowd.js,
// Story.townEntry). Nobody screams and nobody runs: they freeze where they stand, whatever
// they were doing, and a fright style is layered over the held pose: trembling, hands
// flying up to the mouth, hands half up, arms clutched tight, a half cower. Plus a gulp.
import { POSE_KIT, REACT } from './vchar.js';

const { arm, POSES } = POSE_KIT;
const S = Math.sin;

// a fine shiver through the body (k: how hard), the teeth chattering when k is big
export function tremble(c, t, T, k = 1) {
  const ph = (c.seed || 0) * 3.1;
  T.tilt += S(t * 53 + ph) * 0.022 * k;
  T.twist += S(t * 47 + ph) * 0.02 * k;
  T.headZ += S(t * 61 + ph) * 0.025 * k;
  T.bodyY += S(t * 38 + ph) * 0.004 * k;
  if (k > 0.9) T.jaw = Math.max(T.jaw, Math.abs(S(t * 29 + ph)) * 0.1);
}

// fright styles, layered over whatever pose they froze in
export const FRIGHT = {
  // stock still, mid-action (the knife held up, the cup at the lips), only shaking
  still() {},
  // both hands flown up to the mouth
  mouth(c, t, T) {
    arm(T, 'L', 1.55, 0.18, 2.3, 0.6); arm(T, 'R', 1.55, 0.18, 2.3, 0.6);
    T.lean -= 0.08; T.headX += 0.06; T.shUp += 0.02;
  },
  // hands half up beside the head, palms out ("I'm not moving!")
  hands(c, t, T) {
    arm(T, 'L', 0.5, 2.1, 0.95, -0.2); arm(T, 'R', 0.5, 2.1, 0.95, -0.2);
    T.lean -= 0.1; T.shUp += 0.03;
  },
  // arms clutched tight across the chest, leaning away
  clutch(c, t, T) {
    arm(T, 'L', 0.62, -0.08, 2.05, 1.05); arm(T, 'R', 0.66, -0.08, 2.0, 1.05);
    T.lean -= 0.07; T.headX += 0.08; T.shUp += 0.03;
  },
  // a half crouch, hands up by the face, knees knocking
  cower(c, t, T) {
    POSES.scared(c, t, T);
  },
};
export const STYLES = Object.keys(FRIGHT);

// the overlay for one frozen character: c._freeze = { style, shake }
export function frightOverlay(c, t, T) {
  const f = c._freeze;
  if (!f) return;
  FRIGHT[f.style]?.(c, t, T);
  tremble(c, t, T, f.shake ?? 0.6);
}

// a big nervous gulp: the head dips, the shoulders rise, then back up
Object.assign(REACT, {
  gulp: {
    d: 0.9, expr: 'scared',
    start(c) { c.kick('sq', 0.9); },
    f(c, t, T) {
      const k = S(Math.min(1, t / 0.55) * Math.PI);
      T.headX += 0.2 * k; T.shUp += 0.045 * k; T.jaw = 0; T.headUp -= 0.02 * k;
    },
  },
});

// a tremble that isn't a freeze (someone not frozen, just shaky): a short reaction
Object.assign(REACT, {
  tremble: {
    d: 1.4, expr: 'scared',
    f(c, t, T) { tremble(c, t, T, 1.2); FRIGHT.clutch(c, t, T); },
  },
});

// a fright style that suits the pose they froze in (busy hands stay busy, mostly)
export function styleFor(pose, rnd = Math.random()) {
  if (pose === 'carve' || pose === 'scoop' || pose === 'photo' || pose === 'sipCider' || pose === 'clipboard' || pose === 'announce') return rnd < 0.6 ? 'still' : 'mouth';
  if (pose === 'cane') return rnd < 0.5 ? 'still' : 'clutch';
  if (pose === 'stroll' || pose === 'leash') return 'clutch';
  return STYLES[1 + Math.floor(rnd * (STYLES.length - 1))];
}
