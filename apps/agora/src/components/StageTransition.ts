import m from 'mithril';
import { type IconName } from './Icon';
import { HeroIcon } from './HeroIcon';
import { t } from '../lib/i18n';
import { AgoraStage } from '@freedi/shared-types';
import { EraMap } from './EraMap';

export interface StageTransitionAttrs {
	stage: AgoraStage;
	/** A question stage travels under its own title, not the generic label */
	title?: string;
	/** Fade-out phase — the overlay is about to be removed */
	leaving: boolean;
	/**
	 * The teacher's call: the same travel card, with the kicker saying who
	 * sent the class and the line naming the place — one card a student
	 * cannot miss, in both worlds, read aloud by a screen reader.
	 */
	call?: { kicker: string; line: string };
}

interface TransitionMeta {
	icon: IconName;
	labelKey: string;
	lineKey: string;
}

const TRANSITIONS: Partial<Record<AgoraStage, TransitionMeta>> = {
	[AgoraStage.framing]: {
		icon: 'tunnel',
		labelKey: 'stage.framing',
		lineKey: 'transition.framing',
	},
	[AgoraStage.perspectives]: {
		icon: 'era',
		labelKey: 'stage.perspectives',
		lineKey: 'transition.perspectives',
	},
	[AgoraStage.needs]: { icon: 'thought', labelKey: 'stage.needs', lineKey: 'transition.needs' },
	[AgoraStage.positioning]: {
		icon: 'bridge',
		labelKey: 'stage.positioning',
		lineKey: 'transition.positioning',
	},
	[AgoraStage.deliberation]: {
		icon: 'square',
		labelKey: 'stage.deliberation',
		lineKey: 'transition.deliberation',
	},
	[AgoraStage.question]: {
		icon: 'talk',
		labelKey: 'stage.question',
		lineKey: 'transition.question',
	},
	[AgoraStage.voting]: { icon: 'scales', labelKey: 'stage.voting', lineKey: 'transition.voting' },
	[AgoraStage.results]: { icon: 'flag', labelKey: 'stage.results', lineKey: 'transition.results' },
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
		const { call } = vnode.attrs;

		return m(
			'.stage-transition',
			{
				class: [
					vnode.attrs.leaving ? 'stage-transition--leaving' : '',
					call ? 'stage-transition--call' : '',
				]
					.filter(Boolean)
					.join(' '),
				role: call ? 'status' : undefined,
				// A call is an order from the teacher: announced at once, not after
				// whatever the reader was in the middle of
				'aria-live': call ? 'assertive' : 'polite',
				'data-call': call ? 'true' : undefined,
			},
			[
				m('.stage-transition__map', m(EraMap, { participants: [] })),
				m('.stage-transition__panel', [
					// The one slot with room for the rendered sheet: a full-screen
					// card, one object, nothing else competing for the eye.
					m(
						'span.stage-transition__icon',
						{ 'aria-hidden': 'true' },
						m(HeroIcon, { name: meta.icon, size: 88 }),
					),
					call ? m('p.stage-transition__kicker', call.kicker) : null,
					m('h2.stage-transition__title', vnode.attrs.title?.trim() || t(meta.labelKey)),
					m('p.stage-transition__line', call ? call.line : t(meta.lineKey)),
				]),
			],
		);
	},
};
