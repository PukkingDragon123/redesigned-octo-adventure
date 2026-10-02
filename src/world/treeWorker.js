// Worker: bakes tree models off the main thread (see treeBake.js).
import { bakeTree, bakeTransfer } from './treeBake.js';

self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const res = bakeTree(job);
    self.postMessage({ id, res }, bakeTransfer(res));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
