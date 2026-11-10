import { describe, expect, it } from 'vitest';
import { makeSession, makeTopic } from '../../__tests__/fixtures';
import { bandOf } from '../band';
import { closenessOf } from '../closeness';
import { previewVerdict } from '../previewVerdict';
import {
	columnsForWidth,
	largestPageSize,
	nextPage,
	pageCount,
	pageItems,
	previousPage,
} from '../roomPages';
import { clearSetupBackup, readSetupBackup, writeSetupBackup } from '../setupBackup';
import {
	emptySetupDraft,
	freeTableCount,
	openProblem,
	parseExpected,
	parseSeats,
	settingsProblem,
	settingsRequest,
	setupDraftFromSession,
	topicInputs,
} from '../setupDraft';
import type { SetupDraft } from '../setupDraft';
import { setupSummary } from '../setupSummary';
import { chipOfTolerance, formatTolerance, toleranceOfChip } from '../strictness';
import { MAX_TOPICS, splitTopicList, topicsToAdd } from '../topicList';
import { emptyDraft } from '../topics';
import { makeRun } from '../../__tests__/fixtures';

function memoryStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
	const values = new Map<string, string>();

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key),
	};
}

function readyDraft(patch: Partial<SetupDraft> = {}): SetupDraft {
	return {
		...emptySetupDraft(),
		title: 'Town hall',
		topics: [{ ...emptyDraft(), title: 'Parks' }],
		...patch,
	};
}

describe('topicList', () => {
	it('splits on comma, Arabic comma and new lines, mixed', () => {
		expect(splitTopicList('a, b،c\nd')).toEqual(['a', 'b', 'c', 'd']);
	});

	it('trims and drops empties', () => {
		expect(splitTopicList(' a ,, \n  ,b ')).toEqual(['a', 'b']);
	});

	it('cuts a title at the 200 character limit', () => {
		expect(splitTopicList('x'.repeat(250))[0]).toHaveLength(200);
	});

	it('skips duplicates in the paste and against the list, whatever the case or spacing', () => {
		expect(topicsToAdd(['Parks'], 'parks, Roads, roads,  ROADS , Schools')).toEqual([
			'Roads',
			'Schools',
		]);
	});

	it('stops at the topic limit', () => {
		const existing = Array.from({ length: MAX_TOPICS - 1 }, (_, i) => `t${i}`);

		expect(topicsToAdd(existing, 'a,b,c')).toEqual(['a']);
	});
});

describe('strictness', () => {
	it('maps the chips to the three numbers and back', () => {
		expect(toleranceOfChip('strict')).toBe(0.15);
		expect(chipOfTolerance(0.3)).toBe('balanced');
		expect(chipOfTolerance(0.45)).toBe('flexible');
	});

	it('keeps any other stored number as custom', () => {
		expect(chipOfTolerance(0.2)).toBe('custom');
		expect(formatTolerance(0.2)).toBe('0.20');
	});
});

describe('setupSummary', () => {
	it('says about how many tables 22 people at 7 make', () => {
		expect(setupSummary({ mode: 'ranked', expected: 22, seats: 7, freeTables: 0 })).toEqual({
			kind: 'mix',
			tables: 4,
			people: 22,
			seats: 7,
		});
	});

	it('names the shortage in free mode', () => {
		expect(setupSummary({ mode: 'direct', expected: 30, seats: 7, freeTables: 3 })).toEqual({
			kind: 'free',
			tables: 3,
			capacity: 21,
			people: 30,
			missing: 9,
		});
	});

	it('has no shortage when there are enough seats', () => {
		expect(setupSummary({ mode: 'direct', expected: 10, seats: 7, freeTables: 3 })).toMatchObject({
			missing: 0,
		});
	});

	it('does not guess a number nobody gave', () => {
		expect(setupSummary({ mode: 'ranked', expected: null, seats: 7, freeTables: 0 }).kind).toBe(
			'mixUnknown',
		);
		expect(setupSummary({ mode: 'direct', expected: null, seats: 7, freeTables: 2 }).kind).toBe(
			'freeUnknown',
		);
	});
});

describe('setupDraft', () => {
	it('starts with return by name off and the balanced strictness', () => {
		const draft = emptySetupDraft();

		expect(draft.allowReturn).toBe(false);
		expect(draft.tolerance).toBe(0.3);
	});

	it('reads a stored draft and keeps a custom tolerance', () => {
		const session = makeSession({
			settings: {
				tableSize: 9,
				balanceTolerance: 0.2,
				expectedParticipants: 40,
				allowReturnByName: true,
				positionQuestion: { label: 'Q', poleA: 'A', poleB: 'B' },
			},
		});
		const draft = setupDraftFromSession(session, [makeTopic('a', 0)]);

		expect(draft).toMatchObject({
			seats: '9',
			tolerance: 0.2,
			expected: '40',
			allowReturn: true,
			askPosition: true,
			question: 'Q',
		});
		expect(draft.topics[0].topicId).toBe('a');
	});

	it('validates seats and expected people', () => {
		expect(parseSeats('1')).toBeNull();
		expect(parseSeats('21')).toBeNull();
		expect(parseSeats('20')).toBe(20);
		expect(parseExpected('')).toBeNull();
		expect(parseExpected('abc')).toBeNaN();
	});

	it('names what stops the settings from being saved', () => {
		expect(settingsProblem(readyDraft({ seats: '1' }))).toBe('seats');
		expect(settingsProblem(readyDraft({ expected: '-3' }))).toBe('expected');
		expect(settingsProblem(readyDraft({ question: 'Q' }))).toBe('question');
		expect(settingsProblem(readyDraft())).toBeNull();
	});

	it('names what stops registration from opening', () => {
		expect(openProblem(readyDraft({ title: '  ' }))).toBe('name');
		expect(openProblem(readyDraft({ topics: [emptyDraft()] }))).toBe('topics');
		expect(openProblem(readyDraft())).toBeNull();
	});

	it('treats an untouched question as not asked', () => {
		expect(settingsRequest('s', readyDraft())?.positionQuestion).toBeNull();
	});

	it('sends a full question, the mode, expected people and return by name', () => {
		const request = settingsRequest(
			's',
			readyDraft({
				question: ' Q ',
				poleA: 'A',
				poleB: 'B',
				mode: 'direct',
				expected: '12',
				allowReturn: true,
			}),
		);

		expect(request).toMatchObject({
			sessionId: 's',
			mode: 'direct',
			tableSize: 7,
			balanceTolerance: 0.3,
			positionQuestion: { label: 'Q', poleA: 'A', poleB: 'B' },
			expectedParticipants: 12,
			allowReturnByName: true,
		});
	});

	it('clears expected people when the field is empty', () => {
		expect(settingsRequest('s', readyDraft())?.expectedParticipants).toBeNull();
	});

	it('refuses to send a half-written question', () => {
		expect(settingsRequest('s', readyDraft({ question: 'Q' }))).toBeNull();
	});

	it('leaves empty rows out and passes explanations and caps through', () => {
		const draft = readyDraft({
			topics: [
				{ ...emptyDraft(), topicId: 't1', title: 'Parks', description: 'Why', maxTables: '2' },
				emptyDraft(),
			],
		});

		expect(topicInputs(draft)).toEqual([
			{ topicId: 't1', title: 'Parks', description: 'Why', maxTables: 2 },
		]);
	});

	it('counts free-mode tables from each topic cap, one by default', () => {
		const draft = readyDraft({
			topics: [
				{ ...emptyDraft(), title: 'A', maxTables: '3' },
				{ ...emptyDraft(), title: 'B' },
				emptyDraft(),
			],
		});

		expect(freeTableCount(draft)).toBe(4);
	});
});

describe('setupBackup', () => {
	const HOST = { uid: 'host-1', sessionId: 's1' };
	const SERVER_TIME = 1_000;

	it('keeps a draft per session until it is cleared', () => {
		const store = memoryStore();

		writeSetupBackup(store, HOST, readyDraft(), SERVER_TIME);
		expect(readSetupBackup(store, HOST, SERVER_TIME)?.title).toBe('Town hall');
		expect(readSetupBackup(store, { ...HOST, sessionId: 's2' }, SERVER_TIME)).toBeNull();
		clearSetupBackup(store, HOST);
		expect(readSetupBackup(store, HOST, SERVER_TIME)).toBeNull();
	});

	it('restores when the server copy has not moved on, and drops it when it has', () => {
		const store = memoryStore();

		writeSetupBackup(store, HOST, readyDraft(), SERVER_TIME);
		expect(readSetupBackup(store, HOST, SERVER_TIME - 1)).not.toBeNull();
		expect(readSetupBackup(store, HOST, SERVER_TIME + 1)).toBeNull();
	});

	it("never restores another host's copy", () => {
		const store = memoryStore();

		writeSetupBackup(store, HOST, readyDraft(), SERVER_TIME);
		expect(readSetupBackup(store, { ...HOST, uid: 'host-2' }, SERVER_TIME)).toBeNull();
	});

	it('discards an old copy that has no host or time', () => {
		const store = memoryStore();

		store.setItem('freedi_tables_setup_s1', JSON.stringify(readyDraft()));
		expect(readSetupBackup(store, HOST, SERVER_TIME)).toBeNull();
	});

	it('keeps the not-yet-created page apart per host and ignores damaged data', () => {
		const store = memoryStore();
		const fresh = { uid: 'host-1', sessionId: null };

		store.setItem('freedi_tables_setup_new_host-1', '{oops');
		expect(readSetupBackup(store, fresh, null)).toBeNull();
		writeSetupBackup(store, fresh, readyDraft({ title: 'New' }), null);
		expect(readSetupBackup(store, fresh, null)?.title).toBe('New');
		expect(readSetupBackup(store, { uid: 'host-2', sessionId: null }, null)).toBeNull();
	});
});

describe('closeness', () => {
	const stats = (deviation: number, n = 5): Parameters<typeof closenessOf>[0] => ({
		n,
		mean: n > 0 ? [50] : [],
		sd: n > 0 ? [20] : [],
		deviation,
	});

	it('is very close up to half the limit', () => {
		expect(closenessOf(stats(0.15), 0.3)).toBe('veryClose');
	});

	it('is close up to the limit', () => {
		expect(closenessOf(stats(0.3), 0.3)).toBe('close');
	});

	it('is far past the limit', () => {
		expect(closenessOf(stats(0.35), 0.3)).toBe('far');
	});

	it('says there are not enough answers below three known positions', () => {
		expect(closenessOf(stats(0.05, 2), 0.3)).toBe('notEnough');
		expect(closenessOf(stats(0, 0), 0.3)).toBe('notEnough');
	});
});

describe('band', () => {
	it('spans one spread either side of the middle', () => {
		expect(bandOf(50, 20)).toEqual({ start: 30, width: 40 });
	});

	it('stays on the 0..100 axis', () => {
		expect(bandOf(90, 20)).toEqual({ start: 70, width: 30 });
		expect(bandOf(10, 20)).toEqual({ start: 0, width: 30 });
	});
});

describe('previewVerdict', () => {
	const { metrics } = makeRun();

	it('is good only when the room is known and the check passed', () => {
		expect(previewVerdict(metrics, false)).toBe('good');
	});

	it('says stale above all', () => {
		expect(previewVerdict(metrics, true)).toBe('stale');
	});

	it('never says good when the check failed', () => {
		const failed = { ...metrics, balance: { ...metrics.balance, withinTolerance: false } };

		expect(previewVerdict(failed, false)).toBe('unbalanced');
	});

	it('says the tables follow the choices when too few answered', () => {
		const few = { ...metrics, population: { n: 0, mean: [], sd: [] } };

		expect(previewVerdict(few, false)).toBe('choicesOnly');
	});
});

describe('roomPages', () => {
	it('picks columns by width', () => {
		expect(columnsForWidth(1280)).toBe(3);
		expect(columnsForWidth(800)).toBe(2);
		expect(columnsForWidth(390)).toBe(1);
		expect(largestPageSize(1280)).toBe(6);
	});

	it('shows 43 tables of a 300 person room over 8 pages, every table once', () => {
		const tables = Array.from({ length: 43 }, (_, i) => i);
		const pages = pageCount(tables.length, 6);
		const shown = Array.from({ length: pages }, (_, page) => pageItems(tables, page, 6)).flat();

		expect(pages).toBe(8);
		expect(shown).toEqual(tables);
	});

	it('fits 10 tables on 2 pages, and a smaller page on more', () => {
		expect(pageCount(10, 6)).toBe(2);
		expect(pageCount(10, 2)).toBe(5);
	});

	it('wraps around in both directions', () => {
		expect(nextPage(7, 8)).toBe(0);
		expect(previousPage(0, 8)).toBe(7);
	});

	it('survives a page that no longer exists', () => {
		expect(pageItems([1, 2, 3], 9, 2)).toEqual([3]);
	});
});
