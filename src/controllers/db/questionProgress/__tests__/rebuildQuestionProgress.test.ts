import { httpsCallable } from 'firebase/functions';
import { logError } from '@/utils/errorHandling';
import { rebuildQuestionProgressOnce } from '../rebuildQuestionProgress';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('@/controllers/db/config', () => ({ functions: 'the-functions' }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockRecompute = jest.fn();

describe('rebuildQuestionProgressOnce', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(httpsCallable as jest.Mock).mockReturnValue(mockRecompute);
		mockRecompute.mockResolvedValue({ data: {} });
	});

	it('calls the recompute once however many surfaces ask', async () => {
		const results = await Promise.all([
			rebuildQuestionProgressOnce('once-q'),
			rebuildQuestionProgressOnce('once-q'),
		]);
		await rebuildQuestionProgressOnce('once-q');

		expect(results).toEqual([true, true]);
		expect(httpsCallable).toHaveBeenCalledWith('the-functions', 'fn_recomputeQuestionProgress');
		expect(mockRecompute).toHaveBeenCalledTimes(1);
		expect(mockRecompute).toHaveBeenCalledWith({ statementId: 'once-q' });
	});

	it('reports a failure, logs it and does not try again', async () => {
		const failure = new Error('permission-denied');
		mockRecompute.mockRejectedValue(failure);

		await expect(rebuildQuestionProgressOnce('fail-q')).resolves.toBe(false);
		await expect(rebuildQuestionProgressOnce('fail-q')).resolves.toBe(false);

		expect(mockRecompute).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledWith(failure, {
			operation: 'questionProgress.rebuildQuestionProgress',
			statementId: 'fail-q',
		});
	});
});
