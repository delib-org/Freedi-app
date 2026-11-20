import { describe, expect, it } from 'vitest';
import type { ClassRegistration, TableAssignment } from '@freedi/shared-types';
import {
	canCloseRegistration,
	connectableRegistrations,
	copyOfferOf,
	isConnectedLesson,
	isSeatingCopied,
	refusalKeyOf,
	registrationAskedPosition,
	registrationReasonOf,
	registrationStatusKey,
	sidesShownAt,
	tablesRegistrationUrl,
	withoutTableCount,
} from '../registrationLogic';

function assignment(
	id: string,
	status: TableAssignment['status'],
	createdAt: number,
	contextStatementId?: string,
): TableAssignment {
	return {
		tableAssignmentId: id,
		hostUid: 'teacher',
		title: id,
		mode: 'ranked',
		status,
		settings: {},
		createdAt,
		lastUpdate: createdAt,
		...(contextStatementId ? { contextStatementId } : {}),
	} as TableAssignment;
}

function lesson(registration?: Partial<ClassRegistration>): {
	statementSettings: { classRegistration?: ClassRegistration };
} {
	return {
		statementSettings: registration
			? { classRegistration: { tableAssignmentId: 'r1', connectedAt: 1, ...registration } }
			: {},
	};
}

describe('connectableRegistrations', () => {
	const rows = [
		assignment('ended', 'ended', 50),
		assignment('other-lesson', 'registrationOpen', 40, 'someone-else'),
		assignment('old-open', 'registrationOpen', 10),
		assignment('new-open', 'registrationOpen', 30),
		assignment('this-lesson', 'published', 20, 'lesson1'),
		assignment('closed', 'registrationClosed', 60),
	];

	it('drops ended registrations and ones connected to another lesson', () => {
		const ids = connectableRegistrations(rows, 'lesson1').map((row) => row.tableAssignmentId);
		expect(ids).not.toContain('ended');
		expect(ids).not.toContain('other-lesson');
		expect(ids).toContain('this-lesson');
	});

	it('lists open registrations first, newest first inside each group', () => {
		const ids = connectableRegistrations(rows, 'lesson1').map((row) => row.tableAssignmentId);
		expect(ids).toEqual(['new-open', 'old-open', 'closed', 'this-lesson']);
	});

	it('is empty when the teacher hosts nothing', () => {
		expect(connectableRegistrations([], 'lesson1')).toEqual([]);
	});
});

describe('connected lesson readers', () => {
	it('knows whether a lesson is connected and whether the seating was copied', () => {
		expect(isConnectedLesson(lesson())).toBe(false);
		expect(isConnectedLesson(lesson({}))).toBe(true);
		expect(isSeatingCopied(lesson({}))).toBe(false);
		expect(isSeatingCopied(lesson({ seatingCopiedAt: 5 }))).toBe(true);
	});

	it('reads "the registration asked a position" from the removed side step', () => {
		expect(registrationAskedPosition(lesson({ sideStepRemoved: true }))).toBe(true);
		expect(registrationAskedPosition(lesson({}))).toBe(false);
		expect(registrationAskedPosition(lesson())).toBe(false);
	});
});

describe('copyOfferOf (the Tables step of a connected lesson)', () => {
	const base = {
		connected: true,
		copied: false,
		status: 'published' as const,
		splitByTopic: false,
		stepKey: 'tables' as const,
	};

	it('leaves an unconnected lesson with the ordinary split button', () => {
		expect(copyOfferOf({ ...base, connected: false })).toEqual({ kind: 'ordinary' });
	});

	it('offers the first copy once the registration is published', () => {
		expect(copyOfferOf(base)).toEqual({ kind: 'copy' });
	});

	it('says what is missing before publishing, by mode', () => {
		expect(copyOfferOf({ ...base, status: 'registrationOpen' })).toEqual({
			kind: 'not-ready',
			reasonKey: 'console.copy_seating.not_ready.ranked',
		});
		expect(copyOfferOf({ ...base, status: 'registrationOpen', splitByTopic: true })).toEqual({
			kind: 'not-ready',
			reasonKey: 'console.copy_seating.not_ready.direct',
		});
		expect(copyOfferOf({ ...base, status: undefined })).toMatchObject({ kind: 'not-ready' });
	});

	it('offers "update from the registration" only at the Tables step', () => {
		expect(copyOfferOf({ ...base, copied: true })).toEqual({ kind: 'again' });
		expect(copyOfferOf({ ...base, copied: true, stepKey: 'tableTalk' })).toEqual({
			kind: 'ordinary',
		});
	});
});

describe('refusals and labels', () => {
	it('reads the reason a bridge callable attached', () => {
		expect(registrationReasonOf({ details: { reason: 'seating-copied' } })).toBe('seating-copied');
		expect(registrationReasonOf({ details: {} })).toBeUndefined();
		expect(registrationReasonOf(null)).toBeUndefined();
		expect(registrationReasonOf(new Error('x'))).toBeUndefined();
	});

	it('names every refusal the screens explain, and no other', () => {
		expect(refusalKeyOf('seating-copied')).toBe('console.copy_seating.copied_already');
		expect(refusalKeyOf('not-tables-step')).toBe('console.copy_seating.not_tables_step');
		expect(refusalKeyOf('seat-taken')).toBe('console.no_device.seat_taken');
		expect(refusalKeyOf('seat-link-inactive')).toBeNull();
		expect(refusalKeyOf(undefined)).toBeNull();
	});

	it('closes only a registration that still takes sign-ups', () => {
		expect(canCloseRegistration('registrationOpen')).toBe(true);
		expect(canCloseRegistration('registrationClosed')).toBe(false);
		expect(canCloseRegistration(undefined)).toBe(false);
	});

	it('keys the status chip and links to the registration in Tables', () => {
		expect(registrationStatusKey('published')).toBe('console.register_ahead.status.published');
		expect(registrationStatusKey(undefined)).toBe('console.register_ahead.status.draft');
		expect(tablesRegistrationUrl('a b')).toBe('https://tables.wizcol.com/host/sessions/a%20b');
	});
});

describe('the board of a connected lesson', () => {
	it('counts the students at no table', () => {
		const tables = [{ memberUids: ['a', 'b'] }, { memberUids: ['c'] }];
		expect(withoutTableCount(['a', 'b', 'c', 'd', 'e'], tables)).toBe(2);
		expect(withoutTableCount([], tables)).toBe(0);
	});

	it('marks sides only from a Side step that exists', () => {
		const withSide = ['waiting', 'opening', 'side', 'tables', 'tableTalk'] as const;
		const withoutSide = ['waiting', 'opening', 'tables', 'tableTalk'] as const;
		expect(sidesShownAt(withSide, 0)).toBe(false);
		expect(sidesShownAt(withSide, 1)).toBe(false);
		expect(sidesShownAt(withSide, 2)).toBe(true);
		expect(sidesShownAt(withSide, 3)).toBe(true);
		// from Investigation on the marks are gone
		expect(sidesShownAt(withSide, 4)).toBe(false);
		// the old fixed index 2 would have marked the Tables step of a lesson with no Side step
		expect(sidesShownAt(withoutSide, 2)).toBe(false);
		expect(sidesShownAt(withoutSide, 3)).toBe(false);
	});
});
