# The backend: serves the web page and solves the assignment problem with SciPy.
#
# Given n taxis and n passengers, find a bijection sigma (taxi i -> passenger sigma(i))
# minimizing  sum_i dist(taxi_i, passenger_sigma(i)),
# where dist is the length of the shortest route along the streets.

import numpy as np
from flask import Flask, jsonify, request
from scipy.optimize import linear_sum_assignment

# The street grid. These must match STREETS_X and STREETS_Y in static/town.js.
STREETS_X = [50, 150, 250, 350, 450, 550]  # vertical streets
STREETS_Y = [50, 150, 250, 350, 450, 550]  # horizontal streets

# Files in the "static" folder (index.html, style.css, main.js) are sent to the browser as-is.
app = Flask(__name__, static_folder="static", static_url_path="")


def neighbours(value, streets):
    """The closest streets at or below, and at or above, a coordinate (equal if it lies on a street)."""
    below = max(s for s in streets if s <= value)
    above = min(s for s in streets if s >= value)
    return {below, above}


def exits(p):
    """The intersections at the two ends of the block that point p lies on (just p itself at an intersection)."""
    x, y = p
    if x in STREETS_X:  # on a vertical street: the exits are up and down the street
        return [(x, s) for s in neighbours(y, STREETS_Y)]
    return [(s, y) for s in neighbours(x, STREETS_X)]  # on a horizontal street: left and right


def length(route):
    # Every piece of a route is horizontal or vertical, so this is also its Euclidean length.
    return sum(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in zip(route, route[1:]))


def shortest_route(p, q):
    """The shortest path from p to q along the streets, as a list of corner points."""
    candidates = []
    # If p and q are on the same street, the taxi can drive straight there.
    if (p[0] == q[0] and p[0] in STREETS_X) or (p[1] == q[1] and p[1] in STREETS_Y):
        candidates.append([p, q])
    # Otherwise it drives to an end of its block (a), across the grid to an end of q's block (b), then to q.
    # Between two intersections, the taxicab route "horizontal, then vertical" always runs along streets.
    for a in exits(p):
        for b in exits(q):
            candidates.append([p, a, (b[0], a[1]), b, q])
    return min(candidates, key=length)


# The page sends {"taxis": [{x, y}, ...], "passengers": [{x, y}, ...]} to this address.
@app.post("/assign")
def assign():
    data = request.get_json()
    taxis = [(p["x"], p["y"]) for p in data["taxis"]]
    passengers = [(p["x"], p["y"]) for p in data["passengers"]]

    # routes[i][j] = shortest route from taxi i to passenger j; cost[i, j] is its length.
    routes = [[shortest_route(t, p) for p in passengers] for t in taxis]
    cost = np.array([[length(r) for r in row] for row in routes])
    rows, cols = linear_sum_assignment(cost)

    # rows is always [0, 1, ..., n-1] for a square matrix, so cols[i] is sigma(i).
    return jsonify(
        sigma=cols.tolist(),
        cost=float(cost[rows, cols].sum()),
        routes=[routes[i][j] for i, j in zip(rows, cols)],
    )


@app.get("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(port=8000, debug=True)
