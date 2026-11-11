import m from 'mithril';
import { TABLE_ASSIGNMENT_POSITION_STOPS } from '@freedi/shared-types';
import type { TableAssignmentPositionQuestion } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { safeStorage } from '@/lib/safeStorage';
import { preferencesAccess } from '@/logic/nextAction';
import { loadDraft, saveDraft } from '@/logic/localDraft';
import type { ChoicesDraft } from '@/logic/localDraft';
import { answerFromRecord, POSITION_DECLINED, stopLabel } from '@/logic/positionStops';
import type { PositionAnswer } from '@/logic/positionStops';
import { stepNumber, stepsOf } from '@/logic/steps';
import { checkIcon, lockIcon } from '@/components/icons';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { Redirect } from '@/components/Redirect';
import { StateBox } from '@/components/StateBox';
import { stepLabel, StepHeader } from '@/components/StepHeader';
import { saveChoicesAndLeave } from '@/views/participant/saveChoices';
import { participantHomePath, participantScreenPath } from '@/paths';

const GROUP_NAME = 'position-answer';
const TITLE_ID = 'position-question';
const CHECK_SIZE = 22;
const DECLINE_CHECK_SIZE = 20;

function radio(label: string, isOn: boolean, onPick: () => void): m.Vnode {
	return m('input.visually-hidden-input', {
		type: 'radio',
		name: GROUP_NAME,
		checked: isOn,
		'aria-label': label,
		onchange: onPick,
	});
}

function stops(
	question: TableAssignmentPositionQuestion,
	answer: PositionAnswer | null,
	onPick: (answer: PositionAnswer) => void,
): m.Vnode {
	return m('.position__scale', [
		m('.position__track', [
			m('.position__line', { 'aria-hidden': 'true' }),
			m(
				'.position__stops',
				TABLE_ASSIGNMENT_POSITION_STOPS.map((value, index) => {
					const isOn = answer === value;

					return m('label.position-stop', { class: isOn ? 'position-stop--on' : '' }, [
						radio(stopLabel(index, question, t), isOn, () => onPick(value)),
						m('span.position-stop__dot', isOn ? checkIcon(CHECK_SIZE) : null),
					]);
				}),
			),
		]),
		m('.position__poles', { 'aria-hidden': 'true' }, [
			m('span', { dir: 'auto' }, question.poleA),
			m('span', { dir: 'auto' }, question.poleB),
		]),
	]);
}

function declineOption(isOn: boolean, onPick: () => void): m.Vnode {
	const label = t('tableAssignment.position.unknown');

	return m('label.position__decline', { class: isOn ? 'position__decline--on' : '' }, [
		radio(label, isOn, onPick),
		isOn ? checkIcon(DECLINE_CHECK_SIZE) : null,
		m('span', label),
	]);
}

function feedbackOf(
	question: TableAssignmentPositionQuestion,
	answer: PositionAnswer | null,
): string {
	if (answer === null) return '';
	if (answer === POSITION_DECLINED) return t('tableAssignment.position.declined');

	const index = TABLE_ASSIGNMENT_POSITION_STOPS.findIndex((value) => value === answer);

	return t('tableAssignment.position.chosen', { label: stopLabel(index, question, t) });
}

const PositionBody: m.ClosureComponent<{ context: ParticipantContext; draft: ChoicesDraft }> = (
	initial,
) => {
	const { session, uid } = initial.attrs.context;
	const sessionId = session.tableAssignmentId;
	const save = new Action(
		'tables.participant.savePreferences',
		'tableAssignment.error.preferencesClosed',
	);
	let draft = initial.attrs.draft;

	function pick(answer: PositionAnswer): void {
		draft = { ...draft, position: answer };
		save.clear();
		saveDraft(sessionId, uid, draft, safeStorage);
	}

	async function submit(): Promise<void> {
		await saveChoicesAndLeave(save, { sessionId, uid }, draft);
	}

	return {
		view({ attrs }) {
			const question = attrs.context.session.settings.positionQuestion;

			if (!question) return null;

			const answer = draft.position;

			return m('.screen', [
				m('.position__body', [
					m(StepHeader, {
						eyebrow: t('tableAssignment.position.eyebrow'),
						title: question.label,
						titleId: TITLE_ID,
						backHref: participantScreenPath(sessionId, 'preferences'),
					}),
					m('.position__why', [
						m('p', t('tableAssignment.position.why')),
						m('.position__privacy', [lockIcon(), m('p', t('tableAssignment.position.privacy'))]),
					]),
					m('.position__answers', { role: 'radiogroup', 'aria-labelledby': TITLE_ID }, [
						stops(question, answer, pick),
						declineOption(answer === POSITION_DECLINED, () => pick(POSITION_DECLINED)),
					]),
					m(
						'p.position__feedback',
						{ 'aria-live': 'polite', dir: 'auto' },
						feedbackOf(question, answer),
					),
				]),
				m('.screen__foot', [
					save.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, [
								t(save.errorKey),
								' ',
								t('tableAssignment.choices.keptLocally'),
							])
						: null,
					m(
						'button.btn.btn--primary.btn--cta',
						{
							type: 'button',
							disabled: save.busy || answer === null,
							onclick: () => void submit(),
						},
						t(
							save.busy
								? 'tableAssignment.saving'
								: answer === null
									? 'tableAssignment.position.pickOne'
									: 'tableAssignment.save',
						),
					),
				]),
			]);
		},
	};
};

function draftForPosition(context: ParticipantContext): ChoicesDraft | null {
	const { me, session, uid } = context;
	const stored = loadDraft(session.tableAssignmentId, uid, safeStorage);

	if (stored) return stored;

	return me ? { ranked: me.preferences, position: answerFromRecord(me) } : null;
}

/** `/sessions/:id/position`: the last step, only when the host asked and topics were picked. */
export const ParticipantPosition: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			barLabel: ({ session }: ParticipantContext) =>
				stepLabel(stepNumber(session, 'position'), stepsOf(session).length),
			render: (context: ParticipantContext) => {
				const home = participantHomePath(attrs.id);
				const { me, session } = context;

				const access = preferencesAccess(session.status, context.seated);

				if (me && access === 'checking') return m(StateBox, { kind: 'loading' });
				if (!me || access !== 'allowed' || !session.settings.positionQuestion) {
					return m(Redirect, { to: home });
				}

				const draft = draftForPosition(context);

				if (!draft || draft.ranked.length === 0) {
					return m(Redirect, { to: participantScreenPath(attrs.id, 'preferences') });
				}

				return m(PositionBody, { context, draft });
			},
		});
	},
};
