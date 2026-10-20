// The interface: dragging, the two modes (Explore and Challenge), the routes and the statistics panel.
// The map, the street grid and addToMap() come from town.js, the mathematics from assignment.js,
// and the Challenge Mode bookkeeping from challenge.js. All three are loaded first.

// One colour per taxi: its ring, its route, and the ring of the passenger it picks up.
const TAXI_COLOURS = ["#e63946", "#ff8c00", "#c026d3", "#2563eb", "#0d9488"];
const PASSENGER_EMOJIS = ["👩🏽", "👨🏿", "👵🏻", "🧑🏾‍🦽", "👦🏼"];

// Distances are shown in city blocks: the distance between two neighbouring streets.
// Positions are whole map units, so every distance is an exact multiple of 0.01 blocks.
const UNITS_PER_BLOCK = STREETS_X[1] - STREETS_X[0];
const TAP_THRESHOLD = 8; // screen pixels a pointer may move and still count as a tap, not a drag

// Starting positions, in map coordinates. Each one lies on a street.
const taxis = [
  { x: 100, y: 50 }, { x: 550, y: 180 }, { x: 250, y: 300 }, { x: 50, y: 450 }, { x: 400, y: 550 },
];
const passengers = [
  { x: 350, y: 120 }, { x: 480, y: 250 }, { x: 150, y: 380 }, { x: 450, y: 420 }, { x: 120, y: 150 },
];

// Everything the page shows is drawn from this state by render().
const state = {
  mode: "explore",                          // "explore" or "challenge"
  challenge: createChallenge(taxis.length), // the user's own assignment (Challenge Mode)
  selected: null,                           // { kind: "taxi" or "passenger", index } while choosing a pair
  revealed: false,                          // whether the optimal routes are shown in Challenge Mode
};

// Move a point to the nearest place on a street, at whole map units.
function snapToStreet(point) {
  point.x = Math.round(Math.min(MAX_X, Math.max(MIN_X, point.x)));
  point.y = Math.round(Math.min(MAX_Y, Math.max(MIN_Y, point.y)));
  const nearest = (value, streets) => streets.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  const streetX = nearest(point.x, STREETS_X);
  const streetY = nearest(point.y, STREETS_Y);
  // Jump sideways onto whichever street (vertical or horizontal) is closer.
  if (Math.abs(point.x - streetX) < Math.abs(point.y - streetY)) point.x = streetX;
  else point.y = streetY;
}

// The routes, in three layers: the revealed optimal routes (soft and wide), then a white outline that
// makes each dashed route stand out on the grey road, then the dashed routes themselves.
const ghostLayer = addToMap("g");
const routeLayer = addToMap("g");
const ghosts = taxis.map((_, i) => addToMap("polyline", { class: "ghost", stroke: TAXI_COLOURS[i] }, ghostLayer));
const casings = taxis.map(() => addToMap("polyline", { class: "casing" }, routeLayer));
const routes = taxis.map((_, i) => addToMap("polyline", { class: "route", stroke: TAXI_COLOURS[i] }, routeLayer));

// Create a draggable, tappable icon: a group holding a large invisible touch area, a coloured ring and an emoji.
function addMarker(kind, index, point, emoji) {
  const el = addToMap("g", { class: `marker ${kind}` });
  addToMap("circle", { r: 24, class: "touch-area" }, el);
  const ring = addToMap("circle", { r: 15, class: "ring" }, el);
  addToMap("text", { class: "emoji" }, el).textContent = emoji;

  // On touch screens, keep the page from scrolling while a finger is on an icon.
  el.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });

  el.addEventListener("pointerdown", (down) => {
    try { el.setPointerCapture(down.pointerId); } catch {} // keep receiving moves even if the pointer leaves the icon
    let dragging = false;

    const onMove = (move) => {
      // Small wobbles during a tap should not move anything.
      if (!dragging && Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) < TAP_THRESHOLD) return;
      dragging = true;
      // Convert the pointer position from screen pixels into map coordinates.
      const rect = svg.getBoundingClientRect();
      point.x = ((move.clientX - rect.left) / rect.width) * MAP_WIDTH;
      point.y = ((move.clientY - rect.top) / rect.height) * MAP_HEIGHT;
      snapToStreet(point);
      render();
    };
    const onEnd = (end) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
      if (!dragging && end.type === "pointerup") handleTap(kind, index);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);
  });

  return { el, ring };
}

const taxiMarkers = taxis.map((t, i) => addMarker("taxi", i, t, "🚕"));
const passengerMarkers = passengers.map((p, i) => addMarker("passenger", i, p, PASSENGER_EMOJIS[i]));

// Challenge Mode: tap a taxi and then a passenger (or the other way round) to pair them.
function handleTap(kind, index) {
  if (state.mode !== "challenge") return;
  const selected = state.selected;
  if (selected && selected.kind !== kind) {
    const taxi = kind === "taxi" ? index : selected.index;
    const passenger = kind === "passenger" ? index : selected.index;
    assignPair(state.challenge, taxi, passenger);
    state.selected = null;
  } else if (selected && selected.index === index) {
    state.selected = null; // tapping the selected icon again deselects it
  } else {
    state.selected = { kind, index };
  }
  render();
}

// Tapping empty map cancels a half-made pair.
svg.addEventListener("pointerdown", (event) => {
  if (state.selected && !event.target.closest(".marker")) {
    state.selected = null;
    render();
  }
});

function setMode(mode) {
  state.mode = mode;
  state.selected = null; // the user's pairs and the reveal are kept, so switching back loses nothing
  render();
}

// ---- Drawing ----

const $ = (id) => document.getElementById(id);

function formatBlocks(units) {
  return `${(units / UNITS_PER_BLOCK).toFixed(2)} blocks`;
}

// A polyline wants "x1,y1 x2,y2 ...". Each taxi's route is shifted slightly, so routes along the same
// road sit side by side instead of on top of each other.
function pointsAttribute(route, taxi) {
  if (!route) return "";
  const offset = (taxi - 2) * 3;
  return route.map(([x, y]) => `${x + offset},${y + offset}`).join(" ");
}

// Icons grow a little on narrow screens, so they stay easy to see and to touch.
function markerScale() {
  const width = svg.getBoundingClientRect().width || MAP_WIDTH;
  return Math.min(1.6, Math.max(1, (0.75 * MAP_WIDTH) / width));
}

function render() {
  const scale = markerScale();
  taxis.forEach((t, i) => taxiMarkers[i].el.setAttribute("transform", `translate(${t.x}, ${t.y}) scale(${scale})`));
  passengers.forEach((p, j) => passengerMarkers[j].el.setAttribute("transform", `translate(${p.x}, ${p.y}) scale(${scale})`));

  const optimal = optimalAssignment(taxis, passengers);
  const challenge = state.mode === "challenge";
  const pairs = challenge ? state.challenge.pairs : optimal.sigma; // passenger each dashed route goes to, or -1

  // Dashed routes: the optimal ones in Explore Mode, the user's own in Challenge Mode.
  let userCost = 0;
  pairs.forEach((j, i) => {
    const trip = j === -1 ? null : routeFor(taxis[i], passengers[j]);
    if (trip) userCost += trip.length;
    routes[i].setAttribute("points", pointsAttribute(trip && trip.route, i));
    casings[i].setAttribute("points", pointsAttribute(trip && trip.route, i));
  });
  const showOptimal = challenge && state.revealed;
  ghosts.forEach((g, i) => g.setAttribute("points", showOptimal ? pointsAttribute(optimal.routes[i], i) : ""));

  // Rings: each taxi in its own colour; each passenger in the colour of the taxi coming for them.
  taxiMarkers.forEach((m, i) => m.ring.setAttribute("style", `--colour: ${TAXI_COLOURS[i]}`));
  passengerMarkers.forEach((m, j) => {
    const taxi = pairs.indexOf(j);
    m.ring.setAttribute("style", `--colour: ${taxi === -1 ? "white" : TAXI_COLOURS[taxi]}`);
  });
  const isSelected = (kind, index) => state.selected && state.selected.kind === kind && state.selected.index === index;
  taxiMarkers.forEach((m, i) => m.el.classList.toggle("selected", isSelected("taxi", i)));
  passengerMarkers.forEach((m, j) => m.el.classList.toggle("selected", isSelected("passenger", j)));

  renderPanel(optimal, userCost);
}

function renderPanel(optimal, userCost) {
  const challenge = state.mode === "challenge";
  const complete = isComplete(state.challenge);
  const assigned = assignedCount(state.challenge);

  $("mode-explore").setAttribute("aria-pressed", !challenge);
  $("mode-challenge").setAttribute("aria-pressed", challenge);
  $("tile-yours").hidden = !challenge;
  $("tile-savings").hidden = !challenge;
  $("challenge-controls").hidden = !challenge;
  $("route-key").hidden = !(challenge && state.revealed);

  if (!challenge) {
    $("optimal-label").textContent = "Shortest possible total";
    $("optimal").textContent = formatBlocks(optimal.cost);
    $("optimal-note").textContent = "";
    $("message").textContent = "Drag any taxi or passenger along the streets. The routes always show the best possible matching.";
    return;
  }

  $("yours").textContent = assigned === 0 ? "—" : formatBlocks(userCost);
  $("yours-note").textContent = complete ? "" : `${assigned} of ${taxis.length} taxis assigned`;
  $("optimal-label").textContent = "Optimal total";
  $("optimal").textContent = state.revealed ? formatBlocks(optimal.cost) : "?";
  $("optimal-note").textContent = state.revealed ? "" : "hidden until you reveal it";

  // Costs are whole map units, so "as short as the optimum" is an exact comparison.
  const foundOptimal = complete && userCost === optimal.cost;
  const savings = userCost - optimal.cost;
  if (state.revealed && complete) {
    $("savings").textContent = formatBlocks(savings);
    $("savings-note").textContent = foundOptimal ? "nothing to save! 🎉" : `${Math.round((100 * savings) / userCost)}% of your total`;
  } else {
    $("savings").textContent = "—";
    $("savings-note").textContent = complete ? "reveal to compare" : "assign every taxi first";
  }

  $("undo").disabled = state.challenge.history.length === 0;
  $("clear").disabled = assigned === 0;
  $("reveal").textContent = state.revealed ? "Hide optimal" : "Reveal optimal";
  $("message").classList.toggle("success", state.revealed && foundOptimal);
  $("message").innerHTML = challengeMessage(optimal, foundOptimal, complete);
}

function challengeMessage(optimal, foundOptimal, complete) {
  const dot = (taxi) => `<span class="dot" style="background: ${TAXI_COLOURS[taxi]}"></span>`;
  if (state.selected && state.selected.kind === "taxi") return `Now tap a passenger for the ${dot(state.selected.index)} taxi.`;
  if (state.selected) return "Now tap the taxi that should pick up this passenger.";
  if (state.revealed && foundOptimal) {
    const different = state.challenge.pairs.some((j, i) => j !== optimal.sigma[i]);
    return "🎉 You found an optimal assignment!" +
      (different ? " It pairs people differently from the computer's, but it's just as short: this puzzle has more than one best answer." : "");
  }
  if (state.revealed && complete) return "The shaded lines show an optimal assignment. Can you change yours to match its total?";
  if (state.revealed) return "The shaded lines show an optimal assignment. Finish yours to compare.";
  if (complete) return "Every taxi has a passenger. Reveal the optimal assignment to see how you did!";
  return "Tap a taxi, then the passenger it should pick up. Can you find the shortest total distance?";
}

$("mode-explore").addEventListener("click", () => setMode("explore"));
$("mode-challenge").addEventListener("click", () => setMode("challenge"));
$("undo").addEventListener("click", () => { undoPair(state.challenge); state.selected = null; render(); });
$("clear").addEventListener("click", () => { clearPairs(state.challenge); state.selected = null; render(); });
$("reveal").addEventListener("click", () => { state.revealed = !state.revealed; render(); });
window.addEventListener("resize", render);

// For the tests in tests/: a handle on the app's data and actions.
window.app = { taxis, passengers, state, handleTap, setMode, render, STREETS_X, STREETS_Y };

render();
