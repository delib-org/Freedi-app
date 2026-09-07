import { AgoraStage, questionKindOf, type AgoraStagePlanItem } from '@freedi/shared-types';
import { t } from './i18n';

/**
 * A plan item in the teacher's words.
 *
 * Students walk through "the deliberation square" and "the time tunnel" —
 * that is the game, and it stays theirs. The teacher runs a lesson in steps,
 * and the console names them plainly: the story, the characters, needs,
 * discussion, vote. The two vocabularies live in two i18n blocks
 * (`stage.*` for the student navigator, `teacherStage.*` here) so renaming
 * one never moves the other.
 *
 * A question item is its own question — the words the room is reading are
 * the only label that means anything to the teacher.
 */
export function teacherStepLabel(item: AgoraStagePlanItem): string {
	if (item.stage === AgoraStage.question) {
		if (item.title?.trim()) return item.title.trim();
		const kind = questionKindOf(item);

		return kind === 'open' ? t('teacherStage.question') : t(`question.kind_${kind}`);
	}

	return t(`teacherStage.${item.stage}`);
}

/**
 * One sentence of what the students are doing right now — the first line of
 * the console's "now" card. A WizCol round says what the round asks for;
 * an open question says "answering and rating".
 */
export function nowSentence(item: AgoraStagePlanItem): string {
	if (item.stage === AgoraStage.question) {
		const kind = questionKindOf(item);

		return kind === 'open' ? t('teacher.now_question') : t(`teacher.now_round_${kind}`);
	}
	if (item.stage === AgoraStage.ended) return t('teacher.now_results');

	return t(`teacher.now_${item.stage}`);
}

/** The steps a teacher counts: everything but the terminal `ended` marker */
export function countedSteps(plan: readonly AgoraStagePlanItem[]): AgoraStagePlanItem[] {
	return plan.filter((item) => item.stage !== AgoraStage.ended);
}
