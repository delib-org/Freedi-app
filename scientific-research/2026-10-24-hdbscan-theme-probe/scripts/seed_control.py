"""
Control for the perfect-judge ceiling: does HDBSCAN seeding beat cheap
agglomerative seeding when the same perfect judge validates and files?

  usage: python -I seed_control.py <scratchpad-dir> <out.json>
"""
import json
import sys

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import adjusted_rand_score

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from probe import accuracy_corpus, normalise, pairwise, perfect_judge, with_singletons  # noqa: E402


def main():
    scratch, out = sys.argv[1], sys.argv[2]
    res = {}
    for name, lang, model in (('en-3small', 'en', 'text-embedding-3-small'), ('en-3large', 'en', 'text-embedding-3-large'),
                              ('he-3small', 'he', 'text-embedding-3-small'), ('he-3large', 'he', 'text-embedding-3-large')):
        atoms, _ = accuracy_corpus(lang, model, scratch)
        X = normalise([a['vec'] for a in atoms])
        truth = [a['topic'] for a in atoms]
        for k in (5, 10, 15, 20, 25):
            lab = AgglomerativeClustering(n_clusters=k, metric='cosine', linkage='average').fit_predict(X)
            j = perfect_judge(truth, lab)
            res[f'{name}/atoms agg k={k}'] = dict(**pairwise(truth, j), ari=round(adjusted_rand_score(truth, with_singletons(j)), 3))
    json.dump(res, open(out, 'w'), indent=1)
    for k, v in res.items():
        print(f'{k:28s} perfect-judge F1 {v["f1"]} ARI {v["ari"]}')


if __name__ == '__main__':
    main()
