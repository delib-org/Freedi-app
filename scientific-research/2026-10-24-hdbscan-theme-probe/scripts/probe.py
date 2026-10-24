"""
HDBSCAN theme probe — can density clustering on the synthesis embeddings
propose the theme partition?

Offline, no LLM calls. Exact precomputed-cosine HDBSCAN (the reference
configuration of the HDBSCAN implementation prompt, 2026-10-24):

  X  = L2-normalised atom vectors
  D  = clip(1 - X X^T, 0, 2), symmetric, zero diagonal
  hdbscan.HDBSCAN(metric="precomputed", algorithm="generic",
                  min_cluster_size=m, min_samples=s,
                  cluster_selection_method=eom|leaf, approx_min_span_tree=False)

Datasets
  EN / HE accuracy corpora (scripts/seedSynthBenchmark.accuracy100.{en,he}.json):
    100 statements = 50 paraphrase pairs ("synths") in 10 topics. Atom = one
    ground-truth synth, vector = mean of its two paraphrase vectors (the atom
    contract when synthesis is perfect — EN synth F1 is 1.000). Scored like
    score100.mjs's topic level: pairwise P/R/F1 + ARI over the 50 atoms.
    Also scored at statement level (100 raw statements, no synthesis).
  Bq-VQPMPiG7b (114 real Hebrew statements, narrow question). No ground truth
    on disk (Fanny's labels are gone), so structure only: headings, largest
    share, Other share, and agreement with the production v3 theme layer.

Noise (-1) = "Other". Pairwise scoring treats each noise atom as its own
singleton. A second variant files noise to the nearest cluster centroid — a
geometry-only stand-in for the prompt's "propose noise to existing scopes"
step (optimistic: no scope check refuses anything).

  usage: python -I probe.py <scratchpad-dir> <out-dir>
"""
import hashlib
import itertools
import json
import os
import sys
import time
import urllib.request

import hdbscan
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import adjusted_rand_score

REPO = '/Users/talyaron/Documents/Freedi-app'
PREFLIGHT = f'{REPO}/scripts/.cache/preflight-embeddings.jsonl'
HE_LARGE = f'{REPO}/scripts/.cache/he-large-embeddings.json'
CORPUS = f'{REPO}/scripts/seedSynthBenchmark.accuracy100.{{}}.json'

M_GRID = range(2, 11)
SELECTION = ('eom', 'leaf')
PERMUTATIONS = 10


# ---------- embeddings ----------

def api_key():
    for line in open(f'{REPO}/functions/.env', encoding='utf8'):
        k, _, v = line.strip().partition('=')
        if k.strip() == 'OPENAI_API_KEY':
            return v.strip().strip('"').strip("'")
    raise SystemExit('OPENAI_API_KEY missing')


def embed(keys, model, cache_file):
    """Embed with dimensions=1536, cached in the scratchpad (never in the preflight cache)."""
    cache = json.load(open(cache_file)) if os.path.exists(cache_file) else {}
    todo = [k for k in keys if k not in cache]
    for i in range(0, len(todo), 100):
        batch = todo[i:i + 100]
        req = urllib.request.Request(
            'https://api.openai.com/v1/embeddings',
            data=json.dumps({'model': model, 'dimensions': 1536, 'input': batch}).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key()}'},
        )
        for d in json.load(urllib.request.urlopen(req))['data']:
            cache[batch[d['index']]] = d['embedding']
    if todo:
        json.dump(cache, open(cache_file, 'w'))

    return cache


def load_preflight():
    out = {}
    for line in open(PREFLIGHT, encoding='utf8'):
        if line.strip():
            r = json.loads(line)
            out[r['key']] = r['vector']

    return out


def accuracy_corpus(lang, model, scratch):
    corpus = json.load(open(CORPUS.format(lang), encoding='utf8'))
    key = lambda t: f'Question: {corpus["questionText"]}\nAnswer: {t}'
    keys = [key(p) for t in corpus['topics'] for s in t['synths'] for p in s['paraphrases']]
    if model == 'text-embedding-3-small':
        cache = load_preflight()
    elif lang == 'he':
        cache = json.load(open(HE_LARGE, encoding='utf8'))
    else:
        cache = embed(keys, model, os.path.join(scratch, f'{lang}-large.json'))
    missing = [k for k in keys if k not in cache]
    if missing:
        cache.update(embed(missing, model, os.path.join(scratch, f'{lang}-{model}.json')))

    atoms, stmts = [], []
    for t in corpus['topics']:
        for s in t['synths']:
            vs = [np.array(cache[key(p)], dtype=float) for p in s['paraphrases']]
            atoms.append(dict(topic=t['name'], vec=np.mean(vs, axis=0)))
            stmts += [dict(topic=t['name'], vec=v) for v in vs]

    return atoms, stmts


# ---------- clustering ----------

def normalise(vecs):
    X = np.asarray(vecs, dtype=np.float64)
    if not np.all(np.isfinite(X)):
        raise ValueError('non-finite vector')
    n = np.linalg.norm(X, axis=1, keepdims=True)
    if np.any(n == 0):
        raise ValueError('zero-norm vector')

    return X / n


def cosine_distance(X):
    D = np.clip(1.0 - X @ X.T, 0.0, 2.0)
    D = (D + D.T) / 2.0
    np.fill_diagonal(D, 0.0)

    return D


def run_hdbscan(D, m, s, method):
    return hdbscan.HDBSCAN(
        metric='precomputed', algorithm='generic', min_cluster_size=m, min_samples=s,
        cluster_selection_method=method, approx_min_span_tree=False,
    ).fit_predict(D)


def file_noise_to_nearest(X, labels):
    """Geometry-only filing of Other: each noise atom joins the nearest cluster centroid."""
    out = labels.copy()
    ids = sorted(set(labels) - {-1})
    if not ids:
        return out
    C = normalise([X[labels == c].mean(axis=0) for c in ids])
    for i in np.where(labels == -1)[0]:
        out[i] = ids[int(np.argmax(C @ X[i]))]

    return out


# ---------- metrics ----------

def with_singletons(labels):
    return [f'n{i}' if l == -1 else f'c{l}' for i, l in enumerate(labels)]


def pairwise(truth, labels):
    pred = with_singletons(labels)
    tp = fp = fn = 0
    for i, j in itertools.combinations(range(len(truth)), 2):
        st, sp = truth[i] == truth[j], pred[i] == pred[j]
        tp += st and sp
        fp += sp and not st
        fn += st and not sp
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0

    return dict(p=round(p, 3), r=round(r, 3), f1=round(2 * p * r / (p + r), 3) if p + r else 0.0)


def structure(labels):
    n = len(labels)
    sizes = [int((labels == c).sum()) for c in sorted(set(labels) - {-1})]

    return dict(
        k=len(sizes), other=int((labels == -1).sum()), otherShare=round(float((labels == -1).mean()), 3),
        largestShare=round(max(sizes) / n, 3) if sizes else 0.0, sizes=sorted(sizes, reverse=True),
    )


def perfect_judge(truth, labels):
    """
    Ceiling of the prompt's design: HDBSCAN proposes, a PERFECT judge validates.
    Each cluster keeps only its majority-topic members (the rest go to Other);
    each Other atom is filed into the largest cluster of its own topic, if one
    exists. The judge may not repartition: two clusters of one topic stay apart,
    and a topic HDBSCAN never formed stays in Other.
    """
    out = labels.copy()
    major = {}
    for c in sorted(set(labels) - {-1}):
        members = [truth[i] for i in np.where(labels == c)[0]]
        major[c] = max(sorted(set(members)), key=members.count)
    for i, l in enumerate(labels):
        if l != -1 and truth[i] != major[l]:
            out[i] = -1
    sizes = {c: int((out == c).sum()) for c in major}
    for i in np.where(out == -1)[0]:
        home = [c for c in major if major[c] == truth[i]]
        if home:
            out[i] = max(home, key=lambda c: sizes[c])

    return out


def score(truth, labels, X):
    filed = file_noise_to_nearest(X, labels)
    judged = perfect_judge(truth, labels)

    return dict(
        **structure(labels),
        **pairwise(truth, labels), ari=round(adjusted_rand_score(truth, with_singletons(labels)), 3),
        filed=dict(**pairwise(truth, filed), ari=round(adjusted_rand_score(truth, with_singletons(filed)), 3)),
        perfectJudge=dict(**pairwise(truth, judged), ari=round(adjusted_rand_score(truth, with_singletons(judged)), 3),
                          other=int((judged == -1).sum())),
    )


def configs():
    for method in SELECTION:
        for m in M_GRID:
            for s in range(1, m + 1):
                yield dict(m=m, s=s, method=method)


def grid(X, truth):
    D = cosine_distance(X)
    rows = []
    for c in configs():
        labels = run_hdbscan(D, c['m'], c['s'], c['method'])
        rows.append(dict(**c, **(score(truth, labels, X) if truth else structure(labels))))

    return rows


# ---------- baselines ----------

def baselines(X, truth, k):
    """The geometry ceilings themeCeiling.mjs reported, recomputed on the same atoms."""
    S = X @ X.T
    same = [S[i, j] for i, j in itertools.combinations(range(len(truth)), 2) if truth[i] == truth[j]]
    diff = [S[i, j] for i, j in itertools.combinations(range(len(truth)), 2) if truth[i] != truth[j]]
    best = (0.0, 0.0)
    for cut in np.arange(0.5, 0.98, 0.005):
        tp, fp = sum(x >= cut for x in same), sum(x >= cut for x in diff)
        p, r = tp / (tp + fp) if tp + fp else 0, tp / len(same)
        f = 2 * p * r / (p + r) if p + r else 0
        best = max(best, (f, cut))
    agg = AgglomerativeClustering(n_clusters=k, metric='cosine', linkage='average').fit_predict(X)

    return dict(
        medianCosSame=round(float(np.median(same)), 3), medianCosDiff=round(float(np.median(diff)), 3),
        bestPairCut=dict(cut=round(float(best[1]), 3), f1=round(best[0], 3)),
        agglomerativeK=dict(k=k, **pairwise(truth, agg), ari=round(adjusted_rand_score(truth, agg), 3)),
    )


def permutation_stable(X, c):
    """Same snapshot, shuffled arrival order: memberships equal modulo label ids?"""
    base = run_hdbscan(cosine_distance(X), c['m'], c['s'], c['method'])
    rng = np.random.default_rng(42)
    worst = 1.0
    for _ in range(PERMUTATIONS):
        perm = rng.permutation(len(X))
        lab = run_hdbscan(cosine_distance(X[perm]), c['m'], c['s'], c['method'])
        back = np.empty_like(lab)
        back[perm] = lab
        worst = min(worst, adjusted_rand_score(with_singletons(base), with_singletons(back)))

    return round(float(worst), 4)


def pick(rows, key='f1'):
    return max(rows, key=lambda r: (r[key], r['ari'], -r['other']))


def cfg(r):
    return dict(m=r['m'], s=r['s'], method=r['method'])


def find(rows, c):
    return next(r for r in rows if cfg(r) == c)


# ---------- main ----------

def main():
    scratch, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    report = dict(
        versions=dict(hdbscan='0.8.40', numpy=np.__version__, python=sys.version.split()[0]),
        grid=dict(m=list(M_GRID), s='1..m', selection=list(SELECTION)),
        datasets={},
    )

    sets = {
        'en-3small': ('en', 'text-embedding-3-small'),
        'en-3large': ('en', 'text-embedding-3-large'),
        'he-3small': ('he', 'text-embedding-3-small'),
        'he-3large': ('he', 'text-embedding-3-large'),
    }
    grids = {}
    for name, (lang, model) in sets.items():
        try:
            atoms, stmts = accuracy_corpus(lang, model, scratch)
        except Exception as e:  # a missing cache is a reported gap, not a crash
            report['datasets'][name] = dict(error=str(e))
            continue
        for level, items in (('atoms', atoms), ('statements', stmts)):
            X = normalise([a['vec'] for a in items])
            truth = [a['topic'] for a in items]
            t0 = time.time()
            rows = grid(X, truth)
            best, best_filed = pick(rows), max(rows, key=lambda r: (r['filed']['f1'], r['filed']['ari']))
            grids[f'{name}/{level}'] = rows
            report['datasets'][f'{name}/{level}'] = dict(
                n=len(items), gridSeconds=round(time.time() - t0, 2),
                baselines=baselines(X, truth, 10),
                oracleBest=best, oracleBestFiled=best_filed,
                perfectJudgeCeiling=max(rows, key=lambda r: (r['perfectJudge']['f1'], r['perfectJudge']['ari'])),
                orderStableWorstARI=permutation_stable(X, cfg(best)),
            )

    # Honest transfer: tune on one corpus, apply unchanged to the other.
    transfer = {}
    for src, dst in (('en-3small/atoms', 'he-3large/atoms'), ('he-3large/atoms', 'en-3small/atoms'),
                     ('en-3large/atoms', 'he-3large/atoms')):
        if src in grids and dst in grids:
            c = cfg(pick(grids[src]))
            transfer[f'{src} -> {dst}'] = dict(config=c, result=find(grids[dst], c))
    report['transfer'] = transfer

    # Bq: structure only, plus agreement with the production v3 theme layer.
    bq = json.load(open(os.path.join(scratch, 'bq-large.json'), encoding='utf8'))['rows']
    X = normalise([r['vector'] for r in bq])
    v3 = [r['v3Theme'] or f'_u{i}' for i, r in enumerate(bq)]
    rows = grid(X, None)
    D = cosine_distance(X)
    bq_out = dict(n=len(bq), v3=dict(k=len({r['v3Theme'] for r in bq if r['v3Theme']}),
                                     unthemed=sum(1 for r in bq if not r['v3Theme'])))
    S = X @ X.T
    off = S[np.triu_indices(len(bq), 1)]
    bq_out['cosine'] = dict(median=round(float(np.median(off)), 3), p10=round(float(np.percentile(off, 10)), 3),
                            p90=round(float(np.percentile(off, 90)), 3))
    for name in transfer:
        c = transfer[name]['config']
        lab = run_hdbscan(D, c['m'], c['s'], c['method'])
        bq_out[f'config from {name.split(" ")[0]}'] = dict(config=c, **structure(lab),
                                                           ariVsV3=round(adjusted_rand_score(v3, with_singletons(lab)), 3))
    # Across the whole grid: how often does density give >=5 headings with Other <= 30%?
    usable = [r for r in rows if r['k'] >= 5 and r['otherShare'] <= 0.30 and r['largestShare'] <= 0.40]
    bq_out['gridSummary'] = dict(
        configs=len(rows), usable=len(usable),
        usableDefinition='k>=5 and Other<=30% and largest<=40% of all statements',
        examples=sorted(usable, key=lambda r: r['otherShare'])[:5],
        kRange=[min(r['k'] for r in rows), max(r['k'] for r in rows)],
        minOtherShare=min(r['otherShare'] for r in rows),
    )
    for r in sorted(rows, key=lambda r: (r['otherShare'], -r['k']))[:1]:
        lab = run_hdbscan(D, r['m'], r['s'], r['method'])
        bq_out['leastOther'] = dict(config=cfg(r), **structure(lab),
                                    ariVsV3=round(adjusted_rand_score(v3, with_singletons(lab)), 3))
    report['bq'] = bq_out

    digest = hashlib.sha256(json.dumps(report, sort_keys=True, default=str).encode()).hexdigest()[:12]
    report['digest'] = digest
    json.dump(report, open(os.path.join(out_dir, 'results.json'), 'w'), indent=1, default=str)
    json.dump({k: v for k, v in grids.items()}, open(os.path.join(out_dir, 'grid.json'), 'w'), default=str)
    print(json.dumps(report, indent=1, default=str))


if __name__ == '__main__':
    main()
