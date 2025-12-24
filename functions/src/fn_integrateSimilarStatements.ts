import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Statement, Collections, StatementType, Role, functionConfig } from "@freedi/shared-types";
import { logger } from "firebase-functions";
import {
	findSimilarAndGenerateSuggestion,
	mapStatementToWithEvaluation,
	StatementWithEvaluation,
} from "./services/integration-ai-service";
import { migrateEvaluationsToNewStatement } from "./fn_evaluation";
import { textToParagraphs } from "./helpers";
import { ALLOWED_ORIGINS } from "./config/cors";

/**
 * Request type for finding similar statements for integration
 */
interface FindSimilarForIntegrationRequest {
	statementId: string;
}

/**
 * Response type for finding similar statements for integration
 */
interface FindSimilarForIntegrationResponse {
	sourceStatement: StatementWithEvaluation;
	similarStatements: StatementWithEvaluation[];
	suggestedTitle?: string;
	suggestedDescription?: string;
}

/**
 * Request type for executing integration
 */
interface ExecuteIntegrationRequest {
	parentStatementId: string;
	selectedStatementIds: string[];
	integratedTitle: string;
	integratedDescription: string;
}

/**
 * Response type for executing integration
 */
interface ExecuteIntegrationResponse {
	success: boolean;
	newStatementId: string;
	migratedEvaluationsCount: number;
	hiddenStatementsCount: number;
}

/**
 * Firebase callable function to find similar statements for integration
 * Admin only - finds statements similar to the selected one
 */
export const findSimilarForIntegration = onCall<FindSimilarForIntegrationRequest>(
	{
		timeoutSeconds: 120,
		memory: "512MiB",
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS]
	},
	async (request): Promise<FindSimilarForIntegrationResponse> => {
		const { statementId } = request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!statementId) {
			throw new HttpsError("invalid-argument", "Statement ID is required");
		}

		const db = getFirestore();

		// 1. Fetch source statement first (needed for subsequent queries)
		const sourceDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!sourceDoc.exists) {
			throw new HttpsError("not-found", "Statement not found");
		}
		const sourceStatement = sourceDoc.data() as Statement;
		const parentId = sourceStatement.parentId;
		const topParentId = sourceStatement.topParentId || parentId;

		// 2. PARALLEL: Fetch admin check, parent, and siblings simultaneously
		const [membersSnapshot, parentDoc, siblingsSnapshot] = await Promise.all([
			db.collection(Collections.statementsSubscribe)
				.where("statementId", "==", topParentId)
				.where("userId", "==", userId)
				.where("role", "in", [Role.admin, "creator", "admin"])
				.limit(1)
				.get(),
			db.collection(Collections.statements).doc(parentId).get(),
			db.collection(Collections.statements)
				.where("parentId", "==", parentId)
				.where("statementType", "==", StatementType.option)
				.get(),
		]);

		const isAdmin = !membersSnapshot.empty;
		const isCreator = sourceStatement.creatorId === userId;

		if (!isAdmin && !isCreator) {
			throw new HttpsError("permission-denied", "Only admins can integrate suggestions");
		}

		const parentStatement = parentDoc.exists ? (parentDoc.data() as Statement) : null;
		const questionContext = parentStatement?.statement || "";
		const allSiblings = siblingsSnapshot.docs.map((doc) => doc.data() as Statement);

		logger.info(`Found ${allSiblings.length} sibling statements for integration check`);

		// 3. SINGLE AI CALL: Find similar AND generate suggestion in one request
		const result = await findSimilarAndGenerateSuggestion(
			sourceStatement,
			allSiblings,
			questionContext
		);

		return {
			sourceStatement: mapStatementToWithEvaluation(sourceStatement),
			similarStatements: result.similarStatements,
			suggestedTitle: result.suggestedTitle,
			suggestedDescription: result.suggestedDescription,
		};
	}
);

/**
 * Firebase callable function to execute integration of similar statements
 * Creates new integrated statement, migrates evaluations, hides originals
 */
export const executeIntegration = onCall<ExecuteIntegrationRequest>(
	{
		timeoutSeconds: 120, // May take longer with many evaluations to migrate
		memory: "512MiB",
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS]
	},
	async (request): Promise<ExecuteIntegrationResponse> => {
		const { parentStatementId, selectedStatementIds, integratedTitle, integratedDescription } =
			request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!parentStatementId || !selectedStatementIds || selectedStatementIds.length === 0) {
			throw new HttpsError("invalid-argument", "Parent ID and selected statement IDs are required");
		}

		if (!integratedTitle || integratedTitle.trim().length === 0) {
			throw new HttpsError("invalid-argument", "Integrated title is required");
		}

		const db = getFirestore();

		// 1. Fetch parent statement
		const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
		if (!parentDoc.exists) {
			throw new HttpsError("not-found", "Parent statement not found");
		}
		const parentStatement = parentDoc.data() as Statement;

		// 2. Check admin permissions
		const topParentId = parentStatement.topParentId || parentStatementId;

		const membersSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where("statementId", "==", topParentId)
			.where("userId", "==", userId)
			.where("role", "in", [Role.admin, "creator", "admin"])
			.limit(1)
			.get();

		if (membersSnapshot.empty) {
			throw new HttpsError("permission-denied", "Only admins can execute integration");
		}

		// 3. Fetch all selected statements to verify they exist
		const selectedStatements: Statement[] = [];
		for (const id of selectedStatementIds) {
			const doc = await db.collection(Collections.statements).doc(id).get();
			if (doc.exists) {
				selectedStatements.push(doc.data() as Statement);
			}
		}

		if (selectedStatements.length === 0) {
			throw new HttpsError("not-found", "No valid statements found to integrate");
		}

		logger.info(`Integrating ${selectedStatements.length} statements`);

		// 4. Create new integrated statement
		const newStatementId = db.collection(Collections.statements).doc().id;
		const now = Date.now();

		// Get creator info from the user who initiated integration (admin)
		const adminDoc = await db.collection(Collections.users).doc(userId).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;

		const newStatement: Statement = {
			statementId: newStatementId,
			statement: integratedTitle.trim(),
			paragraphs: textToParagraphs(integratedDescription?.trim() || ""),
			statementType: StatementType.option,
			parentId: parentStatementId,
			topParentId: topParentId,
			creatorId: userId,
			creator: {
				displayName: adminData?.displayName || "Admin",
				uid: userId,
				defaultLanguage: adminData?.defaultLanguage || "en",
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
			integratedOptions: selectedStatementIds, // Source statement IDs that were merged
		};

		// 6. Create the new statement in Firestore
		await db.collection(Collections.statements).doc(newStatementId).set(newStatement);
		logger.info(`Created new integrated statement: ${newStatementId}`);

		// 7. Migrate evaluations from all selected statements to the new one
		let migratedCount = 0;
		try {
			const migrationResult = await migrateEvaluationsToNewStatement(
				selectedStatementIds,
				newStatementId,
				parentStatementId
			);
			migratedCount = migrationResult.migratedCount;
			logger.info(`Migrated ${migratedCount} evaluations`);
		} catch (error) {
			logger.error("Error migrating evaluations:", error);
			// Continue even if migration fails - we can recalculate later
		}

		// 8. Hide the original statements
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
		logger.info(`Hid ${selectedStatements.length} original statements`);

		// 9. Update parent statement's lastChildUpdate
		await db.collection(Collections.statements).doc(parentStatementId).update({
			lastChildUpdate: now,
			lastUpdate: now,
		});

		return {
			success: true,
			newStatementId,
			migratedEvaluationsCount: migratedCount,
			hiddenStatementsCount: selectedStatements.length,
		};
	}
);
