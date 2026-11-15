import { describe, expect, it } from 'vitest';
import { makeParticipant, makeSession, makeTopic } from '../../__tests__/fixtures';
import { closeFlagsOf, rememberCloseFlags } from '../closeFlags';
import { offersEntry, seatLinkFailure } from '../enterDiscussion';
import {
	effectiveMode,
	emptySetupDraft,
	isOneTopicDraft,
	openProblem,
	setupDraftFromSession,
	settingsRequest,
} from '../setupDraft';
import { setupSummary } from '../setupSummary';
import { isOneTopic, nextStep, stepsOf } from '../steps';
import {
	chosenTopicId,
	isSplitSession,
	loneTopics,
	tablesThatWouldOpen,
	topicOptions,
	topicTitlesOf,
} from '../topicPicker';

const QUESTION = { label: 'Q', poleA: 'Keep', poleB: 'Change' };

describe('topic picker state', () => {
	const topics = [
		makeTopic('b', 1, { chosenCount: 3 }),
		makeTopic('a', 0),
		makeTopic('c', 2, { chosenCount: 1 }),
	];

	it('lists the topics in the host order with their counts, a missing count being nobody', () => {
		const options = topicOptions(topics, undefined);

		expect(options.map((option) => [option.topicId, option.count])).toEqual([
			['a', 0],
			['b', 3],
			['c', 1],
		]);
	});

	it('marks the one topic the person chose', () => {
		const options = topicOptions(topics, 'b');

		expect(options.filter((option) => option.mine).map((option) => option.topicId)).toEqual(['b']);
	});

	it('reads the choice from the first preference, and nothing from no registration', () => {
		expect(chosenTopicId(makeParticipant('u1', { preferences: ['b'] }))).toBe('b');
		expect(chosenTopicId(makeParticipant('u1'))).toBeUndefined();
		expect(chosenTopicId(null)).toBeUndefined();
	});

	it('is a split session only for direct mode made with splitByTopic', () => {
		expect(isSplitSession(makeSession({ mode: 'direct', splitByTopic: true }))).toBe(true);
		expect(isSplitSession(makeSession({ mode: 'direct' }))).toBe(false);
		expect(isSplitSession(makeSession({ mode: 'ranked', splitByTopic: true }))).toBe(false);
	});
});

describe('tables that would open', () => {
	it.each([
		[0, 0],
		[1, 1],
		[7, 1],
		[8, 2],
		[70, 10],
		[71, 11],
	])('%i people at 7 seats open %i tables', (people, tables) => {
		expect(tablesThatWouldOpen(people, 7)).toBe(tables);
	});
});

describe('lone topic flag', () => {
	const topics = [
		makeTopic('a', 0, { chosenCount: 1 }),
		makeTopic('b', 1, { chosenCount: 2 }),
		makeTopic('c', 2),
		makeTopic('d', 3, { chosenCount: 1 }),
	];

	it('flags only topics that exactly one person chose, in the host order', () => {
		expect(loneTopics(topics).map((topic) => topic.topicId)).toEqual(['a', 'd']);
	});

	it('shows the titles of the topics the server reports, and an unknown reference as it came', () => {
		expect(topicTitlesOf(['d', 'zzz'], topics)).toEqual(['Topic d', 'zzz']);
	});

	it('keeps what the close answered for the next screen, and forgets an empty answer', () => {
		rememberCloseFlags('s1', ['a']);
		expect(closeFlagsOf('s1')).toEqual(['a']);
		rememberCloseFlags('s1', []);
		expect(closeFlagsOf('s1')).toEqual([]);
		expect(closeFlagsOf('never')).toEqual([]);
	});
});

describe('enter the discussion', () => {
	it('is offered only for a published session that a lesson uses', () => {
		expect(offersEntry({ contextStatementId: 'lesson', status: 'published' })).toBe(true);
		expect(offersEntry({ contextStatementId: 'lesson', status: 'registrationOpen' })).toBe(false);
		expect(offersEntry({ contextStatementId: undefined, status: 'published' })).toBe(false);
		expect(offersEntry({ contextStatementId: '', status: 'published' })).toBe(false);
	});

	it('hides the button on the server refusals and says so when the link could not be made', () => {
		const refusal = { code: 'functions/failed-precondition', details: { reason: 'not-connected' } };

		expect(seatLinkFailure(refusal)).toBe('hidden');
		expect(seatLinkFailure({ code: 'functions/failed-precondition' })).toBe('hidden');
		expect(seatLinkFailure({ code: 'functions/unavailable' })).toBe('failed');
		expect(seatLinkFailure(new Error('offline'))).toBe('failed');
	});
});

describe('one-topic setup', () => {
	const one = { ...emptySetupDraft(), title: 'Town hall', topicCount: 'one' as const };

	it('opens without any topic, where several topics need one', () => {
		expect(openProblem(one)).toBeNull();
		expect(openProblem({ ...one, topicCount: 'several' })).toBe('topics');
	});

	it('is always a mix: the mode question is not asked, and the request says one', () => {
		const direct = { ...one, mode: 'direct' as const };

		expect(effectiveMode(direct)).toBe('ranked');
		expect(settingsRequest('s1', direct)).toMatchObject({ topicCount: 'one', mode: 'ranked' });
	});

	it('asks the position question of a one-topic mix', () => {
		const asked = { ...one, askPosition: true, question: 'Q', poleA: 'Keep', poleB: 'Change' };

		expect(settingsRequest('s1', asked)?.positionQuestion).toEqual(QUESTION);
	});

	it('reads several for a copy or a session saved before the question existed', () => {
		const old = { ...emptySetupDraft() } as Partial<ReturnType<typeof emptySetupDraft>>;

		delete old.topicCount;
		expect(isOneTopicDraft(old as ReturnType<typeof emptySetupDraft>)).toBe(false);
		expect(setupDraftFromSession(makeSession(), []).topicCount).toBe('several');
		expect(
			setupDraftFromSession(
				makeSession({ settings: { tableSize: 7, balanceTolerance: 0.3, topicCount: 'one' } }),
				[],
			).topicCount,
		).toBe('one');
	});

	it('skips the topic step for the participant: name, then the position question if asked', () => {
		const plain = makeSession({
			settings: { tableSize: 7, balanceTolerance: 0.3, topicCount: 'one' },
		});
		const asked = makeSession({
			settings: {
				tableSize: 7,
				balanceTolerance: 0.3,
				topicCount: 'one',
				positionQuestion: QUESTION,
			},
		});

		expect(isOneTopic(plain)).toBe(true);
		expect(stepsOf(plain)).toEqual(['name']);
		expect(nextStep(plain, 'name')).toBeNull();
		expect(stepsOf(asked)).toEqual(['name', 'position']);
		expect(nextStep(asked, 'name')).toBe('position');
	});

	it('keeps the topic step for several topics', () => {
		expect(stepsOf(makeSession())).toEqual(['name', 'preferences']);
		expect(stepsOf(makeSession({ mode: 'direct' }))).toEqual(['name', 'preferences']);
	});
});

describe('table count hint', () => {
	it('says how many tables a mix opens, and at least how many a split opens', () => {
		expect(setupSummary({ mode: 'ranked', expected: 70, seats: 7, freeTables: 0 })).toMatchObject({
			kind: 'mix',
			tables: 10,
		});
		expect(
			setupSummary({ mode: 'direct', expected: 71, seats: 7, freeTables: 0, splitByTopic: true }),
		).toEqual({ kind: 'split', tables: 11, people: 71, seats: 7 });
	});

	it('has no table count before the host says how many people to expect', () => {
		expect(
			setupSummary({ mode: 'direct', expected: null, seats: 7, freeTables: 0, splitByTopic: true }),
		).toEqual({ kind: 'splitUnknown', seats: 7 });
	});

	it('keeps the old free-mode summary for a session without the split rule', () => {
		expect(setupSummary({ mode: 'direct', expected: 30, seats: 7, freeTables: 3 }).kind).toBe(
			'free',
		);
	});
});
