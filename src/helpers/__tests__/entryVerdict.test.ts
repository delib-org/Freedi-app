import { Access, Role, Statement } from '@freedi/shared-types';
import {
	getEntryVerdict,
	getInheritedLevelId,
	getLevelAccess,
	getLevelsAbove,
	getSubscriptionScopeId,
	isProvenOpen,
} from '../entryVerdict';

const signedIn = { uid: 'u1', isAnonymous: false };
const anonymous = { uid: 'a1', isAnonymous: true };

function level(access?: Access, creatorUid = 'someone-else'): Statement {
	return {
		statementId: 'level',
		topParentId: 'group',
		creator: { uid: creatorUid },
		membership: access ? { access } : undefined,
	} as Statement;
}

const topParent = (access: Access) => ({ membership: { access } }) as Statement;

describe('getEntryVerdict', () => {
	it('says gone for a level that could not be read', () => {
		expect(getEntryVerdict(undefined, undefined, undefined, signedIn)).toBe('gone');
	});

	it('opens a public level to anyone, even someone banned', () => {
		expect(getEntryVerdict(level(Access.public), undefined, undefined, anonymous)).toBe('open');
		expect(getEntryVerdict(level(Access.public), undefined, { role: Role.banned }, signedIn)).toBe(
			'open',
		);
	});

	it("lets a level's own access win over the top parent's", () => {
		expect(
			getEntryVerdict(level(Access.public), topParent(Access.secret), undefined, anonymous),
		).toBe('open');
		expect(
			getEntryVerdict(level(Access.secret), topParent(Access.public), undefined, anonymous),
		).toBe('closed');
	});

	it("falls back to the top parent's access", () => {
		expect(getEntryVerdict(level(), topParent(Access.public), undefined, anonymous)).toBe('open');
		expect(getEntryVerdict(level(), topParent(Access.secret), undefined, anonymous)).toBe('closed');
	});

	it.each([Role.member, Role.admin, Role.creator])('opens a secret level to %s', (role) => {
		expect(getEntryVerdict(level(Access.secret), undefined, { role }, signedIn)).toBe('open');
	});

	it('does not open a secret level to its creator without a role, as the database reads it', () => {
		expect(getEntryVerdict(level(Access.secret, 'u1'), undefined, undefined, signedIn)).toBe(
			'closed',
		);
	});

	it('still opens an open level to its creator', () => {
		const anonymousCreator = { uid: 'u1', isAnonymous: true };
		expect(
			getEntryVerdict(
				level(Access.openForRegistered, 'u1'),
				undefined,
				undefined,
				anonymousCreator,
			),
		).toBe('open');
	});

	it('says waiting for a pending request', () => {
		expect(
			getEntryVerdict(level(Access.moderated), undefined, { role: Role.waiting }, signedIn),
		).toBe('waiting');
	});

	it('opens an open-to-all level, but not to someone banned', () => {
		expect(getEntryVerdict(level(Access.openToAll), undefined, undefined, anonymous)).toBe('open');
		expect(
			getEntryVerdict(level(Access.openToAll), undefined, { role: Role.banned }, signedIn),
		).toBe('closed');
	});

	it('opens a registered-only level to a signed-in person only', () => {
		const registeredOnly = level(Access.openForRegistered);

		expect(getEntryVerdict(registeredOnly, undefined, undefined, signedIn)).toBe('open');
		expect(getEntryVerdict(registeredOnly, undefined, undefined, anonymous)).toBe('closed');
		expect(getEntryVerdict(registeredOnly, undefined, { role: Role.banned }, signedIn)).toBe(
			'closed',
		);
	});

	it('closes moderated and secret levels to someone with no role', () => {
		expect(getEntryVerdict(level(Access.moderated), undefined, undefined, signedIn)).toBe('closed');
		expect(getEntryVerdict(level(Access.secret), undefined, undefined, signedIn)).toBe('closed');
	});

	it('closes a level whose access is unknown', () => {
		expect(getEntryVerdict(level(), undefined, undefined, signedIn)).toBe('closed');
	});
});

describe('isProvenOpen', () => {
	it('is proven by public access alone', () => {
		expect(isProvenOpen(level(Access.public), undefined, undefined, anonymous)).toBe(true);
	});

	it("is not proven by being a private level's creator", () => {
		expect(isProvenOpen(level(Access.secret, 'u1'), undefined, undefined, signedIn)).toBe(false);
	});

	it.each([Role.member, Role.admin, Role.creator])('is proven by a loaded %s role', (role) => {
		expect(isProvenOpen(level(Access.secret), undefined, { role }, signedIn)).toBe(true);
	});

	describe.each([Access.openToAll, Access.openForRegistered])('on %s', (access) => {
		it('is not proven by a missing subscription', () => {
			expect(getEntryVerdict(level(access), undefined, undefined, signedIn)).toBe('open');
			expect(isProvenOpen(level(access), undefined, undefined, signedIn)).toBe(false);
		});

		it('is proven by a loaded ordinary subscription', () => {
			expect(isProvenOpen(level(access), undefined, { role: Role.unsubscribed }, signedIn)).toBe(
				true,
			);
		});

		it.each([Role.banned, Role.waiting])('is not proven by a loaded %s role', (role) => {
			expect(isProvenOpen(level(access), undefined, { role }, signedIn)).toBe(false);
		});
	});

	it('is not proven for an unknown level', () => {
		expect(isProvenOpen(undefined, undefined, undefined, signedIn)).toBe(false);
	});

	it('is not proven on a closed level', () => {
		expect(isProvenOpen(level(Access.secret), undefined, undefined, signedIn)).toBe(false);
	});
});

describe('getSubscriptionScopeId', () => {
	it('uses the level when it has its own access, else the top parent', () => {
		expect(getSubscriptionScopeId(level(Access.public))).toBe('level');
		expect(getSubscriptionScopeId(level())).toBe('group');
		expect(getSubscriptionScopeId(undefined)).toBeUndefined();
	});
});

describe('getLevelsAbove', () => {
	it('walks parents nearest first and skips top', () => {
		expect(
			getLevelsAbove({
				statementId: 'q',
				parents: ['top', 'group', 'mid'],
				parentId: 'mid',
				topParentId: 'group',
			}),
		).toEqual(['mid', 'group']);
	});

	it('falls back to parentId and topParentId when parents is missing', () => {
		expect(getLevelsAbove({ statementId: 'q', parentId: 'mid', topParentId: 'group' })).toEqual([
			'mid',
			'group',
		]);
	});

	it('has nothing above a top-level statement', () => {
		expect(getLevelsAbove({ statementId: 'q', parentId: 'top', topParentId: 'q' })).toEqual([]);
	});
});

describe('the governing level from accessScope', () => {
	const scoped = (accessScope: string, access?: Access) =>
		({ ...level(access), accessScope }) as Statement;
	const middle = topParent(Access.secret);

	it('is the named level when private', () => {
		expect(getSubscriptionScopeId(scoped('middle'))).toBe('middle');
	});

	it('is the level itself when it is its own scope', () => {
		expect(getSubscriptionScopeId(scoped('level', Access.secret))).toBe('level');
	});

	it('falls back on own, then top, when open or unstamped', () => {
		expect(getSubscriptionScopeId(scoped('open', Access.public))).toBe('level');
		expect(getSubscriptionScopeId(scoped('open'))).toBe('group');
		expect(getSubscriptionScopeId(level())).toBe('group');
	});

	it('closes a new child under a private middle level inside an open top', () => {
		expect(getEntryVerdict(scoped('middle'), middle, undefined, signedIn)).toBe('closed');
	});

	it('lets a member of that middle level in', () => {
		expect(getEntryVerdict(scoped('middle'), middle, { role: Role.member }, signedIn)).toBe('open');
	});

	it('shows waiting at that middle level', () => {
		expect(getEntryVerdict(scoped('middle'), middle, { role: Role.waiting }, signedIn)).toBe(
			'waiting',
		);
	});

	it('ignores an old open setting copied below a private scope', () => {
		expect(getLevelAccess(scoped('middle', Access.openToAll), middle)).toBe(Access.secret);
	});

	it('opens a level stamped open even under a private top', () => {
		expect(getEntryVerdict(scoped('open'), middle, undefined, signedIn)).toBe('open');
	});

	it('means open when no level has a setting', () => {
		expect(getLevelAccess(scoped('open'), undefined)).toBe(Access.openToAll);
	});

	it('knows nothing yet for a private scope it has not loaded', () => {
		expect(getLevelAccess(scoped('middle'), undefined)).toBeUndefined();
	});

	it('keeps the old answer for an unstamped level', () => {
		expect(getLevelAccess(level(), topParent(Access.moderated))).toBe(Access.moderated);
	});

	it('inherits from a nearer private level, else the top', () => {
		expect(getInheritedLevelId(scoped('middle'))).toBe('middle');
		expect(getInheritedLevelId(scoped('level', Access.secret))).toBe('group');
		expect(getInheritedLevelId(scoped('open'))).toBe('group');
	});
});
