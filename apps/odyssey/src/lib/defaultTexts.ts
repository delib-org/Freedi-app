/**
 * The editable screen texts' Hebrew defaults. Kept apart from defaults.ts so
 * the runtime fallback in GameContext.text() does not pull the whole seed
 * content (islands, elders, counsel, research) into the player bundle.
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
