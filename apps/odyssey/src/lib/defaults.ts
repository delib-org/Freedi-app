/**
 * Default game content for אודיסיאה ישראלית, derived from the design PDF.
 * Used ONCE, by the admin "create game" action (seed.ts): islands become
 * `question` Statements, stances become `option` Statements, and this
 * metadata goes into the odysseyGames config doc. After seeding, the admin
 * edits everything through the /admin screen — Firestore is the source of
 * truth, not this file.
 */

export const DEFAULT_TEXTS: Record<string, string> = {
	gameTitle: 'אודיסיאה ישראלית',
	gameSubtitle: 'מסע ומשא לארץ ישנה-חדשה',
	introMotto: 'עוד יש מפרש לבן באופק',
	introWelcome: 'ברוכים הבאים לאודיסיאה ישראלית: מסע ומשא לארץ ישנה-חדשה.',
	introBody:
		'לפני הבחירות, יוצאים לשיט תעלומות! כוונו את המצפן האישי שלכם, בחרו איים חשובים על המפה, פגשו דילמות אזרחיות, וגלו אילו ספינות שטות קרוב למסלול שלכם – ואיפה הן עלולות לקחת מכם את ההגה.',
	introLine1: 'לפני המפלגה, הפלגה.',
	introLine2: 'לפני הדגל, מצפן.',
	startButton: 'מתחילים!',
	compassTitle: 'ארבע רוחות המצפון',
	compassIntro: 'כל קברניט טוב צריך מצפן מכויל היטב. מה מראה המצפן שלך?',
	mapTitle: 'המפה נפתחת',
	mapIntro: 'אלה התחנות שעשויות לקבוע את ההפלגה שלך. בחר/י את האיים שחשובים לך יותר מכל.',
	voyageShipsNote:
		'הים מגיב לבחירות שלך. ספינות מסוימות שטות כעת קרוב יותר למסלול שלך, ואחרות מתרחקות.',
	summaryTitle: 'מפת ההפלגה שלך',
	summaryIntro: 'המצפן שלך כויל, האיים נחקרו, והים סימן את הספינות הקרובות למסלולך.',
	agoraQuestion:
		'רוצה לפגוש אזרחים ששטו במסלול דומה, או אזרחים שחולקים איתך דאגה אחת למרות מסלול שונה?',
	agoraButton: 'אל שער האגורה',
	/** Origin of the Agora app. Each island's gate appends its own join code. */
	agoraOrigin: '',
	/**
	 * Who answers for the data, and where to write. Both are shown on /privacy,
	 * and both are blank until an operator fills them in on the admin screen —
	 * a made-up address on a privacy page is worse than none. FILL THESE IN
	 * BEFORE DISTRIBUTING: a political questionnaire with no one's name on it is
	 * the reason people close the tab.
	 */
	privacyController: '',
	privacyContact: '',
	destinationName: 'חוף ההבטחה של ארץ ישנה-חדשה',
};

export interface DefaultCompassQuestion {
	slug: string;
	title: string;
	prompt: string;
	chips: string[];
}

export const DEFAULT_COMPASS_QUESTIONS: DefaultCompassQuestion[] = [
	{
		slug: 'love',
		title: 'רוח האהבה',
		prompt: 'מה הדברים הטובים ביותר בישראל, שחשוב שנשמור ונטפח?',
		chips: [
			'חיים משותפים',
			'עברית ותרבות',
			'ערבות הדדית',
			'חירות',
			'מסורת',
			'משפחה',
			'יצירתיות',
			'ביטחון',
			'טבע ונוף',
			'יכולת תיקון',
		],
	},
	{
		slug: 'worry',
		title: 'רוח הדאגה',
		prompt: 'ממה את/ה הכי חושש/ת בשנים הקרובות?',
		chips: [
			'מלחמה',
			'קרע פנימי',
			'שחיתות',
			'יוקר מחיה',
			'אובדן דמוקרטיה',
			'אובדן זהות',
			'פשיעה',
			'בידוד בינלאומי',
			'אי-שוויון',
			'עתיד הילדים',
		],
	},
	{
		slug: 'listen',
		title: 'רוח ההקשבה',
		prompt: 'למי בישראל לא מקשיבים מספיק?',
		chips: [
			'תושבי הצפון',
			'תושבי הדרום',
			'משפחות חטופים',
			'מילואימניקים',
			'ערבים אזרחי ישראל',
			'חרדים',
			'חילונים',
			'צעירים',
			'נשים',
			'עולים',
			'עצמאים',
			'אנשים בעוני',
		],
	},
];

/** רוח ההכרעה — values the player ranks (top five). */
export const DEFAULT_VALUES: string[] = [
	'ביטחון',
	'חירות',
	'שוויון',
	'שייכות',
	'אחריות',
	'מסורת',
	'חמלה',
	'אמת',
	'כבוד האדם',
	'עתיד משותף',
];

export interface DefaultIsland {
	slug: string;
	title: string;
	issue: string;
	shortExplain: string;
	opening: string;
	/** Becomes the island's `question` Statement text */
	centralQuestion: string;
	depthQuestion: string;
	posX: number;
	posY: number;
	/** Become `option` Statements under the island question */
	stances: string[];
}

export const DEFAULT_ISLANDS: DefaultIsland[] = [
	{
		slug: 'accountability',
		title: 'האחריות',
		issue: 'שבעה באוקטובר, חקירה ואמון במוסדות',
		shortExplain:
			'מה הדרך הנכונה לברר אחריות על כשלי שבעה באוקטובר: ועדת חקירה ממלכתית, בדיקה מאוחרת, בדיקות פנימיות, או דחיית החקירה לטובת ניצחון ושיקום.',
		opening: 'הגעתם לאי שבו צריך לשאול מי אחראי, מתי, ואיך בודקים זאת.',
		centralQuestion: 'מה הדרך הנכונה לברר אחריות על כשלי 7 באוקטובר?',
		depthQuestion: 'מי צריך לשאת באחריות קודם – הדרג המדיני, הדרג הצבאי, או כולם יחד?',
		posX: 13,
		posY: 34,
		stances: [
			'ועדת חקירה ממלכתית בהקדם',
			'ועדת חקירה ממלכתית רק לאחר הסדר סופי בעזה',
			'בדיקות פנימיות בכל מערכת, ורק אחר כך הכרעה על ועדה',
			'להתמקד כעת בניצחון ובשיקום',
		],
	},
	{
		slug: 'rule-of-law',
		title: 'שלטון החוק',
		issue: 'בית המשפט, הכנסת והממשלה',
		shortExplain:
			'איזה כוח צריך להיות לבית המשפט העליון מול הממשלה והכנסת: בלימה משמעותית של פגיעה בזכויות ובכללי המשחק, ביקורת מרוסנת יותר, צמצום כוח בית המשפט, או שינוי יסודי של המערכת.',
		opening:
			'הגעת אל חוף סלעי. מצד אחד נשמעים קולות מן העיר: ״הרוב הכריע״. מן הצד השני עומדת שומרת השערים ואומרת: ״גם קברניט שנבחר צריך גבולות״.',
		centralQuestion: 'איזה כוח צריך להיות לבית המשפט העליון מול הממשלה והכנסת?',
		depthQuestion: 'מי צריך להכריע כשרוב נבחר ובית המשפט חלוקים — ומה הגבול?',
		posX: 30,
		posY: 26,
		stances: [
			'כוח משמעותי לבלום חקיקה, כולל חוקי יסוד, אם היא פוגעת בזכויות יסוד או בכללי המשחק הדמוקרטיים',
			'כוח ביקורת קיים, אך עם ריסון עצמי גבוה יותר והגדרת גבולות ברורה יותר',
			'צמצום משמעותי של כוח בית המשפט לבטל הכרעות רוב של הכנסת והממשלה',
			'שינוי יסודי במערכת המשפט, כולל פסקת התגברות רחבה ושליטה פוליטית במינוי שופטים',
		],
	},
	{
		slug: 'clean-hands',
		title: 'ניקיון הכפיים',
		issue: 'כשירות שלטונית ומנהיגות תחת חשדות',
		shortExplain:
			'כיצד להתייחס למנהיגים הנאשמים בעבירות חמורות לפני הרשעה סופית: פסילה, כהונה עם מגבלות, הכרעת הציבור, או חשש מרדיפה פוליטית.',
		opening:
			'על האי הזה יושב כותב היומן, המתעד לא רק הבטחות אלא גם חריגות, ניגודי עניינים ומחירים של אמון ציבורי.',
		centralQuestion: 'כיצד להתייחס למנהיגים הנאשמים בעבירות חמורות לפני הרשעה סופית?',
		depthQuestion:
			'האם חזקת החפות מספיקה למנהיגות פוליטית, ומה המחיר של ניגוד עניינים בראש המערכת?',
		posX: 46,
		posY: 30,
		stances: [
			'פסילה מכהונה ציבורית עד לסיום ההליך המשפטי',
			'כהונה עם מגבלות ברורות על סמכויות ומינויים',
			'הכרעת הציבור בבחירות היא ההכרעה היחידה הנדרשת',
			'מדובר בחשש מרדיפה פוליטית – אין למנוע כהונה',
		],
	},
	{
		slug: 'political-home',
		title: 'הבית המדיני',
		issue: 'היעד ארוך הטווח בין הירדן לים',
		shortExplain:
			'מהו היעד הרצוי ביחס לעזה, יהודה ושומרון והפלסטינים: סיפוח, ניהול הסכסוך, הפרדה מדינית, שתי מדינות במסגרת אזורית או אפשרות אחרת.',
		opening:
			'על האי הזה יושבת משרטטת המפות, שמציגה מפות חלקיות ושואלת איזו מפה מדינית ראויה, אפשרית ואחראית.',
		centralQuestion: 'מה היעד הרצוי בטווח ארוך ביחס לעזה, יהודה ושומרון והפלסטינים?',
		depthQuestion: 'איך מאזנים ביטחון, דמוגרפיה, זכויות וזהות?',
		posX: 62,
		posY: 24,
		stances: [
			'סיפוח והחלת ריבונות ישראלית',
			'ניהול הסכסוך ושמירת המצב הקיים',
			'הפרדה מדינית והיערכות לקראת שתי מדינות',
			'הסדר במסגרת אזורית רחבה או אפשרות אחרת',
		],
	},
	{
		slug: 'security-storm',
		title: 'הסערה הביטחונית',
		issue: 'ביטחון, מלחמה והסדר אזורי',
		shortExplain:
			'איזו דרך מעשית תקדם ביטחון בשנים הקרובות: הכרעה צבאית והרתעה, תיאום עם ארה״ב, חיבור בין כוח להסדר אזורי, או מסגרת מדינית אזורית כמוקד הביטחון.',
		opening:
			'חוזה הסערות מזהה רוחות מלחמה ושואל אם תותחים, בריתות או הסדרים הם הדרך הבטוחה יותר לחוף.',
		centralQuestion: 'איזו דרך מעשית תקדם ביטחון בשנים הקרובות?',
		depthQuestion: 'מה כוח צבאי יכול להשיג ומה אינו יכול להשיג?',
		posX: 80,
		posY: 30,
		stances: [
			'הכרעה צבאית והרתעה מתמשכת',
			'עוצמה צבאית בתיאום הדוק עם ארצות הברית',
			'חיבור בין כוח צבאי להסדרים אזוריים',
			'מסגרת מדינית אזורית כמוקד הביטחון',
		],
	},
	{
		slug: 'arab-partnership',
		title: 'השותפות הערבית',
		issue: 'מפלגות ערביות וקואליציה',
		shortExplain:
			'מה צריך להיות מקומן של מפלגות ערביות בפוליטיקה הישראלית: שותפות מלאה, תמיכה מבחוץ, שיתוף פעולה אזרחי מוגבל או פסילה פוליטית.',
		opening:
			'מארחת האספה מזמינה קולות שונים אל שולחן עגול ושואלת מי רשאי להשתתף בניווט הבית המשותף.',
		centralQuestion: 'מה מקומן הראוי של מפלגות ערביות בפוליטיקה הישראלית?',
		depthQuestion: 'האם שותפות קואליציונית היא מבחן אזרחי או סיכון לאומי?',
		posX: 12,
		posY: 55,
		stances: [
			'שותפות מלאה, כולל ישיבה בממשלה',
			'תמיכה מבחוץ בממשלה מוסכמת',
			'שיתוף פעולה אזרחי מוגבל בנושאים מוסכמים',
			'פסילה פוליטית של שותפות קואליציונית',
		],
	},
	{
		slug: 'civic-equality',
		title: 'השוויון האזרחי',
		issue: 'ערבים אזרחי ישראל: שוויון, השקעה והכרה',
		shortExplain:
			'מה צריכה להיות מדיניות המדינה כלפי אזרחים ערבים: שוויון מלא והשקעה מתקנת, השקעה אזרחית בלי שינוי זהות המדינה, זכויות פרט ללא הכרה קולקטיבית, או זכויות מותנות בנאמנות.',
		opening:
			'בונה הגשרים מקימה גשר בין חופים שאינם סומכים זה על זה, ושואלת מה נדרש כדי שאזרחות תהיה ממשית.',
		centralQuestion: 'מה צריכה להיות מדיניות המדינה כלפי אזרחיה הערבים?',
		depthQuestion: 'מה ההבדל בין נאמנות למדינה לבין שייכות אזרחית?',
		posX: 28,
		posY: 62,
		stances: [
			'שוויון מלא והשקעה מתקנת רחבה',
			'השקעה אזרחית משמעותית בלי שינוי זהות המדינה',
			'זכויות פרט מלאות ללא הכרה קולקטיבית',
			'זכויות מותנות במחויבות ובנאמנות למדינה',
		],
	},
	{
		slug: 'civic-covenant',
		title: 'החוזה האזרחי',
		issue: 'חרדים: שירות, ליבה ותקצוב',
		shortExplain:
			'מה צריכה להיות מדיניות המדינה כלפי הציבור החרדי בתחומי שירות, חינוך ותקצוב: שוויון אזרחי מלא, שינוי הדרגתי, אוטונומיה רחבה או הכרה בלימוד תורה כתרומה לאומית.',
		opening:
			'מחלקת המשא מחלקת ציוד, חובות וזכויות בין נוסעי האי ושואלת מהו הוגן כאשר חיים על אותה ספינה ציבורית.',
		centralQuestion: 'מה צריכה להיות המדיניות כלפי הציבור החרדי בתחומי שירות, חינוך ותקצוב?',
		depthQuestion: 'מהי תרומה הוגנת למדינה, והאם שינוי הדרגתי הוא אחריות או התחמקות?',
		posX: 45,
		posY: 56,
		stances: [
			'שוויון אזרחי מלא בחובות ובזכויות',
			'שינוי הדרגתי ומוסכם לאורך שנים',
			'אוטונומיה רחבה לקהילה החרדית',
			'הכרה בלימוד תורה כתרומה לאומית שוות ערך',
		],
	},
	{
		slug: 'sabbath-rabbinate',
		title: 'דת ומדינה',
		issue: 'צביון המרחב הציבורי בין סמכות רבנית לחופש בחירה',
		shortExplain:
			'מה היחס הרצוי בין דת ומדינה: הפרדה אזרחית רחבה, חופש אזרחי מקומי לצד סמלים יהודיים, סטטוס-קוו מתוקן, או חיזוק סמכות הרבנות והזהות היהודית במרחב הציבורי.',
		opening:
			'שומרת המפתחות מחזיקה מפתחות לשערים שונים ושואלת מי פותח וסוגר את המרחב הציבורי בשם היהדות, החירות או הסטטוס-קוו.',
		centralQuestion: 'מה היחס הרצוי בין דת ומדינה בישראל?',
		depthQuestion: 'איפה מסתיימת זהות יהודית ומתחילה כפייה?',
		posX: 63,
		posY: 52,
		stances: [
			'הפרדה אזרחית רחבה בין דת ומדינה',
			'חופש אזרחי מקומי לצד סמלים יהודיים ממלכתיים',
			'סטטוס-קוו מתוקן ומעודכן',
			'חיזוק סמכות הרבנות והזהות היהודית במרחב הציבורי',
		],
	},
	{
		slug: 'bread-and-home',
		title: 'הלחם והבית',
		issue: 'כלכלה, יוקר מחיה ודיור',
		shortExplain:
			'מהי הדרך המרכזית להוריד את יוקר המחיה: התערבות ממשלתית רחבה, שילוב של תחרות והתערבות ממוקדת, שוק חופשי, או סיוע ישיר למשפחות ולפריפריה.',
		opening:
			'אופה הלחם, המנהלת מאפייה קטנה על האי, שואלת איך מחלקים קרקע, עבודה, תחרות וסיכוי לחיות בכבוד.',
		centralQuestion: 'מהי הדרך המרכזית להוריד את יוקר המחיה ולאפשר דיור בהישג יד?',
		depthQuestion:
			'מה גורם ליוקר המחיה: שוק סגור, ממשלה חלשה, ריכוזיות, מיסוי, קרקעות או משהו אחר?',
		posX: 17,
		posY: 78,
		stances: [
			'התערבות ממשלתית רחבה בשוק ובמחירים',
			'שילוב של הגברת תחרות והתערבות ממוקדת',
			'שוק חופשי, הסרת רגולציה ופתיחת השוק',
			'סיוע ישיר למשפחות ולפריפריה',
		],
	},
	{
		slug: 'democracy-itself',
		title: 'הדמוקרטיה עצמה',
		issue: 'ממשל, ייצוג והשתתפות',
		shortExplain:
			'האם ישראל זקוקה לשינוי בשיטת הממשל והייצוג: יותר דמוקרטיה ישירה או משתפת, שינוי ייצוג, חיזוק משילות, או בעיקר שינוי במנהיגות ובנורמות.',
		opening:
			'מכנסת האספה מזמינה את תושבי האי להתכנס ושואלת מי באמת צריך להחזיק בהגה כאשר מכריעים על החיים המשותפים.',
		centralQuestion: 'האם ישראל זקוקה לשינוי בשיטת הממשל והייצוג?',
		depthQuestion: 'מה חסר בדמוקרטיה הישראלית: השתתפות, ייצוג, משילות או אמון?',
		posX: 40,
		posY: 80,
		stances: [
			'יותר דמוקרטיה ישירה ומשתפת לאזרחים',
			'שינוי שיטת הייצוג והבחירות',
			'חיזוק המשילות ויכולת ההכרעה של הממשלה',
			'בעיקר שינוי במנהיגות ובנורמות, לא בשיטה',
		],
	},
	{
		// Was 'יחסי החוץ' / 'ארה״ב, המעמד הבינלאומי ויהדות התפוצות', and it did
		// three things wrong at once. It folded in diaspora Jewry, which is a
		// question of Jewish identity rather than of foreign relations. Every
		// stance was written about the United States, which quietly asserts that
		// Europe and the region matter less — a political position, arriving as
		// if it were the frame. And it left the reader looking for Israel's
		// relations with the Palestinians and its neighbours, which live on
		// 'הבית המדיני' and 'הסערה הביטחונית'. What is left is the one question
		// those islands do not ask: what Israel's standing in the world is worth
		// when it costs freedom of action.
		slug: 'world-partners',
		title: 'ישראל בין האומות',
		issue: 'מעמד בינלאומי, בריתות וחופש פעולה',
		shortExplain:
			'כמה משקל צריכה ישראל לתת למעמדה הבינלאומי ולבריתות שלה כשהם מתנגשים עם חופש הפעולה שלה: שיקול מכריע, משקל גבוה לצד פיזור הקשרים, הקשבה לצד פעולה עצמאית, או עצמאות מלאה גם במחיר בידוד.',
		opening:
			'קורא הכוכבים מתבונן בכוכבים ובספינות רחוקות ושואל מי שט לצידנו, מי מזהיר אותנו, ומתי ריבונות הופכת לבדידות מסוכנת.',
		centralQuestion:
			'כמה משקל צריכה ישראל לתת למעמדה הבינלאומי ולבריתות שלה, כשהם מתנגשים עם חופש הפעולה שלה?',
		depthQuestion: 'מתי ברית היא עוגן ומתי היא מגבלה?',
		posX: 68,
		posY: 76,
		stances: [
			'המעמד הבינלאומי והבריתות הם שיקול מכריע — כדאי לרסן צעדים שפוגעים בהם',
			'משקל גבוה לבריתות, לצד פיזור הקשרים בין ארה״ב, אירופה ומדינות האזור',
			'הקשבה לעולם לצד פעולה עצמאית ועקבית, לפי העניין',
			'חופש פעולה מלא לפי שיקול ישראלי בלבד, גם במחיר בידוד בינלאומי',
		],
	},
];

export interface DefaultParty {
	slug: string;
	name: string;
	color: string;
	/**
	 * Who leads it, where it came from, and — the part that matters for an
	 * honest map — how its route was derived. A player looking at a ship named
	 * הדמוקרטים deserves to know the positions came from Labor's and Meretz's
	 * record, not from a platform that did not exist yet.
	 */
	description: string;
	/**
	 * island slug → 1-based index of the stance the party is closest to.
	 *
	 * LEGACY and coarse: it collapses a party onto one stance per island. The
	 * real routes are the continuous per-stance scores in
	 * data/party-stance-research.json, which the seed reads into `attitudes`.
	 * This remains only as the fallback for an island with no research yet.
	 */
	positions: Record<string, number>;
}

/**
 * The ships on the water, as of the 26th Knesset campaign.
 *
 * A map that sails מפלגות that no longer exist, and omits ones on the ballot,
 * is not a map. This list was rebuilt against the 2026 field: יש עתיד sails as
 * part of ביחד with בנט 2026; המחנה הממלכתי went back to being כחול לבן when
 * תקווה חדשה left; העבודה and מרצ are הדמוקרטים; חד״ש, תע״ל and בל״ד are one
 * list again; and ישר! is new to the water.
 *
 * Where a party is the same body under a new name, its route is kept whole.
 * Where it is a merger, the route comes from the constituent with the longest
 * continuous record, and `description` says so out loud. Where it is genuinely
 * new, the route comes from its leader's documented positions and every score
 * carries its confidence in the research file — see /parties in the app.
 */
export const DEFAULT_PARTIES: DefaultParty[] = [
	{
		slug: 'likud',
		name: 'הליכוד',
		color: '#1d5fbf',
		description:
			'נתניהו. ממשיכה, לאחר איחוד עם תקווה חדשה. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 4,
			'rule-of-law': 4,
			'clean-hands': 4,
			'political-home': 2,
			'security-storm': 1,
			'arab-partnership': 4,
			'civic-equality': 3,
			'civic-covenant': 3,
			'sabbath-rabbinate': 3,
			'bread-and-home': 3,
			'democracy-itself': 3,
			'world-partners': 2,
		},
	},
	{
		slug: 'yashar',
		name: 'ישר! עם איזנקוט',
		color: '#6b3fa0',
		description:
			'גדי איזנקוט. מפלגה חדשה (2025), בלי היסטוריה מפלגתית קודמת. מסלול על בסיס התבטאויות מתועדות של ראש המפלגה; ראו שדה confidence בקובץ המחקר.',
		positions: {
			accountability: 1,
			'rule-of-law': 2,
			'clean-hands': 1,
			'political-home': 2,
			'security-storm': 3,
			'arab-partnership': 2,
			'civic-equality': 2,
			'civic-covenant': 1,
			'sabbath-rabbinate': 2,
			'bread-and-home': 2,
			'democracy-itself': 2,
			'world-partners': 2,
		},
	},
	{
		slug: 'together',
		name: 'ביחד',
		color: '#0aa2c0',
		description:
			'לפיד ובנט. איחוד יש עתיד ובנט 2026 (2026). מסלול על בסיס עמדות יש עתיד, שהיא הגדולה שברכיביה ובעלת התיעוד הרציף.',
		positions: {
			accountability: 1,
			'rule-of-law': 2,
			'clean-hands': 1,
			'political-home': 3,
			'security-storm': 2,
			'arab-partnership': 2,
			'civic-equality': 2,
			'civic-covenant': 1,
			'sabbath-rabbinate': 2,
			'bread-and-home': 2,
			'democracy-itself': 2,
			'world-partners': 1,
		},
	},
	{
		slug: 'yisrael-beiteinu',
		name: 'ישראל ביתנו',
		color: '#274a78',
		description: 'ליברמן. ממשיכה. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 1,
			'rule-of-law': 2,
			'clean-hands': 1,
			'political-home': 2,
			'security-storm': 1,
			'arab-partnership': 4,
			'civic-equality': 4,
			'civic-covenant': 1,
			'sabbath-rabbinate': 1,
			'bread-and-home': 2,
			'democracy-itself': 3,
			'world-partners': 2,
		},
	},
	{
		slug: 'democrats',
		name: 'הדמוקרטים',
		color: '#2e7d43',
		description: 'יאיר גולן. איחוד העבודה ומרצ (2024). מסלול על בסיס עמדות שתי המפלגות המרכיבות.',
		positions: {
			accountability: 1,
			'rule-of-law': 1,
			'clean-hands': 1,
			'political-home': 3,
			'security-storm': 3,
			'arab-partnership': 1,
			'civic-equality': 1,
			'civic-covenant': 1,
			'sabbath-rabbinate': 1,
			'bread-and-home': 1,
			'democracy-itself': 1,
			'world-partners': 1,
		},
	},
	{
		slug: 'otzma',
		name: 'עוצמה יהודית',
		color: '#8f2727',
		description: 'בן גביר. ממשיכה. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 4,
			'rule-of-law': 4,
			'clean-hands': 4,
			'political-home': 1,
			'security-storm': 1,
			'arab-partnership': 4,
			'civic-equality': 4,
			'civic-covenant': 3,
			'sabbath-rabbinate': 4,
			'bread-and-home': 3,
			'democracy-itself': 3,
			'world-partners': 4,
		},
	},
	{
		slug: 'shas',
		name: 'ש״ס',
		color: '#111111',
		description: 'דרעי. ממשיכה. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 3,
			'rule-of-law': 3,
			'clean-hands': 4,
			'political-home': 2,
			'security-storm': 1,
			'arab-partnership': 3,
			'civic-equality': 3,
			'civic-covenant': 4,
			'sabbath-rabbinate': 4,
			'bread-and-home': 4,
			'democracy-itself': 4,
			'world-partners': 2,
		},
	},
	{
		slug: 'utj',
		name: 'יהדות התורה',
		color: '#3d3d3d',
		description: 'ממשיכה. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 3,
			'rule-of-law': 3,
			'clean-hands': 3,
			'political-home': 2,
			'security-storm': 2,
			'arab-partnership': 3,
			'civic-equality': 3,
			'civic-covenant': 4,
			'sabbath-rabbinate': 4,
			'bread-and-home': 4,
			'democracy-itself': 4,
			'world-partners': 2,
		},
	},
	{
		slug: 'religious-zionism',
		name: 'הציונות הדתית',
		color: '#7a4f21',
		description:
			'סמוטריץ׳. ממשיכה, לאחר איחוד עם הבית היהודי. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 4,
			'rule-of-law': 4,
			'clean-hands': 4,
			'political-home': 1,
			'security-storm': 1,
			'arab-partnership': 4,
			'civic-equality': 4,
			'civic-covenant': 4,
			'sabbath-rabbinate': 4,
			'bread-and-home': 3,
			'democracy-itself': 3,
			'world-partners': 4,
		},
	},
	{
		slug: 'blue-white',
		name: 'כחול לבן',
		color: '#28418f',
		description:
			'גנץ. אותה מפלגה ששמה היה המחנה הממלכתי, ששבה לשמה לאחר פרישת תקווה חדשה (2024). מסלול נשמר במלואו — שינוי שם, לא שינוי גוף.',
		positions: {
			accountability: 1,
			'rule-of-law': 2,
			'clean-hands': 2,
			'political-home': 4,
			'security-storm': 2,
			'arab-partnership': 2,
			'civic-equality': 2,
			'civic-covenant': 2,
			'sabbath-rabbinate': 3,
			'bread-and-home': 2,
			'democracy-itself': 4,
			'world-partners': 1,
		},
	},
	{
		slug: 'raam',
		name: 'רע״ם',
		color: '#1c7a4b',
		description:
			'מנסור עבאס. ממשיכה, מתמודדת בנפרד. מסלול על בסיס מצע, הצבעות והתבטאויות של המפלגה עצמה.',
		positions: {
			accountability: 2,
			'rule-of-law': 2,
			'clean-hands': 2,
			'political-home': 3,
			'security-storm': 4,
			'arab-partnership': 1,
			'civic-equality': 1,
			'civic-covenant': 3,
			'sabbath-rabbinate': 3,
			'bread-and-home': 4,
			'democracy-itself': 2,
			'world-partners': 3,
		},
	},
	{
		slug: 'joint-list',
		name: 'הרשימה המשותפת',
		color: '#b03030',
		description:
			'חד״ש, תע״ל ובל״ד. רשימה משותפת שחודשה לקראת הבחירות. מסלול על בסיס עמדות חד״ש-תע״ל, שהן רוב הרשימה ובעלות התיעוד הרציף.',
		positions: {
			accountability: 1,
			'rule-of-law': 1,
			'clean-hands': 1,
			'political-home': 3,
			'security-storm': 4,
			'arab-partnership': 1,
			'civic-equality': 1,
			'civic-covenant': 2,
			'sabbath-rabbinate': 1,
			'bread-and-home': 1,
			'democracy-itself': 1,
			'world-partners': 3,
		},
	},
];
