import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCustomDisplayName = vi.fn();
const updateDoc = vi.fn(async (): Promise<void> => undefined);

vi.mock('@/lib/firebase', () => ({ db: {}, doc: () => ({}), updateDoc }));
vi.mock('@/lib/store', () => ({ setCustomDisplayName }));
vi.mock('@/lib/classroom/studentWrites', () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock('@/lib/user', () => ({ getUserState: () => ({ user: { uid: 'u1' } }) }));

const { saveMyName } = await import('../saveName');

/** Trello dZQmKXRY: a failed save must not leave a stored name that closes the form. */
describe('saveMyName', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('keeps the name on the device only after the write succeeded', async () => {
		await saveMyName('main', '  Dana ');
		expect(updateDoc).toHaveBeenCalledTimes(1);
		expect(setCustomDisplayName).toHaveBeenCalledWith('Dana');
	});

	it('a failed write rejects and stores no device name, so the form stays up', async () => {
		updateDoc.mockRejectedValueOnce(new Error('offline'));
		await expect(saveMyName('main', 'Dana')).rejects.toThrow('offline');
		expect(setCustomDisplayName).not.toHaveBeenCalled();
	});
});
