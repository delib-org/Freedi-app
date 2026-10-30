/**
 * assertSynthesisAdmin finds the caller's subscription by its DOC ID
 * `{uid}--{topParentId}`, like the rules' isAdmin, and never by a field query
 * (which would trust a doc whose id names another statement).
 */

class MockHttpsError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

type Docs = Record<string, Record<string, Record<string, unknown>>>;
let docs: Docs = {};
const reads: string[] = [];

jest.mock('firebase-functions/v2/https', () => ({ HttpsError: MockHttpsError }));
jest.mock('firebase-functions/v1', () => ({ logger: { warn: jest.fn() } }));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: (name: string) => ({
			doc: (id: string) => ({
				get: async () => {
					reads.push(`${name}/${id}`);
					const data = docs[name]?.[id];

					return {
						exists: data !== undefined,
						data: () => data,
						get: (field: string) => data?.[field],
					};
				},
			}),
			where: () => {
				throw new Error('field query used');
			},
		}),
	}),
}));

import { assertSynthesisAdmin } from '../assertSynthesisAdmin';

const Q = 'q1';
const TOP = 'top1';

beforeEach(() => {
	reads.length = 0;
	docs = { statements: { [Q]: { statementId: Q, topParentId: TOP } }, statementsSubscribe: {} };
});

describe('assertSynthesisAdmin', () => {
	it.each(['admin', 'statement-creator', 'creator'])('admits role %s by doc id', async (role) => {
		docs.statementsSubscribe[`u1--${TOP}`] = { role, userId: 'u1', statementId: TOP };
		await expect(assertSynthesisAdmin(Q, 'u1')).resolves.toMatchObject({ statementId: Q });
		expect(reads).toEqual([`statements/${Q}`, `statementsSubscribe/u1--${TOP}`]);
	});

	it('refuses a member, a missing doc, and a doc stored under another id', async () => {
		docs.statementsSubscribe[`u1--${TOP}`] = { role: 'member', userId: 'u1', statementId: TOP };
		await expect(assertSynthesisAdmin(Q, 'u1')).rejects.toMatchObject({
			code: 'permission-denied',
		});
		await expect(assertSynthesisAdmin(Q, 'u2')).rejects.toMatchObject({
			code: 'permission-denied',
		});
		// A forged doc whose fields claim TOP but whose id names another statement.
		docs.statementsSubscribe['u3--own'] = { role: 'admin', userId: 'u3', statementId: TOP };
		await expect(assertSynthesisAdmin(Q, 'u3')).rejects.toMatchObject({
			code: 'permission-denied',
		});
	});

	it('uses the question itself when it has no topParentId', async () => {
		docs.statements[Q] = { statementId: Q };
		docs.statementsSubscribe[`u1--${Q}`] = { role: 'admin' };
		await expect(assertSynthesisAdmin(Q, 'u1')).resolves.toBeDefined();
	});

	it('404s an unknown question', async () => {
		await expect(assertSynthesisAdmin('nope', 'u1')).rejects.toMatchObject({ code: 'not-found' });
	});
});
