import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave = vi.fn();

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('@/lib/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/store', () => ({
	getSubQuestions: () => [{ statementId: 'q1' }, { statementId: 'q2' }],
}));
vi.mock('@/lib/classroom/classSizeApi', async () => {
	const actual = await vi.importActual<typeof import('@/lib/classroom/classSizeApi')>(
		'@/lib/classroom/classSizeApi',
	);

	return { ...actual, saveClassSize: (...args: unknown[]) => mockSave(...args) };
});
vi.mock('@/lib/classroom/optionsListener', () => ({ listenOptions: vi.fn() }));

import { ClassSizeRecalcError, ClassSizeSaveError } from '@/lib/classroom/classSizeApi';
import { consoleState, resetConsoleState } from '../consoleState';
import {
	rememberUnsavedClassSize,
	saveClassSizeNow,
	showUnsavedClassSize,
} from '../classSizeActions';

describe('console class size save', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		resetConsoleState('m1');
	});

	it('saves on the lesson with its questions and shows no failure', async () => {
		mockSave.mockResolvedValue(30);

		expect(await saveClassSizeNow('30')).toBe(true);
		expect(mockSave).toHaveBeenCalledWith('m1', ['q1', 'q2'], '30');
		expect(consoleState.failure).toBeNull();
	});

	it('a failed save is shown plainly, with a retry that saves again', async () => {
		mockSave.mockRejectedValueOnce(new ClassSizeSaveError(new Error('x')));

		expect(await saveClassSizeNow('30')).toBe(false);
		expect(consoleState.failure?.message).toBe('console.class_size.save_failed');

		mockSave.mockResolvedValue(30);
		consoleState.failure?.retry();
		await vi.waitFor(() => expect(consoleState.failure).toBeNull());
		expect(mockSave).toHaveBeenCalledTimes(2);
	});

	it('a refused recalculation says the number was saved but the scores were not', async () => {
		mockSave.mockRejectedValue(new ClassSizeRecalcError(['q1']));

		expect(await saveClassSizeNow('30')).toBe(false);
		expect(consoleState.failure?.message).toBe('console.class_size.recalc_failed');
	});

	it('a number the new-lesson form could not write is told on arrival, with a retry', async () => {
		rememberUnsavedClassSize('m1', '25');
		showUnsavedClassSize('m1');

		expect(consoleState.failure?.message).toBe('console.class_size.save_failed');
		mockSave.mockResolvedValue(25);
		consoleState.failure?.retry();
		await vi.waitFor(() => expect(mockSave).toHaveBeenCalledWith('m1', ['q1', 'q2'], '25'));
	});

	it('says nothing when the new-lesson write succeeded', () => {
		showUnsavedClassSize('m1');

		expect(consoleState.failure).toBeNull();
	});
});
