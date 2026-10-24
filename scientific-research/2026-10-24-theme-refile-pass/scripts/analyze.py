"""
Post-hoc views of refile.mjs output, no new judge calls:

  file-only  — apply only pass 1's decisions for UNTHEMED atoms (never move a
               themed one); written as a scoreable run dir `pass1-fileonly`.
  ping-pong  — over passes 1..N, how many moves send an atom back to a theme
               it was already in (oscillation rather than convergence).
  Bq         — with --bq-flags: are the atoms the judge moves the ones Fany
               and Tal flagged as not fitting their v3 theme?

  usage: python -I analyze.py <results-dir> [--bq <refile-out> <flags.json>]
"""
import json
import os
import shutil
import sys


def file_only(run_dir):
    log = json.load(open(os.path.join(run_dir, 'refile-log.json')))
    src = os.path.join(run_dir, 'pass0')
    dst = os.path.join(run_dir, 'pass1-fileonly')
    os.makedirs(dst, exist_ok=True)
    shutil.copy(os.path.join(src, 'statements.json'), dst)
    res = json.load(open(os.path.join(src, 'results.json')))
    synth_ids = {s['id'] for s in res['synths']['items'] if not s.get('hidden')}
    by_id = {t['id']: t for t in res['topicClusters']['items']}
    for m in log['passes'][0]['moves']:
        if m['from'] is not None:
            continue
        t = by_id[m['to']]
        if m['atomId'] in synth_ids:
            t['memberSynthIds'].append(m['atomId'])
        else:
            t['members'].append({'id': m['atomId']})
    json.dump(res, open(os.path.join(dst, 'results.json'), 'w'), indent=1)


def ping_pong(log):
    history, moves, back = {}, 0, 0
    for p in log['passes']:
        for m in p['moves']:
            seen = history.setdefault(m['atomId'], [m['from']])
            if m['from'] is not None:
                moves += 1
                back += m['to'] in seen
            seen.append(m['to'])

    return dict(themedMoves=moves, returnsToEarlierTheme=back)


def bq(out_dir, flags_path):
    log = json.load(open(os.path.join(out_dir, 'refile-log.json')))
    flags = json.load(open(flags_path))
    members = {}
    for sid, f in flags.items():
        members.setdefault(f['atomId'], []).append(f)

    def label(f):
        if f['fanyMisfit'] and f['talMisfit']:
            return 'bothMisfit'
        if f['fanyMisfit'] or f['talMisfit']:
            return 'oneMisfit'

        return 'bothFit'

    themed = [f for f in flags.values() if f['v3Theme']]
    base = {k: sum(1 for f in themed if label(f) == k) for k in ('bothFit', 'oneMisfit', 'bothMisfit')}
    moved = {}
    for m in log['passes'][0]['moves']:
        if m['from'] is None:
            continue
        for f in members[m['atomId']]:
            moved[label(f)] = moved.get(label(f), 0) + 1
    filed = sum(len(members[m['atomId']]) for m in log['passes'][0]['moves'] if m['from'] is None)
    unthemed = sum(1 for f in flags.values() if not f['v3Theme'])

    return dict(
        statementsByHumanFlag=base,
        movedInPass1ByHumanFlag=moved,
        moveRate={k: round(moved.get(k, 0) / base[k], 3) if base[k] else None for k in base},
        unthemedStatements=unthemed, unthemedFiledInPass1=filed,
        passes=[dict(p=p['pass'], moved=p['keep']['moved'], filed=p['keep']['filed'], sizes=p['keep']['sizes'],
                     unthemedAtoms=p['keep']['unthemedAtoms']) for p in log['passes']],
        pingPong=ping_pong(log),
    )


def main():
    results = sys.argv[1]
    report = {}
    for run in sorted(os.listdir(results)):
        d = os.path.join(results, run)
        if os.path.isdir(d) and os.path.exists(os.path.join(d, 'refile-log.json')):
            file_only(d)
            report[run] = ping_pong(json.load(open(os.path.join(d, 'refile-log.json'))))
    if '--bq' in sys.argv:
        i = sys.argv.index('--bq')
        report['bq'] = bq(sys.argv[i + 1], sys.argv[i + 2])
    json.dump(report, open(os.path.join(results, 'analysis.json'), 'w'), indent=1)
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
