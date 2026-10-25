import {
	Access,
	StatementType,
	createParagraphChildStatement,
	createStatementObject,
} from '@freedi/shared-types';
import type {
	ListType,
	ParagraphType,
	Statement,
	StatementSettings,
	User,
} from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure mapper of `classCloneLesson`: what a new lesson takes from a source
 * lesson. An ALLOWLIST, never "copy everything then delete": a field the
 * mapper does not name does not travel (ballot, roundPhase, hide, counters,
 * selections, classTable, progress, old classCode, lastChildUpdate...).
 * No Firestore here; the callable reads the source and writes the result.
 */

/** Caps on what one copy may carry (the plan screen's own limits are lower). */
export const CLONE_MAX_QUESTIONS = 50;
export const CLONE_MAX_PARAGRAPHS = 30;

/** Class code alphabet: six digits, leading zeros allowed (same as the client's generator). */
export const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_RADIX = 10;

/** The default flags `createSimpleQuestion` / `createSubQuestion` give a lesson's statements. */
const DEFAULT_FLAGS: Pick<
	StatementSettings,
	| 'showEvaluation'
	| 'enableAddEvaluationOption'
	| 'enableAddVotingOption'
	| 'enableSimilaritiesSearch'
	| 'enableNavigationalElements'
> = {
	showEvaluation: true,
	enableAddEvaluationOption: true,
	enableAddVotingOption: true,
	enableSimilaritiesSearch: true,
	enableNavigationalElements: true,
};

/** A copy always gets the CURRENT steps (9, with "כל ההצעות"), whatever the source had (IA 19.8). */
export const LESSON_STEPS = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'allProposals',
	'vote',
	'summary',
] as const;

/** A random six-digit code. `random` returns [0, 1). */
export function generateClassCode(random: () => number = Math.random): string {
	let code = '';
	for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
		code += Math.floor(random() * CLASS_CODE_RADIX).toString();
	}

	return code;
}

/** Line breaks become spaces, so `splitStatementIntoParagraphs` never splits a copy again. */
export function flattenLines(text: string): string {
	return text.replace(/\s*\r?\n\s*/g, ' ').trim();
}

/** Join's manual order: explicit `order`, then creation time (same rule as the client). */
export function compareByManualOrder(a: Statement, b: Statement): number {
	const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
	const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
	if (ao !== bo) return ao - bo;

	return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

function paragraphOrder(p: Statement): number {
	return p.order ?? p.doc?.order ?? Number.MAX_SAFE_INTEGER;
}

function compareParagraphs(a: Statement, b: Statement): number {
	const diff = paragraphOrder(a) - paragraphOrder(b);

	return diff !== 0 ? diff : (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/** True for the sub-questions a plan holds: not hidden, not a table's own question. */
export function isPlanQuestion(s: Statement, mainId: string): boolean {
	return (
		s.parentId === mainId &&
		s.statementType === StatementType.question &&
		s.hide !== true &&
		!s.classTable
	);
}

/** True for the lesson's intro paragraphs: direct, visible paragraph children. */
export function isIntroParagraph(s: Statement, mainId: string): boolean {
	return s.parentId === mainId && s.statementType === StatementType.paragraph && s.hide !== true;
}

/** A lesson is a top-level statement with a lesson plan. */
export function isLesson(main: Statement): boolean {
	return main.parentId === 'top' && !!main.statementSettings?.lessonPlan;
}

export interface LessonCopyInput {
	source: Statement;
	/** Direct children of the source (any type); the mapper picks the plan's own. */
	children: readonly Statement[];
	newMainId: string;
	/** Name of the new lesson; the source's title when empty. */
	title?: string;
	/** The teacher making the copy; becomes creator of every new statement. */
	creator: User;
	classCode: string;
	now: number;
	/** Ids for the new questions and paragraphs. */
	newId: () => string;
}

export interface LessonCopy {
	main: Statement;
	questions: Statement[];
	paragraphs: Statement[];
}

function mainSettings(source: Statement, classCode: string, now: number): StatementSettings {
	const s = source.statementSettings;
	const videos = Array.isArray(s?.introVideos) ? s.introVideos : undefined;
	const sideNames = s?.sideNames;

	return {
		...DEFAULT_FLAGS,
		classCode,
		lessonPlan: { steps: [...LESSON_STEPS], stepIndex: 0, status: 'live', statusAt: now },
		...(videos
			? { introVideos: videos.map((v) => ({ id: v.id, title: v.title, url: v.url })) }
			: {}),
		...(typeof s?.videoUrl === 'string' && s.videoUrl ? { videoUrl: s.videoUrl } : {}),
		...(sideNames && typeof sideNames.a === 'string' && typeof sideNames.b === 'string'
			? { sideNames: { a: sideNames.a, b: sideNames.b } }
			: {}),
	} as StatementSettings;
}

function questionSettings(q: Statement): StatementSettings {
	const role = q.statementSettings?.classRole;
	const hint = q.statementSettings?.hint;

	return {
		...DEFAULT_FLAGS,
		...(role === 'guiding' || role === 'challenge' ? { classRole: role } : {}),
		...(typeof hint === 'string' && hint ? { hint: flattenLines(hint) } : {}),
	} as StatementSettings;
}

function fail(what: string): never {
	throw new ClassroomError('internal', `Could not build the copied ${what}`);
}

/** Builds the new lesson's main statement, its sub-questions and its intro paragraphs. */
export function buildLessonCopy(input: LessonCopyInput): LessonCopy {
	const { source, children, newMainId, creator, now } = input;
	const sourceId = source.statementId;
	const questionsIn = children
		.filter((c) => isPlanQuestion(c, sourceId))
		.sort(compareByManualOrder);
	const paragraphsIn = children
		.filter((c) => isIntroParagraph(c, sourceId))
		.sort(compareParagraphs);
	if (questionsIn.length > CLONE_MAX_QUESTIONS || paragraphsIn.length > CLONE_MAX_PARAGRAPHS) {
		throw new ClassroomError('resource-exhausted', 'This lesson is too big to copy');
	}

	const title = flattenLines(input.title ?? '') || flattenLines(source.statement);
	const built = createStatementObject({
		statementId: newMainId,
		statement: title,
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: newMainId,
		creatorId: creator.uid,
		creator,
		statementSettings: mainSettings(source, input.classCode, now),
	});
	if (!built) fail('lesson');
	const main: Statement = {
		...built,
		createdAt: now,
		lastUpdate: now,
		membership: { ...(built.membership ?? {}), access: Access.openToAll },
		sourceLessonId: sourceId,
		sourceLessonTitle: flattenLines(source.statement),
		...(source.defaultLanguage
			? { defaultLanguage: source.defaultLanguage, forceLanguage: source.forceLanguage === true }
			: {}),
		...(source.description ? { description: flattenLines(source.description) } : {}),
	};

	const questions = questionsIn.map((q, index) => {
		const copy = createStatementObject({
			statementId: input.newId(),
			statement: flattenLines(q.statement),
			statementType: StatementType.question,
			parentId: newMainId,
			topParentId: newMainId,
			parents: [newMainId],
			creatorId: creator.uid,
			creator,
			statementSettings: questionSettings(q),
		});
		if (!copy) fail('question');

		return { ...copy, createdAt: now, lastUpdate: now, order: index };
	});

	const paragraphs = paragraphsIn.map((p, index) => {
		const copy = createParagraphChildStatement({
			statementId: input.newId(),
			content: flattenLines(p.statement),
			host: { statementId: newMainId, topParentId: newMainId },
			creator,
			order: p.order ?? index,
			blockType: (p.blockType ?? p.doc?.paragraphType) as ParagraphType | undefined,
			listType: p.doc?.listType as ListType | undefined,
			contentHtml: p.doc?.contentHtml === undefined ? undefined : flattenLines(p.doc.contentHtml),
		});
		if (!copy) fail('paragraph');

		return { ...copy, createdAt: now, lastUpdate: now };
	});

	return { main, questions, paragraphs };
}
