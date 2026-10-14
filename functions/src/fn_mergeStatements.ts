import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	StatementType,
	Paragraph,
	ParagraphType,
	ResearchAction,
	getResearchLogId,
	isMeaningfulSuggestion,
	MIN_MEANINGFUL_WORDS,
} from '@freedi/shared-types';
import { mergeAndReorganizeParagraphs, ParagraphForMerge } from './services/ai-service';
import { generateParagraphId } from './helpers';

interface MergeRequest {
	/** ID of the target statement to merge into */
	targetStatementId: string;
	/** The new content to merge */
	newContent: string;
	/** ID of the question/parent */
	questionId: string;
	/** User ID of the person submitting */
	userId: string;
	/** Optional: User's display name */
	userName?: string;
}

interface MergeResponse {
	ok: boolean;
	/** The merged statement ID */
	statementId?: string;
	/** The hidden (merged) statement ID */
	mergedStatementId?: string;
	/** New title after merge */
	newTitle?: string;
	/** Error message if failed */
	error?: string;
}

/**
 * Cloud Function to merge a new suggestion into an existing statement.
 *
 * Flow:
 * 1. Create a hidden statement for the user's original input (for audit trail)
 * 2. Use AI to reorganize paragraphs of target + new content
 * 3. Update target statement with merged paragraphs (the title stays)
 * 4. Create +1 evaluation for the user on the target statement
 * 5. Update counters
 */
export async function mergeStatements(request: Request, response: Response): Promise<void> {
	const startTime = Date.now();

	try {
		const { targetStatementId, newContent, questionId, userId, userName }: MergeRequest =
			request.body;

		// Validate required fields
		if (!targetStatementId || !newContent || !questionId || !userId) {
			response.status(400).send({
				ok: false,
				error: 'Missing required fields: targetStatementId, newContent, questionId, userId',
			});

			return;
		}

		// Keyboard noise ("ייי") must never be merged into someone's option
		if (!isMeaningfulSuggestion(newContent)) {
			response.status(400).send({
				ok: false,
				error: `Suggestion must have at least ${MIN_MEANINGFUL_WORDS} real words`,
			});

			return;
		}

		logger.info('mergeStatements request', {
			targetStatementId,
			questionId,
			userId,
			contentLength: newContent.length,
		});

		const db = getFirestore();

		// 1. Fetch target statement and question in parallel
		const [targetDoc, questionDoc] = await Promise.all([
			db.collection(Collections.statements).doc(targetStatementId).get(),
			db.collection(Collections.statements).doc(questionId).get(),
		]);

		if (!targetDoc.exists) {
			response.status(404).send({
				ok: false,
				error: 'Target statement not found',
			});

			return;
		}

		if (!questionDoc.exists) {
			response.status(404).send({
				ok: false,
				error: 'Question not found',
			});

			return;
		}

		const targetStatement = targetDoc.data();
		const questionData = questionDoc.data();

		if (!targetStatement || !questionData) {
			response.status(500).send({
				ok: false,
				error: 'Failed to read statement data',
			});

			return;
		}

		// 2. Create hidden statement for the user's original input (audit trail)
		const hiddenStatementRef = db.collection(Collections.statements).doc();
		const now = Date.now();

		const hiddenStatement = {
			statementId: hiddenStatementRef.id,
			statement: newContent.substring(0, 100) + (newContent.length > 100 ? '...' : ''),
			paragraphs: [
				{
					paragraphId: generateParagraphId(),
					type: ParagraphType.paragraph,
					content: newContent,
					order: 0,
				},
			],
			statementType: StatementType.option,
			parentId: questionId,
			topParentId: questionData.topParentId || questionId,
			creatorId: userId,
			creator: {
				uid: userId,
				displayName: userName || `Anonymous-${userId.substring(0, 6)}`,
				email: '',
				photoURL: '',
				isAnonymous: true,
			},
			createdAt: now,
			lastUpdate: now,
			consensus: 0,
			hide: true, // Hidden - merged into target
			mergedInto: targetStatementId, // Link to the target statement
		};

		// 3. Prepare existing paragraphs for merge
		const existingParagraphs: ParagraphForMerge[] = (targetStatement.paragraphs || []).map(
			(p: Paragraph) => ({
				content: p.content,
				sourceStatementId: p.sourceStatementId ?? undefined,
			}),
		);

		// 4. Use AI to merge the body lines. The title stays: people already
		// rated this option, and a merge must not change what they rated.
		const targetTitle: string = targetStatement.statement || '';
		const questionContext = questionData.statement || '';
		const mergeResult = await mergeAndReorganizeParagraphs(
			existingParagraphs,
			newContent,
			hiddenStatementRef.id, // Use the hidden statement ID as source
			questionContext,
			targetTitle,
		);

		logger.info('AI merge result', {
			paragraphCount: mergeResult.paragraphs.length,
		});

		// 5. Convert merged paragraphs to proper Paragraph format
		const mergedParagraphs: Paragraph[] = mergeResult.paragraphs.map((p, index) => {
			const paragraph: Paragraph = {
				paragraphId: generateParagraphId(),
				type: ParagraphType.paragraph,
				content: p.content,
				order: index,
			};
			if (p.sourceStatementId) {
				paragraph.sourceStatementId = p.sourceStatementId;
			}

			return paragraph;
		});

		// 6. Check if user already has an evaluation on target
		const existingEvalQuery = await db
			.collection(Collections.evaluations)
			.where('statementId', '==', targetStatementId)
			.where('evaluatorId', '==', userId)
			.limit(1)
			.get();

		const hasExistingEval = !existingEvalQuery.empty;

		// 7. Execute all updates in a transaction
		await db.runTransaction(async (transaction) => {
			// Create hidden statement
			transaction.set(hiddenStatementRef, hiddenStatement);

			// Update target statement
			const targetRef = db.collection(Collections.statements).doc(targetStatementId);
			transaction.update(targetRef, {
				paragraphs: mergedParagraphs,
				lastUpdate: now,
				// Increment contributor count if this is a new contributor
				...(!hasExistingEval && {
					consensus: FieldValue.increment(1),
					evaluations: FieldValue.increment(1),
				}),
			});

			// Create evaluation if user hasn't voted on this yet
			if (!hasExistingEval) {
				const evaluationRef = db.collection(Collections.evaluations).doc();
				transaction.set(evaluationRef, {
					evaluationId: evaluationRef.id,
					statementId: targetStatementId,
					parentId: questionId,
					evaluatorId: userId,
					evaluation: 1, // +1 for agreement
					createdAt: now,
					lastUpdate: now,
				});
			}

			// Update question counters
			const questionRef = db.collection(Collections.statements).doc(questionId);
			transaction.update(questionRef, {
				suggestions: FieldValue.increment(1),
				lastUpdate: now,
			});
		});

		const totalTime = Date.now() - startTime;
		logger.info('mergeStatements completed', {
			responseTime: totalTime,
			targetStatementId,
			hiddenStatementId: hiddenStatementRef.id,
		});

		// Research logging (non-blocking)
		const topParentId = questionData.topParentId || questionId;
		const researchEnabled = questionData.statementSettings?.enableResearchLogging === true;
		if (researchEnabled) {
			const timestamp = Date.now();
			const logId = getResearchLogId(userId, timestamp);
			db.collection(Collections.researchLogs)
				.doc(logId)
				.set({
					logId,
					userId,
					action: ResearchAction.CREATE_STATEMENT,
					timestamp,
					sourceApp: 'mass-consensus',
					statementId: hiddenStatementRef.id,
					parentId: questionId,
					topParentId,
					metadata: { mergedInto: targetStatementId },
				})
				.catch((err: Error) => {
					logger.error('Research log failed:', err.message);
				});
		}

		const responseData: MergeResponse = {
			ok: true,
			statementId: targetStatementId,
			mergedStatementId: hiddenStatementRef.id,
			newTitle: targetTitle,
		};

		response.status(200).send(responseData);
	} catch (error) {
		const errorTime = Date.now() - startTime;
		// Properly serialize error for logging (some error types don't serialize with { error })
		const errorDetails =
			error instanceof Error
				? { message: error.message, stack: error.stack, name: error.name }
				: { message: String(error) };

		logger.error('Error in mergeStatements:', {
			...errorDetails,
			responseTime: errorTime,
		});

		response.status(500).send({
			ok: false,
			error: 'Internal server error',
		});
	}
}
