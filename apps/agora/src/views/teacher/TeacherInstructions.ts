import m from 'mithril';
import { t } from '../../lib/i18n';
import { AgoraSceneKind, AgoraStage } from '@freedi/shared-types';
import type { AgoraScene, AgoraTopicPackage } from '@freedi/shared-types';

export interface TeacherInstructionsAttrs {
	stage: AgoraStage;
	topic: AgoraTopicPackage;
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

/** One scene rendered read-only: title, narration text, and all dialogue lines */
function sceneCard(scene: AgoraScene): m.Children {
	return m('.teacher-instructions__scene', { key: scene.sceneId }, [
		m('h4.teacher-instructions__scene-title', scene.title),
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
 * Mirrors on the teacher's projector the instructions/narrative the students
 * read for the current stage, so the teacher can read along, narrate and lead
 * a discussion. Scene stages are self-paced per student, so the whole stage's
 * scenes are shown (not any one student's current scene).
 */
function stageBody(stage: AgoraStage, topic: AgoraTopicPackage): m.Children {
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

	return null;
}

export function TeacherInstructions(): m.Component<TeacherInstructionsAttrs> {
	return {
		view(vnode) {
			const { stage, topic } = vnode.attrs;
			const body = stageBody(stage, topic);
			if (!body) return null;

			return m('.card.teacher-instructions', [
				m('p.teacher__section-title', t('teacher.student_instructions')),
				body,
			]);
		},
	};
}
