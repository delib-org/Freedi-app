import type { Statement, StatementSubscription } from '@freedi/shared-types';
import { creatorOf } from '../classroomMembers';

const main = {
	creatorId: 'teacher',
	creator: { uid: 'teacher', displayName: 'Lead Teacher', isAnonymous: false },
} as Statement;

const subWith = (user: Partial<StatementSubscription['user']>): StatementSubscription =>
	({ user }) as StatementSubscription;

describe('creatorOf', () => {
	it('keeps a co-teacher with a repaired subscription a real account, under their own name', () => {
		const sub = subWith({ uid: 'co', displayName: 'Co Teacher', isAnonymous: false });

		expect(creatorOf('co', sub, main)).toEqual({
			uid: 'co',
			displayName: 'Co Teacher',
			photoURL: null,
			isAnonymous: false,
		});
	});

	it('keeps a student anonymous', () => {
		const sub = subWith({ uid: 's', displayName: 'Dana', isAnonymous: true });

		expect(creatorOf('s', sub, main).isAnonymous).toBe(true);
	});

	it('falls back to the statement creator for the teacher with no subscription', () => {
		expect(creatorOf('teacher', undefined, main)).toMatchObject({
			displayName: 'Lead Teacher',
			isAnonymous: false,
		});
	});
});
