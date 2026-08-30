import {
	Access,
	Collections,
	OrganizationRole,
	QuestionType,
	Role,
	SourceApp,
	Statement,
} from '@freedi/shared-types';
import { asHandler, expectHttpsError, fakeDbFrom, makeRequest } from './testUtils';

jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));
jest.mock('../../db', () => {
	const { createFakeDb } = jest.requireActual('./fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../utils/httpAuth', () => ({ isSystemAdmin: jest.fn(async () => false) }));

import * as dbModule from '../../db';
import { fn_createOrgStatement } from '../fn_createOrgStatement';

const db = fakeDbFrom(dbModule);
const create = asHandler<Record<string, unknown>, { statementId: string }>(fn_createOrgStatement);
const ORG = 'org1';
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };

function seedMember(uid: string, role: OrganizationRole): void {
	db.seed(Collections.organizationMembers, `${ORG}--${uid}`, {
		memberId: `${ORG}--${uid}`,
		organizationId: ORG,
		userId: uid,
		email: `${uid}@example.com`,
		displayName: uid,
		role,
		addedAt: 1,
		addedBy: 'alice',
		lastUpdate: 1,
	});
}

function seedTop(id: string, organizationId = ORG, parentId = 'top'): void {
	db.seed(Collections.statements, id, {
		statementId: id,
		statement: `Top ${id}`,
		statementType: 'question',
		parentId,
		topParentId: id,
		creatorId: 'alice',
		creator: { uid: 'alice', displayName: 'Alice' },
		organizationId,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
	});
}

function readStatement(id: string): Statement {
	return db.read(Collections.statements, id) as unknown as Statement;
}

describe('fn_createOrgStatement', () => {
	beforeEach(() => {
		db.reset();
		db.seed(Collections.organizations, ORG, {
			organizationId: ORG,
			name: 'Acme',
			questionCount: 0,
			defaultAccess: Access.openForRegistered,
		});
	});

	it('rejects non-admins', async () => {
		await expectHttpsError(
			create(makeRequest({ organizationId: ORG, title: 'T', kind: 'topQuestion' }, alice)),
			'permission-denied',
		);
		seedMember('alice', OrganizationRole.viewer);
		await expectHttpsError(
			create(makeRequest({ organizationId: ORG, title: 'T', kind: 'topQuestion' }, alice)),
			'permission-denied',
		);
	});

	it('validates input', async () => {
		seedMember('alice', OrganizationRole.admin);
		await expectHttpsError(
			create(makeRequest({ organizationId: ORG, title: ' ', kind: 'topQuestion' }, alice)),
			'invalid-argument',
		);
		await expectHttpsError(
			create(makeRequest({ organizationId: ORG, title: 'T', kind: 'bogus' }, alice)),
			'invalid-argument',
		);
		await expectHttpsError(
			create(makeRequest({ organizationId: ORG, title: 'T', kind: 'join' }, alice)),
			'invalid-argument',
		);
	});

	it('creates a top question with org markers, admin subs, counters and progress', async () => {
		seedMember('alice', OrganizationRole.owner);
		seedMember('bob', OrganizationRole.admin);
		seedMember('vic', OrganizationRole.viewer);

		const { statementId } = await create(
			makeRequest(
				{
					organizationId: ORG,
					title: 'Top',
					description: 'Desc',
					kind: 'topQuestion',
					initialStatus: 'frozen',
				},
				alice,
			),
		);

		const s = readStatement(statementId);
		expect(s.parentId).toBe('top');
		expect(s.topParentId).toBe(statementId);
		expect(s.organizationId).toBe(ORG);
		expect(s.membership?.access).toBe(Access.openForRegistered);
		expect(s.questionSettings?.questionType).toBe(QuestionType.simple);
		expect(s.statementSettings?.questionStatus).toBe('frozen');
		expect(s.description).toBe('Desc');
		expect(db.read(Collections.statementsSubscribe, `alice--${statementId}`)?.role).toBe(
			Role.admin,
		);
		expect(db.read(Collections.statementsSubscribe, `bob--${statementId}`)?.role).toBe(Role.admin);
		expect(db.read(Collections.statementsSubscribe, `vic--${statementId}`)).toBeUndefined();
		expect(db.read(Collections.organizations, ORG)?.questionCount).toBe(1);
		const progress = db.read(Collections.questionProgress, statementId);
		expect(progress).toMatchObject({
			statementId,
			topParentId: statementId,
			organizationId: ORG,
			entered: 0,
		});
	});

	it('rejects a child under a non-top parent or another org', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedTop('nested', ORG, 'someParent');
		await expectHttpsError(
			create(
				makeRequest(
					{ organizationId: ORG, title: 'C', kind: 'question', parentId: 'nested' },
					alice,
				),
			),
			'failed-precondition',
		);
		seedTop('foreign', 'org2');
		await expectHttpsError(
			create(
				makeRequest(
					{ organizationId: ORG, title: 'C', kind: 'question', parentId: 'foreign' },
					alice,
				),
			),
			'permission-denied',
		);
		await expectHttpsError(
			create(
				makeRequest(
					{ organizationId: ORG, title: 'C', kind: 'question', parentId: 'missing' },
					alice,
				),
			),
			'not-found',
		);
	});

	it('computes order and sets mass-consensus markers on a child', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedTop('top1');
		db.seed(Collections.statements, 'c1', { statementId: 'c1', parentId: 'top1', order: 0 });
		db.seed(Collections.statements, 'c2', { statementId: 'c2', parentId: 'top1', order: 4 });

		const { statementId } = await create(
			makeRequest(
				{ organizationId: ORG, title: 'MC', kind: 'massConsensus', parentId: 'top1' },
				alice,
			),
		);

		const s = readStatement(statementId);
		expect(s.order).toBe(5);
		expect(s.parentId).toBe('top1');
		expect(s.topParentId).toBe('top1');
		expect(s.parents).toEqual(['top1']);
		expect(s.organizationId).toBeUndefined();
		expect(s.sourceApp).toBe(SourceApp.MASS_CONSENSUS);
		expect(s.questionSettings?.questionType).toBe(QuestionType.massConsensus);
		expect(db.read(Collections.questionProgress, statementId)).toMatchObject({
			topParentId: 'top1',
			organizationId: ORG,
		});
		expect(db.read(Collections.statementsSubscribe, `alice--${statementId}`)).toBeUndefined();
	});

	it('join child marks openedInJoin on the caller top subscription', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedTop('top1');
		db.seed(Collections.statementsSubscribe, 'alice--top1', { role: Role.admin, userId: 'alice' });

		const { statementId } = await create(
			makeRequest({ organizationId: ORG, title: 'J', kind: 'join', parentId: 'top1' }, alice),
		);

		const s = readStatement(statementId);
		expect(s.order).toBe(0);
		expect(s.sourceApp).toBe(SourceApp.JOIN);
		expect(s.questionSettings?.questionType).toBe(QuestionType.simple);
		const topSub = db.read(Collections.statementsSubscribe, 'alice--top1');
		expect(topSub?.role).toBe(Role.admin);
		expect(typeof topSub?.openedInJoin).toBe('number');
	});

	it('document child is a hidden Sign document (admin review) unless opened now', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedTop('top1');
		const { statementId } = await create(
			makeRequest({ organizationId: ORG, title: 'Agreement', kind: 'document', parentId: 'top1' }, alice),
		);
		const doc = db.read(Collections.statements, statementId) as Record<string, unknown>;
		expect(doc.statementType).toBe('document');
		expect(doc.isDocument).toBe(true);
		expect(doc.sourceApp).toBe(SourceApp.SIGN);
		expect(doc.order).toBe(0);
		expect(doc.signSettings).toEqual({ isHidden: true, isPublic: true, isFrozen: false, enableSuggestions: false });
		expect(db.read(Collections.questionProgress, statementId)?.topParentId).toBe('top1');

		const opened = await create(
			makeRequest({ organizationId: ORG, title: 'Open doc', kind: 'document', parentId: 'top1', initialStatus: 'live' }, alice),
		);
		expect((db.read(Collections.statements, opened.statementId) as Record<string, unknown>).signSettings).toMatchObject({ isHidden: false, enableSuggestions: true });
	});

	it('plain question child uses the main app marker', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedTop('top1');
		const { statementId } = await create(
			makeRequest({ organizationId: ORG, title: 'Q', kind: 'question', parentId: 'top1' }, alice),
		);
		expect(readStatement(statementId).sourceApp).toBe(SourceApp.MAIN);
	});
});
