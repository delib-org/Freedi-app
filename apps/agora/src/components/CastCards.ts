import m from 'mithril';
import { t } from '../lib/i18n';
import { CastFace } from './CastBubble';
import type { CastMember } from '../lib/flows/scenarioCast';

export interface CastCardsAttrs {
	cast: readonly CastMember[];
}

/**
 * One chip per character in the desk's bubble. A tap opens the character's
 * card right there, above the pen: the front is what they argue (opinions),
 * the back is what they need. The student writes with both one tap away.
 * The card shows the package's own words — nothing is generated.
 */
export function CastCards(): m.Component<CastCardsAttrs> {
	let openId = '';
	/** Characters whose card is turned to the needs side */
	const flipped = new Set<string>();

	return {
		view(vnode) {
			const { cast } = vnode.attrs;
			if (cast.length === 0) return null;
			const open = cast.find((member) => member.characterId === openId);
			const showNeeds = open ? flipped.has(open.characterId) : false;

			return m('.cast-cards', [
				m(
					'.cast-cards__chips',
					{ role: 'group', 'aria-label': t('cast.cards') },
					cast.map((member) =>
						m(
							'button.cast-chip',
							{
								key: member.characterId,
								'aria-pressed': String(member.characterId === openId),
								'aria-expanded': String(member.characterId === openId),
								onclick: () => {
									openId = member.characterId === openId ? '' : member.characterId;
								},
							},
							[m(CastFace, { member, size: 'sm' }), member.name],
						),
					),
				),
				open
					? m(
							'.cast-card',
							{ class: showNeeds ? 'cast-card--needs' : '', 'data-card': open.characterId },
							[
								m('.cast-card__head', [
									m(CastFace, { member: open }),
									m('div', [m('strong', open.name), m('small', open.role)]),
									m(
										'button.btn.btn--secondary.btn--sm.cast-card__flip',
										{
											'aria-pressed': String(showNeeds),
											onclick: () => {
												if (flipped.has(open.characterId)) flipped.delete(open.characterId);
												else flipped.add(open.characterId);
											},
										},
										showNeeds ? t('cast.show_opinions') : t('cast.show_needs'),
									),
								]),
								m(
									'h3.cast-card__title',
									showNeeds ? t('cast.needs_title') : t('cast.opinions_title'),
								),
								m(
									'ul.cast-card__list',
									(showNeeds ? open.needs : open.opinions).map((line) => m('li', line)),
								),
							],
						)
					: null,
			]);
		},
	};
}
