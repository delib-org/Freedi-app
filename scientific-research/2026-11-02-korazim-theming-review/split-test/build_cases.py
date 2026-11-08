#!/usr/bin/env python3
"""Builds the test cases. Output holds resident text and goes OUTSIDE the repo.
usage: python3 -I build_cases.py <rawDir> <studyDir> <repoRoot>"""
import json,sys,random,itertools,collections as C
RAW,ST,REPO=sys.argv[1:4]; T=f'{RAW}/split-test'
P=json.load(open(f'{ST}/data/sigal_partition.json')); ev=json.load(open(f'{T}/split-events.json'))
cases=[]
# historical decisions
for q in sorted({e['parentStatementId'] for e in ev}):
    D=json.load(open(f'{T}/q-{q}.json')); by={s['statementId']:s for s in D['statements']}
    for n,e in enumerate(sorted([x for x in ev if x['parentStatementId']==q],key=lambda x:x['timestamp'])):
        p=by.get(e['clusterId'],{}); ids=e['prevState'].get('integratedOptions') or []
        mem=[dict(id=i,title=by[i]['statement']) for i in ids if i in by and by[i].get('statement')]
        cases.append(dict(id=f'hist:{q}:{n}',set='korazim' if q in P else 'other',q=q,question=D['question'],theme=dict(id=e['clusterId'],title=p.get('statement',''),description=p.get('description')),members=mem,placedTotal=max(len(mem),sum(1 for s in D['statements'] if not s.get('derivedByPipeline') and s['createdAt']<=e['timestamp'])),ts=e['timestamp'],missing=len(ids)-len(mem)))
# her five merged topics
for q,names in (('IqKVla0ZHw-m',['חזות הישוב','תרבות קהילתית']),('WfkDISMmbduQ',['בינוי קהילה','שיח ציבורי','שיפור פני הכפר'])):
    D=json.load(open(f'{T}/q-{q}.json')); by={s['statementId']:s for s in D['statements']}; R=P[q]
    place=sum(1 for s in D['statements'] if not s.get('derivedByPipeline') and not s.get('hide'))
    for nm in names:
        ids=[]
        for r in R['themes']:
            if r['topic']==nm: ids+=by[r['themeId']].get('integratedOptions') or []
        mv={m['atomId']:m['toTopic'] for m in R['moves']}
        ids=[i for i in dict.fromkeys(ids) if mv.get(i,nm)==nm]+[i for i,t in mv.items() if t==nm and i not in ids]
        ids=list(dict.fromkeys(ids))
        cases.append(dict(id=f'sigal:{nm}',set='sigal',q=q,question=D['question'],theme=dict(id=nm,title=nm,description=None),members=[dict(id=i,title=by[i]['statement']) for i in ids if by[i].get('statement')],placedTotal=place))
# benchmark with an answer key
rng=random.Random(20261102)
for lang,run in (('en','en-seed42-consolidated'),('he','he-seed42-large-recall')):
    d=json.load(open(f'{REPO}/scientific-research/2026-08-18-live-synth-accuracy/runs/{run}/statements.json'))
    by=C.defaultdict(list)
    for s in d['statements']: by[s['groundTruthTopic']].append(dict(id=s['id'],title=s['text']))
    tops=sorted(by)
    for t in tops:
        cases.append(dict(id=f'bm:{lang}:one:{t}',set='bm-one',question=d['question'],theme=dict(id=t,title=t.replace('-',' ') if lang=='en' else by[t][0]['title'][:40],description=None),members=by[t],placedTotal=100))
    combos=rng.sample(list(itertools.combinations(tops,2)),10)+rng.sample(list(itertools.combinations(tops,3)),10)
    for cb in combos:
        mem=[m for t in cb for m in by[t]]; rng.shuffle(mem)
        cases.append(dict(id=f'bm:{lang}:mix:{"+".join(cb)}',set='bm-mix',question=d['question'],theme=dict(id='+'.join(cb),title='Community needs and services' if lang=='en' else 'צרכים ושירותים בקהילה',description=None),members=mem,placedTotal=100))
json.dump(cases,open(f'{T}/cases.json','w'),ensure_ascii=False)
print(C.Counter(c['set'] for c in cases),'members',{s:sorted(len(c['members']) for c in cases if c['set']==s) for s in('sigal','other')},'missing',sum(c.get('missing',0) for c in cases))
