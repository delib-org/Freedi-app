import m from 'mithril';
import type { TableAssignmentParticipant, TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { checkIcon } from '@/components/icons';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { StateBox } from '@/components/StateBox';
import { CancelParticipation } from '@/views/participant/CancelDialog';
import { participantScreenPath } from '@/paths';

const FIRST_NAME_SEPARATOR = /\s+/;
const DONE_ICON_SIZE = 32;
const STEP_ICON_SIZE = 16;

function firstName(fullName: string): string {
	return fullName.trim().split(FIRST_NAME_SEPARATOR)[0];
}

function hasAnswers(me: TableAssignmentParticipant): boolean {
	return me.preferences.length > 0 || me.chosenTableIndex !== undefined;
}

function choicesList(me: TableAssignmentParticipant, topics: TableAssignmentTopic[]): m.Vnode {
	const titles = new Map(topics.map((topic) => [topic.topicId, topic.title]));

	return m(
		'ol.waiting__choices',
		me.preferences.map((topicId, index) =>
			m('li.waiting__choice', { key: topicId }, [
				m('span.waiting__rank', String(index + 1)),
				m('span', { dir: 'auto' }, titles.get(topicId) ?? t('tableAssignment.topic.unknown')),
			]),
		),
	);
}

/** The choices are titled from the topics: show their loading or error, never "unknown" for all. */
function choices(context: ParticipantContext, me: TableAssignmentParticipant): m.Children {
	const { topicsState, topics } = context;

	if (topicsState === 'ready') return choicesList(me, topics);
	if (topicsState === 'loading') return m(StateBox, { kind: 'loading' });

	return m(StateBox, { kind: topicsState, onRetry: context.retryTopics });
}

function detailsCard(
	context: ParticipantContext,
	me: TableAssignmentParticipant,
	isOpen: boolean,
): m.Vnode {
	const { session } = context;

	return m('section.waiting__card', [
		m('h2.waiting__heading', t('tableAssignment.waiting.details')),
		m('span.waiting__name', { dir: 'auto' }, me.fullName),
		me.preferences.length > 0 ? choices(context, me) : null,
		session.settings.positionQuestion && me.preferences.length > 0
			? m(
					'span.waiting__position',
					t(
						me.position === undefined
							? 'tableAssignment.waiting.positionDeclined'
							: 'tableAssignment.waiting.positionAnswered',
					),
				)
			: null,
		isOpen
			? m(
					m.route.Link,
					{
						href: participantScreenPath(session.tableAssignmentId, 'name'),
						class: 'btn btn--soft',
					},
					t('tableAssignment.editDetails'),
				)
			: null,
	]);
}

function progressStep(textKey: string, done: boolean): m.Vnode {
	return m('li.waiting__step', [
		m(
			'span.waiting__dot',
			{ class: done ? 'waiting__dot--done' : '', 'aria-hidden': 'true' },
			done ? checkIcon(STEP_ICON_SIZE) : null,
		),
		m('span', t(textKey)),
	]);
}

function whatHappensNow(isOpen: boolean): m.Vnode {
	return m('section.waiting__progress', [
		m('h2.waiting__heading', t('tableAssignment.waiting.next')),
		m('ol.waiting__steps', [
			progressStep('tableAssignment.waiting.step.registered', true),
			progressStep(
				isOpen ? 'tableAssignment.waiting.step.closing' : 'tableAssignment.waiting.step.closed',
				!isOpen,
			),
			progressStep('tableAssignment.waiting.step.published', false),
		]),
	]);
}

function unfinishedPrompt(context: ParticipantContext, name: string): m.Vnode {
	const { session } = context;

	return m('.waiting__head', [
		m(
			'h1.screen__title.screen__title--page',
			{ dir: 'auto' },
			t('tableAssignment.waiting.unfinished.title', { name }),
		),
		m('p.waiting__lead', t(`tableAssignment.waiting.unfinished.lead.${session.mode}`)),
		m(
			m.route.Link,
			{
				href: participantScreenPath(session.tableAssignmentId, 'preferences'),
				class: 'btn btn--primary btn--cta',
			},
			t(`tableAssignment.waiting.unfinished.button.${session.mode}`),
		),
	]);
}

function savedHeader(name: string, titleKey: string, showLead: boolean): m.Vnode {
	return m('.waiting__head', [
		m('span.waiting__done-mark', { 'aria-hidden': 'true' }, checkIcon(DONE_ICON_SIZE)),
		m('h1.screen__title.screen__title--page', { dir: 'auto' }, t(titleKey, { name })),
		showLead ? m('p.waiting__lead', t('tableAssignment.waiting.lead')) : null,
	]);
}

/** Saved and waiting, before and after registration closes. */
export const ParticipantWaiting: m.Component<{ context: ParticipantContext }> = {
	view({ attrs }) {
		const { context } = attrs;
		const { me, session } = context;

		if (!me) return null;

		const isOpen = session.status === 'registrationOpen';
		const name = firstName(me.fullName);
		const answered = hasAnswers(me);

		return m('.screen', [
			!answered && isOpen
				? unfinishedPrompt(context, name)
				: savedHeader(
						name,
						answered ? 'tableAssignment.waiting.title' : 'tableAssignment.waiting.registeredTitle',
						answered,
					),
			detailsCard(context, me, isOpen && answered),
			whatHappensNow(isOpen),
			isOpen ? null : m('p.notice', { role: 'note' }, t('tableAssignment.waiting.closedNote')),
			m(CancelParticipation, { context }),
		]);
	},
};
