// Worker: pixels forest sprites off the main thread (see art/trees2d.js).
import { bakeSprite } from '../art/trees2d.js';

self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const res = bakeSprite(job);
    self.postMessage({ id, res }, res.views.map((v) => v.data.buffer));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
