import { db } from ".."; // Import db from your index file
import { Collections, Statement } from "delib-npm";
import { StatementSimple } from "../types/statement-types";

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
 * Helper function to get statements from texts
 */
export function getStatementsFromTexts(
	statementSimple: StatementSimple[],
	similarStatementsAI: string[],
	subStatements: Statement[]
): Statement[] {
	const similarStatementsIds = statementSimple
		.filter((subStatement) =>
			similarStatementsAI.includes(subStatement.statement)
		)
		.map((s) => s.id);

	const statements = similarStatementsIds
		.map((id) =>
			subStatements.find((subStatement) => subStatement.statementId === id)
		)
		.filter((s) => s !== undefined) as Statement[];

	return statements;
}

/**
 * Finds and removes duplicate statement from array
 */
export function removeDuplicateStatement(
	statements: Statement[],
	userInput: string
): { statements: Statement[]; duplicateStatement: Statement | undefined } {
	const duplicateStatement = statements.find(
		(stat) => stat.statement === userInput
	);

	if (duplicateStatement) {
		const index = statements.indexOf(duplicateStatement);
		if (index !== -1) {
			statements.splice(index, 1);
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
