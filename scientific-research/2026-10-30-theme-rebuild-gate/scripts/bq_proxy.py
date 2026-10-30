"""
Bq-VQPMPiG7b proxy score for a theme rebuild. Fanny's 36-cluster partition is
no longer on disk, so scoreVsFanny.py cannot run. What exists is Fany's and
Tal's per-statement verdict "fits / does not fit its v3 theme"
(comparison_Fany_Tal.xlsx, via the refile study's bq_state.py).

Proxies, at statement level (a synthesis atom stands for its member statements):
  core_kept    share of pairs of human-ACCEPTED statements of the same v3 theme
               that the rebuild keeps in one theme (v3 itself: 1.0 by definition)
  misfit_split share of (flagged statement, accepted statement of its v3 theme)
               pairs the rebuild puts apart (v3 itself: 0.0 by definition)
plus theme count, Other/unthemed count and the largest theme's share of placed
statements (the catch-all symptom: v3 had one theme holding most ideas).

Prints aggregate numbers only; participant text stays out of git.

  usage: python3 -I scripts/bq_proxy.py <state.json> <flags.json> <rebuild.json> [...]
"""
import itertools
import json
import sys


def statement_themes(state, rebuild):
    members = {a['id']: a['memberIds'] for a in state['atoms']}
    theme_of = {}
    for t in rebuild['themes']:
        for atom_id in t['memberIds']:
            for sid in members[atom_id]:
                theme_of[sid] = t['key']

    return theme_of


def v3_summary(state, flags):
    sizes = {}
    for sid, f in flags.items():
        if f['v3Theme']:
            sizes[f['v3Theme']] = sizes.get(f['v3Theme'], 0) + 1
    placed = sum(sizes.values())

    return dict(themes=len(sizes), unthemed=len(flags) - placed,
                largest_share=round(max(sizes.values()) / placed, 3))


def proxy(state, flags, rebuild):
    theme_of = statement_themes(state, rebuild)
    by_v3 = {}
    for sid, f in flags.items():
        if f['v3Theme']:
            by_v3.setdefault(f['v3Theme'], []).append(sid)
    kept = core_pairs = split = mis_pairs = 0
    for sids in by_v3.values():
        core = [s for s in sids if not flags[s]['fanyMisfit'] and not flags[s]['talMisfit']]
        flagged = [s for s in sids if flags[s]['fanyMisfit'] or flags[s]['talMisfit']]
        for a, b in itertools.combinations(core, 2):
            core_pairs += 1
            kept += theme_of.get(a) is not None and theme_of.get(a) == theme_of.get(b)
        for m in flagged:
            for c in core:
                mis_pairs += 1
                split += theme_of.get(m) is None or theme_of.get(m) != theme_of.get(c)
    sizes = {}
    for t in theme_of.values():
        sizes[t] = sizes.get(t, 0) + 1
    placed = sum(sizes.values())

    return dict(themes=len(sizes), other_statements=len(flags) - placed,
                other_atoms=len(rebuild['otherIds']),
                largest_share=round(max(sizes.values()) / placed, 3) if placed else None,
                core_kept=round(kept / core_pairs, 3), misfit_split=round(split / mis_pairs, 3))


def main():
    state = json.load(open(sys.argv[1], encoding='utf8'))
    flags = json.load(open(sys.argv[2], encoding='utf8'))
    print('v3 (live):', json.dumps(v3_summary(state, flags)))
    for path in sys.argv[3:]:
        print(path.split('/')[-2], json.dumps(proxy(state, flags, json.load(open(path, encoding='utf8')))))


if __name__ == '__main__':
    main()
