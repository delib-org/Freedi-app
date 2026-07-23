"""Demo: 2D opinion map from pairwise evaluation distances via classical MDS.

Simulates users evaluating statements in [-1, 1], computes the pairwise
distance matrix d(a,b) = mean |e_a - e_b| over shared statements (range 0-2),
then projects it to 2D with classical MDS and renders an SVG map.
"""
import os

import numpy as np

rng = np.random.default_rng(7)

S = 40  # statements
EVAL_LEVELS = np.array([-1.0, -0.5, 0.0, 0.5, 1.0])

# --- Three opinion camps: A and B mostly opposed, C bridges between them ---
profile_a = rng.choice([-1.0, -0.5, 0.5, 1.0], S)
flip = rng.random(S) < 0.7
profile_b = np.where(flip, -profile_a, profile_a * rng.uniform(0.5, 1.0, S))
mix = rng.random(S)
profile_c = mix * profile_a + (1 - mix) * profile_b

clusters = [
    ("Camp A", 24, profile_a),
    ("Camp B", 20, profile_b),
    ("Bridging group", 16, profile_c),
]

users, labels = [], []
for ci, (name, n, prof) in enumerate(clusters):
    for _ in range(n):
        vals = np.clip(prof + rng.normal(0, 0.35, S), -1, 1)
        # snap to the discrete evaluation levels
        vals = EVAL_LEVELS[np.abs(vals[:, None] - EVAL_LEVELS).argmin(axis=1)]
        mask = rng.random(S) < 0.75  # each user evaluates ~75% of statements
        users.append((vals, mask))
        labels.append(ci)
labels = np.array(labels)
U = len(users)

# --- Pairwise distance matrix: mean |diff| over shared statements, in [0, 2] ---
D = np.zeros((U, U))
for i in range(U):
    vi, mi = users[i]
    for j in range(i + 1, U):
        vj, mj = users[j]
        shared = mi & mj
        d = np.abs(vi[shared] - vj[shared]).mean() if shared.any() else np.nan
        D[i, j] = D[j, i] = d

# --- Classical MDS (Torgerson): double-center D^2, top-2 eigenvectors ---
D2 = D ** 2
J = np.eye(U) - np.ones((U, U)) / U
B = -0.5 * J @ D2 @ J
eigval, eigvec = np.linalg.eigh(B)
order = np.argsort(eigval)[::-1]
lam2, vec2 = eigval[order[:2]], eigvec[:, order[:2]]
X = vec2 * np.sqrt(np.maximum(lam2, 0))

# --- Fidelity: how well do map distances match the true ones? ---
iu = np.triu_indices(U, 1)
true_d = D[iu]
map_d = np.sqrt(((X[iu[0]] - X[iu[1]]) ** 2).sum(axis=1))
r = np.corrcoef(true_d, map_d)[0, 1]
stress = np.sqrt(((true_d - map_d) ** 2).sum() / (true_d ** 2).sum())
var_explained = lam2.sum() / np.maximum(eigval, 0).sum()

# --- Layout: map MDS coords to the plot area with EQUAL scale on both axes ---
W, H = 1082, 640
PAD_L, PAD_R, PAD_T, PAD_B = 40, 40, 96, 74
plot_w, plot_h = W - PAD_L - PAD_R, H - PAD_T - PAD_B
xr = X[:, 0].max() - X[:, 0].min()
yr = X[:, 1].max() - X[:, 1].min()
scale = min(plot_w / xr, plot_h / yr) * 0.92  # px per distance unit
cx, cy = (X[:, 0].max() + X[:, 0].min()) / 2, (X[:, 1].max() + X[:, 1].min()) / 2
px = PAD_L + plot_w / 2 + (X[:, 0] - cx) * scale
py = PAD_T + plot_h / 2 - (X[:, 1] - cy) * scale

COLORS = ["#2a78d6", "#eb6834", "#1baf7a"]

svg = []
svg.append(f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
           f'font-family="system-ui, -apple-system, &quot;Segoe UI&quot;, sans-serif">')

# title + subtitle
svg.append(f'<text x="{PAD_L}" y="34" font-size="19" font-weight="650" fill="#0b0b0b">'
           f'Opinion map — {U} users placed by pairwise evaluation distance</text>')
svg.append(f'<text x="{PAD_L}" y="56" font-size="12.5" fill="#52514e">'
           f'Classical MDS projection of the {U}×{U} distance matrix · '
           f'd(a,b) = mean |Δevaluation| over shared statements, range 0–2 · '
           f'nearby users evaluate alike</text>')

# legend (its own row, left-aligned under the subtitle)
lx = PAD_L
for k, (name, n, _) in enumerate(clusters):
    label = f'{name} (n={n})'
    svg.append(f'<circle cx="{lx + 6}" cy="{PAD_T - 18}" r="5" fill="{COLORS[k]}"/>')
    svg.append(f'<text x="{lx + 16}" y="{PAD_T - 14}" font-size="12" fill="#52514e">{label}</text>')
    lx += 30 + int(len(label) * 6.6)

# plot frame
svg.append(f'<rect x="{PAD_L}" y="{PAD_T}" width="{plot_w}" height="{plot_h}" '
           f'fill="none" stroke="#e1e0d9" stroke-width="1"/>')

# annotate the farthest pair with a dashed connector
fi = np.argmax(true_d)
a, b = iu[0][fi], iu[1][fi]
svg.append(f'<line x1="{px[a]:.1f}" y1="{py[a]:.1f}" x2="{px[b]:.1f}" y2="{py[b]:.1f}" '
           f'stroke="#c3c2b7" stroke-width="1" stroke-dasharray="4 4"/>')
t = 0.78  # place the label along the line, clear of the central cluster
mx, my = px[a] + t * (px[b] - px[a]), py[a] + t * (py[b] - py[a])
svg.append(f'<text x="{mx:.1f}" y="{my - 9:.1f}" font-size="11" fill="#52514e" '
           f'text-anchor="middle" stroke="#fcfcfb" stroke-width="4" '
           f'paint-order="stroke">farthest pair · d = {true_d[fi]:.2f}</text>')

# dots: 12px marks with a 2px surface ring so overlaps stay readable
for i in range(U):
    svg.append(f'<circle cx="{px[i]:.1f}" cy="{py[i]:.1f}" r="6" '
               f'fill="{COLORS[labels[i]]}" stroke="#fcfcfb" stroke-width="2"/>')

# direct cluster labels at centroids (ink, not series color)
offsets = [(0, -26), (0, 30), (14, -24)]
for k, (name, n, _) in enumerate(clusters):
    gx, gy = px[labels == k].mean(), py[labels == k].mean()
    ox, oy = offsets[k]
    svg.append(f'<text x="{gx + ox:.1f}" y="{gy + oy:.1f}" font-size="13" font-weight="650" '
               f'fill="#0b0b0b" text-anchor="middle" stroke="#fcfcfb" stroke-width="4" '
               f'paint-order="stroke">{name}</text>')

# scale bar: what a distance of 0.5 looks like on the map
bar = 0.5 * scale
bx, by = PAD_L + 8, H - PAD_B + 26
svg.append(f'<line x1="{bx}" y1="{by}" x2="{bx + bar:.1f}" y2="{by}" stroke="#898781" stroke-width="2"/>')
svg.append(f'<line x1="{bx}" y1="{by - 4}" x2="{bx}" y2="{by + 4}" stroke="#898781" stroke-width="2"/>')
svg.append(f'<line x1="{bx + bar:.1f}" y1="{by - 4}" x2="{bx + bar:.1f}" y2="{by + 4}" stroke="#898781" stroke-width="2"/>')
svg.append(f'<text x="{bx + bar / 2:.1f}" y="{by + 18}" font-size="11" fill="#898781" '
           f'text-anchor="middle">distance = 0.5</text>')

# fidelity note (bottom right)
svg.append(f'<text x="{W - PAD_R}" y="{by + 18}" font-size="11" fill="#898781" text-anchor="end">'
           f'map fidelity: r = {r:.2f} between true and drawn distances · '
           f'stress = {stress:.2f} · 2 axes carry {var_explained:.0%} of structure · '
           f'axes are unitless</text>')

svg.append('</svg>')

html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Opinion distance map</title>
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ background: #f9f9f7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  .page {{ width: 1122px; height: 793px; display: flex; align-items: center; justify-content: center; }}
  .card {{ width: 1082px; background: #fcfcfb; border: 1px solid rgba(11,11,11,0.10);
          border-radius: 8px; padding: 0; }}
</style></head>
<body><div class="page"><div class="card">{''.join(svg)}</div></div></body></html>
"""

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opinion_map.html")
with open(out, "w") as f:
    f.write(html)
print(f"users={U}  r={r:.3f}  stress={stress:.3f}  var2d={var_explained:.1%}  "
      f"d_range=[{true_d.min():.2f}, {true_d.max():.2f}]")
