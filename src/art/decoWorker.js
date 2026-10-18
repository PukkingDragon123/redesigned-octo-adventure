// Worker: builds the voxel models of the street clutter and furniture off the main thread
// (see decoVox.js). Mesh arrays are transferred.
import { bakeDecoSync, decoTransfer } from './decoVox.js';

self.onmessage = (e) => {
  try {
    const models = bakeDecoSync(e.data.kinds);
    self.postMessage({ models }, decoTransfer(models));
  } catch (err) {
    self.postMessage({ error: String((err && err.stack) || err) });
  }
};
