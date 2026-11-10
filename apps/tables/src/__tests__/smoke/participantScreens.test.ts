// @vitest-environment jsdom
import m from 'mithril';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	NOW,
	SESSION_ID,
	makeParticipant,
	makeRosterEntry,
	makeRun,
	makeSession,
	makeTopic,
} from '../fixtures';
import { emptyStore, renderScreen, unmountAll } from './testHarness';
import type { FakeStore } from './testHarness';

const hoisted = vi.hoisted(() => ({
	store: { current: null as unknown as FakeStore },
	api: {
		register: vi.fn(),
		savePreferences: vi.fn(),
		joinTable: vi.fn(),
	},
}));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', () => ({ tablesApi: hoisted.api }));
vi.mock('@/lib/auth', () => ({
	ensureParticipantUser: async () => ({ uid: 'u1' }),
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
		subscribeSession: () => sub((s) => s.session),
		subscribeTopics: () => sub((s) => s.topics, true),
		subscribeSeats: () =>
			sub((s) => {
				const counts = new Map<number, number>();

				for (const p of s.everyone) {
					if (p.chosenTableIndex !== undefined) {
						counts.set(p.chosenTableIndex, (counts.get(p.chosenTableIndex) ?? 0) + 1);
					}
				}

				return counts;
			}),
		subscribeMyParticipant: () => sub((s) => s.me),
		subscribeRun: () => sub((s) => s.run),
	};
});

import en from '@/lib/locales/en';
import { initI18n } from '@/lib/i18n';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { ParticipantMyTable } from '@/views/participant/ParticipantMyTable';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import { ParticipantTopic, ParticipantTopics } from '@/views/participant/ParticipantTopics';

const ID = { id: SESSION_ID };
const TICK_MS = 5;

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TICK_MS));
	m.redraw.sync();
}

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
	return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
}

beforeAll(async () => {
	window.localStorage.setItem('freedi_tables_lang', 'en');
	await initI18n();
});

beforeEach(() => {
	hoisted.store.current = emptyStore();
	hoisted.store.current.session = makeSession({ status: 'registrationOpen' });
	hoisted.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1), makeTopic('c', 2)];
	hoisted.api.register.mockReset();
	hoisted.api.savePreferences.mockReset();
	hoisted.api.joinTable.mockReset();
	window.localStorage.clear();
	window.localStorage.setItem('freedi_tables_lang', 'en');
});

afterEach(unmountAll);

describe('participant home (/sessions/:id)', () => {
	it('shows the session title and a full-name form when not registered', async () => {
		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain('Town hall');
		expect(root.querySelector('input[name="name"]')).not.toBeNull();
	});

	it('registers with the full name', async () => {
		hoisted.api.register.mockResolvedValue({});

		const { root } = await renderScreen(ParticipantHome, ID);
		const input = root.querySelector<HTMLInputElement>('input[name="name"]');

		if (!input) throw new Error('name field missing');
		input.value = '  Dana Levi ';
		input.dispatchEvent(new Event('input'));
		root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
		await settle();

		expect(hoisted.api.register).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			fullName: 'Dana Levi',
		});
	});

	it('says registration has not opened in a draft', async () => {
		hoisted.store.current.session = makeSession({ status: 'draft' });

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.stage.notOpen']);
	});

	it('offers to rank once registered', async () => {
		hoisted.store.current.me = makeParticipant('u1');

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain('Name u1');
		expect(text).toContain(en['tableAssignment.stage.act.ranked.button']);
	});

	it('waits for publication after registration closes', async () => {
		hoisted.store.current.session = makeSession({ status: 'registrationClosed' });
		hoisted.store.current.me = makeParticipant('u1');

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.stage.waiting']);
	});

	it('shows the error state with retry', async () => {
		hoisted.store.current.failWith = 'unavailable';

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.state.error']);
		expect(text).toContain(en['tableAssignment.retry']);
	});

	it('shows no permission when reads are denied', async () => {
		hoisted.store.current.failWith = 'permission-denied';

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.state.denied']);
	});
});

describe('participant topics', () => {
	it('lists the topics with descriptions and consensus', async () => {
		hoisted.store.current.topics = [makeTopic('a', 0, { description: 'Parks', consensus: 0.7 })];

		const { text } = await renderScreen(ParticipantTopics, ID);

		expect(text).toContain('Topic a');
		expect(text).toContain('Parks');
		expect(text).toContain('Consensus 0.70');
	});

	it('says the topics have not opened when there are none', async () => {
		hoisted.store.current.topics = [];

		const { text } = await renderScreen(ParticipantTopics, ID);

		expect(text).toContain(en['tableAssignment.topics.notOpen']);
	});

	it('shows one topic and what the consensus number means', async () => {
		hoisted.store.current.topics = [makeTopic('a', 0, { description: 'Parks', consensus: 0.7 })];

		const { text } = await renderScreen(ParticipantTopic, { id: SESSION_ID, topicId: 'a' });

		expect(text).toContain('Parks');
		expect(text).toContain(en['tableAssignment.topic.consensusMeaning']);
	});

	it('handles a topic that no longer exists', async () => {
		const { text } = await renderScreen(ParticipantTopic, { id: SESSION_ID, topicId: 'zzz' });

		expect(text).toContain(en['tableAssignment.topic.unavailable']);
	});
});

describe('participant preferences (ranked)', () => {
	beforeEach(() => {
		hoisted.store.current.me = makeParticipant('u1');
	});

	it('tells up front that the seat can be outside the three choices', async () => {
		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain(en['tableAssignment.preferences.outsideChoices']);
	});

	it('numbers topics in tap order and saves without a position by default', async () => {
		hoisted.api.savePreferences.mockResolvedValue({});

		const { root } = await renderScreen(ParticipantPreferences, ID);
		const picks = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.pick'));

		picks()[1].click();
		await settle();
		picks()[0].click();
		await settle();

		expect(picks()[1].querySelector('.pick__badge')?.textContent).toBe('1');
		expect(picks()[0].querySelector('.pick__badge')?.textContent).toBe('2');

		buttonWithText(root, en['tableAssignment.preferences.save'])?.click();
		await settle();

		expect(hoisted.api.savePreferences).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			preferences: ['b', 'a'],
		});
	});

	it('keeps the choices locally when saving fails', async () => {
		hoisted.api.savePreferences.mockRejectedValue({ code: 'functions/unavailable' });

		const { root, text: before } = await renderScreen(ParticipantPreferences, ID);

		expect(before).not.toContain(en['tableAssignment.preferences.keptLocally']);
		root.querySelectorAll<HTMLButtonElement>('.pick')[0].click();
		await settle();
		buttonWithText(root, en['tableAssignment.preferences.save'])?.click();
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.preferences.keptLocally']);
		expect(window.localStorage.getItem(`freedi_tables_prefs_${SESSION_ID}_u1`)).toContain('"a"');
	});

	it('offers the position slider with "not specified" as the default', async () => {
		hoisted.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: {
				tableSize: 7,
				balanceTolerance: 0.3,
				positionQuestion: { label: 'Parks?', poleA: 'Yes', poleB: 'No' },
			},
		});

		const { root, text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('Parks?');
		expect(root.querySelector('.side-slider--unspecified')).not.toBeNull();
		expect(text).toContain(en['tableAssignment.position.unknown']);
	});

	it('is read-only once registration closes', async () => {
		hoisted.store.current.session = makeSession({ status: 'registrationClosed' });

		const { text, root } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain(en['tableAssignment.preferences.closed']);
		expect(buttonWithText(root, en['tableAssignment.preferences.save'])).toBeUndefined();
	});

	it('asks to register first', async () => {
		hoisted.store.current.me = null;

		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain(en['tableAssignment.preferences.notRegistered']);
	});
});

describe('participant preferences (direct)', () => {
	beforeEach(() => {
		hoisted.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		hoisted.store.current.me = makeParticipant('u1');
	});

	it('lists tables per topic and handles a full table', async () => {
		hoisted.api.joinTable.mockRejectedValue({
			code: 'functions/failed-precondition',
			details: { reason: 'table-full' },
		});

		const { root, text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('Table 1');
		expect(text).toContain('Topic a');

		buttonWithText(root, en['tableAssignment.direct.sit'])?.click();
		await settle();

		expect(hoisted.api.joinTable).toHaveBeenCalledWith({ sessionId: SESSION_ID, tableIndex: 0 });
		expect(root.textContent).toContain(en['tableAssignment.error.tableFull']);
	});

	it('shows free seats when occupancy is readable', async () => {
		hoisted.store.current.everyone = [
			makeRosterEntry('u2', { chosenTableIndex: 0 }),
			makeRosterEntry('u3', { chosenTableIndex: 0 }),
		];

		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('5 seats free');
	});
});

describe('participant my table', () => {
	it('waits when nothing is published', async () => {
		hoisted.store.current.me = makeParticipant('u1');
		hoisted.store.current.session = makeSession({ status: 'registrationClosed' });
		hoisted.store.current.run = makeRun({ status: 'ready' });

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.waiting']);
		expect(text).not.toContain('Topic a');
	});

	it('never shows a draft run, even when the session points at it', async () => {
		hoisted.store.current.me = makeParticipant('u1');
		hoisted.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		hoisted.store.current.run = makeRun({ status: 'ready' });

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.waiting']);
	});

	it('shows the table number, topic and version once published', async () => {
		hoisted.store.current.me = makeParticipant('u1', { preferences: ['b'] });
		hoisted.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		hoisted.store.current.run = makeRun({ status: 'published', publishedAt: NOW });

		const { text, root } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.my-table__number')?.textContent).toBe('1');
		expect(text).toContain('Topic a');
		expect(text).toContain('Version of');
		expect(text).toContain(en['tableAssignment.myTable.outsideChoices']);
	});

	it('shows the chosen table in direct mode', async () => {
		hoisted.store.current.session = makeSession({ mode: 'direct', status: 'registrationClosed' });
		hoisted.store.current.me = makeParticipant('u1', { chosenTableIndex: 1 });

		const { root, text } = await renderScreen(ParticipantMyTable, ID);

		expect(root.querySelector('.my-table__number')?.textContent).toBe('2');
		expect(text).toContain('Topic b');
	});

	it('shows the error state when the published run cannot be read', async () => {
		hoisted.store.current.me = makeParticipant('u1');
		hoisted.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		hoisted.store.current.failTopicsWith = null;
		hoisted.store.current.run = null;

		const { text } = await renderScreen(ParticipantMyTable, ID);

		expect(text).toContain(en['tableAssignment.myTable.waiting']);
	});
});
