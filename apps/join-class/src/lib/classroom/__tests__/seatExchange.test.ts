import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassArrival } from '@freedi/shared-types';

const seatByCode = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ classSeatByCode: seatByCode }));

import { exchangeSeatCode, lessonHrefOf, outcomeOfArrival, outcomeOfError } from '../seatExchange';

const ARRIVAL: ClassArrival = {
	mainId: 'main 1',
	fullName: 'Dana Levi',
	tableN: 4,
	topic: 'Transport',
	movedFromAnotherDevice: false,
};

/** What a callable refusal looks like on the client. */
function refusal(code: string, reason?: string): Error {
	return Object.assign(new Error(code), { code, details: reason ? { reason } : undefined });
}

beforeEach(() => {
	seatByCode.mockReset();
});

describe('the personal link (/seat/:seatCode)', () => {
	it('lands on the lesson, with the registration name', () => {
		expect(outcomeOfArrival(ARRIVAL)).toEqual({
			kind: 'go',
			href: '/m/main%201',
			fullName: 'Dana Levi',
		});
		expect(lessonHrefOf('abc')).toBe('/m/abc');
	});

	it('says "no longer active" for a dead link, whatever the server code', () => {
		expect(outcomeOfError(refusal('functions/not-found', 'seat-link-inactive'))).toEqual({
			kind: 'inactive',
		});
		expect(outcomeOfError(refusal('functions/failed-precondition', 'seat-link-inactive'))).toEqual({
			kind: 'inactive',
		});
	});

	it('offers a retry for anything else (no network, a server error)', () => {
		expect(outcomeOfError(refusal('functions/unavailable'))).toEqual({ kind: 'offline' });
		expect(outcomeOfError(new Error('offline'))).toEqual({ kind: 'offline' });
		expect(outcomeOfError(undefined)).toEqual({ kind: 'offline' });
	});

	it('exchanges the code and replaces the route with the lesson', async () => {
		seatByCode.mockResolvedValue(ARRIVAL);
		const outcome = await exchangeSeatCode('  code-1 ');
		expect(seatByCode).toHaveBeenCalledWith({ seatCode: 'code-1' });
		expect(outcome).toMatchObject({ kind: 'go', href: '/m/main%201' });
	});

	it('never asks the server about an empty code', async () => {
		expect(await exchangeSeatCode(undefined)).toEqual({ kind: 'inactive' });
		expect(await exchangeSeatCode('   ')).toEqual({ kind: 'inactive' });
		expect(seatByCode).not.toHaveBeenCalled();
	});

	it('turns a dead link and a failed call into screens, never a throw', async () => {
		seatByCode.mockRejectedValueOnce(refusal('functions/not-found', 'seat-link-inactive'));
		expect(await exchangeSeatCode('x')).toEqual({ kind: 'inactive' });
		seatByCode.mockRejectedValueOnce(refusal('functions/unavailable'));
		expect(await exchangeSeatCode('x')).toEqual({ kind: 'offline' });
	});
});
