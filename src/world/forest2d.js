// (The forest used to be drawn as 2D pixel-art cards here; every tree is a voxel model
// now, see voxelForest.js. This stays for callers that build a lone tree.)
import { makeVoxelTree } from './voxelForest.js';

// A tree that needs no forest (cutscenes, tools): the voxel model, pivot at the trunk
// base, metres; userData.meta = { height, trunkR, ... }.
export function makeTreeSprite(species, seed = 0) {
  return makeVoxelTree(species, seed);
}
