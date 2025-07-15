import { Statement } from "delib-npm";

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
