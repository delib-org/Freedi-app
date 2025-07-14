// Import types from delib-npm package
import { Collections, StatementType, Statement } from "delib-npm";

// Re-export for use in other modules
export { Collections, StatementType, Statement };

export interface StatementSimple {
	statement: string;
	id: string;
}

export interface FindSimilarStatementsRequest {
	statementId: string;
	userInput: string;
	creatorId: string;
	generateIfNeeded?: boolean;
}

export interface FindSimilarStatementsResponse {
	similarStatements?: Statement[];
	similarTexts?: string[];
	userText: string;
	ok: boolean;
	error?: string;
}
