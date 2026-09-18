# -*- coding: utf-8 -*-
"""
דוח בעברית: החלוקה של פאני מול חלוקת המכונה, לאור מסגור השאלה.
קלט: תמונת־מצב של השאלה אחרי סבב הפיצול והאיחוד (split-run1-consolidated.json).
פלט: HTML + PDF ב־~/Downloads.

  venv/bin/python buildFramingReportHe.py <snapshot.json> [out-stem]
"""
import html
import json
import subprocess
import sys
from collections import Counter, OrderedDict

import pandas as pd

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from scoreVsFanny import score  # noqa: E402

snap_path = sys.argv[1]
stem = sys.argv[2] if len(sys.argv) > 2 else '/Users/talyaron/Downloads/clustering_framing_report_he_Bq-VQPMPiG7b'

out = score(snap_path, dump=True)
R = pd.DataFrame(out['rows'])
d = json.load(open(snap_path))
ch = {c['statementId']: c for c in d['children']}
theme_title = {t['id']: t['title'] for t in out['themes']}
theme_desc = {t['id']: ch[t['id']].get('description', '') for t in out['themes']}
syn_title = {c['statementId']: c['statement'] for c in d['children']
             if c.get('isCluster') and not c.get('hide') and c.get('derivedByPipeline') == 'synthesis'}
R['theme_t'] = R.theme.map(theme_title).fillna('')
N = len(R)
T, S = out['theme'], out['syn']
fsizes = R.fan.value_counts()
FK, FSING = len(fsizes), int((fsizes == 1).sum())
Q = d['question']['statement']

e = html.escape


def pct(x):
    return f'{100 * x:.0f}%'


def stmt_list(rows, with_label=None):
    items = []
    for r in rows.itertuples():
        lab = ''
        if with_label == 'fan':
            lab = f' <span class="tag">{e(r.fan)}</span>'
        elif with_label == 'machine':
            lab = f' <span class="tag">{e(r.theme_t) if r.theme_t else "לא שויך לנושא"}</span>'
        items.append(f'<li>{e(r.text)}{lab}</li>')

    return '<ul class="stm">' + ''.join(items) + '</ul>'


# ---------- 4.1 האשכול הגדול של פאני ----------
BIG = 'שתפ מחקר-חברה אזרחית'
big = R[R.fan == BIG]
big_spread = ''
for t, g in sorted(big.groupby('theme_t'), key=lambda x: -len(x[1])):
    head = e(t) if t else 'לא שויך לנושא'
    big_spread += f'<tr><td class="hd">{head}<br><span class="n">{len(g)} היגדים</span></td><td>{stmt_list(g)}</td></tr>'

# ---------- 4.2 נושא מכונה שנבנה מאשכולות רבים של פאני ----------
MIX = 'התנסות, התמדה ולמידה מתמשכת'
mix = R[R.theme_t == MIX]
mix_k = mix.fan.nunique()

# ---------- 4.3 מחויבות ----------
COMMIT = 'מחויבות'
commit = R[R.fan == COMMIT]
commit_unthemed = int((commit.theme_t == '').sum())

# ---------- 4.4 יחידים ----------
sing = R[R.fan.map(fsizes) == 1]
sing_filed = int((sing.theme_t != '').sum())
sing_rows = ''.join(
    f'<tr><td>{e(r.fan)}</td><td>{e(r.text[:110])}{"…" if len(r.text) > 110 else ""}</td><td>{e(r.theme_t) if r.theme_t else "לא שויך"}</td></tr>'
    for r in sing.itertuples())

# ---------- נספח א: המכונה ----------
app_a = ''
for t in sorted(out['themes'], key=lambda x: -x['n']):
    g = R[R.theme == t['id']]
    groups = OrderedDict()
    for r in g.itertuples():
        groups.setdefault(r.syn, []).append(r)
    body = ''
    for sid, rows in groups.items():
        if sid:
            body += f'<div class="mg"><div class="mgt">קבוצת מיזוג: {e(syn_title.get(sid, ""))}</div><ul class="stm">'
            body += ''.join(f'<li>{e(r.text)} <span class="tag">{e(r.fan)}</span></li>' for r in rows)
            body += '</ul></div>'
    singles = groups.get('', [])
    if singles:
        body += '<ul class="stm">' + ''.join(f'<li>{e(r.text)} <span class="tag">{e(r.fan)}</span></li>' for r in singles) + '</ul>'
    c = Counter(g.fan)
    app_a += f'<div class="keep"><h4>{e(t["title"])} <span class="n">({len(g)} היגדים, {len(c)} אשכולות של פאני)</span></h4><p class="desc">{e(theme_desc.get(t["id"], ""))}</p>{body}</div>'
unthemed = R[R.theme == '']
app_a += f'<div class="keep"><h4>היגדים שהמכונה לא שייכה לשום נושא <span class="n">({len(unthemed)})</span></h4>' + stmt_list(unthemed, 'fan') + '</div>'

# ---------- נספח ב: פאני ----------
app_b = ''
for f, n in fsizes.items():
    g = R[R.fan == f]
    items = ''.join(
        f'<li>{e(r.text)}{(" <span class=&quot;tag2&quot;>תווית שנייה: " + e(r.fan2) + "</span>") if r.fan2 else ""} <span class="tag">{e(r.theme_t) if r.theme_t else "לא שויך"}</span></li>'
        for r in g.itertuples())
    app_b += f'<div class="keep"><h4>{e(f)} <span class="n">({n})</span></h4><ul class="stm">{items}</ul></div>'

H = f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@page{{size:A4;margin:18mm 17mm}}
body{{font-family:Arial,"Helvetica Neue",sans-serif;font-size:11pt;color:#1d2433;line-height:1.55;direction:rtl}}
h1{{font-size:20pt;margin:0 0 4pt}} h2{{font-size:14pt;margin:18pt 0 6pt;border-bottom:1px solid #ccd;padding-bottom:2pt}}
h3{{font-size:12pt;margin:12pt 0 4pt}} h4{{font-size:11.5pt;margin:12pt 0 3pt;color:#233}}
.sub{{color:#556;margin-bottom:12pt}} .n{{color:#667;font-weight:normal;font-size:9.5pt}}
table{{border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:10pt}} tr{{page-break-inside:avoid}}
th,td{{border:1px solid #d5d9e2;padding:4pt 6pt;vertical-align:top;text-align:right}} th{{background:#eef1f6}} td.num{{white-space:nowrap}}
td.hd{{width:24%;font-weight:bold;background:#f7f8fb}}
.box{{background:#f5f7fb;border:1px solid #dde2ec;padding:8pt 11pt;margin:8pt 0}}
ul{{margin:3pt 0;padding-right:18pt;padding-left:0}} li{{margin:2pt 0}}
ul.stm li{{font-size:9.8pt;margin:3pt 0}}
.tag{{display:inline-block;background:#e8eef9;color:#2b3f6b;border-radius:3px;padding:0 5px;font-size:8.5pt;margin-right:4pt;white-space:nowrap}}
.tag2{{display:inline-block;background:#f4ecd9;color:#5a4410;border-radius:3px;padding:0 5px;font-size:8.5pt;margin-right:4pt}}
.mg{{border-right:3px solid #c9d3ea;padding-right:8pt;margin:5pt 0}} .mgt{{font-size:9.5pt;color:#2b3f6b;font-weight:bold}}
.desc{{color:#556;font-size:9.5pt;margin:0 0 3pt}} .keep{{page-break-inside:avoid}} .note{{color:#556;font-size:9.5pt}}
.pb{{page-break-before:always}}
</style></head><body>

<h1>שתי דרכים לחלק 114 היגדים: נושא מול פעולה</h1>
<div class="sub">השוואה בין החלוקה הידנית של פאני לבין חלוקת המכונה בשאלה <b>Bq-VQPMPiG7b</b>, לאור מטרת השאלה · פרידי / WizCol · 18 בספטמבר 2026</div>

<div class="box"><b>השאלה שנשאלו המשתתפים:</b><br>{e(Q)}</div>

<h2>1. תקציר</h2>
<ul>
<li>שתי החלוקות מכסות את אותם <b>{N} היגדים</b> של משתתפים. פאני חילקה אותם ל־<b>{FK} אשכולות</b>, {FSING} מהם של היגד יחיד. המכונה חילקה אותם ל־<b>{T['k']} נושאים</b> המכסים {T['cov']} היגדים, ובתוכם {S['k']} קבוצות מיזוג של היגדים שאומרים את אותו הדבר.</li>
<li>ההבדל העיקרי בין שתי החלוקות אינו במידת הדיוק אלא <b>בקריטריון החלוקה</b>. פאני שאלה על כל היגד ״במה הוא עוסק״, והמכונה שאלה ״מה הוא מציע לעשות״.</li>
<li>השאלה עצמה מבקשת ״פעולות, כלים, אירועים, סדירויות״, ומטרתה למצוא מה אפשר לעשות כדי לשפר את מצב הסביבה בישראל. לכן, להערכתי, הקריטריון של המכונה מתאים למטרת השאלה, והחלוקה של פאני, על כל ערכה, נעשתה לפי מסגור אחר.</li>
<li>הדוגמה המרכזית: האשכול הגדול של פאני, ״{e(BIG)}״, מכיל {len(big)} היגדים ({pct(len(big) / N)} מכלל ההיגדים). הוא אומר שכולם עוסקים בשיתוף פעולה, אך אינו אומר מה לעשות. המכונה פיזרה את אותם היגדים בין {big.theme_t.nunique()} כותרות של פעולה: שותפויות בין מוסדות, פורומים ומפגשים, הכשרה ותמריצים, תשתיות נתונים, ומחקר המעוגן בשטח.</li>
<li>חשוב לציין שבצד אחד יש לפאני יתרון: השאלה מבקשת גם ״תנאים וגורמים״, והיא נתנה בית להיגדים שמתארים תנאים אישיים, כמו מחויבות והתמדה. המכונה, שממיינת לפי פעולה, השאירה {commit_unthemed} מתוך {len(commit)} ההיגדים של אשכול ״מחויבות״ ללא נושא.</li>
</ul>

<h2>2. השאלה והמסגור הנדרש</h2>
<p>השאלה שנשאלו המשתתפים מבקשת במפורש הצעות מעשיות: ״נסו להציע פעולות, כלים, אירועים, סדירויות וכו׳״. מטרתה, כפי שאני מבין אותה, היא לגזור מהמחקר מה אפשר לעשות כדי לשנות את מצב הסביבה בישראל. חלוקה של התשובות משרתת מטרה זו אם היא עונה על השאלה ״אילו סוגי פעולה הוצעו״, כך שכל כותרת בחלוקה היא כיוון פעולה שאפשר לבחון, לתעדף ולבצע.</p>
<p>חלוקה תמטית, כלומר ״במה ההיגדים עוסקים״, היא הדרך המקובלת בניתוח תוכן איכותני, והיא נכונה כשהשאלה היא ״מה מעסיק את המשתתפים״. אבל כאן השאלה אינה מה מעסיק אותם אלא מה לעשות, ולכן קריטריון הפעולה הוא המסגור המתאים. שתי החלוקות שלפנינו הן דוגמה טובה לכך ששני קריטריונים סבירים מייצרים שתי תמונות שונות של אותו חומר.</p>

<h2>3. שתי החלוקות במספרים</h2>
<p class="note">מצב המכונה הוא מצב הייצור של השאלה מ־18.9.2026 אחרי סבב הפיצול והאיחוד של שכבת הנושאים (הרצה יבשה עם המודל האמיתי, ללא כתיבה למסד הנתונים). זהו המצב שהמערכת תייצר בייצור לאחר הפריסה.</p>
<table>
<tr><th></th><th>פאני</th><th>המכונה: נושאים</th><th>המכונה: קבוצות מיזוג</th></tr>
<tr><td>מספר אשכולות</td><td class="num">{FK}</td><td class="num">{T['k']}</td><td class="num">{S['k']}</td></tr>
<tr><td>היגדים משויכים</td><td class="num">{N} (100%)</td><td class="num">{T['cov']} ({pct(T['cov'] / N)})</td><td class="num">{S['cov']} ({pct(S['cov'] / N)})</td></tr>
<tr><td>גודל אשכול ממוצע</td><td class="num">{N / FK:.1f}</td><td class="num">{T['cov'] / T['k']:.1f}</td><td class="num">{S['cov'] / S['k']:.1f}</td></tr>
<tr><td>האשכול הגדול ביותר</td><td class="num">{int(fsizes.max())} היגדים</td><td class="num">{max(t['n'] for t in out['themes'])} היגדים</td><td class="num">3 היגדים</td></tr>
<tr><td>אשכולות של היגד יחיד</td><td class="num">{FSING}</td><td class="num">0</td><td class="num">0</td></tr>
</table>
<p>מידת ההסכמה בין שתי החלוקות נמדדת על זוגות היגדים: מכל {T['pairs']} הזוגות שהמכונה הכניסה לאותו נושא, פאני הכניסה לאותו אשכול {pct(T['prec'])}; מכל הזוגות שפאני צירפה, המכונה צירפה {pct(T['rec'])}. מדד ARI (0 = מקרי, 1 = זהות) עומד על {T['ari']:.2f}. המספרים הנמוכים אינם מעידים שאחת החלוקות שגויה, אלא שהן ממיינות לפי שני דברים שונים, וסעיף 4 מראה זאת בהיגדים עצמם.</p>

<h2>4. ההבדל העיקרי, בדוגמאות</h2>

<h3>4.1 האשכול הגדול של פאני, ואיך המכונה פיזרה אותו</h3>
<p>אשכול ״{e(BIG)}״ הוא הגדול ביותר אצל פאני: {len(big)} היגדים, {pct(len(big) / N)} מכלל ההיגדים. כולם אכן עוסקים בחיבור בין מחקר לחברה, אבל הם מציעים פעולות שונות מאוד. המכונה פיזרה אותם בין {big.theme_t.nunique()} כותרות של פעולה:</p>
<table><tr><th>כותרת המכונה</th><th>ההיגדים מאשכול ״{e(BIG)}״ שהגיעו אליה</th></tr>{big_spread}</table>
<p>ברמת המעשה, ההבדל בין ״שידוכים בין חוקרים לארגוני חברה אזרחית ומשרדי ממשלה״ לבין ״יצירת קורס אקדמי בחקלאות מחדשת״ לבין ״ימי סיור ועיון סביב מאבקים סביבתיים״ הוא הבדל בין שלוש תוכניות עבודה שונות, עם אחראים שונים ותקציבים שונים. חלוקה שמאחדת אותם תחת ״שיתוף פעולה״ מאבדת בדיוק את המידע שהשאלה ביקשה.</p>

<h3>4.2 בכיוון ההפוך: נושא של המכונה שנבנה מ־{mix_k} אשכולות של פאני</h3>
<p>הנושא ״{e(MIX)}״ מכיל {len(mix)} היגדים שפאני פיזרה בין {mix_k} אשכולות שונים. המכונה קיבצה אותם משום שהם מציעים את אותו דפוס פעולה: לנסות, להתקדם בשלבים, לעדכן באופן שוטף, להתמיד. פאני הפרידה ביניהם לפי מה שהם עוסקים בו: חינוך, תועלת כלכלית, חוסן מערכות, רגש כלפי הסביבה.</p>
{stmt_list(mix, 'fan')}
<p class="note">התווית ליד כל היגד היא האשכול של פאני.</p>

<h3>4.3 ״מחויבות״: היגדים שמתארים תנאי, לא פעולה</h3>
<p>כאן ההבדל פועל לטובת פאני. אשכול ״{e(COMMIT)}״ שלה מכיל {len(commit)} היגדים על התמסרות, סבלנות, אכפתיות ועבודה קשה. אלה אינם פעולות אלא תנאים אישיים שהמשתתפים רואים כהכרחיים לשינוי, וגם אותם השאלה ביקשה (״תנאים וגורמים״). המכונה, שממיינת לפי פעולה, לא מצאה להם בית: {commit_unthemed} מתוך {len(commit)} נותרו ללא נושא, והשאר פוזרו לפי הפעולה שהוזכרה בהם דרך אגב.</p>
{stmt_list(commit, 'machine')}
<p class="note">התווית ליד כל היגד היא השיוך של המכונה.</p>

<h3>4.4 היגדים יחידים</h3>
<p>פאני השאירה {len(sing)} היגדים כאשכולות של היגד אחד. המכונה שייכה {sing_filed} מהם לנושא כלשהו, כי השופט שלה נשאל ״לאיזו כותרת קיימת ההיגד מתאים״ ובדרך כלל משהו מתאים במידת מה. כל שיוך כזה הוא זוג שפאני אינה מסכימה לו. חלק מהשיוכים נראים סבירים (״מידע אמין״ תחת תשתיות ידע ונתונים), וחלק פחות (״תועלת כלכלית״ תחת התנסות והתמדה).</p>
<table><tr><th>האשכול של פאני</th><th>ההיגד</th><th>השיוך של המכונה</th></tr>{sing_rows}</table>

<h2>5. הערכה לאור מטרת השאלה</h2>
<p>להערכתי, ההבדל בין החלוקות מקורו במסגור ולא בטעות של אחת מהן. פאני ביצעה ניתוח תמטי, שהוא הדרך המקובלת לקודד תשובות פתוחות, אבל השאלה כאן ביקשה תוכנית פעולה, ולניתוח תמטי אין דרך להבחין בין ״להקים שותפות״ לבין ״לקיים כנס״ לבין ״לפתח קורס״ כשכולם עוסקים בחיבור בין מחקר לחברה. המכונה, אחרי התיקון של שכבת הנושאים, ממיינת לפי הפעולה המוצעת, וזה מה שמטרת השאלה דורשת.</p>
<p>יש לסייג בשני דברים. ראשית, השאלה מבקשת גם תנאים, ובכך פאני דייקה יותר: אשכול ״מחויבות״ הוא תשובה לגיטימית לשאלה, והמכונה צריכה לדעת לפתוח כותרת של ״תנאים ועמדות״ במקום להשאיר היגדים כאלה בחוץ. שנית, קודדת אחת אינה אמת מידה: אין לנו מדד להסכמה בין שני בני אדם על אותו חומר, ואני משער שהיא לא הייתה גבוהה בהרבה מההסכמה בין פאני למכונה.</p>

<h2>6. המלצות</h2>
<ul>
<li><b>לקודד מחדש לפי מסגור השאלה.</b> לנסח תוכנית קידוד קצרה שנגזרת מהשאלה: לקבץ לפי הפעולה המוצעת (המנגנון, הכלי או השחקן), ולתת לתנאים ולעמדות קבוצה משלהם. שני קודדים עצמאיים, ואז השוואה של שניהם למכונה. כך המספרים שבסעיף 3 יקבלו משמעות.</li>
<li><b>במכונה:</b> לאפשר לשופט הנושאים כותרת של ״תנאים ועמדות״, כדי שהיגדים כמו אלה שבסעיף 4.3 יקבלו בית, ולאפשר לו להימנע משיוך כשההתאמה חלשה.</li>
<li><b>בדוח ההשוואה למאמר:</b> להציג את ההשוואה לפאני כהסכמה עם קריאה תמטית אחת, לא כמדד נכונות, ולהביא את סעיף 4.1 כדוגמה לכך שקריטריון החלוקה צריך להיגזר ממטרת השאלה.</li>
</ul>

<h2>7. שיטה ומקורות הנתונים</h2>
<p class="note">החלוקה של פאני: הקובץ statements_full.xlsx (142 שורות; 114 היגדי משתתפים, 27 היגדי אשכול מהריצה הקודמת של המכונה שהוחרגו, ושורה אחת עם תווית בלי היגד). תווית שנייה, כשקיימת, נחשבת כהסכמה. חלוקת המכונה: תמונת מצב הייצור מ־18.9.2026 (18 קבוצות מיזוג, 2 נושאים) אחרי הרצה יבשה של סבב הפיצול ואחריו סבב האיחוד של שכבת הנושאים, כפי שהם ממומשים בקוד המערכת (splitThemes, consolidateThemes). הסקריפטים: scoreVsFanny.py, splitDryRun.ts, consolidateDryRun.ts, buildFramingReportHe.py בתיקיית המחקר של 18.9.2026. המדדים: דיוק וכיסוי על זוגות היגדים ומדד ARI כשהיגד לא משויך נחשב אשכול של אחד.</p>

<h2 class="pb">נספח א: חלוקת המכונה, עם ההיגדים</h2>
<p class="note">בכל נושא: קבוצות המיזוג (היגדים שהמכונה קבעה שאומרים את אותו הדבר) ואחריהן היגדים בודדים. התווית ליד כל היגד היא האשכול של פאני.</p>
{app_a}

<h2 class="pb">נספח ב: חלוקת פאני, עם ההיגדים</h2>
<p class="note">האשכולות לפי גודל. התווית ליד כל היגד היא נושא המכונה שאליו הוא שויך.</p>
{app_b}
</body></html>"""

open(stem + '.html', 'w').write(H)
subprocess.run([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless=new', '--disable-gpu',
    '--no-pdf-header-footer', f'--print-to-pdf={stem}.pdf', f'file://{stem}.html',
], check=True, capture_output=True)
print('wrote', stem + '.html', stem + '.pdf')
