import m from 'mithril';
import type { AgoraTopicPackage } from '@freedi/shared-types';

export interface ScenarioFeedbackAttrs {
	scenario: AgoraTopicPackage;
	/** The signed-in teacher wrote it */
	mine: boolean;
	/** The ratings changed the scenario's numbers: the page reads it again */
	onChanged: () => void;
}

/**
 * Where ratings and reviews of a scenario live (phase 2) — and, later, its
 * discussion. The scenario page mounts this under the lesson preview and
 * hands it the scenario; nothing else on the page needs to change when it
 * grows.
 */
export const ScenarioFeedback: m.Component<ScenarioFeedbackAttrs> = {
	view() {
		return null;
	},
};
