import m from 'mithril';
import { t } from '../lib/i18n';
import { AgoraStage } from '@freedi/shared-types';
import { EraMap } from './EraMap';

export interface StageTransitionAttrs {
	stage: AgoraStage;
	/** Fade-out phase — the overlay is about to be removed */
	leaving: boolean;
}

interface TransitionMeta {
	icon: string;
	labelKey: string;
	lineKey: string;
}

const TRANSITIONS: Partial<Record<AgoraStage, TransitionMeta>> = {
	[AgoraStage.framing]: { icon: '🌀', labelKey: 'stage.framing', lineKey: 'transition.framing' },
	[AgoraStage.perspectives]: {
		icon: '🎭',
		labelKey: 'stage.perspectives',
		lineKey: 'transition.perspectives',
	},
	[AgoraStage.needs]: { icon: '💭', labelKey: 'stage.needs', lineKey: 'transition.needs' },
	[AgoraStage.positioning]: {
		icon: '🌉',
		labelKey: 'stage.positioning',
		lineKey: 'transition.positioning',
	},
	[AgoraStage.deliberation]: {
		icon: '🏛️',
		labelKey: 'stage.deliberation',
		lineKey: 'transition.deliberation',
	},
	[AgoraStage.results]: { icon: '🏁', labelKey: 'stage.results', lineKey: 'transition.results' },
};

/** Stages that get a travel interstitial when the teacher advances into them */
export function hasStageTransition(stage: AgoraStage): boolean {
	return TRANSITIONS[stage] !== undefined;
}

/**
 * The camera move between stages: a short full-screen travel card — the era
 * map easing toward the new location, the stage name, one narrator line.
 * Never a hard cut (DESIGN.md); reduced-motion shows the same card static.
 */
export const StageTransition: m.Component<StageTransitionAttrs> = {
	view(vnode) {
		const meta = TRANSITIONS[vnode.attrs.stage];
		if (!meta) return null;

		return m(
			'.stage-transition',
			{
				class: vnode.attrs.leaving ? 'stage-transition--leaving' : undefined,
				'aria-live': 'polite',
			},
			[
				m('.stage-transition__map', m(EraMap, { participants: [] })),
				m('.stage-transition__panel', [
					m('span.stage-transition__icon', { 'aria-hidden': 'true' }, meta.icon),
					m('h2.stage-transition__title', t(meta.labelKey)),
					m('p.stage-transition__line', t(meta.lineKey)),
				]),
			],
		);
	},
};
