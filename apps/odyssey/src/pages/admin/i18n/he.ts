/**
 * Admin console strings — Hebrew, the source language. Registered through
 * `extendDictionaries` when the Admin chunk loads, so they never weigh on the
 * player bundle. Every key starts with `admin.`; plural keys carry CLDR
 * suffixes (`_one`, `_two`, `_other`).
 */
const adminHe: Record<string, string> = {
	'admin.stage.manage': 'ניהול',
	'admin.stage.edit': 'עריכת תוכן המשחק',
	'admin.loading': 'טוען…',
	'admin.noPermission': 'אין לך הרשאת ניהול למשחק הזה.',
	'admin.status.saved': '✓ נשמר',
	'admin.status.saveFailed': 'שגיאה בשמירה',

	'admin.setup.title': 'הקמת המשחק',
	'admin.setup.body':
		'המשחק עדיין לא קיים. יצירת המשחק תבנה את עץ ההיגדים (אי = שאלה, חוף = אופציה) ואת הגדרות המשחק, עם תוכן ברירת המחדל מהאפיון.',
	'admin.setup.creating': 'יוצר…',
	'admin.setup.create': '⚓ יצירת המשחק',

	'admin.tab.texts': '🛠️ טקסטים והגדרות',
	'admin.tab.compass': '🧭 רוחות המצפון',
	'admin.tab.values': '⚖️ ערכים',
	'admin.tab.islands': '🏝️ איים',
	'admin.tab.parties': '🚢 ספינות (מפלגות)',
	'admin.tab.agora': '🏛️ אגורה',

	'admin.common.save': 'שמירה',
	'admin.common.order': 'סדר',
	'admin.common.remove': 'הסרה',

	'admin.text.gameTitle': 'שם המשחק',
	'admin.text.gameSubtitle': 'כותרת משנה',
	'admin.text.introMotto': 'מוטו הפתיחה',
	'admin.text.introWelcome': 'משפט קבלת פנים',
	'admin.text.introBody': 'פסקת ההסבר במסך הפתיחה',
	'admin.text.introLine1': 'שורת סיום 1',
	'admin.text.introLine2': 'שורת סיום 2',
	'admin.text.startButton': 'כיתוב כפתור ההתחלה',
	'admin.text.compassTitle': 'כותרת מסך המצפן',
	'admin.text.compassIntro': 'משפט פתיחה למצפן',
	'admin.text.mapTitle': 'כותרת מסך המפה',
	'admin.text.mapIntro': 'משפט פתיחה למפה',
	'admin.text.voyageShipsNote': 'כיתוב תגובת הים',
	'admin.text.summaryTitle': 'כותרת מסך הסיכום',
	'admin.text.summaryIntro': 'משפט פתיחה לסיכום',
	'admin.text.agoraQuestion': 'שאלת שער האגורה',
	'admin.text.agoraButton': 'כיתוב כפתור האגורה',
	'admin.text.agoraOrigin': 'כתובת אפליקציית האגורה (Origin)',
	'admin.text.destinationName': 'שם היעד על המפה',
	'admin.text.privacyController': '⚠️ פרטיות: מי אחראי על המידע (מוצג במסך הפרטיות)',
	'admin.text.privacyContact': '⚠️ פרטיות: כתובת מייל לפניות בנושא מידע',
	'admin.texts.save': 'שמירת הגדרות',

	'admin.compass.titlePlaceholder': 'כותרת (למשל: רוח האהבה)',
	'admin.compass.promptPlaceholder': 'השאלה',
	'admin.compass.chipsPlaceholder': 'כפתורי השראה, מופרדים בפסיקים',
	'admin.compass.enabled': 'פעיל',
	'admin.compass.add': '+ הוספת רוח',

	'admin.values.intro': 'הערכים של ״רוח ההכרעה״ — המשתמשים בוחרים ומדרגים חמישה.',
	'admin.values.add': '+ הוספת ערך',

	'admin.image.uploaded': '✓ התמונה הועלתה — לא לשכוח לשמור',
	'admin.image.uploadFailed': 'ההעלאה נכשלה — אפשר להדביק כתובת תמונה במקום',
	'admin.image.placeholder': 'כתובת תמונה (URL) או לחיצה על ״העלאה״',
	'admin.image.upload': 'העלאה',

	'admin.islands.intro':
		'כל אי הוא היגד-שאלה וכל חוף הוא היגד-אופציה במערכת ההיגדים של Freedi — עריכת הטקסטים כאן מעדכנת את ההיגדים עצמם.',
	'admin.islands.hidden': '(מוסתר)',
	'admin.islands.namePlaceholder': 'שם האי',
	'admin.islands.issuePlaceholder': 'הסוגיה האזרחית',
	'admin.islands.shortExplainPlaceholder': 'הסבר קצר',
	'admin.islands.openingPlaceholder': 'פתיחה סיפורית',
	'admin.islands.centralQuestion': 'השאלה המרכזית (היגד)',
	'admin.islands.depthQuestionPlaceholder': 'שאלת עומק (רשות)',
	'admin.islands.image': 'תמונת האי',
	'admin.islands.position': 'מיקום על המפה (%)',
	'admin.islands.posX': 'אופקי (0-100)',
	'admin.islands.posY': 'אנכי (0-100)',
	'admin.islands.enabled': 'מוצג במשחק',
	'admin.islands.shores': 'החופים (היגדי אופציה)',
	'admin.islands.shore': 'חוף {{n}}',
	'admin.islands.deleteShore': 'מחיקת החוף (ההיגד)',
	'admin.islands.confirmDeleteShore': 'למחוק את החוף הזה?',
	'admin.islands.newShorePlaceholder': '+ חוף חדש (יישמר בלחיצה על שמירת האי)',
	'admin.islands.save': 'שמירת האי',
	'admin.islands.add': '+ הוספת אי חדש',

	'admin.parties.intro':
		'מסלול הספינה של כל מפלגה = ציון בין ‎−1 (מתנגדת) ל‎+1 (תומכת) לכל היגד בכל אי, על בסיס מצעים, הצבעות והצהרות פומביות. היגד בלי ציון נופל חזרה לעמדה המוצהרת הישנה (אם קיימת). מהציונים נגזר חישוב המרחק.',
	'admin.parties.newShip': 'ספינה חדשה',
	'admin.parties.hidden': '(מוסתרת)',
	'admin.parties.namePlaceholder': 'שם המפלגה',
	'admin.parties.color': 'צבע (hex)',
	'admin.parties.descriptionPlaceholder': 'תיאור (רשות)',
	'admin.parties.image': 'סמל/תמונה',
	'admin.parties.enabled': 'מוצגת במשחק',
	'admin.parties.courseHeading': 'מסלול הספינה — ציון לכל היגד (−1 מתנגדת … +1 תומכת)',
	'admin.parties.shoreLine': 'חוף {{n}}: {{text}}',
	'admin.parties.quickScore': 'ציון מהיר',
	'admin.parties.exactScore': 'ציון מדויק',
	'admin.parties.confirmRemove': 'למחוק את "{{name}}"?',
	'admin.parties.remove': 'הסרת הספינה (נשמר בלחיצה על שמירה)',
	'admin.parties.add': '+ הוספת ספינה',
	'admin.parties.save': 'שמירת הספינות',

	'admin.script.saved': 'התסריט נשמר',
	'admin.script.savedUpdated_one': 'התסריט נשמר · דיון אחד עודכן',
	'admin.script.savedUpdated_two': 'התסריט נשמר · שני דיונים עודכנו',
	'admin.script.savedUpdated_other': 'התסריט נשמר · {{count}} דיונים עודכנו',
	'admin.script.title': 'תסריט האירוע',
	'admin.script.intro':
		'מה עובר משתתף בדיון. שינוי כאן חל גם על דיונים שכבר נפתחו — קוד ההצטרפות וההצעות שנכתבו נשמרים.',
	'admin.script.stances': 'עמדות ומחנות',
	'admin.script.stancesOn':
		'המשתתפים משובצים לשני מחנות לפי העמדות שסימנו באי, והציון נמדד בגישור ביניהם.',
	'admin.script.stancesOff':
		'בלי מחנות. במקום ציון גישור, נמדד כמה הדעות בחדר התקרבו זו לזו במהלך הדיון.',
	'admin.script.needs': 'לוח הצרכים',
	'admin.script.needsHint': 'מציג את הצרכים שמאחורי שתי העמדות במהלך הכתיבה.',
	'admin.script.elders': 'זקני הדור',
	'admin.script.eldersHint':
		'דמויות בינה מלאכותית בהשראת מנהיגים היסטוריים מפליגות לצד המשתתפים: ספינות זקנים בים, ומועצת זקנים שמגיבה על הצעות בדיון. כיבוי מסתיר גם את שאלת הדמויות.',
	'admin.script.framing': 'מסך פתיחה',
	'admin.script.framingHint': 'מסך קצר בתחילת הדיון, בנוי מהטקסט של האי עצמו.',
	'admin.script.voting': 'הצבעה בסיום',
	'admin.script.votingHint': 'הדיון נחתם בהצבעה על ההצעות לפני מסך התוצאות.',
	'admin.script.rounds': 'מספר סבבים',
	'admin.script.ratingsPerRound': 'דירוגים בכל סבב',
	'admin.script.save': 'שמירת התסריט',
	'admin.script.eventMode': 'מצב אירוע',
	'admin.script.reset': 'חזרה לברירת המחדל',

	'admin.conductor.advanced': '{{label}} · הדיון עודכן',
	'admin.conductor.title': 'ניהול האירוע',
	'admin.conductor.intro':
		'דיון נשאר פתוח כל עוד לא נסגר. סגירה מעבירה את המשתתפים לשאלת הסיום ולתוצאות — ואי אפשר לחזור אחורה.',
	'admin.conductor.code': '{{title}} · קוד {{code}}',
	'admin.conductor.toVoting': 'להצבעה',
	'admin.conductor.toResults': 'לתוצאות',

	'admin.agora.title': 'שערי האגורה',
	'admin.agora.intro':
		'לכל אי נפתח דיון קבוע באגורה. בחרו לכל אי שני חופים מנוגדים — הם קובעים לאיזה מחנה ישובץ מפליג שנכנס לדיון, ולכן חשוב לבחור חופים שבאמת חלוקים זה על זה.',
	'admin.agora.originMissing': '⚠️ יש להגדיר תחילה את כתובת אפליקציית האגורה בלשונית הטקסטים.',
	'admin.agora.anchorA': 'חוף א׳ (קוטב אחד)',
	'admin.agora.anchorB': 'חוף ב׳ (הקוטב הנגדי)',
	'admin.agora.notChosen': '— לא נבחר —',
	'admin.agora.sessionOpen': '✓ דיון פתוח · קוד הצטרפות',
	'admin.agora.openSession': 'פתיחת הדיון',
	'admin.agora.noSession': 'טרם נפתח דיון לאי הזה.',
	'admin.agora.missingAnchors_one':
		'שימו לב: לאי אחד עדיין אין שני חופים מנוגדים. אפשר לפתוח לו דיון, אך כל המפליגים בו ישובצו למרכז.',
	'admin.agora.missingAnchors_two':
		'שימו לב: לשני איים עדיין אין שני חופים מנוגדים. אפשר לפתוח להם דיון, אך כל המפליגים בהם ישובצו למרכז.',
	'admin.agora.missingAnchors_other':
		'שימו לב: ל־{{count}} איים עדיין אין שני חופים מנוגדים. אפשר לפתוח להם דיון, אך כל המפליגים בהם ישובצו למרכז.',
	'admin.agora.saveAnchors': 'שמירת החופים המנוגדים',
	'admin.agora.provisioned_one': 'נפתח דיון אחד',
	'admin.agora.provisioned_two': 'נפתחו שני דיונים',
	'admin.agora.provisioned_other': 'נפתחו {{count}} דיונים',
	'admin.agora.alreadyOpen_one': 'אחד כבר היה פתוח',
	'admin.agora.alreadyOpen_two': 'שניים כבר היו פתוחים',
	'admin.agora.alreadyOpen_other': '{{count}} כבר היו פתוחים',
	'admin.agora.provision': '🏛️ פתיחת דיוני האגורה',
};

export default adminHe;
