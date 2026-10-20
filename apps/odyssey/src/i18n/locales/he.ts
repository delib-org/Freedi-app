/**
 * Hebrew — the source language. Bundled; every key starts here.
 * Plural keys carry CLDR suffixes (`_one`, `_two`, `_other`); Arabic adds
 * `_zero`, `_few`, `_many`. Keep gender-slash forms (בחר/י) as written.
 *
 * Only hardcoded UI copy lives here. Game CONTENT (island titles, stances,
 * elder lines, compass questions, values, `game.texts`) is translated per
 * game through Firestore, never through these dictionaries.
 */
const he: Record<string, string> = {
	'lang.switch': 'שפה',
	'app.loading': 'מרימים את המפרשים…',

	// Joins short lists (chips, values). Arabic takes its own comma.
	'common.listSeparator': ', ',
	'common.close': 'סגירה',
	'common.saving': 'שומר…',
	'common.sailing': 'מפליגים…',

	// ---- the legs of the voyage (top bar + strip) ----
	'step.intro': 'הקדמה',
	'step.compass': 'המצפן',
	'step.elders': 'המלחים',
	'step.map': 'המפה',
	'step.voyage': 'ההפלגה',
	'step.summary': 'הסיכום',
	'step.windsDetail': '{{done}}/{{total}} רוחות',
	'step.crewDetail_one': 'מלח אחד',
	'step.crewDetail_two': 'שני מלחים',
	'step.crewDetail_other': '{{count}} מלחים',
	'step.islandsDetail_one': 'אי אחד',
	'step.islandsDetail_two': 'שני איים',
	'step.islandsDetail_other': '{{count}} איים',
	'step.sailedDetail': '{{done}}/{{total}} איים',
	'progress.aria': 'שלבי המסע',
	'progress.status.done': 'הושלם',
	'progress.status.current': 'כאן אנחנו',
	'progress.status.open': 'פתוח',
	'progress.status.locked': 'עוד לא נפתח',

	// ---- top bar ----
	'chrome.digestTitle': 'סיפור המסע שלכם למייל',
	'chrome.digestShort': 'מייל',
	'chrome.admin': 'ניהול',
	'chrome.noAccount': 'ללא חשבון',

	// ---- intro ----
	'intro.anonymousNote': 'מפליגים ללא חשבון — המסע נשמר בדפדפן הזה',
	'intro.signedInAs': 'מחוברים כ־{{name}}',
	'intro.googleButton': 'התחברות עם Google כדי להפליג',
	'intro.googleNote': 'החשבון שומר את המסע שלכם ומאפשר לחזור אליו ממכשיר אחר.',
	'intro.or': 'או',
	'intro.anonymousButton': 'כניסה ללא חשבון',
	'intro.anonymousHint':
		'לא נדע מי אתם. המסע נשמר רק בדפדפן הזה — ניקוי היסטוריה או מכשיר אחר מתחילים מחדש.',
	'intro.privacyNote':
		'תשובות המצפן ויומן הקברניט פרטיים לכם. העמדות שתסמנו נראות למפליגים אחרים לצד השם הפרטי בלבד — לעולם לא המייל.',
	'intro.privacyLink': 'מה נשמר ומי רואה מה',
	'intro.signInFailed': 'ההתחברות לא הושלמה, ולכן עוד לא נכנסתם.',
	'intro.signInRetry': 'לנסות שוב',
	'intro.signInOrAnonymous': 'אפשר גם להמשיך בלי חשבון בלחיצה על הכפתור שלמעלה.',
	'intro.signInInApp':
		'נראה שהקישור נפתח בתוך דפדפן של אפליקציה אחרת. פתחו אותו ב-Safari או ב-Chrome ונסו שוב.',

	// ---- compass ----
	'compass.windCounter': 'רוח {{index}} מתוך {{total}}',
	'compass.chipsHint': 'בחרו לפחות {{min}} — כל מה שמדבר אליכם:',
	'compass.chipsAria': 'כפתורי השראה',
	'compass.ownWords': 'ובמילים שלכם:',
	'compass.ownWordsOptional': 'ובמילים שלכם (לא חובה):',
	'compass.ownWordsPlaceholder': 'כתבו במילים שלכם…',
	'compass.decideWind': 'רוח ההכרעה',
	'compass.decidePrompt':
		'כשאין פתרון טוב, מה בכל זאת צריך להנחות אותך? בחרו {{top}} ערכים מובילים, לפי הסדר.',
	'compass.tooMany': 'בחרתם {{picked}} ערכים — הסירו {{extra}} בלחיצה עליהם כדי להמשיך.',
	'compass.submit': 'המצפן שלך כויל — להמשך המסע',
	'compass.incomplete':
		'ענו על כל רוח — {{min}} בחירות השראה או במילים שלכם — ובחרו {{top}} ערכים מובילים.',
	'wind.doneByWords': 'עניתם במילים — אפשר להמשיך',
	'wind.done': 'אפשר להמשיך',
	'wind.picked': 'נבחרו {{picked}} מתוך {{target}}',

	// ---- crew ----
	'elders.title': 'המלחים מחכים',
	'elders.intro': 'כל קברניט צריך צוות על הסיפון. בחרו {{range}} מלחים שילוו אתכם מאי לאי.',
	'elders.intro2':
		'המלחים לא יחליטו במקומכם — בכל אי תוכלו להתייעץ איתם, והם יעזרו לכם לראות את הסוגיה מזוויות שונות.',
	'elders.noteLabel': 'חשוב לדעת:',
	'elders.note1a': 'אלה דמויות בינה מלאכותית בהשראת אישים היסטוריים —',
	'elders.note1strong': 'לא מפלגות ולא מועמדים בבחירות',
	'elders.note1b':
		'. הן מסומנות תמיד ב־📜, שטות בנפרד מספינות המפלגות, ואינן משפיעות על מידת הקרבה שלכם לאף מפלגה.',
	'elders.note2a': 'העמדות שלהן הן',
	'elders.note2strong': 'שחזור משוער',
	'elders.note2b': 'מתוך מה שאמרו וכתבו בחייהם, ולא ציטוט. מלח ששתק בנושא מסוים — שותק גם כאן.',
	'elders.matchHint':
		'🧭 המלחים שמסומנים ב"מתאים לרוחות שלך" מדברים על ערכים שדירגתם במצפן. זה סדר בלבד — הבחירה כולה שלכם.',
	'elders.matchBadge': '🧭 מתאים לרוחות שלך',
	'elders.aboard': '⚓ על הסיפון',
	'elders.whoIs': 'מי זה {{name}}?',
	'elders.aboardCount': 'על הסיפון: {{chosen}} מתוך {{max}}',
	'elders.crewFull': ' — הצוות מלא',
	'elders.sailWith_one': 'להפליג עם מלח אחד — לפתיחת המפה',
	'elders.sailWith_two': 'להפליג עם שני מלחים — לפתיחת המפה',
	'elders.sailWith_other': 'להפליג עם {{count}} מלחים — לפתיחת המפה',
	'elders.pickMore_one': 'בחרו עוד אחד כדי להמשיך',
	'elders.pickMore_two': 'בחרו עוד שניים כדי להמשיך',
	'elders.pickMore_other': 'בחרו עוד {{count}} כדי להמשיך',
	'elders.canChange': 'אפשר לשנות את הצוות בכל שלב של המסע.',
	'elders.minCrew_one': 'צוות הוא לפחות מלח אחד. אפשר לשנות אותו בכל שלב של המסע.',
	'elders.minCrew_two': 'צוות הוא לפחות שני מלחים. אפשר לשנות אותו בכל שלב של המסע.',
	'elders.minCrew_other': 'צוות הוא לפחות {{count}} מלחים. אפשר לשנות אותו בכל שלב של המסע.',

	// ---- map ----
	'map.hint':
		'שום אי לא נבחר מראש — הבחירה כולה שלכם. אפשר לבחור מעט איים למסע קצר, או יותר איים למסע מלא. אין חובה לעבור בכל האיים.',
	'map.onRoute': '⚓ במסלול',
	'map.addToRoute': '＋ לצרף למסע',
	'map.whatIsHere': 'מה באי הזה?',
	'map.selectedCount': 'במסלול: {{selected}} מתוך {{total}} איים',
	'map.pickOne': 'בחרו לפחות אי אחד כדי להפליג',
	'map.sail_one': 'מפליגים אל אי אחד (~{{minutes}} דקות)',
	'map.sail_two': 'מפליגים אל שני איים (~{{minutes}} דקות)',
	'map.sail_other': 'מפליגים אל {{count}} איים (~{{minutes}} דקות)',

	// ---- voyage ----
	'voyage.defaultLogPrompt': 'מה חשוב לך במיוחד בסוגיה הזו, או איפה ההתלבטות?',
	'voyage.islandCounter': 'אי {{index}} מתוך {{total}}',
	'voyage.shoresIntro_one':
		'לפניכם חוף אחד. סמנו את יחסכם אליו — חובה לסמן לפחות אחד. אין צורך לבחור תשובה אחת בלבד.',
	'voyage.shoresIntro_two':
		'לפניכם שני חופים. סמנו את יחסכם לכל חוף — חובה לסמן לפחות אחד. אין צורך לבחור תשובה אחת בלבד.',
	'voyage.shoresIntro_other':
		'לפניכם {{count}} חופים. סמנו את יחסכם לכל חוף — חובה לסמן לפחות אחד. אין צורך לבחור תשובה אחת בלבד.',
	'voyage.shore': 'חוף {{number}}',
	'voyage.earlierAnswer': 'התשובה הקודמת שלך — אפשר לשנות',
	'voyage.attitudeGroup': 'יחס לחוף {{number}}',
	'voyage.logLabel': '📖 יומן קברניט:',
	'voyage.logPlaceholder': 'לא חובה — התלבטות, הסתייגות, או כל מה שעוד יש לכם לומר על הסוגיה',
	'voyage.continue': 'להמשך המסע ⛵',
	'voyage.markOne': 'סמנו יחס לפחות לחוף אחד כדי להמשיך.',
	'voyage.shipsAround': 'הספינות סביבך',
	'voyage.litShipHint':
		'הספינה המוארת במרכז היא שלך. הקישו על ספינה כדי לראות כמה היא קרובה אליכם, או',
	'voyage.showAllShips': 'הציגו את כל הספינות',
	'voyage.seaReacts': 'הים מגיב לבחירות שלך',
	'voyage.tapShip': 'הקישו על ספינה כדי לראות כמה היא קרובה למסלול שלכם.',
	'voyage.proximityNote': 'הקרבה היא עגינה זמנית — לא פסק דין ולא הוראת הצבעה.',
	'voyage.toSummary': 'אל מפת ההפלגה שלך 🗺️',
	'voyage.nextIsland': 'לאי הבא: {{title}} ⚓',
	'attitude.support': 'תומך/ת',
	'attitude.livewith': 'יכול/ה לחיות עם זה',
	'attitude.oppose': 'מתנגד/ת',

	// ---- ships: the rows, the card, the sea chart ----
	'ships.band.near.title': 'קרובות למסלולך',
	'ships.band.middle.title': 'באמצע הדרך',
	'ships.band.far.title': 'רחוקות ממסלולך',
	'ships.band.near.word': 'קרובה למסלולך',
	'ships.band.middle.word': 'באמצע הדרך',
	'ships.band.far.word': 'רחוקה ממסלולך',
	'ships.band.near.sentence': 'שטה קרוב למסלול שלך',
	'ships.band.middle.sentence': 'שטה באמצע הדרך',
	'ships.band.far.sentence': 'שטה רחוק ממסלולך',
	'ships.noData': 'עדיין אין מספיק נתונים על מסלולי הספינות.',
	'ships.noRouteData': 'עדיין אין נתוני מסלול',
	'ships.notEnoughData': 'עדיין אין מספיק נתונים',
	'ships.proximity': 'קרבה {{percent}}%',
	'ships.all': 'כל הספינות',
	'ships.temporaryBerth': 'עגינה זמנית — לא פסק דין ולא הוראת הצבעה.',
	'ships.seaAria': 'הים סביב הסירה שלך',
	'ships.yourBoat': 'הסירה שלך',
	'ships.pennantsAria': 'הספינות על הים',
	'ships.showNearest': 'להציג רק את {{nearest}} הקרובות',
	'ships.showMore_one': 'להציג עוד ספינה אחת',
	'ships.showMore_two': 'להציג עוד שתי ספינות',
	'ships.showMore_other': 'להציג עוד {{count}} ספינות',

	// ---- the crew's counsel ----
	'counsel.silent': 'אין לי נטייה מתועדת כאן. כאן אני מקשיב/ה, לא מדבר/ת.',
	'counsel.personaNote': '📜 דמות בינה מלאכותית — שחזור משוער, לא ציטוט ולא המלצת הצבעה',
	'counsel.valuesLine': 'מה שמנחה אותי כאן: {{values}}. שקלו גם אתם מה מנחה אתכם.',
	'counsel.scope.island': 'התייעצות על האי',
	'counsel.scope.shore': 'התייעצות על החוף',
	'counsel.leanHere': 'נוטה אל החוף הזה',
	'counsel.leanShore': 'נוטה אל חוף {{number}}',
	'counsel.aboutIsland': 'על האי כולו:',
	'counsel.noCrew': 'עדיין אין מלחים על הסיפון ·',
	'counsel.addCrew': 'להוספת מלחים',
	'counsel.islandCaption': '📜 להתייעץ עם הצוות על האי',
	'counsel.hint': 'הקישו על מלח או מלחית',
	'counsel.islandRowAria': 'הצוות — התייעצות על האי',
	'counsel.shoreLine': '📜 להתייעץ על חוף {{number}}',
	'counsel.shoreRowAria': 'הצוות — התייעצות על חוף {{number}}',
	// a closed disclosure points INTO the text, so the glyph is a translation
	'counsel.chevronClosed': '‹',
	'counsel.chevronOpen': '▾',
	'counsel.reactionsEyebrow': 'המלחים מגיבים · על חוף {{number}}',

	// ---- the strip of chosen islands ----
	'strip.summary': '🗺️ האיים שבחרתם — נחקרו {{sailed}} מתוך {{total}} · לעבור לאי אחר',
	'strip.nav': 'האיים במסע',
	'strip.status.done': 'נחקר',
	'strip.status.current': 'כאן אתם',
	'strip.status.open': 'טרם נחקר',
	'strip.noNeedAll': 'אין חובה לעבור בכל האיים.',
	'strip.finishHere': 'לסיים את המסע כאן ולראות את מפת ההפלגה שלכם',

	// ---- summary ----
	'summary.gameNote':
		'ספינות קרובות שטות במסלול דומה לשלך. הקרבה היא עגינה זמנית — לא פסק דין ולא הוראת הצבעה.',
	'summary.shipsTitle': '🚢 הספינות באופק',
	'summary.shipsIntro_one':
		'לכל ספינה: קרבה למסלול שלך על פי האי האחד שחקרת. אפשרות עגינה — לא כרטיס הצבעה.',
	'summary.shipsIntro_two':
		'לכל ספינה: קרבה למסלול שלך על פי שני האיים שחקרת. אפשרות עגינה — לא כרטיס הצבעה.',
	'summary.shipsIntro_other':
		'לכל ספינה: קרבה למסלול שלך על פי {{count}} האיים שחקרת. אפשרות עגינה — לא כרטיס הצבעה.',
	'summary.howRoute': 'איך נקבע מסלול של ספינה?',
	'summary.tie': 'מקום ראשון משותף: {{names}}',
	'summary.earlyEvidence': 'רושם ראשוני — מבוסס על {{statements}} היגדים ב־{{islands}} איים',
	'summary.band.near': 'קרובה למסלולך',
	'summary.band.middle': 'אפשרות לעגינה',
	'summary.band.far': 'מתרחקת',
	'summary.noRouteData': 'אין עדיין נתוני מסלול לספינה זו',
	'summary.proximityIslands_one': 'קרבה {{percent}}% · אי אחד',
	'summary.proximityIslands_two': 'קרבה {{percent}}% · שני איים',
	'summary.proximityIslands_other': 'קרבה {{percent}}% · {{count}} איים',
	'summary.journalTitle': '🧭 יומן המסע שלך',
	// the ranking reads in the writing direction: first value, then the arrow
	'summary.rankArrow': ' ← ',
	'summary.captainLog': 'יומן הקברניט',
	'summary.companionsTitle': '⛵ מפליגים לצידך',
	'summary.similarRoute': 'מסלול דומה',
	'summary.differentRoute': 'מסלול שונה',
	'summary.noCompanions':
		'עדיין אין מפליגים נוספים בים הזה. כשיצטרפו — תראו כאן מי שט במסלול דומה לשלכם.',
	'summary.seaMapTitle': '🗺️ מפת ים הדעות',
	'summary.seaMapIntro':
		'הספינה שלך במרכז. כל ספינת מפלגה שטה במרחק שלה מהמסלול שלך על פני כל האיים שחקרת — הקרובות ליד הספינה שלך, הרחוקות באופק. הקישו על ספינה כדי לראות כמה היא קרובה.',
	'summary.gatesTitle': '🏛️ שערי הדיון שנפתחו לך',
	'summary.gatesIntro': 'על האיים שכבר חקרת אפשר להיפגש עם אחרים ולחפש יחד פתרונות.',
	'summary.backToDiscussion': 'חזרה לדיון',
	'summary.notOverTitle': '🧭 המסע לא נגמר — יש עוד איים',
	'summary.moreIslands_one':
		'חקרתם {{visited}} איים. עוד אחד ממתין לכם על המפה, ואפשר לחזור אליו בכל רגע — מפת ההפלגה תתעדכן.',
	'summary.moreIslands_two':
		'חקרתם {{visited}} איים. עוד שניים ממתינים לכם על המפה, ואפשר לחזור אליהם בכל רגע — מפת ההפלגה תתעדכן.',
	'summary.moreIslands_other':
		'חקרתם {{visited}} איים. עוד {{count}} ממתינים לכם על המפה, ואפשר לחזור אליהם בכל רגע — מפת ההפלגה תתעדכן.',
	'summary.allVisited': 'עברתם בכל האיים. אפשר לחזור למפה בכל רגע ולשנות עמדה על אי שכבר חקרתם.',
	'summary.backToMap': '🗺️ חזרה למפה',
	'summary.crewLink': '📜 המלחים שאיתך',
	'summary.digestPrompt': 'רוצים לדעת מה קורה בים כשאתם לא כאן?',
	'summary.digestLink': '📬 סיפור המסע שלכם למייל',

	// ---- how a ship's course is set ----
	'parties.stage': 'הספינות',
	'parties.title': 'איך נקבע מסלול של ספינה',
	'parties.intro': 'הקרבה שאתם רואים היא חישוב, לא דעה. זה מה שנכנס לתוכו.',
	'parties.methodTitle': 'השיטה',
	'parties.method1a': 'לכל מפלגה נקבע ציון על',
	'parties.method1strong': 'כל חוף בנפרד',
	'parties.method1b':
		'— עד כמה היא תומכת או מתנגדת לו — על בסיס חומר מפורסם: מצע, הצבעות בכנסת והתבטאויות מתועדות. הקרבה שלכם לספינה היא המרחק הממוצע בין הציונים שלכם לשלה, על החופים שסימנתם בלבד.',
	'parties.method2':
		'לכל ציון נשמרים גם מקורות ורמת ודאות. ציון שלא נמצאה לו עמדה מפורסמת מסומן כהערכה ומקבל ודאות נמוכה — הוא נספר, אבל לא מתחזה לידיעה.',
	'parties.newTitle': 'ומה עושים עם מפלגה חדשה?',
	'parties.newIntro': 'חלק מהמפלגות בבחירות האלה צעירות מהשאלות שהמסע שואל. לכל מקרה כלל אחר:',
	'parties.rule1strong': 'אותו גוף בשם חדש',
	'parties.rule1': '— המסלול נשמר כפי שהוא.',
	'parties.rule2strong': 'איחוד של מפלגות קיימות',
	'parties.rule2': '— המסלול נגזר מן הרכיב בעל התיעוד הרציף והמשקל הגדול ביותר.',
	'parties.rule3strong': 'מפלגה חדשה לגמרי',
	'parties.rule3':
		'— המסלול נגזר מהתבטאויות מתועדות של מנהיגיה ומהזדהותם המפלגתית והצבעותיהם בעבר. כאן הוודאות נמוכה יותר, ולעיתים קרובות מסומנת כהערכה.',
	'parties.shipsTitle': 'הספינות על המפה',
	'parties.footnote':
		'המפה מציגה את המפלגות המתמודדות היום. מפלגה שהתפרקה או התאחדה אינה שטה כאן בשמה הישן, ורשימות שייסגרו סופית רק עם סגירת הרשימות יתווספו כשיהיה מה לומר עליהן.',
	'parties.back': 'חזרה למפת ההפלגה',

	// ---- privacy ----
	'privacy.stage': 'פרטיות',
	'privacy.title': 'הפרטיות שלך במסע',
	'privacy.intro': 'שאלון פוליטי הוא דבר אישי. זה מה שנשמר, מי רואה מה, ומה אפשר למחוק.',
	'privacy.whySignInTitle': 'למה צריך להתחבר',
	'privacy.whySignIn1':
		'ההתחברות עושה שלושה דברים: היא שומרת את המסע שלך כך שאפשר לחזור אליו ממכשיר אחר, היא מונעת מאותו אדם למלא את השאלון פעמים רבות — מה שהופך את הממצאים לחסרי ערך — והיא מעבירה את העמדות שלך לאגורה, כדי שלא תגיעו לדיון כזרים בלי דעה.',
	'privacy.whySignIn2':
		'אפשר גם להיכנס ללא חשבון. אז לא נדע מי אתם כלל, אבל המסע נשמר רק בדפדפן הזה: ניקוי היסטוריה, חלון פרטי או מכשיר אחר — והמסע מתחיל מחדש.',
	'privacy.storedTitle': 'מה נשמר',
	'privacy.stored1': 'העמדות שסימנתם על כל חוף — תומכ/ת, יכול/ה לחיות עם זה, מתנגד/ת.',
	'privacy.stored2': 'תשובות המצפן, דירוג הערכים ויומן הקברניט שכתבתם.',
	'privacy.stored3': 'האיים שבחרתם, ומתי נכנסתם לדיון באגורה.',
	'privacy.stored4': 'מזהה משתמש, והשם הפרטי בלבד. אם התחברתם עם Google — גם כתובת המייל.',
	'privacy.whoSeesTitle': 'מי רואה מה',
	'privacy.privateLabel': 'פרטי לחלוטין:',
	'privacy.privateBody':
		'תשובות המצפן, דירוג הערכים ויומן הקברניט. הם נשמרים במסמך המסע שלכם, ורק אתם יכולים לקרוא אותו.',
	'privacy.visibleLabel': 'נראה למפליגים אחרים:',
	'privacy.visibleA': 'העמדות שסימנתם על החופים, לצד',
	'privacy.visibleStrong': 'השם הפרטי בלבד',
	'privacy.visibleB':
		'. כך נבנות רשימת ״מפליגים לצידך״ ומפת ים הדעות — הן מודדות מרחק בין תשובות, ולשם כך צריך לקרוא את התשובות.',
	'privacy.hiddenLabel': 'לא נחשף לאיש:',
	'privacy.hiddenBody':
		'כתובת המייל ותמונת הפרופיל. הן אינן נשמרות על התשובות ואינן מוצגות בשום מסך.',
	'privacy.useTitle': 'למה זה משמש',
	'privacy.useBody':
		'המסע הוא כלי אזרחי ומחקרי. התשובות משמשות להצגת המפה האישית שלכם, לדיון באגורה, ולמחקר על שיח ציבורי — במצטבר. אין מכירה של המידע, אין העברה למפרסמים, ואין שימוש בו כדי לפנות אליכם בתעמולה.',
	'privacy.controlTitle': 'מה בידיים שלכם',
	'privacy.controlBody':
		'אפשר לשנות כל עמדה בכל רגע — חוזרים לאי ומסמנים מחדש. אפשר לבקש לקבל את כל המידע שנשמר עליכם, ואפשר לבקש למחוק אותו; במקרה כזה נמחק גם את התשובות מן המאגר המחקרי.',
	'privacy.contactTitle': 'אחריות ופנייה',
	'privacy.contactLead': 'לשאלות בנושא המידע, בקשת עותק או בקשת מחיקה:',
	'privacy.contactFallback': 'לשאלות בנושא המידע, בקשת עותק או בקשת מחיקה — פנו למפעילי המשחק.',
	'privacy.back': 'חזרה לפתח המסע',

	// ---- a letter to the shipwrights ----
	'feedback.dock': 'מכתב לבוני הספינה',
	'feedback.title': '🪶 מכתב לבוני הספינה',
	'feedback.sent': 'המכתב יצא לדרך ⛵',
	'feedback.thanksWithEmail': 'תודה. אם יהיה לנו מה לענות, נכתוב אל {{email}}.',
	'feedback.thanksNoEmail': 'תודה. כתבתם בלי כתובת, אז לא נוכל לענות — אבל המכתב הגיע אלינו.',
	'feedback.backToVoyage': 'חזרה למסע',
	'feedback.writeAnother': 'לכתוב עוד מכתב',
	'feedback.intro':
		'משהו נשבר, משהו לא ברור, או רעיון לשיפור — ספרו לנו. אנחנו, הצוות שבונה את המשחק, קוראים כל מכתב.',
	'feedback.messageLabel': 'מה תרצו לספר לנו?',
	'feedback.messagePlaceholder': 'למשל: הכפתור לא הגיב, השאלה הזאת לא הייתה ברורה, חסר אי במפה…',
	'feedback.emailLabel': 'מייל למענה — לא חובה',
	'feedback.emailPrefilled':
		'זו הכתובת שנכנסתם איתה. אפשר למחוק אותה — אז לא נוכל לענות, אבל המכתב יגיע.',
	'feedback.emailNote':
		'נשתמש בכתובת רק כדי לענות על המכתב הזה. היא לא מצורפת לתשובות שלכם במסע, לא נשמרת איתן ולא נמסרת לאיש.',
	'feedback.diagnostics':
		'למכתב מצורפים פרטים טכניים — המסך שבו הייתם, הדפדפן, גודל החלון ומזהה המשתמש — כדי שנוכל לשחזר תקלה. תשובות מהמסע לא מצורפות.',
	'feedback.sending': 'שולחים…',
	'feedback.send': 'לשלוח את המכתב',
	'feedback.alsoA': 'אפשר גם',
	'feedback.mailLink': 'לכתוב לנו ישירות במייל',
	'feedback.alsoB': '.',
	'feedback.fail.tooShort': 'ההודעה קצרה מדי — כתבו לנו עוד מעט.',
	'feedback.fail.tooLong': 'ההודעה ארוכה מדי — קצרו מעט ונסו שוב.',
	'feedback.fail.badEmail': 'הכתובת לא נראית תקינה. תקנו אותה, או מחקו אותה כדי לשלוח בלי מענה.',
	'feedback.fail.limited':
		'כמה מכתבים בזה אחר זה — כולם הגיעו ונקרא את כולם. אפשר לכתוב שוב בעוד שעה.',
	'feedback.fail.failed': 'המכתב לא יצא — נסו שוב בעוד רגע. מה שכתבתם נשאר כאן.',

	// ---- the email digest ----
	'digest.title': '📬 סיפור המסע שלכם למייל',
	'digest.intro':
		'מה קרה בים מאז שירדתם לחוף: מפליגים חדשים לידכם, רוחות שהתהפכו, ואתגר מזקני הדור — בשעה שנוחה לכם.',
	'digest.loading': 'טוענים…',
	'digest.cadenceAria': 'תדירות',
	'digest.cadence.none': 'בלי מיילים',
	'digest.cadence.every': 'כל עדכון',
	'digest.cadence.daily': 'פעם ביום',
	'digest.cadence.multi': 'כמה פעמים ביום',
	'digest.everyNote': 'ברגע שמשהו זז בים — נבדק פעם בשעה, ונשלח רק כשבאמת יש חדש.',
	'digest.whichHour': 'באיזו שעה?',
	'digest.whichHours': 'באילו שעות? (עד {{max}})',
	'digest.hoursAria': 'שעות',
	'digest.saving': 'שומרים…',
	'digest.save': 'שמירה',
	'digest.saved': 'נשמר ✓',
	'digest.saveFailed': 'השמירה נכשלה — נסו שוב בעוד רגע.',

	// ---- the 2D opinion map ----
	'opinionMap.you': 'אתם',
	'opinionMap.notEnough': 'עדיין אין מספיק מפליגים עם תשובות משותפות כדי לצייר את מפת הדעות.',
	'opinionMap.unreliable':
		'⚠️ החפיפה בין המסלולים עדיין דלה מכדי לצייר מפה אמינה{{r}}. המפה תופיע כשיהיו יותר תשובות משותפות.',
	'opinionMap.aria': 'מפת דעות דו-ממדית: קרבה בין נקודות משמעה דמיון בתשובות',
	'opinionMap.scaleBar': 'מרחק {{unit}}',
	'opinionMap.fidelity':
		'קרבה במפה = דמיון בתשובות. לצירים אין כיוון או משמעות קבועה. נאמנות המפה: r = {{r}} · מתח {{stress}} · שני הצירים נושאים {{percent}}% מהמבנה.',

	// ---- no game seeded yet ----
	'noGame.title': 'הים עדיין ריק',
	'noGame.bodyA': 'המשחק עדיין לא הוקם. אם את/ה מנהל/ת — היכנסו למסך',
	'noGame.adminLink': 'הניהול',
	'noGame.bodyB': 'וצרו את המשחק.',

	// ---- the sea stage (Phaser) — never mix digits into these ----
	'stage.myShip': 'הספינה שלך',
	'stage.castle': 'ממלכת ההגעה',
	'stage.yourNorth': 'הצפון שלך',

	// ---- a nameless fellow sailor ----
	'sailor.guest': 'אורח/ת',
};

export default he;
