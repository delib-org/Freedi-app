import pandas as pd, itertools, json, html
from collections import Counter
from sklearn.metrics import adjusted_rand_score as ari
R=pd.read_pickle('R.pkl'); Q=json.load(open('meta.json'))['q']
R['syn1']=R.syn.str.split(' | ',regex=False).str[0].fillna('')
O=R[R.kind=='original'].reset_index(drop=True); N=len(O)
EN={'שיתופי פעולה בין בעלי עניין':'Collaboration between stakeholders','הנגשת ידע מחקרי לציבור':'Making research knowledge accessible to the public',
'תמריצים כלכליים ליישום שינוי':'Economic incentives for implementing change','מיפוי וניתוח מידע מקדים':'Preliminary mapping and data analysis',
'שתפ מחקר-חברה אזרחית':'Research–civil society partnership','חיבור בין אנשים שונים':'Connecting different people','הנגשת ידע':'Knowledge accessibility',
'תמריצים ותמיכות':'Incentives and support','מחויבות':'Commitment','פיתוח שפה משותפת':'Developing a shared language','חינוך':'Education','גורם מתכלל':'Coordinating body',
'פעילות בעלת אורינטציה פרקטית':'Practically oriented activity',
'הכשירו מורים לחינוך סביבתי בשפה המותאמת למגזר החרדי':'Train teachers in environmental education, in language suited to the Haredi sector',
'הנגישו ידע רלוונטי בוובינרים קבועים לצמצום ואקום המידע בנושא':'Share relevant knowledge in regular webinars',
'הפעילו תמריצים ותמיכות כלכליים לקידום ביצוע השינוי בפועל':'Use economic incentives and support to drive change',
'הקימו פורום תקופתי של בעלי עניין לדיון ולהסכמות':'Set up a periodic stakeholder forum',
'להפעיל מדע אזרחי לשילוב ידע ומעורבות לשינוי סביבתי':'Use citizen science to combine knowledge and involvement',
'לקדם מחקר מלמטה־למעלה באמצעות הצפת אתגרי השטח ופיתוח פתרונות':'Promote bottom-up research that starts from field challenges',
'צרו שידוכים אישיים בין חוקרים, חברה אזרחית ומשרדי ממשלה':'Create personal matches between researchers, civil society and government',
'קדמו מחקר טרנס־דיסציפלינרי לפיתוח פתרונות מורכבים וחדשניים':'Promote transdisciplinary research',
'רתמו את הקהילה לשיתוף פעולה בשיעורי המדעים בבית הספר':'Involve the community in school science lessons'}
def labs(r): return {r.fan}|({r.fan2} if r.fan2 else set())
def pairstats(col):
  mt=ft=both=0
  for i,j in itertools.combinations(range(N),2):
    a,b=O.iloc[i],O.iloc[j]
    m=a[col]!='' and a[col]==b[col]; f=bool(labs(a)&labs(b))
    mt+=m; ft+=f; both+=m and f
  sing=[v if v else f'_s{i}' for i,v in enumerate(O[col])]
  cov=O[col]!=''
  return dict(k=O[col][cov].nunique(),cov=int(cov.sum()),prec=both/mt,rec=both/ft,ari=ari(O.fan,sing),mt=mt,ft=ft,both=both)
T=pairstats('topic'); S=pairstats('syn1')
fsizes=O.fan.value_counts(); fk=len(fsizes); fsingle=int((fsizes==1).sum())
print(T,S,fk,fsingle)

# ---------- Excel / CSV ----------
out='/Users/talyaron/Downloads/'
mc=pd.DataFrame([{'statementId':'Bq-VQPMPiG7b','הגד מלא':Q,'Machine cluster (topic)':'','Machine sub-cluster (merge group)':'','Row type':'question'}]+
 [{'statementId':r.id,'הגד מלא':r.text,'Machine cluster (topic)':r.topic,'Machine sub-cluster (merge group)':r.syn,'Row type':r.kind} for r in R.itertuples()])
sbs=pd.DataFrame([{'statementId':r.id,'הגד מלא':r.text,"Fanny's cluster":r.fan,"Fanny's 2nd cluster":r.fan2,'Machine cluster (topic)':r.topic or '(not clustered)','Machine sub-cluster (merge group)':r.syn} for r in O.itertuples()])
tsum=[]
for t,g in O[O.topic!=''].groupby('topic'):
  c=Counter(g.fan); top=c.most_common(1)[0]
  tsum.append({'Machine cluster':t,'English':EN.get(t,''),'Statements':len(g),"Most common Fanny cluster":top[0],'Share':round(top[1]/len(g),2),'Fanny clusters inside':len(c)})
fsum=[]
for f,n in fsizes.items():
  g=O[O.fan==f]; c=Counter(x or '(not clustered)' for x in g.topic); top=c.most_common(1)[0]
  fsum.append({"Fanny's cluster":f,'English':EN.get(f,''),'Statements':n,'Main machine cluster':top[0],'Share':round(top[1]/n,2),'Not clustered by machine':int((g.topic=='').sum())})
with pd.ExcelWriter(out+'machine_clustering_Bq-VQPMPiG7b.xlsx') as w:
  mc.to_excel(w,sheet_name='Machine clustering',index=False); sbs.to_excel(w,sheet_name='Side by side',index=False)
  pd.DataFrame(tsum).to_excel(w,sheet_name='Machine vs Fanny',index=False); pd.DataFrame(fsum).to_excel(w,sheet_name='Fanny vs Machine',index=False)
mc.to_csv(out+'machine_clustering_Bq-VQPMPiG7b.csv',index=False,encoding='utf-8-sig')

# ---------- Report HTML ----------
e=html.escape; pct=lambda x:f'{100*x:.0f}%'
def he(s): return f'<span dir="rtl" class="he">{e(s)}</span>'
def lab(s): return he(s)+(f'<br><span class="en">{e(EN[s])}</span>' if s in EN else '')
trows=''.join(f"<tr><td>{lab(r['Machine cluster'])}</td><td class=n>{r['Statements']}</td><td class=n>{r['Fanny clusters inside']}</td><td>{lab(r['Most common Fanny cluster'])}</td><td class=n>{pct(r['Share'])}</td></tr>" for r in sorted(tsum,key=lambda r:-r['Statements']))
frows=''.join(f"<tr><td>{lab(r[chr(70)+'anny'+chr(39)+'s cluster'])}</td><td class=n>{r['Statements']}</td><td>{lab(r['Main machine cluster']) if r['Main machine cluster']!='(not clustered)' else 'not clustered'}</td><td class=n>{pct(r['Share'])}</td><td class=n>{r['Not clustered by machine']}</td></tr>" for r in fsum if r['Statements']>=3)
srows=''
for s,g in O[O.syn1!=''].groupby('syn1'):
  c=Counter(g.fan); top=c.most_common(1)[0]
  srows+=f"<tr><td>{lab(s)}</td><td class=n>{len(g)}</td><td class=n>{len(c)}</td><td class=n>{pct(top[1]/len(g))}</td></tr>"
unc=Counter(O[O.topic==''].fan)
big_share=(O.topic=='שיתופי פעולה בין בעלי עניין').mean()
H=f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page{{size:A4;margin:18mm 17mm}} body{{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;color:#1d2433;line-height:1.45}}
h1{{font-size:19pt;margin:0 0 2pt}} h2{{font-size:13pt;margin:16pt 0 5pt;border-bottom:1px solid #ccd;padding-bottom:2pt}}
.sub{{color:#556;margin-bottom:10pt}} table{{border-collapse:collapse;width:100%;margin:5pt 0 8pt;font-size:9.5pt;page-break-inside:auto}} tr{{page-break-inside:avoid}}
th,td{{border:1px solid #d5d9e2;padding:3.5pt 5pt;vertical-align:top;text-align:left}} th{{background:#eef1f6}} td.n{{text-align:right;white-space:nowrap}}
.he{{font-family:Arial,'Arial Hebrew',sans-serif}} .en{{color:#667;font-size:8.5pt}} .box{{background:#f5f7fb;border:1px solid #dde2ec;padding:7pt 10pt;margin:6pt 0}}
.note{{color:#556;font-size:9pt}} ul{{margin:3pt 0;padding-left:16pt}} li{{margin:2pt 0}}
</style></head><body>
<h1>Human vs. Machine Clustering</h1>
<div class="sub">Question <b>Bq-VQPMPiG7b</b> · Freedi / WizCol · report generated 18 September 2026</div>
<div class="box"><b>Question:</b> {he(Q)}<br><span class="en">“Which conditions and factors you identified would enable harnessing the power of research to change reality? Suggest actions, tools, events, routines, etc.”</span></div>

<h2>1. Summary</h2>
<ul>
<li>Both clusterings cover the same <b>{N} participant statements</b>.</li>
<li><b>Fanny's clustering</b> is fine-grained: <b>{fk} clusters</b>, every statement assigned, {fsingle} clusters hold a single statement.</li>
<li><b>Machine clustering</b> is coarse: <b>{T['k']} topic clusters</b> covering {T['cov']} of {N} statements ({pct(T['cov']/N)}); {N-T['cov']} statements were left unclustered. One topic, <i>Collaboration between stakeholders</i>, holds {pct(big_share)} of all statements.</li>
<li>Agreement is <b>moderate at the broad level and low at the fine level</b>: when Fanny put two statements together, the machine also did so {pct(T['rec'])} of the time; but only {pct(T['prec'])} of the pairs the machine grouped were grouped by Fanny (Adjusted Rand Index {T['ari']:.2f}).</li>
<li>The main difference is <b>granularity</b>, not direction: the machine's large clusters mostly contain Fanny's related clusters, rather than cutting across them.</li>
</ul>

<h2>2. Data and method</h2>
<p><b>Fanny's clustering</b> — the file <i>statements_full.xlsx</i>: 142 rows, each with a cluster label (6 rows also have a second label). 114 rows are the original participant statements. The other 27 rows are statements the system itself generated (merged or summary cluster statements); they were left out of the comparison because they are not participant input. One row had a label but no statement, and was ignored.</p>
<p><b>Machine clustering</b> — read from the live Freedi database on 18 September 2026 (visible clusters only). The system builds two layers:</p>
<ul>
<li><b>Topic clusters</b> (4): broad themes. They are the unit of comparison, since they match what Fanny did — sorting statements into themes.</li>
<li><b>Merge groups</b> (9): small groups of near-duplicate statements that the system merged into one improved statement. Every merge group sits inside a topic cluster. 14 older, hidden merge groups were ignored.</li>
</ul>
<p><b>Comparison.</b> We compare every pair of statements: are they in the same cluster in Fanny's version? In the machine's? Two simple numbers follow:
<i>coverage</i> — of the pairs Fanny grouped, the share the machine also grouped; and <i>precision</i> — of the pairs the machine grouped, the share Fanny also grouped (a shared second label counts). We also report the Adjusted Rand Index (ARI: 0 = chance, 1 = identical); unclustered statements count as clusters of one.</p>

<table style="page-break-inside:avoid"><tr><th></th><th>Fanny</th><th>Machine topics</th><th>Machine merge groups</th></tr>
<tr><td>Clusters</td><td class=n>{fk}</td><td class=n>{T['k']}</td><td class=n>{S['k']}</td></tr>
<tr><td>Statements clustered</td><td class=n>{N} (100%)</td><td class=n>{T['cov']} ({pct(T['cov']/N)})</td><td class=n>{S['cov']} ({pct(S['cov']/N)})</td></tr>
<tr><td>Average cluster size</td><td class=n>{N/fk:.1f}</td><td class=n>{T['cov']/T['k']:.1f}</td><td class=n>{S['cov']/S['k']:.1f}</td></tr>
<tr><td>Coverage of Fanny's pairs</td><td class=n>—</td><td class=n>{pct(T['rec'])}</td><td class=n>{pct(S['rec'])}</td></tr>
<tr><td>Precision (pairs Fanny agrees with)</td><td class=n>—</td><td class=n>{pct(T['prec'])}</td><td class=n>{pct(S['prec'])}</td></tr>
<tr><td>Adjusted Rand Index</td><td class=n>—</td><td class=n>{T['ari']:.2f}</td><td class=n>{S['ari']:.2f}</td></tr></table>

<h2>3. Results</h2>
<p><b>3.1 Machine topics, seen through Fanny's clusters.</b> For each machine topic: how many of Fanny's clusters it contains, and the largest one.</p>
<table><tr><th>Machine topic</th><th>Statements</th><th>Fanny clusters inside</th><th>Largest Fanny cluster</th><th>Share</th></tr>{trows}</table>
<p><b>3.2 Fanny's main clusters, seen through the machine.</b> Clusters with 3 or more statements.</p>
<table><tr><th>Fanny's cluster</th><th>Statements</th><th>Main machine topic</th><th>Share</th><th>Not clustered</th></tr>{frows}</table>
<p><b>3.3 Machine merge groups.</b> These are near-duplicates, so a good match means all members share one Fanny cluster.</p>
<table><tr><th>Merge group</th><th>Statements</th><th>Fanny clusters inside</th><th>Share in largest</th></tr>{srows}</table>

<h2>4. Main findings</h2>
<ul>
<li><b>Same broad themes.</b> Fanny's two largest clusters, <i>Research–civil society partnership</i> and <i>Connecting different people</i>, sit almost entirely inside the machine's <i>Collaboration between stakeholders</i> ({26} of 30 and 9 of 10). For <i>Knowledge accessibility</i> the match is weaker: of its 8 statements, 3 went to the machine's knowledge topic, 1 to collaboration, and 4 were not clustered.</li>
<li><b>Different granularity.</b> Fanny used {fk} clusters, many of them small and conceptual (e.g. <i>Commitment</i>, <i>Developing a shared language</i>, <i>Character traits</i>). The machine used 4, and one topic absorbed {pct(big_share)} of all statements. This alone explains most of the low precision: the machine joins many pairs that Fanny kept apart.</li>
<li><b>What the machine missed.</b> {N-T['cov']} statements received no machine topic. Fanny's <i>Commitment</i> cluster is the clearest gap: {unc.get('מחויבות',0)} of its 7 statements were left out, and the machine formed no comparable theme. The rest of the unclustered statements are mostly ones Fanny placed in clusters of one or two.</li>
<li><b>Incentives split.</b> Fanny's <i>Incentives and support</i> (8) is split: 1 in the machine's incentives topic, 3 in the collaboration topic, 4 unclustered. The machine's incentives topic has only 2 statements.</li>
<li><b>Merge groups are focused on content, not theme.</b> Most merge groups join exactly 2 statements that Fanny placed in 2 different but related clusters (e.g. <i>Education</i> + <i>Shared language</i> for teacher training in the Haredi sector). They describe the same proposal, which Fanny classified by different aspects.</li>
</ul>

<h2>5. Limitations</h2>
<ul class="note">
<li>One human coder; no second human rating, so human–human agreement is unknown and is the natural baseline to add.</li>
<li>The machine clustering is a live snapshot; the system keeps updating clusters as new statements and votes arrive.</li>
<li>Fanny's labels were used as written; close variants (e.g. <i>Knowledge accessibility</i> and <i>Activity for knowledge accessibility</i>) count as different clusters, which lowers agreement slightly.</li>
<li>One statement belongs to two machine merge groups; for the pair counts it was assigned to the first.</li>
</ul>

<h2>6. Files</h2>
<p class="note"><i>machine_clustering_Bq-VQPMPiG7b.xlsx</i> — sheet “Machine clustering” in the same layout as Fanny's file, plus “Side by side”, “Machine vs Fanny” and “Fanny vs Machine”. <i>machine_clustering_Bq-VQPMPiG7b.csv</i> — the first sheet as CSV.</p>
</body></html>"""
open('report.html','w').write(H)
