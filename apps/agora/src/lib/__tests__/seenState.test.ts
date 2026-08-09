import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The seen-state module keeps module-level pending state and a debounce
 * timer, so every test imports a FRESH copy (vi.resetModules) and drives the
 * mocked session/user/deliberation singletons directly.
 */

interface MockSeenEntry {
	firstSeenAt: number;
	seenEditAt: number;
}

const mockUpdateDoc = vi.fn<(ref: unknown, payload: Record<string, unknown>) => Promise<void>>(
	async () => {},
);

const sessionState: {
	session: { sessionId: string } | null;
	myParticipant: {
		seen?: Record<string, MockSeenEntry>;
		seenThreads?: Record<string, number>;
	} | null;
} = { session: null, myParticipant: null };

const userState: { user: { uid: string } | null } = { user: null };

const delibState: {
	statementsLoaded: boolean;
	evaluationsLoaded: boolean;
	proposals: Array<{ statementId: string; creatorId: string }>;
	myRatings: Record<string, { value: number; updatedAt: number }>;
	scores: Record<string, { lastEditAt?: number }>;
} = {
	statementsLoaded: true,
	evaluationsLoaded: true,
	proposals: [],
	myRatings: {},
	scores: {},
};

vi.mock('mithril', () => ({ default: { redraw: () => {} } }));
vi.mock('../firebase', () => ({
	db: {},
	doc: (_db: unknown, collectionName: string, id: string) => ({ collectionName, id }),
	updateDoc: (ref: unknown, payload: Record<string, unknown>) => mockUpdateDoc(ref, payload),
}));
vi.mock('../session', () => ({ getSessionState: () => sessionState }));
vi.mock('../user', () => ({ getUserState: () => userState }));
vi.mock('../proposals', () => ({ getDeliberationState: () => delibState }));

async function loadSeenState(): Promise<typeof import('../seenState')> {
	vi.resetModules();

	return import('../seenState');
}

beforeEach(() => {
	vi.useFakeTimers();
	mockUpdateDoc.mockClear();
	sessionState.session = { sessionId: 'session-1' };
	sessionState.myParticipant = {};
	userState.user = { uid: 'me' };
	delibState.statementsLoaded = true;
	delibState.evaluationsLoaded = true;
	delibState.proposals = [];
	delibState.myRatings = {};
	delibState.scores = {};
});

afterEach(() => {
	vi.useRealTimers();
});

describe('seenState', () => {
	it('a proposal is NEW until seen — but not if it was already rated', async () => {
		const seen = await loadSeenState();
		expect(seen.isNewToMe('p1')).toBe(true);
		// The rollout guard: pre-feature users who rated must not see NEW
		delibState.myRatings.p1 = { value: 1, updatedAt: 100 };
		expect(seen.isNewToMe('p1')).toBe(false);
	});

	it('marking seen clears NEW instantly, before any write lands', async () => {
		const seen = await loadSeenState();
		seen.markProposalSeen('p1', 50);
		expect(seen.isNewToMe('p1')).toBe(false);
		expect(mockUpdateDoc).not.toHaveBeenCalled(); // still debounced
	});

	it('EDITED requires a real edit past the watermark — and never fires on unseen cards', async () => {
		const seen = await loadSeenState();
		// Never seen: NEW wins, edited stays quiet
		expect(seen.isEditedSinceSeen('p1', 500)).toBe(false);
		seen.markProposalSeen('p1', 100);
		expect(seen.isEditedSinceSeen('p1', 100)).toBe(false);
		expect(seen.isEditedSinceSeen('p1', 500)).toBe(true);
		// Acknowledging the newer edit clears it
		seen.markProposalSeen('p1', 500);
		expect(seen.isEditedSinceSeen('p1', 500)).toBe(false);
	});

	it('the debounced flush writes nested field paths and never touches lastActive', async () => {
		const seen = await loadSeenState();
		seen.markProposalSeen('p1', 100);
		seen.markThreadSeen('p1--helper', 300);
		await vi.advanceTimersByTimeAsync(3000);
		expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
		const [ref, payload] = mockUpdateDoc.mock.calls[0];
		expect(ref).toMatchObject({ id: 'session-1--me' });
		expect(payload['seen.p1']).toMatchObject({ seenEditAt: 100 });
		expect(payload['seenThreads.p1--helper']).toBe(300);
		expect(Object.keys(payload).some((key) => key.includes('lastActive'))).toBe(false);
	});

	it('never writes a watermark backwards past the streamed doc (monotonic max-merge)', async () => {
		const seen = await loadSeenState();
		sessionState.myParticipant = {
			seen: { p1: { firstSeenAt: 10, seenEditAt: 900 } },
			seenThreads: { 'p1--helper': 800 },
		};
		seen.markProposalSeen('p1', 100); // stale relative to the doc
		seen.markThreadSeen('p1--helper', 700); // stale too
		await vi.advanceTimersByTimeAsync(3000);
		expect(mockUpdateDoc).not.toHaveBeenCalled();
	});

	it('counts thread messages from others past the watermark as unread', async () => {
		const seen = await loadSeenState();
		const messages = [
			{ creatorId: 'me', createdAt: 400 },
			{ creatorId: 'them', createdAt: 100 },
			{ creatorId: 'them', createdAt: 300 },
		];
		expect(seen.threadUnreadCount('p1--me', messages, 'me')).toBe(2);
		seen.markThreadSeen('p1--me', 100);
		expect(seen.threadUnreadCount('p1--me', messages, 'me')).toBe(1);
		seen.markThreadSeen('p1--me', 300);
		expect(seen.threadUnreadCount('p1--me', messages, 'me')).toBe(0);
	});

	it('seeds a baseline for already-rated proposals exactly once, mid-session rollout', async () => {
		const seen = await loadSeenState();
		delibState.proposals = [
			{ statementId: 'p1', creatorId: 'them' },
			{ statementId: 'p2', creatorId: 'them' },
		];
		delibState.myRatings = { p1: { value: 1, updatedAt: 250 } };
		delibState.scores = { p1: { lastEditAt: 200 } };
		seen.seedSeenBaselineIfNeeded();
		await vi.advanceTimersByTimeAsync(3000);
		expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
		const [, payload] = mockUpdateDoc.mock.calls[0];
		expect(payload['seen.p1']).toMatchObject({ firstSeenAt: 250, seenEditAt: 200 });
		// The unrated proposal stays NEW — no entry seeded for it
		expect(payload['seen.p2']).toBeUndefined();
	});

	it('does not seed when the participant already carries a seen map', async () => {
		const seen = await loadSeenState();
		sessionState.myParticipant = { seen: {} };
		delibState.proposals = [{ statementId: 'p1', creatorId: 'them' }];
		delibState.myRatings = { p1: { value: 1, updatedAt: 250 } };
		seen.seedSeenBaselineIfNeeded();
		await vi.advanceTimersByTimeAsync(3000);
		expect(mockUpdateDoc).not.toHaveBeenCalled();
	});
});
