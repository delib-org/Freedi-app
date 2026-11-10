import { addDoc, deleteDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Access, Role, Statement, StatementSubscription } from '@freedi/shared-types';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { logError } from '@/utils/errorHandling';
import { getStatementFromDB } from '../getStatement';
import { findUpTarget, forgetLevelReads, readLevelVerdict } from '../levelAccess';

jest.mock('firebase/firestore', () => ({
	addDoc: jest.fn(),
	deleteDoc: jest.fn(),
	setDoc: jest.fn(),
	updateDoc: jest.fn(),
	writeBatch: jest.fn(),
}));
jest.mock('../getStatement', () => ({ getStatementFromDB: jest.fn() }));
jest.mock('@/controllers/db/subscriptions/getSubscriptions', () => ({
	getStatementSubscriptionFromDB: jest.fn(),
}));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	setStatementSubscriptionToDB: jest.fn(),
}));
jest.mock('@/controllers/general/helpers', () => ({
	getStatementSubscriptionId: (statementId: string, uid: string) => `${uid}--${statementId}`,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const person = { uid: 'u1', isAnonymous: false };
const question = {
	statementId: 'question',
	parents: ['top', 'group', 'mid'],
	parentId: 'mid',
	topParentId: 'group',
} as Statement;

let statements: Record<string, Partial<Statement> | undefined>;
let subscriptions: Record<string, Partial<StatementSubscription> | undefined>;

const levelWith = (statementId: string, access?: Access): Partial<Statement> => ({
	statementId,
	topParentId: 'group',
	membership: access ? { access } : undefined,
});

describe('levelAccess', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		forgetLevelReads();
		statements = {};
		subscriptions = {};
		(getStatementFromDB as jest.Mock).mockImplementation(async (id: string) => statements[id]);
		(getStatementSubscriptionFromDB as jest.Mock).mockImplementation(
			async (id: string) => subscriptions[id],
		);
	});

	it('goes to the direct parent when it is open', async () => {
		statements = {
			mid: levelWith('mid', Access.public),
			group: levelWith('group', Access.secret),
		};

		await expect(findUpTarget(question, person)).resolves.toBe('mid');
	});

	it('skips a closed level and stops at the next open one', async () => {
		statements = {
			mid: levelWith('mid', Access.secret),
			group: levelWith('group', Access.openToAll),
		};

		await expect(findUpTarget(question, person)).resolves.toBe('group');
	});

	it('skips a deleted or refused level', async () => {
		statements = { mid: undefined, group: levelWith('group', Access.public) };

		await expect(findUpTarget(question, person)).resolves.toBe('group');
	});

	it('skips a level the person is only waiting to join', async () => {
		statements = {
			mid: levelWith('mid', Access.moderated),
			group: levelWith('group', Access.public),
		};
		subscriptions = { 'u1--mid': { role: Role.waiting } };

		await expect(findUpTarget(question, person)).resolves.toBe('group');
	});

	it('judges each level on its own', async () => {
		statements = {
			mid: levelWith('mid'),
			group: levelWith('group', Access.secret),
		};
		subscriptions = { 'u1--group': { role: Role.member } };

		await expect(findUpTarget(question, person)).resolves.toBe('mid');
	});

	it('falls back to Home when nothing above is open', async () => {
		statements = {
			mid: levelWith('mid', Access.secret),
			group: levelWith('group', Access.moderated),
		};

		await expect(findUpTarget(question, person)).resolves.toBeUndefined();
	});

	it('has no reads to make for a top-level statement', async () => {
		await expect(
			findUpTarget({ statementId: 'g', parentId: 'top', topParentId: 'g' }, person),
		).resolves.toBeUndefined();
		expect(getStatementFromDB).not.toHaveBeenCalled();
	});

	it('asks the reads to treat a refusal as an ordinary answer', async () => {
		statements = { mid: levelWith('mid', Access.secret) };

		await readLevelVerdict('mid', person);

		expect(getStatementFromDB).toHaveBeenCalledWith('mid', { expectRefusal: true });
		expect(getStatementSubscriptionFromDB).toHaveBeenCalledWith('u1--mid', {
			expectRefusal: true,
		});
	});

	it('does not read a subscription for a public level', async () => {
		statements = { mid: levelWith('mid', Access.public) };

		await expect(readLevelVerdict('mid', person)).resolves.toBe('open');
		expect(getStatementSubscriptionFromDB).not.toHaveBeenCalled();
	});

	it('shares reads between callers on one screen', async () => {
		statements = { mid: levelWith('mid', Access.public) };

		await Promise.all([readLevelVerdict('mid', person), readLevelVerdict('mid', person)]);

		expect(getStatementFromDB).toHaveBeenCalledTimes(1);
	});

	it('falls back to Home and logs when a read throws unexpectedly', async () => {
		(getStatementFromDB as jest.Mock).mockRejectedValue(new Error('boom'));

		await expect(findUpTarget(question, person)).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('makes no writes: no subscription, no join request', async () => {
		statements = {
			mid: levelWith('mid', Access.moderated),
			group: levelWith('group', Access.openToAll),
		};

		await findUpTarget(question, person);

		expect(setStatementSubscriptionToDB).not.toHaveBeenCalled();
		[addDoc, deleteDoc, setDoc, updateDoc, writeBatch].forEach((write) => {
			expect(write).not.toHaveBeenCalled();
		});
	});
});
