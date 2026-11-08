/**
 * The words of the "someone replied" push (IA 22.7), in the seven languages of
 * join-class. The body never carries the reply's text or anyone's name: a
 * child's lock screen may be shared. The title is the lesson's own name.
 */

export const REPLY_PUSH_LANGUAGES = ['he', 'en', 'ar', 'fa', 'de', 'es', 'nl'] as const;
export type ReplyPushLanguage = (typeof REPLY_PUSH_LANGUAGES)[number];

const DEFAULT_LANGUAGE: ReplyPushLanguage = 'he';

interface ReplyPushWords {
	one: string;
	/** `{{n}}` is the number of new replies. */
	many: string;
}

const WORDS: Record<ReplyPushLanguage, ReplyPushWords> = {
	he: { one: 'יש תגובה חדשה להצעה שלכם', many: '{{n}} תגובות חדשות להצעה שלכם' },
	en: { one: 'There is a new reply to your proposal', many: '{{n}} new replies to your proposal' },
	ar: { one: 'يوجد تعليق جديد على اقتراحكم', many: '{{n}} تعليقات جديدة على اقتراحكم' },
	fa: { one: 'یک نظر تازه دربارهٔ پیشنهاد شما', many: '{{n}} نظر تازه دربارهٔ پیشنهاد شما' },
	de: {
		one: 'Es gibt einen neuen Kommentar zu eurem Vorschlag',
		many: '{{n}} neue Kommentare zu eurem Vorschlag',
	},
	es: {
		one: 'Hay un comentario nuevo sobre vuestra propuesta',
		many: '{{n}} comentarios nuevos sobre vuestra propuesta',
	},
	nl: {
		one: 'Er is een nieuwe reactie op jullie voorstel',
		many: '{{n}} nieuwe reacties op jullie voorstel',
	},
};

/** A stored language code ('he', 'he-IL', 'EN') to one we have words for; Hebrew otherwise. */
export function replyPushLanguageOf(value: unknown): ReplyPushLanguage {
	if (typeof value !== 'string') return DEFAULT_LANGUAGE;
	const base = value.trim().toLowerCase().split('-')[0];

	return (REPLY_PUSH_LANGUAGES as readonly string[]).includes(base)
		? (base as ReplyPushLanguage)
		: DEFAULT_LANGUAGE;
}

/** The push body for `count` new replies (at least one). */
export function replyPushBody(language: ReplyPushLanguage, count: number): string {
	const words = WORDS[language];

	return count > 1 ? words.many.replace('{{n}}', String(count)) : words.one;
}
