/**
 * Data Export Types
 *
 * Types for exporting statement data in JSON and CSV formats.
 * IMPORTANT: All exports are anonymized - no personal data (names, user IDs) is included.
 */

import {
	Statement,
	StatementEvaluation,
	Paragraph,
} from '@freedi/shared-types';

/**
 * Anonymized version of SimpleStatement - removes all personal data
 * Used for exports to ensure privacy
 */
export interface AnonymizedSimpleStatement {
	statementId: string;
	statement: string;
	paragraphs?: Paragraph[];
	parentId: string;
	consensus: number;
	lastUpdate?: number;
	createdAt?: number;
	voted?: number;
	// NOTE: creator and creatorId are intentionally excluded for privacy
}

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
 * IMPORTANT: This interface is designed to be privacy-preserving.
 * No personal data (creator names, user IDs, joined users) is included.
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
	topVotedOption?: AnonymizedSimpleStatement;
	selections?: unknown;
	isSelected?: boolean;
	voted?: number;
	isVoted?: boolean;
	results?: AnonymizedSimpleStatement[];
	totalEvaluators?: number;
	isChosen?: boolean;
	chosenSolutions?: string[];
	summary?: string;
	evaluation?: StatementEvaluation;
	// NOTE: 'joined' (Creator[]) is intentionally excluded for privacy - it contains user names
	// NOTE: 'creator' and 'creatorId' are intentionally excluded for privacy
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
 * Anonymize a SimpleStatement by removing personal data (creator info)
 */
function anonymizeSimpleStatement(
	simple: { statementId: string; statement: string; paragraphs?: Paragraph[]; parentId: string; consensus: number; lastUpdate?: number; createdAt?: number; voted?: number } | undefined
): AnonymizedSimpleStatement | undefined {
	if (!simple) return undefined;

	return {
		statementId: simple.statementId,
		statement: simple.statement,
		paragraphs: simple.paragraphs,
		parentId: simple.parentId,
		consensus: simple.consensus,
		lastUpdate: simple.lastUpdate,
		createdAt: simple.createdAt,
		voted: simple.voted,
		// NOTE: creator and creatorId are intentionally excluded
	};
}

/**
 * Extract exportable data from a Statement
 * IMPORTANT: This function anonymizes all data - no personal information is exported.
 * Creator names, user IDs, and joined users are stripped from the export.
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
		// Anonymize topVotedOption - remove creator info
		topVotedOption: anonymizeSimpleStatement(statement.topVotedOption),
		selections: statement.selections,
		isSelected: statement.isSelected,
		voted: statement.voted,
		isVoted: statement.isVoted,
		// Anonymize results - remove creator info from each
		results: statement.results?.map(anonymizeSimpleStatement).filter((r): r is AnonymizedSimpleStatement => r !== undefined),
		totalEvaluators: statement.totalEvaluators,
		isChosen: statement.isChosen,
		chosenSolutions: statement.chosenSolutions,
		summary: statement.summary,
		evaluation: statement.evaluation,
		// NOTE: 'joined' is intentionally NOT exported - it contains user names/IDs
		hide: statement.hide,
		anchored: statement.anchored,
	};
}
