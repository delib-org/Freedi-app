import { forgetTreeScopes, levelsTheRulesSee, scopeChunksOf } from '../readScopes';
import type { Statement } from '@freedi/shared-types';

interface FakeDoc {
	id: string;
	data: () => Record<string, unknown>;
}

const mockState: {
	statements: Array<Record<string, unknown>>;
	creator: Record<string, unknown> | undefined;
} = { statements: [], creator: { uid: 'me' } };
let mockSubscriptions: FakeDoc[] = [];
let mockRestricted: FakeDoc[] = [];
let mockById: FakeDoc[] = [];

jest.mock('@/redux/store', () => ({
	store: {
		getState: () => ({
			statements: { statements: mockState.statements },
			creator: { creator: mockState.creator },
		}),
	},
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createCollectionRef: (name: string) => name,
	createStatementRef: (id: string) => id,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	documentId: () => '__name__',
	limit: () => ({}),
	where: (field: string) => ({ field }),
	query: (name: string, ...constraints: Array<{ field?: string }>) => ({
		name,
		fields: constraints.map((constraint) => constraint.field),
	}),
	getDoc: jest.fn(async () => ({ exists: () => false, data: () => undefined })),
	getDocs: jest.fn(async (q: { name: string; fields: string[] }) => {
		const docs =
			q.name === 'statementsSubscribe'
				? mockSubscriptions
				: q.fields.includes('membership.access')
					? mockRestricted
					: mockById;

		return { docs, forEach: (run: (doc: FakeDoc) => void) => docs.forEach(run) };
	}),
}));

const asDoc = (id: string, data: Record<string, unknown>): FakeDoc => ({ id, data: () => data });
const subscription = (statementId: string, role: string) =>
	asDoc(`me--${statementId}`, { statementId, role });

const setStatement = (fields: Record<string, unknown>) => {
	mockState.statements = [{ statementId: 's', topParentId: 'top1', parents: ['top1'], ...fields }];
};

describe('a host the rules cannot see', () => {
	beforeEach(() => {
		forgetTreeScopes();
		mockState.creator = { uid: 'me' };
		mockSubscriptions = [];
		mockRestricted = [];
		mockById = [];
	});

	// g sits six levels under the top: the rules read roles on g, its four
	// nearest listed ancestors (l2..l5) and the top, never on l1.
	const deep = {
		statementId: 'g',
		accessScope: 'g',
		topParentId: 'top1',
		parents: ['top1', 'l1', 'l2', 'l3', 'l4', 'l5'],
	};

	it('lists the levels the rules read roles on', () => {
		expect(levelsTheRulesSee(deep as unknown as Statement)).toEqual([
			'g',
			'l2',
			'l3',
			'l4',
			'l5',
			'top1',
		]);
	});

	it('leaves out "top" and the level itself from its ancestors', () => {
		const top = { statementId: 'g', topParentId: 'g', parents: ['top', 'g'] };
		expect(levelsTheRulesSee(top as unknown as Statement)).toEqual(['g']);
	});

	it('does not name the scope for a host beyond their reach, so open content still loads', async () => {
		setStatement(deep);
		mockSubscriptions = [subscription('l1', 'admin')];
		await expect(scopeChunksOf('g')).resolves.toEqual([['open']]);
	});

	it('names it for a host within reach', async () => {
		setStatement(deep);
		mockSubscriptions = [subscription('l2', 'admin')];
		await expect(scopeChunksOf('g')).resolves.toEqual([['open', 'g']]);
	});

	it('names it for a host of the top, however deep', async () => {
		setStatement(deep);
		mockSubscriptions = [subscription('top1', 'admin')];
		await expect(scopeChunksOf('g')).resolves.toEqual([['open', 'g']]);
	});
});
