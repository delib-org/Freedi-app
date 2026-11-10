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
import { describeMetrics, formatDeviation } from '../metrics';
import { canEditPreferences, canEditTopics, nextHostAction, statusControls } from '../nextAction';
import { nameByUid, participantNames, summarizeParticipants } from '../participants';
import { latestRun } from '../runs';
import { draftFromSettings, draftToRequest, settingsErrors } from '../settings';
import { canPublish, isDraftStale, seatedCount } from '../stale';
import {
	draftFromStatement,
	draftFromTopic,
	draftToInput,
	emptyDraft,
	filterTopics,
	moveItem,
	newImports,
	parseOptionalPositiveInt,
	validateDraft,
} from '../topics';
import type { Statement } from '@freedi/shared-types';

describe('nextHostAction', () => {
	it('asks for topics first, then opens registration', () => {
		expect(nextHostAction({ status: 'draft', mode: 'ranked', topicCount: 0 }).key).toBe(
			'addTopics',
		);
		expect(nextHostAction({ status: 'draft', mode: 'ranked', topicCount: 2 })).toEqual({
			key: 'openRegistration',
			kind: 'status',
			status: 'registrationOpen',
		});
	});

	it('closes registration, then previews (ranked) or ends (direct)', () => {
		expect(nextHostAction({ status: 'registrationOpen', mode: 'ranked', topicCount: 2 }).key).toBe(
			'closeRegistration',
		);
		expect(
			nextHostAction({ status: 'registrationClosed', mode: 'ranked', topicCount: 2 }).key,
		).toBe('preview');
		expect(
			nextHostAction({ status: 'registrationClosed', mode: 'direct', topicCount: 2 }).key,
		).toBe('endSession');
	});

	it('shows the published assignment, then nothing', () => {
		expect(nextHostAction({ status: 'published', mode: 'ranked', topicCount: 2 }).key).toBe(
			'viewAssignment',
		);
		expect(nextHostAction({ status: 'ended', mode: 'ranked', topicCount: 2 }).key).toBe('done');
	});

	it('locks topics after draft and lets preferences change only while registration is open', () => {
		expect(canEditTopics('draft')).toBe(true);
		expect(canEditTopics('registrationOpen')).toBe(false);
		expect(canEditPreferences('registrationOpen')).toBe(true);
		expect(canEditPreferences('registrationClosed')).toBe(false);
	});

	it('offers the right status controls', () => {
		expect(statusControls('draft')).toEqual(['registrationOpen']);
		expect(statusControls('registrationOpen')).toEqual(['registrationClosed']);
		expect(statusControls('registrationClosed')).toEqual(['ended']);
		expect(statusControls('published')).toEqual(['ended']);
		expect(statusControls('ended')).toEqual([]);
	});
});

describe('stale draft check', () => {
	const base = {
		run: makeRun(),
		settings: { tableSize: 7, balanceTolerance: 0.3 },
		registeredCount: 3,
		topicIds: ['a', 'b'],
	};

	it('accepts a current draft', () => {
		expect(seatedCount(base.run.tables)).toBe(3);
		expect(isDraftStale(base)).toBe(false);
		expect(canPublish(base)).toBe(true);
	});

	it('is stale when someone registered after the compute', () => {
		expect(isDraftStale({ ...base, registeredCount: 4 })).toBe(true);
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
	it('lists each rank and the balance against the tolerance', () => {
		const view = describeMetrics(makeRun().metrics);

		expect(view.rankRows).toEqual([
			{ rank: 1, count: 2 },
			{ rank: 2, count: 1 },
			{ rank: 3, count: 0 },
		]);
		expect(view.balanceMax).toBe('0.20');
		expect(view.balanceMean).toBe('0.15');
		expect(view.tolerance).toBe('0.30');
		expect(view.withinTolerance).toBe(true);
		expect(view.satisfiedPercent).toBe(100);
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
		expect(view.withinTolerance).toBe(false);
		expect(view.satisfiedPercent).toBe(50);
	});

	it('formats non-finite deviations as a dash', () => {
		expect(formatDeviation(Number.NaN)).toBe('-');
	});
});

describe('topics', () => {
	it('validates a draft', () => {
		expect(validateDraft(emptyDraft())).toBe('titleRequired');
		expect(validateDraft({ ...emptyDraft(), title: 'x', maxTables: '0' })).toBe('maxTablesInvalid');
		expect(validateDraft({ ...emptyDraft(), title: 'x', maxTables: '2' })).toBeNull();
	});

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

	it('moves items and ignores out-of-range moves', () => {
		expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
	});

	it('filters by title and description', () => {
		const topics = [makeTopic('a', 0, { description: 'parks' }), makeTopic('b', 1)];

		expect(filterTopics(topics, 'park').map((t) => t.topicId)).toEqual(['a']);
		expect(filterTopics(topics, '')).toHaveLength(2);
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

	it('returns names only, in registration order', () => {
		expect(participantNames(people)).toEqual(['Name u2', 'Name u1', 'Name u3']);
		expect(nameByUid(people).get('u1')).toBe('Name u1');
	});
});

describe('settings', () => {
	it('starts from the stored settings and builds a request', () => {
		const draft = draftFromSettings({
			tableSize: 6,
			balanceTolerance: 0.4,
			positionQuestion: { label: 'Q', poleA: 'Yes', poleB: 'No' },
		});

		expect(settingsErrors(draft)).toEqual([]);
		expect(draftToRequest('s', draft)).toEqual({
			sessionId: 's',
			tableSize: 6,
			balanceTolerance: 0.4,
			positionQuestion: { label: 'Q', poleA: 'Yes', poleB: 'No' },
		});
	});

	it('removes the position question when disabled', () => {
		const draft = { ...draftFromSettings({ tableSize: 7, balanceTolerance: 0.3 }) };

		expect(draftToRequest('s', draft).positionQuestion).toBeNull();
	});

	it('reports invalid fields', () => {
		const draft = draftFromSettings({ tableSize: 7, balanceTolerance: 0.3 });

		expect(settingsErrors({ ...draft, tableSize: '1' })).toEqual(['tableSize']);
		expect(settingsErrors({ ...draft, tableSize: '21' })).toEqual(['tableSize']);
		expect(settingsErrors({ ...draft, balanceTolerance: '-1' })).toEqual(['balanceTolerance']);
		expect(settingsErrors({ ...draft, positionEnabled: true })).toEqual([
			'positionLabel',
			'poleA',
			'poleB',
		]);
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
