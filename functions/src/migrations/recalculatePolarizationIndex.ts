/**
 * Migration script to recalculate polarization index for statements
 * This connects existing evaluations with user demographics and rebuilds the polarization index
 */

import { db } from '..';
import { logger } from 'firebase-functions/v1';
import {
	Statement,
	Evaluation,
	UserDemographicQuestion,
	Collections,
	AxesItem,
	PolarizationIndex,
} from '@freedi/shared-types';
import { getRandomColor } from '../helpers';

// Use string literal for scope
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;
const DEMOGRAPHIC_SCOPE_STATEMENT = 'statement' as const;

interface UserDemographicEvaluation {
	userId: string;
	statementId: string;
	parentId: string;
	evaluation: number;
	demographic: Array<{
		question: string;
		answer: string;
		userQuestionId: string;
	}>;
}

/**
 * Get all ancestor statement IDs by traversing up the parent chain
 */
async function getAncestorStatementIds(statementId: string): Promise<string[]> {
	const ancestors: string[] = [];
	let currentId = statementId;
	const maxDepth = 10;
	let depth = 0;

	while (currentId && currentId !== 'top' && depth < maxDepth) {
		const statementDoc = await db.collection(Collections.statements).doc(currentId).get();
		if (!statementDoc.exists) break;

		const parentId = statementDoc.data()?.parentId;
		if (!parentId || parentId === 'top') break;

		ancestors.push(parentId);
		currentId = parentId;
		depth++;
	}

	return ancestors;
}

/**
 * Fetch user's demographic data from the usersData collection
 */
async function fetchUserDemographicData(
	userId: string,
	topParentId: string,
	ancestorIds: string[]
): Promise<UserDemographicQuestion[]> {
	const answerMap = new Map<string, UserDemographicQuestion>();

	// 1. Fetch group-level answers (scope = 'group')
	if (topParentId) {
		const groupSnapshot = await db
			.collection(Collections.usersData)
			.where('userId', '==', userId)
			.where('topParentId', '==', topParentId)
			.where('scope', '==', DEMOGRAPHIC_SCOPE_GROUP)
			.get();

		if (!groupSnapshot.empty) {
			groupSnapshot.docs.forEach((doc) => {
				const data = doc.data() as UserDemographicQuestion;
				if (data.userQuestionId) {
					answerMap.set(data.userQuestionId, data);
				}
			});
		}
	}

	// 2. Fetch statement-level answers across all ancestors
	for (const ancestorId of ancestorIds) {
		const statementSnapshot = await db
			.collection(Collections.usersData)
			.where('userId', '==', userId)
			.where('statementId', '==', ancestorId)
			.get();

		if (!statementSnapshot.empty) {
			statementSnapshot.docs.forEach((doc) => {
				const data = doc.data() as UserDemographicQuestion;
				if (data.userQuestionId && !answerMap.has(data.userQuestionId)) {
					answerMap.set(data.userQuestionId, data);
				}
			});
		}
	}

	return Array.from(answerMap.values());
}

/**
 * Get demographic questions defined at the group or statement level
 */
async function getDemographicQuestions(
	topParentId: string,
	ancestorIds: string[]
): Promise<UserDemographicQuestion[]> {
	const questionsMap = new Map<string, UserDemographicQuestion>();

	// Get group-level questions
	if (topParentId) {
		const groupQuestions = await db
			.collection(Collections.userDemographicQuestions)
			.where('topParentId', '==', topParentId)
			.where('scope', '==', DEMOGRAPHIC_SCOPE_GROUP)
			.get();

		groupQuestions.docs.forEach((doc) => {
			const q = doc.data() as UserDemographicQuestion;
			if (q.userQuestionId) {
				questionsMap.set(q.userQuestionId, q);
			}
		});
	}

	// Get statement-level questions from ancestors
	for (const ancestorId of ancestorIds) {
		const statementQuestions = await db
			.collection(Collections.userDemographicQuestions)
			.where('statementId', '==', ancestorId)
			.where('scope', '==', DEMOGRAPHIC_SCOPE_STATEMENT)
			.get();

		statementQuestions.docs.forEach((doc) => {
			const q = doc.data() as UserDemographicQuestion;
			if (q.userQuestionId && !questionsMap.has(q.userQuestionId)) {
				questionsMap.set(q.userQuestionId, q);
			}
		});
	}

	return Array.from(questionsMap.values());
}

function calcMadAndMean(values: number[]): { mad: number; mean: number; n: number } {
	if (values.length === 0) return { mad: 0, mean: 0, n: 0 };
	if (values.length === 1) return { mad: 0, mean: values[0], n: 1 };

	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

	return { mad, mean, n: values.length };
}

function buildDemographicSummary(demographicData: UserDemographicQuestion[]) {
	return demographicData
		.filter((item) => item.answer && item.userQuestionId)
		.map((item) => ({
			question: item.question,
			answer: item.answer!,
			userQuestionId: item.userQuestionId!,
		}));
}

/**
 * Recalculate polarization index for a single statement
 */
export async function recalculatePolarizationIndexForStatement(
	statementId: string
): Promise<{ success: boolean; message: string }> {
	try {
		logger.info(`Recalculating polarization index for statement: ${statementId}`);

		// Get the statement
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!statementDoc.exists) {
			return { success: false, message: `Statement ${statementId} not found` };
		}

		const statement = statementDoc.data() as Statement;
		const parentId = statement.parentId;
		const topParentId = statement.topParentId;

		if (!parentId || parentId === 'top') {
			return { success: false, message: 'Statement has no parent - skipping' };
		}

		// Get ancestor IDs for demographic lookup
		const ancestorIds = await getAncestorStatementIds(statementId);
		if (parentId && !ancestorIds.includes(parentId)) {
			ancestorIds.unshift(parentId);
		}

		// Check if there are any demographic questions defined
		const demographicQuestions = await getDemographicQuestions(topParentId || '', ancestorIds);
		if (demographicQuestions.length === 0) {
			return { success: false, message: 'No demographic questions found for this statement chain' };
		}

		// Get excluded demographic IDs for this statement
		const excludedDemographicIds = statement.statementSettings?.excludedInheritedDemographicIds || [];

		// Get all evaluations for this statement
		const evaluationsSnapshot = await db
			.collection(Collections.evaluations)
			.where('statementId', '==', statementId)
			.get();

		if (evaluationsSnapshot.empty) {
			return { success: false, message: 'No evaluations found for this statement' };
		}

		logger.info(`Found ${evaluationsSnapshot.size} evaluations for statement ${statementId}`);

		// Process each evaluation and create demographic evaluations
		const usersDemographicEvaluations: UserDemographicEvaluation[] = [];
		const batch = db.batch();
		let batchCount = 0;

		for (const evalDoc of evaluationsSnapshot.docs) {
			const evaluation = evalDoc.data() as Evaluation;
			const userId = evaluation.evaluator?.uid;

			if (!userId) continue;

			// Get user's demographic data
			let demographicData = await fetchUserDemographicData(userId, topParentId || '', ancestorIds);

			// Filter out excluded demographics
			if (excludedDemographicIds.length > 0) {
				demographicData = demographicData.filter(
					(q) => !q.userQuestionId || !excludedDemographicIds.includes(q.userQuestionId)
				);
			}

			if (demographicData.length === 0) {
				logger.info(`No demographic data for user ${userId} - skipping`);
				continue;
			}

			const demographicSummary = buildDemographicSummary(demographicData);
			if (demographicSummary.length === 0) continue;

			const userDemographicEvaluation: UserDemographicEvaluation = {
				userId,
				statementId,
				parentId,
				evaluation: evaluation.evaluation || 0,
				demographic: demographicSummary,
			};

			usersDemographicEvaluations.push(userDemographicEvaluation);

			// Save to userDemographicEvaluations collection
			const evalRef = db
				.collection(Collections.userDemographicEvaluations)
				.doc(`${statementId}--${userId}`);
			batch.set(evalRef, userDemographicEvaluation, { merge: true });
			batchCount++;

			// Commit batch if it reaches 500
			if (batchCount >= 500) {
				await batch.commit();
				batchCount = 0;
			}
		}

		// Commit remaining batch
		if (batchCount > 0) {
			await batch.commit();
		}

		if (usersDemographicEvaluations.length === 0) {
			return { success: false, message: 'No users with demographic data found' };
		}

		logger.info(`Created ${usersDemographicEvaluations.length} demographic evaluations`);

		// Calculate polarization index
		const values = usersDemographicEvaluations.map((e) => e.evaluation);
		const { mad: overallMAD, mean: overallMean, n: overallN } = calcMadAndMean(values);

		// Create axes from demographic data
		const axes = createAxes(usersDemographicEvaluations, demographicQuestions, statementId);

		const polarizationIndex: PolarizationIndex = {
			statementId,
			parentId,
			statement: statement.statement,
			overallMAD,
			overallMean,
			overallN,
			averageAgreement: overallMean,
			lastUpdated: Date.now(),
			axes,
			color: statement.color || getRandomColor(),
		};

		// Save polarization index
		await db.collection(Collections.polarizationIndex).doc(statementId).set(polarizationIndex, { merge: true });

		logger.info(`Successfully recalculated polarization index for ${statementId}`);
		
return {
			success: true,
			message: `Recalculated with ${usersDemographicEvaluations.length} users, ${axes.length} axes`,
		};
	} catch (error) {
		logger.error(`Error recalculating polarization index for ${statementId}:`, error);
		
return { success: false, message: `Error: ${error}` };
	}
}

function createAxes(
	usersDemographicEvaluations: UserDemographicEvaluation[],
	userDemographicData: UserDemographicQuestion[],
	statementId: string
): AxesItem[] {
	const axesSet = new Set<string>();
	usersDemographicEvaluations.forEach((evaluation) => {
		evaluation.demographic.forEach((demographic) => {
			axesSet.add(demographic.userQuestionId);
		});
	});

	const axes: AxesItem[] = Array.from(axesSet).map((axId) => {
		const axisDemographic = userDemographicData.find((demographic) => demographic.userQuestionId === axId);

		return {
			axId,
			question: axisDemographic?.question || '',
			groupsMAD: 0,
			groups:
				axisDemographic?.options?.map((option) => {
					const values = usersDemographicEvaluations
						.filter(
							(evaluation) =>
								evaluation.demographic.filter(
									(evl) =>
										evaluation.statementId === statementId &&
										evl.userQuestionId === axId &&
										evl.answer === option.option
								).length > 0
						)
						.map((evaluation) => evaluation.evaluation);

					const { mad, mean, n } = calcMadAndMean(values);

					return {
						option,
						mad,
						mean,
						n,
					};
				}) || [],
		};
	});

	// Calculate groupsMAD for each axis
	axes.forEach((ax: AxesItem) => {
		const values: number[] = [];
		ax.groups?.forEach((group: { mean: number }) => {
			values.push(group.mean);
		});
		const { mad: groupMAD } = calcMadAndMean(values);
		ax.groupsMAD = groupMAD;
	});

	return axes;
}

/**
 * Recalculate polarization index for all statements under a parent
 */
export async function recalculatePolarizationIndexForParent(
	parentId: string
): Promise<{ success: boolean; processed: number; errors: number }> {
	try {
		logger.info(`Recalculating polarization index for all statements under parent: ${parentId}`);

		// Get all child statements
		const childrenSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.get();

		let processed = 0;
		let errors = 0;

		for (const childDoc of childrenSnapshot.docs) {
			const result = await recalculatePolarizationIndexForStatement(childDoc.id);
			if (result.success) {
				processed++;
			} else {
				errors++;
				logger.info(`Skipped ${childDoc.id}: ${result.message}`);
			}
		}

		logger.info(`Completed: processed ${processed}, errors ${errors}`);
		
return { success: true, processed, errors };
	} catch (error) {
		logger.error('Error in recalculatePolarizationIndexForParent:', error);
		
return { success: false, processed: 0, errors: 1 };
	}
}

/**
 * Recalculate polarization index for all statements under a top parent (entire group)
 */
export async function recalculatePolarizationIndexForGroup(
	topParentId: string
): Promise<{ success: boolean; processed: number; errors: number }> {
	try {
		logger.info(`Recalculating polarization index for all statements in group: ${topParentId}`);

		// Get all statements in this group
		const statementsSnapshot = await db
			.collection(Collections.statements)
			.where('topParentId', '==', topParentId)
			.get();

		let processed = 0;
		let errors = 0;

		for (const statementDoc of statementsSnapshot.docs) {
			// Only process statements that have a parent (not top-level)
			const statement = statementDoc.data() as Statement;
			if (statement.parentId && statement.parentId !== 'top') {
				const result = await recalculatePolarizationIndexForStatement(statementDoc.id);
				if (result.success) {
					processed++;
				} else {
					errors++;
				}
			}
		}

		logger.info(`Completed group recalculation: processed ${processed}, errors/skipped ${errors}`);
		
return { success: true, processed, errors };
	} catch (error) {
		logger.error('Error in recalculatePolarizationIndexForGroup:', error);
		
return { success: false, processed: 0, errors: 1 };
	}
}
