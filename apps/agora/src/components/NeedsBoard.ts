import m from 'mithril';
import { t } from '../lib/i18n';
import type { AgoraCharacter, AgoraTopicPackage } from '@freedi/shared-types';

export interface NeedsBoardAttrs {
	topic: AgoraTopicPackage;
}

function needsColumn(character: AgoraCharacter, side: 'left' | 'right'): m.Children {
	return m(`.needs-board__column.needs-board__column--${side}`, [
		m('.needs-board__who', [
			character.portraitUrl
				? m('img.needs-board__portrait', { src: character.portraitUrl, alt: character.name })
				: m('.needs-board__portrait.needs-board__portrait--fallback', character.name.charAt(0)),
			m('.needs-board__names', [
				m('strong', character.name),
				m('span.needs-board__role', character.role),
			]),
		]),
		m(
			'ul.needs-board__list',
			(character.needs ?? []).map((need) => m('li', need)),
		),
	]);
}

/**
 * The two characters' needs side by side — the raw material of every good
 * proposal. Shown when the needs scenes end and reachable again from the
 * deliberation screens, so students can return to it whenever they write
 * or improve a proposal.
 */
export const NeedsBoard: m.Component<NeedsBoardAttrs> = {
	view(vnode) {
		const { topic } = vnode.attrs;
		const byId = new Map(topic.characters.map((character) => [character.characterId, character]));
		const left = byId.get(topic.positioningScale.leftCharacterId) ?? topic.characters[0];
		const right = byId.get(topic.positioningScale.rightCharacterId) ?? topic.characters[1];

		return m('.needs-board', [
			m('p.needs-board__title', t('needs.board_title')),
			m('.needs-board__columns', [needsColumn(left, 'left'), needsColumn(right, 'right')]),
		]);
	},
};

/** Collapsible needs board for the deliberation screens */
export function NeedsPeek(): m.Component<NeedsBoardAttrs> {
	let open = false;

	return {
		view(vnode) {
			return m('.needs-peek', [
				m(
					'button.btn.btn--ghost.needs-peek__toggle',
					{
						onclick: () => {
							open = !open;
						},
					},
					open ? t('needs.hide_board') : t('needs.show_board'),
				),
				open ? m(NeedsBoard, { topic: vnode.attrs.topic }) : null,
			]);
		},
	};
}
