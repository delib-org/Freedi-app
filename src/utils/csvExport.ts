import { Statement } from 'delib-npm';
import { logError } from '@/utils/errorHandling';

interface CSVExportOptions {
	filename?: string;
	includeHeaders?: boolean;
}

interface OptionCSVRow {
	statement: string;
	description: string;
	numberOfEvaluators: number;
	agreement: number;
	consensus: number;
	createdAt: string;
	lastUpdate: string;
}

/**
 * Escapes a value for CSV format
 * Handles commas, quotes, and newlines
 */
function escapeCSVValue(value: string | number | undefined): string {
	if (value === undefined || value === null) {
		return '';
	}

	const stringValue = String(value);

	// If the value contains comma, quote, or newline, wrap in quotes and escape existing quotes
	if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}

	return stringValue;
}

/**
 * Formats a timestamp to a readable date string
 */
function formatTimestamp(timestamp: number | undefined): string {
	if (!timestamp) {
		return '';
	}

	try {
		const date = new Date(timestamp);

		return date.toISOString();
	} catch {
		return '';
	}
}

/**
 * Converts an array of Statement options to CSV format
 */
function optionsToCSV(options: Statement[], includeHeaders: boolean = true): string {
	const headers = [
		'Statement',
		'Description',
		'Number of Evaluators',
		'Agreement',
		'Consensus',
		'Created At',
		'Last Update'
	];

	const rows: string[] = [];

	if (includeHeaders) {
		rows.push(headers.join(','));
	}

	for (const option of options) {
		const row: OptionCSVRow = {
			statement: option.statement || '',
			description: option.description || '',
			numberOfEvaluators: option.evaluation?.numberOfEvaluators || 0,
			agreement: option.evaluation?.agreement || 0,
			consensus: option.consensus || 0,
			createdAt: formatTimestamp(option.createdAt),
			lastUpdate: formatTimestamp(option.lastUpdate)
		};

		const csvRow = [
			escapeCSVValue(row.statement),
			escapeCSVValue(row.description),
			escapeCSVValue(row.numberOfEvaluators),
			escapeCSVValue(row.agreement.toFixed(2)),
			escapeCSVValue(row.consensus.toFixed(2)),
			escapeCSVValue(row.createdAt),
			escapeCSVValue(row.lastUpdate)
		].join(',');

		rows.push(csvRow);
	}

	return rows.join('\n');
}

/**
 * Triggers a download of the CSV file in the browser
 */
function downloadCSV(csvContent: string, filename: string): void {
	// Add BOM for Excel UTF-8 compatibility
	const BOM = '\uFEFF';
	const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	URL.revokeObjectURL(url);
}

/**
 * Generates a safe filename from the question title
 */
function generateFilename(questionTitle: string): string {
	// Remove special characters and limit length
	const safeName = questionTitle
		.replace(/[^a-zA-Z0-9\s\u0590-\u05FF\u0600-\u06FF]/g, '') // Keep alphanumeric, spaces, Hebrew, Arabic
		.trim()
		.substring(0, 50)
		.trim();

	const timestamp = new Date().toISOString().split('T')[0];

	return `${safeName || 'options'}_${timestamp}.csv`;
}

/**
 * Exports statement options to a CSV file and triggers download
 */
export function exportOptionsToCSV(
	options: Statement[],
	questionTitle: string,
	exportOptions: CSVExportOptions = {}
): void {
	try {
		const {
			filename = generateFilename(questionTitle),
			includeHeaders = true
		} = exportOptions;

		if (options.length === 0) {
			console.info('No options to export');

			return;
		}

		const csvContent = optionsToCSV(options, includeHeaders);
		downloadCSV(csvContent, filename);

		console.info(`Exported ${options.length} options to CSV`);
	} catch (error) {
		logError(error, {
			operation: 'csvExport.exportOptionsToCSV',
			metadata: {
				optionsCount: options.length,
				questionTitle
			}
		});
		throw error;
	}
}
