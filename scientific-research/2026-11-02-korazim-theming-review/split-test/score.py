#!/usr/bin/env python3
"""Scores the split test against PREREGISTRATION.md. Aggregates, AI labels and ids only.
usage: python3 -I score.py <rawDir> <studyDir>"""
import json,sys,collections as C
RAW,ST=sys.argv[1:3]; T=f'{RAW}/split-test'
R=json.load(open(f'{T}/raw-results.json')); O=R['out']; cases={c['id']:c for c in json.load(open(f'{T}/cases.json'))}
ev=sorted(json.load(open(f'{T}/split-events.json')),key=lambda x:x['timestamp']); P=json.load(open(f'{ST}/data/sigal_partition.json'))
def rate(st,arm,pred=lambda r:r.get('n',0)>=2,filt=lambda r:True):
    rs=[r for r in O if r['set']==st and r['arm']==arm and 'error' not in r and filt(r)]
    return dict(split=sum(pred(r) for r in rs),runs=len(rs),rate=round(sum(pred(r) for r in rs)/len(rs),3) if rs else None)
res=dict(model=R['model'],usd=round(R['usd'],3),calls=R['usage']['calls'],errors=sum('error' in r for r in O))
res['rates']={s:{a:rate(s,a) for a in('control','candidate')} for s in('bm-mix','bm-one','sigal','korazim','other')}
res['ratesByLang']={f'{s}:{l}':{a:rate(s,a,filt=lambda r,l=l:r['id'].startswith(f'bm:{l}:')) for a in('control','candidate')} for s in('bm-mix','bm-one') for l in('en','he')}
per=C.defaultdict(lambda:C.defaultdict(list))
for r in O:
    if 'error' not in r: per[r['id']][r['arm']].append(r.get('n',0))
res['sigalCases']={i.split(':',1)[1]:{'members':len(cases[i]['members']),**{a:per[i][a] for a in('control','candidate')}} for i in per if i.startswith('sigal:')}
# failing benchmark cases
res['bmOneSplitByCandidate']=[(i,per[i]['candidate']) for i in per if i.startswith('bm:') and ':one:' in i and any(x>=2 for x in per[i]['candidate'])]
res['bmMixKeptByCandidate']=[(i,per[i]['candidate']) for i in per if i.startswith('bm:') and ':mix:' in i and any(x<2 for x in per[i]['candidate'])]
# historical decisions with context
lin={}
for q in P:
    D=json.load(open(f'{T}/q-{q}.json')); by={s['statementId']:s for s in D['statements']}; R_=P[q]
    topic={}
    for r in R_['themes']:
        for i in by[r['themeId']].get('integratedOptions') or []: topic.setdefault(i,r['topic'])
    for m in R_['moves']:
        if m['toTopic']: topic[m['atomId']]=m['toTopic']
    inv={}
    for s in D['statements']:
        if s.get('derivedByPipeline')=='synthesis':
            for k in s.get('integratedOptions') or []: inv[k]=s['statementId']
    lin[q]=(by,topic,inv)
hist=[]
for c in [x for x in cases.values() if x['id'].startswith('hist:')]:
    q=c['q']; e=[x for x in ev if x['clusterId']==c['theme']['id']][0]; ids=e['prevState'].get('integratedOptions') or []
    D=json.load(open(f'{T}/q-{q}.json')); by={s['statementId']:s for s in D['statements']}
    leaves=sum(len(by[i].get('integratedOptions') or []) if i in by and by[i].get('derivedByPipeline')=='synthesis' else 1 for i in ids)
    row=dict(id=c['id'],title=c['theme']['title'],date=None,direct=len(ids),resolved=len(c['members']),leavesApprox=leaves,placedUpperBound=c['placedTotal'],shareLowerBound=round(leaves/c['placedTotal'],2),firedByFixedRuleOnly=None,control=per[c['id']]['control'],candidate=per[c['id']]['candidate'])
    row['newTriggerPossible']=leaves<25 or leaves/c['placedTotal']>=1/3
    if q in lin:
        b,t,inv=lin[q]; ct=C.Counter()
        for i in ids:
            k=i if i in t else inv.get(i)
            ct[t.get(k,'?')]+=1
        kn={k:v for k,v in ct.items() if k!='?'}
        row['sigalTopicsSpanned']=len(kn); row['topTopicShare']=round(max(kn.values())/sum(kn.values()),2) if kn else None; row['topTopic']=max(kn,key=kn.get) if kn else None
    hist.append(row)
res['historical']=hist
ko=[h for h in hist if 'sigalTopicsSpanned' in h]
kept=lambda h:sum(x<2 for x in h['candidate'])>=2
res['korazimByPurity']=dict(pure=[(h['title'],h['topTopicShare'],h['control'],h['candidate']) for h in ko if h['topTopicShare'] and h['topTopicShare']>=.8],
   candidateKept=[(h['title'],h['topTopicShare'],h['sigalTopicsSpanned']) for h in ko if kept(h)],decisions=len(ko),keptByCandidate=sum(kept(h) for h in ko))
res['triggerOnHistorical']=dict(total=len(hist),leavesOver25=sum(h['leavesApprox']>=25 for h in hist),over25AndShareBelowThirdAtLeast=[(h['id'],h['leavesApprox'],h['placedUpperBound']) for h in hist if h['leavesApprox']>=25 and not h['newTriggerPossible']],placedUnder=dict(p30=sum(h['placedUpperBound']<30 for h in hist),p50=sum(h['placedUpperBound']<50 for h in hist)),placedAtFirstSplit={q:min(h['placedUpperBound'] for h in hist if h['id'].startswith(f'hist:{q}')) for q in {h['id'].split(':')[1] for h in hist}})
bq=[h for h in hist if h['id'].startswith('hist:Bq')]; bq0=max(bq,key=lambda h:h['direct'])
res['criteria']=dict(
 P1=dict(need='>=0.90',got=res['rates']['bm-mix']['candidate']['rate'],passed=res['rates']['bm-mix']['candidate']['rate']>=.9),
 P2=dict(need='>=0.90 kept',got=round(1-res['rates']['bm-one']['candidate']['rate'],3),passed=1-res['rates']['bm-one']['candidate']['rate']>=.9),
 P3=dict(need='3 of 3',case=bq0['id'],got=bq0['candidate'],passed=all(x>=2 for x in bq0['candidate'])),
 P4=dict(need='>=0.80 kept',got=round(1-res['rates']['sigal']['candidate']['rate'],3),passed=1-res['rates']['sigal']['candidate']['rate']>=.8),
 C1=dict(need='control >=0.90',got=round((res['rates']['korazim']['control']['split']+res['rates']['other']['control']['split'])/(res['rates']['korazim']['control']['runs']+res['rates']['other']['control']['runs']),3)))
res['criteria']['C1']['passed']=res['criteria']['C1']['got']>=.9
# Simulation of the trigger change on the Korazim lineage. A historical split "still fires" if it
# was under 25 leaves (the share rule fired it) or its share is >= 1/3 of an UPPER bound on placed.
# Final themes collapse into their highest ancestor whose split would not fire. Ignores regrowth
# and what merges would have done afterwards, so it is an approximation.
import itertools
def ari(x,y):
    ids=sorted(set(x)&set(y)); c2=lambda k:k*(k-1)/2
    a=C.Counter(x[i] for i in ids); b=C.Counter(y[i] for i in ids); ab=C.Counter((x[i],y[i]) for i in ids)
    sa=sum(map(c2,a.values())); sb=sum(map(c2,b.values())); sab=sum(map(c2,ab.values())); tot=c2(len(ids)); e=sa*sb/tot; m=(sa+sb)/2
    return (sab-e)/(m-e) if m!=e else 1.0
sim={}
for q in P:
    D=json.load(open(f'{T}/q-{q}.json')); S=D['statements']; by={s['statementId']:s for s in S}
    th=[s for s in S if s.get('derivedByPipeline')=='topic-cluster']; par={s['statementId']:s.get('splitFrom') for s in th}
    fires={c['theme']['id']:h['newTriggerPossible'] for h in hist for c in [cases[h['id']]] if c['q']==q}
    rows={r['themeId']:r['topic'] for r in P[q]['themes']}
    def lift(t):
        cur=t; i=t
        while par.get(i):
            i=par[i]
            if not fires.get(i,True): cur=i
        return cur
    finals=[s for s in th if not s.get('hide')]
    at={}; 
    for f in sorted(finals,key=lambda s:(s['createdAt'],s['statementId'])):
        for i in f.get('integratedOptions') or []: at.setdefault(i,f['statementId'])
    s1={i:rows[t] for i,t in at.items()}
    for m in P[q]['moves']:
        if m['toTopic'] is None: s1.pop(m['atomId'],None)
        else: s1[m['atomId']]=m['toTopic']
    part={i:lift(t) for i,t in at.items()}
    kept=[h for h in hist if cases[h['id']].get('q')==q]
    only=[h for h in kept if not h['newTriggerPossible']]
    sim[q]=dict(splits=len(kept),firedOnlyByFixedRule=len(only),parentsTopicsSpannedInThose=[h['sigalTopicsSpanned'] for h in only],themesToday=len(finals),themesAfterChange=len(set(part.values())),herTopics=len(set(s1.values())),ariToday=round(ari(at,s1),3),ariAfterChange=round(ari(part,s1),3),largestAfterChangeAtoms=max(C.Counter(part.values()).values()))
res['triggerSimulation']=sim
res['parentsWithAtLeast2OfHerTopics']=sum(h['sigalTopicsSpanned']>=2 for h in ko)
json.dump(res,open(f'{ST}/results/split_test.json','w'),ensure_ascii=False,indent=1)
print(json.dumps({k:res[k] for k in('model','usd','calls','errors','criteria','rates','ratesByLang','sigalCases','bmOneSplitByCandidate','bmMixKeptByCandidate','korazimByPurity','triggerOnHistorical')},ensure_ascii=False,indent=0))
for h in hist: print(h['id'][5:18],h['title'][:30],'d',h['direct'],'lv',h['leavesApprox'],'pl',h['placedUpperBound'],'ctl',h['control'],'cand',h['candidate'],'span',h.get('sigalTopicsSpanned'),h.get('topTopicShare'))
