import { describe, expect, it } from 'vitest';
import type { TableAssignment } from '@freedi/shared-types';
import { backTargetFor, isStageScreen } from '../hostBack';
import { makeSession } from '../../__tests__/fixtures';

type Status = TableAssignment['status'];

const LIST = '/host';
const HOME = '/host/sessions/session-1';

describe('backTargetFor', () => {
	it('sends Preview back to the list when the status makes Preview the stage', () => {
		const session = makeSession({ status: 'registrationClosed', mode: 'ranked' });

		expect(backTargetFor(session, 'preview')).toEqual({ href: LIST, toList: true });
	});

	it('keeps Preview linked to the assignment when it is not the stage screen', () => {
		expect(backTargetFor(makeSession({ status: 'published' }), 'preview')).toEqual({
			href: HOME,
			toList: false,
		});
		expect(
			backTargetFor(makeSession({ status: 'registrationClosed', mode: 'direct' }), 'preview'),
		).toEqual({ href: HOME, toList: false });
	});

	it.each<Status>(['published', 'ended'])(
		'sends the Assignment back to the list when the session is %s',
		(status) => {
			expect(backTargetFor(makeSession({ status }), 'assignment')).toEqual({
				href: LIST,
				toList: true,
			});
		},
	);

	it('links the Assignment to the home while it is not the stage', () => {
		expect(isStageScreen(makeSession({ status: 'registrationOpen' }), 'assignment')).toBe(false);
		expect(backTargetFor(makeSession({ status: 'registrationClosed' }), 'assignment').href).toBe(
			HOME,
		);
	});

	it('links other screens to the home', () => {
		expect(backTargetFor(makeSession({ status: 'published' }), undefined).href).toBe(HOME);
	});
});
