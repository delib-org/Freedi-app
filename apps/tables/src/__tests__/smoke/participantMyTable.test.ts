// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { ParticipantMyTable } from '@/views/participant/ParticipantMyTable';
import {
	makeParticipant,
	makeRosterEntry,
	makeRun,
	makeSession,
	NOW,
	SESSION_ID,
} from '../fixtures';
import { renderScreen } from './testHarness';
import {
	clickButton,
	HOME,
	ID,
	mocks,
	registered,
	settle,
	useParticipantScreens,
} from './participantMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./participantMocks')).mocks.api,
}));
vi.mock('@/lib/navigate', async () => {
	const { mocks } = await import('./participantMocks');

	return { goTo: mocks.goTo, replaceWith: mocks.replaceWith };
});
vi.mock('@/lib/auth', () => ({ ensureParticipantUser: async () => ({ uid: 'u1' }) }));
vi.mock('@/lib/tableAssignment/data', async () =>
	(await import('./participantMocks')).fakeDataModule(),
);

useParticipantScreens();

describe('my table', () => {
	function published(preferences: string[]): void {
		mocks.store.current.me = makeParticipant('u1', { preferences });
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.run = makeRun({ status: 'published', publishedAt: NOW });
		mocks.store.current.everyone = [
			makeRosterEntry('u1'),
			makeRosterEntry('u2', { fullName: 'Omar Cohen' }),
		];
	}

	it('says the topics are still loading or failed, instead of naming the table "unknown"', async () => {
		published(['a']);
		mocks.store.current.failTopicsWith = 'unavailable';

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.state.error']);
		expect(text).not.toContain(en['tableAssignment.topic.unknown']);
	});

	it('waits when nothing is published', async () => {
		registered();
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		mocks.store.current.run = makeRun({ status: 'ready' });

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.waiting']);
		expect(text).not.toContain('Topic a');
	});

	it('never shows a draft run, even when the session points at it', async () => {
		registered();
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.run = makeRun({ status: 'ready' });

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.waiting']);
	});

	it('shows the number, the topic, which choice it was, and who sits with me', async () => {
		published(['a']);

		const { text, root } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.table-art__number')?.textContent).toBe('1');
		expect(root.querySelector('svg.table-art')?.getAttribute('aria-label')).toBe('Table number 1');
		expect(text).toContain('Topic a');
		expect(text).toContain(en['tableAssignment.myTable.pill.1']);
		expect(text).toContain('Omar Cohen');
		expect(root.querySelector('.my-table__names')?.textContent).not.toContain('Name u1');
	});

	it('says so, and thanks the person, when the table is outside their choices', async () => {
		published(['b']);

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.pill.outside']);
		expect(text).toContain(en['tableAssignment.myTable.outsideNote']);
	});

	it('shows no pill to someone seated without ranking', async () => {
		published([]);

		const { root } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.my-table__pill')).toBeNull();
	});

	it('sends a registered person with no table back to the link page, where the host seats them', async () => {
		published(['a']);
		mocks.store.current.run = makeRun({
			status: 'published',
			tables: [
				{
					index: 0,
					topicId: 'a',
					memberUids: ['u2'],
					stats: { n: 1, mean: [0.5], sd: [0], deviation: 0 },
				},
			],
		});

		await renderScreen(ParticipantMyTable, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});

	it('goes home when not registered', async () => {
		await renderScreen(ParticipantMyTable, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});

	it('shows the chosen table and who chose it too in free mode', async () => {
		mocks.store.current.session = makeSession({ mode: 'direct', status: 'registrationClosed' });
		mocks.store.current.me = makeParticipant('u1', { chosenTableIndex: 1 });
		mocks.store.current.everyone = [
			makeRosterEntry('u1', { chosenTableIndex: 1 }),
			makeRosterEntry('u2', { fullName: 'Ruth', chosenTableIndex: 1 }),
		];

		const { root, text } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.table-art__number')?.textContent).toBe('2');
		expect(text).toContain('Topic b');
		expect(text).toContain('Ruth');
	});

	it('lets a person with a seat change it while registration is open', async () => {
		mocks.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		mocks.store.current.me = makeParticipant('u1', { chosenTableIndex: 0 });

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.chooseAnother']);
	});

	describe('cancelling a seat in free mode', () => {
		const CANCEL = en['tableAssignment.cancelParticipation'];

		function seated(
			status: 'registrationOpen' | 'registrationClosed',
			claimedByName = false,
		): void {
			mocks.store.current.session = makeSession({ mode: 'direct', status });
			mocks.store.current.me = makeParticipant('u1', { chosenTableIndex: 0, claimedByName });
		}

		it('asks first, and cancels only on the second button', async () => {
			mocks.api.cancelRegistration.mockResolvedValue({ cancelled: true });
			seated('registrationOpen');

			const { root } = await renderScreen(ParticipantMyTable, ID);

			clickButton(root, CANCEL);
			await settle();

			expect(root.querySelector('[role="dialog"]')?.textContent).toContain(
				en['tableAssignment.cancel.title'],
			);
			expect(mocks.api.cancelRegistration).not.toHaveBeenCalled();

			clickButton(root, en['tableAssignment.cancel.confirm']);
			await settle();

			expect(mocks.api.cancelRegistration).toHaveBeenCalledWith({ sessionId: SESSION_ID });
		});

		it('goes to the link once the record is gone', async () => {
			mocks.api.cancelRegistration.mockResolvedValue({ cancelled: true });
			seated('registrationOpen');

			const { root } = await renderScreen(ParticipantMyTable, ID);

			clickButton(root, CANCEL);
			await settle();
			clickButton(root, en['tableAssignment.cancel.confirm']);
			await settle();
			mocks.pushMyRecord(null);
			await settle();

			expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
		});

		it('is hidden after registration closes', async () => {
			seated('registrationClosed');

			const { text } = await renderScreen(ParticipantMyTable, ID);

			expect(text).toContain('Topic a');
			expect(text).not.toContain(CANCEL);
		});

		it('is hidden on a registration continued by name', async () => {
			seated('registrationOpen', true);

			const { text } = await renderScreen(ParticipantMyTable, ID);

			expect(text).toContain(en['tableAssignment.myTable.chooseAnother']);
			expect(text).not.toContain(CANCEL);
		});
	});

	it('still shows the seat when the names cannot be read', async () => {
		published(['a']);
		mocks.store.current.everyone = [];

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain('Topic a');
		expect(text).not.toContain(en['tableAssignment.myTable.mates']);
	});
});
