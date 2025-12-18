import { Request, Response } from "firebase-functions/v1";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
	Collections,
	StatementType,
	Paragraph,
	ParagraphType,
} from "@freedi/shared-types";
import { mergeAndReorganizeParagraphs, ParagraphForMerge } from "./services/ai-service";
import { generateParagraphId } from "./helpers";

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
 * 3. Update target statement with merged paragraphs and new title
 * 4. Create +1 evaluation for the user on the target statement
 * 5. Update counters
 */
export async function mergeStatements(
	request: Request,
	response: Response
): Promise<void> {
	const startTime = Date.now();

	try {
		const {
			targetStatementId,
			newContent,
			questionId,
			userId,
			userName,
		}: MergeRequest = request.body;

		// Validate required fields
		if (!targetStatementId || !newContent || !questionId || !userId) {
			response.status(400).send({
				ok: false,
				error: "Missing required fields: targetStatementId, newContent, questionId, userId",
			});

			return;
		}

		logger.info("mergeStatements request", {
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
				error: "Target statement not found",
			});

			return;
		}

		if (!questionDoc.exists) {
			response.status(404).send({
				ok: false,
				error: "Question not found",
			});

			return;
		}

		const targetStatement = targetDoc.data();
		const questionData = questionDoc.data();

		if (!targetStatement || !questionData) {
			response.status(500).send({
				ok: false,
				error: "Failed to read statement data",
			});

			return;
		}

		// 2. Create hidden statement for the user's original input (audit trail)
		const hiddenStatementRef = db.collection(Collections.statements).doc();
		const now = Date.now();

		const hiddenStatement = {
			statementId: hiddenStatementRef.id,
			statement: newContent.substring(0, 100) + (newContent.length > 100 ? "..." : ""),
			paragraphs: [{
				paragraphId: generateParagraphId(),
				type: ParagraphType.paragraph,
				content: newContent,
				order: 0,
			}],
			statementType: StatementType.option,
			parentId: questionId,
			topParentId: questionData.topParentId || questionId,
			creatorId: userId,
			creator: {
				uid: userId,
				displayName: userName || `Anonymous-${userId.substring(0, 6)}`,
				email: "",
				photoURL: "",
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
			})
		);

		// If no paragraphs, create one from the statement text
		if (existingParagraphs.length === 0 && targetStatement.statement) {
			existingParagraphs.push({
				content: targetStatement.statement,
				sourceStatementId: targetStatement.statementId,
			});
		}

		// 4. Use AI to merge and reorganize paragraphs
		const questionContext = questionData.statement || "";
		const mergeResult = await mergeAndReorganizeParagraphs(
			existingParagraphs,
			newContent,
			hiddenStatementRef.id, // Use the hidden statement ID as source
			questionContext
		);

		logger.info("AI merge result", {
			paragraphCount: mergeResult.paragraphs.length,
			newTitle: mergeResult.newTitle.substring(0, 50),
		});

		// 5. Convert merged paragraphs to proper Paragraph format
		const mergedParagraphs: Paragraph[] = mergeResult.paragraphs.map((p, index) => ({
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: p.content,
			order: index,
			sourceStatementId: p.sourceStatementId ?? undefined,
		}));

		// 6. Check if user already has an evaluation on target
		const existingEvalQuery = await db
			.collection(Collections.evaluations)
			.where("statementId", "==", targetStatementId)
			.where("evaluatorId", "==", userId)
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
				statement: mergeResult.newTitle,
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
		logger.info("mergeStatements completed", {
			responseTime: totalTime,
			targetStatementId,
			hiddenStatementId: hiddenStatementRef.id,
			newTitle: mergeResult.newTitle.substring(0, 50),
		});

		const responseData: MergeResponse = {
			ok: true,
			statementId: targetStatementId,
			mergedStatementId: hiddenStatementRef.id,
			newTitle: mergeResult.newTitle,
		};

		response.status(200).send(responseData);
	} catch (error) {
		const errorTime = Date.now() - startTime;
		logger.error("Error in mergeStatements:", {
			error,
			responseTime: errorTime,
		});

		response.status(500).send({
			ok: false,
			error: "Internal server error",
		});
	}
}
