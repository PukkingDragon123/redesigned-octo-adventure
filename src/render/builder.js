// Merges many small primitives into one BufferGeometry with per-vertex colour
// (rgb + emissive) and atlas tile rects, so whole buildings/bikes are one draw call.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// atlas tile registry: name -> [u0, v0, du, dv] (filled by art/atlas.js)
export const TILES = { white: [0, 0, 1 / 64, 1 / 64] };
// texels per logical sprite pixel for tiles painted at 2x (signs), so their mip 1 is the crisp 1x art
export const TILE_DENSITY = {};

export function linearColor(hex) {
  const c = new THREE.Color(hex); // converts sRGB hex -> linear working space
  return c;
}

export class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.tile = [];
    this.idx = [];
    this.count = 0;
  }

  // Add a THREE geometry with a transform. opts: { color, emissive, tile, uvScale:[su,sv] }
  add(geo, matrix, { color = 0xffffff, emissive = 0, tile = 'white', uvScale = null, uvFromWorld = null } = {}) {
    const g = geo.index ? geo : geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const c = color instanceof THREE.Color ? color : linearColor(color);
    const t = TILES[tile] || TILES.white;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      const wx = _v.x, wy = _v.y, wz = _v.z;
      if (N) {
        _v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        this.nor.push(_v.x, _v.y, _v.z);
      } else this.nor.push(0, 1, 0);
      this.col.push(c.r, c.g, c.b, emissive);
      let u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0;
      if (uvScale) {
        u *= uvScale[0];
        v *= uvScale[1];
      }
      if (uvFromWorld) [u, v] = uvFromWorld(wx, wy, wz, _v);
      this.uv.push(u, v);
      this.tile.push(t[0], t[1], t[2], t[3]);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    } else {
      for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    }
    this.count += P.count;
    return this;
  }

  // Axis-aligned (then transformed) box. size = [w, h, d] centred at pos, rotation euler [x,y,z]
  box(pos, size, opts = {}, rot = null, parentMatrix = null) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    // UVs in metres so textures keep a constant texel density
    if (opts.tile && opts.tile !== 'white' && !opts.keepUV) {
      const uv = g.attributes.uv;
      const n = g.attributes.normal;
      const tm = opts.tileMeters || 2;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
        let su, sv;
        if (nx > 0.5) { su = size[2]; sv = size[1]; }
        else if (ny > 0.5) { su = size[0]; sv = size[2]; }
        else { su = size[0]; sv = size[1]; }
        uv.setXY(i, (uv.getX(i) * su) / tm, (uv.getY(i) * sv) / (opts.tileMetersV || tm));
      }
    }
    _m.compose(_v.set(pos[0], pos[1], pos[2]), rot ? _q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')) : _q.identity(), _s.set(1, 1, 1));
    if (parentMatrix) _m.premultiply(parentMatrix);
    return this.add(g, _m.clone(), opts);
  }

  // Cylinder between points a and b
  tube(a, b, r0, r1 = r0, opts = {}, segs = 6, parentMatrix = null) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len < 1e-5) return this;
    const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, opts.open ?? false);
    const dir = B.clone().sub(A).normalize();
    _q.setFromUnitVectors(_up, dir);
    _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    if (parentMatrix) _m.premultiply(parentMatrix);
    return this.add(g, _m.clone(), opts);
  }

  geom(geo, pos = [0, 0, 0], rot = null, scale = [1, 1, 1], opts = {}, parentMatrix = null) {
    _m.compose(_v.set(pos[0], pos[1], pos[2]), rot ? _q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')) : _q.identity(), _s.set(scale[0], scale[1], scale[2]));
    if (parentMatrix) _m.premultiply(parentMatrix);
    return this.add(geo, _m.clone(), opts);
  }

  // Planar convex polygon (fan-triangulated) with UVs in metres projected on its plane.
  // Points are [x,y,z] in local space; uAxis optional [x,y,z] direction for texture u.
  poly(points, opts = {}, parentMatrix = null, uAxis = null) {
    const P = points.map((p) => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
    const U = uAxis ? new THREE.Vector3(...uAxis).normalize() : new THREE.Vector3().subVectors(P[1], P[0]).normalize();
    const V = new THREE.Vector3().crossVectors(n, U).normalize();
    const tm = opts.tileMeters || 2.5;
    const pos = [], nor = [], uv = [], idx = [];
    for (const p of P) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(p.dot(U) / tm, p.dot(V) / (opts.tileMetersV || tm));
    }
    for (let i = 1; i < P.length - 1; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return this.add(g, parentMatrix ? parentMatrix.clone() : new THREE.Matrix4(), opts);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.tile, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
