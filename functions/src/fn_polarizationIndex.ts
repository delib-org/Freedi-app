// ============================================================================
// POLARIZATION INDEX HELPERS
// ============================================================================

import { Statement } from "@freedi/shared-types";
import { AxesItem, Collections, PolarizationIndex, UserDemographicQuestion } from '@freedi/shared-types';
import { getRandomColor } from "./helpers";
import { db } from ".";
import { logger } from "firebase-functions/v1";

// Use string literal for scope until delib-npm exports the enum value
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;
const DEMOGRAPHIC_SCOPE_STATEMENT = 'statement' as const;

/**
 * Get all ancestor statement IDs by traversing up the parent chain
 * @param statementId - Starting statement ID
 * @returns Array of ancestor statement IDs (from immediate parent to root)
 */
async function getAncestorStatementIds(statementId: string): Promise<string[]> {
	const ancestors: string[] = [];
	let currentId = statementId;
	const maxDepth = 10; // Prevent infinite loops
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

export async function updateUserDemographicEvaluation(statement: Statement, userEvalData: { userId: string, evaluation: number }): Promise<void> {

	try {
		const { userId, evaluation } = userEvalData;
		const parentId = statement.parentId;

		if (!userId || !parentId) {
			console.info('User ID or parent ID is missing - skipping demographic evaluation update');

			return;
		}

		// Check for demographic settings at BOTH group level (topParentId) AND statement level
		const topParentId = statement.topParentId;

		// Get all ancestor statement IDs to check for demographics up the chain
		const ancestorIds = await getAncestorStatementIds(statement.statementId);
		// Include immediate parent if not already in ancestors
		if (parentId && !ancestorIds.includes(parentId)) {
			ancestorIds.unshift(parentId);
		}

		// Check for group-level questions
		const groupDemographicSettings = topParentId
			? await db.collection(Collections.userDemographicQuestions)
				.where('topParentId', '==', topParentId)
				.where('scope', '==', DEMOGRAPHIC_SCOPE_GROUP)
				.limit(1).get()
			: { empty: true };

		// Check for statement-level questions across all ancestors
		let statementDemographicSettings = { empty: true };
		for (const ancestorId of ancestorIds) {
			const ancestorQuestions = await db.collection(Collections.userDemographicQuestions)
				.where('statementId', '==', ancestorId)
				.where('scope', '==', DEMOGRAPHIC_SCOPE_STATEMENT)
				.limit(1).get();

			if (!ancestorQuestions.empty) {
				statementDemographicSettings = ancestorQuestions;
				break; // Found questions at this level, no need to go higher
			}
		}

		if (groupDemographicSettings.empty && statementDemographicSettings.empty) return;

		// Get excluded inherited demographic IDs for this statement
		const excludedDemographicIds = statement.statementSettings?.excludedInheritedDemographicIds || [];

		const { usersDemographicData, usersDemographicEvaluations } = await getUserDemographicData(userId, parentId, evaluation, statement, ancestorIds, excludedDemographicIds);

		if (!usersDemographicEvaluations || usersDemographicEvaluations.length === 0) {
			console.info(`No demographic evaluation found for user ${userId} on statement ${parentId} - skipping evaluation update`);

			return;
		}

		const values = usersDemographicEvaluations.map(evaluation => evaluation.evaluation);
		const { mad: overallMAD, mean: overallMean, n: overallN } = calcMadAndMean(values);

		const axes: AxesItem[] = createAxes(usersDemographicEvaluations, usersDemographicData);

		const PolarizationIndex: PolarizationIndex = {
			statementId: statement.statementId,
			parentId: statement.parentId,
			statement: statement.statement,
			overallMAD,
			overallMean,
			overallN,
			averageAgreement: overallMean,
			lastUpdated: Date.now(),
			axes,
			color: statement.color || getRandomColor(),
		}

		await db.collection(Collections.polarizationIndex).doc(statement.statementId).set(PolarizationIndex, { merge: true });

	} catch (error) {
		logger.error('Error updating user demographic evaluation:', error);

	}

	function createAxes(usersDemographicEvaluations: UserDemographicEvaluation[], userDemographicData: UserDemographicQuestion[]): AxesItem[] {
		const axesSet = new Set<string>();
		usersDemographicEvaluations.forEach(evaluation => {
			evaluation.demographic.forEach(demographic => {
				axesSet.add(demographic.userQuestionId);
			});
		});

		const axes: AxesItem[] = Array.from(axesSet).map(axId => {
			const axisDemographic = userDemographicData.find(demographic => demographic.userQuestionId === axId);

			return {
				axId,
				question: axisDemographic?.question || '',
				groupsMAD: 0,
				groups: axisDemographic?.options?.map(option => {

					const values = usersDemographicEvaluations
						.filter(evaluation => evaluation.demographic.filter(evl => evaluation.statementId === statement.statementId && evl.userQuestionId === axId && evl.answer === option.option).length > 0)
						.map(evaluation => evaluation.evaluation);

					const { mad, mean, n } = calcMadAndMean(values);

					return {
						option,
						mad,
						mean,
						n,
					};
				}) || []
			};

		});

		axes.forEach((ax: AxesItem) => {
			const values: number[] = [];
			ax.groups?.forEach((group: { mean: number; }) => {
				values.push(group.mean);
			});
			const { mad: groupMAD } = calcMadAndMean(values);
			ax.groupsMAD = groupMAD;
		});

		return axes;
	}

	//get user demographic data
	// Improved version with better separation of concerns and readability

	interface DemographicResult {
		usersDemographicData: UserDemographicQuestion[];
		usersDemographicEvaluations: UserDemographicEvaluation[] | null;
	}

	async function getUserDemographicData(
		userId: string,
		parentId: string,
		evaluation: number,
		statement: Statement,
		ancestorIds: string[],
		excludedDemographicIds: string[]
	): Promise<DemographicResult> {
		try {
			// Fetch user's demographic data
			let demographicData = await fetchUserDemographicData(userId, parentId, ancestorIds);

			// Filter out excluded inherited demographics
			if (excludedDemographicIds.length > 0) {
				demographicData = demographicData.filter(
					(q) => !q.userQuestionId || !excludedDemographicIds.includes(q.userQuestionId)
				);
			}

			if (demographicData.length === 0) {
				console.info(`No demographic data found for user ${userId} on statement ${parentId}`);

				return createEmptyResult();
			}

			// Save user's evaluation with demographic info
			await saveUserDemographicEvaluation(userId, statement, evaluation, demographicData);

			// Get all evaluations for this statement
			const allEvaluations = await fetchAllDemographicEvaluations(statement.statementId, parentId);
			if (allEvaluations.length === 0) {
				console.info(`No demographic evaluations found for statement ${statement.statementId}`);

				return { usersDemographicData: demographicData, usersDemographicEvaluations: [] };
			}

			return {
				usersDemographicData: demographicData,
				usersDemographicEvaluations: allEvaluations
			};

		} catch (error) {
			logger.error('Error in getUserDemographicData:', error);

			return createEmptyResult();
		}
	}

	// Helper functions for better separation of concerns

	async function fetchUserDemographicData(userId: string, parentId: string, ancestorIds: string[]): Promise<UserDemographicQuestion[]> {
		const topParentId = statement.topParentId;

		// Merge answers: group-level first, then statement-level across all ancestors
		const answerMap = new Map<string, UserDemographicQuestion>();

		// 1. Fetch group-level answers (scope = 'group')
		if (topParentId) {
			const groupSnapshot = await db.collection(Collections.usersData)
				.where('userId', '==', userId)
				.where('topParentId', '==', topParentId)
				.where('scope', '==', DEMOGRAPHIC_SCOPE_GROUP)
				.get();

			if (!groupSnapshot.empty) {
				groupSnapshot.docs.forEach(doc => {
					const data = doc.data() as UserDemographicQuestion;
					if (data.userQuestionId) {
						answerMap.set(data.userQuestionId, data);
					}
				});
			}
		}

		// 2. Fetch statement-level answers across all ancestors (including immediate parent)
		for (const ancestorId of ancestorIds) {
			const statementSnapshot = await db.collection(Collections.usersData)
				.where('userId', '==', userId)
				.where('statementId', '==', ancestorId)
				.get();

			if (!statementSnapshot.empty) {
				statementSnapshot.docs.forEach(doc => {
					const data = doc.data() as UserDemographicQuestion;
					// Only add if not already present (higher priority answers stay)
					if (data.userQuestionId && !answerMap.has(data.userQuestionId)) {
						answerMap.set(data.userQuestionId, data);
					}
				});
			}
		}

		return Array.from(answerMap.values());
	}

	async function saveUserDemographicEvaluation(
		userId: string,
		statement: Statement,
		evaluation: number,
		demographicData: UserDemographicQuestion[]
	): Promise<void> {
		const evaluationRef = db
			.collection(Collections.userDemographicEvaluations)
			.doc(`${statement.statementId}--${userId}`);

		const evaluationData: UserDemographicEvaluation = {
			userId,
			statementId: statement.statementId,
			parentId: statement.parentId,
			evaluation: evaluation || 0,
			demographic: buildDemographicSummary(demographicData)
		};

		await evaluationRef.set(evaluationData, { merge: true });
	}

	async function fetchAllDemographicEvaluations(
		statementId: string,
		parentId: string
	): Promise<UserDemographicEvaluation[]> {
		const snapshot = await db
			.collection(Collections.userDemographicEvaluations)
			.where('statementId', '==', statementId)
			.where('parentId', '==', parentId)
			.get();

		return snapshot.empty ? [] : snapshot.docs.map(doc => doc.data() as UserDemographicEvaluation);
	}

	function buildDemographicSummary(demographicData: UserDemographicQuestion[]) {
		return demographicData
			.filter(item => item.answer && item.userQuestionId)
			.map(item => ({
				question: item.question,
				answer: item.answer!,
				userQuestionId: item.userQuestionId!
			}));
	}

	function createEmptyResult(): DemographicResult {
		return {
			usersDemographicData: [],
			usersDemographicEvaluations: []
		};
	}

}

function calcMadAndMean(values: number[]): { mad: number, mean: number, n: number } {
	// Placeholder for MAD calculation logic
	if (values.length === 0) return { mad: 0, mean: 0, n: 0 };
	if (values.length === 1) return { mad: 0, mean: values[0], n: 1 };

	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

	return { mad, mean, n: values.length };
}