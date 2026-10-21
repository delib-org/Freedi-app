import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the firebase module BEFORE importing the SUT, since facilitator.ts
// imports `getDoc`/`doc`/`db` at module load.
const mockGetDoc = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	doc: vi.fn(() => ({})),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

// Mithril is imported transitively by facilitator.ts (only for isFacilitatedMode);
// stub it so importing doesn't blow up under jsdom-less environments.
vi.mock('mithril', () => ({
	default: {
		route: { get: () => '/' },
	},
}));

import { mapMainAppPathToJoinTarget, joinTargetToRoute } from '../facilitator';

const MAIN_ID = 'main-123';

describe('mapMainAppPathToJoinTarget', () => {
	beforeEach(() => {
		mockGetDoc.mockReset();
	});

	it('returns null for empty / undefined path', async () => {
		expect(await mapMainAppPathToJoinTarget('', MAIN_ID)).toBeNull();
		expect(await mapMainAppPathToJoinTarget(undefined, MAIN_ID)).toBeNull();
	});

	it('maps the main statement bare path to hub', async () => {
		const r = await mapMainAppPathToJoinTarget(`/statement/${MAIN_ID}`, MAIN_ID);
		expect(r).toEqual({ type: 'hub' });
	});

	it('maps the main statement with ?tab=questions to hub', async () => {
		const r = await mapMainAppPathToJoinTarget(`/statement/${MAIN_ID}?tab=questions`, MAIN_ID);
		expect(r).toEqual({ type: 'hub' });
	});

	it('maps the main statement with ?tab=options to hub', async () => {
		const r = await mapMainAppPathToJoinTarget(`/statement/${MAIN_ID}?tab=options`, MAIN_ID);
		expect(r).toEqual({ type: 'hub' });
	});

	it('maps a different bare statement id to solutions for that question', async () => {
		const r = await mapMainAppPathToJoinTarget('/statement/q-1', MAIN_ID);
		expect(r).toEqual({ type: 'solutions', questionId: 'q-1' });
	});

	it('maps a chat path to chat with questionId resolved from the option doc', async () => {
		mockGetDoc.mockResolvedValueOnce({
			exists: () => true,
			data: () => ({ parentId: 'q-7' }),
		});
		const r = await mapMainAppPathToJoinTarget('/statement/opt-9/chat', MAIN_ID);
		expect(r).toEqual({ type: 'chat', questionId: 'q-7', optionId: 'opt-9' });
	});

	it('caches the option-parent lookup so repeated chat redirects do not re-fetch', async () => {
		mockGetDoc.mockResolvedValueOnce({
			exists: () => true,
			data: () => ({ parentId: 'q-7' }),
		});
		await mapMainAppPathToJoinTarget('/statement/opt-cache/chat', MAIN_ID);
		await mapMainAppPathToJoinTarget('/statement/opt-cache/chat', MAIN_ID);
		expect(mockGetDoc).toHaveBeenCalledTimes(1);
	});

	it('returns null when option lookup misses', async () => {
		mockGetDoc.mockResolvedValueOnce({
			exists: () => false,
			data: () => undefined,
		});
		const r = await mapMainAppPathToJoinTarget('/statement/opt-missing/chat', MAIN_ID);
		expect(r).toBeNull();
	});

	it('returns null for out-of-scope screens (vote, mind-map, settings)', async () => {
		expect(await mapMainAppPathToJoinTarget(`/statement/${MAIN_ID}/vote`, MAIN_ID)).toBeNull();
		expect(await mapMainAppPathToJoinTarget('/statement/q-1/mind-map', MAIN_ID)).toBeNull();
		expect(await mapMainAppPathToJoinTarget('/statement/q-1/settings', MAIN_ID)).toBeNull();
	});

	it('returns null for non-statement paths', async () => {
		expect(await mapMainAppPathToJoinTarget('/home', MAIN_ID)).toBeNull();
		expect(await mapMainAppPathToJoinTarget('/random', MAIN_ID)).toBeNull();
	});

	it('handles trailing slashes / extra whitespace', async () => {
		expect(await mapMainAppPathToJoinTarget(`  /statement/${MAIN_ID}/  `, MAIN_ID)).toEqual({
			type: 'hub',
		});
	});
});

describe('joinTargetToRoute', () => {
	it('builds /m/:mid for hub', () => {
		expect(joinTargetToRoute({ type: 'hub' }, MAIN_ID)).toBe(`/m/${MAIN_ID}`);
	});

	it('builds /m/:mid/q/:qid for solutions', () => {
		expect(joinTargetToRoute({ type: 'solutions', questionId: 'q-1' }, MAIN_ID)).toBe(
			`/m/${MAIN_ID}/q/q-1`,
		);
	});

	it('builds /m/:mid/q/:qid/s/:sid for chat', () => {
		expect(joinTargetToRoute({ type: 'chat', questionId: 'q-1', optionId: 'opt-9' }, MAIN_ID)).toBe(
			`/m/${MAIN_ID}/q/q-1/s/opt-9`,
		);
	});
});
