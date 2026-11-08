#!/usr/bin/env python3
"""Scores the chapter test against PREREGISTRATION.md. Output holds theme ids, model-coined chapter
names and aggregates only (no resident text).
usage: python3 -I score.py <rawDir> <studyDir> <outJson>      (rawDir/chapter-test/ holds inputs + raw results)
       python3 -I score.py --selftest
"""
import json, sys, random, itertools, statistics as S, collections as C

SEED = 20261102
PERMS = 5000
UMBRELLAS = {  # her five umbrella topics, by the topic name in data/sigal_partition.json
    'IqKVla0ZHw-m': ['חזות הישוב', 'תרבות קהילתית'],
    'WfkDISMmbduQ': ['בינוי קהילה', 'שיח ציבורי', 'שיפור פני הכפר'],
}
T = dict(J=0.50, P_SIG=0.05, SIG_UNITS=0.80, PPV=0.25, K=0.15, LARGEST=0.40, COUNT_MAX=0.85, COUNT_MIN=4,
         UMB_FRAC=0.60, UMB_NEED=3, UMB_RUNS=0.60, ARI_STAB=0.70, COST=0.25)
BASE_UMB_RECOVER = 0.60  # share of an umbrella's members that must sit in one chapter, and share of that chapter they must make


def comb2(n): return n * (n - 1) // 2


def ari(a, b):
    """Adjusted Rand index of two label lists of equal length."""
    n = len(a); cont = C.Counter(zip(a, b)); ra = C.Counter(a); rb = C.Counter(b)
    s = sum(comb2(v) for v in cont.values()); sa = sum(comb2(v) for v in ra.values()); sb = sum(comb2(v) for v in rb.values())
    exp = sa * sb / comb2(n); mx = (sa + sb) / 2
    return 1.0 if mx == exp else (s - exp) / (mx - exp)


def pair_stats(chap, hers):
    """chap, hers: label lists. Returns joined-recall J, kept-apart false-join K, precision of joins PPV, counts."""
    n = len(chap); hj = hk = bj = bk = 0
    for i, j in itertools.combinations(range(n), 2):
        h = hers[i] == hers[j]; m = chap[i] == chap[j]
        if h: hj += 1; bj += m
        else: hk += 1; bk += m
    joins = bj + bk
    return dict(joinedHers=hj, joinedBoth=bj, apartHers=hk, falseJoins=bk,
                J=bj / hj if hj else None, K=bk / hk if hk else None, PPV=bj / joins if joins else None)


def umbrella_recovered(chap, members):
    """members: theme indexes of one umbrella. Recovered if one chapter holds >=60% of them and they are >=60% of it."""
    need = -(-int(BASE_UMB_RECOVER * 100) * len(members) // 100)
    for c, cnt in C.Counter(chap[i] for i in members).items():
        size = sum(1 for x in chap if x == c)
        if cnt >= need and cnt / size >= BASE_UMB_RECOVER: return True
    return False


def shuffled_like(chap, rnd):
    lab = list(chap); rnd.shuffle(lab); return lab


def run_metrics(chap, hers, umbs):
    ps = pair_stats(chap, hers)
    sizes = C.Counter(chap)
    return dict(**ps, chapters=len(sizes), largest=max(sizes.values()), ari=ari(chap, hers),
                umbrellas=[umbrella_recovered(chap, m) for m in umbs])


def null_for(chap, hers, umbs, rnd):
    """Random groupings with the same chapter-size distribution. Returns mean and 95th pct of joinedBoth, J,K,PPV, ARI, umbrellas."""
    rows = [run_metrics(shuffled_like(chap, rnd), hers, umbs) for _ in range(PERMS)]
    real = pair_stats(chap, hers)['joinedBoth']
    p = (1 + sum(r['joinedBoth'] >= real for r in rows)) / (1 + PERMS)
    def m(k): v = [r[k] for r in rows if r[k] is not None]; return round(S.mean(v), 3) if v else None
    return dict(p=round(p, 4), J=m('J'), K=m('K'), PPV=m('PPV'), ari=m('ari'),
                ari95=round(sorted(r['ari'] for r in rows)[int(.95 * PERMS)], 3),
                umbrellasMean=round(S.mean(sum(r['umbrellas']) for r in rows), 3))


def parse_chapters(text, keys):
    """Returns chapter label list aligned to keys, plus names; raises if not a valid partition."""
    j = json.loads(text); lab = {}; names = []
    for ci, c in enumerate(j['chapters']):
        names.append(c['name'])
        for k in c['topics']:
            if k not in keys: raise ValueError(f'unknown topic {k}')
            if k in lab: raise ValueError(f'topic {k} twice')
            lab[k] = ci
    missing = [k for k in keys if k not in lab]
    if missing: raise ValueError(f'missing {missing}')
    return [lab[k] for k in keys], names


def score(raw, study, out):
    P = json.load(open(f'{study}/data/sigal_partition.json'))
    R = json.load(open(f'{raw}/chapter-test/raw-results.json'))
    rnd = random.Random(SEED); res = dict(thresholds=T, perms=PERMS, seed=SEED, questions={}, arms={})
    qinfo = {}
    for q in UMBRELLAS:
        inp = json.load(open(f'{raw}/chapter-test/input-{q}.json'))
        tid = [t['themeId'] for t in inp['themes']]; keys = [t['key'] for t in inp['themes']]
        topic = {t['themeId']: t['topic'] for t in P[q]['themes']}
        hers = [topic[i] for i in tid]
        umbs = [[i for i, h in enumerate(hers) if h == u] for u in UMBRELLAS[q]]
        qinfo[q] = dict(tid=tid, keys=keys, hers=hers, umbs=umbs, labels={t['themeId']: t['label'] for t in inp['themes']})
        n = len(tid)
        res['questions'][q] = dict(themes=n, hersTopics=len(set(hers)), umbrellas={u: [tid[i] for i in m] for u, m in zip(UMBRELLAS[q], umbs)},
            ungrouped=dict(chapters=n, **{k: v for k, v in pair_stats(list(range(n)), hers).items() if k in ('J', 'K', 'PPV')}),
            allInOne=dict(chapters=1, **{k: v for k, v in pair_stats([0] * n, hers).items() if k in ('J', 'K', 'PPV')}))
    for arm in ('neutral', 'professional'):
        A = dict(runs=[], cost=[], errors=0, invalid=0)
        for q in UMBRELLAS:
            I = qinfo[q]; runs = sorted([r for r in R if r['q'] == q and r['arm'] == arm], key=lambda r: r['r'])
            labs = []
            for r in runs:
                if r.get('error'): A['errors'] += 1; continue
                A['cost'].append(r['usd'])
                try: lab, names = parse_chapters(r['text'], I['keys'])
                except Exception as e:
                    A['invalid'] += 1; A['runs'].append(dict(q=q, r=r['r'], invalid=str(e)[:80])); continue
                labs.append(lab)
                m = run_metrics(lab, I['hers'], I['umbs']); nl = null_for(lab, I['hers'], I['umbs'], rnd)
                A['runs'].append(dict(q=q, r=r['r'], chapters=m['chapters'], largest=m['largest'], largestShare=round(m['largest'] / len(lab), 3),
                    J=m['J'], K=m['K'], PPV=m['PPV'], joinedBoth=m['joinedBoth'], joinedHers=m['joinedHers'], falseJoins=m['falseJoins'], apartHers=m['apartHers'],
                    ari=round(m['ari'], 3), umbrellasRecovered=m['umbrellas'], permP=nl['p'], null=nl,
                    chapterNames=names, assignment={I['tid'][i]: lab[i] for i in range(len(lab))}))
            stab = [ari(a, b) for a, b in itertools.combinations(labs, 2)]
            nullstab = []
            for _ in range(300):
                a, b = (shuffled_like(labs[0], rnd), shuffled_like(labs[1], rnd)) if len(labs) > 1 else ([0], [0])
                nullstab.append(ari(a, b))
            A.setdefault('stability', {})[q] = dict(meanPairwiseAri=round(S.mean(stab), 3) if stab else None, min=round(min(stab), 3) if stab else None,
                                                    randomMeanAri=round(S.mean(nullstab), 3), valid=len(labs))
        res['arms'][arm] = A
        ok = [r for r in A['runs'] if 'invalid' not in r]
        pool = lambda k: sum(r[k] for r in ok)
        J = pool('joinedBoth') / pool('joinedHers'); K = pool('falseJoins') / pool('apartHers')
        PPV = pool('joinedBoth') / max(1, pool('joinedBoth') + pool('falseJoins'))
        nulls = [r['null'] for r in ok]
        umb_rate = []
        for ui in range(sum(len(v) for v in UMBRELLAS.values())):
            hits = 0; tot = 0
            for q in UMBRELLAS:
                off = sum(len(UMBRELLAS[x]) for x in list(UMBRELLAS)[:list(UMBRELLAS).index(q)])
                if off <= ui < off + len(UMBRELLAS[q]):
                    rr = [r for r in ok if r['q'] == q]; tot = len(rr)
                    hits = sum(r['umbrellasRecovered'][ui - off] for r in rr)
            umb_rate.append((hits, tot))
        n_ok_per_q = {q: len([r for r in ok if r['q'] == q]) for q in UMBRELLAS}
        umb_pass = sum(1 for h, t in umb_rate if t and h / t >= T['UMB_RUNS'])
        ratio = [r['chapters'] / res['questions'][r['q']]['themes'] for r in ok]
        cnt_ok = all(T['COUNT_MIN'] <= r['chapters'] for r in ok) and S.mean(ratio) <= T['COUNT_MAX']
        crit = {
            'C1a_recall_of_her_joins': dict(value=round(J, 3), need=f">= {T['J']}", baselineRandom=round(S.mean(n['J'] for n in nulls), 3), ungrouped=0.0, passed=J >= T['J']),
            'C1b_beats_random_permutation': dict(value=f"{sum(r['permP'] < T['P_SIG'] for r in ok)}/{len(ok)} runs p<{T['P_SIG']}", need=f">= {T['SIG_UNITS']:.0%} of runs", passed=len(ok) > 0 and sum(r['permP'] < T['P_SIG'] for r in ok) / len(ok) >= T['SIG_UNITS']),
            'C2_precision_of_joins': dict(value=round(PPV, 3), need=f">= {T['PPV']}", baselineRandom=round(S.mean(n['PPV'] for n in nulls if n['PPV'] is not None), 3), passed=PPV >= T['PPV']),
            'C3a_false_joins_of_pairs_she_kept_apart': dict(value=round(K, 3), need=f"<= {T['K']}", baselineRandom=round(S.mean(n['K'] for n in nulls), 3), allInOne=1.0, passed=K <= T['K']),
            'C3b_largest_chapter_share': dict(value=round(max(r['largestShare'] for r in ok), 3), need=f"<= {T['LARGEST']} in every run", passed=all(r['largestShare'] <= T['LARGEST'] for r in ok)),
            'C4_umbrellas_recovered': dict(value=f"{umb_pass} of 5 (per umbrella hits/runs: {umb_rate})", need=f">= {T['UMB_NEED']} of 5, each in >= {T['UMB_RUNS']:.0%} of runs", baselineRandomMean=round(S.mean(n['umbrellasMean'] for n in nulls), 3), passed=umb_pass >= T['UMB_NEED']),
            'C5_stability_pairwise_ari': dict(value={q: A['stability'][q]['meanPairwiseAri'] for q in UMBRELLAS}, need=f">= {T['ARI_STAB']} on each question", baselineRandom={q: A['stability'][q]['randomMeanAri'] for q in UMBRELLAS}, passed=all((A['stability'][q]['meanPairwiseAri'] or 0) >= T['ARI_STAB'] for q in UMBRELLAS)),
            'C6_chapter_count': dict(value=dict(meanRatioToThemes=round(S.mean(ratio), 3), min=min(r['chapters'] for r in ok)), need=f"mean chapters/themes <= {T['COUNT_MAX']} and >= {T['COUNT_MIN']} chapters", hers={q: res['questions'][q]['hersTopics'] for q in UMBRELLAS}, passed=cnt_ok),
            'C7_cost_per_run_usd': dict(value=round(S.mean(A['cost']), 4) if A['cost'] else None, need=f"<= {T['COST']}", passed=bool(A['cost']) and S.mean(A['cost']) <= T['COST']),
            'C8_valid_runs': dict(value=f"{len(ok)} valid, {A['invalid']} invalid, {A['errors']} errors", need="all runs valid (any invalid run counts as a failure)", passed=A['invalid'] == 0 and A['errors'] == 0),
        }
        A['criteria'] = crit; A['allPassed'] = all(c['passed'] for c in crit.values())
        A['pooled'] = dict(J=round(J, 3), K=round(K, 3), PPV=round(PPV, 3), arisVsHers=round(S.mean(r['ari'] for r in ok), 3), randomAriMean=round(S.mean(n['ari'] for n in nulls), 3), random95Ari=round(S.mean(n['ari95'] for n in nulls), 3))
        A['costTotal'] = round(sum(A['cost']), 4)
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({a: dict(allPassed=res['arms'][a]['allPassed'], pooled=res['arms'][a]['pooled'], criteria={k: v['passed'] for k, v in res['arms'][a]['criteria'].items()}) for a in res['arms']}, ensure_ascii=False, indent=1))


def selftest():
    """No LLM: checks the metrics on degenerate groupings so the thresholds are known to reject them."""
    hers = ['a'] * 4 + ['b'] * 3 + [str(i) for i in range(9)]  # 16 themes, two umbrellas of 4 and 3
    n = len(hers); rnd = random.Random(1)
    umbs = [[0, 1, 2, 3], [4, 5, 6]]
    for name, chap in [('ungrouped', list(range(n))), ('all-in-one', [0] * n), ('her own', [0] * 4 + [1] * 3 + list(range(2, 11))),
                       ('random same sizes', shuffled_like([0] * 4 + [1] * 3 + list(range(2, 11)), rnd))]:
        m = run_metrics(chap, hers, umbs)
        print(name, {k: (round(v, 2) if isinstance(v, float) else v) for k, v in m.items() if k in ('J', 'K', 'PPV', 'chapters', 'largest', 'ari', 'umbrellas')})


if __name__ == '__main__':
    if sys.argv[1] == '--selftest': selftest()
    else: score(sys.argv[1], sys.argv[2], sys.argv[3])
