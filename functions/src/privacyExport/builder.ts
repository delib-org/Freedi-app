/**
 * Privacy-preserving export builder (server-side).
 *
 * Reads all source data with the Admin SDK — every option, every user's raw
 * evaluations, and every user's demographic answers — then aggregates and
 * applies k-anonymity suppression BEFORE returning. The raw per-user data never
 * leaves the server; the client receives only the anonymized aggregate.
 *
 * This mirrors the client's `src/utils/privacyExportUtils.ts` aggregation so
 * both paths produce byte-compatible output, but sources options and
 * evaluations authoritatively from Firestore (not a partial Redux snapshot),
 * which is why the option list is always complete.
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementType,
	Evaluation,
	UserDemographicQuestion,
	UserDemographicQuestionType,
	resolveStakeholderCount,
	resolveViewCount,
} from '@freedi/shared-types';
import type { CounterProgress } from '@freedi/shared-types';
import { fetchEvaluationsForIds } from '../condensation/aggregation';
import { isMemberlessTheme } from '../synthesis/pipeline/hideEmptyThemes';
import {
	PRIVACY_CONFIG,
	filterEvaluationsForPrivacy,
	generatePrivacyNotice,
	generateSuppressionNote,
} from './kAnonymity';
import {
	STATS_NOTES,
	buildOptionSummaries,
	isDerivedStatement,
	mergedSourceIds,
} from './optionStats';
import { secureShuffle } from './shuffle';
import {
	PrivacyPreservingExportData,
	PrivacyExportMetadata,
	ParticipationSummary,
	DemographicResponseStats,
	OptionEvaluationSummary,
	OptionWithDemographics,
	DemographicBreakdown,
	AnonymizedEvaluation,
	ExportDemographicScope,
	ExportDemographicQuestionType,
} from './types';

/** Demographic answer document structure from Firestore (`usersData`). */
interface DemographicAnswer {
	userQuestionId: string;
	userId: string;
	answer?: string;
	answerOptions?: string[];
	statementId: string;
	topParentId?: string;
	scope?: 'group' | 'statement';
}

/** Load the parent statement; throws when it does not exist. */
async function loadParentStatement(statementId: string): Promise<Statement> {
	const db = getFirestore();
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	if (!snap.exists) {
		throw new Error(`Parent statement not found: ${statementId}`);
	}

	return snap.data() as Statement;
}

/** The question's top statement (N may be declared there); null when it is the question itself or missing. */
async function loadTopStatement(question: Statement): Promise<Statement | null> {
	const topId = question.topParentId;
	if (!topId || topId === question.statementId) return null;
	const snap = await getFirestore().collection(Collections.statements).doc(topId).get();

	return snap.exists ? (snap.data() as Statement) : null;
}

/**
 * Evaluations on merged-stats sources outside this question (a cluster can
 * absorb one from elsewhere). Votes under the question are already loaded.
 */
async function fetchOutsideSourceEvaluations(
	options: Statement[],
	loadedStatementIds: Set<string>,
): Promise<Evaluation[]> {
	const missing = [...mergedSourceIds(options)].filter((id) => !loadedStatementIds.has(id));

	return missing.length > 0 ? fetchEvaluationsForIds(missing) : [];
}

/** Fetch all evaluations for a parent statement. */
async function fetchEvaluations(parentId: string): Promise<Evaluation[]> {
	const db = getFirestore();
	const snap = await db.collection(Collections.evaluations).where('parentId', '==', parentId).get();

	return snap.docs.map((doc) => doc.data() as Evaluation);
}

/**
 * Fetch ALL option statements for a parent directly from Firestore. Keeps both
 * `option` and `synthesis` docs; pipeline-derived options are stored as
 * `option` but synthesis docs carry `statementType: synthesis`.
 */
async function fetchOptions(
	parentId: string,
): Promise<{ options: Statement[]; childIds: Set<string> }> {
	const db = getFirestore();
	const snap = await db.collection(Collections.statements).where('parentId', '==', parentId).get();
	const children = snap.docs.map((doc) => doc.data() as Statement);

	return {
		options: children.filter(
			(s) =>
				s.statementType === StatementType.option || s.statementType === StatementType.synthesis,
		),
		childIds: new Set(children.map((c) => c.statementId)),
	};
}

/** Fetch demographic questions for a statement (including group-level). */
async function fetchDemographicQuestions(
	statementId: string,
	topParentId: string | undefined,
): Promise<UserDemographicQuestion[]> {
	const db = getFirestore();
	const questionsRef = db.collection(Collections.userDemographicQuestions);

	const [statementSnapshot, groupSnapshot] = await Promise.all([
		questionsRef.where('statementId', '==', statementId).get(),
		topParentId
			? questionsRef.where('topParentId', '==', topParentId).where('scope', '==', 'group').get()
			: null,
	]);

	const statementQuestions = statementSnapshot.docs
		.map((doc) => doc.data() as UserDemographicQuestion)
		.filter((q) => q.scope !== 'group');

	const groupQuestions = groupSnapshot
		? groupSnapshot.docs.map((doc) => doc.data() as UserDemographicQuestion)
		: [];

	return [...groupQuestions, ...statementQuestions];
}

/** Fetch ALL demographic answers for the given question IDs (all users). */
async function fetchAllDemographicAnswers(questionIds: string[]): Promise<DemographicAnswer[]> {
	if (questionIds.length === 0) return [];

	const db = getFirestore();
	const answersRef = db.collection(Collections.usersData);
	const allAnswers: DemographicAnswer[] = [];

	// Firestore 'in' queries are limited to 30 items.
	const BATCH_SIZE = PRIVACY_CONFIG.IN_QUERY_BATCH_SIZE;
	for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
		const batch = questionIds.slice(i, i + BATCH_SIZE);
		const snapshot = await answersRef.where('userQuestionId', 'in', batch).get();
		snapshot.docs.forEach((doc) => {
			allAnswers.push(doc.data() as DemographicAnswer);
		});
	}

	return allAnswers;
}

function mapQuestionType(type: UserDemographicQuestionType): ExportDemographicQuestionType {
	switch (type) {
		case UserDemographicQuestionType.radio:
			return 'radio';
		case UserDemographicQuestionType.checkbox:
			return 'checkbox';
		default:
			return 'text';
	}
}

function buildDemographicStats(
	questions: UserDemographicQuestion[],
	answers: DemographicAnswer[],
): DemographicResponseStats[] {
	return questions
		.filter(
			(q) =>
				q.type === UserDemographicQuestionType.radio ||
				q.type === UserDemographicQuestionType.checkbox,
		)
		.map((question) => {
			const questionAnswers = answers.filter((a) => a.userQuestionId === question.userQuestionId);

			const optionCounts = new Map<string, Set<string>>();
			question.options?.forEach((opt) => {
				optionCounts.set(opt.option, new Set());
			});

			questionAnswers.forEach((ans) => {
				const answerValues = ans.answer ? [ans.answer] : (ans.answerOptions ?? []);
				answerValues.forEach((val) => {
					if (optionCounts.has(val)) {
						optionCounts.get(val)?.add(ans.userId);
					}
				});
			});

			const totalRespondents = new Set(questionAnswers.map((a) => a.userId)).size;

			return {
				questionId: question.userQuestionId ?? '',
				questionText: question.question,
				responses: Array.from(optionCounts.entries()).map(([option, users]) => ({
					optionValue: option,
					respondentCount: users.size,
					percentage: totalRespondents > 0 ? Math.round((users.size / totalRespondents) * 100) : 0,
				})),
				totalRespondents,
			};
		});
}

function buildDemographicBreakdowns(
	optionSummaries: OptionEvaluationSummary[],
	evaluations: Evaluation[],
	questions: UserDemographicQuestion[],
	answers: DemographicAnswer[],
	kThreshold: number,
): { breakdowns: OptionWithDemographics[]; suppressedCount: number } {
	let suppressedCount = 0;

	const userDemographics = new Map<string, Map<string, string[]>>();
	answers.forEach((ans) => {
		if (!userDemographics.has(ans.userId)) {
			userDemographics.set(ans.userId, new Map());
		}
		const answerValues = ans.answer ? [ans.answer] : (ans.answerOptions ?? []);
		userDemographics.get(ans.userId)?.set(ans.userQuestionId, answerValues);
	});

	const breakdowns: OptionWithDemographics[] = optionSummaries.map((optionSummary) => {
		const optionEvaluations = evaluations.filter(
			(e) => e.statementId === optionSummary.statementId,
		);
		const demographicBreakdowns: DemographicBreakdown[] = [];

		questions
			.filter(
				(q) =>
					q.type === UserDemographicQuestionType.radio ||
					q.type === UserDemographicQuestionType.checkbox,
			)
			.forEach((question) => {
				question.options?.forEach((opt) => {
					const matchingEvaluations: number[] = [];

					optionEvaluations.forEach((evaluation) => {
						const userAnswers = userDemographics.get(evaluation.evaluatorId);
						if (userAnswers) {
							const questionAnswers = userAnswers.get(question.userQuestionId ?? '');
							if (questionAnswers?.includes(opt.option)) {
								matchingEvaluations.push(evaluation.evaluation);
							}
						}
					});

					const privacyResult = filterEvaluationsForPrivacy(matchingEvaluations, kThreshold);

					if (!privacyResult.allowed && privacyResult.count > 0) {
						suppressedCount++;
					}

					demographicBreakdowns.push({
						questionId: question.userQuestionId ?? '',
						questionText: question.question,
						optionValue: opt.option,
						evaluatorCount: privacyResult.count,
						meetsKAnonymity: privacyResult.allowed,
						stats: privacyResult.stats
							? {
									averageEvaluation: privacyResult.stats.averageEvaluation,
									proCount: privacyResult.stats.proCount,
									conCount: privacyResult.stats.conCount,
									neutralCount: privacyResult.stats.neutralCount,
									sumEvaluations: privacyResult.stats.sumEvaluations,
								}
							: undefined,
						privacyNote:
							!privacyResult.allowed && privacyResult.count > 0
								? generateSuppressionNote(privacyResult.count, kThreshold)
								: undefined,
					});
				});
			});

		return {
			option: optionSummary,
			demographicBreakdowns,
		};
	});

	return { breakdowns, suppressedCount };
}

/**
 * Build participation funnel summary: entered → suggested → evaluated.
 * Mirrors the client's `buildParticipationSummary`.
 */
function buildParticipationSummary(
	parentStatement: Statement,
	options: Statement[],
	evaluations: Evaluation[],
	progress: CounterProgress,
): ParticipationSummary {
	const suggesters = new Set(
		options
			.filter((o) => !isDerivedStatement(o))
			.map((o) => o.creatorId || o.creator?.uid)
			.filter((id): id is string => !!id),
	);
	const evaluators = new Set(
		evaluations.map((e) => e.evaluator?.uid).filter((id): id is string => !!id),
	);
	const allEvaluators = new Set(evaluations.map((e) => e.evaluatorId).filter(Boolean));
	const totalParticipants = new Set([...suggesters, ...allEvaluators]).size;

	const recordedViews = resolveViewCount(progress, parentStatement);
	const enteredCount =
		recordedViews !== undefined ? Math.max(recordedViews, totalParticipants) : null;

	return {
		enteredCount,
		suggestedCount: suggesters.size,
		evaluatedCount: evaluators.size,
		totalParticipants,
	};
}

function buildAnonymizedEvaluations(
	evaluations: Evaluation[],
	options: Statement[],
): AnonymizedEvaluation[] {
	const optionMap = new Map(options.map((o) => [o.statementId, o.statement]));
	const rows = evaluations.map((evaluation) => ({
		statementId: evaluation.statementId,
		statementText: optionMap.get(evaluation.statementId) ?? 'Unknown',
		evaluationValue: evaluation.evaluation,
	}));

	// Evaluations arrive in doc-id order (`${uid}--${statementId}`), i.e. grouped
	// by person. Shuffled so no one's ballot can be re-linked from row order.
	return secureShuffle(rows);
}

export interface BuildPrivacyExportParams {
	statementId: string;
	kAnonymityThreshold?: number;
}

/**
 * Build the complete privacy-preserving export payload for one parent
 * statement. All reads use the Admin SDK, so the option list and evaluations
 * are always complete and mutually consistent.
 */
export async function buildPrivacyExport(
	params: BuildPrivacyExportParams,
): Promise<PrivacyPreservingExportData> {
	const { statementId } = params;
	const kThreshold = params.kAnonymityThreshold ?? PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD;

	const parentStatement = await loadParentStatement(statementId);

	const [evaluations, fetched, questions, topStatement] = await Promise.all([
		fetchEvaluations(statementId),
		fetchOptions(statementId),
		fetchDemographicQuestions(statementId, parentStatement.topParentId),
		loadTopStatement(parentStatement),
	]);

	// N once for the whole question; only `.count` is read.
	const stakeholderCount = resolveStakeholderCount(
		undefined,
		parentStatement,
		topStatement ?? undefined,
	).count;

	// Memberless themes are pipeline leftovers: never exported, hidden or not.
	const options = fetched.options.filter((o) => !isMemberlessTheme(o));
	const skippedEmptyThemes = fetched.options.length - options.length;
	const exportedIds = new Set(options.map((o) => o.statementId));
	const exportedEvaluations = evaluations.filter((e) => exportedIds.has(e.statementId));

	const outsideEvaluations = await fetchOutsideSourceEvaluations(options, fetched.childIds);

	const questionIds = questions.map((q) => q.userQuestionId).filter((id): id is string => !!id);

	const answers = await fetchAllDemographicAnswers(questionIds);

	const demographicStats = buildDemographicStats(questions, answers);
	const optionSummaries = buildOptionSummaries(
		options,
		[...evaluations, ...outsideEvaluations],
		stakeholderCount,
	);
	const { breakdowns, suppressedCount } = buildDemographicBreakdowns(
		optionSummaries,
		exportedEvaluations,
		questions,
		answers,
		kThreshold,
	);
	const anonymizedEvaluations = buildAnonymizedEvaluations(exportedEvaluations, options);
	// Participation counts people, so every vote cast under the question counts.
	const progressDoc = await getFirestore()
		.collection(Collections.questionProgress)
		.doc(statementId)
		.get();
	const participation = buildParticipationSummary(
		parentStatement,
		options,
		evaluations,
		progressDoc.data() as CounterProgress,
	);

	const uniqueEvaluators = participation.evaluatedCount;
	const uniqueRespondents = new Set(answers.map((a) => a.userId)).size;

	const metadata: PrivacyExportMetadata = {
		exportedAt: new Date().toISOString(),
		exportFormat: 'json',
		appVersion: '1.0.0',
		totalRecords: options.length,
		kAnonymityThreshold: kThreshold,
		suppressedGroupCount: suppressedCount,
		totalEvaluators: uniqueEvaluators,
		totalDemographicRespondents: uniqueRespondents,
		skippedEmptyThemes,
		...(stakeholderCount !== undefined ? { stakeholderCount } : {}),
		fpcApplied: stakeholderCount !== undefined,
	};

	return {
		metadata,
		parentStatement: {
			statementId: parentStatement.statementId,
			statementText: parentStatement.statement,
			description: parentStatement.paragraphs?.[0]?.content,
		},
		participation,
		demographicQuestions: questions
			.filter(
				(q) =>
					q.type === UserDemographicQuestionType.radio ||
					q.type === UserDemographicQuestionType.checkbox,
			)
			.map((q) => ({
				questionId: q.userQuestionId ?? '',
				questionText: q.question,
				questionType: mapQuestionType(q.type),
				options: q.options?.map((o) => o.option) ?? [],
				scope: (q.scope ?? 'statement') as ExportDemographicScope,
			})),
		demographicStats,
		optionEvaluations: optionSummaries,
		demographicBreakdowns: breakdowns,
		anonymizedEvaluations,
		privacyNotice: generatePrivacyNotice(kThreshold, suppressedCount),
		statsNotes: STATS_NOTES,
	};
}
