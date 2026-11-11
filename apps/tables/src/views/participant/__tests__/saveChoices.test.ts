import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '@/lib/action';

const calls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/safeStorage', () => ({ safeStorage: {} }));
vi.mock('@/lib/tableAssignment/client', () => ({ tablesApi: { savePreferences: vi.fn() } }));
vi.mock('@/lib/navigate', () => ({
	goTo: () => calls.order.push('goTo'),
}));
vi.mock('@/logic/localDraft', () => ({
	clearDraft: () => calls.order.push('clearDraft'),
}));

import { saveChoicesAndLeave } from '../saveChoices';

const DRAFT = { ranked: ['a'], position: null };
const CONTEXT = { sessionId: 's1', uid: 'u1' };

function actionResolving(result: unknown): Action {
	return { run: async () => result } as unknown as Action;
}

describe('saveChoicesAndLeave', () => {
	beforeEach(() => {
		calls.order.length = 0;
	});

	it('leaves the screen first and clears the draft after, so a redraw cannot bounce back to Rank', async () => {
		await expect(saveChoicesAndLeave(actionResolving({ ok: true }), CONTEXT, DRAFT)).resolves.toBe(
			true,
		);

		expect(calls.order).toEqual(['goTo', 'clearDraft']);
	});

	it('keeps the draft and stays when the save failed', async () => {
		await expect(saveChoicesAndLeave(actionResolving(null), CONTEXT, DRAFT)).resolves.toBe(false);

		expect(calls.order).toEqual([]);
	});
});
