import {
	QuestionStep,
	Role,
	Statement,
	StatementSubscription,
	StatementType,
} from '@freedi/shared-types';

/** Tint cycle for spaces — the same order the prototype uses. */
export const SPACE_TONES = ['lilac', 'mint', 'yellow'] as const;
export type SpaceTone = (typeof SPACE_TONES)[number];
export type HomeTone = SpaceTone | 'sunken';

export type QuestionStage = 'collecting' | 'rating' | 'voting' | 'decided';

/** i18n key per stage (Hebrew: אוספים · מדרגים · מצביעים · הוחלט). */
export const STAGE_LABEL_KEY: Record<QuestionStage, string> = {
	collecting: 'Collecting',
	rating: 'Rating',
	voting: 'Voting stage',
	decided: 'Decided',
};

export type Translate = (key: string) => string;

export interface HomeSpace {
	id: string;
	title: string;
	tone: SpaceTone;
	questionCount: number;
	openCount: number;
	hosting: boolean;
}

export interface HomeQuestion {
	id: string;
	title: string;
	spaceId?: string;
	spaceTitle?: string;
	tone: HomeTone;
	stage?: QuestionStage;
	deadline?: number;
	hosting: boolean;
}

export interface HomeModel {
	spaces: HomeSpace[];
	questions: HomeQuestion[];
}

export function toneForIndex(index: number): SpaceTone {
	return SPACE_TONES[((index % SPACE_TONES.length) + SPACE_TONES.length) % SPACE_TONES.length];
}

/** Maps the question's current step onto the four stages people see. */
export function stageForStep(step: QuestionStep | undefined): QuestionStage | undefined {
	switch (step) {
		case QuestionStep.explanation:
		case QuestionStep.suggestion:
			return 'collecting';
		case QuestionStep.randomEvaluation:
		case QuestionStep.topEvaluation:
			return 'rating';
		case QuestionStep.voting:
			return 'voting';
		case QuestionStep.finished:
			return 'decided';
		default:
			return undefined;
	}
}

/**
 * "3 שאלות · 2 פתוחות" with real number agreement: singular forms have their
 * own keys ("שאלה אחת", "פתוחה אחת"), never "1 שאלות".
 */
export function formatSpaceMeta(questionCount: number, openCount: number, t: Translate): string {
	if (questionCount <= 0) return t('No questions yet');

	const questions =
		questionCount === 1
			? t('One question')
			: t('{n} questions').replace('{n}', String(questionCount));
	const open =
		openCount <= 0
			? t('All decided')
			: openCount === 1
				? t('One open')
				: t('{n} open').replace('{n}', String(openCount));

	return `${questions} · ${open}`;
}

/** "נסגר 12 בספט׳" for a future deadline, "נסגר" once it passed, nothing without one. */
export function formatClosing(
	deadline: number | undefined,
	now: number,
	locale: string,
	t: Translate,
): string | undefined {
	if (!deadline) return undefined;
	if (deadline <= now) return t('Closed');
	let date: string;
	try {
		date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(deadline);
	} catch {
		date = new Date(deadline).toLocaleDateString();
	}

	return t('Closes {date}').replace('{date}', date);
}

/** "{space} · {stage} · {closing}" — empty parts are left out. */
export function formatQuestionMeta(
	question: HomeQuestion,
	now: number,
	locale: string,
	t: Translate,
): string {
	return [
		question.spaceTitle,
		question.stage ? t(STAGE_LABEL_KEY[question.stage]) : undefined,
		formatClosing(question.deadline, now, locale, t),
	]
		.filter(Boolean)
		.join(' · ');
}

const HIDDEN_TYPES: readonly StatementType[] = [
	StatementType.document,
	StatementType.paragraph,
	StatementType.option,
];

function isHost(sub: StatementSubscription, statement: Statement, userId?: string): boolean {
	return (
		sub.role === Role.admin ||
		sub.role === Role.creator ||
		(!!userId && statement.creatorId === userId)
	);
}

interface BuildHomeModelArgs {
	subscriptions: StatementSubscription[];
	statements: Statement[];
	userId?: string;
}

/**
 * Spaces are the person's top-level groups; the question list is every
 * subscribed question plus top-level conversations that are not groups, so
 * nothing the old home listed disappears. Keeps the subscriptions' order
 * (latest activity first).
 */
export function buildHomeModel({
	subscriptions,
	statements,
	userId,
}: BuildHomeModelArgs): HomeModel {
	const byId = new Map(statements.map((statement) => [statement.statementId, statement]));
	const mine = subscriptions.filter((sub) => sub.userId === userId && !sub.isDocument);
	const typeOf = (sub: StatementSubscription, statement: Statement): StatementType =>
		statement.statementType || sub.statementType;

	const spaceEntries = mine
		.map((sub) => ({ sub, statement: byId.get(sub.statementId) || sub.statement }))
		.filter(
			({ sub, statement }) =>
				(sub.parentId || statement.parentId) === 'top' &&
				typeOf(sub, statement) === StatementType.group,
		);
	const seenSpaces = new Set<string>();
	const spaceBase = spaceEntries
		.filter(({ sub }) => {
			if (seenSpaces.has(sub.statementId)) return false;
			seenSpaces.add(sub.statementId);

			return true;
		})
		.map(({ sub, statement }, index) => ({
			id: sub.statementId,
			title: statement.statement,
			tone: toneForIndex(index),
			hosting: isHost(sub, statement, userId),
		}));
	const spaceById = new Map(spaceBase.map((space) => [space.id, space]));
	const spaceOf = (statement: Statement): string | undefined =>
		[statement.topParentId, statement.parentId].find((id) => !!id && spaceById.has(id));

	const seenQuestions = new Set<string>();
	const questions: HomeQuestion[] = [];
	for (const sub of mine) {
		const statement = byId.get(sub.statementId) || sub.statement;
		const type = typeOf(sub, statement);
		const isTopLevel = (sub.parentId || statement.parentId) === 'top';
		const listed =
			type === StatementType.question ||
			(isTopLevel && type !== StatementType.group && !HIDDEN_TYPES.includes(type));
		if (!listed || seenQuestions.has(sub.statementId)) continue;
		seenQuestions.add(sub.statementId);
		const spaceId = spaceOf(statement);
		const space = spaceId ? spaceById.get(spaceId) : undefined;
		questions.push({
			id: sub.statementId,
			title: statement.statement,
			spaceId,
			spaceTitle: space?.title,
			tone: space?.tone ?? 'sunken',
			stage: stageForStep(statement.questionSettings?.currentStep),
			deadline: statement.questionSettings?.deadline,
			hosting: isHost(sub, statement, userId),
		});
	}

	// Counts also see questions already in the store that the person has not
	// subscribed to, so a space does not read "no questions" before a visit.
	const stagesBySpace = new Map<string, Map<string, QuestionStage | undefined>>();
	const record = (spaceId: string | undefined, id: string, stage: QuestionStage | undefined) => {
		if (!spaceId) return;
		const entry = stagesBySpace.get(spaceId) ?? new Map<string, QuestionStage | undefined>();
		entry.set(id, stage);
		stagesBySpace.set(spaceId, entry);
	};
	questions.forEach((question) => record(question.spaceId, question.id, question.stage));
	statements
		.filter((statement) => statement.statementType === StatementType.question)
		.forEach((statement) =>
			record(
				spaceOf(statement),
				statement.statementId,
				stageForStep(statement.questionSettings?.currentStep),
			),
		);

	const spaces: HomeSpace[] = spaceBase.map((space) => {
		const stages = [...(stagesBySpace.get(space.id)?.values() ?? [])];

		return {
			...space,
			questionCount: stages.length,
			openCount: stages.filter((stage) => stage !== 'decided').length,
		};
	});

	return { spaces, questions };
}

const normalise = (value: string): string => value.trim().toLocaleLowerCase();

export interface QuestionFilter {
	term?: string;
	spaceId?: string | null;
	hostOnly?: boolean;
}

export function filterHomeQuestions(
	questions: HomeQuestion[],
	{ term = '', spaceId, hostOnly }: QuestionFilter,
): HomeQuestion[] {
	const needle = normalise(term);

	return questions.filter(
		(question) =>
			(!spaceId || question.spaceId === spaceId) &&
			(!hostOnly || question.hosting) &&
			(!needle ||
				normalise(question.title).includes(needle) ||
				normalise(question.spaceTitle ?? '').includes(needle)),
	);
}

export function filterHomeSpaces(spaces: HomeSpace[], term = ''): HomeSpace[] {
	const needle = normalise(term);

	return needle ? spaces.filter((space) => normalise(space.title).includes(needle)) : spaces;
}
