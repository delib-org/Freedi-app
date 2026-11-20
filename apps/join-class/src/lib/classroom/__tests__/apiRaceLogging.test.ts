import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callable, captureException } = vi.hoisted(() => ({
	callable: vi.fn(),
	captureException: vi.fn(),
}));

vi.mock('../../firebase', () => ({
	functions: {},
	httpsCallable: () => callable,
}));
vi.mock('../../sentry', () => ({ captureException }));

import { classTableStep } from '../api';

const refusal = (reason: string): Error =>
	Object.assign(new Error('refused'), { details: { reason } });

describe('a refused classroom call', () => {
	beforeEach(() => vi.clearAllMocks());

	it('is not reported when it only means someone was first (the screen shows the winner)', async () => {
		callable.mockRejectedValue(refusal('floor-taken'));

		await expect(classTableStep({ tableId: 't', action: 'claimSpeaker' })).rejects.toThrow();
		expect(captureException).not.toHaveBeenCalled();
	});

	it('is reported, with the call named, when it is a real failure', async () => {
		callable.mockRejectedValue(new Error('network'));

		await expect(classTableStep({ tableId: 't', action: 'claimSpeaker' })).rejects.toThrow();
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			operation: 'classroom.classTableStep',
		});
	});
});
