import { safeParse } from 'valibot';
import { Access, StatementType } from '../TypeEnums';
import { ParagraphType } from '../paragraph/paragraphModel';
import type { ListType } from '../paragraph/paragraphModel';
import type { Statement } from '../statement/StatementTypes';
import type { StatementSettings } from '../statement/StatementSettings';
import { createParagraphChildStatement, createStatementObject } from '../statement/StatementUtils';
import type { User } from '../user/User';
import { proposalsTurnsOf, speakSecondsOf, tableSizeOf } from './classroomLogic';
import {
	CLASS_GAME_MAX_PARAGRAPHS,
	CLASS_GAME_MAX_QUESTIONS,
	CLASS_GAME_MAX_TEXT_LENGTH,
	CLASS_GAME_MAX_VIDEOS,
	ClassGameSnapshotSchema,
} from './classPlanModel';
import type {
	ClassGameParagraph,
	ClassGameQuestion,
	ClassGameSnapshot,
	ClassLessonLink,
} from './classPlanModel';

/**
 * join-class: a game's snapshot <-> a lesson's statements. One allowlist, used by the
 * client (copying a lesson into a game) and by the functions (classStartLesson,
 * classSnapshotGame, classCloneLesson, the migration). A field the mapper does not
 * name never travels: ballot, roundPhase, hide, counters, selections, classTable,
 * progress, an old classCode, lastChildUpdate...
 */

/** A new lesson always gets the CURRENT steps, whatever its source had. */
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

const CLASS_ROLES: ReadonlySet<string> = new Set(['guiding', 'challenge']);

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

function nonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function pair(
	value: { a?: unknown; b?: unknown } | undefined,
): { a: string; b: string } | undefined {
	return value && typeof value.a === 'string' && typeof value.b === 'string'
		? { a: value.a, b: value.b }
		: undefined;
}

/**
 * A lesson's plan as a game snapshot. `children` are the lesson's direct children
 * (any type); the mapper picks the visible plan questions and intro paragraphs.
 * Never throws; the caps are checked by `checkSnapshot`.
 */
export function snapshotFromLesson(
	main: Statement,
	children: readonly Statement[],
): ClassGameSnapshot {
	const mainId = main.statementId;
	const s = main.statementSettings;
	const questions: ClassGameQuestion[] = children
		.filter((c) => isPlanQuestion(c, mainId) && flattenLines(c.statement ?? '') !== '')
		.sort(compareByManualOrder)
		.map((q, order) => {
			const role = q.statementSettings?.classRole;
			const hint = q.statementSettings?.hint;

			return {
				key: q.statementId,
				text: flattenLines(q.statement),
				order,
				...(nonEmpty(role) && CLASS_ROLES.has(role) ? { classRole: role } : {}),
				...(nonEmpty(hint) ? { hint: flattenLines(hint) } : {}),
			};
		});
	const paragraphs: ClassGameParagraph[] = children
		.filter((c) => isIntroParagraph(c, mainId) && flattenLines(c.statement ?? '') !== '')
		.sort(compareParagraphs)
		.map((p, index) => {
			const blockType = p.blockType ?? p.doc?.paragraphType;
			const listType = p.doc?.listType;
			const html = p.doc?.contentHtml;

			return {
				key: p.statementId,
				text: flattenLines(p.statement),
				order: p.order ?? index,
				...(nonEmpty(blockType) ? { blockType } : {}),
				...(nonEmpty(listType) ? { listType } : {}),
				...(typeof html === 'string' ? { contentHtml: flattenLines(html) } : {}),
			};
		});
	const videos = Array.isArray(s?.introVideos) ? s.introVideos : [];
	const sideNames = pair(s?.sideNames);
	const sideClaims = pair(s?.sideClaims);
	const settings: ClassGameSnapshot['settings'] = {
		...(s?.speakSeconds !== undefined
			? { speakSeconds: speakSecondsOf({ statementSettings: s }) }
			: {}),
		...(s?.proposalsTurns !== undefined
			? { proposalsTurns: proposalsTurnsOf({ statementSettings: s }) }
			: {}),
		...(s?.tableSize !== undefined ? { tableSize: tableSizeOf({ statementSettings: s }) } : {}),
		...(typeof s?.allowOwnQuestions === 'boolean'
			? { allowOwnQuestions: s.allowOwnQuestions }
			: {}),
		...(nonEmpty(s?.sideQuestion) ? { sideQuestion: s.sideQuestion } : {}),
		...(nonEmpty(s?.videoUrl) ? { videoUrl: s.videoUrl } : {}),
	};

	return {
		questions,
		paragraphs,
		introVideos: videos.map((v) => ({ id: v.id, title: v.title, url: v.url })),
		...(sideNames ? { sideNames } : {}),
		...(sideClaims ? { sideClaims } : {}),
		settings,
		...(main.description ? { description: flattenLines(main.description) } : {}),
		...(main.defaultLanguage
			? { defaultLanguage: main.defaultLanguage, forceLanguage: main.forceLanguage === true }
			: {}),
	};
}

export type SnapshotProblem = 'invalid' | 'too-big';

function textsOf(snapshot: ClassGameSnapshot): string[] {
	return [
		...snapshot.questions.flatMap((q) => [q.text, q.hint ?? '']),
		...snapshot.paragraphs.flatMap((p) => [p.text, p.contentHtml ?? '']),
		...snapshot.introVideos.flatMap((v) => [v.title, v.url]),
		snapshot.sideNames?.a ?? '',
		snapshot.sideNames?.b ?? '',
		snapshot.sideClaims?.a ?? '',
		snapshot.sideClaims?.b ?? '',
		snapshot.settings.sideQuestion ?? '',
		snapshot.settings.videoUrl ?? '',
		snapshot.description ?? '',
	];
}

/**
 * Validates a snapshot that may have been written by a client (a game doc): its
 * shape, and the caps on counts and text lengths. Returns the parsed snapshot
 * (unknown keys dropped) or the problem.
 */
export function checkSnapshot(
	raw: unknown,
): { ok: true; snapshot: ClassGameSnapshot } | { ok: false; problem: SnapshotProblem } {
	const parsed = safeParse(ClassGameSnapshotSchema, raw);
	if (!parsed.success) return { ok: false, problem: 'invalid' };
	const snapshot = parsed.output;
	if (
		snapshot.questions.length > CLASS_GAME_MAX_QUESTIONS ||
		snapshot.paragraphs.length > CLASS_GAME_MAX_PARAGRAPHS ||
		snapshot.introVideos.length > CLASS_GAME_MAX_VIDEOS ||
		textsOf(snapshot).some((t) => t.length > CLASS_GAME_MAX_TEXT_LENGTH)
	) {
		return { ok: false, problem: 'too-big' };
	}

	return { ok: true, snapshot };
}

function lessonSettings(
	snapshot: ClassGameSnapshot,
	classCode: string,
	now: number,
	classLesson: ClassLessonLink | undefined,
): StatementSettings {
	const g = snapshot.settings;
	const holder = { statementSettings: g as StatementSettings };

	return {
		...DEFAULT_FLAGS,
		classCode,
		lessonPlan: { steps: [...LESSON_STEPS], stepIndex: 0, status: 'live', statusAt: now },
		...(classLesson
			? {
					classLesson: {
						planId: classLesson.planId,
						gameId: classLesson.gameId,
						classId: classLesson.classId ?? null,
						className: classLesson.className,
					},
				}
			: {}),
		...(snapshot.introVideos.length > 0
			? { introVideos: snapshot.introVideos.map((v) => ({ id: v.id, title: v.title, url: v.url })) }
			: {}),
		...(nonEmpty(g.videoUrl) ? { videoUrl: g.videoUrl } : {}),
		...(snapshot.sideNames ? { sideNames: { ...snapshot.sideNames } } : {}),
		...(nonEmpty(g.sideQuestion) ? { sideQuestion: g.sideQuestion } : {}),
		...(snapshot.sideClaims ? { sideClaims: { ...snapshot.sideClaims } } : {}),
		...(g.speakSeconds !== undefined ? { speakSeconds: speakSecondsOf(holder) } : {}),
		...(g.proposalsTurns !== undefined ? { proposalsTurns: proposalsTurnsOf(holder) } : {}),
		...(g.tableSize !== undefined ? { tableSize: tableSizeOf(holder) } : {}),
		...(typeof g.allowOwnQuestions === 'boolean' ? { allowOwnQuestions: g.allowOwnQuestions } : {}),
	} as StatementSettings;
}

function questionSettings(q: ClassGameQuestion): StatementSettings {
	return {
		...DEFAULT_FLAGS,
		...(nonEmpty(q.classRole) && CLASS_ROLES.has(q.classRole) ? { classRole: q.classRole } : {}),
		...(nonEmpty(q.hint) ? { hint: flattenLines(q.hint) } : {}),
	} as StatementSettings;
}

export interface LessonFromSnapshotInput {
	snapshot: ClassGameSnapshot;
	/** The class or teacher home the lesson goes under. */
	homeId: string;
	lessonId: string;
	/** The lesson's title (the game's title). Flattened; must not be empty. */
	title: string;
	/** The teacher; creator of every new statement. */
	creator: User;
	classCode: string;
	now: number;
	/** Ids for the new questions and paragraphs. */
	newId: () => string;
	classLesson?: ClassLessonLink;
	/** Old lesson this one was copied from (classCloneLesson): sourceLessonId / sourceLessonTitle. */
	sourceLesson?: { id: string; title: string };
}

export interface LessonStatements {
	main: Statement;
	questions: Statement[];
	paragraphs: Statement[];
}

/**
 * Builds a lesson under a home from a game snapshot: the lesson
 * (parentId = topParentId = home, parents [home]), its questions and intro
 * paragraphs (parentId lesson, topParentId home, parents [home, lesson]).
 * Returns undefined when any statement fails the Statement schema.
 */
export function lessonFromSnapshot(input: LessonFromSnapshotInput): LessonStatements | undefined {
	const { snapshot, homeId, lessonId, creator, now } = input;
	const title = flattenLines(input.title);
	if (!title) return undefined;
	const built = createStatementObject({
		statementId: lessonId,
		statement: title,
		statementType: StatementType.question,
		parentId: homeId,
		topParentId: homeId,
		parents: [homeId],
		creatorId: creator.uid,
		creator,
		statementSettings: lessonSettings(snapshot, input.classCode, now, input.classLesson),
	});
	if (!built) return undefined;
	const main: Statement = {
		...built,
		createdAt: now,
		lastUpdate: now,
		membership: { ...(built.membership ?? {}), access: Access.openToAll },
		...(input.sourceLesson
			? {
					sourceLessonId: input.sourceLesson.id,
					sourceLessonTitle: flattenLines(input.sourceLesson.title),
				}
			: {}),
		...(snapshot.defaultLanguage
			? {
					defaultLanguage: snapshot.defaultLanguage,
					forceLanguage: snapshot.forceLanguage === true,
				}
			: {}),
		...(snapshot.description ? { description: flattenLines(snapshot.description) } : {}),
	};

	const questions: Statement[] = [];
	const ordered = snapshot.questions
		.filter((q) => flattenLines(q.text) !== '')
		.sort((a, b) => a.order - b.order);
	for (const [index, q] of ordered.entries()) {
		const copy = createStatementObject({
			statementId: input.newId(),
			statement: flattenLines(q.text),
			statementType: StatementType.question,
			parentId: lessonId,
			topParentId: homeId,
			parents: [homeId, lessonId],
			creatorId: creator.uid,
			creator,
			statementSettings: questionSettings(q),
		});
		if (!copy) return undefined;
		questions.push({ ...copy, createdAt: now, lastUpdate: now, order: index });
	}

	const paragraphs: Statement[] = [];
	const paras = snapshot.paragraphs
		.filter((p) => flattenLines(p.text) !== '')
		.sort((a, b) => a.order - b.order);
	for (const p of paras) {
		const copy = createParagraphChildStatement({
			statementId: input.newId(),
			content: flattenLines(p.text),
			host: { statementId: lessonId, topParentId: homeId },
			creator,
			order: p.order,
			blockType: p.blockType as ParagraphType | undefined,
			listType: p.listType as ListType | undefined,
			contentHtml: p.contentHtml === undefined ? undefined : flattenLines(p.contentHtml),
		});
		if (!copy) return undefined;
		paragraphs.push({ ...copy, parents: [homeId, lessonId], createdAt: now, lastUpdate: now });
	}

	return { main, questions, paragraphs };
}
