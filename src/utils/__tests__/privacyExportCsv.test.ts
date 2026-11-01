import { convertToCSV } from '../privacyExportUtils';
import type { OptionEvaluationSummary, PrivacyPreservingExportData } from '@/types/privacyExport';

jest.mock('@/controllers/db/config', () => ({ FireStore: {} }));

function summary(fields: Partial<OptionEvaluationSummary>): OptionEvaluationSummary {
	return {
		statementId: 'o1',
		statementText: 'Option one',
		totalEvaluators: 2,
		averageEvaluation: 0.5,
		proCount: 1,
		conCount: 0,
		neutralCount: 1,
		sumEvaluations: 1,
		isDerived: false,
		...fields,
	};
}

function exportData(options: OptionEvaluationSummary[]): PrivacyPreservingExportData {
	return {
		metadata: {
			exportedAt: '2026-11-01T00:00:00.000Z',
			exportFormat: 'csv',
			appVersion: '1.0.0',
			totalRecords: options.length,
			kAnonymityThreshold: 3,
			suppressedGroupCount: 0,
			totalEvaluators: 2,
			totalDemographicRespondents: 0,
			skippedEmptyThemes: 4,
			stakeholderCount: 120,
			fpcApplied: true,
		},
		parentStatement: { statementId: 'q1', statementText: 'Question' },
		participation: {
			enteredCount: null,
			suggestedCount: 1,
			evaluatedCount: 2,
			totalParticipants: 2,
		},
		demographicQuestions: [],
		demographicStats: [],
		optionEvaluations: options,
		demographicBreakdowns: [],
		privacyNotice: 'notice',
		statsNotes: 'direct vs merged',
	};
}

function optionSection(csv: string): string[][] {
	const lines = csv.split('\n');
	const start = lines.indexOf('# === OPTION EVALUATION SUMMARY ===');
	const rows: string[][] = [];
	for (let i = start + 1; i < lines.length && lines[i] !== ''; i++) {
		rows.push(lines[i].split(','));
	}

	return rows;
}

describe('convertToCSV — option summary columns', () => {
	it('emits agreement, hidden, stats method and merged columns as flat cells', () => {
		const derived = summary({
			statementId: 's1',
			isDerived: true,
			isCluster: true,
			derivedByPipeline: 'synthesis',
			agreement: 0.25,
			agreementIndex: 0.4,
			hide: true,
			statsMethod: 'direct+merged',
			mergedTotalEvaluators: 5,
			mergedAverageEvaluation: 0.2,
			mergedProCount: 3,
			mergedConCount: 1,
			mergedNeutralCount: 1,
			mergedSumEvaluations: 1,
			mergedAgreement: 0.1,
			mergedAgreementIndex: 0.3,
		});

		const [header, row] = optionSection(convertToCSV(exportData([derived])));
		const cell = (name: string) => row[header.indexOf(name)];

		expect(header.length).toBe(row.length);
		expect(cell('Agreement')).toBe('0.250');
		expect(cell('Agreement Index')).toBe('0.400');
		expect(cell('Hidden')).toBe('Yes');
		expect(cell('Stats Method')).toBe('direct+merged');
		expect(cell('Merged Total Evaluators')).toBe('5');
		expect(cell('Merged Neutral Count')).toBe('1');
		expect(cell('Merged Agreement')).toBe('0.100');
		expect(cell('Merged Agreement Index')).toBe('0.300');
	});

	it('leaves merged cells empty for a plain option and for a client-side summary', () => {
		const plain = summary({
			agreement: 0.5,
			agreementIndex: 0.6,
			hide: false,
			statsMethod: 'direct',
		});
		const clientSide = summary({ statementId: 'o2' });

		const [header, plainRow, clientRow] = optionSection(
			convertToCSV(exportData([plain, clientSide])),
		);

		expect(plainRow[header.indexOf('Hidden')]).toBe('No');
		expect(plainRow[header.indexOf('Merged Total Evaluators')]).toBe('');
		expect(clientRow[header.indexOf('Agreement')]).toBe('');
		expect(clientRow[header.indexOf('Hidden')]).toBe('');
	});

	it('writes the new metadata and stats notes into the header comments', () => {
		const csv = convertToCSV(exportData([summary({})]));

		expect(csv).toContain('# Skipped Empty Themes: 4');
		expect(csv).toContain('# Finite-Population Correction: Yes');
		expect(csv).toContain('# Stakeholder Count (N): 120');
		expect(csv).toContain('# direct vs merged');
	});
});
