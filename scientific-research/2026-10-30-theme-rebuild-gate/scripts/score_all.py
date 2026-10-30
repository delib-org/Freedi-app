"""
Score every live / rebuild pair under results/<tag>/<run>/ with the official
score100.mjs and write results/summary.json plus a markdown table.

  usage: python3 -I scripts/score_all.py <tag> [<tag> ...]
Rules (both reported):
  strict  mean rebuild topic F1 >= 0.80 AND rebuild >= live in every attempt
  paired  mean rebuild topic F1 >= 0.80 AND mean of the repeats >= live in every run
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.dirname(HERE)
SCORER = os.path.join(STUDY, '..', '2026-08-18-live-synth-accuracy', 'score100.mjs')
RUNS = [
    'en-seed42-themefix', 'en-seed42-consolidated', 'en-seed7-consolidated',
    'en-seed1234-consolidated', 'en-seed42-filingfix', 'he-seed42-large-formulation',
    'he-seed42-large-judgedattach', 'he-seed42-large-recall',
]
GATE_MEAN = 0.80


def score(folder):
    out = subprocess.run(['node', SCORER, folder, '--json'], capture_output=True, text=True, check=True).stdout
    d = json.loads(out)

    return dict(synth_f1=round(d['synth']['f1'], 3), topic_f1=round(d['topic']['f1'], 3),
                topic_p=round(d['topic']['precision'], 3), topic_r=round(d['topic']['recall'], 3),
                themes=d['topic']['producedCount'])


def main():
    tags = sys.argv[1:]
    rows, usd = [], 0.0
    for run in RUNS:
        row = dict(run=run, rebuild={})
        for tag in tags:
            base = os.path.join(STUDY, 'results', tag, run)
            if not os.path.exists(os.path.join(base, 'rebuild-log.json')):
                continue
            log = json.load(open(os.path.join(base, 'rebuild-log.json')))
            usd += log['usd']
            if 'live' not in row:
                row['live'] = score(os.path.join(base, 'live'))
            row['rebuild'][tag] = dict(score(os.path.join(base, 'rebuild')), other=log['otherCount'])
        rows.append(row)

    lines = ['| run | live topic F1 (themes) | ' + ' | '.join(f'{t} topic F1 (themes, Other)' for t in tags)
             + ' | mean of repeats | synth F1 live / rebuild |', '|' + '---|' * (len(tags) + 4)]
    paired_ok = True
    means = {t: [] for t in tags}
    every_ge = {t: True for t in tags}
    live_all = []
    for r in rows:
        live = r['live']
        live_all.append(live['topic_f1'])
        cells = []
        synth_rb = set()
        for t in tags:
            x = r['rebuild'].get(t)
            if not x:
                cells.append('—')
                continue
            means[t].append(x['topic_f1'])
            every_ge[t] &= x['topic_f1'] >= live['topic_f1']
            synth_rb.add(x['synth_f1'])
            cells.append(f"{x['topic_f1']:.3f} ({x['themes']}, {x['other']})")
        reps = [r['rebuild'][t]['topic_f1'] for t in tags if t in r['rebuild']]
        cell_mean = sum(reps) / len(reps)
        paired_ok &= cell_mean >= live['topic_f1']
        lines.append(f"| {r['run']} | {live['topic_f1']:.3f} ({live['themes']}) | " + ' | '.join(cells)
                     + f" | {cell_mean:.3f} | {live['synth_f1']:.3f} / {'/'.join(f'{s:.3f}' for s in sorted(synth_rb))} |")
    mean = lambda xs: sum(xs) / len(xs) if xs else float('nan')
    overall = mean([x for t in tags for x in means[t]])
    lines.append(f"| **mean** | **{mean(live_all):.3f}** | " + ' | '.join(f'**{mean(means[t]):.3f}**' for t in tags)
                 + f' | **{overall:.3f}** | |')
    gate = {t: dict(mean=round(mean(means[t]), 3), every_run_ge_live=every_ge[t],
                    passed=mean(means[t]) >= GATE_MEAN and every_ge[t]) for t in tags}
    gate['strict_all'] = all(g['passed'] for g in gate.values())
    gate['paired'] = dict(overall_mean=round(overall, 3), every_cell_mean_ge_live=paired_ok,
                          passed=overall >= GATE_MEAN and all(mean(means[t]) >= GATE_MEAN for t in tags) and paired_ok)
    table = '\n'.join(lines)
    print(table)
    print(json.dumps(gate, indent=1))
    print(f'LLM cost of these runs: ${usd:.4f}')
    name = '-'.join(tags)
    json.dump(dict(rows=rows, gate=gate, usd=round(usd, 4)), open(os.path.join(STUDY, 'results', f'summary-{name}.json'), 'w'), indent=1)
    open(os.path.join(STUDY, 'results', f'summary-{name}.md'), 'w').write(table + '\n')


if __name__ == '__main__':
    main()
