/**
 * Export Utilities
 *
 * Functions for exporting statement data in JSON and CSV formats.
 */

import { Statement } from '@freedi/shared-types';
import {
	ExportData,
	ExportFormat,
	PropertyDocumentation,
	extractExportableData,
} from '@/types/export';
import { logError } from '@/utils/errorHandling';

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
};

/**
 * Create JSON export with schema documentation (NOT flattened - keeps nested structure)
 */
export function createJSONExport(mainStatement: Statement, subStatements: Statement[]): string {
	const exportData: ExportData = {
		_schema: PROPERTY_DOCUMENTATION,
		exportMetadata: {
			exportedAt: new Date().toISOString(),
			exportFormat: 'json',
			appVersion: '1.0.0',
			totalRecords: 1 + subStatements.length,
		},
		mainStatement: extractExportableData(mainStatement),
		subStatements: subStatements.map(extractExportableData),
	};

	return JSON.stringify(exportData, null, 2);
}

/**
 * Flatten nested object with dot notation for CSV
 */
export function flattenObject(
	obj: Record<string, unknown>,
	prefix = '',
): Record<string, string | number | boolean | null> {
	const result: Record<string, string | number | boolean | null> = {};

	for (const [key, value] of Object.entries(obj)) {
		const newKey = prefix ? `${prefix}.${key}` : key;

		if (value === null || value === undefined) {
			result[newKey] = null;
		} else if (Array.isArray(value)) {
			result[newKey] = JSON.stringify(value);
		} else if (typeof value === 'object') {
			Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
		} else {
			result[newKey] = value as string | number | boolean;
		}
	}

	return result;
}

/**
 * Escape CSV value - handles commas, quotes, and newlines
 */
function escapeCSVValue(value: string | number | boolean | null): string {
	if (value === null || value === undefined) {
		return '';
	}

	const stringValue = String(value);

	if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}

	return stringValue;
}

/**
 * Generate CSV comment header with property documentation
 */
function generateCSVCommentHeader(): string {
	const lines: string[] = [
		'# FREEDI DATA EXPORT',
		'# Generated: ' + new Date().toISOString(),
		'#',
		'# PROPERTY DOCUMENTATION:',
		'#',
	];

	for (const [key, doc] of Object.entries(PROPERTY_DOCUMENTATION)) {
		lines.push(`# ${key} (${doc.type}): ${doc.description}`);
	}

	lines.push('#');
	lines.push(
		'# NOTE: Nested objects are flattened with dot notation (e.g., evaluation.sumEvaluations)',
	);
	lines.push('# Arrays are serialized as JSON strings');
	lines.push('#');

	return lines.join('\n');
}

/**
 * Create CSV export with comment header documentation
 */
export function createCSVExport(mainStatement: Statement, subStatements: Statement[]): string {
	try {
		const allStatements = [mainStatement, ...subStatements];
		const flattenedData = allStatements.map((stmt) =>
			flattenObject(extractExportableData(stmt) as unknown as Record<string, unknown>),
		);

		// Get all unique keys
		const allKeys = new Set<string>();
		flattenedData.forEach((row) => {
			Object.keys(row).forEach((key) => allKeys.add(key));
		});
		const headers = Array.from(allKeys).sort();

		// Generate CSV content
		const commentHeader = generateCSVCommentHeader();
		const headerRow = headers.map(escapeCSVValue).join(',');
		const dataRows = flattenedData.map((row) =>
			headers.map((header) => escapeCSVValue(row[header])).join(','),
		);

		return [commentHeader, headerRow, ...dataRows].join('\n');
	} catch (error) {
		logError(error, {
			operation: 'exportUtils.createCSVExport',
			metadata: { statementId: mainStatement.statementId },
		});
		throw error;
	}
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);

	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

/**
 * Main export function - exports statement data in specified format
 */
export async function exportStatementData(
	mainStatement: Statement,
	subStatements: Statement[],
	format: ExportFormat,
): Promise<void> {
	try {
		const timestamp = new Date().toISOString().split('T')[0];
		const safeTitle = mainStatement.statement.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');

		if (format === 'json') {
			const content = createJSONExport(mainStatement, subStatements);
			downloadFile(content, `freedi_export_${safeTitle}_${timestamp}.json`, 'application/json');
		} else {
			const content = createCSVExport(mainStatement, subStatements);
			downloadFile(content, `freedi_export_${safeTitle}_${timestamp}.csv`, 'text/csv');
		}
	} catch (error) {
		logError(error, {
			operation: 'exportUtils.exportStatementData',
			statementId: mainStatement.statementId,
			metadata: { format },
		});
		throw error;
	}
}
