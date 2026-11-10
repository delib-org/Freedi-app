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
const LATIN_LETTER = /[A-Za-z]/;

/**
 * The language to write to one person in.
 *
 * The app keeps the chosen language in the browser only, so a stored language
 * is rare. The next best signal is the text the person wrote themselves.
 */
export function pickNoticeLanguage(
	storedLanguage: string | undefined,
	sampleText?: string,
): NoticeLanguage {
	const stored = storedLanguage?.toLowerCase();
	if (stored?.startsWith('he')) return 'he';
	if (stored?.startsWith('en')) return 'en';

	if (sampleText && HEBREW_LETTER.test(sampleText)) return 'he';
	if (sampleText && LATIN_LETTER.test(sampleText)) return 'en';

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
	he: (preview) => `התשובה שלך "${preview}" הייתה חלק ממה שהקבוצה שקלה. התוצאות פתוחות עכשיו לכולם.`,
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
