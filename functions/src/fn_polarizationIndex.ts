// ============================================================================
// POLARIZATION INDEX HELPERS
// ============================================================================

import { AxesItem, Collections, PolarizationIndex, Statement, UserQuestion } from "delib-npm";
import { getRandomColor } from "./helpers";
import { db } from ".";
import { logger } from "firebase-functions/v1";

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

		//check if this statement has demographic settings. If it doesn't, skip the demographic evaluation update
		const demographicSettings = await db.collection(Collections.userDataQuestions).where('statementId', '==', statement.parentId).limit(1).get();
		if (demographicSettings.empty) return;

		const { usersDemographicData, usersDemographicEvaluations } = await getUserDemographicData(userId, parentId, evaluation, statement);

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

	function createAxes(usersDemographicEvaluations: UserDemographicEvaluation[], userDemographicData: UserQuestion[]): AxesItem[] {
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
		usersDemographicData: UserQuestion[];
		usersDemographicEvaluations: UserDemographicEvaluation[] | null;
	}

	async function getUserDemographicData(
		userId: string,
		parentId: string,
		evaluation: number,
		statement: Statement // Added this parameter since it was used but not defined
	): Promise<DemographicResult> {
		try {
			// Fetch user's demographic data
			const demographicData = await fetchUserDemographicData(userId, parentId);
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

	async function fetchUserDemographicData(userId: string, parentId: string): Promise<UserQuestion[]> {
		const snapshot = await db
			.collection(Collections.usersData)
			.where('userId', '==', userId)
			.where('statementId', '==', parentId)
			.get();

		return snapshot.empty ? [] : snapshot.docs.map(doc => doc.data() as UserQuestion);
	}

	async function saveUserDemographicEvaluation(
		userId: string,
		statement: Statement,
		evaluation: number,
		demographicData: UserQuestion[]
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

	function buildDemographicSummary(demographicData: UserQuestion[]) {
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