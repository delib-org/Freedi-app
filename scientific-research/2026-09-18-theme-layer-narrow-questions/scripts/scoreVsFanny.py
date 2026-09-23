"""
Score a machine clustering of Bq-VQPMPiG7b against Fanny's hand clustering.

Input: a JSON snapshot in the shape `fetch2.cjs` / the export scripts write:
  {"question": {...}, "children": [statement docs under the question], ...}
Only the 114 original participant statements are scored (the rows in Fanny's
file that are not machine cluster docs). Machine layers scored:

  theme  — the topic-cluster layer, membership read transitively (a synthesis
           inside a theme puts its members in that theme)
  syn    — the synthesis (merge-group) layer

Metrics per layer, over all C(114,2) pairs:
  prec — share of the machine's pairs Fanny also joins (a shared 2nd label counts)
  rec  — share of Fanny's pairs the machine also joins
  f1   — harmonic mean of the two
  ari  — Adjusted Rand Index with unclustered statements as clusters of one

Usage:
  python scoreVsFanny.py <snapshot.json> [--fanny <xlsx>] [--json <out.json>] [--dump]
"""
import argparse
import itertools
import json
import sys
from collections import Counter

import pandas as pd
from sklearn.metrics import adjusted_rand_score

FANNY_DEFAULT = '/Users/talyaron/Downloads/statements_full.xlsx'


def load_fanny(path):
    fan = pd.read_excel(path).iloc[1:]
    fan = fan[fan.iloc[:, 0].notna()].copy()
    fan.columns = ['id', 'text', 'f1', 'f2']
    fan['f1'] = fan.f1.astype(str).str.strip()
    fan['f2'] = fan.f2.fillna('').astype(str).str.strip().str.lstrip('ו')

    return fan


def machine_layers(children):
    """Return (theme_of, syn_of): statementId -> cluster title, read transitively."""
    ch = {c['statementId']: c for c in children}
    vis = [c for c in children if c.get('isCluster') and not c.get('hide')]
    topics = [c for c in vis if c.get('derivedByPipeline') != 'synthesis']
    syn = [c for c in vis if c.get('derivedByPipeline') == 'synthesis']

    # Distinct merge groups: drop exact duplicates and groups contained in a larger one.
    distinct = []
    for c in sorted(syn, key=lambda c: -len(c.get('integratedOptions') or [])):
        s = set(c.get('integratedOptions') or [])
        if any(s <= set(x['integratedOptions']) for x in distinct):
            continue
        distinct.append(c)
    syn_of = {}
    for c in distinct:
        for m in c['integratedOptions']:
            syn_of.setdefault(m, c['statementId'])

    top_of = {}
    for t in topics:
        for m in t.get('integratedOptions') or []:
            top_of.setdefault(m, t['statementId'])
            inner = ch.get(m)
            if inner and inner.get('isCluster'):
                for mm in inner.get('integratedOptions') or []:
                    top_of.setdefault(mm, t['statementId'])

    titles = {c['statementId']: c.get('statement', '') for c in vis}

    return top_of, syn_of, titles, topics, distinct


def pair_stats(O, col):
    n = len(O)
    labs = [set([r.fan]) | ({r.fan2} if r.fan2 else set()) for r in O.itertuples()]
    vals = list(O[col])
    mt = ft = both = 0
    for i, j in itertools.combinations(range(n), 2):
        m = vals[i] != '' and vals[i] == vals[j]
        f = bool(labs[i] & labs[j])
        mt += m
        ft += f
        both += m and f
    sing = [v if v else f'_s{i}' for i, v in enumerate(vals)]
    cov = sum(1 for v in vals if v)
    prec = both / mt if mt else 0
    rec = both / ft if ft else 0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0

    return dict(
        k=len(set(v for v in vals if v)),
        cov=cov,
        pairs=mt,
        prec=round(prec, 3),
        rec=round(rec, 3),
        f1=round(f1, 3),
        ari=round(adjusted_rand_score(list(O.fan), sing), 3),
    )


def score(snapshot_path, fanny_path=FANNY_DEFAULT, dump=False):
    d = json.load(open(snapshot_path))
    children = d['children']
    ch = {c['statementId']: c for c in children}
    fan = load_fanny(fanny_path)
    top_of, syn_of, titles, topics, distinct = machine_layers(children)

    rows = []
    for r in fan.itertuples():
        c = ch.get(r.id)
        if c is None or c.get('isCluster'):
            continue  # a machine cluster row, not participant input
        rows.append(dict(
            id=r.id, text=r.text, fan=r.f1, fan2=r.f2,
            theme=top_of.get(r.id, ''), syn=syn_of.get(r.id, ''),
        ))
    O = pd.DataFrame(rows)
    T = pair_stats(O, 'theme')
    S = pair_stats(O, 'syn')

    fsizes = O.fan.value_counts()
    theme_summary = []
    for t, g in O[O.theme != ''].groupby('theme'):
        c = Counter(g.fan)
        top = c.most_common(1)[0]
        theme_summary.append(dict(
            id=t, title=titles.get(t, ''), n=len(g), fanny_clusters=len(c),
            top_fanny=top[0], top_share=round(top[1] / len(g), 2),
        ))
    theme_summary.sort(key=lambda x: -x['n'])
    largest_share = max((x['n'] for x in theme_summary), default=0) / max(T['cov'], 1)

    out = dict(
        snapshot=snapshot_path,
        n=len(O),
        fanny=dict(k=int(fsizes.size), singletons=int((fsizes == 1).sum())),
        theme=T,
        syn=S,
        largest_theme_share_of_placed=round(largest_share, 3),
        unthemed=int((O.theme == '').sum()),
        themes=theme_summary,
    )
    if dump:
        out['rows'] = rows

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('snapshot')
    ap.add_argument('--fanny', default=FANNY_DEFAULT)
    ap.add_argument('--json')
    ap.add_argument('--dump', action='store_true')
    a = ap.parse_args()
    out = score(a.snapshot, a.fanny, a.dump)
    if a.json:
        json.dump(out, open(a.json, 'w'), ensure_ascii=False, indent=1)
    T, S = out['theme'], out['syn']
    print(f"n={out['n']}  Fanny k={out['fanny']['k']} (singletons {out['fanny']['singletons']})")
    print(f"THEME layer: k={T['k']} cov={T['cov']} pairs={T['pairs']} prec={T['prec']} rec={T['rec']} f1={T['f1']} ari={T['ari']}  largest share of placed={out['largest_theme_share_of_placed']} unthemed={out['unthemed']}")
    print(f"SYNTH layer: k={S['k']} cov={S['cov']} pairs={S['pairs']} prec={S['prec']} rec={S['rec']} f1={S['f1']} ari={S['ari']}")
    for t in out['themes']:
        print(f"  theme n={t['n']:3d} fannyK={t['fanny_clusters']:2d} top={t['top_share']:.2f} {t['title']}  <- {t['top_fanny']}")


if __name__ == '__main__':
    sys.exit(main())
