// Worker: pixels the 2D street clutter and furniture off the main thread (see decoPaint.js).
import { bakeAllSync } from './decoPaint.js';

self.onmessage = (e) => {
  try {
    const pages = bakeAllSync(e.data.kinds);
    self.postMessage({ pages }, pages.map((p) => p.data.buffer));
  } catch (err) {
    self.postMessage({ error: String((err && err.stack) || err) });
  }
};
