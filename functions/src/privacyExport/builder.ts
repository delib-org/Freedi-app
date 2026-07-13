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
} from '@freedi/shared-types';
import {
	PRIVACY_CONFIG,
	calculateEvaluationStats,
	filterEvaluationsForPrivacy,
	generatePrivacyNotice,
	generateSuppressionNote,
} from './kAnonymity';
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
	DerivedPipeline,
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

/**
 * Back-compat provenance markers written by the synthesis pipeline via an
 * untyped cast, so they are absent from the Statement schema.
 */
interface LegacyDerivedFields {
	isSynthesis?: boolean;
	liveSynthOrigin?: string;
}

/**
 * Pipeline-derived statement detection. Mirrors `isDerivedStatement` in
 * `src/utils/derivedStatement.ts` so participation counts label the same set.
 */
function isDerivedStatement(statement: Statement): boolean {
	const legacy = statement as Statement & LegacyDerivedFields;

	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		!!legacy.liveSynthOrigin ||
		statement.statementType === StatementType.synthesis
	);
}

/** Mirrors `resolveDerivedPipeline` in `src/utils/derivedStatement.ts`. */
function resolveDerivedPipeline(statement: Statement): DerivedPipeline {
	if (statement.derivedByPipeline) return statement.derivedByPipeline as DerivedPipeline;
	if (statement.statementType === StatementType.synthesis) return 'synthesis';

	const legacy = statement as Statement & LegacyDerivedFields;
	if (typeof legacy.isSynthesis === 'boolean') {
		return legacy.isSynthesis ? 'synthesis' : 'topic-cluster';
	}

	return 'unknown-cluster';
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
async function fetchOptions(parentId: string): Promise<Statement[]> {
	const db = getFirestore();
	const snap = await db.collection(Collections.statements).where('parentId', '==', parentId).get();

	return snap.docs
		.map((doc) => doc.data() as Statement)
		.filter(
			(s) =>
				s.statementType === StatementType.option || s.statementType === StatementType.synthesis,
		);
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

function buildOptionSummaries(
	options: Statement[],
	evaluations: Evaluation[],
): OptionEvaluationSummary[] {
	return options.map((option) => {
		const optionEvaluations = evaluations.filter((e) => e.statementId === option.statementId);
		const stats = calculateEvaluationStats(optionEvaluations.map((e) => e.evaluation));
		const derived = isDerivedStatement(option);

		return {
			statementId: option.statementId,
			statementText: option.statement,
			totalEvaluators: stats.evaluatorCount,
			averageEvaluation: stats.averageEvaluation,
			proCount: stats.proCount,
			conCount: stats.conCount,
			neutralCount: stats.neutralCount,
			sumEvaluations: stats.sumEvaluations,
			isDerived: derived,
			isCluster: option.isCluster,
			derivedByPipeline: derived ? resolveDerivedPipeline(option) : undefined,
			integratedOptions: derived ? option.integratedOptions : undefined,
		};
	});
}

function buildDemographicBreakdowns(
	options: Statement[],
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

	const breakdowns: OptionWithDemographics[] = options.map((option) => {
		const optionEvaluations = evaluations.filter((e) => e.statementId === option.statementId);
		const optionSummary = buildOptionSummaries([option], optionEvaluations)[0];
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

	const recordedViews = parentStatement.viewed?.individualViews;
	const enteredCount =
		typeof recordedViews === 'number' && recordedViews > 0
			? Math.max(recordedViews, totalParticipants)
			: null;

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

	return evaluations.map((evaluation) => ({
		statementId: evaluation.statementId,
		statementText: optionMap.get(evaluation.statementId) ?? 'Unknown',
		evaluationValue: evaluation.evaluation,
	}));
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

	const [evaluations, options, questions] = await Promise.all([
		fetchEvaluations(statementId),
		fetchOptions(statementId),
		fetchDemographicQuestions(statementId, parentStatement.topParentId),
	]);

	const questionIds = questions.map((q) => q.userQuestionId).filter((id): id is string => !!id);

	const answers = await fetchAllDemographicAnswers(questionIds);

	const demographicStats = buildDemographicStats(questions, answers);
	const optionSummaries = buildOptionSummaries(options, evaluations);
	const { breakdowns, suppressedCount } = buildDemographicBreakdowns(
		options,
		evaluations,
		questions,
		answers,
		kThreshold,
	);
	const anonymizedEvaluations = buildAnonymizedEvaluations(evaluations, options);
	const participation = buildParticipationSummary(parentStatement, options, evaluations);

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
	};
}
