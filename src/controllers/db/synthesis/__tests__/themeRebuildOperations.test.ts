import { httpsCallable } from 'firebase/functions';
import { logError } from '@/utils/errorHandling';
import { applyThemeRebuild, previewThemeRebuild } from '../synthesisOperations';

jest.mock('firebase/functions', () => ({
	httpsCallable: jest.fn(),
}));

jest.mock('../../config', () => ({
	functions: { region: 'me-west1' },
}));

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

jest.mock('@/services/logger', () => ({
	logger: { info: jest.fn() },
}));

const mockHttpsCallable = httpsCallable as jest.Mock;
const mockLogError = logError as jest.Mock;

const PREVIEW = {
	runId: 'run-1',
	atomCount: 42,
	otherCount: 3,
	themes: [
		{ key: 't1', name: 'Parking', rule: 'Ideas about parking', memberCount: 20, sampleTitles: [] },
	],
};

const APPLIED = {
	runId: 'run-1',
	themesWritten: 6,
	themesHidden: 2,
	atomsPlaced: 39,
	atomsToOther: 3,
	lateArrivalsToOther: 1,
};

describe('theme rebuild wrappers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('previewThemeRebuild', () => {
		it('calls rebuildThemes in preview mode and returns the proposal', async () => {
			const call = jest.fn().mockResolvedValue({ data: PREVIEW });
			mockHttpsCallable.mockReturnValue(call);

			await expect(previewThemeRebuild('q-1')).resolves.toEqual(PREVIEW);

			expect(mockHttpsCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'rebuildThemes');
			expect(call).toHaveBeenCalledWith({ questionId: 'q-1', mode: 'preview' });
		});

		it('logs with context and rethrows on failure', async () => {
			const failure = { code: 'functions/already-exists' };
			mockHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(failure));

			await expect(previewThemeRebuild('q-1')).rejects.toBe(failure);

			expect(mockLogError).toHaveBeenCalledWith(failure, {
				operation: 'synthesis.rebuildThemes',
				statementId: 'q-1',
				metadata: { mode: 'preview' },
			});
		});
	});

	describe('applyThemeRebuild', () => {
		it('calls rebuildThemes in apply mode with the run id', async () => {
			const call = jest.fn().mockResolvedValue({ data: APPLIED });
			mockHttpsCallable.mockReturnValue(call);

			await expect(applyThemeRebuild('q-1', 'run-1')).resolves.toEqual(APPLIED);

			expect(mockHttpsCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'rebuildThemes');
			expect(call).toHaveBeenCalledWith({ questionId: 'q-1', mode: 'apply', runId: 'run-1' });
		});

		it('logs with context and rethrows on failure', async () => {
			const failure = new Error('boom');
			mockHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(failure));

			await expect(applyThemeRebuild('q-1', 'run-1')).rejects.toBe(failure);

			expect(mockLogError).toHaveBeenCalledWith(failure, {
				operation: 'synthesis.rebuildThemes',
				statementId: 'q-1',
				metadata: { mode: 'apply', runId: 'run-1' },
			});
		});
	});
});
