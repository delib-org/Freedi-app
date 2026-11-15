import type { ClassArriveByNameResponse, ClassNameAnswer } from '@freedi/shared-types';
import { setCustomDisplayName } from '../store';
import { classArriveByName } from './api';
import { arrivedName, isDeferredPick, requestOf } from './arrival';

/**
 * What the connected lesson's name gate does to the device: the call, the name
 * kept on the phone, and two small memories.
 *  - `gateMemory.reenter`: the student chose "come in again from here" or "pick my
 *    table", so the gate opens even though they are in.
 *  - the deferred pick (per lesson, in localStorage): two registrations share the
 *    student's name and no table was known yet; when the tables arrive the Tables
 *    step offers "pick my table". Cleared once they are seated.
 */

export const gateMemory: { reenter: boolean } = { reenter: false };

const DEFERRED_KEY_PREFIX = 'joinClass.namePickLater.';

function deferredKey(mainId: string): string {
	return `${DEFERRED_KEY_PREFIX}${mainId}`;
}

export function rememberDeferredPick(mainId: string, on: boolean): void {
	try {
		if (on) window.localStorage.setItem(deferredKey(mainId), '1');
		else window.localStorage.removeItem(deferredKey(mainId));
	} catch (error) {
		console.error('[Arrival] device storage unavailable:', error);
	}
}

export function hasDeferredPick(mainId: string): boolean {
	try {
		return window.localStorage.getItem(deferredKey(mainId)) === '1';
	} catch {
		return false;
	}
}

/**
 * The gate's one call. Never swallows a failure (the screen shows its own line);
 * on an answer that lets the student in it keeps the name and the memories.
 */
export async function arriveByName(
	mainId: string,
	fullName: string,
	answer?: ClassNameAnswer,
): Promise<ClassArriveByNameResponse> {
	const response = await classArriveByName(requestOf(mainId, fullName, answer));
	const name = arrivedName(response);
	if (name) setCustomDisplayName(name);
	if (response.outcome === 'seated' || response.outcome === 'joined')
		rememberDeferredPick(mainId, false);
	if (isDeferredPick(response)) rememberDeferredPick(mainId, true);
	if (response.outcome === 'seated' || response.outcome === 'joined' || isDeferredPick(response)) {
		gateMemory.reenter = false;
	}

	return response;
}
