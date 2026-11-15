import { describe, expect, it } from 'vitest';
import type { TableAssignment, TableAssignmentTopic } from '@freedi/shared-types';
import {
	canFixRegistration,
	fixDetailsDraft,
	fixDetailsProblem,
	fixDetailsRequest,
	isTableSizeFixed,
} from '@/logic/fixDetails';
import type { FixDetailsDraft } from '@/logic/fixDetails';

const QUESTION = { label: 'Where do you stand?', poleA: 'Keep', poleB: 'Change' };
const EVENT = { date: '2027-03-19', time: '17:00', place: 'Club' };

function session(patch: Partial<TableAssignment> = {}): TableAssignment {
	return {
		tableAssignmentId: 'S1',
		hostUid: 'host',
		title: 'Town hall',
		mode: 'ranked',
		status: 'registrationOpen',
		settings: {
			tableSize: 6,
			balanceTolerance: 0.3,
			positionQuestion: QUESTION,
			expectedParticipants: 30,
			allowReturnByName: false,
			event: EVENT,
		},
		createdAt: 1,
		lastUpdate: 1,
		...patch,
	};
}

const TOPICS: TableAssignmentTopic[] = [
	{ topicId: 'a', sessionId: 'S1', title: 'Parks', order: 0 },
	{ topicId: 'b', sessionId: 'S1', title: 'Roads', order: 1 },
];

function draftOf(s: TableAssignment, edit: (draft: FixDetailsDraft) => void = () => {}) {
	const draft = fixDetailsDraft(s, TOPICS);

	edit(draft);

	return draft;
}

describe('fixDetailsDraft', () => {
	it('starts from what is stored, event included', () => {
		const draft = draftOf(session());

		expect(draft.setup).toMatchObject({
			title: 'Town hall',
			seats: '6',
			expected: '30',
			question: QUESTION.label,
			eventDate: EVENT.date,
			eventTime: EVENT.time,
			eventPlace: EVENT.place,
			allowReturn: false,
		});
		expect(draft.topics).toEqual([
			{ topicId: 'a', title: 'Parks' },
			{ topicId: 'b', title: 'Roads' },
		]);
	});
});

describe('stage rules', () => {
	it('registration fields are for open registration only', () => {
		expect(canFixRegistration({ status: 'registrationOpen' })).toBe(true);
		expect(canFixRegistration({ status: 'registrationClosed' })).toBe(false);
		expect(canFixRegistration({ status: 'published' })).toBe(false);
	});

	it('the table size is fixed in a free-seating gathering', () => {
		expect(isTableSizeFixed({ mode: 'direct' })).toBe(true);
		expect(isTableSizeFixed({ mode: 'ranked' })).toBe(false);
	});
});

describe('fixDetailsRequest', () => {
	it('sends only the name and topics when nothing else changed', () => {
		const s = session();

		expect(fixDetailsRequest(s, draftOf(s))).toEqual({
			sessionId: 'S1',
			title: 'Town hall',
			topics: [
				{ topicId: 'a', title: 'Parks' },
				{ topicId: 'b', title: 'Roads' },
			],
		});
	});

	it('sends every changed open-registration field, trimmed', () => {
		const s = session();
		const request = fixDetailsRequest(
			s,
			draftOf(s, ({ setup }) => {
				setup.seats = '8';
				setup.expected = '45';
				setup.allowReturn = true;
				setup.question = '  Do you agree?  ';
				setup.eventPlace = 'Library';
			}),
		);

		expect(request).toMatchObject({
			tableSize: 8,
			expectedParticipants: 45,
			allowReturnByName: true,
			positionQuestionLabel: 'Do you agree?',
			event: { date: EVENT.date, time: EVENT.time, place: 'Library' },
		});
	});

	it('clears expected people and the event when emptied', () => {
		const s = session();
		const request = fixDetailsRequest(
			s,
			draftOf(s, ({ setup }) => {
				setup.expected = '';
				setup.eventDate = '';
				setup.eventTime = '';
				setup.eventPlace = '';
			}),
		);

		expect(request).toMatchObject({ expectedParticipants: null, event: null });
	});

	it('never sends the question ends: only the wording', () => {
		const s = session();
		const request = fixDetailsRequest(
			s,
			draftOf(s, ({ setup }) => {
				setup.poleA = 'Swapped';
				setup.poleB = 'Swapped too';
				setup.question = 'New wording';
			}),
		);

		expect(request).not.toHaveProperty('positionQuestion');
		expect(JSON.stringify(request)).not.toContain('Swapped');
		expect(request?.positionQuestionLabel).toBe('New wording');
	});

	it('after registration closes sends the event and titles, never the open-only fields', () => {
		const s = session({ status: 'registrationClosed' });
		const request = fixDetailsRequest(
			s,
			draftOf(s, ({ setup }) => {
				setup.seats = '9';
				setup.expected = '99';
				setup.allowReturn = true;
				setup.question = 'Nope';
				setup.eventPlace = 'Library';
			}),
		);

		expect(request).toEqual({
			sessionId: 'S1',
			title: 'Town hall',
			topics: expect.any(Array),
			event: { date: EVENT.date, time: EVENT.time, place: 'Library' },
		});
	});

	it('does not send a table size in a free-seating gathering', () => {
		const s = session({ mode: 'direct' });
		const request = fixDetailsRequest(
			s,
			draftOf(s, ({ setup }) => {
				setup.seats = '9';
			}),
		);

		expect(request).not.toHaveProperty('tableSize');
	});

	it('sends no question wording when the session has no question', () => {
		const s = session({ settings: { tableSize: 6, balanceTolerance: 0.3 } });
		const request = fixDetailsRequest(s, draftOf(s));

		expect(request).not.toHaveProperty('positionQuestionLabel');
	});
});

describe('fixDetailsProblem', () => {
	it.each([
		['seats', (d: FixDetailsDraft) => (d.setup.seats = '1')],
		['seats', (d: FixDetailsDraft) => (d.setup.seats = '21')],
		['seats', (d: FixDetailsDraft) => (d.setup.seats = '')],
		['expected', (d: FixDetailsDraft) => (d.setup.expected = '0')],
		['expected', (d: FixDetailsDraft) => (d.setup.expected = 'many')],
		['question', (d: FixDetailsDraft) => (d.setup.question = '  ')],
		['name', (d: FixDetailsDraft) => (d.setup.title = ' ')],
		['topics', (d: FixDetailsDraft) => (d.topics[1].title = '')],
	])('stops on %s', (problem, edit) => {
		const s = session();
		const draft = draftOf(s, (d) => {
			edit(d);
		});

		expect(fixDetailsProblem(s, draft)).toBe(problem);
		expect(fixDetailsRequest(s, draft)).toBeNull();
	});

	it('does not check fields it does not offer after close', () => {
		const s = session({ status: 'registrationClosed' });
		const draft = draftOf(s, ({ setup }) => {
			setup.seats = '1';
			setup.question = '';
		});

		expect(fixDetailsProblem(s, draft)).toBeNull();
	});

	it('keeps a legacy smaller table size while it is not changed', () => {
		const s = session({ settings: { tableSize: 3, balanceTolerance: 0.3 } });

		expect(fixDetailsProblem(s, draftOf(s))).toBeNull();
	});
});
