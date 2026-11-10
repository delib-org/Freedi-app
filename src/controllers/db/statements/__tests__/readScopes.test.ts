import { forgetTreeScopes, listenInScopes, scopeChunksOf } from '../readScopes';

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
		const docs = q.name === 'statementsSubscribe'
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

describe('scopeChunksOf', () => {
	beforeEach(() => {
		forgetTreeScopes();
		mockState.creator = { uid: 'me' };
		mockSubscriptions = [];
		mockRestricted = [];
		mockById = [];
	});

	it('asks only for open content under an open statement', async () => {
		setStatement({ accessScope: 'open' });
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('adds the governing scope for a member of it', async () => {
		setStatement({ accessScope: 'g' });
		mockSubscriptions = [subscription('g', 'member')];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g']]);
	});

	it.each(['waiting', 'banned'])('does not ask for the scope when %s', async (role) => {
		setStatement({ accessScope: 'g' });
		mockSubscriptions = [subscription('g', role)];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('asks for open only as an outsider, so rules have nothing to refuse', async () => {
		setStatement({ accessScope: 'g' });
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('adds the governing scope for its creator', async () => {
		setStatement({ accessScope: 'g', creatorId: 'me' });
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g']]);
	});

	it('adds the governing scope for a host above it', async () => {
		setStatement({ accessScope: 'g', parents: ['mid'] });
		mockSubscriptions = [subscription('mid', 'admin')];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g']]);
	});

	it('gives each further private level its own query', async () => {
		setStatement({ accessScope: 'g' });
		mockSubscriptions = [subscription('g', 'member'), subscription('h', 'member')];
		mockById = [asDoc('g', { accessScope: 'g' }), asDoc('h', { accessScope: 'h' })];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g'], ['h']]);
	});

	it('ignores a subscribed level that is not private of its own', async () => {
		setStatement({ accessScope: 'open' });
		mockSubscriptions = [subscription('x', 'member')];
		mockById = [asDoc('x', { accessScope: 'open' })];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('finds private levels through the top for a host of the top', async () => {
		setStatement({ accessScope: 'open' });
		mockSubscriptions = [subscription('top1', 'admin')];
		mockRestricted = [asDoc('h', {})];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open'], ['h']]);
	});

	it('finds private levels through the top for a system admin', async () => {
		mockState.creator = { uid: 'me', systemAdmin: true };
		setStatement({ accessScope: 'g' });
		mockRestricted = [asDoc('g', {})];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g']]);
	});

	it('asks for open only with nobody signed in', async () => {
		mockState.creator = undefined;
		setStatement({ accessScope: 'g' });
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('asks for open only for a statement it cannot find', async () => {
		mockState.statements = [];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
	});

	it('remembers a tree until told to forget', async () => {
		setStatement({ accessScope: 'g' });
		await scopeChunksOf('s');
		mockSubscriptions = [subscription('g', 'member')];
		await expect(scopeChunksOf('s')).resolves.toEqual([['open']]);
		forgetTreeScopes();
		await expect(scopeChunksOf('s')).resolves.toEqual([['open', 'g']]);
	});
});

describe('listenInScopes', () => {
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	beforeEach(() => {
		forgetTreeScopes();
		mockState.creator = { uid: 'me' };
		mockSubscriptions = [];
		setStatement({ accessScope: 'open' });
	});

	it('starts one listener per chunk and stops them all', async () => {
		const stop = jest.fn();
		const start = jest.fn(() => stop);
		const unsubscribe = listenInScopes('s', start);
		await flush();
		expect(start).toHaveBeenCalledWith(['open']);
		unsubscribe();
		expect(stop).toHaveBeenCalledTimes(1);
	});

	it('starts nothing when stopped before the scopes are known', async () => {
		const start = jest.fn(() => jest.fn());
		listenInScopes('s', start)();
		await flush();
		expect(start).not.toHaveBeenCalled();
	});
});
