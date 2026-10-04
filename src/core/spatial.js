// Uniform spatial hash for circle / box colliders and proximity queries (items can be removed and re-inserted to move them).
export class SpatialHash {
  constructor(cell = 8) {
    this.cell = cell;
    this.map = new Map();
  }
  key(i, j) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  insert(item, x, z, r) {
    const c = this.cell;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
    const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.key(i, j);
      let a = this.map.get(k);
      if (!a) this.map.set(k, (a = []));
      a.push(item);
    }
  }
  // take an item out again (pass the same x, z, r it was inserted with)
  remove(item, x, z, r) {
    const c = this.cell;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
    const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.key(i, j);
      const a = this.map.get(k);
      if (!a) continue;
      for (let n = a.length - 1; n >= 0; n--) {
        if (a[n] !== item) continue;
        a[n] = a[a.length - 1];
        a.pop();
      }
      if (!a.length) this.map.delete(k);
    }
  }
  // calls fn(item) for every item in cells overlapping the query circle (may repeat across cells)
  query(x, z, r, fn) {
    const c = this.cell;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
    const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this.map.get(this.key(i, j));
      if (!a) continue;
      for (const it of a) {
        if (seen.has(it)) continue;
        seen.add(it);
        fn(it);
      }
    }
  }
}
