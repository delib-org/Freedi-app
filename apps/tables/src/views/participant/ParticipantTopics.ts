import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { formatConsensus } from '@/logic/format';
import { filterTopics } from '@/logic/topics';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { StateBox } from '@/components/StateBox';
import { participantHomePath, participantScreenPath, participantTopicPath } from '@/paths';

/** The topics list state: loading / error / denied / empty, or null when there are topics to show. */
function topicsGate(context: ParticipantContext, homeHref: string): m.Children {
	if (context.topicsState === 'loading') return m(StateBox, { kind: 'loading' });
	if (context.topicsState === 'denied') {
		return m(StateBox, {
			kind: 'denied',
			backHref: homeHref,
			backLabel: t('tableAssignment.back.toHome'),
		});
	}
	if (context.topicsState === 'error') {
		return m(StateBox, {
			kind: 'error',
			onRetry: context.retryTopics,
			backHref: homeHref,
			backLabel: t('tableAssignment.back.toHome'),
		});
	}
	if (context.topics.length === 0) {
		return m(StateBox, {
			kind: 'empty',
			messageKey: 'tableAssignment.topics.notOpen',
			backHref: homeHref,
			backLabel: t('tableAssignment.back.toHome'),
		});
	}

	return null;
}

function consensusLine(topic: TableAssignmentTopic): m.Vnode | null {
	return topic.consensus === undefined
		? null
		: m(
				'span.badge',
				t('tableAssignment.topic.consensus', { value: formatConsensus(topic.consensus) }),
			);
}

const TopicsBody: m.ClosureComponent<{ context: ParticipantContext }> = () => {
	let search = '';

	return {
		view({ attrs }) {
			const { session, topics } = attrs.context;
			const id = session.tableAssignmentId;
			const gate = topicsGate(attrs.context, participantHomePath(id));

			if (gate) return gate;

			const shown = filterTopics(topics, search);

			return [
				m('label.field', [
					m('span.field__label', t('tableAssignment.topics.search')),
					m('input.field__input', {
						type: 'search',
						value: search,
						oninput: (event: Event) => {
							search = (event.target as HTMLInputElement).value;
						},
					}),
				]),
				shown.length === 0
					? m('p.notice', { role: 'status' }, t('tableAssignment.topics.noMatch'))
					: m(
							'ul.list',
							shown.map((topic) =>
								m('li.list__item', { key: topic.topicId }, [
									m(
										m.route.Link,
										{ href: participantTopicPath(id, topic.topicId), class: 'list__link' },
										[
											m('span.list__title', topic.title),
											topic.description ? m('span.list__meta', topic.description) : null,
											consensusLine(topic),
										],
									),
								]),
							),
						),
				m(
					m.route.Link,
					{ href: participantScreenPath(id, 'preferences'), class: 'btn btn--primary' },
					t(`tableAssignment.stage.act.${session.mode}.button`),
				),
			];
		},
	};
};

const TopicBody: m.ClosureComponent<{ context: ParticipantContext; topicId: string }> = () => ({
	view({ attrs }) {
		const { session } = attrs.context;
		const id = session.tableAssignmentId;
		const listHref = participantScreenPath(id, 'topics');
		const gate = topicsGate(attrs.context, listHref);

		if (gate) return gate;

		const topic = attrs.context.topics.find((candidate) => candidate.topicId === attrs.topicId);

		if (!topic) {
			return m(StateBox, {
				kind: 'error',
				messageKey: 'tableAssignment.topic.unavailable',
				backHref: listHref,
				backLabel: t('tableAssignment.back.toTopics'),
			});
		}

		return m('article.card', [
			m('h2.card__title', topic.title),
			topic.description
				? m('p.card__text', topic.description)
				: m('p.card__hint', t('tableAssignment.topic.noDescription')),
			topic.consensus !== undefined
				? m('p.card__hint', [
						consensusLine(topic),
						' ',
						t('tableAssignment.topic.consensusMeaning'),
					])
				: null,
			m(
				m.route.Link,
				{ href: listHref, class: 'btn btn--ghost' },
				t('tableAssignment.back.toTopics'),
			),
		]);
	},
});

/** `/sessions/:id/topics`: Topics and tables, participant view. */
export const ParticipantTopics: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.topics',
			render: (context: ParticipantContext) => m(TopicsBody, { context }),
		});
	},
};

/** `/sessions/:id/topics/:topicId`: one topic. */
export const ParticipantTopic: m.Component<{ id: string; topicId: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.topic',
			backHref: participantScreenPath(attrs.id, 'topics'),
			backLabel: t('tableAssignment.back.toTopics'),
			render: (context: ParticipantContext) => m(TopicBody, { context, topicId: attrs.topicId }),
		});
	},
};
