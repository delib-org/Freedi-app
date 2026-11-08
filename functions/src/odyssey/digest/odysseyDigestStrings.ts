/**
 * The digest's own words, in the three languages a voyage is read in.
 *
 * Hebrew is the source and its strings are the ones that have always gone
 * out — they stay byte-identical. English addresses a neutral "you"; Arabic
 * addresses the plural. The island, stance and elder lines inside the digest
 * are not here: they come from the game's translation overlay.
 */

export type DigestLang = 'he' | 'en' | 'ar';

export const DIGEST_LANGS: readonly DigestLang[] = ['he', 'en', 'ar'];

/** The language a journey is read in — Hebrew for anything unknown or unset. */
export function digestLang(value: unknown): DigestLang {
	return (DIGEST_LANGS as readonly unknown[]).includes(value) ? (value as DigestLang) : 'he';
}

export function digestDir(lang: DigestLang): 'rtl' | 'ltr' {
	return lang === 'en' ? 'ltr' : 'rtl';
}

export interface DigestStrings {
	defaultGameTitle: string;
	listSeparator: string;
	newSailorNearOne: string;
	newSailorsNear(count: number): string;
	newSailorsTotal(count: number): string;
	consensusShift(islandTitle: string, stanceText: string): string;
	unvisitedOne(named: string): string;
	unvisitedMany(count: number, named: string): string;
	subjectShift(gameTitle: string, islandTitle: string): string;
	subjectNear(gameTitle: string): string;
	subjectMoving(gameTitle: string): string;
	backToMap(mapUrl: string): string;
	tagline: string;
	aiPersonaNote: string;
	callToAction: string;
	footerReason: string;
	unsubscribeLink: string;
	unsubscribeInvalid: string;
	unsubscribeDone: string;
	unsubscribeFailed: string;
}

export const DIGEST_STRINGS: Record<DigestLang, DigestStrings> = {
	he: {
		defaultGameTitle: 'אודיסיאה ישראלית',
		listSeparator: ', ',
		newSailorNearOne: 'מפליג/ה חדש/ה אחד/אחת שט/ה קרוב מאוד למסלול שלכם.',
		newSailorsNear: (count) => `${count} מפליגים חדשים שטים קרוב למסלול שלכם.`,
		newSailorsTotal: (count) => `${count} מפליגים סימנו עמדות חדשות בים מאז הביקור האחרון שלכם.`,
		consensusShift: (islandTitle, stanceText) =>
			`באי ${islandTitle} הרוח התהפכה — החוף המוביל עכשיו: "${stanceText}".`,
		unvisitedOne: (named) => `אי אחד עוד מחכה לכם: ${named}.`,
		unvisitedMany: (count, named) => `${count} איים עוד מחכים לכם, ביניהם ${named}.`,
		subjectShift: (gameTitle, islandTitle) => `${gameTitle}: הרוח התהפכה באי ${islandTitle}`,
		subjectNear: (gameTitle) => `${gameTitle}: מפליגים חדשים קרובים אליכם`,
		subjectMoving: (gameTitle) => `${gameTitle}: הים ממשיך לזוז`,
		backToMap: (mapUrl) => `חזרו אל המפה: ${mapUrl}`,
		tagline: 'סיפור המסע שלכם — מה קרה בים מאז שירדתם לחוף',
		aiPersonaNote: 'דמות בינה מלאכותית בהשראת דמות היסטורית',
		callToAction: 'חזרה אל הים ⛵',
		footerReason: 'קיבלתם את המייל הזה כי ביקשתם עדכונים מהמסע.',
		unsubscribeLink: 'להסרה מרשימת התפוצה',
		unsubscribeInvalid: 'הקישור אינו תקין. אפשר לבטל את המייל גם מתוך המשחק עצמו.',
		unsubscribeDone: 'הוסרתם מרשימת התפוצה של סיפור המסע. מחכים לכם בים 🌊',
		unsubscribeFailed: 'משהו השתבש. נסו שוב מאוחר יותר.',
	},
	en: {
		defaultGameTitle: 'Israeli Odyssey',
		listSeparator: ', ',
		newSailorNearOne: 'One new sailor is sailing very close to your course.',
		newSailorsNear: (count) => `${count} new sailors are sailing close to your course.`,
		newSailorsTotal: (count) =>
			`${count} sailors marked new positions at sea since your last visit.`,
		consensusShift: (islandTitle, stanceText) =>
			`On ${islandTitle} island the wind has turned — the leading shore is now: "${stanceText}".`,
		unvisitedOne: (named) => `One island is still waiting for you: ${named}.`,
		unvisitedMany: (count, named) =>
			`${count} islands are still waiting for you, among them ${named}.`,
		subjectShift: (gameTitle, islandTitle) => `${gameTitle}: the wind has turned on ${islandTitle}`,
		subjectNear: (gameTitle) => `${gameTitle}: new sailors near you`,
		subjectMoving: (gameTitle) => `${gameTitle}: the sea keeps moving`,
		backToMap: (mapUrl) => `Back to the map: ${mapUrl}`,
		tagline: 'Your voyage story — what happened at sea since you came ashore',
		aiPersonaNote: 'An AI persona inspired by a historical figure',
		callToAction: 'Back to the sea ⛵',
		footerReason: 'You received this email because you asked for updates from the voyage.',
		unsubscribeLink: 'Unsubscribe',
		unsubscribeInvalid:
			'This link is not valid. You can also turn the email off inside the game itself.',
		unsubscribeDone:
			'You have been removed from the voyage-story mailing list. The sea awaits you 🌊',
		unsubscribeFailed: 'Something went wrong. Please try again later.',
	},
	ar: {
		defaultGameTitle: 'الأوديسة الإسرائيلية',
		listSeparator: '، ',
		newSailorNearOne: 'بحّار جديد واحد يبحر قريبًا جدًا من مساركم.',
		newSailorsNear: (count) => `${count} بحّارة جدد يبحرون قريبًا من مساركم.`,
		newSailorsTotal: (count) => `${count} بحّارة سجّلوا مواقف جديدة في البحر منذ زيارتكم الأخيرة.`,
		consensusShift: (islandTitle, stanceText) =>
			`في جزيرة ${islandTitle} انقلبت الريح — الشاطئ المتقدّم الآن: "${stanceText}".`,
		unvisitedOne: (named) => `جزيرة واحدة ما زالت تنتظركم: ${named}.`,
		unvisitedMany: (count, named) => `${count} جزر ما زالت تنتظركم، من بينها ${named}.`,
		subjectShift: (gameTitle, islandTitle) => `${gameTitle}: انقلبت الريح في جزيرة ${islandTitle}`,
		subjectNear: (gameTitle) => `${gameTitle}: بحّارة جدد قريبون منكم`,
		subjectMoving: (gameTitle) => `${gameTitle}: البحر ما زال يتحرّك`,
		backToMap: (mapUrl) => `عودوا إلى الخريطة: ${mapUrl}`,
		tagline: 'قصة رحلتكم — ما الذي حدث في البحر منذ نزلتم إلى الشاطئ',
		aiPersonaNote: 'شخصية ذكاء اصطناعي مستوحاة من شخصية تاريخية',
		callToAction: 'العودة إلى البحر ⛵',
		footerReason: 'وصلتكم هذه الرسالة لأنكم طلبتم تحديثات من الرحلة.',
		unsubscribeLink: 'إلغاء الاشتراك',
		unsubscribeInvalid: 'الرابط غير صالح. يمكنكم أيضًا إيقاف الرسائل من داخل اللعبة نفسها.',
		unsubscribeDone: 'تمت إزالتكم من قائمة بريد قصة الرحلة. البحر بانتظاركم 🌊',
		unsubscribeFailed: 'حدث خطأ ما. حاولوا مجددًا لاحقًا.',
	},
};

/** The unsubscribe link, carrying the reader's language so the landing page speaks it. */
export function localizedUnsubscribeUrl(unsubscribeUrl: string, lang: DigestLang): string {
	if (lang === 'he') return unsubscribeUrl;

	return `${unsubscribeUrl}${unsubscribeUrl.includes('?') ? '&' : '?'}lang=${lang}`;
}
