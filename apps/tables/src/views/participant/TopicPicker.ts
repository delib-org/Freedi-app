import m from 'mithril';
import { t, tPlural } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { tablesApi } from '@/lib/tableAssignment/client';
import { chosenTopicId, topicOptions } from '@/logic/topicPicker';
import type { TopicOption } from '@/logic/topicPicker';
import { StateBox } from '@/components/StateBox';
import { StepHeader } from '@/components/StepHeader';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { participantHomePath, participantScreenPath } from '@/paths';

/**
 * "Sit where you like", split by topic (IA tables-class-bridge 2.3): one card
 * per topic with how many chose it and a button to choose it. The choice is
 * saved as the person's single preference; no table is shown until closing.
 */
export const TopicPicker: m.ClosureComponent<{ context: ParticipantContext }> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const choose = new Action(
		'tables.participant.chooseTopic',
		'tableAssignment.error.preferencesClosed',
	);
	let pendingTopicId: string | null = null;

	async function pick(topicId: string): Promise<void> {
		pendingTopicId = topicId;
		const saved = await choose.run(
			() => tablesApi.savePreferences({ sessionId, preferences: [topicId] }),
			{ sessionId, topicId },
		);

		pendingTopicId = null;
		if (saved) goTo(participantHomePath(sessionId));
	}

	function card(option: TopicOption): m.Vnode {
		const busy = choose.busy && pendingTopicId === option.topicId;

		return m(
			'li.card.table-pick',
			{ key: option.topicId, class: option.mine ? 'table-pick--mine' : '' },
			[
				m('h3.table-pick__topic', { dir: 'auto' }, option.title),
				m('p.card__hint', tPlural('tableAssignment.direct.count', option.count)),
				option.mine
					? m('p.badge', t('tableAssignment.topic.yours'))
					: m(
							'button.btn.btn--primary',
							{ type: 'button', disabled: choose.busy, onclick: () => void pick(option.topicId) },
							t(busy ? 'tableAssignment.saving' : 'tableAssignment.topic.choose'),
						),
			],
		);
	}

	return {
		view({ attrs }) {
			const { context } = attrs;
			const { topics, me, topicsState } = context;
			const home = participantHomePath(sessionId);

			if (!me) return null;
			if (topicsState === 'loading') return m(StateBox, { kind: 'loading' });
			if (topicsState !== 'ready') {
				return m(StateBox, { kind: topicsState, onRetry: context.retryTopics, backHref: home });
			}
			if (topics.length === 0) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.topics.notOpen',
					backHref: home,
				});
			}

			const options = topicOptions(topics, chosenTopicId(me));

			return m('.screen', [
				m(StepHeader, {
					title: t('tableAssignment.chooseTopic'),
					backHref: participantScreenPath(sessionId, 'name'),
				}),
				m('p.card__hint', t('tableAssignment.myTable.numberLater')),
				choose.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(choose.errorKey)) : null,
				m('ul.stack', options.map(card)),
				me.preferences.length > 0
					? m(
							m.route.Link,
							{ href: participantScreenPath(sessionId, 'my-table'), class: 'btn btn--ghost' },
							t('tableAssignment.stage.seeMyTable'),
						)
					: null,
			]);
		},
	};
};
