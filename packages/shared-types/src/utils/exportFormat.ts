/**
 * Data export format: types, property documentation and the pure row builder.
 * Shared by the main app (file creation) and the `fullExport` callable (server read).
 * IMPORTANT: All exports are anonymized - no personal data (names, user IDs) is included.
 */

import type { Statement } from '../models/statement/StatementTypes';
import type { StatementEvaluation } from '../models/evaluation/Evaluation';
import type { Paragraph } from '../models/paragraph/paragraphModel';
import type { PopperHebbianScore } from '../models/popper/popperTypes';
import { isDerivedStatement, resolveDerivedPipeline } from './derivedStatement';
import { computeOtherIdeas, OTHER_IDEAS_EXPORT_ID } from './otherIdeas';

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
	// Pro/Con evaluator statistics
	numberOfProEvaluators?: number; // count of evaluators who gave positive evaluations
	numberOfConEvaluators?: number; // count of evaluators who gave negative evaluations
	averagePro?: number; // average of positive evaluations (sumPro / numberOfProEvaluators)
	averageCon?: number; // average of negative evaluations (sumCon / numberOfConEvaluators)
	isChosen?: boolean;
	chosenSolutions?: string[];
	summary?: string;
	evaluation?: StatementEvaluation;
	// NOTE: 'joined' (Creator[]) is intentionally excluded for privacy - it contains user names
	// NOTE: 'creator' and 'creatorId' are intentionally excluded for privacy
	hide?: boolean;
	anchored?: boolean;
	/** True when produced by the clustering/synthesis pipeline rather than submitted by a participant */
	isDerived: boolean;
	/** True when the statement is a cluster container grouping other statements */
	isCluster?: boolean;
	/** Which pipeline produced it, when derived */
	derivedByPipeline?: 'topic-cluster' | 'synthesis' | 'unknown-cluster';
	/** IDs of the source statements merged into this one, when derived */
	integratedOptions?: string[];
	/**
	 * Theme the idea sits in (theme statementId), or 'other-ideas' for an idea no theme holds.
	 * Empty for theme rows, synthesis members, and every row when the question has no theme.
	 */
	themeId?: string;
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
	/** 'server' when every child was read from Firestore by the fullExport callable */
	source?: 'server';
	/** True when hidden statements are part of the export (flagged with hide: true) */
	includesHidden?: boolean;
	/** Theme containers left out because they hold no ideas */
	skippedEmptyThemes?: number;
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

/** Counts the fullExport callable reports about what it read. */
export interface FullExportMeta {
	/** Sub-statements returned (hidden ones included) */
	total: number;
	/** How many of them carry hide: true */
	hiddenCount: number;
	/** Theme containers left out because they hold no ideas */
	skippedEmptyThemes: number;
	/** Epoch ms of the server read */
	exportedAt: number;
}

/** Response of the fullExport callable. */
export interface FullExportResponse {
	mainStatement: ExportableStatementData;
	subStatements: ExportableStatementData[];
	meta: FullExportMeta;
}

/** Request of the fullExport callable. */
export interface FullExportRequest {
	statementId: string;
}

/**
 * Anonymize a SimpleStatement by removing personal data (creator info)
 */
export function anonymizeSimpleStatement(
	simple:
		| {
				statementId: string;
				statement: string;
				paragraphs?: Paragraph[];
				parentId: string;
				consensus: number;
				lastUpdate?: number;
				createdAt?: number;
				voted?: number;
				evaluation?: { agreement?: number };
		  }
		| undefined,
): AnonymizedSimpleStatement | undefined {
	if (!simple) return undefined;

	return {
		statementId: simple.statementId,
		statement: simple.statement,
		paragraphs: simple.paragraphs,
		parentId: simple.parentId,
		// Use evaluation.agreement when available, fallback to consensus for legacy data
		consensus: simple.evaluation?.agreement ?? simple.consensus,
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
export function extractExportableData(statement: Statement): ExportableStatementData {
	// Calculate averages for pro and con evaluations
	const evaluation = statement.evaluation;
	const numberOfProEvaluators = evaluation?.numberOfProEvaluators ?? 0;
	const numberOfConEvaluators = evaluation?.numberOfConEvaluators ?? 0;
	const sumPro = evaluation?.sumPro ?? 0;
	const sumCon = evaluation?.sumCon ?? 0;

	// Calculate average pro (only if there are pro evaluators)
	const averagePro = numberOfProEvaluators > 0 ? sumPro / numberOfProEvaluators : undefined;
	// Calculate average con (only if there are con evaluators)
	const averageCon = numberOfConEvaluators > 0 ? sumCon / numberOfConEvaluators : undefined;

	const derived = isDerivedStatement(statement);

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
		// Use evaluation.agreement when available, fallback to consensus for legacy data
		consensus: statement.evaluation?.agreement ?? statement.consensus ?? 0,
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
		results: statement.results
			?.map(anonymizeSimpleStatement)
			.filter((r): r is AnonymizedSimpleStatement => r !== undefined),
		totalEvaluators: statement.totalEvaluators,
		// Pro/Con evaluator statistics
		numberOfProEvaluators: numberOfProEvaluators || undefined,
		numberOfConEvaluators: numberOfConEvaluators || undefined,
		averagePro,
		averageCon,
		isChosen: statement.isChosen,
		chosenSolutions: statement.chosenSolutions,
		summary: statement.summary,
		evaluation: statement.evaluation,
		// NOTE: 'joined' is intentionally NOT exported - it contains user names/IDs
		hide: statement.hide,
		anchored: statement.anchored,
		isDerived: derived,
		isCluster: statement.isCluster,
		derivedByPipeline: derived ? resolveDerivedPipeline(statement) : undefined,
		integratedOptions: derived ? statement.integratedOptions : undefined,
	};
}

/**
 * Property documentation for schema/comments
 */
export const PROPERTY_DOCUMENTATION: PropertyDocumentation = {
	statement: {
		type: 'string',
		description: 'Main text/title of the statement',
		example: 'What is the best solution for climate change?',
	},
	description: {
		type: 'string',
		description: 'Optional detailed description of the statement',
	},
	paragraphs: {
		type: 'Paragraph[]',
		description:
			'Rich text content as array of paragraph objects with type (h1-h6, paragraph, li) and content',
	},
	statementId: {
		type: 'string',
		description: 'Unique identifier for the statement (UUID format)',
	},
	parentId: {
		type: 'string',
		description: 'ID of the direct parent statement',
	},
	topParentId: {
		type: 'string',
		description: 'ID of the root/top-level parent in the hierarchy',
	},
	createdAt: {
		type: 'number',
		description: 'Creation timestamp in milliseconds since Unix epoch',
		example: 1703001600000,
	},
	lastUpdate: {
		type: 'number',
		description: 'Last update timestamp in milliseconds since Unix epoch',
	},
	pro: {
		type: 'number',
		description: 'Number of users supporting/agreeing with this statement',
	},
	con: {
		type: 'number',
		description: 'Number of users opposing/disagreeing with this statement',
	},
	consensus: {
		type: 'number',
		description: 'Consensus score ranging from -1 (full disagreement) to 1 (full agreement)',
	},
	consensusValid: {
		type: 'number',
		description: 'Combined consensus and validity score weighted by participation',
	},
	PopperHebbianScore: {
		type: 'object',
		description:
			'Evidence-based scoring: totalScore, corroborationLevel (0-1), evidenceCount, status',
	},
	order: {
		type: 'number',
		description: 'Display order relative to sibling statements (0-based)',
	},
	votes: {
		type: 'number',
		description: 'Total number of votes cast for this statement',
	},
	topVotedOption: {
		type: 'AnonymizedSimpleStatement',
		description: 'Reference to the highest-voted child option (anonymized - no creator info)',
	},
	selections: {
		type: 'object',
		description: 'Top options selected through voting/evaluation process',
	},
	isSelected: {
		type: 'boolean',
		description: 'Whether this statement has been selected as a choice',
	},
	voted: {
		type: 'number',
		description: 'Number of votes this specific statement received',
	},
	isVoted: {
		type: 'boolean',
		description: 'True if this is the top-voted option among siblings',
	},
	results: {
		type: 'AnonymizedSimpleStatement[]',
		description:
			'Array of result statements (top performers in evaluation, anonymized - no creator info)',
	},
	totalEvaluators: {
		type: 'number',
		description: 'Count of unique users who evaluated this statement',
	},
	numberOfProEvaluators: {
		type: 'number',
		description: 'Count of evaluators who gave positive evaluations (> 0)',
	},
	numberOfConEvaluators: {
		type: 'number',
		description: 'Count of evaluators who gave negative evaluations (< 0)',
	},
	averagePro: {
		type: 'number',
		description: 'Average of positive evaluations (sumPro / numberOfProEvaluators)',
	},
	averageCon: {
		type: 'number',
		description: 'Average of negative evaluations (sumCon / numberOfConEvaluators)',
	},
	isChosen: {
		type: 'boolean',
		description: 'Whether this statement was chosen as a final solution',
	},
	chosenSolutions: {
		type: 'string[]',
		description: 'Array of statement IDs representing chosen solutions',
	},
	summary: {
		type: 'string',
		description: 'AI-generated summary of the statement and its discussions',
	},
	evaluation: {
		type: 'StatementEvaluation',
		description:
			'Evaluation metrics: sumEvaluations, agreement, numberOfEvaluators, sumPro, sumCon, numberOfProEvaluators, numberOfConEvaluators, averageEvaluation, standardDeviation',
	},
	// NOTE: 'joined' is no longer exported for privacy reasons
	hide: {
		type: 'boolean',
		description: 'Whether the statement is hidden from public view',
	},
	anchored: {
		type: 'boolean',
		description: 'Whether statement is anchored for guaranteed inclusion in evaluations',
	},
	isDerived: {
		type: 'boolean',
		description:
			'Whether this statement was generated by the AI clustering/synthesis pipeline rather than submitted by a participant',
		example: false,
	},
	isCluster: {
		type: 'boolean',
		description:
			'Whether this statement is a cluster container that groups other statements (see integratedOptions for its members)',
		example: false,
	},
	derivedByPipeline: {
		type: "'topic-cluster' | 'synthesis' | 'unknown-cluster'",
		description:
			"Which pipeline generated this statement, present only when isDerived is true. 'unknown-cluster' means the statement predates pipeline tagging",
		example: 'synthesis',
	},
	integratedOptions: {
		type: 'string[]',
		description:
			'Statement IDs of the participant submissions merged into this generated statement, present only when isDerived is true',
	},
	themeId: {
		type: 'string',
		description:
			"The theme an idea sits in (the theme's statementId), or 'other-ideas' for an idea no theme holds. Empty for theme rows, for originals merged into a synthesis, and for every row when the question has no themes",
		example: 'other-ideas',
	},
};


/**
 * Export rows with their `themeId` column. Only ideas (atoms) directly under the
 * exported statement get a value; the shared "Other ideas" rule decides which.
 */
export function toExportRows(
	main: Statement,
	children: Statement[],
): { mainStatement: ExportableStatementData; subStatements: ExportableStatementData[] } {
	const direct = children.filter((s) => s.parentId === main.statementId);
	const { hasThemes, themeIdByAtomId, otherAtoms } = computeOtherIdeas(direct);
	const otherIds = new Set(otherAtoms.map((atom) => atom.statementId));
	const themeIdFor = (statementId: string): string => {
		if (!hasThemes) return '';
		if (otherIds.has(statementId)) return OTHER_IDEAS_EXPORT_ID;

		return themeIdByAtomId.get(statementId) ?? '';
	};
	const toRow = (statement: Statement): ExportableStatementData => ({
		...extractExportableData(statement),
		themeId: themeIdFor(statement.statementId),
	});

	return { mainStatement: toRow(main), subStatements: children.map(toRow) };
}
