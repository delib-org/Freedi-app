#!/usr/bin/env python3
"""Pilot-150 comparison: current production mechanism (gpt-5.6-luna) vs the
archived full-run conditions and the cosine baseline, all restricted to the
same fixed 150-triplet stratified sample (results/pilot-ids.json).

Attach rule mirrors analyze.ts: relation == 'expresses' and matchedClusterId
is not None and confidence >= 0.6. Triplet correct iff match attaches and
distractor does not. Wilson 95% CIs; exact McNemar for paired contrasts.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
RESULTS = HERE / 'results'
MIN_CONFIDENCE = 0.6

pilot = set(json.load(open(RESULTS / 'pilot-ids.json')))
assert len(pilot) == 150


def read_jsonl(name):
    p = RESULTS / name
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def attaches(c):
    return (
        c.get('relation') == 'expresses'
        and c.get('matchedClusterId') is not None
        and c.get('confidence', 0) >= MIN_CONFIDENCE
    )


def correct(row):
    return attaches(row['match']) and not attaches(row['distractor'])


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (p, c - h, c + h)


def fmt(k, n):
    p, lo, hi = wilson(k, n)
    return f'{100*p:5.1f}% [{100*lo:.1f}, {100*hi:.1f}]  ({k}/{n})'


def mcnemar_exact(b, c):
    """Two-sided exact binomial on discordant pairs."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    total = sum(math.comb(n, i) for i in range(0, k + 1)) / 2**n
    return min(1.0, 2 * total)


def pilot_rows(name):
    rows = [r for r in read_jsonl(name) if r['id'] in pilot]
    by_id = {r['id']: r for r in rows}
    return by_id


conditions = [
    ('Old B1  (raw anchor, gpt-4o-mini, full-run archive)', 'registry-single-B1.jsonl'),
    ('Old B2E2 (enriched + stance caution, gpt-4o-mini)', 'registry-single-B2E2.jsonl'),
    ('Old D   (raw anchor, gpt-4o audit model)', 'registry-single-D.jsonl'),
    ('NEW B1-pilot  (raw anchor, gpt-5.6-luna)', 'registry-single-B1-pilot150-luna.jsonl'),
    ('NEW B2E-pilot (enriched, canonicals + prompt on gpt-5.6-luna)', 'registry-single-B2E-pilot150-luna.jsonl'),
    ('FIXED B1-pilot  (raw anchor, luna, reasoning headroom)', 'registry-single-B1-pilot150-luna-fixed.jsonl'),
    ('FIXED B2E-pilot (enriched, stance-preserving canonicals + headroom)', 'registry-single-B2E-pilot150-luna-fixed.jsonl'),
]

print(f'Pilot sample: {len(pilot)} triplets (stratified, fixed seed)\n')

# Cosine baseline restricted to pilot
cos = {r['id']: r for r in read_jsonl('cosines.jsonl') if r['id'] in pilot}
if cos:
    n = len(cos)
    raw_ok = sum(1 for r in cos.values() if r['cosRawMatch'] >= 0.6 and r['cosRawDistractor'] < 0.6)
    ctx_ok = sum(1 for r in cos.values() if r['cosCtxMatch'] >= 0.6 and r['cosCtxDistractor'] < 0.6)
    dis_p2 = sum(1 for r in cos.values() if r['cosCtxDistractor'] >= 0.6)
    dis_p1 = sum(1 for r in cos.values() if r['cosCtxDistractor'] >= 0.85)
    print(f'Cosine baseline (text-embedding-3-small), n={n} of pilot:')
    print(f'  pipeline-correct raw  (m>=0.6 & d<0.6): {fmt(raw_ok, n)}')
    print(f'  pipeline-correct ctx  (m>=0.6 & d<0.6): {fmt(ctx_ok, n)}')
    print(f'  distractor clears Pass-2 gate (ctx>=0.60): {fmt(dis_p2, n)}')
    print(f'  distractor clears Pass-1 gate (ctx>=0.85): {fmt(dis_p1, n)}')
    print()

results = {}
for label, fname in conditions:
    by_id = pilot_rows(fname)
    if not by_id:
        print(f'{label}:  — no rows yet ({fname})')
        continue
    n = len(by_id)
    k = sum(1 for r in by_id.values() if correct(r))
    mr = sum(1 for r in by_id.values() if attaches(r['match']))
    df = sum(1 for r in by_id.values() if attaches(r['distractor']))
    model = next(iter(by_id.values())).get('model', '?')
    results[fname] = by_id
    print(f'{label}  [model={model}]')
    print(f'  triplet accuracy : {fmt(k, n)}')
    print(f'  match recall     : {fmt(mr, n)}')
    print(f'  distractor false-attach: {fmt(df, n)}')
    print()

# Paired contrasts on shared ids
pairs = [
    ('registry-single-B1.jsonl', 'registry-single-B1-pilot150-luna.jsonl', 'Old B1 (4o-mini) vs NEW B1 (luna)'),
    ('registry-single-B2E2.jsonl', 'registry-single-B2E-pilot150-luna.jsonl', 'Old B2E2 (4o-mini) vs NEW B2E (luna)'),
    ('registry-single-B1-pilot150-luna.jsonl', 'registry-single-B2E-pilot150-luna.jsonl', 'NEW B1 vs NEW B2E'),
    ('registry-single-B2E-pilot150-luna.jsonl', 'registry-single-B2E-pilot150-luna-fixed.jsonl', 'NEW B2E (broken) vs FIXED B2E'),
    ('registry-single-B2E2.jsonl', 'registry-single-B2E-pilot150-luna-fixed.jsonl', 'Old B2E2 (4o-mini) vs FIXED B2E (luna)'),
    ('registry-single-B1-pilot150-luna.jsonl', 'registry-single-B1-pilot150-luna-fixed.jsonl', 'NEW B1 vs FIXED B1 (headroom only)'),
]
for a, b, label in pairs:
    if a not in results or b not in results:
        continue
    shared = set(results[a]) & set(results[b])
    b_only = sum(1 for i in shared if correct(results[a][i]) and not correct(results[b][i]))
    c_only = sum(1 for i in shared if not correct(results[a][i]) and correct(results[b][i]))
    p = mcnemar_exact(b_only, c_only)
    print(f'McNemar {label}: n={len(shared)}, discordant {b_only} vs {c_only}, p = {p:.3g}')

print('\nPaper reference (full 875, Blair-Procaccia-Tambe): DPT-tuned ST5-XL 80.0%; '
      'per-topic projection 81.1%; base ST5-XL 48.3%.')
