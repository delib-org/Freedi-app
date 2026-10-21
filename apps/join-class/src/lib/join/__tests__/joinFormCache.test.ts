import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase BEFORE importing the SUT — the cache module imports
// db/doc/getDoc/setDoc/onSnapshot at module load.
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock('../../firebase', () => ({
	db: {},
	doc: vi.fn(() => ({ _ref: 'mock' })),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
	Unsubscribe: undefined,
}));

vi.mock('../../user', () => ({
	getUserState: () => ({ user: { uid: 'test-uid' } }),
}));

vi.mock('mithril', () => ({
	default: { redraw: vi.fn() },
}));

// Import the SUT after mocks are wired.
import {
	hasJoinFormSubmission,
	getCachedJoinFormSubmissionRole,
	getCachedJoinFormSubmissionData,
	getJoinFormSubmissionData,
	saveJoinFormSubmission,
	clearJoinFormCacheForUsers,
} from '../joinFormCache';

const Q = 'q1';
const U = 'user-1';

beforeEach(() => {
	mockGetDoc.mockReset();
	mockSetDoc.mockClear();
	mockOnSnapshot.mockClear();
	// Reset the module-private caches to a clean slate by importing freshly.
	// (vitest's `clearMocks` doesn't reach into module state, so we do this
	// by clearing any state explicitly via the public helper.)
	clearJoinFormCacheForUsers(Q, [U, 'other-uid']);
});

describe('hasJoinFormSubmission', () => {
	it('returns false when no submission exists', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => false });
		expect(await hasJoinFormSubmission(Q, U)).toBe(false);
	});

	it('returns true and primes the cache when a submission exists', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => true });
		expect(await hasJoinFormSubmission(Q, U)).toBe(true);
		// Second call hits the cache — no extra getDoc call.
		mockGetDoc.mockClear();
		expect(await hasJoinFormSubmission(Q, U)).toBe(true);
		expect(mockGetDoc).not.toHaveBeenCalled();
	});
});

describe('getJoinFormSubmissionData', () => {
	it('returns the submission and primes the role cache', async () => {
		mockGetDoc.mockResolvedValue({
			exists: () => true,
			data: () => ({
				role: 'organizer',
				displayName: 'Alice',
				values: { phone: '050' },
			}),
		});
		const data = await getJoinFormSubmissionData(Q, U);
		expect(data).toEqual({
			role: 'organizer',
			displayName: 'Alice',
			values: { phone: '050' },
		});
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBe('organizer');
		expect(getCachedJoinFormSubmissionData(Q, U)).toEqual({
			role: 'organizer',
			displayName: 'Alice',
			values: { phone: '050' },
		});
	});

	it('clears the cache when Firestore says the doc is missing', async () => {
		// First populate the cache.
		mockGetDoc.mockResolvedValueOnce({
			exists: () => true,
			data: () => ({ role: 'activist', displayName: 'A', values: {} }),
		});
		await getJoinFormSubmissionData(Q, U);
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBe('activist');

		// Then return missing.
		mockGetDoc.mockResolvedValueOnce({ exists: () => false });
		expect(await getJoinFormSubmissionData(Q, U)).toBeNull();
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBeNull();
		expect(getCachedJoinFormSubmissionData(Q, U)).toBeNull();
	});
});

describe('saveJoinFormSubmission', () => {
	it('writes Firestore and primes every cache key', async () => {
		await saveJoinFormSubmission(Q, U, 'Bob', { phone: '052' }, 'activist');
		expect(mockSetDoc).toHaveBeenCalledTimes(1);
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBe('activist');
		expect(getCachedJoinFormSubmissionData(Q, U)).toEqual({
			role: 'activist',
			displayName: 'Bob',
			values: { phone: '052' },
		});
	});
});

describe('clearJoinFormCacheForUsers', () => {
	it('drops every cache key for the given users', async () => {
		await saveJoinFormSubmission(Q, U, 'Bob', { phone: '052' });
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBe('activist');

		clearJoinFormCacheForUsers(Q, [U]);
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBeNull();
		expect(getCachedJoinFormSubmissionData(Q, U)).toBeNull();
	});

	it('does not touch unrelated users', async () => {
		await saveJoinFormSubmission(Q, U, 'Bob', {});
		await saveJoinFormSubmission(Q, 'other-uid', 'Carol', {});
		clearJoinFormCacheForUsers(Q, [U]);
		expect(getCachedJoinFormSubmissionRole(Q, U)).toBeNull();
		expect(getCachedJoinFormSubmissionRole(Q, 'other-uid')).toBe('activist');
	});
});
