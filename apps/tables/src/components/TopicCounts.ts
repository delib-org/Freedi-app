import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { LONE_TOPIC_COUNT, tablesThatWouldOpen, topicOptions } from '@/logic/topicPicker';

export interface TopicCountsAttrs {
	topics: readonly TableAssignmentTopic[];
	seatsPerTable: number;
}

/**
 * "Sit where you like", registration open: one row per topic with how many
 * chose it and the tables that would open now. A topic with one person is
 * flagged; nobody is moved (IA tables-class-bridge 2.1).
 */
export const TopicCounts: m.Component<TopicCountsAttrs> = {
	view({ attrs }) {
		const { topics, seatsPerTable } = attrs;

		return m(
			'ul.topic-counts',
			topicOptions(topics, undefined).map((option) =>
				m('li.topic-counts__item', { key: option.topicId }, [
					m('span.topic-counts__title', { dir: 'auto' }, option.title),
					m(
						'span.topic-counts__numbers',
						[
							tPlural('tableAssignment.direct.count', option.count),
							tPlural(
								'tableAssignment.live.topicTables',
								tablesThatWouldOpen(option.count, seatsPerTable),
							),
						].join(' · '),
					),
					option.count === LONE_TOPIC_COUNT
						? m(
								'p.topic-counts__flag',
								{ role: 'status', dir: 'auto' },
								t('tableAssignment.close.oneInTopic', { topic: option.title }),
							)
						: null,
				]),
			),
		);
	},
};

/** The flags the server reported after closing: topics where one person registered. */
export const LoneTopicFlags: m.Component<{ titles: readonly string[] }> = {
	view({ attrs }) {
		if (attrs.titles.length === 0) return null;

		return m(
			'ul.topic-counts',
			attrs.titles.map((title) =>
				m('li.topic-counts__item', { key: title }, [
					m(
						'p.topic-counts__flag',
						{ role: 'status', dir: 'auto' },
						t('tableAssignment.close.oneInTopic', { topic: title }),
					),
				]),
			),
		);
	},
};
