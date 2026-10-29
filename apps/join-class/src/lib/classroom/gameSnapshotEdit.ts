import {
	CLASS_GAME_MAX_PARAGRAPHS,
	CLASS_GAME_MAX_QUESTIONS,
	ParagraphType,
} from '@freedi/shared-types';
import type {
	ClassGameParagraph,
	ClassGameQuestion,
	ClassGameSnapshot,
} from '@freedi/shared-types';
import type { IntroBlock, IntroDiff, SavedBlock } from './introText';
import type { IntroVideo } from './introVideos';

/**
 * Edits of a game's snapshot, as pure functions: each takes a snapshot and
 * returns a new one (the input is never touched). The game screen is the plan
 * screen on a game doc, and these are the writes it makes: the same edits the
 * plan screen makes on a lesson's statements (text, hint, order, role, intro,
 * videos, sides, settings, language).
 *
 * Firestore refuses `undefined`, so every result goes through `cleaned`.
 */

export type GameQuestionRole = 'guiding' | 'challenge';

/** Lesson-level details the plan screen saves (same shape as `saveLessonDetails`). */
export interface GameDetails {
	videoUrl?: string;
	sideNames?: { a: string; b: string };
	sideQuestion?: string;
	sideClaims?: { a: string; b: string };
	allowOwnQuestions?: boolean;
	speakSeconds?: number;
	proposalsTurns?: number;
}

/** A snapshot with every `undefined` left out (deep, through plain JSON). */
export function cleaned(snapshot: ClassGameSnapshot): ClassGameSnapshot {
	return JSON.parse(JSON.stringify(snapshot)) as ClassGameSnapshot;
}

/** Questions in their saved order. */
export function orderedQuestions(snapshot: ClassGameSnapshot): ClassGameQuestion[] {
	return [...snapshot.questions].sort((a, b) => a.order - b.order);
}

/** Paragraphs in their saved order. */
export function orderedParagraphs(snapshot: ClassGameSnapshot): ClassGameParagraph[] {
	return [...snapshot.paragraphs].sort((a, b) => a.order - b.order);
}

export function emptySnapshot(language?: string): ClassGameSnapshot {
	return {
		questions: [],
		paragraphs: [],
		introVideos: [],
		settings: {},
		...(language ? { defaultLanguage: language, forceLanguage: true } : {}),
	};
}

export function setQuestionText(
	snapshot: ClassGameSnapshot,
	key: string,
	text: string,
): ClassGameSnapshot {
	return cleaned({
		...snapshot,
		questions: snapshot.questions.map((q) => (q.key === key ? { ...q, text } : q)),
	});
}

/** An empty hint removes it. */
export function setQuestionHint(
	snapshot: ClassGameSnapshot,
	key: string,
	hint: string,
): ClassGameSnapshot {
	return cleaned({
		...snapshot,
		questions: snapshot.questions.map((q) => {
			if (q.key !== key) return q;
			const rest: ClassGameQuestion = { ...q };
			delete rest.hint;

			return hint === '' ? rest : { ...rest, hint };
		}),
	});
}

/** Adds a question at `order` (the end when omitted). Throws past the game's cap. */
export function addQuestion(
	snapshot: ClassGameSnapshot,
	input: { key: string; text: string; role: GameQuestionRole; order?: number },
): ClassGameSnapshot {
	if (snapshot.questions.some((q) => q.key === input.key)) return snapshot;
	if (snapshot.questions.length >= CLASS_GAME_MAX_QUESTIONS) {
		throw new RangeError(`A game holds at most ${CLASS_GAME_MAX_QUESTIONS} questions`);
	}
	const order = input.order ?? snapshot.questions.reduce((max, q) => Math.max(max, q.order + 1), 0);
	const question: ClassGameQuestion = {
		key: input.key,
		text: input.text,
		order,
		classRole: input.role,
	};

	return cleaned({ ...snapshot, questions: [...snapshot.questions, question] });
}

export function removeQuestion(snapshot: ClassGameSnapshot, key: string): ClassGameSnapshot {
	return cleaned({ ...snapshot, questions: snapshot.questions.filter((q) => q.key !== key) });
}

/** Gives the listed questions orders 0..n-1 in the listed sequence; the others keep their sequence after them. */
export function reorderQuestions(
	snapshot: ClassGameSnapshot,
	orderedKeys: readonly string[],
): ClassGameSnapshot {
	const position = new Map(orderedKeys.map((key, index) => [key, index]));
	const rest = orderedQuestions(snapshot).filter((q) => !position.has(q.key));
	const base = orderedKeys.length;

	return cleaned({
		...snapshot,
		questions: [
			...snapshot.questions
				.filter((q) => position.has(q.key))
				.map((q) => ({ ...q, order: position.get(q.key) ?? q.order })),
			...rest.map((q, index) => ({ ...q, order: base + index })),
		],
	});
}

/** Merges lesson details: a side pair or a setting replaces the old one, as the lesson's settings do. */
export function setDetails(snapshot: ClassGameSnapshot, details: GameDetails): ClassGameSnapshot {
	const { sideNames, sideClaims, ...settings } = details;
	const nextSettings = { ...snapshot.settings, ...settings };
	if (settings.sideQuestion === '') delete nextSettings.sideQuestion;

	return cleaned({
		...snapshot,
		settings: nextSettings,
		...(sideNames ? { sideNames } : {}),
		...(sideClaims ? { sideClaims } : {}),
	});
}

/** `null` clears the lesson language (each student's own device language). */
export function setLanguage(
	snapshot: ClassGameSnapshot,
	language: string | null,
): ClassGameSnapshot {
	const next: ClassGameSnapshot = { ...snapshot };
	delete next.defaultLanguage;
	delete next.forceLanguage;
	if (language !== null) {
		next.defaultLanguage = language;
		next.forceLanguage = true;
	}

	return cleaned(next);
}

/** The whole video list at once; the old single `videoUrl` is retired with the first write. */
export function setVideos(
	snapshot: ClassGameSnapshot,
	videos: readonly IntroVideo[],
): ClassGameSnapshot {
	const settings = { ...snapshot.settings };
	delete settings.videoUrl;

	return cleaned({
		...snapshot,
		settings,
		introVideos: videos.map((v) => ({ id: v.id, title: v.title, url: v.url })),
	});
}

/** The saved paragraphs as the editor's blocks, keyed by the paragraph's own key. */
export function blocksOf(snapshot: ClassGameSnapshot): SavedBlock[] {
	return orderedParagraphs(snapshot).map((p): SavedBlock => {
		const isItem = p.blockType === ParagraphType.li;
		const block: SavedBlock = {
			type: isItem ? ParagraphType.li : ParagraphType.paragraph,
			content: p.text,
			statementId: p.key,
			order: p.order,
		};
		if (isItem) block.listType = p.listType === 'ol' ? 'ol' : 'ul';
		if (p.contentHtml) block.contentHtml = p.contentHtml;

		return block;
	});
}

function paragraphOf(key: string, block: IntroBlock, order: number): ClassGameParagraph {
	return {
		key,
		text: block.content,
		order,
		blockType: block.type,
		...(block.listType !== undefined ? { listType: block.listType } : {}),
		...(block.contentHtml !== undefined ? { contentHtml: block.contentHtml } : {}),
	};
}

/** Applies the intro editor's block diff. `newKey` makes the key of each created paragraph. */
export function applyIntroDiff(
	snapshot: ClassGameSnapshot,
	diff: IntroDiff,
	newKey: () => string,
): ClassGameSnapshot {
	const updates = new Map(diff.updates.map((u) => [u.statementId, u]));
	const deletes = new Set(diff.deletes);
	const kept = snapshot.paragraphs
		.filter((p) => !deletes.has(p.key))
		.map((p) => {
			const update = updates.get(p.key);

			return update ? paragraphOf(p.key, update.block, update.order) : p;
		});
	const created = diff.creates.map((c) => paragraphOf(newKey(), c.block, c.order));
	const paragraphs = [...kept, ...created];
	if (paragraphs.length > CLASS_GAME_MAX_PARAGRAPHS) {
		throw new RangeError(`A game holds at most ${CLASS_GAME_MAX_PARAGRAPHS} intro paragraphs`);
	}

	return cleaned({ ...snapshot, paragraphs });
}
