// The interface: let the user drag taxis and passengers, and draw the optimal routes.
// The map, the street grid and addToMap() come from town.js, and optimalAssignment() from
// assignment.js; both are loaded first.

const totalLabel = document.getElementById("total");

// One colour per taxi: its ring and its route are drawn in this colour.
const TAXI_COLOURS = ["#e63946", "#ff8c00", "#c026d3", "#2563eb", "#0d9488"];
const PASSENGER_EMOJIS = ["👩🏽", "👨🏿", "👵🏻", "🧑🏾‍🦽", "👦🏼"];

// Starting positions, in map coordinates. Each one lies on a street.
const taxis = [
  { x: 100, y: 50 }, { x: 550, y: 180 }, { x: 250, y: 300 }, { x: 50, y: 450 }, { x: 400, y: 550 },
];
const passengers = [
  { x: 350, y: 120 }, { x: 480, y: 250 }, { x: 150, y: 380 }, { x: 450, y: 420 }, { x: 120, y: 150 },
];

// Move a point to the nearest place on a street.
function snapToStreet(point) {
  point.x = Math.min(MAX_X, Math.max(MIN_X, point.x));
  point.y = Math.min(MAX_Y, Math.max(MIN_Y, point.y));
  const nearest = (value, streets) => streets.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  const streetX = nearest(point.x, STREETS_X);
  const streetY = nearest(point.y, STREETS_Y);
  // Jump sideways onto whichever street (vertical or horizontal) is closer.
  if (Math.abs(point.x - streetX) < Math.abs(point.y - streetY)) point.x = streetX;
  else point.y = streetY;
}

// One route per taxi, showing how it drives to its assigned passenger. Drawn before the icons so they sit on top.
const routes = taxis.map((_, i) => addToMap("polyline", { class: "route", stroke: TAXI_COLOURS[i] }));

// Create a draggable icon for each point: a group holding a coloured ring and an emoji.
function addMarker(point, emoji, ringColour) {
  const el = addToMap("g", { class: "marker" });
  addToMap("circle", { r: 15, class: "ring", stroke: ringColour, fill: ringColour }, el);
  addToMap("text", { class: "emoji" }, el).textContent = emoji;

  el.addEventListener("pointerdown", (event) => {
    el.setPointerCapture(event.pointerId); // keep receiving moves even if the pointer leaves the icon
    const onMove = (moveEvent) => {
      // Convert the mouse position from screen pixels into map coordinates.
      const rect = svg.getBoundingClientRect();
      point.x = ((moveEvent.clientX - rect.left) / rect.width) * MAP_WIDTH;
      point.y = ((moveEvent.clientY - rect.top) / rect.height) * MAP_HEIGHT;
      snapToStreet(point);
      update();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", () => el.removeEventListener("pointermove", onMove), { once: true });
  });

  return el;
}

const taxiIcons = taxis.map((t, i) => addMarker(t, "🚕", TAXI_COLOURS[i]));
const passengerIcons = passengers.map((p, i) => addMarker(p, PASSENGER_EMOJIS[i], "white"));

// Move everything on screen to match the data, then recompute and draw the optimal assignment.
function update() {
  taxis.forEach((t, i) => taxiIcons[i].setAttribute("transform", `translate(${t.x}, ${t.y})`));
  passengers.forEach((p, i) => passengerIcons[i].setAttribute("transform", `translate(${p.x}, ${p.y})`));

  const { cost, routes: corners } = optimalAssignment(taxis, passengers); // from assignment.js
  corners.forEach((route, i) => {
    // Shift each taxi's route slightly, so routes along the same road sit side by side instead of on top of each other.
    const offset = (i - 2) * 3;
    // An SVG polyline wants its corner points as "x1,y1 x2,y2 ...".
    routes[i].setAttribute("points", route.map(([x, y]) => `${x + offset},${y + offset}`).join(" "));
  });
  totalLabel.textContent = cost.toFixed(1);
}

update();
