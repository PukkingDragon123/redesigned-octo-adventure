# Voxel art guide (for model modules)

Deli-very-dead is a cozy, cute, slightly spooky 3D voxel game set in an autumn
Canadian village during the Halloween season. The player is a friendly voxel
skeleton who delivers Nana's hot cocoa by bicycle. Everything should feel
hand-made, chunky, warm and charming: think Crossy Road / A Short Hike /
Teardown-style voxels with soft ambient occlusion, rendered with sunlight and
shadows (see `tools/voxpreview.html`).

## API (`src/voxel/vox.js`)

```js
import { Vox, EMIT, GLASS, tone, mixc, speckle, pickc, vhash } from '../vox.js';
const v = new Vox(w, h, d);          // dimensions in voxels; y is up, +z is the model's FRONT
v.set(x, y, z, 0xRRGGBB);            // 0 clears
v.fill(x0,y0,z0, x1,y1,z1, color);   // inclusive box; color may be fn(x,y,z) -> color
v.ellipsoid(cx,cy,cz, rx,ry,rz, color)
v.cylinder(cx,cy,cz, r, len, color, axis = 'y', rEnd = r)   // axis 'x' | 'y' | 'z'
v.line(x0,y0,z0, x1,y1,z1, color, radius = 0)
v.clear(...box) ; v.carve((x,y,z) => bool) ; v.paint((x,y,z,c) => newC) ; v.blit(src, ox, oy, oz) ; v.mirrorX()
tone(c, +0.2)  // lighten 20%;  tone(c, -0.2) darken
mixc(a, b, t) ; speckle(c, 0.06, seed) -> per-voxel variation fn ; pickc([c1,c2,c3], seed)
c | EMIT   // glows (candle flames, jack-o-lantern insides, cauldron brew, lamp bulbs)
c | GLASS  // window glass: dark sheen by day, warm lit at night
```

Meshing (`src/voxel/mesh.js`): `meshVox(vox, { size, origin, jitter, greedy })`.
`size` = metres per voxel, `origin` = pivot in voxel units (default bottom-centre
`[w/2, 0, d/2]`). Faces between solid voxels are culled and AO is baked, so
interiors cost nothing. Greedy meshing merges equal neighbouring faces: big flat
areas of one colour are cheap, noisy per-voxel colours are not. Use `jitter`
(0.03–0.06) only for small models; for big ones paint deliberate variation
(planks, shingles, bricks) with a few distinct tones.

## Scales (metres per voxel)

- characters, small props, food, decorations: **0.05**
- large props (benches, tables, carts, fences, scarecrows): 0.05 (≤ 64 voxels across) or 0.1
- buildings: **0.125**
- trees: **0.125** up close, then 0.25 and 0.5 (one model painted once, baked per LOD; ferns, saplings and stumps 0.0625)

## Look

- Palette: warm autumn (pumpkin orange, maple red, mustard, moss green, bark
  brown, cream), Halloween accents (purple, lime-green glow, black, bone white),
  cozy village colours (barn red, teal, butter yellow, sky blue, white siding).
  Avoid pure black and pure white; darkest ~#1e1418, lightest ~#fff4e0.
- Shape language: rounded, bulgy, slightly squashed and tilted, never perfectly
  rectangular. Give things personality (a tombstone leans, a pumpkin is lumpy,
  a mailbox has a dent and a little red flag).
- Detail through colour bands and small protrusions, 1-voxel trims, rims and
  outlines in a darker tone, highlights in a lighter tone on top edges.
- Keep models solid (no 1-voxel-thick floating bits that disappear at distance).

## Module contract

A model module exports named builder functions (each returning
`{ vox, size, origin?, meta? }`) and a `PREVIEW` object mapping names to
zero-argument functions, so the preview tool can render them:

```
/tools/voxpreview.html?mod=/src/voxel/models/props.js&cols=6&cell=1.4
```

Screenshot it with Playwright (see the instructions you were given) and iterate
until every model reads clearly and looks charming from a 3/4 view. Report face
counts (`faces` label under each model) and keep them reasonable.
