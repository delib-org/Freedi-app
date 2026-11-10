/**
 * The one in-app notice an author gets when the automatic check hides their
 * answer. Plain, no score, no quote of the answer.
 *
 * Cloud Functions have no `shared-i18n` dependency (see noticeText.ts), so the
 * seven languages live here. "Host" uses each language's `host.title` term.
 */

import { NotificationType, SourceApp, Statement, StatementType } from '@freedi/shared-types';
import { DEFAULT_NOTICE_LANGUAGE } from '../engagement/notifications/noticeText';

interface AnswerHiddenCopy {
	sender: string;
	title: string;
	body: string;
}

const COPY = {
	en: {
		sender: 'Automatic check',
		title: 'Your answer was hidden',
		body: 'The automatic check hid your answer. The host of this question can restore it.',
	},
	he: {
		sender: 'בדיקה אוטומטית',
		title: 'התשובה שלך הוסתרה',
		body: 'הבדיקה האוטומטית הסתירה את התשובה שלך. המארח/ת של השאלה יכול/ה להחזיר אותה.',
	},
	ar: {
		sender: 'فحص تلقائي',
		title: 'تم إخفاء إجابتك',
		body: 'أخفى الفحص التلقائي إجابتك. يمكن لمضيف هذا السؤال إعادتها.',
	},
	fa: {
		sender: 'بررسی خودکار',
		title: 'پاسخ شما پنهان شد',
		body: 'بررسی خودکار پاسخ شما را پنهان کرد. میزبان این پرسش می‌تواند آن را برگرداند.',
	},
	es: {
		sender: 'Revisión automática',
		title: 'Tu respuesta se ocultó',
		body: 'La revisión automática ocultó tu respuesta. El anfitrión de esta pregunta puede restaurarla.',
	},
	de: {
		sender: 'Automatische Prüfung',
		title: 'Deine Antwort wurde verborgen',
		body: 'Die automatische Prüfung hat deine Antwort verborgen. Der Host dieser Frage kann sie wiederherstellen.',
	},
	nl: {
		sender: 'Automatische controle',
		title: 'Je antwoord is verborgen',
		body: 'De automatische controle heeft je antwoord verborgen. De host van deze vraag kan het terugzetten.',
	},
} as const satisfies Record<string, AnswerHiddenCopy>;

export type AnswerHiddenLanguage = keyof typeof COPY;

const LANGUAGE_CODE_LENGTH = 2;
const HEBREW_LETTER = /[֐-׿]/;
const ARABIC_SCRIPT_LETTER = /[؀-ۿ]/;
const ANY_LETTER = /\p{L}/u;

function isSupportedLanguage(code: string): code is AnswerHiddenLanguage {
	return code in COPY;
}

/** A stored language wins; with none, the script of the person's own text decides. */
export function pickAnswerHiddenLanguage(
	storedLanguage: string | undefined,
	sampleText: string,
): AnswerHiddenLanguage {
	if (storedLanguage) {
		const code = storedLanguage.toLowerCase().substring(0, LANGUAGE_CODE_LENGTH);

		return isSupportedLanguage(code) ? code : 'en';
	}
	if (HEBREW_LETTER.test(sampleText)) return 'he';
	if (ARABIC_SCRIPT_LETTER.test(sampleText)) return 'ar';
	if (ANY_LETTER.test(sampleText)) return 'en';

	return DEFAULT_NOTICE_LANGUAGE;
}

export function answerHiddenNoticeId(statementId: string): string {
	return `answerHidden--${statementId}`;
}

interface AnswerHiddenNoticeInput {
	answer: Statement;
	language: AnswerHiddenLanguage;
	questionTitle?: string;
	now: number;
}

export function buildAnswerHiddenNotice(input: AnswerHiddenNoticeInput): NotificationType {
	const { answer, language, questionTitle, now } = input;
	const copy = COPY[language];

	return {
		userId: answer.creatorId,
		parentId: answer.parentId,
		statementId: answer.statementId,
		statementType: StatementType.option,
		...(questionTitle ? { parentStatement: questionTitle } : {}),
		text: copy.body,
		title: copy.title,
		creatorId: 'system:moderation',
		creatorName: copy.sender,
		createdAt: now,
		read: false,
		notificationId: answerHiddenNoticeId(answer.statementId),
		sourceApp: SourceApp.MAIN,
		targetPath: `/statement/${answer.parentId}?focusId=${answer.statementId}`,
	};
}
