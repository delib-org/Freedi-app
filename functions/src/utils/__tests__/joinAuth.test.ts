/**
 * Unit tests for the shared `assertJoinAdminAuthorized` helper.
 *
 * The helper is a small Firestore-driven decision over three docs:
 *   1. statements/{questionId}            (creator path)
 *   2. statementsSubscribe/{uid--qid}     (subscription path)
 *   3. joinDelegates/{getJoinDelegateId}  (delegate path)
 *
 * We mock `db` to return controlled snapshots and verify each branch.
 */

import { Role, getJoinDelegateId } from '@freedi/shared-types';

// `../../db` exports `db` as the Admin Firestore handle. We control it
// via a per-collection mock map below.
type MockSnap = { exists: boolean; data: () => unknown };
type MockRef = { get: jest.Mock<Promise<MockSnap>> };
type MockCollection = { doc: jest.Mock<MockRef, [string]> };

const collectionMocks: Map<string, MockCollection> = new Map();

function setMockDoc(collection: string, docId: string, snap: MockSnap): void {
	let cmock = collectionMocks.get(collection);
	if (!cmock) {
		const ref = (id: string): MockRef => {
			const docMock = collectionDocs.get(collection)?.get(id) ?? {
				exists: false,
				data: () => null,
			};

			return { get: jest.fn(() => Promise.resolve(docMock)) };
		};
		cmock = { doc: jest.fn(ref) as unknown as jest.Mock<MockRef, [string]> };
		collectionMocks.set(collection, cmock);
	}
	let docs = collectionDocs.get(collection);
	if (!docs) {
		docs = new Map();
		collectionDocs.set(collection, docs);
	}
	docs.set(docId, snap);
}

const collectionDocs: Map<string, Map<string, MockSnap>> = new Map();

function resetMocks(): void {
	collectionMocks.clear();
	collectionDocs.clear();
}

jest.mock('../../db', () => ({
	db: {
		collection: jest.fn((name: string) => {
			let cmock = collectionMocks.get(name);
			if (!cmock) {
				cmock = {
					doc: jest.fn((id: string) => ({
						get: jest.fn(() =>
							Promise.resolve(
								collectionDocs.get(name)?.get(id) ?? {
									exists: false,
									data: () => null,
								},
							),
						),
					})) as unknown as jest.Mock<MockRef, [string]>,
				};
				collectionMocks.set(name, cmock);
			}

			return cmock;
		}),
	},
}));

// Bring in the system under test AFTER the mock is registered so the
// import sees the mocked db.
import { assertJoinAdminAuthorized } from '../joinAuth';

const QID = 'q1';
const UID = 'user-1';

beforeEach(() => {
	resetMocks();
});

function setQuestion(creatorId: string): void {
	setMockDoc('statements', QID, {
		exists: true,
		data: () => ({
			statementId: QID,
			creatorId,
			statementSettings: {},
		}),
	});
}

function setSubscription(role: string | undefined): void {
	setMockDoc('statementsSubscribe', `${UID}--${QID}`, {
		exists: role !== undefined,
		data: () => ({ role }),
	});
}

function setDelegate(permissions: Record<string, boolean>): void {
	setMockDoc('joinDelegates', getJoinDelegateId(QID, UID), {
		exists: true,
		data: () => ({
			questionId: QID,
			userId: UID,
			permissions,
		}),
	});
}

describe('assertJoinAdminAuthorized', () => {
	it('authorizes the question creator (no subscription needed)', async () => {
		setQuestion(UID);

		const result = await assertJoinAdminAuthorized({
			uid: UID,
			questionId: QID,
			operation: 'test.op',
		});

		expect(result.via).toBe('creator');
		expect(result.question.creatorId).toBe(UID);
	});

	it('authorizes a user with admin subscription role', async () => {
		setQuestion('someone-else');
		setSubscription(Role.admin);

		const result = await assertJoinAdminAuthorized({
			uid: UID,
			questionId: QID,
			operation: 'test.op',
		});

		expect(result.via).toBe('subscription');
	});

	it('authorizes a user with creator subscription role', async () => {
		setQuestion('someone-else');
		setSubscription(Role.creator);

		const result = await assertJoinAdminAuthorized({
			uid: UID,
			questionId: QID,
			operation: 'test.op',
		});

		expect(result.via).toBe('subscription');
	});

	it('authorizes a delegate when allowDelegate=true (default)', async () => {
		setQuestion('someone-else');
		setSubscription(undefined);
		setDelegate({ canManageOrganizerSolutions: true });

		const result = await assertJoinAdminAuthorized({
			uid: UID,
			questionId: QID,
			operation: 'test.op',
		});

		expect(result.via).toBe('delegate');
	});

	it('rejects a delegate when allowDelegate=false', async () => {
		setQuestion('someone-else');
		setSubscription(undefined);
		setDelegate({ canManageOrganizerSolutions: true });

		await expect(
			assertJoinAdminAuthorized({
				uid: UID,
				questionId: QID,
				allowDelegate: false,
				operation: 'test.op',
			}),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects a delegate without the required permission', async () => {
		setQuestion('someone-else');
		setSubscription(undefined);
		setDelegate({ canManageOrganizerSolutions: false });

		await expect(
			assertJoinAdminAuthorized({
				uid: UID,
				questionId: QID,
				operation: 'test.op',
			}),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects when none of the auth paths apply', async () => {
		setQuestion('someone-else');

		await expect(
			assertJoinAdminAuthorized({
				uid: UID,
				questionId: QID,
				operation: 'test.op',
			}),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('throws not-found when the question does not exist', async () => {
		// No setQuestion call → snap.exists === false

		await expect(
			assertJoinAdminAuthorized({
				uid: UID,
				questionId: QID,
				operation: 'test.op',
			}),
		).rejects.toMatchObject({ code: 'not-found' });
	});

	it('honors the delegatePermission option (canManageParticipantSolutions)', async () => {
		setQuestion('someone-else');
		setSubscription(undefined);
		setDelegate({
			canManageOrganizerSolutions: false,
			canManageParticipantSolutions: true,
		});

		const result = await assertJoinAdminAuthorized({
			uid: UID,
			questionId: QID,
			delegatePermission: 'canManageParticipantSolutions',
			operation: 'test.op',
		});

		expect(result.via).toBe('delegate');
	});

	it('rejects users with a non-admin subscription role (e.g. member)', async () => {
		setQuestion('someone-else');
		setSubscription('member');

		await expect(
			assertJoinAdminAuthorized({
				uid: UID,
				questionId: QID,
				operation: 'test.op',
			}),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});
});
