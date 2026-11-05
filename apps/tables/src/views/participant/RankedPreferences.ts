import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { SIDE_MAX, SIDE_MIN, TABLE_ASSIGNMENT_MAX_PREFERENCES } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { canEditPreferences } from '@/logic/nextAction';
import { loadDraft, saveDraft } from '@/logic/localDraft';
import {
	isRankingFull,
	keepKnownTopics,
	moveRank,
	rankOf,
	requiredRanks,
	toggleRank,
} from '@/logic/ranking';
import { SideSlider } from '@/components/SideSlider';
import { StateBox } from '@/components/StateBox';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { formatConsensus } from '@/logic/format';
import { participantHomePath } from '@/paths';

/**
 * Ranked mode: pick up to three topics in order (tap to add, 1/2/3 badges,
 * remove, reorder), optionally place yourself on the position axis, save.
 * The choices are mirrored to localStorage on every change and restored on
 * the next visit, so a failed save never loses them.
 */
const POSITION_UNSET = null;

function readStorage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function topicButton(
	topic: TableAssignmentTopic,
	ranked: readonly string[],
	editable: boolean,
	onToggle: (topicId: string) => void,
): m.Vnode {
	const rank = rankOf(ranked, topic.topicId);
	const blocked = !editable || (rank === 0 && isRankingFull(ranked));

	return m('li', { key: topic.topicId }, [
		m(
			'button.pick',
			{
				type: 'button',
				class: rank > 0 ? 'pick--ranked' : '',
				'aria-pressed': rank > 0 ? 'true' : 'false',
				disabled: blocked && rank === 0,
				onclick: () => onToggle(topic.topicId),
			},
			[
				m('span.pick__badge', { 'aria-hidden': 'true' }, rank > 0 ? String(rank) : ''),
				m('span.pick__body', [
					m('span.pick__title', topic.title),
					topic.description ? m('span.pick__text', topic.description) : null,
					topic.consensus !== undefined
						? m(
								'span.badge',
								t('tableAssignment.topic.consensus', { value: formatConsensus(topic.consensus) }),
							)
						: null,
				]),
				rank > 0
					? m('span.visually-hidden', t('tableAssignment.preferences.rankedAs', { rank }))
					: null,
			],
		),
	]);
}

export const RankedPreferences: m.ClosureComponent<{ context: ParticipantContext }> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const save = new Action(
		'tables.participant.savePreferences',
		'tableAssignment.error.preferencesClosed',
	);
	let ranked: string[] = [];
	let position: number | null = POSITION_UNSET;
	let seeded = false;
	let dirty = false;

	function seed(context: ParticipantContext): void {
		const storage = readStorage();
		const local = storage ? loadDraft(sessionId, storage) : null;
		const topicIds = context.topics.map((topic) => topic.topicId);

		if (local) {
			ranked = keepKnownTopics(local.ranked, topicIds);
			position = local.position;
			dirty = true;
		} else {
			ranked = keepKnownTopics(context.me?.preferences ?? [], topicIds);
			position = context.me?.position ?? POSITION_UNSET;
		}
		seeded = true;
	}

	function persist(): void {
		const storage = readStorage();

		dirty = true;
		save.clear();
		if (storage) saveDraft(sessionId, { ranked, position }, storage);
	}

	async function submit(): Promise<void> {
		const result = await save.run(
			() =>
				tablesApi.savePreferences({
					sessionId,
					preferences: ranked,
					...(position === null ? {} : { position }),
				}),
			{ sessionId, count: ranked.length },
		);

		if (result) dirty = false;
	}

	return {
		view({ attrs }) {
			const context = attrs.context;
			const { session, topics, me } = context;
			const home = participantHomePath(sessionId);

			if (!me) {
				return m(StateBox, {
					kind: 'denied',
					messageKey: 'tableAssignment.preferences.notRegistered',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (context.topicsState === 'loading') return m(StateBox, { kind: 'loading' });
			if (context.topicsState !== 'ready') {
				return m(StateBox, {
					kind: context.topicsState,
					onRetry: context.retryTopics,
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (topics.length === 0) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.topics.notOpen',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (!seeded) seed(context);

			const editable = canEditPreferences(session.status);
			const question = session.settings.positionQuestion;
			const topicMap = new Map(topics.map((topic) => [topic.topicId, topic]));
			const needed = requiredRanks(topics.length);

			return [
				m('p.notice', { role: 'note' }, t('tableAssignment.preferences.outsideChoices')),
				!editable
					? m('p.notice.notice--warn', { role: 'status' }, t('tableAssignment.preferences.closed'))
					: null,
				m('section.card', [
					m(
						'h2.card__title',
						t('tableAssignment.preferences.pickTitle', {
							count: needed || TABLE_ASSIGNMENT_MAX_PREFERENCES,
						}),
					),
					m('p.card__hint', t('tableAssignment.preferences.pickHint')),
					m(
						'ul.stack',
						topics.map((topic) =>
							topicButton(topic, ranked, editable, (topicId) => {
								ranked = toggleRank(ranked, topicId);
								persist();
							}),
						),
					),
				]),
				ranked.length > 0
					? m('section.card', [
							m('h2.card__title', t('tableAssignment.preferences.myOrder')),
							m(
								'ol.ranked',
								ranked.map((topicId, index) =>
									m('li.ranked__item', { key: topicId }, [
										m('span.ranked__title', `${index + 1}. ${topicMap.get(topicId)?.title ?? ''}`),
										editable
											? m('span.ranked__actions', [
													m(
														'button.btn.btn--ghost',
														{
															type: 'button',
															disabled: index === 0,
															'aria-label': t('tableAssignment.topic.moveUp'),
															onclick: () => {
																ranked = moveRank(ranked, index, -1);
																persist();
															},
														},
														'↑',
													),
													m(
														'button.btn.btn--ghost',
														{
															type: 'button',
															disabled: index === ranked.length - 1,
															'aria-label': t('tableAssignment.topic.moveDown'),
															onclick: () => {
																ranked = moveRank(ranked, index, 1);
																persist();
															},
														},
														'↓',
													),
													m(
														'button.btn.btn--ghost',
														{
															type: 'button',
															'aria-label': t('tableAssignment.preferences.remove'),
															onclick: () => {
																ranked = ranked.filter((id) => id !== topicId);
																persist();
															},
														},
														'×',
													),
												])
											: null,
									]),
								),
							),
						])
					: null,
				question
					? m('section.card', [
							m('h2.card__title', question.label),
							m('p.card__hint', t('tableAssignment.position.optionalHint')),
							m(SideSlider, {
								value: position,
								labelA: question.poleA,
								labelB: question.poleB,
								onInput: editable
									? (value: number) => {
											position = Math.min(SIDE_MAX, Math.max(SIDE_MIN, value));
											persist();
										}
									: () => undefined,
								onClear: editable
									? () => {
											position = POSITION_UNSET;
											persist();
										}
									: undefined,
							}),
						])
					: null,
				m('section.card.card--sticky', [
					save.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, [
								t(save.errorKey),
								' ',
								t('tableAssignment.preferences.keptLocally'),
							])
						: null,
					save.succeeded && !dirty
						? m('p.notice.notice--ok', { role: 'status' }, t('tableAssignment.preferences.saved'))
						: null,
					editable
						? m(
								'button.btn.btn--primary',
								{
									type: 'button',
									disabled: save.busy || ranked.length === 0,
									onclick: () => void submit(),
								},
								t(
									save.busy
										? 'tableAssignment.saving'
										: save.errorKey
											? 'tableAssignment.retry'
											: 'tableAssignment.preferences.save',
								),
							)
						: null,
					m(
						m.route.Link,
						{ href: home, class: 'btn btn--ghost' },
						t('tableAssignment.back.toHome'),
					),
				]),
			];
		},
	};
};
