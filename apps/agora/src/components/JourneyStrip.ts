import m from 'mithril';
import { t } from '../lib/i18n';
import { AgoraStage } from '@freedi/shared-types';

export interface JourneyStripAttrs {
	stage: AgoraStage;
}

interface JourneyStation {
	/** Stages that light this station (retired stages fold into their neighbor) */
	stages: AgoraStage[];
	icon: string;
	labelKey: string;
}

/**
 * The journey's stations in play order. valueIdentification is retired from
 * the flow but legacy sessions may still carry it — fold it into "needs" so
 * the strip never shows an unlit hole.
 */
const STATIONS: ReadonlyArray<JourneyStation> = [
	{ stages: [AgoraStage.framing], icon: '🌀', labelKey: 'stage.framing' },
	{ stages: [AgoraStage.perspectives], icon: '🎭', labelKey: 'stage.perspectives' },
	{
		stages: [AgoraStage.needs, AgoraStage.valueIdentification],
		icon: '💭',
		labelKey: 'stage.needs',
	},
	{ stages: [AgoraStage.positioning], icon: '🌉', labelKey: 'stage.positioning' },
	{ stages: [AgoraStage.deliberation], icon: '🏛️', labelKey: 'stage.deliberation' },
	{ stages: [AgoraStage.results, AgoraStage.ended], icon: '🏁', labelKey: 'stage.results' },
];

/**
 * Persistent "you are here" strip — the whole journey as stations, the
 * current one lit and labeled. In the lobby no station is active yet: the
 * strip previews the road ahead.
 */
export const JourneyStrip: m.Component<JourneyStripAttrs> = {
	view(vnode) {
		const activeIndex = STATIONS.findIndex((station) => station.stages.includes(vnode.attrs.stage));

		return m(
			'nav.journey-strip',
			{ 'aria-label': t('journey.aria') },
			STATIONS.map((station, index) => {
				const state =
					activeIndex === -1
						? 'pending'
						: index < activeIndex
							? 'done'
							: index === activeIndex
								? 'current'
								: 'pending';

				return m(
					'.journey-strip__station',
					{
						class: `journey-strip__station--${state}`,
						'aria-current': state === 'current' ? 'step' : undefined,
					},
					[
						m('span.journey-strip__dot', state === 'done' ? '✓' : station.icon),
						// Only the current station carries its name — the strip stays
						// compact and the label answers "where am I?" at a glance
						state === 'current'
							? m('span.journey-strip__label', t(station.labelKey))
							: m('span.journey-strip__sr', t(station.labelKey)),
					],
				);
			}),
		);
	},
};
