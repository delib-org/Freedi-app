import {
	AgoraDeviceMode,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraSessionOutcome,
	AgoraStage,
} from '@freedi/shared-types';
import { isNewlyFinishedSession } from '../sessionFinish';

const NOW = 1_756_000_000_000;

function session(overrides: Partial<AgoraSession> = {}): AgoraSession {
	return {
		sessionId: 'game-1',
		code: '12345',
		topicPackageId: 'topic-1',
		teacherId: 'teacher-1',
		rootStatementId: 'root-1',
		challengeQuestionId: 'challenge-1',
		deviceMode: AgoraDeviceMode.individual,
		teamSizeMax: 1,
		stage: AgoraStage.deliberation,
		roundNumber: 1,
		participantCount: 20,
		status: AgoraSessionStatus.live,
		createdAt: NOW,
		lastUpdate: NOW,
		...overrides,
	};
}

function scored(overrides: Partial<AgoraSession> = {}): AgoraSession {
	return session({
		stage: AgoraStage.results,
		classScore: {
			maxConsensus: 60,
			personalPointsSum: 400,
			avgPlausibility: 70,
			total: 72,
			threshold: 70,
			success: true,
			outcome: AgoraSessionOutcome.success,
			healthMetricOutcomes: [],
			computedAt: NOW + 1,
		},
		...overrides,
	});
}

describe('isNewlyFinishedSession', () => {
	it('fires when classScore first appears', () => {
		expect(isNewlyFinishedSession(session(), scored())).toBe(true);
	});

	it('fires when agreement results first appear (the camp-less classroom path)', () => {
		const agreed = session({
			stage: AgoraStage.results,
			agreement: { ranked: [], computedAt: NOW + 1 },
		});
		expect(isNewlyFinishedSession(session(), agreed)).toBe(true);
		// and not again on a later, unrelated update
		expect(isNewlyFinishedSession(agreed, { ...agreed, lastUpdate: NOW + 2 })).toBe(false);
	});

	it('fires when status flips to ended without a score (convergence path)', () => {
		expect(isNewlyFinishedSession(session(), session({ status: AgoraSessionStatus.ended }))).toBe(
			true,
		);
	});

	it('does not fire on an ordinary mid-game update', () => {
		expect(isNewlyFinishedSession(session(), session({ roundNumber: 2 }))).toBe(false);
	});

	it('does not fire again when the scored session later ends', () => {
		const before = scored({ aggregatedAt: NOW + 2 });
		const after = scored({ aggregatedAt: NOW + 2, status: AgoraSessionStatus.ended });
		expect(isNewlyFinishedSession(before, after)).toBe(false);
	});

	it('does not fire when aggregatedAt is already stamped', () => {
		expect(isNewlyFinishedSession(session(), scored({ aggregatedAt: NOW + 2 }))).toBe(false);
	});

	it('skips civic sessions entirely', () => {
		expect(
			isNewlyFinishedSession(
				session({ sessionMode: AgoraSessionMode.civic }),
				scored({ sessionMode: AgoraSessionMode.civic }),
			),
		).toBe(false);
	});

	it('does not fire when the score was already there', () => {
		expect(isNewlyFinishedSession(scored(), scored({ lastUpdate: NOW + 9 }))).toBe(false);
	});
});
