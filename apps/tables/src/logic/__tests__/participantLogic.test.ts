import { describe, expect, it } from 'vitest';
import {
	clearDraft,
	draftStorageKey,
	forgetRegistration,
	loadDraft,
	loadMemory,
	markCancelledHere,
	parseDraft,
	parseMemory,
	registrationLoss,
	rememberRegistration,
	saveDraft,
	serializeDraft,
	unmarkCancelledHere,
} from '../localDraft';
import { canCancelRegistration } from '../nextAction';
import { participantStage } from '../participantStage';
import type { ParticipantStage, StageInput } from '../participantStage';
import {
	isRankingFull,
	keepKnownTopics,
	moveRank,
	moveRankTo,
	orderTopics,
	rankHintIndex,
	rankOf,
	toggleRank,
} from '../ranking';
import { clampDragOffset, displacement, dragTargetIndex } from '../rankDrag';
import type { RowBox } from '../rankDrag';

describe('ranking', () => {
	it('adds a tapped topic at the end and removes it on a second tap', () => {
		expect(toggleRank([], 'a')).toEqual(['a']);
		expect(toggleRank(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleRank(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('never takes more than three', () => {
		const full = toggleRank(toggleRank(toggleRank([], 'a'), 'b'), 'c');

		expect(isRankingFull(full)).toBe(true);
		expect(toggleRank(full, 'd')).toEqual(['a', 'b', 'c']);
		expect(toggleRank(full, 'b')).toEqual(['a', 'c']);
	});

	it('gives the 1/2/3 badge, 0 for unranked', () => {
		expect(rankOf(['a', 'b'], 'b')).toBe(2);
		expect(rankOf(['a', 'b'], 'z')).toBe(0);
	});

	it('reorders and ignores impossible moves', () => {
		expect(moveRank(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
		expect(moveRank(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(moveRank(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});

	it('moves a topic to any place and ignores places outside the list', () => {
		expect(moveRankTo(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
		expect(moveRankTo(['a', 'b', 'c'], 0, 3)).toEqual(['a', 'b', 'c']);
		expect(moveRankTo(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c']);
	});

	it('orders picked topics first, in rank order, then the rest in the host order', () => {
		const topics = [{ topicId: 'a' }, { topicId: 'b' }, { topicId: 'c' }];

		expect(orderTopics(topics, ['c', 'a']).map((topic) => topic.topicId)).toEqual(['c', 'a', 'b']);
	});

	it('picks the hint by how many are chosen, and the last one when nothing can be added', () => {
		expect(rankHintIndex([], 6)).toBe(0);
		expect(rankHintIndex(['a'], 6)).toBe(1);
		expect(rankHintIndex(['a', 'b'], 6)).toBe(2);
		expect(rankHintIndex(['a', 'b', 'c'], 6)).toBe(3);
		expect(rankHintIndex(['a', 'b'], 2)).toBe(3);
	});

	it('drops topics that no longer exist', () => {
		expect(keepKnownTopics(['a', 'x', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('rank drag arithmetic', () => {
	const rows: RowBox[] = [
		{ top: 0, height: 60 },
		{ top: 70, height: 60 },
		{ top: 140, height: 60 },
	];

	it('stays put until the row crosses the middle of its neighbour', () => {
		expect(dragTargetIndex(rows, 0, 30)).toBe(0);
		expect(dragTargetIndex(rows, 0, 45)).toBe(1);
		expect(dragTargetIndex(rows, 0, 120)).toBe(2);
		expect(dragTargetIndex(rows, 2, -45)).toBe(1);
		expect(dragTargetIndex(rows, 2, -130)).toBe(0);
	});

	it('keeps the dragged row inside the picked rows', () => {
		expect(clampDragOffset(rows, 0, -50)).toBe(0);
		expect(clampDragOffset(rows, 0, 999)).toBe(140);
		expect(clampDragOffset(rows, 2, -999)).toBe(-140);
	});

	it('moves only the rows that were passed, against the drag', () => {
		expect(displacement(1, 0, 2, 70)).toBe(-70);
		expect(displacement(2, 0, 1, 70)).toBe(0);
		expect(displacement(0, 2, 0, 70)).toBe(70);
		expect(displacement(2, 2, 0, 70)).toBe(0);
	});
});

describe('participantStage', () => {
	type Expected = [StageInput['status'], boolean, boolean, ParticipantStage];

	const rankedCases: Expected[] = [
		['draft', false, false, 'notOpen'],
		['draft', true, false, 'notOpen'],
		['draft', false, true, 'notOpen'],
		['registrationOpen', false, false, 'name'],
		['registrationOpen', false, true, 'cancelled'],
		['registrationOpen', true, false, 'waiting'],
		['registrationOpen', true, true, 'waiting'],
		['registrationClosed', false, false, 'closedNotRegistered'],
		['registrationClosed', false, true, 'cancelled'],
		['registrationClosed', true, false, 'waitingClosed'],
		['published', false, false, 'closedNotRegistered'],
		['published', false, true, 'cancelled'],
		['published', true, false, 'myTable'],
		['ended', false, false, 'ended'],
		['ended', true, false, 'ended'],
		['ended', false, true, 'ended'],
	];

	it.each(rankedCases)(
		'ranked: %s, registered %s, cancelled %s is %s',
		(status, registered, cancelled, stage) => {
			expect(
				participantStage({
					status,
					mode: 'ranked',
					registered,
					lost: cancelled ? 'cancelled' : null,
					hasChosenTable: false,
				}),
			).toBe(stage);
		},
	);

	const directCases: Expected[] = [
		['draft', true, false, 'notOpen'],
		['registrationOpen', false, false, 'name'],
		['registrationOpen', true, false, 'waiting'],
		['registrationClosed', true, false, 'waitingClosed'],
		['ended', true, false, 'ended'],
	];

	it.each(directCases)(
		'direct without a seat: %s, registered %s, cancelled %s is %s',
		(status, registered, cancelled, stage) => {
			expect(
				participantStage({
					status,
					mode: 'direct',
					registered,
					lost: cancelled ? 'cancelled' : null,
					hasChosenTable: false,
				}),
			).toBe(stage);
		},
	);

	it.each(['registrationOpen', 'registrationClosed'] as const)(
		'direct with a seat in %s is my table',
		(status) => {
			expect(
				participantStage({
					status,
					mode: 'direct',
					registered: true,
					lost: null,
					hasChosenTable: true,
				}),
			).toBe('myTable');
		},
	);
});

describe('participantStage after losing a registration', () => {
	it.each(['registrationOpen', 'registrationClosed', 'published'] as const)(
		'someone else removing it in %s is removed',
		(status) => {
			expect(
				participantStage({
					status,
					mode: 'ranked',
					registered: false,
					lost: 'removed',
					hasChosenTable: false,
				}),
			).toBe('removed');
		},
	);

	it('a live registration outranks an old loss', () => {
		expect(
			participantStage({
				status: 'registrationOpen',
				mode: 'ranked',
				registered: true,
				lost: 'removed',
				hasChosenTable: false,
			}),
		).toBe('waiting');
	});
});

describe('canCancelRegistration', () => {
	it.each(['draft', 'registrationClosed', 'published', 'ended'] as const)(
		'is refused in %s',
		(status) => {
			expect(canCancelRegistration(status, {})).toBe(false);
		},
	);

	it('is allowed while registration is open, except for a registration continued by name', () => {
		expect(canCancelRegistration('registrationOpen', {})).toBe(true);
		expect(canCancelRegistration('registrationOpen', { claimedByName: true })).toBe(false);
	});
});

describe('local choices draft', () => {
	function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
		data: Map<string, string>;
	} {
		const data = new Map<string, string>();

		return {
			data,
			getItem: (key) => data.get(key) ?? null,
			setItem: (key, value) => {
				data.set(key, value);
			},
			removeItem: (key) => {
				data.delete(key);
			},
		};
	}

	it('keeps the choices per assignment and person', () => {
		const storage = memoryStorage();

		saveDraft('s1', 'u1', { ranked: ['a', 'b'], position: null }, storage);

		expect(storage.data.has(draftStorageKey('s1', 'u1'))).toBe(true);
		expect(loadDraft('s1', 'u1', storage)).toEqual({ ranked: ['a', 'b'], position: null });
		expect(loadDraft('other', 'u1', storage)).toBeNull();
		expect(loadDraft('s1', 'u2', storage)).toBeNull();
	});

	it('keeps a position of 0 and "prefer not to answer" apart from no answer yet', () => {
		expect(parseDraft(serializeDraft({ ranked: [], position: 0 }))?.position).toBe(0);
		expect(parseDraft(serializeDraft({ ranked: [], position: 'declined' }))?.position).toBe(
			'declined',
		);
		expect(parseDraft(serializeDraft({ ranked: [], position: null }))?.position).toBeNull();
	});

	it('forgets the draft once saved', () => {
		const storage = memoryStorage();

		saveDraft('s1', 'u1', { ranked: ['a'], position: 25 }, storage);
		clearDraft('s1', 'u1', storage);

		expect(loadDraft('s1', 'u1', storage)).toBeNull();
	});

	it('ignores malformed storage', () => {
		expect(parseDraft('not json')).toBeNull();
		expect(parseDraft('{"ranked":[1],"position":null}')).toBeNull();
		expect(parseDraft('{"ranked":[],"position":"x"}')).toBeNull();
		expect(parseDraft(null)).toBeNull();
	});

	it('remembers that this browser was registered, and starts over with the name on offer', () => {
		const storage = memoryStorage();

		expect(loadMemory('s1', 'u1', storage)).toEqual({
			wasRegistered: false,
			lastName: '',
			cancelledHere: false,
		});
		rememberRegistration('s1', 'u1', 'Dana Levi', storage);
		expect(loadMemory('s1', 'u1', storage)).toEqual({
			wasRegistered: true,
			lastName: 'Dana Levi',
			cancelledHere: false,
		});
		forgetRegistration('s1', 'u1', storage);
		expect(loadMemory('s1', 'u1', storage)).toEqual({
			wasRegistered: false,
			lastName: 'Dana Levi',
			cancelledHere: false,
		});
	});

	it('reads malformed memory as nothing remembered', () => {
		const nothing = { wasRegistered: false, lastName: '', cancelledHere: false };

		expect(parseMemory('{')).toEqual(nothing);
		expect(parseMemory('null')).toEqual(nothing);
	});

	it('tells a registration this browser cancelled from one it lost', () => {
		const storage = memoryStorage();

		expect(registrationLoss(loadMemory('s1', 'u1', storage))).toBeNull();
		rememberRegistration('s1', 'u1', 'Dana', storage);
		expect(registrationLoss(loadMemory('s1', 'u1', storage))).toBe('removed');
		markCancelledHere('s1', 'u1', storage);
		expect(registrationLoss(loadMemory('s1', 'u1', storage))).toBe('cancelled');
		unmarkCancelledHere('s1', 'u1', storage);
		expect(registrationLoss(loadMemory('s1', 'u1', storage))).toBe('removed');
	});

	it('clears the cancel note when the record is seen again or the person starts over', () => {
		const storage = memoryStorage();

		rememberRegistration('s1', 'u1', 'Dana', storage);
		markCancelledHere('s1', 'u1', storage);
		rememberRegistration('s1', 'u1', 'Dana', storage);
		expect(loadMemory('s1', 'u1', storage).cancelledHere).toBe(false);

		markCancelledHere('s1', 'u1', storage);
		forgetRegistration('s1', 'u1', storage);
		expect(registrationLoss(loadMemory('s1', 'u1', storage))).toBeNull();
	});

	it('reads memory written before the cancel note existed as a cancel, as it always was', () => {
		const loss = registrationLoss(parseMemory('{"wasRegistered":true,"lastName":"Dana"}'));

		expect(loss).toBe('cancelled');
	});
});
