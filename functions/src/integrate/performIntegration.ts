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
	/** Run provenance: id of the run that created this cluster (surgical cleanup). */
	synthesisRunId?: string;
	/** Which synthesis path created this cluster. */
	synthesisMechanism?: 'bulk' | 'live-spawn' | 'live-attach';
	/**
	 * Optional rich body. When provided (e.g. by the synthesis pipeline),
	 * each entry becomes a paragraph child Statement under the new cluster
	 * (statementType === paragraph), and `Statement.description` is set
	 * to the first paragraph for cached card previews. Per the project's
	 * standing rule: paragraphs are child Statements, not the legacy
	 * `paragraphs[]` array.
	 */
	paragraphs?: string[];
	/**
	 * Hide the source options (`hide: true, integratedInto`) after merging.
	 * Default true — a synthesized proposal REPLACES its sources. Set false for
	 * topic clusters, which only GROUP visible options: the options-view selector
	 * nests visible members under the topic card, and a hidden member resolves to
	 * nothing there ("No originals found").
	 */
	hideMembers?: boolean;
	/**
	 * Migrate member evaluations onto the new cluster. Default true. Set false
	 * when members stay visible — `recomputeClusterEvaluation` already aggregates
	 * from the members, and migrating would strip their individual evaluations.
	 */
	migrateEvaluations?: boolean;
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
		synthesisRunId,
		synthesisMechanism,
		paragraphs,
		hideMembers = true,
		migrateEvaluations = true,
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

	// Decide rich-body strategy.
	// - If `paragraphs` provided (synthesis pipeline): write paragraph children
	//   per the project's "paragraphs are child Statements" rule, and use the
	//   first paragraph as the cached `description`.
	// - Otherwise (legacy / topic-cluster paths): keep the existing
	//   `paragraphs[]` array shape on the parent doc.
	const usingParagraphChildren = Array.isArray(paragraphs) && paragraphs.length > 0;
	const cachedDescription = usingParagraphChildren
		? paragraphs!.find((p) => p.trim().length > 0)?.trim() || integratedDescription?.trim() || ''
		: integratedDescription?.trim() || '';

	const newStatement: Statement = {
		statementId: newStatementId,
		statement: integratedTitle.trim(),
		// Keep the legacy paragraphs[] EMPTY when using paragraph children, so
		// downstream readers don't double-render description from both shapes.
		paragraphs: usingParagraphChildren ? [] : textToParagraphs(integratedDescription?.trim() || ''),
		description: cachedDescription,
		statementType: StatementType.option,
		parentId: parentStatementId,
		// Full ancestor chain so this cluster is picked up by descendant
		// queries/selectors that filter on parents[] (e.g. the cluster map).
		// Without it the map drops auto-generated clusters and shows flat mode.
		parents: [...(parentStatement.parents ?? []), parentStatementId],
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
		if (derivedByPipeline === 'synthesis') {
			(newStatement as Statement & Record<string, unknown>).isSynthesis = true;
		}
	}
	if (synthesisRunId) newStatement.synthesisRunId = synthesisRunId;
	if (synthesisMechanism) newStatement.synthesisMechanism = synthesisMechanism;

	await db.collection(Collections.statements).doc(newStatementId).set(newStatement);
	logger.info(`performIntegration: created statement ${newStatementId}`, {
		members: selectedStatementIds.length,
		derivedByPipeline,
		paragraphChildren: usingParagraphChildren ? paragraphs!.length : 0,
	});

	// Write paragraph child statements atomically. Each paragraph becomes a
	// child Statement with `statementType === paragraph`. The order is
	// preserved by spacing `createdAt` by one millisecond per paragraph so
	// downstream sorts by `createdAt asc` produce the original sequence.
	if (usingParagraphChildren) {
		const parentParents = parentStatement.parents ?? [];
		const childBatch = db.batch();
		paragraphs!.forEach((text, idx) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const childId = db.collection(Collections.statements).doc().id;
			const childCreatedAt = now + idx;
			const child: Partial<Statement> & { statementId: string } = {
				statementId: childId,
				statement: trimmed,
				statementType: StatementType.paragraph,
				parentId: newStatementId,
				topParentId,
				parents: [...parentParents, parentStatementId, newStatementId],
				creatorId,
				creator: {
					displayName: creatorDisplayName || 'Admin',
					uid: creatorId,
					defaultLanguage: creatorDefaultLanguage || 'en',
				},
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			};
			childBatch.set(db.collection(Collections.statements).doc(childId), child);
		});
		await childBatch.commit();
	}

	let migratedCount = 0;
	if (migrateEvaluations) {
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
	}

	if (hideMembers) {
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
	}

	await db.collection(Collections.statements).doc(parentStatementId).update({
		lastChildUpdate: now,
		lastUpdate: now,
	});

	return {
		newStatementId,
		migratedEvaluationsCount: migratedCount,
		hiddenStatementsCount: hideMembers ? selectedStatements.length : 0,
		hiddenStatementIds: hideMembers ? selectedStatements.map((s) => s.statementId) : [],
	};
}
