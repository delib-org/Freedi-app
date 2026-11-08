import pandas as pd, itertools, json, html
from collections import Counter
from sklearn.metrics import adjusted_rand_score as ari
d=json.load(open('q2.json')); ch={c['statementId']:c for c in d['children']}
Q=json.load(open('meta.json'))['q']
fan=pd.read_excel('/Users/talyaron/Downloads/statements_full.xlsx').iloc[1:]
fan=fan[fan.statementId.notna()]; fan.columns=['id','text','f1','f2']
fan['f1']=fan.f1.astype(str).str.strip(); fan['f2']=fan.f2.fillna('').astype(str).str.strip().str.lstrip('ו')
vis=[c for c in ch.values() if c.get('isCluster') and not c.get('hide')]
topics=[c for c in vis if c['derivedByPipeline']=='topic-cluster']; syn=[c for c in vis if c['derivedByPipeline']=='synthesis']
# distinct merge groups: drop exact duplicates and groups contained in a larger one
syn_sorted=sorted(syn,key=lambda c:-len(c['integratedOptions'])); distinct=[]; dropped=[]
for c in syn_sorted:
  s=set(c['integratedOptions'])
  if any(s<=set(x['integratedOptions']) for x in distinct): dropped.append(c)
  else: distinct.append(c)
syn_of={}
for c in distinct:
  for m in c['integratedOptions']: syn_of.setdefault(m,c)
top_of={}
for t in topics:
  for m in t['integratedOptions']:
    top_of.setdefault(m,t)
    if m in ch and ch[m].get('isCluster'):
      for mm in ch[m]['integratedOptions']: top_of.setdefault(mm,t)
rows=[]
for r in fan.itertuples():
  c=ch.get(r.id)
  if c is None: kind='machine cluster from the previous run (now deleted)'
  elif c.get('isCluster'): kind=f"machine {c['derivedByPipeline']} cluster"
  else: kind='original'
  t=top_of.get(r.id); s=syn_of.get(r.id)
  rows.append(dict(id=r.id,text=r.text,kind=kind,fan=r.f1,fan2=r.f2,topic=t['statement'] if t else '',syn=s['statement'] if s else ''))
R=pd.DataFrame(rows); O=R[R.kind=='original'].reset_index(drop=True); N=len(O)
# previous run, for old-vs-new
R1=pd.read_pickle('R.pkl'); O1=R1[R1.kind=='original'].set_index('id')
O['old_topic']=O.id.map(O1.topic).fillna(''); O['old_syn']=O.id.map(O1.syn.str.split(' | ',regex=False).str[0]).fillna('')

EN={'חיבור בין מחקר לעשייה':'Connecting research and practice',
'שתפ מחקר-חברה אזרחית':'Research–civil society partnership','חיבור בין אנשים שונים':'Connecting different people','הנגשת ידע':'Knowledge accessibility',
'תמריצים ותמיכות':'Incentives and support','מחויבות':'Commitment','פיתוח שפה משותפת':'Developing a shared language','חינוך':'Education','גורם מתכלל':'Coordinating body',
'פעילות בעלת אורינטציה פרקטית':'Practically oriented activity',
'צרו מפגשים פיזיים המחברים בין אנשי אקדמיה, אנשי עשייה ובעלי רעיונות שונים':'Hold in-person meetings connecting academics, practitioners and people with different ideas',
'קיימו מפגשים פיזיים לחיבור בין אנשי אקדמיה, אנשי עשייה ובעלי רעיונות שונים':'Hold in-person meetings connecting academics, practitioners and people with different ideas',
'עודדו מחקר מהשטח להצפת אתגרים, חיבור לקהילה האקדמית ופיתוח פתרונות':'Encourage field-based research that surfaces challenges and develops solutions',
'בנו מחקר סביב שאלות הנובעות מהתבוננות עמוקה בצורכי השטח':'Build research around questions drawn from close observation of field needs',
'הקצו משאבים כספיים וחומריים לביצוע מחקר ולתמיכה במיזמי שינוי':'Allocate funds and materials for research and change projects',
'התאימו את שפת החינוך הסביבתי והכשירו מורים במגזר החרדי':'Adapt environmental-education language and train teachers in the Haredi sector',
'שלבו ידע, מעורבות ולהט כדי להפוך מחקר לשינוי סביבתי':'Combine knowledge, involvement and passion to turn research into environmental change',
'חברו בין חשיבה מערכתית, חזון וביצוע כדי להפוך מחקר לשינוי במציאות':'Link systems thinking, vision and execution',
'טפחו קשרים אישיים בין חוקרים לבין השטח כדי להפוך מחקר לשינוי':'Foster personal ties between researchers and the field',
'צרו קשרים אישיים עם חוקרים כדי לחבר בין המחקר לשינוי במציאות':'Create personal ties with researchers',
'מנו גורם מקשר בין המחקר, המדע והרגולציה לבין מבצעי המשימה בשטח':'Appoint a liaison between research, regulation and field implementers',
'פתחו פלטפורמות לחיבור בין מיידעים ולטיפוח שיתוף פעולה מוצלח':'Develop platforms that connect information sources and foster collaboration',
'הקימו גשר קבוע בין האקדמיה, הקהילה, החברה האזרחית והממשלה':'Build a permanent bridge between academia, community, civil society and government',
'פתחו מערכות מידע אמין כדי לצמצם את ואקום המידע ולהניע שינוי':'Develop reliable information systems to close the information gap',
'מפו את המקום בשכבות מידע כדי לזהות צרכים ולשנות את המציאות':'Map the place in data layers to identify needs',
'הקימו ופַתחו שותפויות מחקר בין האקדמיה, התעשייה והארגונים החברתיים':'Build research partnerships between academia, industry and social organisations',
'קידום מחקר טרנס־דיסציפלינרי להעמקת הידע ולפיתוח פתרונות חדשניים':'Promote transdisciplinary research',
'הקימו פורומים של חוקרים וחברו מחקר מקומי ועולמי למאבקים סביבתיים':'Set up researcher forums linking research to environmental campaigns',
'כנסו בעלי עניין מגוונים באופן תקופתי לבניית תרבות דיון והסכמות':'Convene diverse stakeholders regularly to build a culture of dialogue',
'שלבו משתמשי קצה בתהליך המחקר והפכו את הידע לכלי יישומי לשינוי המציאות':'Involve end users in research and turn knowledge into practical tools'}
def labs(r): return {r.fan}|({r.fan2} if r.fan2 else set())
def pairstats(col,ref='fan'):
  mt=ft=both=0
  for i,j in itertools.combinations(range(N),2):
    a,b=O.iloc[i],O.iloc[j]
    m=a[col]!='' and a[col]==b[col]
    f=bool(labs(a)&labs(b)) if ref=='fan' else (a[ref]!='' and a[ref]==b[ref])
    mt+=m; ft+=f; both+=m and f
  sing=[v if v else f'_s{i}' for i,v in enumerate(O[col])]
  cov=O[col]!=''
  return dict(k=O[col][cov].nunique(),cov=int(cov.sum()),prec=both/mt if mt else 0,rec=both/ft if ft else 0,ari=ari(O.fan,sing))
T=pairstats('topic'); S=pairstats('syn'); T1=pairstats('old_topic'); S1=pairstats('old_syn')
fsizes=O.fan.value_counts(); fk=len(fsizes); fsingle=int((fsizes==1).sum())
# merge-group purity
groups=[]
for s,g in O[O.syn!=''].groupby('syn'):
  c=Counter(g.fan); shared=set.intersection(*[labs(r) for r in g.itertuples()])
  groups.append(dict(name=s,n=len(g),k=len(c),top=c.most_common(1)[0][1]/len(g),pure=bool(shared)))
pure=sum(g['pure'] for g in groups)
old_pairs={frozenset(g.id) for s,g in O[O.old_syn!=''].groupby('old_syn')}
new_pairs={frozenset(g.id) for s,g in O[O.syn!=''].groupby('syn')}
def pairset(P): return {frozenset(p) for G in P for p in itertools.combinations(sorted(G),2)}
kept=len(pairset(old_pairs)&pairset(new_pairs)); oldn=len(pairset(old_pairs)); newn=len(pairset(new_pairs))
ari_old_new=ari([v or f'_s{i}' for i,v in enumerate(O.old_syn)],[v or f'_s{i}' for i,v in enumerate(O.syn)])
print(T,S,T1,S1,len(groups),pure,kept,oldn,newn,ari_old_new)
unc=Counter(O[O.topic==''].fan)
json.dump(dict(T=T,S=S),open('metrics2.json','w'))

# ---------- Excel / CSV ----------
out='/Users/talyaron/Downloads/'; stem='machine_clustering_v2_Bq-VQPMPiG7b'
mc=pd.DataFrame([{'statementId':'Bq-VQPMPiG7b','הגד מלא':Q,'Machine cluster (topic)':'','Machine sub-cluster (merge group)':'','Row type':'question'}]+
 [{'statementId':r.id,'הגד מלא':r.text,'Machine cluster (topic)':r.topic,'Machine sub-cluster (merge group)':r.syn,'Row type':r.kind} for r in R.itertuples()])
sbs=pd.DataFrame([{'statementId':r.id,'הגד מלא':r.text,"Fanny's cluster":r.fan,"Fanny's 2nd cluster":r.fan2,'Machine cluster (topic)':r.topic or '(not clustered)','Machine sub-cluster (merge group)':r.syn,
  'Previous machine topic':r.old_topic or '(not clustered)','Previous machine merge group':r.old_syn} for r in O.itertuples()])
tsum=[]
for t,g in O[O.topic!=''].groupby('topic'):
  c=Counter(g.fan); top=c.most_common(1)[0]
  tsum.append({'Machine cluster':t,'English':EN.get(t,''),'Statements':len(g),"Most common Fanny cluster":top[0],'Share':round(top[1]/len(g),2),'Fanny clusters inside':len(c)})
fsum=[]
for f,n in fsizes.items():
  g=O[O.fan==f]; c=Counter(x or '(not clustered)' for x in g.topic); top=c.most_common(1)[0]
  fsum.append({"Fanny's cluster":f,'English':EN.get(f,''),'Statements':n,'Main machine cluster':top[0],'Share':round(top[1]/n,2),'Not clustered by machine':int((g.topic=='').sum()),
   'In a merge group':int((g.syn!='').sum())})
gsum=pd.DataFrame([{'Merge group':g['name'],'English':EN.get(g['name'],''),'Statements':g['n'],'Fanny clusters inside':g['k'],'Shares a Fanny cluster':'yes' if g['pure'] else 'no'} for g in groups])
dup=pd.DataFrame([{'Dropped merge group':c['statement'],'id':c['statementId'],'Members':', '.join(c['integratedOptions'])} for c in dropped])
with pd.ExcelWriter(out+stem+'.xlsx') as w:
  mc.to_excel(w,sheet_name='Machine clustering',index=False); sbs.to_excel(w,sheet_name='Side by side',index=False)
  pd.DataFrame(tsum).to_excel(w,sheet_name='Machine vs Fanny',index=False); pd.DataFrame(fsum).to_excel(w,sheet_name='Fanny vs Machine',index=False)
  gsum.to_excel(w,sheet_name='Merge groups',index=False); dup.to_excel(w,sheet_name='Duplicate groups',index=False)
mc.to_csv(out+stem+'.csv',index=False,encoding='utf-8-sig')

# ---------- Report ----------
e=html.escape; pct=lambda x:f'{100*x:.0f}%'
def he(s): return f'<span dir="rtl" class="he">{e(s)}</span>'
def lab(s): return he(s)+(f'<br><span class="en">{e(EN[s])}</span>' if s in EN else '')
TOPIC=topics[0]['statement']; tshare=T['cov']/N
frows=''.join(f"<tr><td>{lab(r[chr(70)+'anny'+chr(39)+'s cluster'])}</td><td class=n>{r['Statements']}</td><td class=n>{r['Statements']-r['Not clustered by machine']}</td><td class=n>{r['Not clustered by machine']}</td><td class=n>{r['In a merge group']}</td></tr>" for r in fsum if r['Statements']>=3)
srows=''.join(f"<tr><td>{lab(g['name'])}</td><td class=n>{g['n']}</td><td class=n>{g['k']}</td><td class=n>{'yes' if g['pure'] else 'no'}</td></tr>" for g in sorted(groups,key=lambda g:(not g['pure'],-g['n'])))
g_=lambda f,col:int(((O.fan==f)&(O[col]!='')).sum())
H=f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page{{size:A4;margin:18mm 17mm}} body{{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;color:#1d2433;line-height:1.45}}
h1{{font-size:19pt;margin:0 0 2pt}} h2{{font-size:13pt;margin:16pt 0 5pt;border-bottom:1px solid #ccd;padding-bottom:2pt}}
.sub{{color:#556;margin-bottom:10pt}} table{{border-collapse:collapse;width:100%;margin:5pt 0 8pt;font-size:9.5pt}} tr{{page-break-inside:avoid}}
th,td{{border:1px solid #d5d9e2;padding:3.5pt 5pt;vertical-align:top;text-align:left}} th{{background:#eef1f6}} td.n{{text-align:right;white-space:nowrap}}
.he{{font-family:Arial,sans-serif}} .en{{color:#667;font-size:8.5pt}} .box{{background:#f5f7fb;border:1px solid #dde2ec;padding:7pt 10pt;margin:6pt 0}}
.note{{color:#556;font-size:9pt}} ul{{margin:3pt 0;padding-left:16pt}} li{{margin:2pt 0}} .keep{{page-break-inside:avoid}}
</style></head><body>
<h1>Human vs. Machine Clustering — after re-clustering</h1>
<div class="sub">Question <b>Bq-VQPMPiG7b</b> · Freedi / WizCol · machine clustering re-built on 18 September 2026 with the online placement pipeline described in <i>Geometry Proposes, Judgement Disposes</i></div>
<div class="box"><b>Question:</b> {he(Q)}<br><span class="en">“Which conditions and factors you identified would enable harnessing the power of research to change reality? Suggest actions, tools, events, routines, etc.”</span></div>

<h2>1. Summary</h2>
<ul>
<li>Both clusterings cover the same <b>{N} participant statements</b>.</li>
<li><b>Fanny's clustering</b> sorts statements by theme: <b>{fk} clusters</b>, every statement assigned, {fsingle} clusters of a single statement.</li>
<li><b>The machine now works mainly as a paraphrase detector.</b> It formed <b>{S['k']} merge groups</b> (statements judged to make the same proposal), covering {S['cov']} statements, and <b>one broad theme</b>, <i>{e(EN[TOPIC])}</i>, holding {T['cov']} statements ({pct(tshare)}). {N-T['cov']} statements stand alone.</li>
<li><b>Merge groups agree with Fanny about half the time:</b> in {pure} of {len(groups)} groups all members share a Fanny cluster (pair precision {pct(S['prec'])}, up from {pct(S1['prec'])} before re-clustering). They cover only {pct(S['rec'])} of the pairs Fanny grouped, which is expected: “same proposal” is much narrower than “same theme”.</li>
<li><b>The single theme adds little thematic structure:</b> it contains {T['k'] and len(set(O[O.topic!=''].fan))} of Fanny's {fk} clusters, so its precision is {pct(T['prec'])} (ARI {T['ari']:.2f}).</li>
</ul>

<h2>2. Data and method</h2>
<p><b>Fanny's clustering</b> — <i>statements_full.xlsx</i>: 142 labelled rows. 114 are original participant statements. The other 27 were cluster statements from the previous machine run; they are not participant input, and the re-clustering deleted them, so they are excluded. One row had a label and no statement.</p>
<p><b>Machine clustering</b> — read from the live database after the admin “Re-cluster from scratch” run (queue: 114 statements, 0 failures). The run dissolves all earlier clusters and streams every statement through the placement cascade of the paper: synthesis attach (P1), synthesis spawn (P2), then judged theme filing (P3). It produces two layers:</p>
<ul>
<li><b>Merge groups</b> (P1/P2): statements an LLM judge ruled <i>same</i> — one proposal in different words. 20 visible groups; two of them are duplicates (see §5), leaving {S['k']} distinct groups.</li>
<li><b>Themes</b> (P3): statements filed under a broader topic. One theme was formed.</li>
</ul>
<p><b>Comparison.</b> For every pair of statements we ask whether each clustering puts them together. <i>Coverage</i> is the share of Fanny's pairs the machine also joined; <i>precision</i> is the share of the machine's pairs Fanny also joined (a shared second label counts). ARI is the Adjusted Rand Index (0 = chance, 1 = identical), with unclustered statements as clusters of one.</p>

<table class="keep"><tr><th></th><th>Fanny</th><th>Machine theme</th><th>Machine merge groups</th></tr>
<tr><td>Clusters</td><td class=n>{fk}</td><td class=n>{T['k']}</td><td class=n>{S['k']}</td></tr>
<tr><td>Statements clustered</td><td class=n>{N} (100%)</td><td class=n>{T['cov']} ({pct(T['cov']/N)})</td><td class=n>{S['cov']} ({pct(S['cov']/N)})</td></tr>
<tr><td>Average cluster size</td><td class=n>{N/fk:.1f}</td><td class=n>{T['cov']/T['k']:.1f}</td><td class=n>{S['cov']/S['k']:.1f}</td></tr>
<tr><td>Coverage of Fanny's pairs</td><td class=n>—</td><td class=n>{pct(T['rec'])}</td><td class=n>{pct(S['rec'])}</td></tr>
<tr><td>Precision (pairs Fanny agrees with)</td><td class=n>—</td><td class=n>{pct(T['prec'])}</td><td class=n>{pct(S['prec'])}</td></tr>
<tr><td>Adjusted Rand Index</td><td class=n>—</td><td class=n>{T['ari']:.2f}</td><td class=n>{S['ari']:.2f}</td></tr></table>

<h2>3. Results</h2>
<p><b>3.1 Merge groups.</b> A merge group claims its members make the same proposal, so they should share a Fanny cluster.</p>
<table><tr><th>Merge group</th><th>Statements</th><th>Fanny clusters inside</th><th>Share a Fanny cluster</th></tr>{srows}</table>
<p><b>3.2 Fanny's main clusters, seen through the machine.</b> Clusters with 3 or more statements.</p>
<table><tr><th>Fanny's cluster</th><th>Statements</th><th>In the machine theme</th><th>Not in the theme</th><th>In a merge group</th></tr>{frows}</table>

<h2>4. Main findings</h2>
<ul>
<li><b>Paraphrase detection partly matches human judgement.</b> {pure} of {len(groups)} merge groups sit inside one of Fanny's clusters. The other {len(groups)-pure} each join two statements that Fanny filed under two different, related clusters — e.g. <i>Appoint a liaison between research, regulation and field implementers</i> joins one statement from <i>Connecting different people</i> and one from <i>Coordinating body</i>. Here the machine and Fanny classify by different things: the machine by the proposed action, Fanny by the underlying aspect.</li>
<li><b>One theme instead of many.</b> The theme <i>{e(EN[TOPIC])}</i> took {pct(tshare)} of the statements and {len(set(O[O.topic!=''].fan))} of Fanny's clusters. A likely reason: in the paper's cascade, spawning new themes (P5) is disabled and theme filing (P3) only files into existing themes, so once the first theme exists, related statements are filed into it and no second theme forms. For thematic analysis, Fanny's clustering is far richer.</li>
<li><b>What stays outside.</b> {N-T['cov']} statements are in no theme. Fanny's <i>Commitment</i> cluster is again the clearest case ({unc.get('מחויבות',0)} of 7 left out), along with most of her one-statement clusters — personal and value-based conditions rather than concrete actions.</li>
<li><b>Fanny's largest clusters are mostly inside the theme.</b> <i>Research–civil society partnership</i> ({g_('שתפ מחקר-חברה אזרחית','topic')} of 30) and <i>Connecting different people</i> ({g_('חיבור בין אנשים שונים','topic')} of 10) are almost all in the theme; within them the machine found several finer merge groups (partnerships, personal ties, physical meetings, a permanent bridge).</li>
</ul>

<h2>5. Change from the previous machine clustering</h2>
<table class="keep"><tr><th></th><th>Previous run (Aug 2026)</th><th>After re-clustering</th></tr>
<tr><td>Themes / topic clusters</td><td class=n>4</td><td class=n>{T['k']}</td></tr>
<tr><td>Statements in a theme</td><td class=n>{T1['cov']} ({pct(T1['cov']/N)})</td><td class=n>{T['cov']} ({pct(T['cov']/N)})</td></tr>
<tr><td>Merge groups (distinct)</td><td class=n>{S1['k']}</td><td class=n>{S['k']}</td></tr>
<tr><td>Statements in a merge group</td><td class=n>{S1['cov']}</td><td class=n>{S['cov']}</td></tr>
<tr><td>Average merge group size</td><td class=n>{S1['cov']/S1['k']:.1f}</td><td class=n>{S['cov']/S['k']:.1f}</td></tr>
<tr><td>Merge-group precision vs. Fanny</td><td class=n>{pct(S1['prec'])}</td><td class=n>{pct(S['prec'])}</td></tr>
<tr><td>Theme precision vs. Fanny</td><td class=n>{pct(T1['prec'])}</td><td class=n>{pct(T['prec'])}</td></tr></table>
<p>The previous run had one merge group of 18 statements and one of 7 — the “snowball” pattern the paper describes. The new run has no group above 3, and merge-group precision rose from {pct(S1['prec'])} to {pct(S['prec'])}. Only {kept} of the {oldn} statement pairs merged in the previous run are still merged (most of those pairs came from the 18-statement group).</p>
<p class="note"><b>Two quirks in the new output:</b> two merge groups have exactly the same two members (<i>Hold in-person meetings…</i>, ids 1aw2Ct9zn63t and qgAihJACKhzM), and one pair group (iBlnoq55k9M0) is contained in a three-member group (KTs-oiWginDO). Both were counted once. They look like a defect in the rebuild and are listed in the Excel sheet “Duplicate groups”.</p>

<h2>6. Limitations</h2>
<ul class="note">
<li>One human coder; human–human agreement is unknown and is the natural baseline.</li>
<li>Fanny's clusters are thematic; the machine's main layer detects paraphrases. The two answer different questions, so low coverage for merge groups is expected, not a failure.</li>
<li>Streaming placement can depend on arrival order; this is a single run.</li>
<li>Fanny's labels were used as written; close variants count as different clusters.</li>
</ul>

<h2>7. Files</h2>
<p class="note"><i>{stem}.xlsx</i> — “Machine clustering” in the same layout as Fanny's file; “Side by side” (Fanny, new machine, previous machine); “Machine vs Fanny”; “Fanny vs Machine”; “Merge groups”; “Duplicate groups”. <i>{stem}.csv</i> — the first sheet as CSV. The previous report and files are kept unchanged.</p>
</body></html>"""
open('report2.html','w').write(H)
