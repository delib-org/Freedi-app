import m from 'mithril';
import { t } from '@/lib/i18n';
import { introVideoLabel, type IntroVideo } from '@/lib/classroom/introVideos';
import { isBusy } from './consoleState';

/**
 * "On the projector:" (UX 14.E): the Opening step's one action. A single-choice
 * row, "the text" then one button per video. Buttons with aria-pressed, not a
 * radio group: arrow keys in a radio group select as they move, and every press
 * here changes what the whole room sees. The pressed state follows the lesson
 * doc (the truth the projector also follows), never the click.
 */

export const PROJECTOR_PICK_KEY = 'projector:pick';
const LABEL_ID = 'projector-pick-label';

export interface ProjectorPickAttrs {
	videos: readonly IntroVideo[];
	/** The video the lesson doc says the projector shows; null = the text. */
	projectorVideoId: string | null;
	/** Paused or ended: the projector shows the held screen anyway. */
	held: boolean;
	onPick: (id: string | null) => void;
}

function item(
	label: string,
	on: boolean,
	attrs: ProjectorPickAttrs,
	pickId: string | null,
	testId: string,
): m.Vnode {
	const busy = isBusy(PROJECTOR_PICK_KEY);

	return m(
		'button.projector-pick__item',
		{
			type: 'button',
			class: `${on ? 'projector-pick__item--on' : ''} ${busy ? 'projector-pick__item--busy' : ''}`,
			'aria-pressed': on ? 'true' : 'false',
			'aria-busy': busy && on ? 'true' : undefined,
			'data-testid': testId,
			title: label,
			disabled: attrs.held,
			onclick: () => attrs.onPick(pickId),
		},
		[on ? m('span.projector-pick__mark', { 'aria-hidden': 'true' }) : null, label],
	);
}

export const ProjectorPick: m.Component<ProjectorPickAttrs> = {
	view({ attrs }) {
		if (attrs.videos.length === 0) return null;
		const known = attrs.videos.some((video) => video.id === attrs.projectorVideoId);
		const current = known ? attrs.projectorVideoId : null;

		return m('.projector-pick', [
			m('span.projector-pick__label', { id: LABEL_ID }, t('console.opening.show')),
			m('div.projector-pick__group', { role: 'group', 'aria-labelledby': LABEL_ID }, [
				item(t('console.opening.text'), current === null, attrs, null, 'projector-pick-text'),
				attrs.videos.map((video, index) =>
					item(
						introVideoLabel(video, index + 1),
						current === video.id,
						attrs,
						video.id,
						`projector-pick-${index + 1}`,
					),
				),
			]),
		]);
	},
};
