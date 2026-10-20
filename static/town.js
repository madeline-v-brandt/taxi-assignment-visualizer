// The town: draws the scenery (grass, river, roads, buildings). Purely decorative; nothing here moves.
// main.js is loaded after this file and uses the constants and helper defined here.

const svg = document.getElementById("map");
const SVG_NS = "http://www.w3.org/2000/svg";
const MAP_WIDTH = 600, MAP_HEIGHT = 600;

// The street grid. These must match STREETS_X and STREETS_Y in server.py.
const STREETS_X = [50, 150, 250, 350, 450, 550]; // vertical streets
const STREETS_Y = [50, 150, 250, 350, 450, 550]; // horizontal streets
const MIN_X = STREETS_X[0], MAX_X = STREETS_X[STREETS_X.length - 1];
const MIN_Y = STREETS_Y[0], MAX_Y = STREETS_Y[STREETS_Y.length - 1];
const ROAD_HALF_WIDTH = 13; // including the sidewalk

// Helper: create an SVG element with the given attributes and add it to the map (or to a group inside it).
function addToMap(tag, attributes, parent = svg) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const name in attributes) el.setAttribute(name, attributes[name]);
  parent.appendChild(el);
  return el;
}

// What stands on each block. col and row count blocks from the top left; items are
// [emoji, dx, dy, size] with (dx, dy) measured from the centre of the block.
const BLOCKS = [
  { col: 0, row: 0, lot: "grass", items: [["🏡", -17, -16, 22], ["🏠", 17, -16, 22], ["🏠", -17, 17, 22], ["🌳", 17, 17, 20]] },
  { col: 1, row: 0, lot: "plaza", label: "School", items: [["🏫", 0, -6, 34], ["⚽", 24, 20, 11]] },
  { col: 2, row: 0, lot: "plaza", label: "Library", items: [["🏛️", 0, -6, 32]] },
  { col: 4, row: 0, lot: "grass", label: "Farm", items: [["🐄", -16, -14, 20], ["🐑", 16, -12, 18], ["🌻", -18, 10, 14], ["🌾", 18, 10, 14]] },

  { col: 0, row: 1, lot: "grass", items: [["🏘️", 0, -8, 34], ["🌳", -22, 20, 16], ["🌳", 22, 20, 16]] },
  { col: 1, row: 1, lot: "city", label: "Bank", items: [["🏦", -14, -10, 26], ["🏢", 16, -12, 24]] },
  { col: 2, row: 1, lot: "city", label: "Hotel", items: [["🏨", -14, -10, 26], ["🏢", 16, -12, 24]] },
  { col: 4, row: 1, lot: "plaza", label: "Hospital", items: [["🏥", 0, -8, 34], ["🚑", 24, 20, 12]] },

  { col: 0, row: 2, lot: "plaza", label: "Grocery", items: [["🏪", 0, -8, 32], ["🍎", -24, 20, 11], ["🥕", 24, 20, 11]] },
  { col: 1, row: 2, lot: "city", label: "Mall", items: [["🏬", -14, -10, 26], ["🏢", 16, -12, 24]] },
  { col: 2, row: 2, lot: "city", label: "Offices", items: [["🏢", -14, -10, 26], ["🏢", 16, -12, 24]] },
  { col: 4, row: 2, lot: "park", label: "Park", items: [["⛲", 0, -8, 26], ["🌳", -24, -22, 16], ["🌳", 24, -22, 16], ["🌲", -24, 14, 16], ["🌲", 24, 14, 16]] },

  { col: 0, row: 3, lot: "plaza", label: "Fire Station", items: [["🚒", 0, -8, 30]] },
  { col: 1, row: 3, lot: "plaza", label: "Café & Bakery", items: [["☕", -14, -8, 24], ["🥐", 16, -8, 22]] },
  { col: 2, row: 3, lot: "plaza", label: "Cinema", items: [["🎬", 0, -8, 30], ["🍿", 24, 18, 12]] },
  { col: 4, row: 3, lot: "park", items: [["🌳", -18, -16, 20], ["🌷", 16, -18, 14], ["🦋", 4, 2, 12], ["🌳", 18, 16, 20], ["🌸", -18, 16, 14]] },

  { col: 0, row: 4, lot: "plaza", label: "Police", items: [["🚓", 0, -8, 30]] },
  { col: 1, row: 4, lot: "plaza", label: "Post Office", items: [["🏣", 0, -8, 32]] },
  { col: 2, row: 4, lot: "grass", label: "Ice Cream", items: [["🍦", 0, -8, 30], ["🌳", -24, -20, 14], ["🌳", 24, -20, 14]] },
  { col: 4, row: 4, lot: "grass", label: "Fair", items: [["🎡", -10, -10, 30], ["🎠", 20, 12, 18]] },
  // Column 3 is the river, so it has no buildings.
];

function drawTown() {
  // Everything decorative goes in one group, which ignores the mouse (see style.css).
  const town = addToMap("g", { class: "town" });

  addToMap("rect", { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT, class: "grass" }, town);

  // Trees around the edge of town (skipping x = 400, where the river leaves the map).
  for (const k of [100, 200, 300, 500]) {
    for (const [x, y] of [[k, 20], [k, MAP_HEIGHT - 20]]) addEmoji(town, "🌲", x, y, 16);
  }
  for (const k of [100, 200, 300, 400, 500]) {
    for (const [x, y] of [[20, k], [MAP_WIDTH - 20, k]]) addEmoji(town, "🌲", x, y, 16);
  }

  // The lots between the roads, then what stands on them.
  for (let col = 0; col < STREETS_X.length - 1; col++) {
    for (let row = 0; row < STREETS_Y.length - 1; row++) {
      const x = STREETS_X[col] + ROAD_HALF_WIDTH, y = STREETS_Y[row] + ROAD_HALF_WIDTH;
      const size = STREETS_X[col + 1] - STREETS_X[col] - 2 * ROAD_HALF_WIDTH;
      const block = BLOCKS.find((b) => b.col === col && b.row === row);
      addToMap("rect", { x, y, width: size, height: size, rx: 6, class: `lot ${block ? block.lot : "grass"}` }, town);
    }
  }
  for (const block of BLOCKS) {
    const cx = (STREETS_X[block.col] + STREETS_X[block.col + 1]) / 2;
    const cy = (STREETS_Y[block.row] + STREETS_Y[block.row + 1]) / 2;
    for (const [emoji, dx, dy, size] of block.items) addEmoji(town, emoji, cx + dx, cy + dy, size);
    if (block.label) addToMap("text", { x: cx, y: cy + 24, class: "label" }, town).textContent = block.label;
  }

  // The river winds down the middle of column 3, with a duck and a sailboat on it.
  addToMap("path", { d: "M 400 0 C 370 100, 430 200, 400 300 S 370 500, 400 600", class: "river" }, town);
  addEmoji(town, "🦆", 408, 225, 14);
  addEmoji(town, "⛵", 383, 375, 18);

  // Roads: a wide light sidewalk, dark asphalt on top, then a dashed centre line.
  const roads = [
    ...STREETS_X.map((x) => [x, MIN_Y, x, MAX_Y]),
    ...STREETS_Y.map((y) => [MIN_X, y, MAX_X, y]),
  ];
  for (const layer of ["sidewalk", "asphalt", "centre-line"]) {
    for (const [x1, y1, x2, y2] of roads) addToMap("line", { x1, y1, x2, y2, class: layer }, town);
  }

  // Bridge railings where each horizontal road crosses the river.
  for (const y of STREETS_Y) {
    for (const side of [-1, 1]) {
      const railY = y + side * ROAD_HALF_WIDTH;
      addToMap("line", { x1: 362, y1: railY, x2: 438, y2: railY, class: "railing" }, town);
    }
  }
}

function addEmoji(parent, emoji, x, y, size) {
  const el = addToMap("text", { x, y, "font-size": size, class: "emoji" }, parent);
  el.textContent = emoji;
}

drawTown();
