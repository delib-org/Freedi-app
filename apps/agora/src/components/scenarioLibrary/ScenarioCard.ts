import m from 'mithril';
import { AgoraTopicPackage, isNewScenario } from '@freedi/shared-types';
import { Icon } from '../Icon';
import { getAvailableLanguages, tCount, t } from '../../lib/i18n';
import { ratingLabel, type CardText } from '../../lib/scenarioLibrary/view';
import { Stars } from './Stars';

const MAX_TAG_CHIPS = 2;

export interface ScenarioCardAttrs {
	pkg: AgoraTopicPackage;
	text: CardText;
	/** Subject labels in the viewer's language, in the order the author chose */
	subjects: readonly string[];
	/** The signed-in teacher wrote it */
	mine?: boolean;
	/** The big version for the featured row */
	featured?: boolean;
	/** An admin is looking at a scenario the teachers cannot see */
	hidden?: boolean;
}

function languageName(code: string): string {
	return getAvailableLanguages().find((entry) => entry.code === code)?.name ?? code;
}

/**
 * One scenario in the grid. The whole card is one link — no buttons inside it
 * — to the scenario's page. The cover is the author's picture; without one it
 * is a tinted tile with the scenario icon, so a card is never blank.
 */
export const ScenarioCard: m.Component<ScenarioCardAttrs> = {
	view({ attrs }) {
		const { pkg, text, subjects, mine = false, featured = false, hidden = false } = attrs;
		const card = pkg.library;
		const stats = pkg.stats;
		const mean = ratingLabel(pkg);
		const copies = stats?.copyCount ?? 0;
		const fresh = card ? isNewScenario(card.publishedAt, Date.now()) : false;
		const extra = subjects.length - MAX_TAG_CHIPS;

		return m(
			m.route.Link,
			{
				href: `/teach/library/${pkg.topicPackageId}`,
				class: `scn-card${featured ? ' scn-card--featured' : ''}${hidden ? ' scn-card--hidden' : ''}`,
				'aria-label': t('scenlib.card_aria', { title: text.title }),
			},
			[
				m('span.scn-card__cover', [
					card?.coverUrl
						? m('img.scn-card__img', { src: card.coverUrl, alt: '', loading: 'lazy' })
						: m('span.scn-card__fallback', m(Icon, { name: 'tunnel', size: 44 })),
					mine ? m('span.scn-card__badge', t('scenlib.badge_mine')) : null,
					!mine && fresh ? m('span.scn-card__badge', t('scenlib.badge_new')) : null,
					hidden
						? m('span.scn-card__badge.scn-card__badge--hidden', t('scenlib.badge_hidden'))
						: null,
				]),
				m('span.scn-card__body', [
					m('span.scn-card__title', text.title),
					m('span.scn-card__summary', text.summary),
					subjects.length > 0
						? m('span.scn-card__tags', [
								...subjects.slice(0, MAX_TAG_CHIPS).map((label) => m('span.scn-tag', label)),
								extra > 0 ? m('span.scn-tag', t('scenlib.more_tags', { n: extra })) : null,
							])
						: null,
					m('span.scn-card__meta', [
						mean
							? m('span.scn-card__rating', [
									m(Stars, { value: Number(mean), size: 16 }),
									m('span.scn-card__rating-text', `${mean} (${stats?.ratingCount ?? 0})`),
								])
							: m('span.scn-card__rating-none', t('scenlib.rating_none')),
						copies > 0 ? m('span', tCount('scenlib.copied_n', copies)) : null,
					]),
					m('span.scn-card__foot', [
						m(
							'span.scn-card__author',
							t('scenlib.by', { name: card?.authorName || t('scenlib.author_anon') }),
						),
						m('span.scn-card__lang', languageName(pkg.language)),
						text.translated ? m('span.scn-card__auto', t('scenlib.translated')) : null,
					]),
				]),
			],
		);
	},
};
