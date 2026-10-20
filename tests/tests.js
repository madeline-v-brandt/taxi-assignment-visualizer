// Tests for the taxi assignment visualizer. Each app test loads a fresh copy of the real page
// (static/index.html) in an iframe and drives it the way a user would.

// ---- A tiny test harness ----

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message || "values differ"}: expected ${e}, got ${a}`);
}

async function runAll() {
  let failed = 0;
  for (const { name, fn } of tests) {
    const li = document.createElement("li");
    try {
      await fn();
      li.className = "pass";
      li.textContent = name;
    } catch (error) {
      failed++;
      li.className = "fail";
      li.textContent = `${name}: ${error.message}`;
    }
    document.getElementById("results").appendChild(li);
  }
  const summary = document.getElementById("summary");
  summary.textContent = failed ? `${failed} of ${tests.length} tests FAILED` : `All ${tests.length} tests passed`;
  summary.dataset.status = failed ? "fail" : "pass";
}

// Load a fresh copy of the app and return its window (w) and document (doc).
function loadApp(width = 600) {
  const frame = document.getElementById("app");
  frame.style.width = `${width}px`;
  return new Promise((resolve) => {
    frame.onload = () => resolve({ w: frame.contentWindow, doc: frame.contentDocument });
    frame.src = `../static/index.html?${Math.random()}`;
  });
}

// A deterministic random number generator, so failures can be reproduced.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random point with whole-number coordinates somewhere on the streets.
function randomStreetPoint(random, app) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const [xs, ys] = [app.STREETS_X, app.STREETS_Y];
  return random() < 0.5
    ? { x: pick(xs), y: between(ys[0], ys[ys.length - 1]) }
    : { x: between(xs[0], xs[xs.length - 1]), y: pick(ys) };
}

// Shortest street distance by Dijkstra's algorithm on the street graph: an independent check.
function dijkstra(p, q, xs, ys) {
  const key = ([x, y]) => `${x},${y}`;
  const nodes = new Map();
  for (const x of xs) for (const y of ys) nodes.set(key([x, y]), [x, y]);
  nodes.set(key(p), p);
  nodes.set(key(q), q);
  const all = [...nodes.values()];
  const adjacent = new Map(all.map((n) => [key(n), []]));
  const link = (line) => {
    line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let k = 1; k < line.length; k++) {
      const d = Math.abs(line[k][0] - line[k - 1][0]) + Math.abs(line[k][1] - line[k - 1][1]);
      adjacent.get(key(line[k])).push([line[k - 1], d]);
      adjacent.get(key(line[k - 1])).push([line[k], d]);
    }
  };
  for (const x of xs) link(all.filter((n) => n[0] === x));
  for (const y of ys) link(all.filter((n) => n[1] === y));
  const dist = new Map([[key(p), 0]]);
  const done = new Set();
  while (true) {
    let best = null;
    for (const [k, d] of dist) if (!done.has(k) && (best === null || d < dist.get(best))) best = k;
    if (best === key(q)) return dist.get(best);
    done.add(best);
    for (const [m, d] of adjacent.get(best)) {
      const nd = dist.get(best) + d;
      if (!dist.has(key(m)) || nd < dist.get(key(m))) dist.set(key(m), nd);
    }
  }
}

// Every piece of a route must run along a street.
function onStreets(route, xs, ys) {
  return route.every((a, k) => {
    if (k === 0) return true;
    const b = route[k - 1];
    return (a[0] === b[0] && xs.includes(a[0])) || (a[1] === b[1] && ys.includes(a[1])) || (a[0] === b[0] && a[1] === b[1]);
  });
}

function permutations(n) {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((perm) =>
    Array.from({ length: n }, (_, i) => [...perm.slice(0, i), n - 1, ...perm.slice(i)]));
}

function isPermutation(sigma) {
  return new Set(sigma).size === sigma.length && sigma.every((j) => Number.isInteger(j) && j >= 0 && j < sigma.length);
}

// ---- Helpers for driving the app ----

const text = (doc, id) => doc.getElementById(id).textContent;
const visible = (doc, id) => !doc.getElementById(id).hidden;
const blocks = (units) => `${(units / 100).toFixed(2)} blocks`;
const routePoints = (doc) => [...doc.querySelectorAll("polyline.route")].map((r) => r.getAttribute("points") || "");
const ghostPoints = (doc) => [...doc.querySelectorAll("polyline.ghost")].map((r) => r.getAttribute("points") || "");

function pair(w, taxi, passenger) {
  w.app.handleTap("taxi", taxi);
  w.app.handleTap("passenger", passenger);
}

// The cost of a full assignment, measured with the app's own route function.
function costOf(w, pairs) {
  return pairs.reduce((total, j, i) => total + w.routeFor(w.app.taxis[i], w.app.passengers[j]).length, 0);
}

function setPositions(w, taxis, passengers) {
  taxis.forEach((t, i) => Object.assign(w.app.taxis[i], t));
  passengers.forEach((p, i) => Object.assign(w.app.passengers[i], p));
  w.app.render();
}

// The cheapest assignment, found the slow way by trying all n! permutations.
function bruteForceMinimum(w) {
  return Math.min(...permutations(w.app.taxis.length).map((sigma) => costOf(w, sigma)));
}

// Simulate a finger or mouse: press on an icon, optionally move, release.
function pointerGesture(w, doc, marker, toMap) {
  const rect = doc.getElementById("map").getBoundingClientRect();
  const box = marker.getBoundingClientRect();
  const start = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
  const fire = (type, at) => marker.dispatchEvent(new w.PointerEvent(type, { ...at, pointerId: 1, bubbles: true }));
  fire("pointerdown", start);
  let end = start;
  if (toMap) {
    end = { clientX: rect.left + (toMap.x / 600) * rect.width, clientY: rect.top + (toMap.y / 600) * rect.height };
    fire("pointermove", end);
  } else {
    fire("pointermove", { clientX: start.clientX + 2, clientY: start.clientY + 1 }); // a small wobble during a tap
  }
  fire("pointerup", end);
}

// A layout with two different optimal assignments: taxis 0 and 1 are each exactly one block from
// passengers 0 and 1, and taxis 2-4 already stand next to passengers 2-4.
const TWO_OPTIMA = {
  taxis: [{ x: 50, y: 50 }, { x: 150, y: 150 }, { x: 550, y: 550 }, { x: 550, y: 450 }, { x: 450, y: 550 }],
  passengers: [{ x: 150, y: 50 }, { x: 50, y: 150 }, { x: 550, y: 540 }, { x: 550, y: 460 }, { x: 460, y: 550 }],
};

// ---- Mathematics ----

test("street distance: two people mid-block on parallel streets need a detour", async () => {
  const { w } = await loadApp();
  const route = w.shortestRoute([100, 50], [100, 150]);
  assertEqual(w.routeLength(route), 200, "detour length (the taxicab distance would be 100)");
  assert(onStreets(route, w.app.STREETS_X, w.app.STREETS_Y), "route leaves the streets");
});

test("street distance agrees with Dijkstra's algorithm on 3000 random pairs", async () => {
  const { w } = await loadApp();
  const random = seededRandom(1);
  for (let k = 0; k < 3000; k++) {
    const p = randomStreetPoint(random, w.app), q = randomStreetPoint(random, w.app);
    const route = w.shortestRoute([p.x, p.y], [q.x, q.y]);
    assertEqual(route[0], [p.x, p.y], "route start");
    assertEqual(route[route.length - 1], [q.x, q.y], "route end");
    assert(onStreets(route, w.app.STREETS_X, w.app.STREETS_Y), `route leaves the streets: ${JSON.stringify(route)}`);
    assertEqual(w.routeLength(route), dijkstra([p.x, p.y], [q.x, q.y], w.app.STREETS_X, w.app.STREETS_Y),
      `length from ${JSON.stringify(p)} to ${JSON.stringify(q)}`);
  }
});

test("solver matches brute force over all n! permutations (n ≤ 7, including many ties)", async () => {
  const { w } = await loadApp();
  const random = seededRandom(2);
  for (let k = 0; k < 1500; k++) {
    const n = 1 + Math.floor(random() * 7);
    const ties = k % 2 === 0;
    const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => (ties ? Math.floor(random() * 3) : random())));
    const sigma = w.linearSumAssignment(cost);
    assert(isPermutation(sigma), `not a permutation: ${sigma}`);
    const total = sigma.reduce((s, j, i) => s + cost[i][j], 0);
    const best = Math.min(...permutations(n).map((perm) => perm.reduce((s, j, i) => s + cost[i][j], 0)));
    assert(Math.abs(total - best) < 1e-9, `matrix ${k}: got ${total}, minimum is ${best}`);
  }
});

test("optimal assignment is one-to-one, minimal, and its total is the sum of its routes (300 layouts)", async () => {
  const { w } = await loadApp();
  const random = seededRandom(3);
  for (let k = 0; k < 300; k++) {
    setPositions(w, w.app.taxis.map(() => randomStreetPoint(random, w.app)), w.app.passengers.map(() => randomStreetPoint(random, w.app)));
    const result = w.optimalAssignment(w.app.taxis, w.app.passengers);
    assert(isPermutation(result.sigma), "not a permutation");
    assertEqual(result.cost, costOf(w, result.sigma), "total vs. sum of route lengths");
    assertEqual(result.routes.reduce((s, r) => s + w.routeLength(r), 0), result.cost, "total vs. drawn routes");
    assertEqual(result.cost, bruteForceMinimum(w), "total vs. brute-force minimum");
  }
});

// ---- Challenge bookkeeping ----

test("assignments stay one-to-one through 2000 random taps", async () => {
  const { w } = await loadApp();
  const random = seededRandom(4);
  const challenge = w.createChallenge(5);
  for (let k = 0; k < 2000; k++) {
    const op = random();
    if (op < 0.8) w.assignPair(challenge, Math.floor(random() * 5), Math.floor(random() * 5));
    else if (op < 0.95) w.undoPair(challenge);
    else w.clearPairs(challenge);
    const used = challenge.pairs.filter((p) => p !== -1);
    assertEqual(new Set(used).size, used.length, `a passenger has two taxis: ${challenge.pairs}`);
  }
});

// ---- The app: Explore Mode ----

test("Explore Mode (default) shows the minimum total in blocks and all five optimal routes", async () => {
  const { w, doc } = await loadApp();
  assertEqual(w.app.state.mode, "explore", "default mode");
  const optimal = w.optimalAssignment(w.app.taxis, w.app.passengers);
  assertEqual(text(doc, "optimal"), blocks(optimal.cost), "displayed minimum");
  assertEqual(text(doc, "optimal"), "9.50 blocks", "starting layout");
  assert(routePoints(doc).every((p) => p !== ""), "every taxi has a route");
  assert(!visible(doc, "challenge-controls") && !visible(doc, "tile-yours") && !visible(doc, "tile-savings"), "challenge UI visible in Explore Mode");
});

test("Explore Mode: tapping icons does not create assignments", async () => {
  const { w } = await loadApp();
  pair(w, 0, 3);
  assertEqual(w.app.state.challenge.pairs, [-1, -1, -1, -1, -1], "pairs");
  assertEqual(w.app.state.selected, null, "selection");
});

// ---- The app: Challenge Mode ----

test("Challenge Mode: tap a taxi then a passenger (or the reverse) to assign; route and total update", async () => {
  const { w, doc } = await loadApp();
  doc.getElementById("mode-challenge").click();
  assert(routePoints(doc).every((p) => p === ""), "no routes before any assignment");
  assertEqual(text(doc, "optimal"), "?", "optimum hidden");

  w.app.handleTap("taxi", 0);
  assert(doc.querySelectorAll(".marker.taxi")[0].classList.contains("selected"), "taxi highlighted after tap");
  w.app.handleTap("passenger", 2);
  w.app.handleTap("passenger", 4); // passenger first, then taxi
  w.app.handleTap("taxi", 3);
  assertEqual(w.app.state.challenge.pairs, [2, -1, -1, 4, -1], "pairs");
  const routes = routePoints(doc);
  assert(routes[0] !== "" && routes[3] !== "" && routes[1] === "", "routes drawn only for assigned taxis");
  const expected = w.routeFor(w.app.taxis[0], w.app.passengers[2]).length + w.routeFor(w.app.taxis[3], w.app.passengers[4]).length;
  assertEqual(text(doc, "yours"), blocks(expected), "your total");
  assertEqual(text(doc, "yours-note"), "2 of 5 taxis assigned", "progress note");
  assertEqual(text(doc, "savings"), "—", "no savings before completion");
});

test("Challenge Mode: changing assignments keeps them one-to-one; tapping a pair again removes it", async () => {
  const { w } = await loadApp();
  w.app.setMode("challenge");
  pair(w, 0, 2);
  pair(w, 1, 2); // passenger 2 moves from taxi 0 to taxi 1
  assertEqual(w.app.state.challenge.pairs, [-1, 2, -1, -1, -1], "after reassigning the passenger");
  pair(w, 1, 3); // taxi 1 switches to passenger 3
  assertEqual(w.app.state.challenge.pairs, [-1, 3, -1, -1, -1], "after reassigning the taxi");
  pair(w, 1, 3); // the same pair again removes it
  assertEqual(w.app.state.challenge.pairs, [-1, -1, -1, -1, -1], "after removing");
  w.app.handleTap("taxi", 4);
  w.app.handleTap("taxi", 4); // tapping the selected taxi again deselects it
  assertEqual(w.app.state.selected, null, "deselected");
});

test("Challenge Mode: Undo and Clear (and undoing a Clear)", async () => {
  const { w, doc } = await loadApp();
  w.app.setMode("challenge");
  assert(doc.getElementById("undo").disabled && doc.getElementById("clear").disabled, "buttons start disabled");
  pair(w, 0, 0);
  pair(w, 1, 1);
  pair(w, 1, 2);
  doc.getElementById("undo").click();
  assertEqual(w.app.state.challenge.pairs, [0, 1, -1, -1, -1], "after undo");
  doc.getElementById("clear").click();
  assertEqual(w.app.state.challenge.pairs, [-1, -1, -1, -1, -1], "after clear");
  assert(routePoints(doc).every((p) => p === ""), "routes removed after clear");
  assertEqual(text(doc, "yours"), "—", "total after clear");
  doc.getElementById("undo").click();
  assertEqual(w.app.state.challenge.pairs, [0, 1, -1, -1, -1], "undoing the clear");
});

test("Reveal after a complete, non-optimal assignment: optimum, savings and percentage are correct", async () => {
  const { w, doc } = await loadApp();
  w.app.setMode("challenge");
  const optimal = w.optimalAssignment(w.app.taxis, w.app.passengers);
  // Swap two taxis' passengers in the optimal assignment until that makes it strictly worse.
  let mine;
  for (let a = 0; a < 5 && !mine; a++) {
    for (let b = a + 1; b < 5 && !mine; b++) {
      const candidate = [...optimal.sigma];
      [candidate[a], candidate[b]] = [candidate[b], candidate[a]];
      if (costOf(w, candidate) > optimal.cost) mine = candidate;
    }
  }
  mine.forEach((j, i) => pair(w, i, j));
  const myCost = costOf(w, mine);
  assertEqual(text(doc, "yours"), blocks(myCost), "your total");
  assertEqual(text(doc, "savings-note"), "reveal to compare", "before reveal");

  doc.getElementById("reveal").click();
  assertEqual(text(doc, "optimal"), blocks(optimal.cost), "revealed optimum");
  assertEqual(text(doc, "savings"), blocks(myCost - optimal.cost), "savings");
  assertEqual(text(doc, "savings-note"), `${Math.round((100 * (myCost - optimal.cost)) / myCost)}% of your total`, "percentage");
  assert(ghostPoints(doc).every((p) => p !== ""), "optimal routes shown");
  assert(!text(doc, "message").includes("🎉"), "no congratulations for a non-optimal answer");
  assert(visible(doc, "route-key"), "route key shown");

  doc.getElementById("reveal").click(); // "Hide optimal"
  assert(ghostPoints(doc).every((p) => p === "") && text(doc, "optimal") === "?", "optimum hidden again");
});

test("Reveal after finding the optimum: congratulations and zero savings", async () => {
  const { w, doc } = await loadApp();
  w.app.setMode("challenge");
  w.optimalAssignment(w.app.taxis, w.app.passengers).sigma.forEach((j, i) => pair(w, i, j));
  doc.getElementById("reveal").click();
  assertEqual(text(doc, "savings"), "0.00 blocks", "savings");
  assert(text(doc, "message").includes("🎉 You found an optimal assignment!"), "congratulations");
  assert(!text(doc, "message").includes("more than one"), "no remark about other optima for the same pairing");
});

test("Multiple optima: a different pairing with the same minimal total also counts as optimal", async () => {
  const { w, doc } = await loadApp();
  setPositions(w, TWO_OPTIMA.taxis, TWO_OPTIMA.passengers);
  const optimal = w.optimalAssignment(w.app.taxis, w.app.passengers);
  const alternative = [...optimal.sigma];
  [alternative[0], alternative[1]] = [alternative[1], alternative[0]];
  assertEqual(costOf(w, alternative), optimal.cost, "both pairings have the same total");
  assertEqual(optimal.cost, bruteForceMinimum(w), "and that total is the minimum");

  w.app.setMode("challenge");
  alternative.forEach((j, i) => pair(w, i, j));
  doc.getElementById("reveal").click();
  assert(text(doc, "message").includes("🎉 You found an optimal assignment!"), "congratulations");
  assert(text(doc, "message").includes("more than one best answer"), "mentions the other optimum");
  assertEqual(text(doc, "savings"), "0.00 blocks", "savings");
});

test("Reveal before finishing: optimum shown, comparison waits until every taxi is assigned", async () => {
  const { w, doc } = await loadApp();
  w.app.setMode("challenge");
  pair(w, 0, 1);
  doc.getElementById("reveal").click();
  const optimal = w.optimalAssignment(w.app.taxis, w.app.passengers);
  assertEqual(text(doc, "optimal"), blocks(optimal.cost), "optimum");
  assertEqual(text(doc, "savings"), "—", "savings");
  assertEqual(text(doc, "savings-note"), "assign every taxi first", "savings note");
});

test("Switching modes: Explore shows the optimum, Challenge keeps the user's pairs; selection is cleared", async () => {
  const { w, doc } = await loadApp();
  doc.getElementById("mode-challenge").click();
  pair(w, 0, 3);
  w.app.handleTap("taxi", 1); // half-made pair
  doc.getElementById("mode-explore").click();
  assertEqual(w.app.state.selected, null, "selection cleared");
  assertEqual(doc.getElementById("mode-explore").getAttribute("aria-pressed"), "true", "Explore button pressed");
  assertEqual(text(doc, "optimal"), blocks(w.optimalAssignment(w.app.taxis, w.app.passengers).cost), "Explore shows the minimum");
  assert(routePoints(doc).every((p) => p !== "") && ghostPoints(doc).every((p) => p === ""), "Explore shows the five optimal routes");
  assert(!visible(doc, "challenge-controls"), "challenge buttons hidden");

  doc.getElementById("mode-challenge").click();
  assertEqual(w.app.state.challenge.pairs, [3, -1, -1, -1, -1], "user's pairs kept");
  const routes = routePoints(doc);
  assert(routes[0] !== "" && routes.slice(1).every((p) => p === ""), "only the user's route is drawn");
});

test("Dragging an icon snaps it onto a street and updates routes; a tap does not move it", async () => {
  const { w, doc } = await loadApp();
  w.app.setMode("challenge");
  w.optimalAssignment(w.app.taxis, w.app.passengers).sigma.forEach((j, i) => pair(w, i, j));
  doc.getElementById("reveal").click();
  const taxiMarker = doc.querySelectorAll(".marker.taxi")[2];

  const before = { ...w.app.taxis[2] };
  pointerGesture(w, doc, taxiMarker); // a tap
  assertEqual(w.app.taxis[2], before, "a tap must not move the taxi");
  assertEqual(w.app.state.selected, { kind: "taxi", index: 2 }, "a tap selects the taxi");
  w.app.handleTap("taxi", 2); // deselect

  pointerGesture(w, doc, taxiMarker, { x: 470, y: 290 }); // drag to near the street x = 450
  const t = w.app.taxis[2];
  assert(Number.isInteger(t.x) && Number.isInteger(t.y), `position not whole units: ${JSON.stringify(t)}`);
  assert(w.app.STREETS_X.includes(t.x) || w.app.STREETS_Y.includes(t.y), `not on a street: ${JSON.stringify(t)}`);
  assert(Math.abs(t.x - 450) <= 2 && Math.abs(t.y - 290) <= 2, `not where it was dropped: ${JSON.stringify(t)}`);
  assertEqual(text(doc, "yours"), blocks(costOf(w, w.app.state.challenge.pairs)), "your total after the drag");
  assertEqual(text(doc, "optimal"), blocks(w.optimalAssignment(w.app.taxis, w.app.passengers).cost), "optimum after the drag");
});

test("On a phone-sized screen the icons are scaled up for easier tapping", async () => {
  const { doc } = await loadApp(375);
  const transform = doc.querySelector(".marker.taxi").getAttribute("transform");
  const scale = parseFloat(transform.match(/scale\(([\d.]+)\)/)[1]);
  assert(scale > 1.2, `icon scale ${scale}`);
  assert(doc.documentElement.scrollWidth <= 375, `page scrolls sideways: ${doc.documentElement.scrollWidth}px wide`);
});

runAll();
