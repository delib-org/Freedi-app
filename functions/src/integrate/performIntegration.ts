import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { migrateEvaluationsToNewStatement } from '../evaluation';
import { textToParagraphs } from '../helpers';

/**
 * Core integration / merge primitive shared between:
 *   - the per-idea admin flow (`executeIntegration` callable)
 *   - the bulk idea-synthesis flow (`synthesizeIdeasExecute` callable)
 *
 * Caller is responsible for authentication, authorization, and input
 * validation. This function performs the data writes only.
 *
 * Effects:
 *   1. Creates a new Statement with `isCluster: true`,
 *      `integratedOptions: selectedStatementIds`.
 *   2. Migrates all member evaluations to the new statement, deduplicating
 *      per-user via `migrateEvaluationsToNewStatement`.
 *   3. Hides the originals via `hide: true, integratedInto: <newId>`.
 *   4. Bumps the parent's `lastChildUpdate`.
 */
export interface PerformIntegrationInput {
	parentStatementId: string;
	selectedStatementIds: string[];
	integratedTitle: string;
	integratedDescription: string;
	creatorId: string;
	creatorDisplayName: string;
	creatorDefaultLanguage: string;
	/** When set, written to the new Statement's `derivedByPipeline` field. */
	derivedByPipeline?: 'synthesis' | 'topic-cluster';
}

export interface PerformIntegrationResult {
	newStatementId: string;
	migratedEvaluationsCount: number;
	hiddenStatementsCount: number;
	hiddenStatementIds: string[];
}

export async function performIntegration(
	input: PerformIntegrationInput,
): Promise<PerformIntegrationResult> {
	const {
		parentStatementId,
		selectedStatementIds,
		integratedTitle,
		integratedDescription,
		creatorId,
		creatorDisplayName,
		creatorDefaultLanguage,
		derivedByPipeline,
	} = input;

	if (!parentStatementId) {
		throw new Error('performIntegration: parentStatementId is required');
	}
	if (!selectedStatementIds.length) {
		throw new Error('performIntegration: at least one selected statement is required');
	}
	if (!integratedTitle.trim()) {
		throw new Error('performIntegration: integrated title is required');
	}

	const db = getFirestore();

	const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
	if (!parentDoc.exists) {
		throw new Error(`performIntegration: parent ${parentStatementId} not found`);
	}
	const parentStatement = parentDoc.data() as Statement;
	const topParentId = parentStatement.topParentId || parentStatementId;

	const selectedStatements: Statement[] = [];
	for (const id of selectedStatementIds) {
		const doc = await db.collection(Collections.statements).doc(id).get();
		if (doc.exists) {
			selectedStatements.push(doc.data() as Statement);
		}
	}

	if (selectedStatements.length === 0) {
		throw new Error('performIntegration: no valid statements found to integrate');
	}

	const newStatementId = db.collection(Collections.statements).doc().id;
	const now = Date.now();

	const newStatement: Statement = {
		statementId: newStatementId,
		statement: integratedTitle.trim(),
		paragraphs: textToParagraphs(integratedDescription?.trim() || ''),
		statementType: StatementType.option,
		parentId: parentStatementId,
		topParentId,
		creatorId,
		creator: {
			displayName: creatorDisplayName || 'Admin',
			uid: creatorId,
			defaultLanguage: creatorDefaultLanguage || 'en',
		},
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		totalEvaluators: 0,
		evaluation: {
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			sumSquaredEvaluations: 0,
			averageEvaluation: 0,
			agreement: 0,
		},
		hide: false,
		randomSeed: Math.random(),
		isCluster: true,
		integratedOptions: selectedStatementIds,
	};
	if (derivedByPipeline) {
		newStatement.derivedByPipeline = derivedByPipeline;
	}

	await db.collection(Collections.statements).doc(newStatementId).set(newStatement);
	logger.info(`performIntegration: created statement ${newStatementId}`, {
		members: selectedStatementIds.length,
		derivedByPipeline,
	});

	let migratedCount = 0;
	try {
		const migrationResult = await migrateEvaluationsToNewStatement(
			selectedStatementIds,
			newStatementId,
			parentStatementId,
		);
		migratedCount = migrationResult.migratedCount;
	} catch (error) {
		logger.error('performIntegration: evaluation migration failed', error);
	}

	const batch = db.batch();
	for (const statement of selectedStatements) {
		const ref = db.collection(Collections.statements).doc(statement.statementId);
		batch.update(ref, {
			hide: true,
			integratedInto: newStatementId,
			lastUpdate: now,
		});
	}
	await batch.commit();

	await db.collection(Collections.statements).doc(parentStatementId).update({
		lastChildUpdate: now,
		lastUpdate: now,
	});

	return {
		newStatementId,
		migratedEvaluationsCount: migratedCount,
		hiddenStatementsCount: selectedStatements.length,
		hiddenStatementIds: selectedStatements.map((s) => s.statementId),
	};
}
