"""
Embed the 114 Bq-VQPMPiG7b participant statements the way production does for
that question: text-embedding-3-large @1536, "Question: <q>\nAnswer: <text>".

Source: comparison_Fany_Tal.xlsx (the 114 originals, each with the production
v3 theme and Fany's / Tal's "does not fit" flags). Fanny's own hand clustering
(statements_full.xlsx, 4 columns) is no longer on disk — that file now holds
id + text only — so Bq is scored structurally, not against her labels.

Writes OUTSIDE git (participant data): pass the output path.

  usage: python embed_bq.py <out.json>
"""
import json
import sys
import urllib.request

import openpyxl

REPO = '/Users/talyaron/Documents/Freedi-app'
COMPARISON = '/Users/talyaron/Downloads/comparison_Fany_Tal.xlsx'
BQ_RUN = f'{REPO}/scientific-research/2026-08-18-live-synth-accuracy/runs/bq-replay-themefix/statements.json'


def api_key():
    for line in open(f'{REPO}/functions/.env', encoding='utf8'):
        k, _, v = line.strip().partition('=')
        if k.strip() == 'OPENAI_API_KEY':
            return v.strip().strip('"').strip("'")
    raise SystemExit('OPENAI_API_KEY missing')


def load_rows():
    ws = openpyxl.load_workbook(COMPARISON, read_only=True).worksheets[0]
    out = []
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if not r[0]:
            continue
        out.append(dict(
            id=str(r[0]), text=str(r[1]).strip(), v3Theme=str(r[2] or ''),
            fanyMisfit=str(r[4]) == '1', talMisfit=str(r[5]) == '1',
        ))

    return out


def main():
    out = sys.argv[1]
    question = json.load(open(BQ_RUN, encoding='utf8'))['question']
    rows = load_rows()
    inputs = [f'Question: {question}\nAnswer: {r["text"]}' for r in rows]
    req = urllib.request.Request(
        'https://api.openai.com/v1/embeddings',
        data=json.dumps({'model': 'text-embedding-3-large', 'dimensions': 1536, 'input': inputs}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key()}'},
    )
    for d in json.load(urllib.request.urlopen(req))['data']:
        rows[d['index']]['vector'] = d['embedding']
    json.dump({'model': 'text-embedding-3-large', 'dimensions': 1536, 'question': question, 'rows': rows}, open(out, 'w'))
    print(f'embedded {len(rows)} statements -> {out}')


if __name__ == '__main__':
    main()
