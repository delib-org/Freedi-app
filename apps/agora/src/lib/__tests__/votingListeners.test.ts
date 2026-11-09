import { afterEach, describe, expect, it, vi } from 'vitest';

const { onSnapshot, query, collection, doc } = vi.hoisted(() => ({
	onSnapshot: vi.fn(() => () => undefined),
	query: vi.fn((target: unknown) => ({ kind: 'query', target })),
	collection: vi.fn((_db: unknown, name: string) => ({ kind: 'collection', name })),
	doc: vi.fn((_db: unknown, name: string, id: string) => ({ kind: 'doc', name, id })),
}));

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('../firebase', () => ({
	db: {},
	doc,
	collection,
	query,
	where: vi.fn(),
	setDoc: vi.fn(),
	onSnapshot,
}));
vi.mock('../confirmedWrite', () => ({ trackWrite: vi.fn() }));
vi.mock('../user', () => ({ getUserState: vi.fn() }));
vi.mock('../session', () => ({ getSessionState: vi.fn() }));
vi.mock('../statementDocs', () => ({ agoraCreator: vi.fn() }));

const { listenToVoting, stopVotingListeners } = await import('../voting');

interface Target {
	kind: string;
}

function attachedKinds(): string[] {
	const calls = onSnapshot.mock.calls as unknown as Array<[Target]>;

	return calls.map(([target]) => target.kind);
}

describe('listenToVoting', () => {
	afterEach(() => {
		stopVotingListeners();
		vi.clearAllMocks();
	});

	// The rules refuse a student this query, and a vote doc says who chose what.
	it('never queries other people’s votes for a student', () => {
		listenToVoting('session', 'question', 'student', false);

		expect(attachedKinds()).toEqual(['doc', 'doc']);
		expect(query).not.toHaveBeenCalled();
	});

	it('adds the who-has-voted query for the session’s teacher', () => {
		listenToVoting('session', 'question', 'teacher', true);

		expect(attachedKinds()).toEqual(['doc', 'doc', 'query']);
	});

	it('does not restart its listeners on a redraw', () => {
		listenToVoting('session', 'question', 'student', false);
		listenToVoting('session', 'question', 'student', false);

		expect(onSnapshot).toHaveBeenCalledTimes(2);
	});
});
