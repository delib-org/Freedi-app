/**
 * Comprehensive tests for roleHelpers
 *
 * Tests: canBanUser, getBanDisabledReason, isAdminRole
 */

// Mock @freedi/shared-types before import
jest.mock('@freedi/shared-types', () => ({
	Role: {
		admin: 'admin',
		creator: 'creator',
		member: 'member',
		waiting: 'waiting',
		banned: 'banned',
	},
}));

// Local enum matching the mock
enum Role {
	admin = 'admin',
	creator = 'creator',
	member = 'member',
	waiting = 'waiting',
	banned = 'banned',
}

import { canBanUser, getBanDisabledReason, isAdminRole } from '../roleHelpers';

// Minimal statement shape for tests
interface MockStatement {
	statementId: string;
	creator?: {
		uid: string;
	};
}

function buildStatement(overrides: Partial<MockStatement> = {}): MockStatement {
	return {
		statementId: 'stmt-1',
		creator: { uid: 'creator-user' },
		...overrides,
	};
}

// -----------------------------------------------------------------------
// canBanUser
// -----------------------------------------------------------------------
describe('canBanUser', () => {
	describe('should return false when', () => {
		it('targetRole is undefined', () => {
			expect(canBanUser(undefined, 'user-1', buildStatement() as never)).toBe(false);
		});

		it('statement is undefined', () => {
			expect(canBanUser(Role.member as never, 'user-1', undefined)).toBe(false);
		});

		it('both targetRole and statement are undefined', () => {
			expect(canBanUser(undefined, 'user-1', undefined)).toBe(false);
		});

		it('target has admin role', () => {
			expect(canBanUser(Role.admin as never, 'other-user', buildStatement() as never)).toBe(false);
		});

		it('target has creator role', () => {
			expect(canBanUser(Role.creator as never, 'other-user', buildStatement() as never)).toBe(
				false,
			);
		});

		it('target is the statement creator (UID match)', () => {
			const statement = buildStatement({ creator: { uid: 'target-user' } });
			expect(canBanUser(Role.member as never, 'target-user', statement as never)).toBe(false);
		});
	});

	describe('should return true when', () => {
		it('target is a regular member', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			expect(canBanUser(Role.member as never, 'regular-user', statement as never)).toBe(true);
		});

		it('target has waiting role', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			expect(canBanUser(Role.waiting as never, 'waiting-user', statement as never)).toBe(true);
		});

		it('target is already banned (can re-ban)', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			expect(canBanUser(Role.banned as never, 'banned-user', statement as never)).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('statement has no creator property', () => {
			const statement = buildStatement({ creator: undefined });
			// No creator.uid match → should allow banning a member
			expect(canBanUser(Role.member as never, 'some-user', statement as never)).toBe(true);
		});

		it('target user ID matches statement creator UID even with member role', () => {
			const statement = buildStatement({ creator: { uid: 'owner-uid' } });
			// creator owns statement → cannot ban
			expect(canBanUser(Role.member as never, 'owner-uid', statement as never)).toBe(false);
		});
	});
});

// -----------------------------------------------------------------------
// getBanDisabledReason
// -----------------------------------------------------------------------
describe('getBanDisabledReason', () => {
	describe('should return a reason string when banning is not allowed', () => {
		it('should return reason when targetRole is undefined', () => {
			const reason = getBanDisabledReason(undefined, 'user-1', buildStatement() as never);
			expect(typeof reason).toBe('string');
			expect(reason).not.toBeNull();
		});

		it('should return reason when statement is undefined', () => {
			const reason = getBanDisabledReason(Role.member as never, 'user-1', undefined);
			expect(reason).toBe('User information unavailable');
		});

		it('should return "Cannot ban administrators" for admin role', () => {
			const reason = getBanDisabledReason(Role.admin as never, 'admin-user', buildStatement() as never);
			expect(reason).toBe('Cannot ban administrators');
		});

		it('should return "Cannot ban statement creators" for creator role', () => {
			const statement = buildStatement({ creator: { uid: 'other-uid' } });
			const reason = getBanDisabledReason(Role.creator as never, 'creator-role-user', statement as never);
			expect(reason).toBe('Cannot ban statement creators');
		});

		it('should return "Cannot ban the statement creator" when userId matches creator', () => {
			const statement = buildStatement({ creator: { uid: 'owner-uid' } });
			const reason = getBanDisabledReason(Role.member as never, 'owner-uid', statement as never);
			expect(reason).toBe('Cannot ban the statement creator');
		});
	});

	describe('should return null when banning IS allowed', () => {
		it('should return null for a regular member', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			const reason = getBanDisabledReason(Role.member as never, 'regular-user', statement as never);
			expect(reason).toBeNull();
		});

		it('should return null for a waiting user', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			const reason = getBanDisabledReason(Role.waiting as never, 'waiting-user', statement as never);
			expect(reason).toBeNull();
		});

		it('should return null for an already-banned user', () => {
			const statement = buildStatement({ creator: { uid: 'other-creator' } });
			const reason = getBanDisabledReason(Role.banned as never, 'banned-user', statement as never);
			expect(reason).toBeNull();
		});
	});

	describe('priority of checks', () => {
		it('should check creator UID match BEFORE role check', () => {
			// User is the creator but has member role
			const statement = buildStatement({ creator: { uid: 'owner-uid' } });
			const reason = getBanDisabledReason(Role.member as never, 'owner-uid', statement as never);
			// Creator UID match should be checked first
			expect(reason).toBe('Cannot ban the statement creator');
		});
	});
});

// -----------------------------------------------------------------------
// isAdminRole
// -----------------------------------------------------------------------
describe('isAdminRole', () => {
	it('should return true for admin role', () => {
		expect(isAdminRole(Role.admin as never)).toBe(true);
	});

	it('should return true for creator role', () => {
		expect(isAdminRole(Role.creator as never)).toBe(true);
	});

	it('should return false for member role', () => {
		expect(isAdminRole(Role.member as never)).toBe(false);
	});

	it('should return false for waiting role', () => {
		expect(isAdminRole(Role.waiting as never)).toBe(false);
	});

	it('should return false for banned role', () => {
		expect(isAdminRole(Role.banned as never)).toBe(false);
	});

	it('should return false for undefined', () => {
		expect(isAdminRole(undefined)).toBe(false);
	});
});
