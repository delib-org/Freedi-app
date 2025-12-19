/**
 * Data Export Types
 *
 * Types for exporting statement data in JSON and CSV formats.
 */

import {
	Statement,
	StatementEvaluation,
	SimpleStatement,
	Paragraph,
	Creator,
} from '@freedi/shared-types';

/**
 * PopperHebbianScore type - extracted from Statement since not exported from shared-types
 */
export interface PopperHebbianScore {
	totalScore: number;
	corroborationLevel: number;
	evidenceCount?: number;
	status?: string;
}

/**
 * Properties included in data export - subset of Statement for export purposes
 */
export interface ExportableStatementData {
	statement: string;
	description?: string;
	paragraphs?: Paragraph[];
	statementId: string;
	parentId: string;
	topParentId: string;
	createdAt: number;
	lastUpdate: number;
	pro?: number;
	con?: number;
	consensus: number;
	consensusValid?: number;
	PopperHebbianScore?: PopperHebbianScore;
	order?: number;
	votes?: number;
	topVotedOption?: SimpleStatement;
	selections?: unknown;
	isSelected?: boolean;
	voted?: number;
	isVoted?: boolean;
	results?: SimpleStatement[];
	totalEvaluators?: number;
	isChosen?: boolean;
	chosenSolutions?: string[];
	summary?: string;
	evaluation?: StatementEvaluation;
	joined?: Creator[];
	hide?: boolean;
	anchored?: boolean;
}

/**
 * Full export data structure with schema and metadata
 */
export interface ExportData {
	_schema: PropertyDocumentation;
	exportMetadata: ExportMetadata;
	mainStatement: ExportableStatementData;
	subStatements: ExportableStatementData[];
}

/**
 * Metadata about the export
 */
export interface ExportMetadata {
	exportedAt: string;
	exportFormat: ExportFormat;
	appVersion: string;
	totalRecords: number;
}

/**
 * Documentation for a single property
 */
export interface PropertyDoc {
	type: string;
	description: string;
	example?: string | number | boolean;
}

/**
 * Collection of property documentation
 */
export interface PropertyDocumentation {
	[key: string]: PropertyDoc;
}

/**
 * Supported export formats
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Extract exportable data from a Statement
 */
export function extractExportableData(
	statement: Statement
): ExportableStatementData {
	return {
		statement: statement.statement,
		description: statement.paragraphs?.[0]?.content,
		paragraphs: statement.paragraphs,
		statementId: statement.statementId,
		parentId: statement.parentId,
		topParentId: statement.topParentId,
		createdAt: statement.createdAt,
		lastUpdate: statement.lastUpdate,
		pro: statement.pro,
		con: statement.con,
		consensus: statement.consensus,
		consensusValid: statement.consensusValid,
		PopperHebbianScore: statement.PopperHebbianScore,
		order: statement.order,
		votes: statement.votes,
		topVotedOption: statement.topVotedOption,
		selections: statement.selections,
		isSelected: statement.isSelected,
		voted: statement.voted,
		isVoted: statement.isVoted,
		results: statement.results,
		totalEvaluators: statement.totalEvaluators,
		isChosen: statement.isChosen,
		chosenSolutions: statement.chosenSolutions,
		summary: statement.summary,
		evaluation: statement.evaluation,
		joined: statement.joined,
		hide: statement.hide,
		anchored: statement.anchored,
	};
}
