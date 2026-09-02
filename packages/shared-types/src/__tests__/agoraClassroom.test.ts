import {
	AGORA_CLASSROOM,
	advancementSummary,
	createAgoraClassMemberId,
	emptyAgoraPoints,
	emptyClassAggregate,
	emptyStudentAggregate,
	mergeClassGame,
	mergeStudentGame,
} from '../models/agora/agoraClassroom';
import type {
	AgoraClassGameRow,
	AgoraStudentGameRow,
} from '../models/agora/agoraClassroom';
import { AgoraSessionOutcome } from '../models/agora/agoraEnums';
import type { AgoraPoints } from '../models/agora/agoraParticipant';

const NOW = 1_756_000_000_000;

function points(total: number, partial: Partial<AgoraPoints> = {}): AgoraPoints {
	return { ...emptyAgoraPoints(), ...partial, total };
}

function studentRow(sessionId: string, total: number, playedAt = NOW): AgoraStudentGameRow {
	return {
		sessionId,
		topicPackageId: 'topic-1',
		classId: 'class-1',
		playedAt,
		points: points(total),
	};
}

function classRow(
	sessionId: string,
	overrides: Partial<AgoraClassGameRow> = {},
): AgoraClassGameRow {
	return {
		sessionId,
		topicPackageId: 'topic-1',
		playedAt: NOW,
		participantCount: 20,
		...overrides,
	};
}

describe('createAgoraClassMemberId', () => {
	it('joins classId and memberId with a double dash', () => {
		expect(createAgoraClassMemberId('c1', 'm1')).toBe('c1--m1');
	});
});

describe('mergeStudentGame', () => {
	it('accumulates games, totals and average', () => {
		let agg = emptyStudentAggregate('m1', 'c1', 's1');
		agg = mergeStudentGame(agg, studentRow('g1', 40), NOW);
		agg = mergeStudentGame(agg, studentRow('g2', 60), NOW + 1);

		expect(agg.gamesPlayed).toBe(2);
		expect(agg.totals.total).toBe(100);
		expect(agg.avgPointsPerGame).toBe(50);
		expect(agg.bestGameTotal).toBe(60);
		expect(agg.perGame.map((g) => g.sessionId)).toEqual(['g1', 'g2']);
	});

	it('sums optional point categories as zero when absent', () => {
		let agg = emptyStudentAggregate('m1', 'c1', 's1');
		const row = studentRow('g1', 30);
		delete row.points.rating;
		delete row.points.revising;
		agg = mergeStudentGame(agg, row, NOW);

		expect(agg.totals.rating).toBe(0);
		expect(agg.totals.revising).toBe(0);
	});

	it('refuses a session it has already folded in', () => {
		let agg = emptyStudentAggregate('m1', 'c1', 's1');
		agg = mergeStudentGame(agg, studentRow('g1', 40), NOW);
		const again = mergeStudentGame(agg, studentRow('g1', 40), NOW + 5);

		expect(again).toBe(agg);
		expect(again.gamesPlayed).toBe(1);
		expect(again.totals.total).toBe(40);
	});

	it('caps perGame rows, keeping the newest', () => {
		let agg = emptyStudentAggregate('m1', 'c1', 's1');
		const cap = AGORA_CLASSROOM.STUDENT_GAME_ROWS_CAP;
		for (let i = 0; i < cap + 3; i++) {
			agg = mergeStudentGame(agg, studentRow(`g${i}`, 10, NOW + i), NOW + i);
		}

		expect(agg.perGame).toHaveLength(cap);
		expect(agg.perGame[0].sessionId).toBe('g3');
		expect(agg.perGame[cap - 1].sessionId).toBe(`g${cap + 2}`);
		// The running numbers survive the cap — they are counters, not sums of the array
		expect(agg.gamesPlayed).toBe(cap + 3);
		expect(agg.totals.total).toBe((cap + 3) * 10);
	});

	it('keeps lastPlayedAt monotonic even when rows arrive out of order', () => {
		let agg = emptyStudentAggregate('m1', 'c1', 's1');
		agg = mergeStudentGame(agg, studentRow('g1', 10, NOW + 100), NOW);
		agg = mergeStudentGame(agg, studentRow('g2', 10, NOW + 50), NOW);

		expect(agg.lastPlayedAt).toBe(NOW + 100);
	});
});

describe('mergeClassGame', () => {
	it('tallies outcomes and averages only scored games', () => {
		let agg = emptyClassAggregate('c1', 's1');
		agg = mergeClassGame(
			agg,
			classRow('g1', { classScoreTotal: 80, outcome: AgoraSessionOutcome.success }),
			NOW,
		);
		agg = mergeClassGame(
			agg,
			classRow('g2', { classScoreTotal: 40, outcome: AgoraSessionOutcome.collapse }),
			NOW,
		);
		// A convergence game: no class score, no outcome
		agg = mergeClassGame(agg, classRow('g3', { convergenceScore: 25 }), NOW);

		expect(agg.gamesPlayed).toBe(3);
		expect(agg.avgClassScore).toBe(60);
		expect(agg.outcomes).toEqual({
			success: 1,
			honestDisagreement: 0,
			collapse: 1,
			unscored: 1,
		});
		expect(agg.studentGameSlots).toBe(60);
	});

	it('keeps avgClassScore null for a convergence-only class', () => {
		let agg = emptyClassAggregate('c1', 's1');
		agg = mergeClassGame(agg, classRow('g1', { convergenceScore: 10 }), NOW);
		agg = mergeClassGame(agg, classRow('g2', { convergenceScore: -5 }), NOW);

		expect(agg.avgClassScore).toBeNull();
		expect(agg.outcomes.unscored).toBe(2);
	});

	it('refuses a session it has already folded in', () => {
		let agg = emptyClassAggregate('c1', 's1');
		agg = mergeClassGame(agg, classRow('g1', { classScoreTotal: 70 }), NOW);
		const again = mergeClassGame(agg, classRow('g1', { classScoreTotal: 70 }), NOW);

		expect(again).toBe(agg);
		expect(again.gamesPlayed).toBe(1);
	});

	it('caps perGame rows without skewing the running average', () => {
		let agg = emptyClassAggregate('c1', 's1');
		const cap = AGORA_CLASSROOM.CLASS_GAME_ROWS_CAP;
		for (let i = 0; i < cap + 2; i++) {
			agg = mergeClassGame(
				agg,
				classRow(`g${i}`, { classScoreTotal: 50, outcome: AgoraSessionOutcome.success }),
				NOW,
			);
		}

		expect(agg.perGame).toHaveLength(cap);
		expect(agg.gamesPlayed).toBe(cap + 2);
		expect(agg.avgClassScore).toBe(50);
	});
});

describe('advancementSummary', () => {
	it('derives success rate from scored games only', () => {
		let agg = emptyClassAggregate('c1', 's1');
		agg = mergeClassGame(
			agg,
			classRow('g1', { classScoreTotal: 80, outcome: AgoraSessionOutcome.success }),
			NOW,
		);
		agg = mergeClassGame(
			agg,
			classRow('g2', { classScoreTotal: 60, outcome: AgoraSessionOutcome.honestDisagreement }),
			NOW,
		);
		agg = mergeClassGame(agg, classRow('g3', { convergenceScore: 15 }), NOW);

		const summary = advancementSummary(agg);
		expect(summary.gamesPlayed).toBe(3);
		expect(summary.successRate).toBe(0.5);
		expect(summary.avgClassScore).toBe(70);
	});

	it('reports null rates for a class that has not played a scored game', () => {
		const summary = advancementSummary(emptyClassAggregate('c1', 's1'));
		expect(summary.successRate).toBeNull();
		expect(summary.avgClassScore).toBeNull();
	});
});
