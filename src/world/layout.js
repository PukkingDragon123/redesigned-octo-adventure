// The handcrafted map of Maple Hollow & Maple Cove.
// X = east, Z = south (north is -Z). Units are metres. Water level is y = 0.

export const WORLD_HALF = 320;
export const WATER_LEVEL = 0;

// Points of interest
export const POI = {
  cabin: { x: -170, z: 70, r: 34, name: "Nana Marguerite's Cabin" },
  garage: { x: -154, z: 94 },
  graveyard: { x: -214, z: -40, r: 26, name: 'Old Pine Cemetery' },
  grave: { x: -214, z: -44 },
  bridge: { x: -31, z: 32, name: 'Beaver Creek Bridge' },
  lookout: { x: 62, z: -118, r: 16, name: 'Sunset Lookout' },
  village: { x: 175, z: 60, r: 90, name: 'Maple Cove' },
  plaza: { x: 176, z: 52, r: 16 },
  lighthouse: { x: 300, z: 6 },
  sawmill: { x: 96, z: 128 },
  treestand: { x: -112, z: -150 },
  trapper: { x: -250, z: 150 },
  pond: { x: -38, z: -150 },
  meadow1: { x: -95, z: -55, r: 28 },
  meadow2: { x: 70, z: 70, r: 24 },
  catLog: { x: -88, z: 47 },
};

// The sea & the cove (union of ellipses). Values: cx, cz, rx, rz
// Shapes: ellipse {cx,cz,rx,rz} or rounded box {box:[x0,z0,x1,z1], round}
export const SEA = [
  { cx: 450, cz: 90, rx: 165, rz: 330 }, // open sea to the east
  { box: [128, 82, 282, 178], round: 14 }, // the cove
  { cx: 270, cz: 240, rx: 150, rz: 85 }, // south bay
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

// Roads. type: 'road' (wide dirt road), 'trail' (narrow forest path), 'street' (village gravel)
export const ROADS = [
  {
    id: 'main', type: 'road', w: 7,
    pts: [
      [-150, 72], [-120, 62], [-92, 50], [-62, 38], [-44, 33], [-18, 31], [8, 32],
      [36, 40], [62, 50], [88, 58], [112, 62], [130, 64],
    ],
  },
  {
    id: 'street', type: 'street', w: 8,
    pts: [[124, 64], [150, 64], [176, 64], [200, 64], [226, 62], [252, 60], [276, 48], [296, 26], [304, 10]],
  },
  {
    id: 'cabinDrive', type: 'road', w: 6,
    pts: [[-172, 76], [-160, 74], [-150, 72]],
  },
  {
    id: 'graveRoad', type: 'trail', w: 4.5,
    pts: [[-176, 60], [-186, 36], [-198, 10], [-206, -12], [-212, -28]],
  },
  {
    id: 'northLoop', type: 'road', w: 6,
    pts: [
      [8, 32], [18, 4], [26, -26], [38, -58], [50, -88], [60, -110], [78, -118], [104, -106],
      [128, -82], [146, -52], [158, -20], [166, 10], [172, 36], [176, 58],
    ],
  },
  {
    id: 'standTrail', type: 'trail', w: 4,
    pts: [[-92, 50], [-96, 20], [-94, -14], [-98, -50], [-104, -86], [-108, -118], [-112, -144]],
  },
  {
    id: 'trapperTrail', type: 'trail', w: 4,
    pts: [[-172, 80], [-190, 104], [-212, 126], [-234, 144], [-248, 150]],
  },
  {
    id: 'pondTrail', type: 'trail', w: 4,
    pts: [[-98, -50], [-76, -76], [-58, -110], [-50, -136]],
  },
  {
    id: 'sawmillRoad', type: 'trail', w: 5,
    pts: [[88, 58], [90, 84], [94, 108], [96, 122]],
  },
  {
    id: 'backLane', type: 'street', w: 6,
    pts: [[140, 64], [146, 44], [160, 34], [182, 32], [206, 36], [226, 44], [236, 62]],
  },
];

// Flat areas (cx, cz, r, h = target height or null for local smoothing)
export const FLATS = [
  { x: -170, z: 72, r: 30, h: 9 },
  { x: -214, z: -40, r: 20, h: null },
  { x: 62, z: -118, r: 12, h: null },
  { x: -250, z: 150, r: 10, h: null },
];

// The village: a gently sloping shelf above the cove.
export const VILLAGE_FLAT = { x0: 108, x1: 300, z0: 20, z1: 92, h: 3.2 };

// Boardwalk on stilts in front of the waterfront houses (Telegraph Cove style).
// Segments of [x0,z0] -> [x1,z1] with width and deck height.
export const BOARDWALK = [
  { a: [126, 94], b: [254, 94], w: 4, h: 3.0 },
];
// Gangways connecting street to boardwalk
export const BOARDWALK_RAMPS = [
  { a: [134, 69], b: [134, 92.5], w: 3.2 },
  { a: [200, 69], b: [200, 92.5], w: 3.2 },
  { a: [226, 69], b: [226, 92.5], w: 3.2 },
  { a: [252, 66], b: [252, 92.5], w: 3.2 },
];
// Docks reaching into the cove
export const DOCKS = [
  { a: [152, 96], b: [152, 124], w: 3, h: 1.1, floating: true },
  { a: [204, 96], b: [204, 128], w: 3, h: 1.1, floating: true },
  { a: [244, 96], b: [248, 120], w: 2.6, h: 1.1, floating: true },
];

// Village buildings. kind drives shape; color is siding palette key.
// facing: radians (0 = door faces +z / south). Positions are building centre.
export const BUILDINGS = [
  // waterfront houses on stilts (face the boardwalk to the south)
  { id: 'cafe', kind: 'house', x: 146, z: 86, w: 11, d: 8, floors: 2, color: 'red', roof: 'dark', stilts: true, facing: 0, sign: 'CAFE ERABLE', owner: 'marie' },
  { id: 'birdie', kind: 'house', x: 166, z: 86.5, w: 8, d: 7, floors: 1, color: 'teal', roof: 'dark', stilts: true, facing: 0, owner: 'birdie' },
  { id: 'store', kind: 'house', x: 186, z: 86, w: 13, d: 8, floors: 2, color: 'red', roof: 'dark', stilts: true, facing: 0, sign: 'MOOSE & GOOSE', owner: null },
  { id: 'agnes', kind: 'house', x: 214, z: 86.5, w: 9, d: 7, floors: 2, color: 'blue', roof: 'dark', stilts: true, facing: 0, owner: 'agnes' },
  { id: 'boathouse', kind: 'house', x: 238, z: 86, w: 10, d: 8, floors: 1, color: 'white', roof: 'green', stilts: true, facing: 0 },
  // street-side houses (north side of the street, face south)
  { id: 'gus', kind: 'cabin', x: 116, z: 40, w: 8, d: 7, floors: 1, color: 'log', roof: 'dark', facing: Math.PI * 0.12, owner: 'gus' },
  { id: 'doug', kind: 'house', x: 158, z: 48, w: 9, d: 8, floors: 1, color: 'white', roof: 'red', facing: 0, sign: 'POLICE', owner: 'doug' },
  { id: 'clinic', kind: 'house', x: 198, z: 48, w: 10, d: 8, floors: 2, color: 'yellow', roof: 'dark', facing: 0, sign: 'CLINIC', owner: 'ingrid' },
  { id: 'kids', kind: 'house', x: 220, z: 50, w: 9, d: 8, floors: 2, color: 'green', roof: 'dark', facing: 0, owner: 'kids' },
  { id: 'house5', kind: 'house', x: 246, z: 44, w: 8, d: 7, floors: 1, color: 'red', roof: 'dark', facing: -0.3 },
  { id: 'chapel', kind: 'chapel', x: 136, z: 24, w: 8, d: 13, floors: 1, color: 'white', roof: 'dark', facing: 0.4 },
  { id: 'lighthouse', kind: 'lighthouse', x: 306, z: 2, w: 5, d: 5, floors: 3, color: 'white', roof: 'red', facing: 0 },
  { id: 'lighthouseHut', kind: 'house', x: 296, z: 12, w: 6, d: 5, floors: 1, color: 'white', roof: 'red', facing: -0.9, owner: 'lou_lh' },
  { id: 'sawmill', kind: 'sawmill', x: 98, z: 132, w: 16, d: 10, floors: 1, color: 'weathered', roof: 'rust', facing: 0.2, sign: 'SAWMILL', owner: 'lou' },
  // Nana's homestead
  { id: 'nana', kind: 'cabin', x: -178, z: 64, w: 11, d: 9, floors: 1, color: 'log', roof: 'moss', facing: Math.PI * 0.5, chimney: true, porch: true, owner: 'grandma' },
  { id: 'garage', kind: 'shed', x: -154, z: 94, w: 7, d: 8, floors: 1, color: 'weathered', roof: 'rust', facing: Math.PI * 0.5 },
  { id: 'outhouse', kind: 'outhouse', x: -190, z: 92, w: 1.6, d: 1.6, floors: 1, color: 'weathered', roof: 'rust', facing: Math.PI * 0.5 },
  { id: 'trapperHut', kind: 'cabin', x: -252, z: 146, w: 6, d: 5, floors: 1, color: 'log', roof: 'moss', facing: Math.PI * 0.3 },
];

// Customers (NPC id -> where they stand to receive cocoa)
export const CUSTOMERS = {
  gus: { name: 'Gus', x: 120, z: 50, house: 'gus' },
  marie: { name: 'Marie-Claude', x: 146, z: 94, house: 'cafe' },
  birdie: { name: 'Captain Birdie', x: 166, z: 94, house: 'birdie' },
  agnes: { name: 'Agnes', x: 214, z: 94, house: 'agnes' },
  doug: { name: 'Constable Doug', x: 158, z: 58, house: 'doug' },
  ingrid: { name: 'Dr. Ingrid', x: 198, z: 58, house: 'clinic' },
  kids: { name: 'Pip & Pop', x: 220, z: 59, house: 'kids' },
  lou: { name: 'Big Lou', x: 104, z: 122, house: 'sawmill' },
  lou_lh: { name: 'Old Ollie', x: 290, z: 20, house: 'lighthouseHut' },
};

// Wooden jump ramps along the roads (x, z, heading radians, length, height)
export const RAMPS = [
  { x: 30, z: -36, yaw: -0.36, len: 6, h: 1.5 },
  { x: 136, z: -66, yaw: 0.62, len: 6, h: 1.8 },
  { x: -95, z: -2, yaw: Math.PI + 0.05, len: 5, h: 1.3 },
  { x: 74, z: 54, yaw: 1.85, len: 5, h: 1.1 },
  { x: -198, z: 112, yaw: 2.3, len: 5, h: 1.2 },
];

// Harold's lost keepsakes (collectibles)
export const KEEPSAKES = [
  { id: 'cane', x: -214, z: -54, name: "Harold's Walking Cane", note: 'He carved the handle from a moose antler. Took him eleven winters.' },
  { id: 'spyglass', x: 64, z: -122, name: 'Brass Spyglass', note: 'For "spotting deer". Mostly used for spotting the bakery van.' },
  { id: 'pack', x: -114, z: -155, name: 'Hunting Pack', note: 'Inside: 3 granola bars, 0 bullets. Classic Harold.' },
  { id: 'clock', x: 304, z: 10, name: 'Mantel Clock', note: 'Stopped at 4:12 — the minute he proposed. Or so Nana says.' },
  { id: 'coat', x: -252, z: 154, name: 'Plaid Coat', note: 'Smells of pipe smoke and pine. Still warm, somehow.' },
  { id: 'medbag', x: 200, z: 42, name: 'Doctor Bag', note: 'Borrowed from Dr. Ingrid in 1987. Never returned.' },
  { id: 'suitcase', x: 247, z: 117, name: 'Old Suitcase', note: 'Packed for a honeymoon to Niagara. They never went.' },
  { id: 'keys', x: 100, z: 138, name: 'Ring of Keys', note: 'Opens everything in Maple Cove. Including, apparently, the mill.' },
  { id: 'books', x: 132, z: 30, name: 'Pressed-Flower Books', note: 'Every page holds a maple leaf from a different autumn.' },
  { id: 'map', x: -40, z: -134, name: 'Hand-Drawn Map', note: '"X marks the best blueberries." The X is on the beaver dam.' },
  { id: 'lantern', x: 152, z: 122, name: 'Brass Lantern', note: 'Harold walked Nana home with it every night for 50 years.' },
  { id: 'bottles', x: 74, z: 76, name: 'Maple Syrup Bottles', note: 'Grade A Amber. Vintage 1979. Do not drink. (Hank drank it.)' },
];

// Where the bike spawns / parks at home
export const HOME_SPAWN = { x: -158, z: 76, yaw: Math.PI * 0.5 };

// Trigger zones at the homestead
export const HOME_SPOTS = {
  porch: { x: -168, z: 66, r: 5 },
  garage: { x: -146, z: 94, r: 5 },
};
