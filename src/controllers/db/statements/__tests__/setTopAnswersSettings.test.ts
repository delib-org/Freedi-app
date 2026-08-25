import { CutoffBy, ResultsBy, SortType, Statement } from '@freedi/shared-types';
import { setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
	buildResultsSettings,
	getActiveRankBy,
	requestTopOptionsRecompute,
	setCutoffMethod,
	setCutoffValue,
	setManualOptionOrder,
	setRankBy,
	setResultsBy,
} from '../setTopAnswersSettings';
import { updateResultSettingsToDB } from '../setResultSettings';

jest.mock('firebase/firestore', () => ({
	setDoc: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
	httpsCallable: jest.fn(),
}));

jest.mock('../../config', () => ({
	functions: {},
}));

jest.mock('../setResultSettings', () => ({
	updateResultSettingsToDB: jest.fn(),
}));

jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: jest.fn((statementId: string) => ({ id: statementId })),
	getCurrentTimestamp: jest.fn(() => 1700000000000),
	updateTimestamp: jest.fn(() => ({ lastUpdate: 1700000000000 })),
}));

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

const mockSetDoc = setDoc as jest.Mock;
const mockUpdateResultSettings = updateResultSettingsToDB as jest.Mock;
const mockHttpsCallable = httpsCallable as jest.Mock;

function statement(overrides: Partial<Statement> = {}): Statement {
	return { statementId: 'q-1', ...overrides } as Statement;
}

describe('setTopAnswersSettings', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('buildResultsSettings', () => {
		it('falls back to consensus when the question has no results settings yet', () => {
			// `resultsBy` is the only non-optional field on the schema, so a patch
			// that omitted it would fail validation on a never-configured question.
			expect(buildResultsSettings(undefined, { cutoffBy: CutoffBy.aboveThreshold })).toEqual({
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
			});
		});

		it('carries the existing settings through and overrides only the edited keys', () => {
			const base = {
				resultsBy: ResultsBy.mostLiked,
				numberOfResults: 7,
				deep: 2,
			};

			expect(buildResultsSettings(base, { numberOfResults: 3 })).toEqual({
				resultsBy: ResultsBy.mostLiked,
				numberOfResults: 3,
				deep: 2,
			});
		});
	});

	describe('getActiveRankBy', () => {
		it('reports manual when a hand-placed order is saved', () => {
			const target = statement({
				statementSettings: { defaultSortType: SortType.newest, manualOptionOrder: ['a', 'b'] },
			});

			expect(getActiveRankBy(target)).toBe('manual');
		});

		it('ignores an empty manual order and falls back to the sort', () => {
			const target = statement({
				statementSettings: { defaultSortType: SortType.newest, manualOptionOrder: [] },
			});

			expect(getActiveRankBy(target)).toBe(SortType.newest);
		});

		it('defaults to agreement on an unconfigured question', () => {
			expect(getActiveRankBy(statement())).toBe(SortType.accepted);
		});
	});

	describe('setRankBy', () => {
		it('clears a saved manual order — picking a sort hands the list back to the algorithm', async () => {
			await setRankBy('q-1', SortType.accepted);

			expect(mockSetDoc).toHaveBeenCalledWith(
				{ id: 'q-1' },
				{
					statementSettings: {
						defaultSortType: SortType.accepted,
						manualOptionOrder: null,
					},
					lastUpdate: 1700000000000,
				},
				{ merge: true },
			);
		});

		it('merges rather than replacing — a nested write must not wipe the other settings', () => {
			// Regression guard: `updateDoc` with a nested object REPLACES the whole
			// `statementSettings` map, which silently destroyed showEvaluation and
			// enableAddEvaluationOption on every rank change.
			void setRankBy('q-1', SortType.newest);

			expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
		});

		it('writes a fresh shared seed for random so every viewer shuffles alike', async () => {
			await setRankBy('q-1', SortType.random);

			expect(mockSetDoc.mock.calls[0][1].statementSettings).toEqual({
				defaultSortType: SortType.random,
				manualOptionOrder: null,
				randomSortSeed: 1700000000000,
			});
		});

		it('does not seed for a deterministic sort', async () => {
			await setRankBy('q-1', SortType.newest);

			expect(mockSetDoc.mock.calls[0][1].statementSettings.randomSortSeed).toBeUndefined();
		});
	});

	describe('setManualOptionOrder', () => {
		it('writes the id array', async () => {
			await setManualOptionOrder('q-1', ['b', 'a']);

			expect(mockSetDoc).toHaveBeenCalledWith(
				{ id: 'q-1' },
				{ statementSettings: { manualOptionOrder: ['b', 'a'] }, lastUpdate: 1700000000000 },
				{ merge: true },
			);
		});

		it('writes null to clear', async () => {
			await setManualOptionOrder('q-1', null);

			expect(mockSetDoc.mock.calls[0][1].statementSettings.manualOptionOrder).toBeNull();
		});
	});

	describe('cutoff writes', () => {
		it('sets the cutoff method on a complete patch', async () => {
			await setCutoffMethod('q-1', { resultsBy: ResultsBy.consensus }, CutoffBy.aboveThreshold);

			expect(mockUpdateResultSettings).toHaveBeenCalledWith('q-1', {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
			});
		});

		it('routes the value to numberOfResults in top-N mode', async () => {
			await setCutoffValue(
				'q-1',
				{ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.topOptions },
				3.4,
			);

			expect(mockUpdateResultSettings.mock.calls[0][1]).toMatchObject({ numberOfResults: 4 });
		});

		it('routes the value to cutoffNumber in threshold mode', async () => {
			await setCutoffValue(
				'q-1',
				{ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.aboveThreshold },
				0.55,
			);

			expect(mockUpdateResultSettings.mock.calls[0][1]).toMatchObject({ cutoffNumber: 0.55 });
		});

		it('treats an unconfigured cutoff as top-N', async () => {
			await setCutoffValue('q-1', undefined, 5);

			expect(mockUpdateResultSettings.mock.calls[0][1]).toMatchObject({ numberOfResults: 5 });
		});

		it('changes the scoring metric', async () => {
			await setResultsBy('q-1', { resultsBy: ResultsBy.consensus }, ResultsBy.mostLiked);

			expect(mockUpdateResultSettings.mock.calls[0][1]).toMatchObject({
				resultsBy: ResultsBy.mostLiked,
			});
		});
	});

	describe('requestTopOptionsRecompute', () => {
		it('calls the callable with the statement id', async () => {
			const callable = jest.fn().mockResolvedValue({ data: { success: true } });
			mockHttpsCallable.mockReturnValue(callable);

			await requestTopOptionsRecompute('q-1');

			expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'recomputeTopOptions');
			expect(callable).toHaveBeenCalledWith({ statementId: 'q-1' });
		});

		it('swallows a failure — the settings write already landed', async () => {
			mockHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(new Error('offline')));

			await expect(requestTopOptionsRecompute('q-1')).resolves.toBeUndefined();
		});
	});
});
