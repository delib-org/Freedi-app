import { describe, expect, it } from 'vitest';
import { makeRosterEntry, makeRun, makeSession, makeTopic } from '../../__tests__/fixtures';
import { classifyError, errorCode, errorMessageKey } from '../callableErrors';
import {
	deriveDirectTables,
	isTableFull,
	seatCountsFromParticipants,
	tableByIndex,
} from '../directTables';
import { formatConsensus, tableNumber } from '../format';
import { combineStates, stateForErrorCode } from '../loadable';
import { describeMetrics } from '../metrics';
import { canEditPreferences } from '../nextAction';
import { rosterMatching, summarizeParticipants } from '../participants';
import { latestRun } from '../runs';
import { canPublish, isDraftStale } from '../stale';
import {
	draftFromStatement,
	draftFromTopic,
	draftToInput,
	emptyDraft,
	newImports,
	parseOptionalPositiveInt,
} from '../topics';
import type { Statement } from '@freedi/shared-types';

describe('canEditPreferences', () => {
	it('lets preferences change only while registration is open', () => {
		expect(canEditPreferences('registrationOpen')).toBe(true);
		expect(canEditPreferences('registrationClosed')).toBe(false);
	});
});

describe('stale draft check', () => {
	const base = {
		run: makeRun(),
		settings: { tableSize: 7, balanceTolerance: 0.3 },
		registeredUids: ['u1', 'u2', 'u3'],
		topicIds: ['a', 'b'],
	};

	it('accepts a current draft', () => {
		expect(isDraftStale(base)).toBe(false);
		expect(canPublish(base)).toBe(true);
	});

	it('is stale when someone registered after the compute', () => {
		expect(isDraftStale({ ...base, registeredUids: ['u1', 'u2', 'u3', 'u4'] })).toBe(true);
	});

	it('is stale when one person left and another came, though the count is the same', () => {
		expect(isDraftStale({ ...base, registeredUids: ['u1', 'u2', 'u9'] })).toBe(true);
	});

	it('is stale when the tolerance changed', () => {
		expect(isDraftStale({ ...base, settings: { tableSize: 7, balanceTolerance: 0.5 } })).toBe(true);
	});

	it('is stale when a table topic was removed or the table outgrows its size', () => {
		expect(isDraftStale({ ...base, topicIds: ['a'] })).toBe(true);
		expect(isDraftStale({ ...base, settings: { tableSize: 1, balanceTolerance: 0.3 } })).toBe(true);
	});

	it('is stale when superseded and cannot be published unless ready', () => {
		const superseded = { ...base, run: makeRun({ status: 'superseded' }) };

		expect(isDraftStale(superseded)).toBe(true);
		expect(canPublish({ ...base, run: makeRun({ status: 'computing' }) })).toBe(false);
	});
});

describe('describeMetrics', () => {
	it('lists each rank and the totals', () => {
		const view = describeMetrics(makeRun().metrics);

		expect(view.rankRows).toEqual([
			{ rank: 1, count: 2 },
			{ rank: 2, count: 1 },
			{ rank: 3, count: 0 },
		]);
		expect(view.gotChosenTopic).toBe(3);
		expect(view.rankedSeated).toBe(3);
	});

	it('counts people outside their choices and without preferences', () => {
		const run = makeRun();
		const metrics = {
			...run.metrics,
			balance: { ...run.metrics.balance, withinTolerance: false },
			preferences: { byRank: [1, 0, 0], none: 1, noPreference: 2, score: 3, maxScore: 12 },
		};
		const view = describeMetrics(metrics);

		expect(view.outsideChoices).toBe(1);
		expect(view.withoutPreferences).toBe(2);
		expect(view.gotChosenTopic).toBe(1);
		expect(view.rankedSeated).toBe(2);
	});

	it('reads a published run with empty preferences without crashing', () => {
		const run = makeRun();
		const view = describeMetrics({
			...run.metrics,
			preferences: { byRank: [], none: 0, noPreference: 0, score: 0, maxScore: 0 },
		});

		expect(view.rankRows).toEqual([]);
		expect(view.gotChosenTopic).toBe(0);
		expect(view.rankedSeated).toBe(0);
	});
});

describe('topics', () => {
	it('parses the optional table cap', () => {
		expect(parseOptionalPositiveInt('')).toBeUndefined();
		expect(parseOptionalPositiveInt(' 3 ')).toBe(3);
		expect(Number.isNaN(parseOptionalPositiveInt('1.5'))).toBe(true);
	});

	it('omits empty optional fields in the wire input', () => {
		expect(draftToInput({ ...emptyDraft(), title: ' A ' })).toEqual({ title: 'A' });
		expect(
			draftToInput({
				topicId: 't1',
				title: 'A',
				description: 'why',
				maxTables: '2',
				sourceStatementId: 's1',
				consensus: 0.4,
			}),
		).toEqual({
			topicId: 't1',
			title: 'A',
			description: 'why',
			maxTables: 2,
			sourceStatementId: 's1',
			consensus: 0.4,
		});
	});

	it('round-trips a stored topic through a draft', () => {
		const topic = makeTopic('a', 0, { description: 'd', maxTables: 3, consensus: 0.7 });

		expect(draftToInput(draftFromTopic(topic))).toMatchObject({
			topicId: 'a',
			title: 'Topic a',
			description: 'd',
			maxTables: 3,
			consensus: 0.7,
		});
	});

	it('imports a selected statement with title, description and consensus', () => {
		const statement = {
			statementId: 's1',
			statement: 'Build a park',
			description: 'Near the school',
			consensus: 0.62,
		} as Statement;
		const draft = draftFromStatement(statement);

		expect(draft).toMatchObject({
			title: 'Build a park',
			description: 'Near the school',
			sourceStatementId: 's1',
			consensus: 0.62,
		});
		expect(newImports([draft], [draft, { ...draft, sourceStatementId: 's2' }])).toHaveLength(1);
	});

	it('formats consensus and table numbers', () => {
		expect(formatConsensus(0.456)).toBe('0.46');
		expect(tableNumber(0)).toBe(1);
	});
});

describe('participants', () => {
	const people = [
		makeRosterEntry('u1', { hasPreferences: true, registeredAt: 2 }),
		makeRosterEntry('u2', { registeredAt: 1 }),
		makeRosterEntry('u3', { hasPreferences: true, registeredAt: 3 }),
	];

	it('counts registrations and who has ranked', () => {
		expect(summarizeParticipants(people)).toEqual({
			registered: 3,
			withPreferences: 2,
		});
	});

	it('returns name cards in registration order, matching the search', () => {
		const later = makeRosterEntry('b', { fullName: 'Bea', registeredAt: 20 });
		const earlier = makeRosterEntry('a', { fullName: 'Ann', registeredAt: 10 });

		expect(rosterMatching([later, earlier], '').map((p) => p.uid)).toEqual(['a', 'b']);
		expect(rosterMatching([later, earlier], 'be').map((p) => p.uid)).toEqual(['b']);
	});
});

describe('callable errors', () => {
	it('reads the code without the functions/ prefix', () => {
		expect(errorCode({ code: 'functions/failed-precondition' })).toBe('failed-precondition');
		expect(errorCode(new Error('x'))).toBe('');
	});

	it('classifies and maps to message keys', () => {
		expect(classifyError({ code: 'functions/permission-denied' })).toBe('permissionDenied');
		expect(errorMessageKey({ code: 'functions/failed-precondition' }, 'k.full')).toBe('k.full');
		expect(
			errorMessageKey(
				{ code: 'functions/failed-precondition', details: { reason: 'table-full' } },
				'k.generic',
			),
		).toBe('tableAssignment.error.tableFull');
		expect(
			errorMessageKey(
				{ code: 'functions/failed-precondition', details: { reason: 'stale-run' } },
				'k.generic',
			),
		).toBe('tableAssignment.error.publishStale');
		expect(errorMessageKey({ code: 'functions/unavailable' }, 'k.full')).toBe(
			'tableAssignment.error.network',
		);
		expect(errorMessageKey({}, 'k.full')).toBe('tableAssignment.error.generic');
	});
});

describe('direct tables', () => {
	const topics = [makeTopic('a', 0, { maxTables: 2 }), makeTopic('b', 1)];

	it('numbers tables across topics, one table when no cap', () => {
		const tables = deriveDirectTables(topics, null, 7);

		expect(tables.map((t) => [t.index, t.number, t.topicId])).toEqual([
			[0, 1, 'a'],
			[1, 2, 'a'],
			[2, 3, 'b'],
		]);
		expect(tables[0].free).toBeNull();
		expect(isTableFull(tables[0])).toBe(false);
	});

	it('counts free seats from the joined participants', () => {
		const joined = [
			makeRosterEntry('u1', { chosenTableIndex: 2 }),
			makeRosterEntry('u2', { chosenTableIndex: 2 }),
		];
		const tables = deriveDirectTables(topics, seatCountsFromParticipants(joined), 2);

		expect(tables[2].taken).toBe(2);
		expect(isTableFull(tables[2])).toBe(true);
		expect(tableByIndex(tables, 2)?.topicId).toBe('b');
		expect(tableByIndex(tables, undefined)).toBeUndefined();
	});
});

describe('runs and load states', () => {
	it('picks the newest live run', () => {
		const old = makeRun({ runId: 'old', createdAt: 1 });
		const fresh = makeRun({ runId: 'new', createdAt: 5 });
		const superseded = makeRun({ runId: 'sup', createdAt: 9, status: 'superseded' });

		expect(latestRun([old, fresh, superseded])?.runId).toBe('new');
		expect(latestRun([superseded])?.runId).toBe('sup');
		expect(latestRun([])).toBeNull();
	});

	it('combines states by severity', () => {
		expect(combineStates(['ready', 'loading'])).toBe('loading');
		expect(combineStates(['loading', 'error'])).toBe('error');
		expect(combineStates(['error', 'denied'])).toBe('denied');
		expect(combineStates(['ready'])).toBe('ready');
		expect(stateForErrorCode('permission-denied')).toBe('denied');
		expect(stateForErrorCode('unavailable')).toBe('error');
	});
});

describe('fixtures', () => {
	it('builds a draft session', () => {
		expect(makeSession().status).toBe('draft');
	});
});
