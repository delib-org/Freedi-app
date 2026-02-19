import { setDoc, updateDoc } from 'firebase/firestore';
import { number, parse } from 'valibot';
import { EvaluationSchema, Statement, User, EvaluationUI } from '@freedi/shared-types';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import {
	createEvaluationRef,
	createStatementRef,
	getCurrentTimestamp,
} from '@/utils/firebaseUtils';

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

		await setDoc(evaluationRef, evaluationData);

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
