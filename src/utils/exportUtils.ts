// The full export is built from server rows only (`fullExport` callable) and must never be fed Redux state.
/**
 * Export Utilities
 *
 * Functions for exporting statement data in JSON and CSV formats.
 */

import {
	ExportData,
	ExportFormat,
	ExportableStatementData,
	FullExportMeta,
	PROPERTY_DOCUMENTATION,
} from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

export { PROPERTY_DOCUMENTATION };

/** Rows already shaped for export (server-built or from toExportRows). */
export interface ExportRows {
	mainStatement: ExportableStatementData;
	subStatements: ExportableStatementData[];
}

/**
 * Create JSON export with schema documentation (NOT flattened - keeps nested structure)
 */
export function createJSONExportFromRows(rows: ExportRows, meta?: FullExportMeta): string {
	const exportData: ExportData = {
		_schema: PROPERTY_DOCUMENTATION,
		exportMetadata: {
			exportedAt: new Date(meta?.exportedAt ?? Date.now()).toISOString(),
			exportFormat: 'json',
			appVersion: '1.0.0',
			totalRecords: 1 + rows.subStatements.length,
			...(meta && {
				source: 'server' as const,
				includesHidden: true,
				skippedEmptyThemes: meta.skippedEmptyThemes,
			}),
		},
		mainStatement: rows.mainStatement,
		subStatements: rows.subStatements,
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
export function createCSVExportFromRows(rows: ExportRows): string {
	try {
		const flattenedData = [rows.mainStatement, ...rows.subStatements].map((row) =>
			flattenObject(row as unknown as Record<string, unknown>),
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
			metadata: { statementId: rows.mainStatement.statementId },
		});
		throw error;
	}
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	let finalContent = content;

	// Add UTF-8 BOM for CSV files to ensure proper encoding in Excel and other CSV readers
	if (mimeType === 'text/csv') {
		finalContent = '﻿' + content;
	}

	const blob = new Blob([finalContent], { type: mimeType + ';charset=utf-8' });
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
 * Download rows the fullExport callable already built. No Redux data involved.
 */
export function buildExportFile(
	rows: ExportRows,
	format: ExportFormat,
	meta: FullExportMeta,
): void {
	try {
		const timestamp = new Date(meta.exportedAt).toISOString().split('T')[0];
		const safeTitle = rows.mainStatement.statement.slice(0, 30).replace(/[^\p{L}\p{N}]/gu, '_');

		if (format === 'json') {
			downloadFile(
				createJSONExportFromRows(rows, meta),
				`freedi_export_${safeTitle}_${timestamp}.json`,
				'application/json',
			);
		} else {
			downloadFile(
				createCSVExportFromRows(rows),
				`freedi_export_${safeTitle}_${timestamp}.csv`,
				'text/csv',
			);
		}
	} catch (error) {
		logError(error, {
			operation: 'exportUtils.buildExportFile',
			statementId: rows.mainStatement.statementId,
			metadata: { format },
		});
		throw error;
	}
}
