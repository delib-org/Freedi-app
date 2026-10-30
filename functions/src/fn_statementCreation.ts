import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { parse } from 'valibot';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementSchema,
	StatementType,
	SimpleStatement,
	SourceApp,
	statementToSimpleStatement,
	getRandomUID,
} from '@freedi/shared-types';
import { db } from './index';
import { embeddingService } from './services/embedding-service';
import { embeddingCache } from './services/embedding-cache-service';
import { notifyStatementSubscribers } from './notifications/notifyStatementSubscribers';
import { trackStatementCreation } from './engagement/credits/trackEngagement';
import { onStatementCreatedStats } from './fn_adminStats';
import { recordSuggestionProgress } from './progress/statementCreationHook';
import { generateDescriptionFromChildren } from './helpers';
import { recordDiscussionActivity } from './userFeed/recordDiscussionActivity';
import { onClassOptionCreated } from './classroom/autoEvaluations';
import { logError } from './utils/errorHandling';
import { setupAdminsForStatement } from './setupAdminsForStatement';
import {
	computeHybridVector,
	isHybridClusteringEnabled,
	saveHybridEmbedding,
} from './services/hybrid-vector-service';

/**
 * Consolidated function that handles all tasks when a new statement is created.
 * This replaces multiple separate functions to reduce the number of triggers.
 */
export async function onStatementCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>,
): Promise<void> {
	if (!event.data) return;

	try {
		const statementData = event.data.data();
		if (!statementData) return;

		// Ensure topParentId exists for legacy data that may not have it
		if (!statementData.topParentId) {
			statementData.topParentId = statementData.parentId || event.params.statementId;
		}

		const statement = parse(StatementSchema, statementData);

		// Run all creation tasks in parallel where possible
		const tasks: Promise<void>[] = [];

		// Task 1: Set up admins for the new statement
		tasks.push(setupAdminsForStatement(statement));

		// Task 2: Update chosen options (if applicable)
		if (statement.statementType === 'option') {
			tasks.push(updateChosenOptionsForNewStatement(statement));
		}

		// Task 3: Update parent statement (if not top-level)
		if (statement.parentId !== 'top') {
			tasks.push(updateParentForNewChild(statement));

			// New content anywhere in a discussion raises it on its members' home
			// pages: a coalesced (once a minute) write to userFeed, which has no
			// triggers. Replaces the removed updateTopParentSubscriptions fan-out.
			tasks.push(recordDiscussionActivity(db, statement.topParentId).then(() => undefined));
		}

		// Task 4: Add to mass consensus (if applicable)
		if (statement.statementType === 'option' && statement.consensus) {
			tasks.push(addStatementToMassConsensus(statement));
		}

		// Task 5: Create notifications (if not top-level). A join-class reply on a
		// proposal (IA 22) has its own notice path (classPostReply): the generic
		// fan-out would copy a child's words and name into lastMessage, the in-app
		// center and email.
		if (statement.parentId !== 'top' && statement.classReply === undefined) {
			tasks.push(createNotificationsForStatement(statement));
		}

		// Task 6: Generate embedding for option statements (async, non-blocking)
		if (statement.statementType === 'option') {
			tasks.push(generateEmbeddingForStatement(statement));
		}

		// Task 7: Track engagement (non-blocking)
		tasks.push(
			trackStatementCreation(statement).catch((err) =>
				logger.warn('Engagement tracking failed:', err),
			),
		);

		// Task 8: Track admin stats (non-blocking)
		tasks.push(
			onStatementCreatedStats(statement).catch((err) =>
				logger.warn('Admin stats tracking failed:', err),
			),
		);

		// Task 9: Split multi-line text into title + paragraph children (non-blocking)
		tasks.push(
			splitStatementIntoParagraphs(statement).catch((err) =>
				logger.warn('Paragraph splitting failed:', err),
			),
		);

		// Task 10: Question progress funnel + Home activity bump (non-blocking)
		tasks.push(
			recordSuggestionProgress(statement).catch((err) =>
				logger.warn('Question progress tracking failed:', err),
			),
		);

		// Task 11: join-class — auto +1 by the author (and table co-authors) of an
		// option written at a table, and lock that table's writing mode
		if (statement.classTable) {
			tasks.push(
				onClassOptionCreated(db, statement)
					.then(() => undefined)
					.catch((err) =>
						logError(err, {
							operation: 'onStatementCreated.classAutoEvaluation',
							statementId: statement.statementId,
							metadata: { tableId: statement.classTable?.tableId },
						}),
					),
			);
		}

		// Execute all tasks in parallel
		await Promise.all(tasks);

		logger.info(`Successfully processed creation of statement ${statement.statementId}`);
	} catch (error) {
		logger.error('Error in onStatementCreated:', error);
	}
}

/**
 * Updates chosen options for a new statement
 * (Replaces updateChosenOptionsOnOptionCreate)
 */
async function updateChosenOptionsForNewStatement(statement: Statement): Promise<void> {
	try {
		// Implementation from updateChosenOptions function
		// This would contain the logic from fn_evaluation.ts
		// For now, just log that it would run
		logger.info(`Would update chosen options for statement ${statement.statementId}`);
	} catch (error) {
		logger.error('Error in updateChosenOptionsForNewStatement:', error);
		throw error;
	}
}

/**
 * Updates parent statement when a new child is created
 * (Replaces updateParentOnChildCreate)
 * This includes updating the parent's lastSubStatements and all subscriptions
 */
async function updateParentForNewChild(statement: Statement): Promise<void> {
	try {
		const parentId = statement.parentId;

		// Skip if parentId is 'top' since it's not a real document
		if (parentId === 'top') {
			logger.info('Skipping update for "top" parent - not a real document');

			return;
		}

		const parentRef = db.collection(Collections.statements).doc(parentId);

		// Get last 3 sub-statements ordered by creation date
		const subStatementsQuery = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.orderBy('createdAt', 'desc')
			.limit(3)
			.get();

		// Convert to SimpleStatement array
		const lastSubStatements: SimpleStatement[] = subStatementsQuery.docs.map((doc) => {
			const stmt = doc.data() as Statement;

			return statementToSimpleStatement(stmt);
		});

		const timestamp = Date.now();

		// Prepare update object - using Record type for Firestore compatibility
		const updateData: Record<string, FieldValue | SimpleStatement[] | number> = {
			subStatementsCount: FieldValue.increment(1),
			lastSubStatements: lastSubStatements,
			lastUpdate: timestamp,
			lastChildUpdate: timestamp,
		};

		// If the new statement is an option, also increment numberOfOptions
		if (statement.statementType === 'option') {
			updateData.numberOfOptions = FieldValue.increment(1);
		}

		// Update parent with new sub-statements, timestamp, and increment counts
		await parentRef.update(updateData);

		logger.info(`Updated parent ${parentId} with ${lastSubStatements.length} sub-statements`);

		// REMOVED: updateParentSubscriptions fan-out
		// The parent Statement doc's lastChildUpdate field (set above) is the source of truth.
		// The client reads it via Redux overlay and sorts using getLatestChildActivity().
	} catch (error) {
		logger.error('Error in updateParentForNewChild:', error);
		throw error;
	}
}

/**
 * Adds statement to mass consensus
 * (Replaces addOptionToMassConsensus)
 */
async function addStatementToMassConsensus(statement: Statement): Promise<void> {
	try {
		const parentRef = db.collection(Collections.statements).doc(statement.parentId);

		await db.runTransaction(async (transaction) => {
			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				throw new Error('Parent statement does not exist');
			}

			const parentData = parentDoc.data();
			if (parentData && parentData.suggestions !== undefined) {
				transaction.update(parentRef, {
					suggestions: FieldValue.increment(1),
				});
			} else {
				transaction.update(parentRef, {
					suggestions: 1,
				});
			}
		});

		logger.info(`Added statement ${statement.statementId} to mass consensus`);
	} catch (error) {
		logger.error('Error in addStatementToMassConsensus:', error);
		throw error;
	}
}

/**
 * Creates notifications for a new statement
 * (Replaces updateInAppNotifications)
 */
async function createNotificationsForStatement(statement: Statement): Promise<void> {
	try {
		// Get parent statement.
		const parentStatementDB = await db.doc(`${Collections.statements}/${statement.parentId}`).get();

		// Check if parent exists (for non-top statements)
		if (!parentStatementDB.exists) {
			logger.error(`Parent statement ${statement.parentId} not found`);

			return;
		}

		const parentData = parentStatementDB.data();
		// Ensure topParentId exists for legacy data
		if (parentData && !parentData.topParentId) {
			parentData.topParentId = parentData.parentId || statement.parentId;
		}
		const parentStatement = parse(StatementSchema, parentData);

		// Update last message in parent
		await db.doc(`${Collections.statements}/${statement.parentId}`).update({
			lastMessage: {
				message: statement.statement,
				creator: statement.creator.displayName || 'Anonymous',
				createdAt: statement.createdAt,
			},
		});

		// Fan out to subscribers via the shared, settings-aware path (in-app +
		// push). Behaviour is unchanged for users without a settings doc.
		await notifyStatementSubscribers(statement, parentStatement);
	} catch (error) {
		logger.error('Error in createNotificationsForStatement:', error);
		throw error;
	}
}

// REMOVED: updateTopParentSubscriptions
// Was doing O(N) writes to all subscriptions of the top-level parent.
// The parent Statement doc's lastChildUpdate is the source of truth now.

/**
 * Generates an embedding for a new option statement
 * This enables fast vector-based similarity search
 */
async function generateEmbeddingForStatement(statement: Statement): Promise<void> {
	try {
		// Only generate embeddings for options with valid text
		if (!statement.statement || statement.statement.trim().length < 3) {
			logger.info(`Skipping embedding for statement ${statement.statementId} - text too short`);

			return;
		}

		// Get parent statement for context
		const parentId = statement.parentId;
		if (!parentId || parentId === 'top') {
			logger.info(`Skipping embedding for statement ${statement.statementId} - no parent context`);

			return;
		}

		// If a concurrent path (the live-synth onCreate trigger) already
		// produced and saved the embedding for this statement, skip the
		// OpenAI call. The cache is one doc per statement
		// (statementEmbeddings/{id}), so a single point-read is enough to detect.
		const existing = await embeddingCache.getBatchEmbeddings([statement.statementId]);
		const cached = existing.get(statement.statementId);
		if (cached && cached.length > 0) {
			logger.info(
				`Skipping embedding for statement ${statement.statementId} - already cached by another path`,
			);

			return;
		}

		const parentDoc = await db.collection(Collections.statements).doc(parentId).get();

		if (!parentDoc.exists) {
			logger.warn(`Parent statement ${parentId} not found for embedding context`);

			return;
		}

		const parentStatement = parentDoc.data() as Statement;
		const context = parentStatement.statement || '';

		// Generate context-aware embedding
		const startTime = Date.now();
		const result = await embeddingService.generateEmbeddingWithRetry(
			statement.statement,
			context,
			3,
			{
				parentId,
			},
		);

		// Save the embedding to statementEmbeddings/{id} (text passed so textHash
		// is written for the synthesis verdict cache; brief stored for debugging).
		// NOTE: this never changes statement.statement — only embedding fields.
		await embeddingCache.saveEmbedding(
			statement.statementId,
			result.embedding,
			context,
			statement.statement,
			result.brief,
			result.model,
		);

		const duration = Date.now() - startTime;
		logger.info(`Generated embedding for statement ${statement.statementId}`, {
			durationMs: duration,
			dimensions: result.dimensions,
			hasContext: Boolean(context),
		});

		// Generate initial hybrid embedding if hybrid clustering is enabled
		// Fetch top parent for setting inheritance check
		let topParent: Statement | undefined;
		if (parentStatement.topParentId && parentStatement.topParentId !== parentId) {
			const topDoc = await db
				.collection(Collections.statements)
				.doc(parentStatement.topParentId)
				.get();
			if (topDoc.exists) {
				topParent = topDoc.data() as Statement;
			}
		}

		if (isHybridClusteringEnabled(parentStatement, topParent)) {
			const ratingVec = [0, 0, 0, 0, 0, 0, 0, 0];
			const hybridVec = computeHybridVector(result.embedding, ratingVec, 0);
			await saveHybridEmbedding(statement.statementId, hybridVec);
			logger.info(`Generated initial hybrid embedding for statement ${statement.statementId}`);
		}
	} catch (error) {
		// Log but don't fail the trigger - embedding generation is non-critical
		logger.error(`Failed to generate embedding for statement ${statement.statementId}:`, error);
	}
}

/**
 * Splits a multi-line statement into title + paragraph children.
 * - First line becomes the parent's `statement` (title).
 * - Each remaining non-empty line becomes a child Statement with statementType 'paragraph'.
 * - A `description` (~200 chars) is auto-generated on the parent from the children.
 * - Skips if the statement text contains no newlines (single-line).
 */
async function splitStatementIntoParagraphs(statement: Statement): Promise<void> {
	try {
		// Agora proposals are short free-text answers typed into a textarea during
		// a live lesson, and the game renders `statement` verbatim — it never reads
		// paragraph children. Splitting one would visibly delete every line after
		// the first from the student's screen moments after they submitted it.
		if (statement.sourceApp === SourceApp.AGORA) return;

		const text = statement.statement;

		// Only split if there are newlines
		if (!text.includes('\n')) return;

		const lines = text.split('\n');
		const title = lines[0].trim();
		const bodyLines = lines.slice(1).filter((line) => line.trim());

		// Nothing to split if no body lines
		if (bodyLines.length === 0) return;

		if (!title) {
			logger.warn(`Statement ${statement.statementId} has no title after split, skipping`);

			return;
		}

		const now = Date.now();
		const batch = db.batch();

		// Create child paragraph statements
		const childrenData: { statement: string; createdAt: number }[] = [];

		for (let i = 0; i < bodyLines.length; i++) {
			const lineText = bodyLines[i].trim();
			if (!lineText) continue;

			const childId = getRandomUID();
			const childCreatedAt = now + i; // preserves order

			const childStatement: Record<string, unknown> = {
				statementId: childId,
				statement: lineText,
				statementType: StatementType.paragraph,
				parentId: statement.statementId,
				topParentId: statement.topParentId,
				parents: [...(statement.parents || []), statement.statementId],
				creatorId: statement.creatorId,
				creator: statement.creator,
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			};

			const childRef = db.collection(Collections.statements).doc(childId);
			batch.set(childRef, childStatement);

			childrenData.push({ statement: lineText, createdAt: childCreatedAt });
		}

		// Generate description from children
		const description = generateDescriptionFromChildren(childrenData);

		// Update parent: set title to first line, add description
		const parentRef = db.collection(Collections.statements).doc(statement.statementId);
		batch.update(parentRef, {
			statement: title,
			description,
		});

		await batch.commit();

		logger.info(
			`Split statement ${statement.statementId} into title + ${childrenData.length} paragraph children`,
		);
	} catch (error) {
		logger.error(`Error splitting statement ${statement.statementId} into paragraphs:`, error);
		throw error;
	}
}
