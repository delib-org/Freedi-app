#!/usr/bin/env python3
"""Korazim theming review: every metric of the README. Reads resident data from
<rawDir> (outside the repo); writes aggregates only to results/metrics.json.
usage: python3 -I analyze.py <rawDir> <studyDir> [replayDir]"""
import json,os,re,sys,math,random,itertools,collections as C
import numpy as np
from functools import lru_cache
RAW=os.path.expanduser(sys.argv[1]); ST=sys.argv[2]; REPLAY=sys.argv[3] if len(sys.argv)>3 else None
QS={'IqKVla0ZHw-m':'A','WfkDISMmbduQ':'B'}
P=json.load(open(f'{ST}/data/sigal_partition.json')); REG=json.load(open(f'{ST}/data/label_register.json'))
REFUSED=json.load(open(f'{RAW}/refused-logs.json'))
random.seed(42)
STOP=set("את של על עם גם כל זה זו זאת אשר כי או אם לא יש אין הם הן אנחנו אני כמו בין לפי כדי עוד יותר מאוד רק אבל בו בה בהם להם לנו שלנו שלהם מה מי כך אל ידי תוך ללא בלי מול אחד אחת כורזים בכורזים לכורזים כורזים יישוב היישוב ביישוב ליישוב הישוב בישוב ישוב כפר הכפר בכפר לשמר לשפר שימור שיפור שמירה לשמור לשפר באמצעות ובכלל היותה באופן שבו שבה שהם שלא כולל ככל מכל לכל לכן במיוחד".split())
PFX="והבל"  # ש/מ/כ excluded: stripping them produced false matches (spot-check: בינוי~שינוי, הרחבה~מרחב)
def toks(t):
    t=re.sub(r'[֑-ׇ]','',t or '').replace('־',' ').replace('-',' ').replace('״','').replace('"','').replace("'",'').replace('׳','')
    return [w for w in re.findall(r'[א-ת]{2,}',t)]
FINAL=str.maketrans('ךםןףץ','כמנפצ')
@lru_cache(maxsize=None)
def stems(w):
    """Heuristic Hebrew normalisation: prefix strip + suffix strip, as a SET of candidates."""
    w=w.translate(FINAL); out={w}
    cur={w}
    for _ in range(2):
        cur={x[1:] for x in cur if x[0] in PFX and len(x)>=4}
        out|=cur
    base=set(out)
    for x in base:
        y=x
        for _ in range(2):
            for suf in ('יות','ית','ים','ות','ה','ת','י'):
                if y.endswith(suf) and len(y)-len(suf)>=3:
                    y=y[:-len(suf)]; out.add(y); break
    return {x for x in out if len(x)>=3}
def content(t): return [w for w in toks(t) if w not in STOP and len(w)>=3]
@lru_cache(maxsize=None)
def stemset(t):
    s=set()
    for w in content(t): s|=stems(w)
    return s
def wmatch(w,bag): return bool(stems(w)&bag)
def ari(x,y):
    ids=sorted(set(x)&set(y)); n=len(ids)
    a=C.Counter(x[i] for i in ids); b=C.Counter(y[i] for i in ids); ab=C.Counter((x[i],y[i]) for i in ids)
    c2=lambda k:k*(k-1)/2
    sa=sum(c2(v) for v in a.values()); sb=sum(c2(v) for v in b.values()); sab=sum(c2(v) for v in ab.values()); tot=c2(n)
    if tot==0: return 0
    exp=sa*sb/tot; mx=(sa+sb)/2
    return (sab-exp)/(mx-exp) if mx!=exp else 1.0
def pf1(pred,gold):
    ids=sorted(set(pred)&set(gold)); tp=fp=fn=0
    for i,j in itertools.combinations(ids,2):
        p=pred[i]==pred[j]; g=gold[i]==gold[j]
        tp+=p and g; fp+=p and not g; fn+=g and not p
    pr=tp/(tp+fp) if tp+fp else 0; rc=tp/(tp+fn) if tp+fn else 0
    return dict(precision=round(pr,3),recall=round(rc,3),f1=round(2*pr*rc/(pr+rc),3) if pr+rc else 0)
def fisher(a,b,c,d):
    from math import comb
    n=a+b+c+d; r=a+b; k=a+c
    return round(sum(comb(r,x)*comb(n-r,k-x) for x in range(a,min(r,k)+1))/comb(n,k),5)
M={}; SPOT=set()
for q,qn in QS.items():
    D=json.load(open(f'{RAW}/lineage-{q}.json')); S=D['statements']; by={s['statementId']:s for s in S}; A=D['audit']; E=json.load(open(f'{RAW}/embeddings-{q}.json'))
    themeDocs=[s for s in S if s.get('derivedByPipeline')=='topic-cluster']
    themes=[s for s in themeDocs if not s.get('hide')]; tid={t['statementId'] for t in themes}
    O=[s for s in S if not s.get('derivedByPipeline')]; SY=[s for s in S if s.get('derivedByPipeline')=='synthesis']
    inSyn={i for s in SY if not s.get('hide') for i in s.get('integratedOptions') or []}
    tier=lambda s:'ai_rewrite' if re.match(r'^[^:]+: ',s['statement']) else 'plain'
    PT=P[q]; rows={r['themeId']:r for r in PT['themes']}
    m={}
    # ---------- gate: report numbers reproduced from the snapshot
    gate=[]
    for t in themes:
        r=rows[t['statementId']]; ev=t['evaluation']
        gate.append((ev.get('numberOfEvaluators')==r['reportRaters'],ev.get('numberOfProEvaluators')==r['reportPro'],ev.get('numberOfConEvaluators')==r['reportCon'],r['label']))
    m['gate']=dict(themes=len(gate),allMatch=sum(a and b and c for a,b,c,_ in gate),mismatches=[g[3] for g in gate if not(g[0] and g[1] and g[2])])
    # ---------- partitions at atom level
    atomTheme={}
    filed=C.Counter()
    for t in sorted(themes,key=lambda t:(t['createdAt'],t['statementId'])):
        for i in t.get('integratedOptions') or []:
            filed[i]+=1; atomTheme.setdefault(i,t['statementId'])
    atoms=[s for s in SY if not s.get('hide')]+[s for s in O if not s.get('hide') and s['statementId'] not in inSyn]
    atomIds={a['statementId'] for a in atoms}
    unth=[a['statementId'] for a in atoms if a['statementId'] not in atomTheme]
    sys_={i:atomTheme[i] for i in sorted(atomIds) if i in atomTheme}
    s1={i:rows[atomTheme[i]]['topic'] for i in sorted(atomIds) if i in atomTheme}
    for mv in PT['moves']:
        if mv['toTopic'] is None: s1.pop(mv['atomId'],None)
        else: s1[mv['atomId']]=mv['toTopic']
    s2=dict(s1)
    for grp in PT['s2Merges']:
        for i,v in s2.items():
            if v in grp: s2[i]=grp[0]
    leaves=lambda i:(len(by[i].get('integratedOptions') or []) if by[i].get('derivedByPipeline')=='synthesis' else 1)
    def expand(p):
        o={}
        for i,v in p.items():
            if by[i].get('derivedByPipeline')=='synthesis':
                for k in by[i].get('integratedOptions') or []: o[k]=v
            else: o[i]=v
        return o
    m['doublyFiledAtoms']=sum(v>1 for v in filed.values())
    m['counts']=dict(originals=len(O),synths=len(SY),atoms=len(atoms),themesFinal=len(themes),themeDocsEver=len(themeDocs),topicsS1=len(set(s1.values())),topicsS2=len(set(s2.values())),unthemedAtoms=len(unth))
    sz=sorted(C.Counter(sys_.values()).values()); m['themeSizesAtoms']=dict(sizes=sz,median=float(np.median(sz)),le3=sum(x<=3 for x in sz))
    tsz=sorted(C.Counter(s1.values()).values()); m['topicSizesAtomsS1']=dict(sizes=tsz,median=float(np.median(tsz)))
    # refinement
    thTopics=C.defaultdict(set)
    for i,t in sys_.items():
        if i in s1: thTopics[t].add(s1[i])
    m['refinement']=dict(themesInsideOneTopic=sum(len(v)==1 for v in thTopics.values()),themes=len(thTopics))
    m['agreement']={k:dict(atoms=dict(ari=round(ari(sys_,g),3),**pf1(sys_,g)),leaves=dict(ari=round(ari(expand(sys_),expand(g)),3),**pf1(expand(sys_),expand(g)))) for k,g in (('S1',s1),('S2',s2))}
    # ---------- lineage
    parent={t['statementId']:t.get('splitFrom') for t in themeDocs}
    def chain(i):
        c=[]; 
        while parent.get(i): i=parent[i]; c.append(i)
        return c
    depth={t['statementId']:len(chain(t['statementId'])) for t in themes}
    bornSplit=sum(1 for t in themeDocs if t.get('liveSynthOrigin')=='split')
    sp=sorted([a for a in A if a['action']=='split'],key=lambda a:a['timestamp'])
    kids=[len(x['members']) for a in sp for x in a['newState']['splitInto']]
    prev=[len(a['prevState']['integratedOptions']) for a in sp]
    def leavesOf(ids): return sum(len(by[i].get('integratedOptions') or []) if i in by and by[i].get('derivedByPipeline')=='synthesis' else 1 for i in ids)
    placedNow=sum(leavesOf(t.get('integratedOptions') or []) for t in themes)
    m['lineage']=dict(themeDocsEver=len(themeDocs),bornFromSplit=bornSplit,finalThemes=len(themes),finalBornFromSplit=sum(1 for t in themes if t.get('liveSynthOrigin')=='split'),finalBornSpawn=sum(1 for t in themes if t.get('liveSynthOrigin')=='spawn'),
        maxDepth=max(depth.values()),depthDist=dict(sorted(C.Counter(depth.values()).items())),splits=len(sp),parentDirectMembers=prev,parentsUnder10Direct=sum(p<10 for p in prev),childrenTotal=len(kids),childrenLe2=sum(k<=2 for k in kids),
        spawns=sum(t.get('liveSynthOrigin')=='spawn' for t in themeDocs),themeMerges=sum(a['triggerSource']=='reJudge:themeConsolidate' for a in A if a['action']=='merge'),rebuildEvents=sum(a['action']=='theme-rebuild' for a in A),rebuildProposals=len(D['proposals']),splitsFiredBefore=None,
        firstSplit=sp[0]['timestamp'],lastSplit=sp[-1]['timestamp'],lastFinalThemeCreated=max(t['createdAt'] for t in themes))
    # pairs
    ref=C.Counter(); 
    groupsQ=[x['jsonPayload']['ids'] for x in REFUSED if x['jsonPayload'].get('parentId')==q]
    for g in groupsQ:
        for a,b in itertools.combinations(sorted(g),2): ref[(a,b)]+=1
    finals=sorted(tid); tp={t:rows[t]['topic'] for t in finals}
    def rel(a,b):
        if parent.get(a) and parent.get(a)==parent.get(b): return 'sibling'
        ca=set(chain(a))|{a}; cb=set(chain(b))|{b}
        return 'same_tree' if ca&cb else 'other'
    tab=C.Counter(); pairs=[]
    for a,b in itertools.combinations(finals,2):
        mg=tp[a]==tp[b]; r=rel(a,b); rf=ref.get((a,b),0)>0
        tab[(mg,r)]+=1; pairs.append(dict(a=a,b=b,merged=mg,rel=r,refused=rf,refusedN=ref.get((a,b),0)))
    mer=[p for p in pairs if p['merged']]; non=[p for p in pairs if not p['merged']]
    frac=lambda L,k,v=True:round(sum(p[k]==v for p in L)/len(L),3) if L else None
    m['pairs']=dict(merged=len(mer),notMerged=len(non),mergedSibling=sum(p['rel']=='sibling' for p in mer),notMergedSibling=sum(p['rel']=='sibling' for p in non),mergedSameTree=sum(p['rel']!='other' for p in mer),notMergedSameTree=sum(p['rel']!='other' for p in non),
        mergedRefused=sum(p['refused'] for p in mer),notMergedRefused=sum(p['refused'] for p in non),siblingPairs=sum(p['rel']=='sibling' for p in pairs),refusedFinalPairs=sum(p['refused'] for p in pairs))
    P_=m['pairs']; P_['fisherSibling']=fisher(P_['mergedSibling'],P_['merged']-P_['mergedSibling'],P_['notMergedSibling'],P_['notMerged']-P_['notMergedSibling']); P_['fisherRefused']=fisher(P_['mergedRefused'],P_['merged']-P_['mergedRefused'],P_['notMergedRefused'],P_['notMerged']-P_['notMergedRefused'])
    m['pairs']['pSiblingGivenMerged']=frac(mer,'rel','sibling'); m['pairs']['pSiblingGivenNot']=frac(non,'rel','sibling')
    # merge judge vs Sigal: all refused pairs among final themes
    rf=[p for p in pairs if p['refused']]
    m['refusals']=dict(events=len(groupsQ),firstTs=min(x['timestamp'] for x in REFUSED if x['jsonPayload'].get('parentId')==q),lastTs=max(x['timestamp'] for x in REFUSED if x['jsonPayload'].get('parentId')==q),distinctGroups=len({tuple(sorted(g)) for g in groupsQ}),finalPairsRefused=len(rf),ofWhichSigalMerged=sum(p['merged'] for p in rf),
        sigalMergedPairs=len(mer),sigalPairsRefused=sum(p['refused'] for p in mer),groupsTouchingFinal=sum(1 for g in {tuple(sorted(g)) for g in groupsQ} if all(i in tid for i in g)))
    # ---------- would Sigal's topics themselves trigger a split?
    tl=C.Counter()
    for i,t in s1.items(): tl[t]+=leaves(i)
    placed=sum(tl.values())
    def over(n): return n>=8 and (n>=25 or n/placed>=1/3)
    m['splitTrigger']=dict(placedLeaves=placed,alwaysSplitAbove=25,alwaysAsShareOfPlaced=round(25/placed,3),largestFinalThemeLeaves=max(leavesOf(t.get('integratedOptions') or []) for t in themes),
        finalThemesOver=sum(over(leavesOf(t.get('integratedOptions') or [])) for t in themes),
        sigalTopicLeaves=dict(sorted(tl.items(),key=lambda x:(-x[1],x[0]))),sigalTopicsThatWouldBeSplit=sorted(k for k,v in tl.items() if over(v)))
    code=lambda t:sum(len(by[i].get('integratedOptions') or []) if i in by and by[i].get('derivedByPipeline')=='synthesis' else 1 for i in t.get('integratedOptions') or [])
    placedCode=sum(code(t) for t in themes); byTopic=C.Counter()
    for t in themes: byTopic[rows[t['statementId']]['topic']]+=code(t)
    m['splitTriggerCodeExact']=dict(placed=placedCode,alwaysAsShare=round(25/placedCode,3),largestTheme=max(code(t) for t in themes),largestShare=round(max(code(t) for t in themes)/placedCode,3),topicsOver=sorted(k for k,v in byTopic.items() if v>=8 and (v>=25 or v/placedCode>=1/3)),topicLeaves=dict(sorted(byTopic.items(),key=lambda x:(-x[1],x[0]))[:5]),topicsOverByShareRule=[k for k,v in byTopic.items() if v>=8 and v/placedCode>=1/3])
    # what merging did to lineage
    mi=lambda x:x.get('mergedInto') or x.get('supersededBy')
    merged=[t for t in themeDocs if mi(t)]
    splitMem={}
    for a in sp:
        for x in a['newState']['splitInto']: splitMem[x['id']]=set(x['members'])
    share=[];pure=0
    for t in themes:
        if t['statementId'] in splitMem:
            cur=set(t.get('integratedOptions') or [])
            if cur: share.append(len(cur&splitMem[t['statementId']])/len(cur)); pure+=cur<=splitMem[t['statementId']]
    mt=[t for t in merged]
    m['lineageContent']=dict(themeDocsMergedAway=len(merged),finalsThatAbsorbedDonors=sum(any(mi(x)==t['statementId'] for x in merged) for t in themes),meanShareOfMembersPresentAtSplit=round(float(np.mean(share)),3),finalsHoldingOnlySplitMembers=pure,splitBornFinals=len(share),donorsMergedIntoDirectSibling=sum(bool(parent.get(t['statementId'])) and parent.get(t['statementId'])==parent.get(mi(t)) for t in merged))
    # refusal is confounded with sibling status: test inside sibling pairs only
    sb=[p for p in pairs if p['rel']=='sibling']
    a_=sum(p['merged'] and p['refused'] for p in sb); b_=sum(p['merged'] and not p['refused'] for p in sb); c_=sum(not p['merged'] and p['refused'] for p in sb); d_=sum(not p['merged'] and not p['refused'] for p in sb)
    m['pairs']['withinSiblings']=dict(mergedRefused=a_,mergedNotRefused=b_,keptRefused=c_,keptNotRefused=d_,fisher=fisher(a_,b_,c_,d_))
    m['pairs']['nonSiblingCountedRefused']=sum(p['refused'] and p['rel']!='sibling' for p in pairs)
    m['pairs']['mergeGroups']=sum(v>1 for v in C.Counter(tp.values()).values())
    # ---------- undo splits: agreement with Sigal as the latest splits are reversed
    order=sorted({t.get('splitFrom') for t in themeDocs if t.get('splitFrom')},key=lambda i:-min((x['createdAt'] for x in themeDocs if x.get('splitFrom')==i)))
    best=[]; cut=dict(sys_); undone=[]
    def lift(th,und):
        cur=th
        for anc in chain(th):
            if anc in und: cur=anc
        return cur
    series=[]
    for k in range(len(order)+1):
        und=set(order[:k]); part={i:lift(t,und) for i,t in sys_.items()}
        series.append(dict(undone=k,themes=len(set(part.values())),ariS1=round(ari(part,s1),3),f1S1=pf1(part,s1)['f1'],ariS2=round(ari(part,s2),3)))
    m['undoSplits']=dict(series=series,best=max(series,key=lambda r:r['ariS1']))
    # ---------- text tiers + provenance
    tiers=C.Counter(tier(s) for s in O); m['tiers']=dict(tiers)
    dm=C.Counter()
    for t in themes:
        for i in t.get('integratedOptions') or []:
            s=by[i]; dm['synth' if s.get('derivedByPipeline')=='synthesis' else tier(s)]+=1
    m['provenance']=dict(themeMembersShownToJudges=dict(dm),aiWrittenShare=round((dm['synth']+dm['ai_rewrite'])/sum(dm.values()),3),plainOriginalsHiddenInSynth=sum(1 for s in O if tier(s)=='plain' and s['statementId'] in inSyn),
        spawnLabelsFromOneSynth=sum(t.get('liveSynthOrigin')=='spawn' for t in themeDocs))
    # retention: plain originals' words surviving in their synth title
    ret=[]
    for s in SY:
        if s.get('hide'): continue
        b=stemset(s['statement'])
        for i in s.get('integratedOptions') or []:
            if i in by and tier(by[i])=='plain':
                w=content(by[i]['statement'])
                if w: ret.append(sum(wmatch(x,b) for x in w)/len(w))
    m['provenance']['plainWordsRetainedInSynthMean']=round(float(np.mean(ret)),3) if ret else None; m['provenance']['retentionN']=len(ret)
    # ---------- labels
    plain=[s for s in O if tier(s)=='plain']; rewrite=[s for s in O if tier(s)=='ai_rewrite']
    bag=lambda L:[(s.get('creatorId'),stemset(s['statement'])) for s in L]
    Bp,Br,Bs=bag(plain),bag(rewrite),bag(SY)
    def lblstats(labels,members=None):
        out=[]
        for l in labels:
            ws=[w for w in content(l)]
            r=dict(label=l,words=len(ws))
            att=lambda B:round(sum(any(stems(w)&b for _,b in B) for w in ws)/len(ws),3) if ws else None
            r['attPlain']=att(Bp); r['attRewrite']=att(Br); r['attSynth']=att(Bs)
            # how many distinct residents used the label's rarest word, in plain text
            cnt=[len({c for c,b in Bp if stems(w)&b}) for w in ws]
            r['residentsPerWordMedian']=float(np.median(cnt)) if cnt else 0
            r['residentsAnyWord']=len({c for c,b in Bp for w in ws if stems(w)&b})
            SPOT.update(ws)
            out.append(r)
        return out
    sysL=[t['statement'] for t in themes]
    nh=lambda x:x.replace('־','-')
    sigL=sorted({v for v in s1.values() if nh(v) not in {nh(l) for l in sysL}})
    agg=lambda L:dict(n=len(L),attPlain=round(float(np.mean([x['attPlain'] for x in L])),3),attRewrite=round(float(np.mean([x['attRewrite'] for x in L])),3),attSynth=round(float(np.mean([x['attSynth'] for x in L])),3),residentsPerWordMedian=float(np.median([x['residentsPerWordMedian'] for x in L])),fullyAttestedPlain=sum(x['attPlain']==1 for x in L))
    ss,sg=lblstats(sysL),lblstats(sigL)
    m['labels']=dict(system=agg(ss),sigalNewNames=agg(sg) if sg else None,sigalDetail=sg,systemDetail=ss)
    # exact phrase attested in plain text
    norm=lambda t:' '.join(toks(t))
    plainTxt=[norm(s['statement']) for s in plain]; allTxt=[norm(s['statement']) for s in O]
    m['labels']['phraseInPlain']={l:sum(norm(l) in x for x in plainTxt) for l in sigL}
    m['labels']['phraseInAllOriginals']={l:sum(norm(l) in x for x in allTxt) for l in sigL}
    comp=lambda l:bool(re.search(r',|\sו[א-ת]{2,}',l))
    seg=lambda l:[norm(x) for x in re.split(r',|\sו(?=[א-ת]{2,})',l) if norm(x)]
    m['labels']['systemVerbatim']=dict(wholeLabelInOriginals=sum(any(norm(l) in x for x in allTxt) for l in sysL),anySegmentInPlain=sum(any(g in x for x in plainTxt for g in seg(l)) for l in sysL),anySegmentInOriginals=sum(any(g in x for x in allTxt for g in seg(l)) for l in sysL),of=len(sysL))
    COINED={'A':['חזות הישוב','תרבות קהילתית','לכידות קהילתית','חוסן קהילתי בשעת חירום'],'B':['בינוי קהילה','שיפור פני הכפר','שיח ציבורי']}[qn]
    def variant(l,txts):
        ws=[w for w in toks(l)]
        n=0
        for x in txts:
            tk=toks(x)
            for i in range(len(tk)-len(ws)+1):
                if all(stems(a)&stems(b) for a,b in zip(ws,tk[i:i+len(ws)])): n+=1; break
        return n
    allRaw=[s['statement'] for s in O]; plainRaw=[s['statement'] for s in plain]
    m['labels']['coinedVariantHits']={l:dict(allOriginals=variant(l,allRaw),plain=variant(l,plainRaw)) for l in COINED}
    m['labels']['finalListCompound']=dict(sigalTopics=sum(comp(l) for l in set(s1.values())),sigalTopicsOf=len(set(s1.values())))
    m['labels']['coined']=dict(names=COINED,wholeNameInOriginals={l:sum(norm(l) in x for x in allTxt) for l in COINED},wholeNameInPlain={l:sum(norm(l) in x for x in plainTxt) for l in COINED})
    wc=lambda l:len(toks(l))
    m['labels']['wordCount']=dict(systemMean=round(float(np.mean([wc(l) for l in sysL])),2),systemUnder3=sum(wc(l)<3 for l in sysL),coined={l:wc(l) for l in COINED},coinedUnder3=sum(wc(l)<3 for l in COINED),coinedCompound=sum(comp(l) for l in COINED))
    m['labels']['keptVerbatimByTopicName']=sum(nh(rows[t['statementId']]['topic'])==nh(t['statement']) for t in themes)
    rng=random.Random(7)
    def sub(labels):
        o=[]
        for _ in range(300):
            B=rng.sample(Br,min(len(Bp),len(Br))); vals=[]
            for l in labels:
                ws=content(l)
                if ws: vals.append(sum(any(stems(w)&b for _,b in B) for w in ws)/len(ws))
            o.append(np.mean(vals))
        return round(float(np.mean(o)),3)
    m['labels']['system']['attRewriteSubsampledToPlainSize']=sub(sysL)
    m['labels']['sigalNewNames']['attRewriteSubsampledToPlainSize']=sub(sigL)
    allWords=[w for s in rewrite for w in content(s['statement'])]
    m['labels']['baselineRandomRewriteWordInPlain']=round(float(np.mean([any(stems(w)&b for _,b in Bp) for w in rng.sample(allWords,min(500,len(allWords)))])),3)
    m['labels']['compound']=dict(system=sum(comp(l) for l in sysL),systemOf=len(sysL),sigal=sum(comp(l) for l in sigL),sigalOf=len(sigL))
    edited=['סיוע הדדי, התנדבות וחוסן'] if qn=='A' else ['טבע, מורשת ואיכות הסביבה','פעילויות פנאי ותוכן למבוגרים ומתבגרים']
    m['labels']['sigalSplitOrNarrowedAreCompound']={l:comp(l) for l in edited}
    reg=lambda L:dict(administrative=sum(l in REG['administrative'] for l in L),everyday=sum(l in REG['everyday'] for l in L),uncoded=[l for l in L if l not in REG['administrative'] and l not in REG['everyday']])
    m['labels']['register']=dict(system=reg(sysL),sigal=reg(sigL))
    # ---------- field spread: top resident terms over partitions, with random-coarsening null
    leafTheme=expand(sys_)
    themeTopic={t:rows[t]['topic'] for t in finals}
    groups=sorted(C.Counter(themeTopic.values()).values())
    def randCoarse():
        ts=finals[:]; random.shuffle(ts); o={}; k=0
        for gi,g in enumerate(groups):
            for t in ts[k:k+g]: o[t]=gi
            k+=g
        return o
    def fieldTest(src):
        freq=C.Counter(); canon={}
        for s in src:
            seen=set()
            for w in content(s['statement']):
                k=min(stems(w),key=lambda x:(len(x),x)) if stems(w) else w
                canon.setdefault(k,C.Counter())[w]+=1
                if k not in seen: freq[k]+=1; seen.add(k)
        top=[k for k,_ in freq.most_common(15)]
        holders={k:[s['statementId'] for s in src if s['statementId'] in leafTheme and k in stemset(s['statement'])] for k in top}
        def spread(part):
            vals=[]
            for k in top:
                cnt=C.Counter(part[i] for i in holders[k])
                n=sum(cnt.values())
                if n>=2: vals.append(-sum(c/n*math.log2(c/n) for c in cnt.values()))
            return float(np.mean(vals))
        obs=spread({i:themeTopic[t] for i,t in leafTheme.items()})
        null=[spread({i:rc[t] for i,t in leafTheme.items()}) for rc in (randCoarse() for _ in range(2000))]
        return dict(terms=[canon[k].most_common(1)[0][0] for k in top],docFreq=[freq[k] for k in top],systemBits=round(spread(leafTheme),3),sigalBits=round(obs,3),nullMean=round(float(np.mean(null)),3),nullP5=round(float(np.percentile(null,5)),3),pLowerOrEqual=round(float(np.mean([n<=obs for n in null])),4),
            systemThemesPerTerm=round(float(np.mean([len({leafTheme[i] for i in holders[k]}) for k in top])),2),sigalTopicsPerTerm=round(float(np.mean([len({themeTopic[leafTheme[i]] for i in holders[k]}) for k in top])),2))
    m['fieldSpread']=dict(plainTier=fieldTest(plain),allOriginals=fieldTest(O))
    # ---------- embeddings
    def centroid(t):
        v=[E[i] for i in t.get('integratedOptions') or [] if E.get(i)]
        if not v: return None
        c=np.mean(np.array(v,dtype=float),axis=0); return c/np.linalg.norm(c)
    ctr={t['statementId']:centroid(t) for t in themes}
    cs=[]
    for p in pairs:
        if ctr[p['a']] is None or ctr[p['b']] is None: continue
        p['cos']=float(ctr[p['a']]@ctr[p['b']]); cs.append(p)
    m_=[p['cos'] for p in cs if p['merged']]; n_=[p['cos'] for p in cs if not p['merged']]
    auc=np.mean([ (x>y)+.5*(x==y) for x in m_ for y in n_])
    sib=[p['cos'] for p in cs if p['rel']=='sibling']; nsib=[p['cos'] for p in cs if p['rel']!='sibling']
    # would a cosine cut recover her merges?
    ths=sorted({round(p['cos'],3) for p in cs}); bestF=max(((lambda tp,fp,fn:(2*tp/(2*tp+fp+fn) if tp else 0,th,tp,fp,fn))(sum(p['merged'] and p['cos']>=th for p in cs),sum(not p['merged'] and p['cos']>=th for p in cs),sum(p['merged'] and p['cos']<th for p in cs)) for th in ths))
    topm=sorted(cs,key=lambda p:-p['cos'])[:len(m_)]
    def leafC(t):
        v=[]
        for i in t.get('integratedOptions') or []:
            ids=(by[i].get('integratedOptions') or [i]) if by[i].get('derivedByPipeline')=='synthesis' else [i]
            v+=[E[k] for k in ids if E.get(k)]
        if not v: return None
        c=np.mean(np.array(v,dtype=float),axis=0); return c/np.linalg.norm(c)
    lc={t['statementId']:leafC(t) for t in themes}
    lp=[(float(lc[p['a']]@lc[p['b']]),p['merged']) for p in pairs if lc[p['a']] is not None and lc[p['b']] is not None]
    aucL=np.mean([(x>y)+.5*(x==y) for x,mx in lp if mx for y,my in lp if not my])
    nT=C.Counter(sys_.values())
    szc=np.corrcoef([p['cos'] for p in cs],[min(nT[p['a']],nT[p['b']]) for p in cs])[0,1]
    m['embeddingRobustness']=dict(aucLeafCentroid=round(float(aucL),3),corrCosineWithThemeSize=round(float(szc),3))
    m['embedding']=dict(mergedMean=round(float(np.mean(m_)),3),notMergedMean=round(float(np.mean(n_)),3),aucMergedVsNot=round(float(auc),3),siblingMean=round(float(np.mean(sib)),3),nonSiblingMean=round(float(np.mean(nsib)),3),bestCutF1=round(bestF[0],3),bestCutTh=bestF[1],bestCutTP=bestF[2],bestCutFP=bestF[3],bestCutFN=bestF[4],mergedInTopK=sum(p['merged'] for p in topm),k=len(m_),covered=len(cs))
    # agreement baseline: a RANDOM coarsening of the live list with her group sizes
    bl=[]
    for _ in range(500):
        rc=randCoarse(); bl.append(ari(sys_,{i:rc[t] for i,t in sys_.items()}))
    m['agreementBaselineRandomCoarsening']=round(float(np.mean(bl)),3)
    # fair measure: atom pairs she joined ACROSS live themes (live = 0 by construction)
    idsA=sorted(set(sys_)&set(s1)); joined=[];apart=[];heldLive=[]
    for a,b in itertools.combinations(idsA,2):
        if s1[a]==s1[b] and sys_[a]!=sys_[b]: joined.append((a,b))
        elif s1[a]!=s1[b]: apart.append((a,b))
        if sys_[a]==sys_[b]: heldLive.append((a,b))
    m['fairPairs']=dict(joinedAcrossLive=len(joined),keptApart=len(apart),heldTogetherLive=len(heldLive))
    # Sigal's definition: professional vocabulary of community development.
    # Terms: her two examples plus close professional neighbours, chosen by the analyst.
    nt=lambda x:' '.join(toks(x or ''))
    TERMS={'בינוי קהילה':r'בינוי (ה)?קהיל','בניית קהילה':r'בניית (ה)?קהיל','חוסן (any)':r'חוסן','חוסן קהילתי':r'חוסן (ה)?קהילתי','לכידות (any)':r'לכידות','הון חברתי':r'הון (ה)?חברתי','פיתוח קהילתי':r'פיתוח (ה)?קהיל'}
    LAYERS={'finalThemeLabels':[t['statement'] for t in themes],'allThemeDocLabels':[t['statement'] for t in themeDocs],'splitEventTitles':[x['title'] for a in sp for x in a['newState']['splitInto']],'themeDescriptions':[t.get('description') for t in themeDocs],'synthTitles':[s['statement'] for s in SY],'originalsAiForm':[s['statement'] for s in rewrite],'originalsPlain':[s['statement'] for s in plain]}
    m['professionalTerms']={k:{g:sum(bool(re.search(p,nt(x))) for x in v) for g,v in LAYERS.items()} for k,p in TERMS.items()}
    # ---------- replay arms
    if REPLAY:
        rep={}
        for arm in ('R','F','P'):
            rs=[]
            for n in range(1,10):
                f=f'{REPLAY}/{q}-{arm}{n}.json'
                if not os.path.exists(f): continue
                R=json.load(open(f)); pa={i:t['name'] for t in R['themes'] for i in t['memberIds']}
                labs=[t['name'] for t in R['themes']]; st=lblstats(labs); a=agg(st)
                sizes=sorted(len(t['memberIds']) for t in R['themes'])
                jr=lambda L:round(sum(pa.get(a) is not None and pa.get(a)==pa.get(b) for a,b in L)/len(L),3)
                rs.append(dict(joinRateSheJoined=jr(joined),joinRateSheKeptApart=jr(apart),keepsLivePairs=jr(heldLive),themes=len(labs),other=len(R.get('otherIds') or []),unanswered=len(R.get('unanswered') or []),largest=sizes[-1],le3=sum(s<=3 for s in sizes),ariS1=round(ari(pa,s1),3),**{f'{k}S1':v for k,v in pf1(pa,s1).items()},ariS2=round(ari(pa,s2),3),attPlain=a['attPlain'],compound=sum(comp(l) for l in labs),usd=R.get('usd'),labels=labs))
            rep[arm]=rs
        m['replay']=rep
    if REPLAY:
        m['professionalTermsInArmP']={n:[sum(bool(re.search(p,nt(l))) for l in r['labels']) for r in m['replay']['P']] for n,p in TERMS.items()}
    M[qn]=m
M['_note']='Aggregates, AI labels and Sigal topic names only. No resident text.'
json.dump(M,open(f'{ST}/results/metrics.json','w'),ensure_ascii=False,indent=1,default=lambda o:o.item() if hasattr(o,'item') else str(o))
json.dump(sorted(SPOT),open(f'{RAW}/spot_words.json','w'),ensure_ascii=False)
