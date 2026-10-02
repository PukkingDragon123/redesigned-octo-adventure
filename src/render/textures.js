// Helpers to turn Pix images into three.js textures.
import * as THREE from 'three';

export function pixTexture(pix, { repeat = true, mips = true, srgb = true, nearest = true } = {}) {
  const tex = new THREE.DataTexture(new Uint8Array(pix.data.buffer.slice(0)), pix.w, pix.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = mips ? (nearest ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter) : nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.generateMipmaps = mips;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function dataTexture(data, w, h, { format = THREE.RGBAFormat, type = THREE.UnsignedByteType, linear = true } = {}) {
  const tex = new THREE.DataTexture(data, w, h, format, type);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
