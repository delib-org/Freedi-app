import { Access, StatementType } from '../models/TypeEnums';
import {
	inheritedAccessScope,
	newStatementAccessScope,
	OPEN_ACCESS_SCOPE,
	readScopesOf,
	readScopesOfRoot,
	resolveAccessScope,
	stampAccessScope,
} from '../models/statement/accessScope';
import { createStatementObject } from '../models/statement/StatementUtils';
import { User } from '../models/user/User';

const level = (statementId: string, access?: string) => ({
	statementId,
	...(access ? { membership: { access } } : {}),
});
const home = (statementId: string, access?: string) => ({
	...level(statementId, access),
	statementSettings: { classHome: { kind: 'class' } },
});

describe('resolveAccessScope', () => {
	it.each([Access.public, Access.open, Access.openToAll, Access.openForRegistered])(
		'treats %s as open',
		(access) => {
			expect(resolveAccessScope(level('a', access), [])).toBe(OPEN_ACCESS_SCOPE);
		},
	);

	it.each([Access.moderated, Access.secret])('makes %s its own scope', (access) => {
		expect(resolveAccessScope(level('a', access), [])).toBe('a');
	});

	it('fails closed on an access value it does not know', () => {
		expect(resolveAccessScope(level('a', 'something-new'), [])).toBe('a');
	});

	it('means open when no level has a setting', () => {
		expect(resolveAccessScope(level('a'), [level('b'), level('c')])).toBe(OPEN_ACCESS_SCOPE);
	});

	it('lets a public question inside a private group be open', () => {
		expect(resolveAccessScope(level('q', Access.public), [level('g', Access.secret)])).toBe(
			OPEN_ACCESS_SCOPE,
		);
	});

	it('keeps a private question inside an open top private', () => {
		expect(resolveAccessScope(level('q', Access.moderated), [level('t', Access.public)])).toBe('q');
	});

	it('inherits the nearest setting, not the top', () => {
		const ancestors = [level('p'), level('g', Access.secret), level('t', Access.public)];
		expect(resolveAccessScope(level('a'), ancestors)).toBe('g');
	});

	it('inherits open from the nearest setting over a private top', () => {
		const ancestors = [level('q', Access.openToAll), level('t', Access.secret)];
		expect(resolveAccessScope(level('a'), ancestors)).toBe(OPEN_ACCESS_SCOPE);
	});

	it('makes a class home its own scope whatever it says', () => {
		expect(resolveAccessScope(home('h'), [])).toBe('h');
		expect(resolveAccessScope(home('h', Access.public), [])).toBe('h');
	});

	it('does not inherit from a class home', () => {
		expect(resolveAccessScope(level('lesson'), [home('h', Access.secret)])).toBe(OPEN_ACCESS_SCOPE);
	});
});

describe('newStatementAccessScope', () => {
	it('needs no parent for a top statement', () => {
		expect(newStatementAccessScope({ statementId: 'a', parentId: 'top' })).toBe(OPEN_ACCESS_SCOPE);
	});

	it('uses the own setting before the parent', () => {
		const statement = { statementId: 'a', parentId: 'p', membership: { access: Access.secret } };
		expect(newStatementAccessScope(statement, { accessScope: OPEN_ACCESS_SCOPE })).toBe('a');
	});

	it('inherits the parent scope', () => {
		expect(newStatementAccessScope({ statementId: 'a', parentId: 'p' }, { accessScope: 'g' })).toBe(
			'g',
		);
	});

	it('is unknown under a parent that has no scope yet', () => {
		expect(newStatementAccessScope({ statementId: 'a', parentId: 'p' }, {})).toBeUndefined();
		expect(newStatementAccessScope({ statementId: 'a', parentId: 'p' })).toBeUndefined();
	});

	it('is open under a class home', () => {
		const parent = { accessScope: 'h', statementSettings: { classHome: {} } };
		expect(newStatementAccessScope({ statementId: 'a', parentId: 'h' }, parent)).toBe(
			OPEN_ACCESS_SCOPE,
		);
	});
});

describe('stamping helpers', () => {
	it('stampAccessScope leaves the field off when unknown', () => {
		expect(stampAccessScope({ statementId: 'a', parentId: 'p' })).not.toHaveProperty('accessScope');
	});

	it('stampAccessScope sets the field', () => {
		const stamped = stampAccessScope({ statementId: 'a', parentId: 'p' }, { accessScope: 'g' });
		expect(stamped.accessScope).toBe('g');
	});

	it('inheritedAccessScope spreads to nothing without a scope', () => {
		expect(inheritedAccessScope({})).toEqual({});
		expect(inheritedAccessScope(undefined)).toEqual({});
		expect(inheritedAccessScope({ accessScope: 'g' })).toEqual({ accessScope: 'g' });
	});

	it('inheritedAccessScope is open under a class home', () => {
		const parent = { accessScope: 'h', statementSettings: { classHome: {} } };
		expect(inheritedAccessScope(parent)).toEqual({ accessScope: OPEN_ACCESS_SCOPE });
	});
});

describe('read scopes', () => {
	it('adds a restricted scope to open', () => {
		expect(readScopesOf({ accessScope: 'g' })).toEqual([OPEN_ACCESS_SCOPE, 'g']);
	});

	it('is only open for open or unstamped statements', () => {
		expect(readScopesOf({ accessScope: OPEN_ACCESS_SCOPE })).toEqual([OPEN_ACCESS_SCOPE]);
		expect(readScopesOf({})).toEqual([OPEN_ACCESS_SCOPE]);
		expect(readScopesOf(undefined)).toEqual([OPEN_ACCESS_SCOPE]);
	});

	it('names the root', () => {
		expect(readScopesOfRoot('t')).toEqual([OPEN_ACCESS_SCOPE, 't']);
	});
});

describe('createStatementObject stamping', () => {
	const creator = { uid: 'u', displayName: 'U' } as User;
	const base = { statement: 'text', statementType: StatementType.option, creatorId: 'u', creator };

	it('stamps a top statement open', () => {
		expect(createStatementObject({ ...base, parentId: 'top' })?.accessScope).toBe(
			OPEN_ACCESS_SCOPE,
		);
	});

	it('inherits the given parent scope', () => {
		const made = createStatementObject({ ...base, parentId: 'p', parentAccessScope: 'g' });
		expect(made?.accessScope).toBe('g');
	});

	it('leaves it to the server without one', () => {
		expect(createStatementObject({ ...base, parentId: 'p' })).not.toHaveProperty('accessScope');
	});
});
