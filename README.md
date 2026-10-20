# Taxi Assignment Visualizer

An interactive picture of the **assignment problem**: five taxis and five passengers in a small
town. Drag any of them along the streets, and the map instantly shows which taxi should pick up
which passenger so that the **total distance driven is as small as possible**, together with each
taxi's route.

**Try it:** https://madeline-v-brandt.github.io/taxi-assignment-visualizer/

## The mathematics

Given taxis $t_1, \dots, t_n$ and passengers $p_1, \dots, p_n$, find a permutation $\sigma$ minimizing

$$\sum_{i=1}^{n} d\big(t_i, p_{\sigma(i)}\big),$$

where $d$ is the length of the shortest route along the streets. On a street grid this equals the
taxicab ($L^1$) distance, except when both points are in the middle of the same block on
parallel streets: then the taxi must detour to a corner.

The optimal $\sigma$ is found with the shortest-augmenting-path algorithm (a Jonker–Volgenant
variant, $O(n^3)$), the same method used by SciPy's
[`linear_sum_assignment`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html).

## Project structure

| Path | What it is |
|---|---|
| `static/index.html` | The page itself. |
| `static/style.css` | Colours and styles. |
| `static/town.js` | Draws the town (roads, river, buildings) and defines the street grid. |
| `static/assignment.js` | The mathematics: street routes and the assignment solver. |
| `static/main.js` | Dragging, and redrawing the optimal routes after every move. |
| `server.py` | The original Python version of the solver (Flask + SciPy). The website does not use it, but it is handy for checking the JavaScript against SciPy. |
| `.github/workflows/deploy.yml` | Publishes `static/` to GitHub Pages on every push to `main`. |

## Running it locally

The website is plain HTML, CSS and JavaScript, so there is nothing to install or build. From the
project folder, run:

```
python3 -m http.server 8000 --directory static
```

then open http://localhost:8000. Press Ctrl+C in the terminal to stop the server.

### Optional: the Python/SciPy version

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

This serves the same page at http://localhost:8000 and also answers `POST /assign` requests
using SciPy.

## Deployment

Every push to `main` runs the GitHub Actions workflow in `.github/workflows/deploy.yml`, which
publishes the `static/` folder to GitHub Pages.
