import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { safeStorage } from '@/lib/safeStorage';
import { loadDraft, saveDraft } from '@/logic/localDraft';
import type { ChoicesDraft } from '@/logic/localDraft';
import { participantTopicOrder } from '@/logic/participantOrder';
import { answerFromRecord } from '@/logic/positionStops';
import { keepKnownTopics, rankHintIndex, toggleRank } from '@/logic/ranking';
import { nextStep } from '@/logic/steps';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { RankList } from '@/components/RankList';
import { StateBox } from '@/components/StateBox';
import { StepHeader } from '@/components/StepHeader';
import { saveChoices } from '@/views/participant/saveChoices';
import { participantHomePath, participantScreenPath } from '@/paths';

/** Above this many topics, a title filter appears (IA section 8). */
const FILTER_FROM_TOPICS = 12;

function firstChoices(context: ParticipantContext): ChoicesDraft {
	const { session, uid, me, topics } = context;
	const stored = loadDraft(session.tableAssignmentId, uid, safeStorage);
	const fromRecord = {
		ranked: me?.preferences ?? [],
		position: me ? answerFromRecord(me) : null,
	};
	const draft = stored ?? fromRecord;
	const topicIds = topics.map((topic) => topic.topicId);

	return { ...draft, ranked: keepKnownTopics(draft.ranked, topicIds) };
}

function filterField(value: string, onInput: (value: string) => void): m.Vnode {
	return m('label.field', [
		m('span.field__label.field__label--small', t('tableAssignment.topics.search')),
		m('input.field__input', {
			type: 'search',
			dir: 'auto',
			value,
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
		}),
	]);
}

/** Step 2 in mix mode. Moves on with one button; saves only when it is the last step. */
export const RankedPreferences: m.ClosureComponent<{ context: ParticipantContext }> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const uid = initial.attrs.context.uid;
	const save = new Action(
		'tables.participant.savePreferences',
		'tableAssignment.error.preferencesClosed',
	);
	let choices: ChoicesDraft | null = null;
	let filter = '';

	function update(ranked: string[], position: ChoicesDraft['position']): void {
		choices = { ranked, position };
		save.clear();
		saveDraft(sessionId, uid, choices, safeStorage);
	}

	async function finish(context: ParticipantContext, current: ChoicesDraft): Promise<void> {
		const next = nextStep(context.session, 'preferences');

		saveDraft(sessionId, uid, current, safeStorage);
		if (next) {
			goTo(participantScreenPath(sessionId, next));

			return;
		}
		if (await saveChoices(save, { sessionId, uid }, current)) goTo(participantHomePath(sessionId));
	}

	function matchesFilter(topic: TableAssignmentTopic): boolean {
		return topic.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
	}

	function continueButton(context: ParticipantContext, current: ChoicesDraft): m.Vnode {
		const isLast = nextStep(context.session, 'preferences') === null;
		const labelKey = save.busy
			? 'tableAssignment.saving'
			: current.ranked.length === 0
				? 'tableAssignment.rank.pickOne'
				: isLast
					? 'tableAssignment.save'
					: 'tableAssignment.continue';

		return m(
			'button.btn.btn--primary.btn--cta',
			{
				type: 'button',
				disabled: save.busy || current.ranked.length === 0,
				onclick: () => void finish(context, current),
			},
			t(labelKey),
		);
	}

	return {
		view({ attrs }) {
			const { context } = attrs;
			const { topics, topicsState } = context;
			const home = participantHomePath(sessionId);
			const back = { backHref: home, backLabel: t('tableAssignment.back') };

			if (topicsState === 'loading') return m(StateBox, { kind: 'loading' });
			if (topicsState !== 'ready') {
				return m(StateBox, { kind: topicsState, onRetry: context.retryTopics, ...back });
			}
			if (topics.length === 0) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.topics.notOpen',
					...back,
				});
			}

			choices = choices ?? firstChoices(context);

			const current = choices;
			// Each person sees the tables in their own random order, drawn once and kept in this browser.
			const ownOrder = participantTopicOrder(topics, sessionId, uid, safeStorage);

			return m('.screen', [
				m(StepHeader, {
					title: t('tableAssignment.rank.title'),
					lead: t('tableAssignment.rank.lead'),
					backHref: participantScreenPath(sessionId, 'name'),
				}),
				m('.rank-stack', [
					topics.length > FILTER_FROM_TOPICS
						? filterField(filter, (value) => {
								filter = value;
							})
						: null,
					m(RankList, {
						topics: ownOrder,
						ranked: current.ranked,
						matches: matchesFilter,
						onToggle: (topicId: string) =>
							update(toggleRank(current.ranked, topicId), current.position),
						onReorder: (next: string[]) => update(next, current.position),
					}),
					m(
						'p.rank-hint',
						{ 'aria-live': 'polite' },
						t(`tableAssignment.rank.hint.${rankHintIndex(current.ranked, topics.length)}`),
					),
				]),
				m('.screen__foot', [
					m('p.notice', { role: 'note' }, t('tableAssignment.rank.note')),
					save.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, [
								t(save.errorKey),
								' ',
								t('tableAssignment.choices.keptLocally'),
							])
						: null,
					continueButton(context, current),
				]),
			]);
		},
	};
};
