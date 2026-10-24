"""
Build the production v3 Bq-VQPMPiG7b theme state from comparison_Fany_Tal.xlsx
for refile.mjs --state, plus the human fit flags for scoring.

Columns: statementId, text, theme (אשכול), synthesis title (תיאור), Fany misfit,
Tal misfit, status. Atoms are reconstructed as the production pipeline holds
them: one atom per synthesis title (its members' texts in order), one atom per
standalone statement. Theme descriptions are not in the file, so the judge sees
titles + contents only (a small deviation from production, which also passes
the description).

Writes participant text — OUTSIDE git.

  usage: python -I bq_state.py <state.json> <flags.json>
"""
import json
import sys

import openpyxl

COMPARISON = '/Users/talyaron/Downloads/comparison_Fany_Tal.xlsx'
BQ_RUN = '/Users/talyaron/Documents/Freedi-app/scientific-research/2026-08-18-live-synth-accuracy/runs/bq-replay-themefix/statements.json'


def main():
    state_out, flags_out = sys.argv[1], sys.argv[2]
    ws = openpyxl.load_workbook(COMPARISON, read_only=True).worksheets[0]
    rows = [r for r in list(ws.iter_rows(values_only=True))[1:] if r[0]]
    atoms, themes, flags = {}, {}, {}
    for r in rows:
        sid, text, theme, synth = str(r[0]), str(r[1]).strip(), r[2], r[3]
        # a synthesis title shared by several rows is one atom; otherwise the statement is its own atom
        atom_id = f'syn:{theme}:{synth}' if synth else sid
        if atom_id not in atoms:
            atoms[atom_id] = dict(id=atom_id, title=synth or text, kind='synth' if synth else 'option', memberIds=[])
        atoms[atom_id]['memberIds'].append(sid)
        if theme:
            t = themes.setdefault(theme, dict(id=f't{len(themes) + 1}', title=theme, atomIds=[]))
            if atom_id not in t['atomIds']:
                t['atomIds'].append(atom_id)
        flags[sid] = dict(atomId=atom_id, v3Theme=theme, fanyMisfit=str(r[4]) == '1', talMisfit=str(r[5]) == '1')
    question = json.load(open(BQ_RUN, encoding='utf8'))['question']
    json.dump(dict(question=question, atoms=list(atoms.values()), themes=list(themes.values())),
              open(state_out, 'w'), ensure_ascii=False)
    json.dump(flags, open(flags_out, 'w'), ensure_ascii=False)
    singles = sum(1 for a in atoms.values() if a['kind'] == 'option')
    print(f'{len(rows)} statements -> {len(atoms)} atoms ({len(atoms) - singles} syntheses, {singles} standalone), {len(themes)} themes')


if __name__ == '__main__':
    main()
