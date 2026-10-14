import m from 'mithril';
import { AgoraScenarioPost, AgoraScenarioRating, AgoraTopicPackage } from '@freedi/shared-types';
import { Stars } from '../../../components/scenarioLibrary/Stars';
import { t } from '../../../lib/i18n';

export interface AdminHiddenAttrs {
	scenarios: readonly AgoraTopicPackage[];
	reviews: readonly AgoraScenarioRating[];
	posts: readonly AgoraScenarioPost[];
	busy: string | null;
	onUnhide: (kind: 'scenario' | 'review' | 'post', id: string) => void;
}

interface Row {
	key: string;
	kind: 'scenario' | 'review' | 'post';
	id: string;
	title: string;
	text: string;
	reason?: string;
	stars?: number;
	scenarioId: string;
}

function rowsOf(attrs: AdminHiddenAttrs): Row[] {
	return [
		...attrs.scenarios.map((pkg) => ({
			key: `scenario:${pkg.topicPackageId}`,
			kind: 'scenario' as const,
			id: pkg.topicPackageId,
			title: pkg.title,
			text: pkg.library?.summary ?? '',
			reason: pkg.library?.hiddenReason,
			scenarioId: pkg.topicPackageId,
		})),
		...attrs.reviews.map((rating) => ({
			key: `review:${rating.ratingId}`,
			kind: 'review' as const,
			id: rating.ratingId,
			title: rating.authorName,
			text: rating.text ?? '',
			reason: rating.hiddenReason,
			stars: rating.stars,
			scenarioId: rating.scenarioId,
		})),
		...attrs.posts.map((post) => ({
			key: `post:${post.postId}`,
			kind: 'post' as const,
			id: post.postId,
			title: post.authorName,
			text: post.text,
			reason: post.hiddenReason,
			scenarioId: post.scenarioId,
		})),
	];
}

/** Everything a sys-admin or a scenario author has hidden, one tap from being shown again */
export const AdminHidden: m.Component<AdminHiddenAttrs> = {
	view({ attrs }) {
		const rows = rowsOf(attrs);
		if (rows.length === 0) return m('p.scn-note', t('scenlib.adm_hidden_empty'));

		return m(
			'ul.scn-adm__list',
			{ role: 'list' },
			rows.map((row) =>
				m('li.scn-adm__item', { key: row.key }, [
					m('.scn-adm__head', [
						m('span.scn-pill.scn-pill--draft', t(`scenlib.adm_kind_${row.kind}`)),
						m('strong', [
							row.title,
							row.stars !== undefined ? [' ', m(Stars, { value: row.stars, size: 16 })] : null,
						]),
					]),
					row.text ? m('p.scn-adm__preview-text', row.text) : null,
					row.reason ? m('p.scn-note', row.reason) : null,
					m('.scn-compose__actions', [
						m(
							'button.btn.btn--secondary.btn--sm',
							{
								type: 'button',
								'aria-disabled': attrs.busy === row.key ? 'true' : undefined,
								onclick: () => {
									if (attrs.busy !== row.key) attrs.onUnhide(row.kind, row.id);
								},
							},
							t('scenlib.admin_unhide'),
						),
						row.kind === 'scenario'
							? null
							: m(
									m.route.Link,
									{ href: `/teach/library/${row.scenarioId}`, class: 'btn btn--ghost btn--sm' },
									t('scenlib.adm_open'),
								),
					]),
				]),
			),
		);
	},
};
