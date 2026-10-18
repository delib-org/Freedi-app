import {
	AgoraStage,
	questionKindOf,
	type AgoraQuestionKind,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import { t } from '../../../lib/i18n';
import type { AddChoice } from '../../../lib/flows/stagePlanEditor';

/**
 * How a step reads on its card and in the add-step sheet: the type chip, the
 * colour family the chip wears, and the one line that says what students do.
 * One name per concept (docs/ia/agora-lesson-builder.md): the teacher's own
 * question is "My own question", never a bare "Question" beside "My story".
 */

/** The chip's colour family. Rounds share one; the fixed ends are quiet. */
export type StepTone = 'question' | 'round' | 'talk' | 'vote' | 'scene' | 'fixed';

export function questionKindLabel(kind: AgoraQuestionKind): string {
	return kind === 'open' ? t('planb.kind_open') : t(`question.kind_${kind}`);
}

export function choiceLabel(choice: AddChoice): string {
	if (choice.stage === AgoraStage.question) return questionKindLabel(choice.questionKind ?? 'open');

	return t(`teacherStage.${choice.stage}`);
}

export function choiceDescription(choice: AddChoice): string {
	if (choice.stage === AgoraStage.question) return t(`planb.desc_${choice.questionKind ?? 'open'}`);
	// The character scene "needs" and the needs ROUND are two things; their lines differ
	if (choice.stage === AgoraStage.needs) return t('planb.desc_needs_stage');

	return t(`planb.desc_${choice.stage}`);
}

export function choiceTone(choice: AddChoice): StepTone {
	switch (choice.stage) {
		case AgoraStage.question:
			return (choice.questionKind ?? 'open') === 'open' ? 'question' : 'round';
		case AgoraStage.deliberation:
			return 'talk';
		case AgoraStage.voting:
			return 'vote';
		case AgoraStage.lobby:
		case AgoraStage.results:
			return 'fixed';
		default:
			return 'scene';
	}
}

/** A plan item as the add-step sheet would have offered it */
export function choiceOf(item: AgoraStagePlanItem): AddChoice {
	return item.stage === AgoraStage.question
		? { stage: item.stage, questionKind: questionKindOf(item) }
		: { stage: item.stage };
}

/**
 * The card's second line. A question shows the words the students will read
 * (the teacher's own, or the round's default prompt); every other step says
 * in one line what happens in it.
 */
export function stepLine(item: AgoraStagePlanItem): { text: string; isDefault: boolean } {
	if (item.stage !== AgoraStage.question)
		return { text: choiceDescription(choiceOf(item)), isDefault: true };
	const own = (item.title ?? '').trim();
	if (own) return { text: own, isDefault: false };
	const kind = questionKindOf(item);
	if (kind === 'open') return { text: t('startGame.plan_untitled'), isDefault: true };

	return { text: t(`round.${kind}.prompt`), isDefault: true };
}
