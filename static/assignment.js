// The mathematics: solve the assignment problem in the browser.
//
// Given n taxis and n passengers, find a bijection sigma (taxi i -> passenger sigma(i))
// minimizing  sum_i dist(taxi_i, passenger_sigma(i)),
// where dist is the length of the shortest route along the streets.
//
// This is a JavaScript port of server.py, which does the same with SciPy. The street grid
// (STREETS_X, STREETS_Y) comes from town.js, which is loaded first.

// The closest streets at or below, and at or above, a coordinate (one street if it lies on a street).
function neighbours(value, streets) {
  const below = Math.max(...streets.filter((s) => s <= value));
  const above = Math.min(...streets.filter((s) => s >= value));
  return [...new Set([below, above])];
}

// The intersections at the two ends of the block that point p lies on (just p itself at an intersection).
function exits([x, y]) {
  if (STREETS_X.includes(x)) return neighbours(y, STREETS_Y).map((s) => [x, s]); // on a vertical street
  return neighbours(x, STREETS_X).map((s) => [s, y]);                             // on a horizontal street
}

// Every piece of a route is horizontal or vertical, so this is also its Euclidean length.
function routeLength(route) {
  let total = 0;
  for (let k = 1; k < route.length; k++) {
    total += Math.abs(route[k][0] - route[k - 1][0]) + Math.abs(route[k][1] - route[k - 1][1]);
  }
  return total;
}

// The shortest path from p to q along the streets, as a list of corner points [x, y].
function shortestRoute(p, q) {
  const candidates = [];
  // If p and q are on the same street, the taxi can drive straight there.
  if ((p[0] === q[0] && STREETS_X.includes(p[0])) || (p[1] === q[1] && STREETS_Y.includes(p[1]))) {
    candidates.push([p, q]);
  }
  // Otherwise it drives to an end of its block (a), across the grid to an end of q's block (b), then to q.
  // Between two intersections, the taxicab route "horizontal, then vertical" always runs along streets.
  for (const a of exits(p)) {
    for (const b of exits(q)) candidates.push([p, a, [b[0], a[1]], b, q]);
  }
  return candidates.reduce((best, r) => (routeLength(r) < routeLength(best) ? r : best));
}

// Minimum-cost perfect matching for a square cost matrix: returns sigma with sigma[i] = column of row i.
// The same shortest-augmenting-path method (a Jonker–Volgenant variant, O(n^3)) that SciPy's
// linear_sum_assignment uses: add the rows one at a time, each time finding the cheapest way to
// re-route the matching (Dijkstra on reduced costs), while dual variables u, v keep reduced costs >= 0.
function linearSumAssignment(cost) {
  const n = cost.length;
  const u = new Array(n).fill(0), v = new Array(n).fill(0);
  const colForRow = new Array(n).fill(-1), rowForCol = new Array(n).fill(-1);

  for (let newRow = 0; newRow < n; newRow++) {
    const shortest = new Array(n).fill(Infinity); // shortest path cost from newRow to each column
    const path = new Array(n).fill(-1);           // previous row on that path
    const rowSeen = new Array(n).fill(false), colSeen = new Array(n).fill(false);
    const remaining = [...Array(n).keys()];       // columns not yet reached
    let minVal = 0, i = newRow, sink = -1;

    while (sink === -1) {
      rowSeen[i] = true;
      let lowest = Infinity, index = -1;
      remaining.forEach((j, k) => {
        const reduced = minVal + cost[i][j] - u[i] - v[j];
        if (reduced < shortest[j]) { path[j] = i; shortest[j] = reduced; }
        // Among equally short paths, prefer one ending at a free column (it finishes the search).
        if (shortest[j] < lowest || (shortest[j] === lowest && rowForCol[j] === -1)) { lowest = shortest[j]; index = k; }
      });
      minVal = lowest;
      const j = remaining.splice(index, 1)[0];
      colSeen[j] = true;
      if (rowForCol[j] === -1) sink = j; // a free column: we found an augmenting path
      else i = rowForCol[j];             // otherwise continue from the row currently matched to it
    }

    // Update the dual variables so that all reduced costs stay non-negative.
    u[newRow] += minVal;
    for (let r = 0; r < n; r++) if (rowSeen[r] && r !== newRow) u[r] += minVal - shortest[colForRow[r]];
    for (let c = 0; c < n; c++) if (colSeen[c]) v[c] -= minVal - shortest[c];

    // Flip the matching along the augmenting path, from the sink back to newRow.
    for (let j = sink; ; ) {
      const r = path[j];
      rowForCol[j] = r;
      [colForRow[r], j] = [j, colForRow[r]];
      if (r === newRow) break;
    }
  }
  return colForRow;
}

// taxis and passengers are lists of {x, y}. Returns the total cost and each taxi's route.
function optimalAssignment(taxis, passengers) {
  // routes[i][j] = shortest route from taxi i to passenger j; cost[i][j] is its length.
  const routes = taxis.map((t) => passengers.map((p) => shortestRoute([t.x, t.y], [p.x, p.y])));
  const cost = routes.map((row) => row.map(routeLength));
  const sigma = linearSumAssignment(cost);
  return {
    sigma,
    cost: sigma.reduce((total, j, i) => total + cost[i][j], 0),
    routes: sigma.map((j, i) => routes[i][j]),
  };
}
