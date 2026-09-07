import m from 'mithril';
import { t } from '../../lib/i18n';
import { QuestionReword } from './QuestionReword';
import {
	AgoraSceneKind,
	AgoraStage,
	roundSpecOf,
	type AgoraQuestionKind,
} from '@freedi/shared-types';
import type { AgoraScene, AgoraTopicPackage } from '@freedi/shared-types';

export interface TeacherInstructionsAttrs {
	stage: AgoraStage;
	topic: AgoraTopicPackage;
	/** A question stage projects its own question, not a generic prompt */
	questionTitle?: string;
	questionExplanation?: string;
	/** A question item's kind — a WizCol round shows the book's prompt when no title was typed */
	questionKind?: AgoraQuestionKind;
	/** The projector: the students' text only, none of the teacher-facing hints */
	projector?: boolean;
	/**
	 * The console only: let the teacher rewrite the question the room is
	 * looking at. Needs the session and the plan item the words belong to.
	 */
	reword?: { sessionId: string; itemId: string };
}

/** Which scene kinds each scene-stage shows students (mirrors GameController) */
const STAGE_SCENE_KINDS: Partial<Record<AgoraStage, AgoraSceneKind[]>> = {
	[AgoraStage.framing]: [
		AgoraSceneKind.intro,
		AgoraSceneKind.timeTunnel,
		AgoraSceneKind.periodExplainer,
	],
	[AgoraStage.perspectives]: [AgoraSceneKind.perspectiveA, AgoraSceneKind.perspectiveB],
	[AgoraStage.needs]: [AgoraSceneKind.needsQuestion, AgoraSceneKind.needsA, AgoraSceneKind.needsB],
};

/** One scene rendered read-only: the same media, title, text and dialogue students see */
function sceneCard(scene: AgoraScene): m.Children {
	return m('.teacher-instructions__scene', { key: scene.sceneId }, [
		m('h4.teacher-instructions__scene-title', scene.title),
		scene.videoUrl
			? m('video.teacher-instructions__video', {
					src: scene.videoUrl,
					controls: true,
					playsinline: true,
					preload: 'metadata',
				})
			: null,
		scene.imageUrls.length > 0
			? m(
					'.teacher-instructions__images',
					scene.imageUrls.map((url, index) =>
						m('img.teacher-instructions__image', { key: index, src: url, alt: '' }),
					),
				)
			: null,
		scene.text ? m('p.teacher-instructions__text', scene.text) : null,
		scene.dialogue.length > 0
			? m(
					'.teacher-instructions__dialogue',
					scene.dialogue.map((line, index) =>
						m('.teacher-instructions__line', { key: index }, [
							m('.teacher-instructions__speaker', line.speaker),
							m('p.teacher-instructions__quote', line.line),
						]),
					),
				)
			: null,
	]);
}

/** A single prompt (title + hint) for stages that show one instruction, not scenes */
function promptCard(titleKey: string, hintKey: string): m.Children {
	return m('.teacher-instructions__scene', [
		m('h4.teacher-instructions__scene-title', t(titleKey)),
		m('p.teacher-instructions__text', t(hintKey)),
	]);
}

/**
 * The words a question stage actually puts on the screens: the item's own,
 * or — for a round the admin left blank — the book's prompt for its kind, in
 * the reader's language. One function, because the reword editor must open on
 * exactly the sentences the room is reading.
 */
export function questionWording(question?: {
	title?: string;
	explanation?: string;
	kind?: AgoraQuestionKind;
}): { title: string; explanation: string } {
	const round = question ? roundSpecOf(question) : null;
	if (round) {
		return {
			title: question?.title?.trim() || t(`round.${round.kind}.prompt`),
			explanation: question?.explanation?.trim() || t(`round.${round.kind}.hint`),
		};
	}

	return {
		title: question?.title?.trim() || t('stage.question'),
		explanation: question?.explanation?.trim() ?? '',
	};
}

/**
 * Mirrors on the teacher's projector the instructions/narrative the students
 * read for the current stage, so the teacher can read along, narrate and lead
 * a discussion. Scene stages are self-paced per student, so the whole stage's
 * scenes are shown (not any one student's current scene).
 */
function stageBody(
	stage: AgoraStage,
	topic: AgoraTopicPackage,
	question?: { title?: string; explanation?: string; kind?: AgoraQuestionKind },
	projector = false,
): m.Children {
	// The lobby is where the facilitator opens: why a group is wiser than its
	// loudest member, and what will happen at the end (the WizCol guide)
	if (stage === AgoraStage.lobby) {
		return m('.teacher-instructions__scenes', [
			promptCard('intro.goal_title', 'intro.goal_text'),
			promptCard('intro.listen_title', 'intro.listen_text'),
			promptCard('intro.end_title', 'intro.end_text'),
		]);
	}

	if (stage === AgoraStage.question) {
		const words = questionWording(question);
		const round = question ? roundSpecOf(question) : null;

		return m('.teacher-instructions__scene', [
			m('h4.teacher-instructions__scene-title', words.title),
			words.explanation ? m('p.teacher-instructions__text', words.explanation) : null,
			projector
				? null
				: m(
						'p.teacher-instructions__text',
						round ? t(`round.${round.kind}.teacher_line`) : t('question.teacher_hint'),
					),
		]);
	}

	const kinds = STAGE_SCENE_KINDS[stage];
	if (kinds) {
		const scenes = kinds
			.map((kind) => topic.scenes.find((scene) => scene.kind === kind))
			.filter((scene): scene is AgoraScene => scene !== undefined);
		if (scenes.length === 0) return null;

		return m('.teacher-instructions__scenes', scenes.map(sceneCard));
	}

	if (stage === AgoraStage.positioning) {
		return promptCard('positioning.title', 'positioning.hint');
	}

	if (stage === AgoraStage.deliberation) {
		return promptCard('delib.phase_propose', 'delib.propose_hint');
	}

	if (stage === AgoraStage.voting) {
		return promptCard('voting.title', projector ? 'projector.voting_hint' : 'voting.teacher_hint');
	}

	return null;
}

export function TeacherInstructions(): m.Component<TeacherInstructionsAttrs> {
	return {
		view(vnode) {
			const { stage, topic, questionTitle, questionExplanation, questionKind, projector } =
				vnode.attrs;
			const body = stageBody(
				stage,
				topic,
				{ title: questionTitle, explanation: questionExplanation, kind: questionKind },
				projector === true,
			);
			if (!body) return null;

			// The pencil belongs to the question stage alone: the scene stages
			// mirror a package the teacher edits in the topic editor, not here.
			const editable =
				projector !== true && vnode.attrs.reword !== undefined && stage === AgoraStage.question;

			return m('.card.teacher-instructions', [
				projector ? null : m('p.teacher__section-title', t('teacher.student_instructions')),
				body,
				editable && vnode.attrs.reword
					? m(QuestionReword, {
							sessionId: vnode.attrs.reword.sessionId,
							itemId: vnode.attrs.reword.itemId,
							kind: questionKind,
							...questionWording({
								title: questionTitle,
								explanation: questionExplanation,
								kind: questionKind,
							}),
						})
					: null,
			]);
		},
	};
}
