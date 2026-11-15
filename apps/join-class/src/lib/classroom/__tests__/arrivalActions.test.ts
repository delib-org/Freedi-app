import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassArriveByNameResponse } from '@freedi/shared-types';

const arrive = vi.hoisted(() => vi.fn());
const setName = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ classArriveByName: arrive }));
vi.mock('../../store', () => ({ setCustomDisplayName: setName }));

const memory = new Map<string, string>();
vi.stubGlobal('window', {
	localStorage: {
		getItem: (key: string) => memory.get(key) ?? null,
		setItem: (key: string, value: string) => void memory.set(key, value),
		removeItem: (key: string) => void memory.delete(key),
	},
});

const { arriveByName, gateMemory, hasDeferredPick, rememberDeferredPick } = await import(
	'../arrivalActions'
);

const SEATED: ClassArriveByNameResponse = {
	outcome: 'seated',
	mainId: 'm1',
	fullName: 'Dana Levi',
	tableN: 2,
	movedFromAnotherDevice: false,
};

beforeEach(() => {
	arrive.mockReset();
	setName.mockReset();
	memory.clear();
	gateMemory.reenter = false;
});

describe('arriveByName', () => {
	it('keeps the registration name on the device when the student is seated', async () => {
		arrive.mockResolvedValue(SEATED);
		await arriveByName('m1', ' dana levi ');
		expect(arrive).toHaveBeenCalledWith({ mainId: 'm1', fullName: 'dana levi' });
		expect(setName).toHaveBeenCalledWith('Dana Levi');
	});

	it('sends the answer a button carries', async () => {
		arrive.mockResolvedValue({ ...SEATED, outcome: 'joined', tableN: null });
		await arriveByName('m1', 'Dana', { kind: 'joinWithout' });
		expect(arrive).toHaveBeenCalledWith({
			mainId: 'm1',
			fullName: 'Dana',
			answer: { kind: 'joinWithout' },
		});
	});

	it('closes a deliberate re-entry once the student is back in', async () => {
		gateMemory.reenter = true;
		arrive.mockResolvedValue(SEATED);
		await arriveByName('m1', 'Dana Levi');
		expect(gateMemory.reenter).toBe(false);
	});

	it('keeps the gate open on a question, and does not keep a name', async () => {
		gateMemory.reenter = true;
		arrive.mockResolvedValue({ outcome: 'nameTaken' });
		await arriveByName('m1', 'Dana Levi');
		expect(gateMemory.reenter).toBe(true);
		expect(setName).not.toHaveBeenCalled();
	});

	it('remembers a deferred pick (two registrations, no table yet) until the student is seated', async () => {
		arrive.mockResolvedValueOnce({ outcome: 'nameTwiceLater' });
		await arriveByName('m1', 'Dana Levi');
		expect(hasDeferredPick('m1')).toBe(true);
		expect(hasDeferredPick('other')).toBe(false);
		arrive.mockResolvedValueOnce(SEATED);
		await arriveByName('m1', 'Dana Levi', { kind: 'pick', seatId: 's1' });
		expect(hasDeferredPick('m1')).toBe(false);
	});

	it('lets a failure reach the screen', async () => {
		arrive.mockRejectedValue(new Error('offline'));
		await expect(arriveByName('m1', 'Dana')).rejects.toThrow('offline');
	});

	it('forgets and remembers by hand', () => {
		rememberDeferredPick('m2', true);
		expect(hasDeferredPick('m2')).toBe(true);
		rememberDeferredPick('m2', false);
		expect(hasDeferredPick('m2')).toBe(false);
	});
});
