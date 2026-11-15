// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { classSeatUrl, CLASS_BASE_URL } from '@freedi/table-assignment-client';
import en from '@/lib/locales/en';
import { ParticipantMyTable } from '@/views/participant/ParticipantMyTable';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import {
	makeParticipant,
	makeRosterEntry,
	makeRun,
	makeSession,
	makeTopic,
	NOW,
	SESSION_ID,
} from '../fixtures';
import { renderScreen } from './testHarness';
import { clickButton, HOME, ID, mocks, settle, useParticipantScreens } from './participantMocks';

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

const SPLIT = { mode: 'direct', splitByTopic: true } as const;

function splitOpen(): void {
	mocks.store.current.session = makeSession({ ...SPLIT, status: 'registrationOpen' });
	mocks.store.current.topics = [
		makeTopic('a', 0, { chosenCount: 4 }),
		makeTopic('b', 1, { chosenCount: 1 }),
	];
}

describe('choose a topic (sit where you like, split by topic)', () => {
	it('lists topics, never tables, with how many chose each and no table number', async () => {
		splitOpen();
		mocks.store.current.me = makeParticipant('u1');

		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('Topic a');
		expect(text).toContain('4 people chose this topic');
		expect(text).toContain('One person chose this topic');
		expect(text).toContain(en['tableAssignment.myTable.numberLater']);
		expect(text).not.toContain('Table 1');
	});

	it('saves the topic as the single preference and goes back to waiting', async () => {
		splitOpen();
		mocks.store.current.me = makeParticipant('u1');
		mocks.api.savePreferences.mockResolvedValue({ saved: true });

		const { root } = await renderScreen(ParticipantPreferences, ID);

		clickButton(root, en['tableAssignment.topic.choose']);
		await settle();

		expect(mocks.api.savePreferences).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			preferences: ['a'],
		});
		expect(mocks.goTo).toHaveBeenCalledWith(HOME);
	});

	it('marks the topic already chosen and offers the others', async () => {
		splitOpen();
		mocks.store.current.me = makeParticipant('u1', { preferences: ['b'] });

		const { root, text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain(en['tableAssignment.topic.yours']);
		expect(root.querySelectorAll('.table-pick--mine')).toHaveLength(1);
		expect(root.querySelectorAll('button.btn--primary')).toHaveLength(1);
	});

	it('has no topic step in a one-topic event: it goes back to the link', async () => {
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: { tableSize: 7, balanceTolerance: 0.3, topicCount: 'one' },
		});
		mocks.store.current.me = makeParticipant('u1');

		const { root } = await renderScreen(ParticipantPreferences, ID);

		expect(root.textContent).not.toContain('Topic a');
	});
});

describe('my table in a split session', () => {
	it('before closing shows the topic, how many chose it, and that the number comes later', async () => {
		splitOpen();
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'] });

		const { text, root } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain('Topic a');
		expect(text).toContain('4 people chose this topic');
		expect(text).toContain(en['tableAssignment.myTable.numberLater']);
		expect(root.querySelector('.table-art')).toBeNull();
	});

	it('asks for a topic first when none was chosen', async () => {
		splitOpen();
		mocks.store.current.me = makeParticipant('u1');

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.chooseFirstTopic']);
	});
});

describe('enter the discussion', () => {
	function published(patch: Parameters<typeof makeSession>[0] = {}): void {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'] });
		mocks.store.current.session = makeSession({
			status: 'published',
			publishedRunId: 'run-1',
			...patch,
		});
		mocks.store.current.run = makeRun({ status: 'published', publishedAt: NOW });
		mocks.store.current.everyone = [makeRosterEntry('u1'), makeRosterEntry('u2')];
	}

	it('links to the personal seat in Class when a lesson uses the session', async () => {
		published({ contextStatementId: 'lesson-1' });
		mocks.api.seatLink.mockResolvedValue({ seatCode: 'Ab-_9' });

		const { root } = await renderScreen(ParticipantMyTable, ID);

		await settle();
		const text = root.textContent ?? '';

		expect(mocks.api.seatLink).toHaveBeenCalledWith({ sessionId: SESSION_ID });
		expect(root.querySelector('a.btn--cta')?.getAttribute('href')).toBe(
			classSeatUrl(CLASS_BASE_URL, 'Ab-_9'),
		);
		expect(text).toContain(en['tableAssignment.myTable.enter']);
		expect(text).toContain(en['tableAssignment.myTable.enter.hint']);
	});

	it('shows no button and asks for no link when no lesson uses the session', async () => {
		published();

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(mocks.api.seatLink).not.toHaveBeenCalled();
		expect(text).not.toContain(en['tableAssignment.myTable.enter']);
	});

	it.each(['not-connected', 'not-registered', 'ended'])(
		'shows nothing when the server refuses (%s)',
		async (reason) => {
			published({ contextStatementId: 'lesson-1' });
			mocks.api.seatLink.mockRejectedValue({
				code: 'functions/failed-precondition',
				details: { reason },
			});

			const { root } = await renderScreen(ParticipantMyTable, ID);

			await settle();

			expect(root.textContent).not.toContain(en['tableAssignment.myTable.enter']);
			expect(root.textContent).not.toContain(en['tableAssignment.myTable.enter.failed']);
		},
	);

	it('tells the person to use the class code when the link could not be made', async () => {
		published({ contextStatementId: 'lesson-1' });
		mocks.api.seatLink.mockRejectedValue({ code: 'functions/unavailable' });

		const { root } = await renderScreen(ParticipantMyTable, ID);

		await settle();

		expect(root.textContent).toContain(en['tableAssignment.myTable.enter.failed']);
		expect(root.querySelector('a.btn--cta')).toBeNull();
	});

	it('shows a split session its table with the number and no ranking pill', async () => {
		published({ ...SPLIT, contextStatementId: 'lesson-1' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.api.seatLink.mockResolvedValue({ seatCode: 'code' });

		const { root } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.table-art__number')?.textContent).toBe('1');
		expect(root.querySelector('.my-table__pill')).toBeNull();
	});

	it('shows a one-topic event its number without a topic line', async () => {
		published({ settings: { tableSize: 7, balanceTolerance: 0.3, topicCount: 'one' } });
		mocks.store.current.topics = [makeTopic('a', 0)];

		const { root, text } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.table-art__number')?.textContent).toBe('1');
		expect(text).not.toContain('Topic a');
	});
});
