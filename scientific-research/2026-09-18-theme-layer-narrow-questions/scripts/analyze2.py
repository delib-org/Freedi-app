import json,pandas as pd
from collections import Counter,defaultdict
from sklearn.metrics import adjusted_rand_score as ari, normalized_mutual_info_score as nmi, homogeneity_completeness_v_measure as hcv
d=json.load(open('q2.json')); ch={c['statementId']:c for c in d['children']}
fan=pd.read_excel('/Users/talyaron/Downloads/statements_full.xlsx')
q=fan.iloc[0]; fan=fan.iloc[1:]; fan=fan[fan.statementId.notna()]
fan.columns=['id','text','f1','f2']
fan['f1']=fan.f1.astype(str).str.strip(); fan['f2']=fan.f2.fillna('').astype(str).str.strip().str.lstrip('ו')
orig=[k for k,c in ch.items() if not c.get('isCluster')]
vis=lambda p:[c for c in ch.values() if c.get('derivedByPipeline')==p and not c.get('hide')]
topics=vis('topic-cluster'); syn=vis('synthesis')
syn_of=defaultdict(list)
for c in syn:
  for m in c['integratedOptions']: syn_of[m].append(c)
top_of={}
for t in topics:
  for m in t['integratedOptions']:
    top_of[m]=t
    for mm in (ch[m].get('integratedOptions') or []) if m in ch and ch[m].get('isCluster') else []: top_of.setdefault(mm,t)
rows=[]
for _,r in fan.iterrows():
  c=ch.get(r.id)
  if c is None: rows.append(dict(id=r.id,text=r.text,kind='machine cluster from the previous run (now deleted)',fan=r.f1,fan2=r.f2,topic='',syn='')); continue
  kind='original' if not c.get('isCluster') else f"machine {c['derivedByPipeline']} cluster{' (hidden)' if c.get('hide') else ''}"
  t=top_of.get(r.id); s=syn_of.get(r.id,[])
  rows.append(dict(id=r.id,text=r.text,kind=kind,fan=r.f1,fan2=r.f2,topic=t['statement'] if t else '',syn=' | '.join(x['statement'] for x in s)))
R=pd.DataFrame(rows); json.dump({'q':q.iloc[1]},open('meta.json','w'),ensure_ascii=False)
R.to_pickle('R2.pkl')
O=R[R.kind=='original'].copy(); print('originals',len(O))
print('topic assigned',(O.topic!='').sum(),'syn assigned',(O.syn!='').sum(),'either',((O.topic!='')|(O.syn!='')).sum())
print(Counter(O.topic)); print('fanny cats',O.fan.nunique()); print(O.fan.value_counts().head(12))
print(pd.crosstab(O.fan,O.topic.replace('', '(none)')).to_string())
for s,g in O[O.syn!=''].groupby('syn'): print(len(g), s[:50], dict(Counter(g.fan)))
