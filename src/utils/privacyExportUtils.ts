/**
 * Privacy-Preserving Export Utilities
 *
 * Functions for exporting evaluation data with demographic breakdowns
 * while maintaining k-anonymity for user privacy.
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import {
	Statement,
	Collections,
	Evaluation,
	UserDemographicQuestion,
	UserDemographicQuestionType,
	StatementType,
} from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { downloadFile } from '@/utils/exportUtils';
import {
	PRIVACY_CONFIG,
	calculateEvaluationStats,
	filterEvaluationsForPrivacy,
	generatePrivacyNotice,
	generateSuppressionNote,
} from '@/utils/privacyUtils';
import {
	PrivacyPreservingExportData,
	PrivacyExportMetadata,
	DemographicResponseStats,
	OptionEvaluationSummary,
	OptionWithDemographics,
	DemographicBreakdown,
	AnonymizedEvaluation,
	ExportDemographicScope,
	ExportDemographicQuestionType,
} from '@/types/privacyExport';
import { ExportFormat } from '@/types/export';

/**
 * Demographic answer document structure from Firestore
 */
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
 * Fetch all evaluations for a parent statement
 */
async function fetchEvaluations(parentId: string): Promise<Evaluation[]> {
	const evaluationsRef = collection(FireStore, Collections.evaluations);
	const q = query(evaluationsRef, where('parentId', '==', parentId));
	const snapshot = await getDocs(q);

	return snapshot.docs.map((doc) => doc.data() as Evaluation);
}

/**
 * Fetch demographic questions for a statement (including group-level)
 */
async function fetchDemographicQuestions(
	statementId: string,
	topParentId: string
): Promise<UserDemographicQuestion[]> {
	const questionsRef = collection(
		FireStore,
		Collections.userDemographicQuestions
	);

	// Fetch both statement-level and group-level questions in parallel
	const [statementSnapshot, groupSnapshot] = await Promise.all([
		getDocs(query(questionsRef, where('statementId', '==', statementId))),
		getDocs(
			query(
				questionsRef,
				where('topParentId', '==', topParentId),
				where('scope', '==', 'group')
			)
		),
	]);

	const statementQuestions = statementSnapshot.docs
		.map((doc) => doc.data() as UserDemographicQuestion)
		.filter((q) => q.scope !== 'group');

	const groupQuestions = groupSnapshot.docs.map(
		(doc) => doc.data() as UserDemographicQuestion
	);

	return [...groupQuestions, ...statementQuestions];
}

/**
 * Fetch ALL demographic answers for given question IDs
 * This fetches answers from all users, not just the current user
 */
async function fetchAllDemographicAnswers(
	questionIds: string[]
): Promise<DemographicAnswer[]> {
	if (questionIds.length === 0) return [];

	const answersRef = collection(FireStore, Collections.usersData);
	const allAnswers: DemographicAnswer[] = [];

	// Firestore 'in' queries are limited to 30 items
	const BATCH_SIZE = PRIVACY_CONFIG.IN_QUERY_BATCH_SIZE;
	for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
		const batch = questionIds.slice(i, i + BATCH_SIZE);
		const q = query(answersRef, where('userQuestionId', 'in', batch));
		const snapshot = await getDocs(q);

		snapshot.docs.forEach((doc) => {
			allAnswers.push(doc.data() as DemographicAnswer);
		});
	}

	return allAnswers;
}

/**
 * Convert question type to export type
 */
function mapQuestionType(
	type: UserDemographicQuestionType
): ExportDemographicQuestionType {
	switch (type) {
		case UserDemographicQuestionType.radio:
			return 'radio';
		case UserDemographicQuestionType.checkbox:
			return 'checkbox';
		default:
			return 'text';
	}
}

/**
 * Build demographic response statistics
 */
function buildDemographicStats(
	questions: UserDemographicQuestion[],
	answers: DemographicAnswer[]
): DemographicResponseStats[] {
	return questions
		.filter(
			(q) =>
				q.type === UserDemographicQuestionType.radio ||
				q.type === UserDemographicQuestionType.checkbox
		)
		.map((question) => {
			const questionAnswers = answers.filter(
				(a) => a.userQuestionId === question.userQuestionId
			);

			// Count unique users per option
			const optionCounts = new Map<string, Set<string>>();
			question.options?.forEach((opt) => {
				optionCounts.set(opt.option, new Set());
			});

			questionAnswers.forEach((ans) => {
				const answerValues = ans.answer
					? [ans.answer]
					: ans.answerOptions ?? [];

				answerValues.forEach((val) => {
					if (optionCounts.has(val)) {
						optionCounts.get(val)?.add(ans.userId);
					}
				});
			});

			const totalRespondents = new Set(
				questionAnswers.map((a) => a.userId)
			).size;

			return {
				questionId: question.userQuestionId ?? '',
				questionText: question.question,
				responses: Array.from(optionCounts.entries()).map(
					([option, users]) => ({
						optionValue: option,
						respondentCount: users.size,
						percentage:
							totalRespondents > 0
								? Math.round((users.size / totalRespondents) * 100)
								: 0,
					})
				),
				totalRespondents,
			};
		});
}

/**
 * Build option evaluation summaries
 */
function buildOptionSummaries(
	options: Statement[],
	evaluations: Evaluation[]
): OptionEvaluationSummary[] {
	return options.map((option) => {
		const optionEvaluations = evaluations.filter(
			(e) => e.statementId === option.statementId
		);

		const stats = calculateEvaluationStats(
			optionEvaluations.map((e) => e.evaluation)
		);

		return {
			statementId: option.statementId,
			statementText: option.statement,
			totalEvaluators: stats.evaluatorCount,
			averageEvaluation: stats.averageEvaluation,
			proCount: stats.proCount,
			conCount: stats.conCount,
			neutralCount: stats.neutralCount,
			sumEvaluations: stats.sumEvaluations,
		};
	});
}

/**
 * Build demographic breakdowns for each option with k-anonymity filtering
 */
function buildDemographicBreakdowns(
	options: Statement[],
	evaluations: Evaluation[],
	questions: UserDemographicQuestion[],
	answers: DemographicAnswer[],
	kThreshold: number
): { breakdowns: OptionWithDemographics[]; suppressedCount: number } {
	let suppressedCount = 0;

	// Build userId -> demographic answers map
	const userDemographics = new Map<string, Map<string, string[]>>();
	answers.forEach((ans) => {
		if (!userDemographics.has(ans.userId)) {
			userDemographics.set(ans.userId, new Map());
		}
		const answerValues = ans.answer
			? [ans.answer]
			: ans.answerOptions ?? [];
		userDemographics.get(ans.userId)?.set(ans.userQuestionId, answerValues);
	});

	const breakdowns: OptionWithDemographics[] = options.map((option) => {
		const optionEvaluations = evaluations.filter(
			(e) => e.statementId === option.statementId
		);

		const optionSummary = buildOptionSummaries(
			[option],
			optionEvaluations
		)[0];

		const demographicBreakdowns: DemographicBreakdown[] = [];

		// For each demographic question
		questions
			.filter(
				(q) =>
					q.type === UserDemographicQuestionType.radio ||
					q.type === UserDemographicQuestionType.checkbox
			)
			.forEach((question) => {
				// For each option value
				question.options?.forEach((opt) => {
					// Find evaluators who selected this demographic option
					const matchingEvaluations: number[] = [];

					optionEvaluations.forEach((evaluation) => {
						const userAnswers = userDemographics.get(
							evaluation.evaluatorId
						);
						if (userAnswers) {
							const questionAnswers = userAnswers.get(
								question.userQuestionId ?? ''
							);
							if (questionAnswers?.includes(opt.option)) {
								matchingEvaluations.push(evaluation.evaluation);
							}
						}
					});

					const privacyResult = filterEvaluationsForPrivacy(
						matchingEvaluations,
						kThreshold
					);

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
									averageEvaluation:
										privacyResult.stats.averageEvaluation,
									proCount: privacyResult.stats.proCount,
									conCount: privacyResult.stats.conCount,
									neutralCount: privacyResult.stats.neutralCount,
									sumEvaluations:
										privacyResult.stats.sumEvaluations,
								}
							: undefined,
						privacyNote:
							!privacyResult.allowed && privacyResult.count > 0
								? generateSuppressionNote(
										privacyResult.count,
										kThreshold
									)
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
 * Build anonymized evaluations (individual evaluations without user identity)
 */
function buildAnonymizedEvaluations(
	evaluations: Evaluation[],
	options: Statement[]
): AnonymizedEvaluation[] {
	const optionMap = new Map(
		options.map((o) => [o.statementId, o.statement])
	);

	return evaluations.map((evaluation) => ({
		statementId: evaluation.statementId,
		statementText: optionMap.get(evaluation.statementId) ?? 'Unknown',
		evaluationValue: evaluation.evaluation,
	}));
}

/**
 * Main export function - creates privacy-preserving export data
 */
export async function createPrivacyPreservingExport(
	parentStatement: Statement,
	options: Statement[],
	kAnonymityThreshold?: number
): Promise<PrivacyPreservingExportData> {
	const kThreshold =
		kAnonymityThreshold ?? PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD;

	try {
		// Fetch all required data
		const [evaluations, questions] = await Promise.all([
			fetchEvaluations(parentStatement.statementId),
			fetchDemographicQuestions(
				parentStatement.statementId,
				parentStatement.topParentId
			),
		]);

		const questionIds = questions
			.map((q) => q.userQuestionId)
			.filter((id): id is string => !!id);

		const answers = await fetchAllDemographicAnswers(questionIds);

		// Build export components
		const demographicStats = buildDemographicStats(questions, answers);
		const optionSummaries = buildOptionSummaries(options, evaluations);
		const { breakdowns, suppressedCount } = buildDemographicBreakdowns(
			options,
			evaluations,
			questions,
			answers,
			kThreshold
		);

		// Build anonymized evaluations
		const anonymizedEvaluations = buildAnonymizedEvaluations(
			evaluations,
			options
		);

		// Count unique evaluators and respondents
		const uniqueEvaluators = new Set(
			evaluations.map((e) => e.evaluatorId)
		).size;
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

		const exportData: PrivacyPreservingExportData = {
			metadata,
			parentStatement: {
				statementId: parentStatement.statementId,
				statementText: parentStatement.statement,
				description: parentStatement.paragraphs?.[0]?.content,
			},
			demographicQuestions: questions
				.filter(
					(q) =>
						q.type === UserDemographicQuestionType.radio ||
						q.type === UserDemographicQuestionType.checkbox
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

		return exportData;
	} catch (error) {
		logError(error, {
			operation: 'privacyExportUtils.createPrivacyPreservingExport',
			statementId: parentStatement.statementId,
		});
		throw error;
	}
}

/**
 * Escape CSV value - handles commas, quotes, and newlines
 */
function escapeCSV(value: string | number | undefined | null): string {
	if (value === null || value === undefined) {
		return '';
	}

	const stringValue = String(value);

	if (
		stringValue.includes(',') ||
		stringValue.includes('"') ||
		stringValue.includes('\n')
	) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}

	return stringValue;
}

/**
 * Convert export data to CSV format
 */
export function convertToCSV(data: PrivacyPreservingExportData): string {
	const lines: string[] = [];

	// Header comments
	lines.push('# FREEDI PRIVACY-PRESERVING USER DATA EXPORT');
	lines.push(`# Exported: ${data.metadata.exportedAt}`);
	lines.push(`# k-Anonymity Threshold: ${data.metadata.kAnonymityThreshold}`);
	lines.push(`# Total Evaluators: ${data.metadata.totalEvaluators}`);
	lines.push(
		`# Total Demographic Respondents: ${data.metadata.totalDemographicRespondents}`
	);
	lines.push(`# Suppressed Groups: ${data.metadata.suppressedGroupCount}`);
	lines.push('#');
	lines.push(`# ${data.privacyNotice}`);
	lines.push('#');
	lines.push('');

	// Section 1: Parent Statement Info
	lines.push('# === PARENT STATEMENT ===');
	lines.push(`# ID: ${data.parentStatement.statementId}`);
	lines.push(`# Text: ${data.parentStatement.statementText}`);
	if (data.parentStatement.description) {
		lines.push(`# Description: ${data.parentStatement.description}`);
	}
	lines.push('');

	// Section 2: Option Evaluation Summary
	lines.push('# === OPTION EVALUATION SUMMARY ===');
	lines.push(
		'Option ID,Option Text,Total Evaluators,Average Evaluation,Pro Count,Con Count,Neutral Count,Sum Evaluations'
	);

	data.optionEvaluations.forEach((opt) => {
		lines.push(
			[
				escapeCSV(opt.statementId),
				escapeCSV(opt.statementText),
				opt.totalEvaluators,
				opt.averageEvaluation.toFixed(3),
				opt.proCount,
				opt.conCount,
				opt.neutralCount,
				opt.sumEvaluations.toFixed(3),
			].join(',')
		);
	});

	lines.push('');

	// Section 3: Demographic Question Stats
	if (data.demographicStats.length > 0) {
		lines.push('# === DEMOGRAPHIC QUESTION STATISTICS ===');
		lines.push(
			'Question ID,Question Text,Option Value,Respondent Count,Percentage'
		);

		data.demographicStats.forEach((stat) => {
			stat.responses.forEach((resp) => {
				lines.push(
					[
						escapeCSV(stat.questionId),
						escapeCSV(stat.questionText),
						escapeCSV(resp.optionValue),
						resp.respondentCount,
						`${resp.percentage}%`,
					].join(',')
				);
			});
		});

		lines.push('');
	}

	// Section 4: Demographic Breakdowns
	if (data.demographicBreakdowns.length > 0) {
		lines.push('# === DEMOGRAPHIC BREAKDOWNS BY OPTION ===');
		lines.push(
			'Option Text,Demographic Question,Demographic Value,Evaluator Count,Meets K-Anonymity,Average Evaluation,Pro,Con,Neutral,Privacy Note'
		);

		data.demographicBreakdowns.forEach((optBreakdown) => {
			optBreakdown.demographicBreakdowns.forEach((demo) => {
				lines.push(
					[
						escapeCSV(optBreakdown.option.statementText),
						escapeCSV(demo.questionText),
						escapeCSV(demo.optionValue),
						demo.evaluatorCount,
						demo.meetsKAnonymity ? 'Yes' : 'No',
						demo.stats ? demo.stats.averageEvaluation.toFixed(3) : '',
						demo.stats?.proCount ?? '',
						demo.stats?.conCount ?? '',
						demo.stats?.neutralCount ?? '',
						escapeCSV(demo.privacyNote ?? ''),
					].join(',')
				);
			});
		});

		lines.push('');
	}

	// Section 5: Anonymized Evaluations
	if (
		data.anonymizedEvaluations &&
		data.anonymizedEvaluations.length > 0
	) {
		lines.push('# === ANONYMIZED INDIVIDUAL EVALUATIONS ===');
		lines.push('Statement ID,Statement Text,Evaluation Value');

		data.anonymizedEvaluations.forEach((evaluation) => {
			lines.push(
				[
					escapeCSV(evaluation.statementId),
					escapeCSV(evaluation.statementText),
					evaluation.evaluationValue.toFixed(3),
				].join(',')
			);
		});
	}

	return lines.join('\n');
}

/**
 * Export privacy-preserving data in specified format
 */
export async function exportPrivacyPreservingData(
	parentStatement: Statement,
	options: Statement[],
	format: ExportFormat,
	kAnonymityThreshold?: number
): Promise<void> {
	try {
		// Filter to only include options
		const filteredOptions = options.filter(
			(s) => s.statementType === StatementType.option
		);

		const data = await createPrivacyPreservingExport(
			parentStatement,
			filteredOptions,
			kAnonymityThreshold
		);

		const timestamp = new Date().toISOString().split('T')[0];
		const safeTitle = parentStatement.statement
			.slice(0, 30)
			.replace(/[^a-zA-Z0-9]/g, '_');

		if (format === 'json') {
			const content = JSON.stringify(data, null, 2);
			downloadFile(
				content,
				`freedi_user_data_export_${safeTitle}_${timestamp}.json`,
				'application/json'
			);
		} else {
			const content = convertToCSV(data);
			downloadFile(
				content,
				`freedi_user_data_export_${safeTitle}_${timestamp}.csv`,
				'text/csv'
			);
		}
	} catch (error) {
		logError(error, {
			operation: 'privacyExportUtils.exportPrivacyPreservingData',
			statementId: parentStatement.statementId,
			metadata: { format },
		});
		throw error;
	}
}
