import m from 'mithril';
import { t } from '../lib/i18n';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import { Icon, type IconName } from './Icon';
import { lookDots } from './LookPicker';
import type { AgoraThemeSeeds } from '@freedi/shared-types';

export interface StageNavAttrs {
	plan: readonly AgoraStagePlanItem[];
	/** Where the room is */
	currentIndex: number;
	/** Where this player is looking (usually the same) */
	viewingIndex: number;
	onSelect: (itemId: string) => void;
	/** The one-row variant for screens that carry their own HUD */
	compact?: boolean;
	/**
	 * The style door, when this screen has one: the button wears the four
	 * seeds of the look the screen is painted in, so it doubles as the
	 * legend for "why does my screen look like this".
	 */
	look?: { seeds: AgoraThemeSeeds; onOpen: () => void; label: string };
	/**
	 * The teacher's post: drawn only once the teacher has written, with the
	 * count of lines not yet read. Beside the look door for the same reason
	 * that one is there — a door at the end of a scrolling strip is a door you
	 * cannot see.
	 */
	mail?: { unread: number; onOpen: () => void; label: string };
}

const ICONS: Record<AgoraStage, IconName> = {
	[AgoraStage.lobby]: 'people',
	[AgoraStage.framing]: 'tunnel',
	[AgoraStage.perspectives]: 'era',
	[AgoraStage.needs]: 'thought',
	[AgoraStage.valueIdentification]: 'thought',
	[AgoraStage.positioning]: 'bridge',
	[AgoraStage.question]: 'talk',
	[AgoraStage.deliberation]: 'square',
	[AgoraStage.voting]: 'scales',
	[AgoraStage.results]: 'flag',
	[AgoraStage.ended]: 'flag',
};

/** What a plan item is called on screen: a question by its title, the rest by kind */
export function planItemLabel(item: AgoraStagePlanItem): string {
	if (item.stage === AgoraStage.question && item.title?.trim()) return item.title.trim();

	return t(`stage.${item.stage}`);
}

/**
 * The journey as stations — and, for every station already opened, a door.
 *
 * Replaces the read-only journey strip. Opened stations are buttons: a
 * player can step back to re-read what the room said in an earlier stage.
 * Stations ahead stay dark and inert; the teacher opens them. `aria-current`
 * marks the one on THIS screen, which is the current one unless the player
 * stepped back — then the current station keeps a live ring, so "where the
 * room is" never disappears while "where I am" moves.
 */
export const StageNav: m.Component<StageNavAttrs> = {
	view(vnode) {
		const { plan, currentIndex, viewingIndex, onSelect, compact, look, mail } = vnode.attrs;
		const stations = plan
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => item.stage !== AgoraStage.ended);

		return m(
			'nav.stage-nav',
			{ 'aria-label': t('stagenav.aria'), class: compact ? 'stage-nav--compact' : undefined },
			[
				m('.stage-nav__row', [
					...stations.map(({ item, index }) => {
						const opened = index <= currentIndex;
						const state = !opened
							? 'pending'
							: index === viewingIndex
								? 'viewing'
								: index === currentIndex
									? 'current'
									: 'done';
						const label = planItemLabel(item);

						return m(
							opened ? 'button.stage-nav__station' : '.stage-nav__station',
							{
								key: item.itemId,
								class: `stage-nav__station--${state}`,
								'aria-current': state === 'viewing' ? 'step' : undefined,
								title: label,
								...(opened
									? { type: 'button', onclick: () => onSelect(item.itemId) }
									: { 'aria-disabled': 'true' }),
							},
							[
								m(
									'span.stage-nav__dot',
									m(Icon, { name: state === 'done' ? 'check' : ICONS[item.stage], size: 18 }),
								),
								state === 'viewing' || state === 'current'
									? m('span.stage-nav__label', label)
									: m('span.stage-nav__sr', label),
							],
						);
					}),
				]),
				// Beside the row, not in it: the row scrolls sideways on a phone, and
				// a door at the end of a scrolling strip is a door you cannot see
				look
					? m(
							'button.stage-nav__look',
							{
								type: 'button',
								'aria-label': look.label,
								title: look.label,
								onclick: look.onOpen,
							},
							lookDots(look.seeds),
						)
					: null,
				mail
					? m(
							'button.stage-nav__mail',
							{
								type: 'button',
								'aria-label': mail.label,
								title: mail.label,
								onclick: mail.onOpen,
							},
							[
								m(Icon, { name: 'megaphone', size: 18 }),
								mail.unread > 0
									? m('span.stage-nav__mail-badge', { 'aria-hidden': 'true' }, String(mail.unread))
									: null,
							],
						)
					: null,
			],
		);
	},
};
