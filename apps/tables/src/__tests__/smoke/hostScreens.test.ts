// @vitest-environment jsdom
import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostAssignment } from '@/views/host/HostAssignment';
import { HostHome } from '@/views/host/HostHome';
import { HostList } from '@/views/host/HostList';
import { HostParticipants } from '@/views/host/HostParticipants';
import { HostPreview } from '@/views/host/HostPreview';
import { RoomScreen } from '@/views/room/RoomScreen';
import {
	HOST_UID,
	NOW,
	SESSION_ID,
	makeRosterEntry,
	makeRun,
	makeSession,
	makeTopic,
} from '../fixtures';
import { renderScreen } from './testHarness';
import { ID, buttonByText, buttonsByText, mocks, settle, useHostScreens } from './hostMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA' } }));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => (await import('./hostMocks')).fakeData);

useHostScreens();

describe('host list (/host)', () => {
	it('offers the first assignment when there are none', async () => {
		const { text } = await renderScreen(HostList, {});

		expect(text).toContain(en['tableAssignment.list.empty']);
		expect(text).toContain(en['tableAssignment.list.createFirst']);
	});

	it('lists active assignments before ended ones', async () => {
		mocks.store.current.hostSessions = [
			makeSession({ tableAssignmentId: 'old', title: 'Old one', status: 'ended' }),
			makeSession({ tableAssignmentId: 'new', title: 'Live one', status: 'registrationOpen' }),
		];

		const { root } = await renderScreen(HostList, {});
		const titles = Array.from(root.querySelectorAll('.list__title')).map((el) => el.textContent);

		expect(titles).toEqual(['Live one', 'Old one']);
	});

	it('shows the error state with retry when the list cannot load', async () => {
		mocks.store.current.failWith = 'unavailable';

		const { text } = await renderScreen(HostList, {});

		expect(text).toContain(en['tableAssignment.state.error']);
		expect(text).toContain(en['tableAssignment.retry']);
	});
});

describe('the assignment, by status', () => {
	it('is a no-permission screen for someone who is not the host', async () => {
		mocks.store.current.session = makeSession({ hostUid: 'someone-else' });

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.notHost']);
		expect(HOST_UID).toBe('host-1');
	});

	it('is a no-permission screen when the read is denied', async () => {
		mocks.store.current.failWith = 'permission-denied';

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.denied']);
	});

	it('says so when the assignment does not exist', async () => {
		mocks.store.current.session = null;

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.notFound']);
	});
});

describe('host participants', () => {
	beforeEach(() => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.everyone = [
			makeRosterEntry('u1', { hasPreferences: true }),
			makeRosterEntry('u2'),
		];
	});

	it('shows names and counts, and no position or not-specified rows', async () => {
		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.count.withPreferences']);
		expect(text).not.toContain('With a position');
		expect(text).not.toContain('Not specified');
	});

	it('shows the empty state', async () => {
		mocks.store.current.everyone = [];

		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).toContain(en['tableAssignment.participants.empty']);
	});

	it('removes a person only after the confirmation', async () => {
		const { root } = await renderScreen(HostParticipants, ID);

		buttonsByText(root, en['tableAssignment.remove'])[0].click();
		m.redraw.sync();
		expect(mocks.api.removeParticipant).not.toHaveBeenCalled();
		expect(root.textContent).toContain('Remove Name u1 from the list?');

		buttonByText(root, en['tableAssignment.remove.confirm']).click();
		await settle();

		expect(mocks.api.removeParticipant).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			uid: 'u1',
		});
		expect(root.querySelector('.modal')).toBeNull();
	});

	it('gives the reason when the server refuses a seated person, and stays open', async () => {
		mocks.api.removeParticipant.mockRejectedValue({
			code: 'functions/failed-precondition',
			details: { reason: 'seated-in-published-run' },
		});
		const { root } = await renderScreen(HostParticipants, ID);

		buttonsByText(root, en['tableAssignment.remove'])[0].click();
		m.redraw.sync();
		buttonByText(root, en['tableAssignment.remove.confirm']).click();
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.remove.seated']);
		expect(root.querySelector('.modal')).not.toBeNull();
	});

	it('offers no removal once the assignment has ended', async () => {
		mocks.store.current.session = makeSession({ status: 'ended' });

		const { root } = await renderScreen(HostParticipants, ID);

		expect(buttonsByText(root, en['tableAssignment.remove'])).toHaveLength(0);
	});
});

describe('host preview', () => {
	const closed = (): void => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.store.current.everyone = [
			makeRosterEntry('u1'),
			makeRosterEntry('u2'),
			makeRosterEntry('u3'),
		];
	};

	it('invites to compute when there is no run yet', async () => {
		closed();

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.empty']);
		expect(text).toContain(en['tableAssignment.preview.compute']);
	});

	it('leads with the verdict, says how many got each choice and allows publishing', async () => {
		closed();
		mocks.store.current.runs = [makeRun({ createdAt: NOW })];

		const { text, root } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.good.title']);
		expect(text).toContain(`2 ${en['tableAssignment.choice.first']}`);
		expect(text).toContain(`1 ${en['tableAssignment.choice.second']}`);
		expect(text).toContain('Table 1');
		expect(text).toContain('Name u1');
		expect(buttonByText(root, en['tableAssignment.preview.publish']).disabled).toBe(false);
	});

	it('shows the stored closeness of each table and no position figure', async () => {
		closed();
		mocks.store.current.runs = [makeRun()];

		const { text, root } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.closeness.close']);
		expect(text).toContain(en['tableAssignment.closeness.notEnough']);
		expect(root.querySelector('.band')).toBeNull();
	});

	it('shows "not enough answers" for a stored run that has no closeness', async () => {
		closed();
		const run = makeRun();

		mocks.store.current.runs = [
			makeRun({ tables: run.tables.map(({ closeness: _closeness, ...table }) => table) }),
		];

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.closeness.notEnough']);
		expect(text).not.toContain(en['tableAssignment.closeness.close']);
	});

	it('blocks a preview that no longer matches, and says compute again', async () => {
		closed();
		mocks.store.current.everyone.push(makeRosterEntry('u4'));
		mocks.store.current.runs = [makeRun()];

		const { text, root } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.stale.title']);
		expect(text).not.toContain(en['tableAssignment.preview.good.title']);
		expect(buttonByText(root, en['tableAssignment.preview.publish']).disabled).toBe(true);
		expect(buttonByText(root, en['tableAssignment.preview.recompute']).disabled).toBe(false);
	});

	it('shows the server refusal of a stale publish', async () => {
		closed();
		mocks.store.current.runs = [makeRun()];
		mocks.api.publishRun.mockRejectedValue({
			code: 'functions/failed-precondition',
			details: { reason: 'stale-run' },
		});
		const { root } = await renderScreen(HostPreview, ID);

		buttonByText(root, en['tableAssignment.preview.publish']).click();
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.error.publishStale']);
	});

	it('never claims good when the tables are outside the limit', async () => {
		closed();
		const run = makeRun();

		mocks.store.current.runs = [
			makeRun({
				metrics: { ...run.metrics, balance: { ...run.metrics.balance, withinTolerance: false } },
			}),
		];

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.unbalanced.title']);
		expect(text).not.toContain(en['tableAssignment.preview.good.title']);
	});

	it('says the tables follow the choices when too few answered', async () => {
		closed();
		const run = makeRun();

		mocks.store.current.runs = [
			makeRun({ metrics: { ...run.metrics, hasEnoughPositions: false } }),
		];

		const { text, root } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.choicesOnly.title']);
		expect(root.querySelector('.band')).toBeNull();
	});

	it('keeps topics without a table behind "full data" and shows no distances', async () => {
		closed();
		mocks.store.current.topics.push(makeTopic('c', 2, { title: 'Quiet topic' }));
		mocks.store.current.runs = [makeRun()];

		const { root } = await renderScreen(HostPreview, ID);

		expect(root.querySelector('details.full-data')?.hasAttribute('open')).toBe(false);
		expect(root.querySelector('details.full-data')?.textContent).toContain('Quiet topic');
		expect(root.textContent).not.toMatch(/0\.\d\d/);
	});

	it('names a topic that got no table', async () => {
		closed();
		mocks.store.current.topics.push(makeTopic('c', 2, { title: 'Quiet topic' }));
		mocks.store.current.runs = [makeRun()];

		const { root } = await renderScreen(HostPreview, ID);

		expect(root.querySelector('details.full-data')?.textContent).toContain('Quiet topic');
	});

	it('asks to close registration first', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.closeFirst']);
	});

	it('has no preview in free mode: it shows the tables filling', async () => {
		mocks.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		mocks.store.current.topics = [makeTopic('a', 0)];
		mocks.store.current.everyone = [makeRosterEntry('u1', { chosenTableIndex: 0 })];

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.directLive']);
		expect(text).toContain('Name u1');
	});
});

describe('host assignment', () => {
	it('says the assignment is not published yet', async () => {
		const { text } = await renderScreen(HostAssignment, ID);

		expect(text).toContain(en['tableAssignment.assignment.empty']);
	});

	it('prints the published tables with names and topics only', async () => {
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.store.current.everyone = [makeRosterEntry('u1'), makeRosterEntry('u3')];
		mocks.store.current.run = makeRun({ status: 'published', publishedAt: NOW });

		const { text, root } = await renderScreen(HostAssignment, ID);

		expect(text).toContain('Table 1');
		expect(text).toContain('Topic a');
		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.assignment.print']);
		expect(root.querySelector('.band')).toBeNull();
		expect(root.querySelector('.pill')).toBeNull();
	});
});

describe('room screen', () => {
	it('before opening says registration is not open', async () => {
		const { text } = await renderScreen(RoomScreen, ID);

		expect(text).toContain(en['tableAssignment.notOpen.title']);
	});

	it('while open is the join page: name, QR, count and the real link', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.registeredCount = 42;

		const { text, root } = await renderScreen(RoomScreen, ID);

		expect(text).toContain('Town hall');
		expect(text).toContain(en['tableAssignment.roomScreen.scan']);
		expect(root.querySelector('img.room-join__qr')).not.toBeNull();
		expect(text).toContain('42');
		expect(text).toContain(`tables.wizcol.com/sessions/${SESSION_ID}`);
	});

	it('shows no seating before publishing', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.store.current.everyone = [makeRosterEntry('u1')];
		mocks.store.current.runs = [makeRun()];

		const { text } = await renderScreen(RoomScreen, ID);

		expect(text).toContain(en['tableAssignment.roomScreen.tablesSoon']);
		expect(text).not.toContain('Name u1');
	});

	it('flips to who sits where once published: numbers, topics and names only', async () => {
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.store.current.everyone = [makeRosterEntry('u1'), makeRosterEntry('u3')];
		mocks.store.current.run = makeRun({ status: 'published', publishedAt: NOW });

		const { text, root } = await renderScreen(RoomScreen, ID);

		expect(text).toContain(en['tableAssignment.roomScreen.seats']);
		expect(text).toContain('Topic a');
		expect(text).toContain('Name u1');
		expect(root.querySelector('.band')).toBeNull();
		expect(root.querySelector('.pill')).toBeNull();
	});

	it('pages through ten tables, with controls', async () => {
		const tables = Array.from({ length: 10 }, (_, index) => ({
			index,
			topicId: 'a',
			memberUids: [`u${index}`],
			stats: { n: 0, mean: [], sd: [], deviation: 0 },
		}));

		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.topics = [makeTopic('a', 0)];
		mocks.store.current.run = makeRun({ status: 'published', tables });
		window.innerWidth = 1280;

		const { root } = await renderScreen(RoomScreen, ID);

		expect(root.querySelectorAll('.room-table')).toHaveLength(6);
		expect(root.textContent).toContain('Page 1 of 2');
		buttonByText(root, en['tableAssignment.roomScreen.next']).click();
		m.redraw.sync();
		expect(root.querySelectorAll('.room-table')).toHaveLength(4);
		expect(root.textContent).toContain('Page 2 of 2');
	});
});

describe('privacy of the host screens', () => {
	it('no host or room source imports the private records', () => {
		const sources = import.meta.glob('../../views/{host,room}/*.ts', {
			query: '?raw',
			import: 'default',
			eager: true,
		});

		expect(Object.keys(sources).length).toBeGreaterThan(5);

		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toContain('subscribeMyParticipant');
			expect(source, file).not.toContain('TableAssignmentParticipant');
			expect(source, file).not.toMatch(/(?<!setup)\.position\b/);
			expect(source, file).not.toMatch(/\.preferences\b/);
		}
	});
});
