import type { TableAssignmentStatus } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { fixDetails } from '../fn_tablesFixDetails';
import { HOST, NOW, SID, expectRefusal, seedSession, seedTopics } from './tablesTestKit';

const SESSION = `tableAssignments/${SID}`;
const QUESTION = { label: 'Where do you stand?', poleA: 'Keep', poleB: 'Change' };
const EVENT = { date: '2027-03-19', time: '17:00', place: 'Community club' };

function seeded(
	status: TableAssignmentStatus = 'registrationOpen',
	settings: Record<string, unknown> = {},
	mode: 'ranked' | 'direct' = 'ranked',
): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, { status, mode }, { positionQuestion: QUESTION, ...settings });
	seedTopics(fake, ['a', 'b']);

	return fake;
}

function settingsOf(fake: FakeFirestore): Record<string, unknown> {
	return (fake.read(SESSION) as { settings: Record<string, unknown> }).settings;
}

describe('tablesFixDetails: event', () => {
	it.each<TableAssignmentStatus>(['registrationOpen', 'registrationClosed', 'published'])(
		'saves the event in %s and keeps the other settings',
		async (status) => {
			const fake = seeded(status);
			await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, event: EVENT }, NOW + 1);
			expect(settingsOf(fake)).toMatchObject({
				event: EVENT,
				tableSize: 2,
				positionQuestion: QUESTION,
			});
		},
	);

	it('keeps the event when it is not sent', async () => {
		const fake = seeded('registrationOpen', { event: EVENT });
		await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'Renamed' });
		expect(settingsOf(fake).event).toEqual(EVENT);
	});

	it('clears the event with null', async () => {
		const fake = seeded('registrationClosed', { event: EVENT });
		await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, event: null });
		expect(settingsOf(fake)).not.toHaveProperty('event');
	});

	it('drops an empty part and refuses a bad date', async () => {
		const fake = seeded();
		await fixDetails(fake.asFirestore(), HOST, {
			sessionId: SID,
			event: { date: '2027-03-19', time: '', place: '  ' },
		});
		expect(settingsOf(fake).event).toEqual({ date: '2027-03-19' });
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, event: { date: 'tomorrow' } }),
			'invalid-argument',
		);
	});
});

describe('tablesFixDetails: while registration is open', () => {
	it('saves size, expected people, return by name and the question wording in one write', async () => {
		const fake = seeded();
		await fixDetails(
			fake.asFirestore(),
			HOST,
			{
				sessionId: SID,
				title: 'Renamed',
				tableSize: 6,
				expectedParticipants: 40,
				allowReturnByName: true,
				positionQuestionLabel: '  Do you agree?  ',
				event: EVENT,
			},
			NOW + 5,
		);
		expect(fake.read(SESSION)).toMatchObject({
			title: 'Renamed',
			lastUpdate: NOW + 5,
			settings: {
				tableSize: 6,
				expectedParticipants: 40,
				allowReturnByName: true,
				event: EVENT,
				positionQuestion: { label: 'Do you agree?', poleA: 'Keep', poleB: 'Change' },
			},
		});
	});

	it('clears expected people with null and switches return by name off', async () => {
		const fake = seeded('registrationOpen', { expectedParticipants: 40, allowReturnByName: true });
		await fixDetails(fake.asFirestore(), HOST, {
			sessionId: SID,
			expectedParticipants: null,
			allowReturnByName: false,
		});
		expect(settingsOf(fake)).not.toHaveProperty('expectedParticipants');
		expect(settingsOf(fake).allowReturnByName).toBe(false);
	});

	it.each([1, 21, 3.5])('refuses table size %s', async (tableSize) => {
		const fake = seeded();
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'X', tableSize }),
			'invalid-argument',
		);
		expect(fake.read(SESSION)).toMatchObject({ title: 'Town hall', settings: { tableSize: 2 } });
	});

	it('refuses fewer than one expected person', async () => {
		await expectRefusal(
			fixDetails(seeded().asFirestore(), HOST, { sessionId: SID, expectedParticipants: 0 }),
			'invalid-argument',
		);
	});

	it('refuses a table size change in a direct session, where seats are already counted', async () => {
		const fake = seeded('registrationOpen', {}, 'direct');
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, tableSize: 6 }),
			'failed-precondition',
		);
		expect(settingsOf(fake).tableSize).toBe(2);
	});
});

describe('tablesFixDetails: the question keeps its meaning', () => {
	it('refuses an empty or too long wording', async () => {
		const fake = seeded();
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, positionQuestionLabel: '   ' }),
			'invalid-argument',
		);
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, {
				sessionId: SID,
				positionQuestionLabel: 'x'.repeat(500),
			}),
			'invalid-argument',
		);
	});

	it('does not add a question to a session that has none', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationOpen' });
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, positionQuestionLabel: 'New?' }),
			'invalid-argument',
		);
		expect(settingsOf(fake)).not.toHaveProperty('positionQuestion');
	});

	it('ignores pole changes smuggled into the request', async () => {
		const fake = seeded();
		const sneaky = {
			sessionId: SID,
			positionQuestionLabel: 'Reworded',
			positionQuestion: { label: 'Reworded', poleA: 'Change', poleB: 'Keep' },
		};
		await fixDetails(fake.asFirestore(), HOST, sneaky);
		expect(settingsOf(fake).positionQuestion).toEqual({ ...QUESTION, label: 'Reworded' });
	});
});

describe('tablesFixDetails: after registration closes', () => {
	const refused: Array<[string, Record<string, unknown>]> = [
		['table size', { tableSize: 6 }],
		['expected people', { expectedParticipants: 40 }],
		['return by name', { allowReturnByName: true }],
		['the question wording', { positionQuestionLabel: 'Reworded' }],
	];

	describe.each<TableAssignmentStatus>(['registrationClosed', 'published'])('%s', (status) => {
		it.each(refused)('refuses a change of %s and writes nothing', async (_name, patch) => {
			const fake = seeded(status);
			await expectRefusal(
				fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'Nope', ...patch }),
				'failed-precondition',
			);
			expect(fake.read(SESSION)).toMatchObject({
				title: 'Town hall',
				settings: { tableSize: 2, positionQuestion: QUESTION },
			});
		});

		it('accepts the same values unchanged, so a stale form does not fail', async () => {
			const fake = seeded(status);
			await fixDetails(fake.asFirestore(), HOST, {
				sessionId: SID,
				title: 'Renamed',
				tableSize: 2,
				allowReturnByName: false,
				positionQuestionLabel: QUESTION.label,
			});
			expect(fake.read(SESSION)).toMatchObject({ title: 'Renamed' });
		});
	});
});

describe('tablesFixDetails: who may', () => {
	it('is for the host only, even for the new fields', async () => {
		await expectRefusal(
			fixDetails(seeded().asFirestore(), 'other', { sessionId: SID, tableSize: 6 }),
			'permission-denied',
		);
	});

	it.each<TableAssignmentStatus>(['draft', 'ended'])('is refused in %s', async (status) => {
		await expectRefusal(
			fixDetails(seeded(status).asFirestore(), HOST, { sessionId: SID, event: EVENT }),
			'failed-precondition',
		);
	});
});
