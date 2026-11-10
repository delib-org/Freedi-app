/**
 * Wording of the notices about a person's own answers, in English and Hebrew.
 *
 * Cloud Functions have no `shared-i18n` dependency, so these few strings live
 * here. The wording comes from the ethics review of the engagement notices and
 * uses "answer / תשובה", "rate / דירוג" and "agreement score / ציון הסכמה".
 */

export type NoticeLanguage = 'en' | 'he';

export interface NoticeCopy {
	title: string;
	body: string;
}

/**
 * Used when nothing says what language a person reads. Hebrew, because a Hebrew
 * participant must never receive English and most questions here are Hebrew.
 */
export const DEFAULT_NOTICE_LANGUAGE: NoticeLanguage = 'he';

const PREVIEW_LENGTH = 60;
const HEBREW_LETTER = /[֐-׿]/;
const ANY_LETTER = /\p{L}/u;

/**
 * The language to write to one person in.
 *
 * A stored language wins; there is wording only for Hebrew and English, so any
 * other stored language gets English. With nothing stored, the best signal is
 * the script of the text the person wrote themselves.
 */
export function pickNoticeLanguage(
	storedLanguage: string | undefined,
	sampleText?: string,
): NoticeLanguage {
	if (storedLanguage) return storedLanguage.toLowerCase().startsWith('he') ? 'he' : 'en';

	if (sampleText && HEBREW_LETTER.test(sampleText)) return 'he';
	if (sampleText && ANY_LETTER.test(sampleText)) return 'en';

	return DEFAULT_NOTICE_LANGUAGE;
}

export function answerPreview(text: string): string {
	return text.length > PREVIEW_LENGTH ? `${text.substring(0, PREVIEW_LENGTH)}...` : text;
}

const ANSWER_UPDATE: Record<NoticeLanguage, (preview: string) => NoticeCopy> = {
	en: (preview) => ({
		title: 'Update on your answer',
		body: `More people have rated your answer "${preview}" and its agreement score has changed. The score is shown next to your answer.`,
	}),
	he: (preview) => ({
		title: 'עדכון על התשובה שלך',
		body: `עוד אנשים דירגו את התשובה שלך "${preview}" וציון ההסכמה שלה השתנה. הציון מופיע ליד התשובה.`,
	}),
};

const DECIDED_TITLE: Record<NoticeLanguage, string> = {
	en: 'The group has decided',
	he: 'הקבוצה החליטה',
};

const DECIDED_ONE: Record<NoticeLanguage, (preview: string) => string> = {
	en: (preview) =>
		`Your answer "${preview}" was part of what the group weighed. Results are now open to everyone.`,
	he: (preview) =>
		`התשובה שלך "${preview}" הייתה חלק ממה שהקבוצה שקלה. התוצאות פתוחות עכשיו לכולם.`,
};

const DECIDED_SEVERAL: Record<NoticeLanguage, string> = {
	en: 'Your answers were part of what the group weighed. Results are now open to everyone.',
	he: 'התשובות שלך היו חלק ממה שהקבוצה שקלה. התוצאות פתוחות עכשיו לכולם.',
};

/** States no direction, size or number: only that the score changed. */
export function answerUpdateCopy(language: NoticeLanguage, preview: string): NoticeCopy {
	return ANSWER_UPDATE[language](preview);
}

/** The closing notice. `preview` is the answer's text when the author wrote exactly one. */
export function decidedCopy(language: NoticeLanguage, preview: string | undefined): NoticeCopy {
	return {
		title: DECIDED_TITLE[language],
		body: preview === undefined ? DECIDED_SEVERAL[language] : DECIDED_ONE[language](preview),
	};
}

const MILESTONE: Record<NoticeLanguage, (count: number, preview: string) => NoticeCopy> = {
	en: (count, preview) => ({
		title: 'People are reading your answer',
		body: `${count} people have rated your answer: "${preview}"`,
	}),
	he: (count, preview) => ({
		title: 'אנשים קוראים את התשובה שלך',
		body: `${count} אנשים דירגו את התשובה שלך: "${preview}"`,
	}),
};

const LEVEL_UP: Record<NoticeLanguage, (level: number) => NoticeCopy> = {
	en: (level) => ({
		title: 'New level',
		body: `Thanks for taking part. You've reached level ${level}.`,
	}),
	he: (level) => ({
		title: 'רמה חדשה',
		body: `תודה על ההשתתפות. הגעת לרמה ${level}.`,
	}),
};

interface BadgeWords {
	name: string;
	description: string;
}

const BADGE_WORDS: Record<NoticeLanguage, Record<string, BadgeWords>> = {
	en: {
		first_evaluation: { name: 'First Voice', description: 'Rated your first answer' },
		evaluator_10: { name: 'Active Evaluator', description: 'Rated 10 answers' },
		evaluator_50: { name: 'Expert Evaluator', description: 'Rated 50 answers' },
		first_option: { name: 'Idea Maker', description: 'Added your first answer' },
		creator_5: { name: 'Creative Mind', description: 'Added 5 answers' },
		first_vote: { name: 'Voter', description: 'Cast your first vote' },
		commenter_10: { name: 'Conversationalist', description: 'Left 10 comments' },
	},
	he: {
		first_evaluation: { name: 'קול ראשון', description: 'דירגת את התשובה הראשונה שלך' },
		evaluator_10: { name: 'דירוג פעיל', description: 'דירגת 10 תשובות' },
		evaluator_50: { name: 'מומחיות בדירוג', description: 'דירגת 50 תשובות' },
		first_option: { name: 'תשובה ראשונה', description: 'הוספת את התשובה הראשונה שלך' },
		creator_5: { name: 'יצירתיות', description: 'הוספת 5 תשובות' },
		first_vote: { name: 'הצבעה ראשונה', description: 'הצבעת בפעם הראשונה' },
		commenter_10: { name: 'שיחה פעילה', description: 'כתבת 10 תגובות' },
	},
};

const BADGE_TITLE: Record<NoticeLanguage, string> = { en: 'New badge', he: 'תג חדש' };

const BADGE_BODY: Record<NoticeLanguage, (words: BadgeWords) => string> = {
	en: ({ name, description }) => `You earned the "${name}" badge: ${description}`,
	he: ({ name, description }) => `קיבלת את התג "${name}": ${description}`,
};

/** For a badge with no words here: says less rather than switch language. */
const BADGE_GENERIC: Record<NoticeLanguage, string> = {
	en: 'You earned a new badge.',
	he: 'קיבלת תג חדש.',
};

export function milestoneCopy(
	language: NoticeLanguage,
	count: number,
	preview: string,
): NoticeCopy {
	return MILESTONE[language](count, preview);
}

/** `level` is the number people see: a number, never a name that implies status. */
export function levelUpCopy(language: NoticeLanguage, level: number): NoticeCopy {
	return LEVEL_UP[language](level);
}

export function badgeCopy(language: NoticeLanguage, badgeId: string): NoticeCopy {
	const words = BADGE_WORDS[language][badgeId];

	return {
		title: BADGE_TITLE[language],
		body: words ? BADGE_BODY[language](words) : BADGE_GENERIC[language],
	};
}
