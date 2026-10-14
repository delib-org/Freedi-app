import m from 'mithril';
import { AgoraTopicPackage, AgoraTopicStatus, isNewerVersionAvailable } from '@freedi/shared-types';
import { Icon } from './Icon';
import { getLang, t } from '../lib/i18n';
import { isSampleScenario } from '../lib/teacherHome';

export interface ScenarioRowAttrs {
	topic: AgoraTopicPackage;
	/** The library originals behind copies on the shelf, for "a new version" */
	sourceVersions?: ReadonlyMap<string, { lastUpdate: number; title: string }>;
	/** The full list also says when the scenario was last edited */
	showEdited?: boolean;
}

/**
 * One scenario, as a row. The row itself is the door: a finished scenario
 * opens the start screen already holding it, an unfinished one opens where it
 * can be finished. The pencil beside it is the way into the editor — a sibling
 * button, never nested, so it cannot swallow the row's tap.
 *
 * Home and /teach/scenarios print the same row, so a scenario looks the same
 * wherever the teacher meets it.
 */
export function ScenarioRow(): m.Component<ScenarioRowAttrs> {
	return {
		view({ attrs, children }) {
			const { topic, sourceVersions, showEdited } = attrs;
			const id = topic.topicPackageId;
			const ready = topic.status === AgoraTopicStatus.ready;
			const statusId = `scenario-status-${id}`;
			const edit = `/teach/scenarios/${id}`;
			const newVersion =
				topic.sourceScenarioId !== undefined &&
				isNewerVersionAvailable(topic, sourceVersions?.get(topic.sourceScenarioId));

			return m('li.scenario-item', [
				m('.scenario-row', { class: ready ? undefined : 'scenario-row--draft' }, [
					m(
						'button.scenario-row__use',
						{
							type: 'button',
							'aria-label': t(ready ? 'dashboard.scenario_choose' : 'dashboard.scenario_finish', {
								title: topic.title,
							}),
							'aria-describedby': statusId,
							onclick: () => m.route.set(ready ? `/teach/start?topic=${id}` : edit),
						},
						[
							m('span.scenario-row__tile', m(Icon, { name: ready ? 'tunnel' : 'edit', size: 22 })),
							m('span.scenario-row__text', [
								m('span.scenario-row__title', topic.title),
								m('span.scenario-row__meta', { id: statusId }, [
									m(
										'span.scenario-row__status',
										{
											class: ready ? 'scenario-row__status--ready' : 'scenario-row__status--draft',
										},
										t(ready ? 'editor.ready' : 'editor.draft'),
									),
									topic.visibility === 'public'
										? m(
												'span.scenario-row__status.scenario-row__status--shared',
												t('scenlib.public'),
											)
										: null,
									newVersion
										? m(
												'span.scenario-row__status.scenario-row__status--update',
												t('scenlib.new_version'),
											)
										: null,
									showEdited && topic.sourceScenarioId
									? m(
											'span.scenario-row__sub',
											t('scenlib.source_of', {
												title: topic.sourceTitle ?? '',
												author: topic.sourceAuthorName || t('scenlib.author_anon'),
											}),
										)
									: null,
								isSampleScenario(topic)
										? m('span.scenario-row__sub', t('teach.sample_chip'))
										: null,
									ready ? null : m('span.scenario-row__sub', t('dashboard.scenario_draft_sub')),
									showEdited
										? m(
												'span.scenario-row__sub',
												t('teach.edited_on', {
													date: new Date(topic.lastUpdate).toLocaleDateString(getLang(), {
														day: 'numeric',
														month: 'short',
													}),
												}),
											)
										: null,
								]),
							]),
						],
					),
					m(
						'button.scenario-row__edit',
						{
							type: 'button',
							'aria-label': t('dashboard.scenario_settings', { title: topic.title }),
							title: t('dashboard.scenario_settings', { title: topic.title }),
							onclick: () => m.route.set(edit),
						},
						m(Icon, { name: 'edit', size: 20 }),
					),
				]),
				children,
			]);
		},
	};
}

/**
 * "My own question": a lesson on one question and no scenario. A dashed,
 * shadowless row on purpose — it is a different kind of thing from the
 * scenarios above it.
 */
export function ownQuestionRow(): m.Children {
	return m(
		'li.scenario-row.scenario-row--own',
		{ key: 'own-question' },
		m(
			'button.scenario-row__use',
			{
				type: 'button',
				'aria-label': t('dashboard.scenario_choose', { title: t('dashboard.start_quick') }),
				onclick: () => m.route.set('/teach/start?mode=quick'),
			},
			[
				m('span.scenario-row__tile', m(Icon, { name: 'new', size: 22 })),
				m('span.scenario-row__text', [
					m('span.scenario-row__title', t('dashboard.start_quick')),
					m(
						'span.scenario-row__meta',
						m('span.scenario-row__sub', t('dashboard.own_question_sub')),
					),
				]),
				m('span.scenario-row__arrow', m(Icon, { name: 'arrow', size: 20 })),
			],
		),
	);
}
