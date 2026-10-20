import { describe, expect, it } from 'vitest';
import {
	AGORA_STATION_LINK,
	AgoraStage,
	type AgoraParticipant,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import {
	HANDOFF_SAFETY_MS,
	handoffRefreshAt,
	isHandoffFresh,
	linkCheckIdle,
	linkErrorKey,
	stationReturnMessage,
	stationReturnOf,
} from '../flows/linkedStation';
import { villageBooths, villageDesk, villagePlace } from '../flows/villageRoute';
import { classProgress, participantProgress, progressCountKey } from '../flows/classProgress';
import { addChoices, mintItemId, planEditorReduce, stepProblems } from '../flows/stagePlanEditor';

const LINK = { app: 'main' as const, statementId: 'q1', title: 'Where to plant?', linkedAt: 1 };
const LINKED: AgoraStagePlanItem = { itemId: 'linked-1', stage: AgoraStage.linked, link: LINK };
const PLAN: AgoraStagePlanItem[] = [
	{ itemId: 'lobby', stage: AgoraStage.lobby },
	LINKED,
	{ itemId: 'results', stage: AgoraStage.results },
];
const FACTS = {
	proposalAuthors: new Set<string>(),
	answerAuthors: new Set<string>(),
	voterUids: new Set<string>(),
};

function student(uid: string, visit?: { openedAt: number; returnedAt?: number }): AgoraParticipant {
	return {
		participantId: `s--${uid}`,
		sessionId: 's',
		userId: uid,
		anonName: uid,
		points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
		joinedAt: 1,
		lastActive: 1,
		...(visit ? { stationVisits: { 'linked-1': visit } } : {}),
	};
}

describe('linked station flow', () => {
	it('maps a refused check to its sentence, and silence to offline', () => {
		expect(linkErrorKey({ code: 'functions/not-found', details: { reason: 'not_found' } })).toBe(
			'linked.err_not_found',
		);
		expect(linkErrorKey({ details: { reason: 'not_admin' } })).toBe('linked.err_not_admin');
		expect(linkErrorKey({ details: { reason: 'something else' } })).toBe('linked.err_offline');
		expect(linkErrorKey(new Error('network'))).toBe('linked.err_offline');
		expect(linkErrorKey(null)).toBe('linked.err_offline');
	});

	it('opens a prefetched code only while it has time to live, and refreshes at half life', () => {
		expect(isHandoffFresh(undefined, 0)).toBe(false);
		expect(isHandoffFresh(1000 + HANDOFF_SAFETY_MS + 1, 1000)).toBe(true);
		expect(isHandoffFresh(1000 + HANDOFF_SAFETY_MS, 1000)).toBe(false);
		expect(handoffRefreshAt(AGORA_STATION_LINK.HANDOFF_TTL_MS)).toBe(
			AGORA_STATION_LINK.HANDOFF_TTL_MS / 2,
		);
	});

	it('reads the return URL only for a linked step of this plan', () => {
		expect(stationReturnOf({ at: 'booth:linked-1', back: '1' }, PLAN)).toBe('linked-1');
		expect(stationReturnOf({ at: 'booth:linked-1' }, PLAN)).toBeNull();
		expect(stationReturnOf({ at: 'booth:lobby', back: '1' }, PLAN)).toBeNull();
		expect(stationReturnOf({ at: 'booth:nope', back: '1' }, PLAN)).toBeNull();
		expect(stationReturnOf({ at: 'council', back: '1' }, PLAN)).toBeNull();
	});

	it('hears the return message only from the allowed origin, for this plan', () => {
		const data = { type: 'agora-station-return', itemId: 'linked-1' };
		const origins = ['https://app.wizcol.com'];
		expect(stationReturnMessage({ origin: 'https://app.wizcol.com', data }, origins, PLAN)).toBe(
			'linked-1',
		);
		expect(
			stationReturnMessage({ origin: 'https://evil.example', data }, origins, PLAN),
		).toBeNull();
		expect(
			stationReturnMessage(
				{ origin: 'https://app.wizcol.com', data: { ...data, itemId: 'lobby' } },
				origins,
				PLAN,
			),
		).toBeNull();
		expect(
			stationReturnMessage({ origin: 'https://app.wizcol.com', data: 'x' }, origins, PLAN),
		).toBeNull();
	});

	it('starts the link line from what the step already holds', () => {
		expect(linkCheckIdle(LINKED)).toEqual({ kind: 'linked', title: 'Where to plant?' });
		expect(linkCheckIdle({ ...LINKED, link: undefined })).toEqual({ kind: 'idle' });
	});
});

describe('linked stations in the village', () => {
	it('stand as booths with no desk', () => {
		expect(villagePlace(LINKED)).toBe('booth:linked-1');
		expect(villageDesk(LINKED)).toBeNull();
		const booths = villageBooths(PLAN, 1, () => 'label');
		expect(booths).toEqual([
			expect.objectContaining({ itemId: 'linked-1', kind: 'linked', open: true, current: true }),
		]);
	});
});

describe('linked stations in class progress', () => {
	it('reads none, opened and came back', () => {
		expect(participantProgress(student('a'), LINKED, FACTS)).toEqual({
			done: false,
			label: 'dash',
		});
		expect(participantProgress(student('b', { openedAt: 1 }), LINKED, FACTS)).toEqual({
			done: false,
			label: 'opened',
		});
		expect(
			participantProgress(student('c', { openedAt: 1, returnedAt: 2 }), LINKED, FACTS),
		).toEqual({ done: true, label: 'check' });
		const { doneCount } = classProgress(
			LINKED,
			[student('a'), student('b', { openedAt: 1 }), student('c', { openedAt: 1, returnedAt: 2 })],
			FACTS,
		);
		expect(doneCount).toBe(1);
		expect(progressCountKey(LINKED)).toBe('linked.came_back_count');
	});
});

describe('linked stations in the plan editor', () => {
	const options = { hasCharacters: false, frozenCount: 0 };

	it('can be added more than once, numbered, and flags a missing link', () => {
		expect(addChoices(PLAN, options)).toContainEqual({ stage: AgoraStage.linked });
		expect(mintItemId(AgoraStage.linked, PLAN)).toBe('linked-2');
		const next = planEditorReduce(PLAN, { kind: 'add', stage: AgoraStage.linked, at: 2 }, options);
		expect(next.map((item) => item.itemId)).toEqual(['lobby', 'linked-1', 'linked-2', 'results']);
		const problems = stepProblems(next, options);
		expect(problems.get('linked-2')).toBe('linked_needs_link');
		expect(problems.has('linked-1')).toBe(false);
	});

	it('takes the link as a patch', () => {
		const next = planEditorReduce(
			[...PLAN.slice(0, 1), { itemId: 'linked-1', stage: AgoraStage.linked }, PLAN[2]],
			{ kind: 'patch', itemId: 'linked-1', patch: { link: LINK, title: 'Garden' } },
			options,
		);
		expect(next[1]).toEqual({ ...LINKED, title: 'Garden' });
	});
});
