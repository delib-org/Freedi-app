import {
	AgoraStage,
	roundProgress,
	roundSpecOf,
	type AgoraParticipant,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

/**
 * Who has finished what — the pure arithmetic behind the teacher's class
 * progress card and the Class tab. No vnodes: the views draw a check, a dash
 * or "3/5" from what this returns, and vitest can assert it in node.
 */

/** Stages where students move through self-paced steps the teacher cannot see */
export const PROGRESS_STAGES: ReadonlySet<AgoraStage> = new Set<AgoraStage>([
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.question,
	AgoraStage.deliberation,
	AgoraStage.voting,
]);

export type ProgressLabel = 'check' | 'dash' | { done: number; total: number };

export interface StageProgress {
	done: boolean;
	label: ProgressLabel;
}

/** The facts a stage's completion is read from — only ids, never text */
export interface ProgressFacts {
	/** creatorIds of the square's proposals */
	proposalAuthors: ReadonlySet<string>;
	/** creatorIds of the answers under a question stage's Statement */
	answerAuthors: ReadonlySet<string>;
	/** uids that cast a ballot */
	voterUids: ReadonlySet<string>;
	/**
	 * How many of the current item's texts each student weighed — a round
	 * is done when the text is in and the dealt sample is read. Absent on
	 * the stages that do not read it.
	 */
	ratedByUid?: ReadonlyMap<string, number>;
	/** How many classmates' texts the current round deals; absent = the round's own sample */
	roundSampleCap?: number;
}

const DONE: StageProgress = { done: true, label: 'check' };
const NOT_DONE: StageProgress = { done: false, label: 'dash' };

/** One student's progress within one stage */
export function participantProgress(
	participant: AgoraParticipant,
	item: AgoraStagePlanItem,
	facts: ProgressFacts,
): StageProgress {
	const stage = item.stage;
	if (stage === AgoraStage.voting) return facts.voterUids.has(participant.userId) ? DONE : NOT_DONE;
	if (stage === AgoraStage.positioning) {
		return participant.campPosition !== undefined ? DONE : NOT_DONE;
	}
	if (stage === AgoraStage.deliberation) {
		return facts.proposalAuthors.has(participant.userId) ? DONE : NOT_DONE;
	}
	if (stage === AgoraStage.question) {
		const spec = roundSpecOf(item);
		if (!spec) return facts.answerAuthors.has(participant.userId) ? DONE : NOT_DONE;
		// A round: the text is in AND the dealt sample is read
		const sample = Math.min(spec.sample, facts.roundSampleCap ?? Number.POSITIVE_INFINITY);
		const { done, total } = roundProgress(
			facts.answerAuthors.has(participant.userId),
			facts.ratedByUid?.get(participant.userId) ?? 0,
			sample,
		);
		if (done >= total) return DONE;

		return { done: false, label: { done, total } };
	}
	const progress = participant.stageProgress;
	// Progress from an earlier stage says nothing about this one
	if (!progress || progress.stage !== stage) return NOT_DONE;
	if (progress.scenesDone >= progress.scenesTotal) return DONE;

	return { done: false, label: { done: progress.scenesDone, total: progress.scenesTotal } };
}

/** The whole class on the current item: entries plus the finished count */
export function classProgress(
	item: AgoraStagePlanItem,
	participants: readonly AgoraParticipant[],
	facts: ProgressFacts,
): { entries: Array<{ participant: AgoraParticipant } & StageProgress>; doneCount: number } {
	const entries = participants.map((participant) => ({
		participant,
		...participantProgress(participant, item, facts),
	}));

	return { entries, doneCount: entries.filter((entry) => entry.done).length };
}

/** Which of the count lines fits the item */
export function progressCountKey(item: AgoraStagePlanItem): string {
	const stage = item.stage;
	if (stage === AgoraStage.positioning) return 'teacher.positioned_count';
	if (stage === AgoraStage.voting) return 'teacher.voted_count';
	if (stage === AgoraStage.question) {
		return roundSpecOf(item) ? 'teacher.read_count' : 'teacher.answered_count';
	}

	return 'teacher.finished_count';
}

/** How long since this student's device last reported anything */
export function idleMs(participant: AgoraParticipant, now: number): number {
	return Math.max(0, now - participant.lastActive);
}
