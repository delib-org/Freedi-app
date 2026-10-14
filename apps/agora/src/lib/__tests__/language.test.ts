import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ functions: {}, httpsCallable: vi.fn() }));
vi.mock('../i18n', () => ({
	t: (key: string, params?: Record<string, string>) =>
		params ? `${key}:${Object.values(params).join(',')}` : key,
}));

import {
	assertCleanLanguage,
	flaggedNotice,
	isLanguageFlagged,
	LanguageFlaggedError,
} from '../language';
import { clearEventSubscribers, on } from '../events';

const request = { sessionId: 's1', text: 'some words', statementId: 'p1' };

describe('assertCleanLanguage', () => {
	beforeEach(() => {
		clearEventSubscribers();
	});

	it('resolves on a clean verdict', async () => {
		const check = vi.fn(async () => ({ ok: true as const }));
		await expect(assertCleanLanguage(request, check)).resolves.toBeUndefined();
		expect(check).toHaveBeenCalledWith(request);
	});

	it('skips the round trip for blank text', async () => {
		const check = vi.fn(async () => ({ ok: true as const }));
		await assertCleanLanguage({ sessionId: 's1', text: '   ' }, check);
		expect(check).not.toHaveBeenCalled();
	});

	it('throws a typed rejection and announces the strike when refused', async () => {
		const heard: unknown[] = [];
		on('language:flagged', (payload) => heard.push(payload));
		const check = vi.fn(async () => ({
			ok: false as const,
			reason: 'language' as const,
			strikes: 2,
			deducted: 2,
			pointsTotal: 3,
		}));

		const error = await assertCleanLanguage(request, check).catch((e: unknown) => e);
		expect(isLanguageFlagged(error)).toBe(true);
		expect(error).toBeInstanceOf(LanguageFlaggedError);
		expect((error as LanguageFlaggedError).strikes).toBe(2);
		expect((error as LanguageFlaggedError).deducted).toBe(2);
		expect(heard).toEqual([{ sessionId: 's1', strikes: 2, deducted: 2 }]);
	});

	it('fails open when the check itself cannot be reached', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const check = vi.fn(async () => {
			throw new Error('unavailable');
		});
		await expect(assertCleanLanguage(request, check)).resolves.toBeUndefined();
		quiet.mockRestore();
	});

	it('does not mistake other failures for a refusal', () => {
		expect(isLanguageFlagged(new Error('network'))).toBe(false);
		expect(isLanguageFlagged(undefined)).toBe(false);
	});
});

describe('flaggedNotice', () => {
	it('names the coins taken, or says nothing about coins when none were', () => {
		expect(
			flaggedNotice(new LanguageFlaggedError({ strikes: 1, deducted: 2, pointsTotal: 1 })),
		).toBe('language.flagged:2');
		expect(
			flaggedNotice(new LanguageFlaggedError({ strikes: 3, deducted: 0, pointsTotal: 0 })),
		).toBe('language.flagged_no_coins');
	});
});
