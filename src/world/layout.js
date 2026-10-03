// The handcrafted map of Maple Hollow & Maple Cove.
// X = east, Z = south (north is -Z). Units are metres. Water level is y = 0.
//
//   NW  Old Pine Cemetery            N  Sunset Lookout (hill) . . . loop road . . .  NE  Sandy Point Beach
//   W   Nana's homestead -- main road -- Beaver Creek covered bridge -- farm -- Maple Cove (Main Street)
//   SW  trapper's hut                S  sawmill, river mouth           SE  harbour, lighthouse point
//
// The main road runs west -> east from Nana's to the village with gentle curves; the loop road
// leaves it at the covered bridge, climbs past the sugar shack, skirts the lookout hill and comes
// down to the beach, then runs south along the coast back into the east end of Main Street.

export const WORLD_HALF = 320;
export const WATER_LEVEL = 0;

// Points of interest (keys used by the story, the map, ambience and music)
export const POI = {
  cabin: { x: -170, z: 70, r: 34, name: "Nana Marguerite's Cabin" },
  garage: { x: -154, z: 94 },
  graveyard: { x: -214, z: -40, r: 26, name: 'Old Pine Cemetery' },
  grave: { x: -214, z: -44 },
  bridge: { x: -31, z: 32, name: 'Beaver Creek Bridge' },
  lookout: { x: 62, z: -118, r: 16, name: 'Sunset Lookout' },
  village: { x: 188, z: 46, r: 95, name: 'Maple Cove' },
  plaza: { x: 186, z: 24, r: 18, name: 'The Town Green' }, // the town green with the gazebo
  lighthouse: { x: 306, z: 2 },
  sawmill: { x: 96, z: 128 },
  treestand: { x: -112, z: -150 },
  trapper: { x: -250, z: 150 },
  pond: { x: -38, z: -150 },
  meadow1: { x: -95, z: -55, r: 28 },
  meadow2: { x: 140, z: -58, r: 24 },
  catLog: { x: -87.5, z: 42.6 }, // where Poutine waits, in front of a hollow log just off the road
  // countryside places
  farm: { x: 56, z: 84, r: 36, name: 'Ferme Gagnon' },
  pumpkinPatch: { x: 34, z: 98, r: 14 },
  cornMaze: { x: 72, z: 108, r: 14 },
  sugarShack: { x: 48, z: -36, r: 14, name: 'Cabane à Sucre' },
  campground: { x: -62, z: -128, r: 14, name: 'Beaver Pond Campground' },
  picnic: { x: -8, z: 58, r: 10, name: 'Picnic Area' },
  beach: { x: 282, z: -58, r: 40, name: 'Sandy Point Beach' },
  harbour: { x: 186, z: 104, r: 30, name: 'The Harbour' },
  rink: { x: 226, z: 16, name: 'The Rink' },
  bikePark: { x: 132, z: 10, r: 18, name: 'Bike Park' },
  pumpkinStand: { x: 44, z: 46 },
  damBridge: { x: -38, z: -141 },
  restStop: { x: 180, z: -107, r: 9, name: 'Rest Area' },
  // the prologue's lumber camp: a flat clearing ringed by dense autumn forest, just east of the grave road
  lumberCamp: { x: -181, z: 16, r: 12 },
};

// The sea & the cove. Shapes: ellipse {cx,cz,rx,rz} or rounded box {box:[x0,z0,x1,z1], round}
export const SEA = [
  { cx: 450, cz: 90, rx: 165, rz: 330 }, // open sea to the east
  { box: [128, 82, 282, 178], round: 14 }, // the cove (harbour)
  { cx: 270, cz: 240, rx: 150, rz: 85 }, // south bay
];
// Land that always stays above water (cut out of the sea): the lighthouse point
export const LAND = [
  { cx: 303, cz: 5, rx: 15, rz: 13 },
];
// Sandy beaches: a smooth shoreline, a wide gentle slope of sand into the sea and low dunes behind.
// (x,z) centre of the beach, len along the shore, width of dry sand inland from the waterline.
export const BEACHES = [
  { x: 296, z: -58, len: 104, width: 30, angle: 0.18 }, // angle: shore normal (radians from +x toward +z)
];

// River: north mountains -> cove. Width per point.
export const RIVER = [
  { x: -30, z: -340, w: 8 },
  { x: -44, z: -250, w: 9 },
  { x: -26, z: -190, w: 9 },
  { x: -40, z: -150, w: 18 }, // beaver pond
  { x: -30, z: -110, w: 10 },
  { x: -46, z: -50, w: 10 },
  { x: -36, z: 0, w: 11 },
  { x: -30, z: 32, w: 11 }, // bridge
  { x: -12, z: 80, w: 12 },
  { x: 20, z: 128, w: 12 },
  { x: 62, z: 156, w: 13 },
  { x: 108, z: 160, w: 16 },
  { x: 130, z: 158, w: 20 },
];

// Main Street: straight, with curbs & sidewalks; storefronts line both sides.
export const MAIN_ST = { x0: 114, x1: 268, z: 50, road: 8, walk: 2.6 };
// zebra crossings (x) and the side streets that meet Main Street (sidewalk gaps, stop lines)
export const CROSSWALKS = [118, 166, 205.5, 262];
export const SIDE_STREETS = [{ x: 118, side: -1, w: 4 }, { x: 166, side: 1, w: 5 }];
const MS_N = MAIN_ST.z - MAIN_ST.road / 2 - MAIN_ST.walk - 0.2; // north-side building fronts (z)
const MS_S = MAIN_ST.z + MAIN_ST.road / 2 + MAIN_ST.walk + 0.2; // south-side building fronts

// Roads. type: 'road' (wide country road), 'trail' (narrow path), 'street' (village)
// smooth: Catmull-Rom through the points (gentle curves); grade: max slope the profile may have;
// flat: width of the flattened strip (defaults to w)
export const ROADS = [
  // Main Street comes first: every road that meets it takes its height (no steps at junctions)
  { id: 'street', type: 'street', w: MAIN_ST.road, flat: MAIN_ST.road + MAIN_ST.walk * 2 + 3, pts: [[MAIN_ST.x0, 50], [MAIN_ST.x1, 50]] },
  {
    id: 'main', type: 'road', w: 8, smooth: true, grade: 0.07,
    pts: [
      [-150, 72], [-128, 63], [-106, 54], [-88, 48.4], [-66, 40], [-46, 33.5], [-31, 32], [-14, 31.6], [8, 33],
      [32, 38], [56, 42], [80, 46], [100, 49], [114, 50],
    ],
  },
  {
    id: 'coastRoad', type: 'road', w: 7, smooth: true, grade: 0.08,
    pts: [[MAIN_ST.x1, 50], [279, 43], [285, 30], [281, 12], [270, -8], [258, -30], [254, -56], [258, -84], [262, -104], [248, -122], [226, -130]],
  },
  { id: 'lighthouseLane', type: 'street', w: 4.5, smooth: true, pts: [[285, 30], [294, 20], [300, 13]] },
  { id: 'cabinDrive', type: 'road', w: 6, pts: [[-172, 76], [-160, 74], [-150, 72]] },
  { id: 'garagePath', type: 'trail', w: 4, pts: [[-143, 94], [-145, 86], [-149, 78], [-152, 73]] },
  { id: 'graveRoad', type: 'trail', w: 4.5, pts: [[-176, 60], [-186, 36], [-198, 10], [-206, -12], [-212, -28]] },
  {
    id: 'northLoop', type: 'road', w: 7, smooth: true, grade: 0.1,
    pts: [[8, 33], [17, 12], [25, -12], [32, -32], [44, -56], [66, -70], [96, -80], [128, -96], [160, -112], [194, -124], [226, -130]],
  },
  { id: 'lookoutTrail', type: 'trail', w: 4, smooth: true, grade: 0.13, pts: [[66, -70], [56, -82], [70, -92], [56, -102], [62, -112]] },
  { id: 'standTrail', type: 'trail', w: 4, smooth: true, grade: 0.11, pts: [[-92, 49], [-96, 20], [-94, -14], [-98, -50], [-104, -86], [-108, -118], [-112, -144]] },
  { id: 'trapperTrail', type: 'trail', w: 4, grade: 0.11, pts: [[-172, 80], [-190, 104], [-212, 126], [-234, 144], [-248, 150]] },
  { id: 'pondTrail', type: 'trail', w: 4, smooth: true, grade: 0.11, pts: [[-98, -50], [-80, -76], [-68, -104], [-62, -124]] },
  { id: 'damTrail', type: 'trail', w: 3.5, smooth: true, grade: 0.12, pts: [[-62, -124], [-52, -137], [-40, -141], [-26, -136], [-6, -116], [14, -92], [30, -66], [44, -56]] },
  { id: 'sawmillRoad', type: 'trail', w: 5, smooth: true, grade: 0.09, pts: [[88, 47.6], [92, 72], [95, 100], [96, 122]] },
  { id: 'farmLane', type: 'trail', w: 5, smooth: true, grade: 0.09, pts: [[52, 41.4], [53, 58], [56, 72]] },
  { id: 'sugarLane', type: 'trail', w: 4, smooth: true, grade: 0.1, pts: [[32, -32], [42, -34], [48, -36]] },
  { id: 'picnicLane', type: 'trail', w: 3.5, grade: 0.1, pts: [[-2, 32.6], [-6, 44], [-8, 52]] },
  { id: 'gusDrive', type: 'trail', w: 3.5, pts: [[108, 49.6], [104, 40]] },
  { id: 'parkLane', type: 'street', w: 4, pts: [[118, MS_N + 0.2], [118, 26], [124, 20]] },
  { id: 'wharfSt', type: 'street', w: 5, pts: [[166, MS_S - 0.2], [166, 76]] },
  { id: 'beachLane', type: 'street', w: 5, pts: [[256, -40], [266, -42]] },
  // gravel paths across the town green to the gazebo and the chapel
  { id: 'greenPath1', type: 'trail', w: 2.4, path: true, pts: [[186, MS_N + 0.2], [186, 9]] },
  { id: 'greenPath2', type: 'trail', w: 2.4, path: true, pts: [[170, 40], [186, 24], [202, 40]] },
];

// Flat areas (cx, cz, r, h = target height or null for local smoothing)
export const FLATS = [
  { x: -170, z: 72, r: 30, h: 9 },
  { x: -214, z: -40, r: 20, h: null },
  { x: 62, z: -118, r: 12, h: null },
  { x: -250, z: 150, r: 10, h: null },
  { x: 56, z: 84, r: 40, h: 8.6 }, // the farm
  { x: 46, z: -38, r: 15, h: 8.4 }, // sugar shack
  { x: -62, z: -128, r: 15, h: 4.6 }, // campground by the pond
  { x: -8, z: 58, r: 12, h: 4.4 }, // picnic area on the river bank
  { x: 100, z: 36, r: 9, h: null }, // Gus's yard
  { x: 90, z: 46, r: 30, h: 5.2 }, // the road dips gently down into the village
  { x: -181, z: 16, r: 16, h: null }, // the lumber camp clearing
  { x: 180, z: -107, r: 11, h: null }, // the rest area on the loop road
];
// Smooth hollows pressed into the ground (the bike park bowl): r radius, depth metres
export const BOWLS = [
  { x: 138, z: 6, r: 8, depth: 1.9 },
];
// Pump-track rollers: bumps along a segment
export const ROLLERS = [
  { a: [112, 20], b: [112, -2], h: 0.55, wave: 5.5 },
];

// The village: a gently sloping shelf above the cove.
export const VILLAGE_FLAT = { x0: 104, x1: 284, z0: -8, z1: 90, h: 3.2 };

// Boardwalk on stilts along the waterfront (Telegraph Cove style).
// Segments of [x0,z0] -> [x1,z1] with width and deck height.
export const BOARDWALK = [
  { a: [128, 86], b: [262, 86], w: 4, h: 3.0 },
];
// Gangways connecting the yards / Wharf Street to the boardwalk
export const BOARDWALK_RAMPS = [
  { a: [166, 76], b: [166, 84.2], w: 4.2 },
  { a: [132, 76], b: [132, 84.2], w: 3.2 },
  { a: [252, 76], b: [252, 84.2], w: 3.2 },
];
// Floating docks reaching into the cove
export const DOCKS = [
  { a: [150, 88], b: [150, 122], w: 3, h: 1.1, floating: true },
  { a: [184, 88], b: [184, 128], w: 3.2, h: 1.1, floating: true },
  { a: [226, 88], b: [230, 120], w: 2.6, h: 1.1, floating: true },
];

// Buildings. kind drives the voxel model (src/voxel/models/buildings.js KINDS); color is the siding
// palette key. facing: radians (0 = door faces +z / south). Positions are building centres.
const N = (x, w, d, o) => ({ x, z: MS_N - d / 2, w, d, facing: 0, ...o }); // north side of Main Street
const S = (x, w, d, o) => ({ x, z: MS_S + d / 2, w, d, facing: Math.PI, ...o }); // south side
export const BUILDINGS = [
  // ---- Main Street, north side (west -> east), the green sits in the middle
  N(126, 12, 12, { id: 'firehall', kind: 'firehall', floors: 2, color: 'brick', roof: 'dark', sign: 'CASERNE FIRE HALL' }),
  N(142, 10, 9, { id: 'postoffice', kind: 'shop', floors: 2, color: 'white', roof: 'dark', sign: 'POSTES CANADA POST', shop: 'post' }),
  N(156.5, 11, 9, { id: 'donuts', kind: 'shop', floors: 1, color: 'pink', roof: 'dark', sign: 'DOUBLE-DOUBLE DONUTS', shop: 'donuts' }),
  N(215, 11, 9, { id: 'cafe', kind: 'shop', floors: 2, color: 'red', roof: 'dark', sign: 'CAFE ERABLE', shop: 'cafe', owner: 'marie' }),
  N(230.5, 14, 10, { id: 'store', kind: 'shop', floors: 2, color: 'green', roof: 'dark', sign: 'MOOSE & GOOSE', shop: 'store', recess: 3 }),
  N(246.5, 10, 9, { id: 'clinic', kind: 'house', floors: 2, color: 'yellow', roof: 'dark', sign: 'CLINIQUE CLINIC', owner: 'ingrid' }),
  N(260.5, 10, 9, { id: 'inn', kind: 'house', floors: 2, color: 'blue', roof: 'dark', sign: 'AUBERGE INN', porch: true }),
  // ---- Main Street, south side (doors face north onto the street; back yards look over the harbour)
  S(124.5, 9, 8, { id: 'doug', kind: 'house', floors: 1, color: 'white', roof: 'red', sign: 'POLICE', owner: 'doug' }),
  S(138, 8, 6, { id: 'chipshack', kind: 'shop', floors: 1, color: 'yellow', roof: 'red', sign: 'POUTINE', shop: 'poutine' }),
  S(152, 9, 8, { id: 'kids', kind: 'house', floors: 2, color: 'teal', roof: 'dark', owner: 'kids', porch: true }),
  S(181, 9, 8, { id: 'agnes', kind: 'house', floors: 2, color: 'blue', roof: 'dark', owner: 'agnes' }),
  S(195, 8, 7, { id: 'birdie', kind: 'house', floors: 1, color: 'red', roof: 'dark', owner: 'birdie' }),
  S(208.5, 9, 8, { id: 'house5', kind: 'house', floors: 1, color: 'white', roof: 'green', porch: true }),
  S(230, 9, 8, { id: 'house6', kind: 'shop', floors: 2, color: 'yellow', roof: 'dark', sign: 'QUINCAILLERIE HARDWARE', shop: 'hardware' }),
  S(243.5, 9, 7, { id: 'house7', kind: 'shop', floors: 2, color: 'white', roof: 'red', sign: 'BOULANGERIE BAKERY', shop: 'bakery' }),
  // ---- the green, the chapel & the harbour
  { id: 'chapel', kind: 'chapel', x: 186, z: -2, w: 8, d: 13, floors: 1, color: 'white', roof: 'dark', facing: 0 },
  { id: 'gazebo', kind: 'gazebo', x: 186, z: 24, w: 7, d: 7, floors: 1, color: 'white', roof: 'green', facing: 0 },
  { id: 'rink', kind: 'rink', x: 226, z: 16, w: 26, d: 13, floors: 1, color: 'white', roof: 'dark', facing: 0 },
  { id: 'boathouse', kind: 'house', x: 204, z: 93, w: 10, d: 8, floors: 1, color: 'white', roof: 'green', stilts: true, facing: Math.PI },
  { id: 'fishmarket', kind: 'house', x: 244, z: 92.5, w: 9, d: 7, floors: 1, color: 'red', roof: 'dark', stilts: true, facing: Math.PI, sign: 'LOBSTER' },
  { id: 'lighthouse', kind: 'lighthouse', x: 306, z: 2, w: 5, d: 5, floors: 3, color: 'white', roof: 'red', facing: 0 },
  { id: 'lighthouseHut', kind: 'house', x: 294, z: 4, w: 6, d: 5, floors: 1, color: 'white', roof: 'red', facing: 0.5 + Math.PI, owner: 'lou_lh' },
  // ---- village edge & countryside
  { id: 'gus', kind: 'cabin', x: 100, z: 34, w: 8, d: 7, floors: 1, color: 'log', roof: 'dark', facing: Math.PI * 0.08, owner: 'gus' },
  { id: 'sawmill', kind: 'sawmill', x: 98, z: 132, w: 16, d: 10, floors: 1, color: 'weathered', roof: 'rust', facing: 0.2, sign: 'SAWMILL', owner: 'lou' },
  { id: 'barn', kind: 'barn', x: 66, z: 80, w: 14, d: 12, floors: 2, color: 'red', roof: 'dark', facing: -Math.PI / 2 },
  { id: 'farmhouse', kind: 'house', x: 44, z: 66, w: 9, d: 8, floors: 2, color: 'white', roof: 'red', facing: Math.PI / 2, porch: true },
  { id: 'sugarshack', kind: 'sugarshack', x: 50, z: -40, w: 9, d: 7, floors: 1, color: 'weathered', roof: 'rust', facing: -Math.PI / 2 - 0.15, sign: 'CABANE A SUCRE' },
  { id: 'fishchips', kind: 'shop', x: 248, z: -46, w: 7, d: 6, floors: 1, color: 'teal', roof: 'red', facing: Math.PI / 2 + 0.1, sign: 'FISH & CHIPS', shop: 'fishchips' },
  { id: 'lifeguard', kind: 'lifeguard', x: 288, z: -64, w: 2.4, d: 2.4, floors: 1, color: 'white', roof: 'red', facing: Math.PI / 2 + 0.18 },
  { id: 'houseRiver', kind: 'house', x: -62, z: 22, w: 8, d: 7, floors: 1, color: 'yellow', roof: 'dark', facing: 0.35, porch: true },
  { id: 'houseLoop', kind: 'cabin', x: 6, z: 2, w: 8, d: 7, floors: 1, color: 'log', roof: 'moss', facing: Math.PI / 2 + 0.3 },
  { id: 'houseHill', kind: 'house', x: 112, z: -82, w: 9, d: 7, floors: 1, color: 'red', roof: 'dark', facing: 0.45 },
  // ---- Nana's homestead
  { id: 'nana', kind: 'cabin', x: -178, z: 64, w: 11, d: 9, floors: 1, color: 'log', roof: 'moss', facing: Math.PI * 0.5, chimney: true, porch: true, owner: 'grandma' },
  { id: 'garage', kind: 'shed', x: -154, z: 94, w: 7, d: 8, floors: 1, color: 'weathered', roof: 'rust', facing: Math.PI * 0.5 },
  { id: 'outhouse', kind: 'outhouse', x: -190, z: 92, w: 1.6, d: 1.6, floors: 1, color: 'weathered', roof: 'rust', facing: Math.PI * 0.5 },
  { id: 'trapperHut', kind: 'cabin', x: -252, z: 146, w: 6, d: 5, floors: 1, color: 'log', roof: 'moss', facing: Math.PI * 0.3 },
];

// a point `dist` metres in front of a building's door (along its facing), with side offset `side`
export function frontOf(id, dist = 2, side = 0) {
  const b = BUILDINGS.find((q) => q.id === id);
  const f = b.facing || 0, s = Math.sin(f), c = Math.cos(f);
  const k = b.d / 2 + dist;
  return { x: b.x + s * k + c * side, z: b.z + c * k - s * side };
}
const at = (id, dist, side = 0) => frontOf(id, dist, side);

// Customers (NPC id -> where they stand to receive cocoa)
export const CUSTOMERS = {
  gus: { name: 'Gus', ...at('gus', 2.6, 1.5), house: 'gus' },
  marie: { name: 'Marie-Claude', ...at('cafe', 1.4, -1.2), house: 'cafe' },
  birdie: { name: 'Captain Birdie', ...at('birdie', 2.2), house: 'birdie' },
  agnes: { name: 'Agnes', ...at('agnes', 2.4, -1.5), house: 'agnes' },
  doug: { name: 'Constable Doug', ...at('doug', 1.6, 2.5), house: 'doug' },
  ingrid: { name: 'Dr. Ingrid', ...at('clinic', 1.5, 1.5), house: 'clinic' },
  kids: { name: 'Pip & Pop', x: 220, z: 17, house: 'kids' }, // out on the rink
  lou: { name: 'Big Lou', x: 104, z: 122, house: 'sawmill' },
  lou_lh: { name: 'Old Ollie', ...at('lighthouseHut', 2.4), house: 'lighthouseHut' },
};
// Mo minds the counter on the general store's front porch
export const MO_SPOT = { ...at('store', -2.35, -1.4), yaw: 0 };
// Doug walks a beat along the Main Street sidewalk
export const DOUG_BEAT = [{ x: 132, z: MS_S - 1.3 }, { x: 160, z: MS_S - 1.3 }, { x: 162, z: MS_N + 1.3 }, { x: 134, z: MS_N + 1.3 }];

// Wooden jump ramps (x, z, heading radians, length, height). Bike-park ramps sit off the roads;
// roadside kickers sit on the shoulder so you can choose to hit them.
export const RAMPS = [
  // bike park
  { x: 122, z: 14, yaw: Math.PI, len: 4, h: 0.9 },
  { x: 128, z: 22, yaw: Math.PI / 2, len: 5, h: 1.4 },
  { x: 146, z: 22, yaw: -Math.PI / 2, len: 5, h: 1.4 },
  { x: 152, z: 4, yaw: Math.PI, len: 6, h: 2.0 },
  // roadside kickers
  { x: 20, z: 3, yaw: -0.4 + Math.PI, len: 5, h: 1.3 },
  { x: 74, z: 51, yaw: 1.42, len: 5, h: 1.1 },
  { x: 262, z: -70, yaw: Math.PI + 0.12, len: 5, h: 1.3 },
  { x: -95, z: -2, yaw: Math.PI + 0.05, len: 5, h: 1.3 },
  { x: -198, z: 112, yaw: 2.3, len: 5, h: 1.2 },
];

// Tree clearings (forest.js thins trees inside r, fading back over `soft` metres)
export const CLEARINGS = [
  { x: -170, z: 70, r: 24, soft: 14 }, // homestead
  { x: -148, z: 94, r: 9, soft: 6 }, // room in front of Harold's garage
  { x: -214, z: -40, r: 18, soft: 8 }, // cemetery
  { x: 62, z: -118, r: 11, soft: 8 }, // lookout
  { x: -250, z: 150, r: 7, soft: 6 }, // trapper
  { x: -95, z: -55, r: 17, soft: 14 }, // meadow1
  { x: 140, z: -58, r: 15, soft: 12 }, // meadow2
  { x: 96, z: 128, r: 14, soft: 6 }, // sawmill
  { x: 306, z: 2, r: 14, soft: 6 }, // lighthouse
  { x: 56, z: 88, r: 38, soft: 10 }, // farm & fields
  { x: 48, z: -38, r: 11, soft: 5 }, // sugar shack (the sugar bush stays around it)
  { x: -62, z: -128, r: 13, soft: 6 }, // campground
  { x: -8, z: 58, r: 9, soft: 6 }, // picnic area
  { x: 100, z: 34, r: 9, soft: 5 }, // Gus
  { x: -62, z: 22, r: 9, soft: 5 }, { x: 6, z: 2, r: 8, soft: 5 }, { x: 112, z: -82, r: 9, soft: 5 }, // houses along the roads
  { x: 250, z: -46, r: 10, soft: 6 }, // fish & chips
  { x: 180, z: -107, r: 9, soft: 5 }, // rest area & the giant goose
  { x: -181, z: 16, r: 12, soft: 2.5, ring: 10, bare: true }, // lumber camp: open inside (no undergrowth either), thick forest right at its edge
];
// Trees planted on purpose (the big maple on the green, maples lining the green)
export const PLANTED = [
  { x: 176, z: 14, species: 'maple', H: 13.5 },
  { x: 199, z: 33, species: 'maple2', H: 9 },
  { x: 171, z: 35, species: 'maple', H: 9.5 },
  { x: 203, z: 12, species: 'oak', H: 9 },
];

// Wooden signposts at junctions: arrows name the destinations (dir = world heading the arrow points at,
// radians, 0 = +z / south, PI/2 = +x / east)
const E = Math.PI / 2, W = -Math.PI / 2, Nn = Math.PI, Ss = 0;
export const SIGNPOSTS = [
  { x: -145, z: 75.5, arrows: [{ text: 'MAPLE COVE', dir: E - 0.35 }, { text: 'CEMETERY', dir: Nn + 0.4 }, { text: "NANA'S", dir: W + 0.2 }] },
  { x: -88, z: 53.5, arrows: [{ text: 'BEAVER POND', dir: Nn - 0.1 }, { text: 'MAPLE COVE', dir: E - 0.3 }, { text: "NANA'S", dir: W - 0.3 }] },
  { x: 12, z: 38.5, arrows: [{ text: 'SUGAR SHACK', dir: Nn + 0.4 }, { text: 'LOOKOUT', dir: Nn + 0.2 }, { text: 'MAPLE COVE', dir: E - 0.15 }, { text: "NANA'S", dir: W }] },
  { x: 57.5, z: 37.6, arrows: [{ text: 'FERME FARM', dir: Ss }, { text: 'MAPLE COVE', dir: E - 0.1 }] },
  { x: 84, z: 41.8, arrows: [{ text: 'SAWMILL', dir: Ss + 0.15 }, { text: 'MAPLE COVE', dir: E - 0.1 }, { text: 'BRIDGE', dir: W + 0.15 }] },
  { x: 38, z: -28, arrows: [{ text: 'CABANE', dir: E + 0.1 }, { text: 'LOOKOUT', dir: Nn + 0.4 }, { text: 'BRIDGE', dir: Ss - 0.3 }] },
  { x: 72, z: -64, arrows: [{ text: 'LOOKOUT', dir: Nn }, { text: 'BEACH', dir: E - 0.2 }, { text: 'BRIDGE', dir: W + 0.5 }] },
  { x: 290, z: 33, arrows: [{ text: 'BEACH', dir: Nn - 0.2 }, { text: 'LIGHTHOUSE', dir: E + 0.5 }, { text: 'MAIN ST', dir: W - 0.4 }] },
  { x: 220, z: -122, arrows: [{ text: 'BEACH', dir: E + 0.6 }, { text: 'LOOKOUT', dir: W - 0.1 }] },
  { x: -67, z: -118, arrows: [{ text: 'CAMPING', dir: Ss + 0.3 }, { text: 'DAM', dir: E + 0.4 }, { text: 'MEADOW', dir: Nn + 0.4 }] },
];

// Harold's lost keepsakes (collectibles)
export const KEEPSAKES = [
  { id: 'cane', x: -214, z: -54, name: "Harold's Walking Cane", note: 'He carved the handle from a moose antler. Took him eleven winters.' },
  { id: 'spyglass', x: 64, z: -122, name: 'Brass Spyglass', note: 'For "spotting deer". Mostly used for spotting the bakery van.' },
  { id: 'pack', x: -114, z: -155, name: 'Hunting Pack', note: 'Inside: 3 granola bars, 0 bullets. Classic Harold.' },
  { id: 'clock', x: 304, z: 12, name: 'Mantel Clock', note: 'Stopped at 4:12 — the minute he proposed. Or so Nana says.' },
  { id: 'coat', x: -252, z: 154, name: 'Plaid Coat', note: 'Smells of pipe smoke and pine. Still warm, somehow.' },
  { id: 'medbag', x: 252, z: 35, name: 'Doctor Bag', note: 'Borrowed from Dr. Ingrid in 1987. Never returned.' },
  { id: 'suitcase', x: 229, z: 118, name: 'Old Suitcase', note: 'Packed for a honeymoon to Niagara. They never went.' },
  { id: 'keys', x: 100, z: 138, name: 'Ring of Keys', note: 'Opens everything in Maple Cove. Including, apparently, the mill.' },
  { id: 'books', x: 191, z: 9, name: 'Pressed-Flower Books', note: 'Every page holds a maple leaf from a different autumn.' },
  { id: 'map', x: -40, z: -134, name: 'Hand-Drawn Map', note: '"X marks the best blueberries." The X is on the beaver dam.' },
  { id: 'lantern', x: 184, z: 126, name: 'Brass Lantern', note: 'Harold walked Nana home with it every night for 50 years.' },
  { id: 'bottles', x: 56, z: -44, name: 'Maple Syrup Bottles', note: 'Grade A Amber. Vintage 1979. Do not drink. (Hank drank it.)' },
];

// Gameplay spots used by voxelWorld.dress() / quests
export const BOWLING = { x: 174.5, z: 41.6 }; // lawn bowling: kick the ball north up the green's gravel path at the pins
export const HOOPS = [[-6, 32.4], [62, 42.8], [-120, 60.2]]; // harvest hoops standing over the main road
export const PLANT_SPOTS = [[-150, 40], [-138, 50], [-128, 62], [-60, 46], [80, 58], [100, 62]]; // Gus's saplings
// kickable harvest pumpkins (a few by the café for Marie-Claude's pumpkin errand)
export const LOOSE_PUMPKINS = [
  [205.6, 41.2], [207.2, 40.2], [203.8, 39.4], [160.5, 43.8], [148, 56.3], [176.5, 56.2], [221.5, 43.8], [238, 56.3], [126, 43.8],
  [-160, 76], [-158, 77.5], [-176, 76], [-210, -26], [-206, -27], [46, 44.8], [47.5, 45.6],
];

// Extra names for the paper map (POI keys above keep their own labels)
export const PLACES = [
  { x: 56, z: 66, name: 'Ferme Gagnon' },
  { x: 48, z: -52, name: 'Cabane à Sucre' },
  { x: -62, z: -114, name: 'Campground' },
  { x: 282, z: -88, name: 'Sandy Point Beach' },
  { x: 186, z: 112, name: 'Harbour' },
  { x: 130, z: -6, name: 'Bike Park' },
  { x: -8, z: 70, name: 'Picnic' },
  { x: 180, z: -96, name: 'Giant Goose' },
];

// Where the bike spawns / parks at home
export const HOME_SPAWN = { x: -158, z: 76, yaw: Math.PI * 0.5 };

// Trigger zones at the homestead
export const HOME_SPOTS = {
  porch: { x: -168, z: 66, r: 5 },
  garage: { x: -146, z: 94, r: 5 },
};
