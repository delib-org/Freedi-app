import m from 'mithril';
import { t } from '../lib/i18n';
import { Collapsible } from './Collapsible';
import type { AgoraCharacter, AgoraTopicPackage } from '@freedi/shared-types';

export interface NeedsBoardAttrs {
	topic: AgoraTopicPackage;
	/**
	 * Drop the board's own title line. Set by NeedsPeek, which promotes the
	 * title into a header row it shares with the fold control — one heading
	 * for the section instead of a stray link sitting above a second heading.
	 */
	hideTitle?: boolean;
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
			vnode.attrs.hideTitle ? null : m('p.needs-board__title', t('needs.board_title')),
			m('.needs-board__columns', [needsColumn(left, 'left'), needsColumn(right, 'right')]),
		]);
	},
};

export interface NeedsPeekAttrs extends NeedsBoardAttrs {
	/**
	 * Start unfolded. The writing surfaces pass true (explicit call,
	 * 2026-08-10): while a student writes or improves their proposal the two
	 * sides' needs are the raw material, so they stand open on the desk
	 * instead of hiding behind the ghost toggle. Everywhere else (rating,
	 * helping, positioning) the board stays a folded reminder.
	 */
	defaultOpen?: boolean;
}

/** The two faces the board is about, as a pair of overlapping portraits */
/** The two sides as a pair of overlapping portraits — exported so a drawer head can wear them */
export function peekFaces(topic: AgoraTopicPackage): m.Children {
	const byId = new Map(topic.characters.map((character) => [character.characterId, character]));
	const pair = [
		byId.get(topic.positioningScale.leftCharacterId) ?? topic.characters[0],
		byId.get(topic.positioningScale.rightCharacterId) ?? topic.characters[1],
	].filter((character): character is AgoraCharacter => character !== undefined);

	return m(
		'.needs-peek__faces',
		{ 'aria-hidden': 'true' },
		pair.map((character, index) =>
			character.portraitUrl
				? m('img.needs-peek__face', {
						key: character.characterId,
						class: `needs-peek__face--${index === 0 ? 'left' : 'right'}`,
						src: character.portraitUrl,
						alt: '',
					})
				: m(
						'span.needs-peek__face.needs-peek__face--fallback',
						{
							key: character.characterId,
							class: `needs-peek__face--${index === 0 ? 'left' : 'right'}`,
						},
						character.name.charAt(0),
					),
		),
	);
}

/** Collapsible needs board for the deliberation screens */
export function NeedsPeek(initialVnode: m.Vnode<NeedsPeekAttrs>): m.Component<NeedsPeekAttrs> {
	let open = initialVnode.attrs.defaultOpen ?? false;

	return {
		view(vnode) {
			const toggle = () => {
				open = !open;
			};

			// Closed, the section IS its invitation — but a bare sentence in the
			// middle of a working screen is the easiest thing in the world to
			// scroll past. It leads with the two faces instead: whose needs are
			// under here is the actual question, and a portrait answers it
			// before the words are read. Open, that line would be a second
			// heading stacked above the board's own, so the title moves up into
			// a header row and the fold control shrinks to a chip beside it.
			return m('.needs-peek', { class: open ? 'needs-peek--open' : undefined }, [
				open
					? m('.needs-peek__head', [
							m('p.needs-peek__title', t('needs.board_title')),
							m(
								'button.needs-peek__fold',
								{ onclick: toggle, 'aria-expanded': 'true' },
								t('needs.hide_short'),
							),
						])
					: m(
							'button.btn.btn--ghost.needs-peek__toggle',
							{ onclick: toggle, 'aria-expanded': 'false' },
							[
								peekFaces(vnode.attrs.topic),
								m('span.needs-peek__toggle-text', t('needs.show_board')),
							],
						),
				open ? m(Collapsible, m(NeedsBoard, { topic: vnode.attrs.topic, hideTitle: true })) : null,
			]);
		},
	};
}
