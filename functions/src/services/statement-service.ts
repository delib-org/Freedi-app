import { db } from ".."; // Import db from your index file
import { Collections, Statement } from "delib-npm";
import { StatementSimple } from "../types/statement-types";
import { logger } from "firebase-functions";

/**
 * Fetches a parent statement by ID
 */
export async function getParentStatement(statementId: string): Promise<Statement | null> {

	const ref = db.collection(Collections.statements);
	const parentDoc = await ref.doc(statementId).get();

	if (!parentDoc.exists) {
		return null;
	}

	return parentDoc.data() as Statement;
}

/**
 * Fetches all sub-statements for a given parent statement ID
 */
export async function getSubStatements(parentId: string): Promise<Statement[]> {
	const ref = db.collection(Collections.statements);
	const query = ref.where("parentId", "==", parentId);
	const subStatementsDB = await query.get();

	return subStatementsDB.docs.map((doc) => doc.data()) as Statement[];
}

/**
 * Filters statements by creator ID
 */
export function getUserStatements(statements: Statement[], creatorId: string): Statement[] {
	return statements.filter((s) => s.creatorId === creatorId);
}

/**
 * Converts statements to simple format for AI processing
 */
export function convertToSimpleStatements(statements: Statement[]): StatementSimple[] {
	return statements.map((statement) => ({
		statement: statement.statement,
		id: statement.statementId,
	}));
}

/**
 * Normalizes a string for comparison by removing extra whitespace and normalizing case
 */
function normalizeForComparison(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')  // Normalize whitespace
		.replace(/[""'']/g, '"')  // Normalize quotes
		.replace(/[…]/g, '...');  // Normalize ellipsis
}

/**
 * Checks if two strings are similar enough to be considered a match
 * Uses normalized comparison and checks for containment
 */
function isTextMatch(aiText: string, statementText: string): boolean {
	const normalizedAI = normalizeForComparison(aiText);
	const normalizedStatement = normalizeForComparison(statementText);

	// Exact match after normalization
	if (normalizedAI === normalizedStatement) {
		return true;
	}

	// One contains the other (AI might truncate or add context)
	if (normalizedStatement.includes(normalizedAI) || normalizedAI.includes(normalizedStatement)) {
		return true;
	}

	// Check for high similarity (at least 90% of words match)
	const aiWords = normalizedAI.split(' ').filter(w => w.length > 2);
	const statementWords = normalizedStatement.split(' ').filter(w => w.length > 2);

	if (aiWords.length > 0 && statementWords.length > 0) {
		const matchingWords = aiWords.filter(word => statementWords.includes(word));
		const matchRatio = matchingWords.length / Math.max(aiWords.length, statementWords.length);

		if (matchRatio >= 0.8) {  // 80% word match
			return true;
		}
	}

	return false;
}

/**
 * Helper function to get statements from texts
 * Uses fuzzy matching to handle AI variations in returned text
 */
export function getStatementsFromTexts(
	statementSimple: StatementSimple[],
	similarStatementsAI: string[],
	subStatements: Statement[]
): Statement[] {
	logger.info("=== getStatementsFromTexts DEBUG ===");
	logger.info(`AI returned ${similarStatementsAI.length} similar texts:`,
		similarStatementsAI.map(t => t.substring(0, 50)));
	logger.info(`Existing statements to match against: ${statementSimple.length}`);

	const similarStatementsIds = statementSimple
		.filter((subStatement) => {
			const matches = similarStatementsAI.some(aiText => {
				const isMatch = isTextMatch(aiText, subStatement.statement);
				if (isMatch) {
					logger.info(`MATCH FOUND: AI text "${aiText.substring(0, 30)}..." matches statement "${subStatement.statement.substring(0, 30)}..."`);
				}

				return isMatch;
			});

			return matches;
		})
		.map((s) => s.id);

	logger.info(`Found ${similarStatementsIds.length} matching statement IDs`);

	const statements = similarStatementsIds
		.map((id) =>
			subStatements.find((subStatement) => subStatement.statementId === id)
		)
		.filter((s) => s !== undefined) as Statement[];

	logger.info(`Returning ${statements.length} similar statements`);

	return statements;
}

/**
 * Gets statements by their IDs
 */
export function getStatementsByIds(
	statementIds: string[],
	allStatements: Statement[]
): Statement[] {
	return statementIds
		.map(id => allStatements.find(s => s.statementId === id))
		.filter((s): s is Statement => s !== undefined);
}

/**
 * Finds duplicate statement and moves it to the front of the array
 * Instead of removing duplicates, we keep them at the top so users
 * can see their exact match exists
 */
export function removeDuplicateStatement(
	statements: Statement[],
	userInput: string
): { statements: Statement[]; duplicateStatement: Statement | undefined } {
	// Find exact match (case-insensitive)
	const normalizedInput = userInput.toLowerCase().trim();
	const duplicateStatement = statements.find(
		(stat) => stat.statement.toLowerCase().trim() === normalizedInput
	);

	if (duplicateStatement) {
		// Move duplicate to the FRONT of the array instead of removing it
		// This way users see their exact match at the top
		const index = statements.indexOf(duplicateStatement);
		if (index > 0) {
			statements.splice(index, 1);
			statements.unshift(duplicateStatement);
		}
	}

	return { statements, duplicateStatement };
}

/**
 * Checks if user has reached the maximum allowed statements
 */
export function hasReachedMaxStatements(
	userStatements: Statement[],
	maxAllowed: number
): boolean {
	return userStatements.length >= maxAllowed;
}
