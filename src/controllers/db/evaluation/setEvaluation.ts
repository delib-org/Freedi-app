import { setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { number, parse } from 'valibot';
import { EvaluationSchema, Statement, User, EvaluationUI } from '@freedi/shared-types';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import { store } from '@/redux/store';
import { trackDiscussionAction } from '@/redux/pwa/pwaSlice';
import {
	createEvaluationRef,
	createStatementRef,
	getCurrentTimestamp,
} from '@/utils/firebaseUtils';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logEvaluation } from '@/controllers/db/researchLogs/researchLogger';

export async function setEvaluationToDB(
	statement: Statement,
	creator: User,
	evaluation: number,
): Promise<void> {
	try {
		parse(number(), evaluation);

		if (evaluation < -1 || evaluation > 1) throw new Error('Evaluation is not in range');

		//ids
		const parentId = statement.parentId;
		if (!parentId) throw new Error('ParentId is undefined');

		const statementId = statement.statementId;

		const evaluationId = `${creator.uid}--${statementId}`;

		//set evaluation to db

		const evaluationRef = createEvaluationRef(evaluationId);
		const evaluationData = {
			parentId,
			evaluationId,
			statementId,
			evaluatorId: creator.uid,
			updatedAt: getCurrentTimestamp(),
			evaluation,
			evaluator: creator,
		};

		parse(EvaluationSchema, evaluationData);

		// Capture previous evaluation from Redux before the write
		const previousEval = store
			.getState()
			.evaluations.userEvaluations.find(
				(e) => e.statementId === statementId && e.evaluatorId === creator.uid,
			)?.evaluation;

		await setDoc(evaluationRef, evaluationData);

		// Research logging
		logEvaluation(
			statementId,
			String(evaluation),
			previousEval !== undefined ? String(previousEval) : undefined,
			statement.topParentId,
		).catch(() => {
			/* handled inside logResearchAction */
		});

		// Track evaluation/vote
		logger.info('Evaluation set', {
			statementId,
			evaluation,
			userId: creator.uid,
		});

		analyticsService.trackStatementVote(
			statementId,
			evaluation, // -1 to 1 scale
			'button', // Could be passed as parameter if needed
		);

		// Track discussion action for notification prompt timing
		const discussionId = statement.topParentId ?? statement.parentId;
		if (discussionId && discussionId !== 'top') {
			store.dispatch(trackDiscussionAction(discussionId));
		}
	} catch (error) {
		logger.error('Failed to set evaluation', error, {
			statementId: statement.statementId,
			userId: creator.uid,
		});
	}
}

export function setEvaluationUIType(statementId: string, evaluationUI: EvaluationUI) {
	const evaluationUIRef = createStatementRef(statementId);
	updateDoc(evaluationUIRef, { evaluationSettings: { evaluationUI: evaluationUI } }).catch(
		(error) => {
			logger.error('Error updating evaluation UI', error, { statementId });
		},
	);

	return evaluationUIRef;
}

export async function setAnchoredEvaluationSettings(
	statementId: string,
	anchoredSettings: {
		anchored: boolean;
		numberOfAnchoredStatements: number;
		differentiateBetweenAnchoredAndNot?: boolean;
		anchorIcon?: string;
		anchorDescription?: string;
		anchorLabel?: string;
	},
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);

		await updateDoc(statementRef, {
			'evaluationSettings.anchored': anchoredSettings,
		});

		// Log event
		logger.info('Anchored Sampling Settings Changed', {
			statementId,
			enabled: anchoredSettings.anchored,
			numberOfAnchored: anchoredSettings.numberOfAnchoredStatements,
		});
	} catch (error) {
		logger.error('Error updating anchored evaluation settings', error, {
			statementId,
			anchoredSettings,
		});
		throw error;
	}
}

export async function setMaxVotesPerUser(
	statementId: string,
	maxVotes: number | undefined,
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);

		await updateDoc(statementRef, {
			'evaluationSettings.axVotesPerUser': maxVotes || null,
		});

		// Log event
		logger.info('Max Votes Per User Setting Changed', {
			statementId,
			maxVotes: maxVotes || 'unlimited',
		});
	} catch (error) {
		logger.error('Error updating max votes per user', error, {
			statementId,
			maxVotes,
		});
		throw error;
	}
}

export async function setConfidenceIndexSettings(
	statementId: string,
	settings: {
		targetPopulation?: number;
		samplingQuality?: number;
	},
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);

		const updateData: Record<string, number | null> = {};
		if (settings.targetPopulation !== undefined) {
			updateData['evaluationSettings.targetPopulation'] =
				settings.targetPopulation > 0 ? settings.targetPopulation : null;
		}
		if (settings.samplingQuality !== undefined) {
			updateData['evaluationSettings.samplingQuality'] = settings.samplingQuality;
		}

		await updateDoc(statementRef, updateData);

		logger.info('Confidence Index Settings Changed', {
			statementId,
			...settings,
		});
	} catch (error) {
		logger.error('Error updating confidence index settings', error, {
			statementId,
			settings,
		});
		throw error;
	}
}

interface RecalculateIndicesResult {
	success: boolean;
	optionsUpdated: number;
	targetPopulation: number | undefined;
	samplingQuality: number;
}

export async function requestRecalculateIndices(
	statementId: string,
): Promise<RecalculateIndicesResult> {
	try {
		const recalculate = httpsCallable<{ statementId: string }, RecalculateIndicesResult>(
			functions,
			'recalculateIndices',
		);

		const result = await recalculate({ statementId });

		logger.info('Indices recalculated', {
			statementId,
			optionsUpdated: result.data.optionsUpdated,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'setEvaluation.requestRecalculateIndices',
			statementId,
		});
		throw error;
	}
}
