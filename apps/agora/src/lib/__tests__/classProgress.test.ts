import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraParticipant, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	classProgress,
	idleMs,
	participantProgress,
	progressCountKey,
} from '../flows/classProgress';

function participant(overrides: Partial<AgoraParticipant> = {}): AgoraParticipant {
	return {
		participantId: 's--u',
		sessionId: 's',
		userId: 'u',
		anonName: 'Brave Lantern',
		points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
		joinedAt: 0,
		lastActive: 0,
		...overrides,
	};
}

const item = (stage: AgoraStage): AgoraStagePlanItem => ({ itemId: stage, stage });
const facts = {
	proposalAuthors: new Set(['u']),
	answerAuthors: new Set<string>(),
	voterUids: new Set(['v']),
};

describe('participantProgress', () => {
	it('reads each stage from its own fact', () => {
		expect(participantProgress(participant(), item(AgoraStage.deliberation), facts).done).toBe(
			true,
		);
		expect(participantProgress(participant(), item(AgoraStage.question), facts).done).toBe(false);
		expect(participantProgress(participant(), item(AgoraStage.voting), facts).done).toBe(false);
		expect(
			participantProgress(participant({ userId: 'v' }), item(AgoraStage.voting), facts).done,
		).toBe(true);
		expect(
			participantProgress(participant({ campPosition: 40 }), item(AgoraStage.positioning), facts)
				.done,
		).toBe(true);
	});

	it('ignores scene progress reported for a different stage', () => {
		const stale = participant({
			stageProgress: { stage: AgoraStage.framing, scenesDone: 3, scenesTotal: 3 },
		});
		expect(participantProgress(stale, item(AgoraStage.needs), facts)).toEqual({
			done: false,
			label: 'dash',
		});
		expect(participantProgress(stale, item(AgoraStage.framing), facts).label).toBe('check');
	});

	it('reports a partial scene stage as a fraction', () => {
		const partway = participant({
			stageProgress: { stage: AgoraStage.needs, scenesDone: 1, scenesTotal: 3 },
		});
		expect(participantProgress(partway, item(AgoraStage.needs), facts).label).toEqual({
			done: 1,
			total: 3,
		});
	});
});

describe('classProgress', () => {
	it('counts the finished', () => {
		const result = classProgress(
			item(AgoraStage.deliberation),
			[participant(), participant({ userId: 'w', participantId: 's--w' })],
			facts,
		);
		expect(result.doneCount).toBe(1);
		expect(result.entries).toHaveLength(2);
	});

	it('names the count line per stage', () => {
		expect(progressCountKey(AgoraStage.voting)).toBe('teacher.voted_count');
		expect(progressCountKey(AgoraStage.needs)).toBe('teacher.finished_count');
	});

	it('never reports negative idle time', () => {
		expect(idleMs(participant({ lastActive: 50 }), 40)).toBe(0);
		expect(idleMs(participant({ lastActive: 10 }), 40)).toBe(30);
	});
});
