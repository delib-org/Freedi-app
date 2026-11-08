// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HOST_UID,
	NOW,
	SESSION_ID,
	makeParticipant,
	makeRun,
	makeSession,
	makeTopic,
} from '../fixtures';
import { emptyStore, renderScreen, unmountAll } from './testHarness';
import type { FakeStore } from './testHarness';

const hoisted = vi.hoisted(() => ({ store: { current: null as unknown as FakeStore } }));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', () => ({ tablesApi: {} }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA' } }));
vi.mock('@/lib/hostAuth', () => ({
	hostAuth: { status: 'signedIn', user: { uid: 'host-1' }, signInFailed: false },
	startHostAuth: () => undefined,
	signInHost: async () => undefined,
}));
vi.mock('@/lib/tableAssignment/data', () => {
	type Sub<T> = (
		onData: (data: T) => void,
		onError: (error: { code: string }) => void,
	) => () => void;

	function sub<T>(read: (store: FakeStore) => T, topics = false): Sub<T> {
		return (onData, onError) => {
			const store = hoisted.store.current;
			const code = (topics ? store.failTopicsWith : null) ?? store.failWith;

			if (code) onError({ code });
			else onData(read(store));

			return () => undefined;
		};
	}

	return {
		subscribeHostSessions: () => sub((s) => s.hostSessions),
		subscribeSession: () => sub((s) => s.session),
		subscribeTopics: () => sub((s) => s.topics, true),
		subscribeParticipants: () => sub((s) => s.everyone),
		subscribeMyParticipant: () => sub((s) => s.me),
		subscribeRun: () => sub((s) => s.run),
		subscribeRuns: () => sub((s) => s.runs),
		fetchChosenOptions: async () => [],
	};
});

import en from '@/lib/locales/en';
import { initI18n } from '@/lib/i18n';
import { HostAssignment } from '@/views/host/HostAssignment';
import { HostHome } from '@/views/host/HostHome';
import { HostList } from '@/views/host/HostList';
import { HostParticipants } from '@/views/host/HostParticipants';
import { HostPreview } from '@/views/host/HostPreview';
import { HostSettings } from '@/views/host/HostSettings';
import { HostTopics } from '@/views/host/HostTopics';

const ID = { id: SESSION_ID };

beforeAll(async () => {
	window.localStorage.setItem('freedi_tables_lang', 'en');
	await initI18n();
});

beforeEach(() => {
	hoisted.store.current = emptyStore();
	hoisted.store.current.session = makeSession();
});

afterEach(unmountAll);

describe('host list (/host)', () => {
	it('shows the empty state with the create form', async () => {
		const { text } = await renderScreen(HostList, {});

		expect(text).toContain(en['tableAssignment.list.empty']);
		expect(text).toContain(en['tableAssignment.list.createFirst']);
	});

	it('lists sessions with their status chip', async () => {
		hoisted.store.current.hostSessions = [makeSession({ status: 'registrationOpen' })];

		const { text } = await renderScreen(HostList, {});

		expect(text).toContain('Town hall');
		expect(text).toContain(en['tableAssignment.status.registrationOpen']);
	});

	it('shows the error state with retry when the list cannot load', async () => {
		hoisted.store.current.failWith = 'unavailable';

		const { text } = await renderScreen(HostList, {});

		expect(text).toContain(en['tableAssignment.state.error']);
		expect(text).toContain(en['tableAssignment.retry']);
	});
});

describe('host home', () => {
	it('shows the one next action and the participant link', async () => {
		const { text, root } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.next.addTopics']);
		expect(text).toContain(en['tableAssignment.home.participantLink']);
		expect(root.querySelector<HTMLInputElement>('.share-link__input')?.value).toBe(
			`https://tables.wizcol.com/sessions/${SESSION_ID}`,
		);
	});

	it('is a no-permission screen for someone who is not the host', async () => {
		hoisted.store.current.session = makeSession({ hostUid: 'someone-else' });

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.notHost']);
		expect(HOST_UID).toBe('host-1');
	});

	it('is a no-permission screen when the read is denied', async () => {
		hoisted.store.current.failWith = 'permission-denied';

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.denied']);
	});

	it('says so when the session does not exist', async () => {
		hoisted.store.current.session = null;

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.state.notFound']);
	});
});

describe('host topics', () => {
	it('shows the empty state and the import box', async () => {
		const { text } = await renderScreen(HostTopics, ID);

		expect(text).toContain(en['tableAssignment.topics.empty']);
		expect(text).toContain(en['tableAssignment.import.title']);
	});

	it('lists topics with consensus and is locked after draft', async () => {
		hoisted.store.current.session = makeSession({ status: 'registrationOpen' });
		hoisted.store.current.topics = [makeTopic('a', 0, { consensus: 0.62 })];

		const { text } = await renderScreen(HostTopics, ID);

		expect(text).toContain('Topic a');
		expect(text).toContain('Consensus 0.62');
		expect(text).toContain(en['tableAssignment.topics.locked']);
	});
});

describe('host settings', () => {
	it('shows the mode, the plain balance explanation and the position question', async () => {
		hoisted.store.current.session = makeSession({
			settings: {
				tableSize: 7,
				balanceTolerance: 0.3,
				positionQuestion: { label: 'Q', poleA: 'For', poleB: 'Against' },
			},
		});

		const { text, root } = await renderScreen(HostSettings, ID);

		expect(text).toContain(en['tableAssignment.mode.ranked']);
		expect(text).toContain(en['tableAssignment.settings.toleranceHelp']);
		expect(root.querySelector('.side-slider')).not.toBeNull();
		expect(root.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('7');
	});
});

describe('host participants', () => {
	it('shows counts and names, never individual positions', async () => {
		hoisted.store.current.session = makeSession({ status: 'registrationOpen' });
		hoisted.store.current.everyone = [
			makeParticipant('u1', { position: 33, preferences: ['a'] }),
			makeParticipant('u2'),
		];

		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.control.registrationClosed']);
		expect(text).not.toContain('33');
	});

	it('shows the empty state with the link', async () => {
		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).toContain(en['tableAssignment.participants.empty']);
	});
});

describe('host preview', () => {
	const closed = (): void => {
		hoisted.store.current.session = makeSession({ status: 'registrationClosed' });
		hoisted.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		hoisted.store.current.everyone = [
			makeParticipant('u1'),
			makeParticipant('u2'),
			makeParticipant('u3'),
		];
	};

	it('invites to compute when there is no run yet', async () => {
		closed();

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.empty']);
		expect(text).toContain(en['tableAssignment.preview.compute']);
	});

	it('shows tables, metrics and an enabled Publish for a current draft', async () => {
		closed();
		hoisted.store.current.runs = [makeRun({ createdAt: NOW })];

		const { text, root } = await renderScreen(HostPreview, ID);
		const publish = Array.from(root.querySelectorAll('button')).find(
			(b) => b.textContent === en['tableAssignment.preview.publish'],
		);

		expect(text).toContain('Table 1');
		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.metrics.within']);
		expect(publish?.disabled).toBe(false);
	});

	it('blocks a stale draft with a message', async () => {
		closed();
		hoisted.store.current.everyone.push(makeParticipant('u4'));
		hoisted.store.current.runs = [makeRun()];

		const { text, root } = await renderScreen(HostPreview, ID);
		const publish = Array.from(root.querySelectorAll('button')).find(
			(b) => b.textContent === en['tableAssignment.preview.publish'],
		);

		expect(text).toContain(en['tableAssignment.preview.stale']);
		expect(publish?.disabled).toBe(true);
	});

	it('asks to close registration first', async () => {
		hoisted.store.current.session = makeSession({ status: 'registrationOpen' });

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain(en['tableAssignment.preview.closeFirst']);
	});

	it('has no preview in direct mode: it shows the tables filling', async () => {
		hoisted.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		hoisted.store.current.topics = [makeTopic('a', 0)];
		hoisted.store.current.everyone = [makeParticipant('u1', { chosenTableIndex: 0 })];

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

	it('prints the published tables with their version', async () => {
		hoisted.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		hoisted.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		hoisted.store.current.everyone = [makeParticipant('u1'), makeParticipant('u3')];
		hoisted.store.current.run = makeRun({ status: 'published', publishedAt: NOW });

		const { text } = await renderScreen(HostAssignment, ID);

		expect(text).toContain('Table 1');
		expect(text).toContain('Topic a');
		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.assignment.print']);
	});
});
