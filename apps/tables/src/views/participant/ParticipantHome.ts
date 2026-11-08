import m from 'mithril';
import { TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { participantStage } from '@/logic/participantStage';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { participantScreenPath } from '@/paths';

interface HomeBodyAttrs {
	context: ParticipantContext;
}

const HomeBody: m.ClosureComponent<HomeBodyAttrs> = () => {
	const register = new Action(
		'tables.participant.register',
		'tableAssignment.error.registrationClosed',
	);
	let fullName = '';

	async function submit(sessionId: string): Promise<void> {
		const name = fullName.trim();

		if (name === '') return;
		await register.run(() => tablesApi.register({ sessionId, fullName: name }), { sessionId });
	}

	function registerForm(sessionId: string): m.Vnode {
		return m(
			'form.card.form',
			{
				onsubmit: (event: Event) => {
					event.preventDefault();
					void submit(sessionId);
				},
			},
			[
				m('h2.card__title', t('tableAssignment.home.registerTitle')),
				m('label.field', [
					m('span.field__label', t('tableAssignment.field.fullName')),
					m('input.field__input', {
						type: 'text',
						name: 'name',
						autocomplete: 'name',
						required: true,
						maxlength: TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
						value: fullName,
						'aria-describedby': 'full-name-hint',
						oninput: (event: Event) => {
							fullName = (event.target as HTMLInputElement).value;
						},
					}),
					m(
						'small.field__hint',
						{ id: 'full-name-hint' },
						t('tableAssignment.field.fullName.hint'),
					),
				]),
				register.errorKey
					? m('p.notice.notice--error', { role: 'alert' }, t(register.errorKey))
					: null,
				m(
					'button.btn.btn--primary',
					{ type: 'submit', disabled: register.busy || fullName.trim() === '' },
					t(register.busy ? 'tableAssignment.saving' : 'tableAssignment.home.register'),
				),
			],
		);
	}

	return {
		view({ attrs }) {
			const { session, me, topics } = attrs.context;
			const id = session.tableAssignmentId;
			const stage = participantStage({
				status: session.status,
				mode: session.mode,
				registered: me !== null,
				hasChosenTable: me?.chosenTableIndex !== undefined,
			});
			const savedPrefs = !!me && me.preferences.length > 0;

			return [
				me
					? m('p.card__hint', t('tableAssignment.home.registeredAs', { name: me.fullName }))
					: null,
				stage === 'notOpen'
					? m('p.notice', { role: 'status' }, t('tableAssignment.stage.notOpen'))
					: null,
				stage === 'closedNotRegistered'
					? m('p.notice', { role: 'status' }, t('tableAssignment.stage.closedNotRegistered'))
					: null,
				stage === 'ended'
					? m('p.notice', { role: 'status' }, t('tableAssignment.stage.ended'))
					: null,
				stage === 'register' ? registerForm(id) : null,
				stage === 'act'
					? m('section.card', [
							m('h2.card__title', t(`tableAssignment.stage.act.${session.mode}`)),
							m('p.card__hint', t(`tableAssignment.stage.act.${session.mode}.hint`)),
							session.mode === 'ranked'
								? m(
										'p.badge',
										t(
											savedPrefs
												? 'tableAssignment.stage.prefsSaved'
												: 'tableAssignment.stage.prefsMissing',
										),
									)
								: null,
							m(
								m.route.Link,
								{ href: participantScreenPath(id, 'preferences'), class: 'btn btn--primary' },
								t(`tableAssignment.stage.act.${session.mode}.button`),
							),
						])
					: null,
				stage === 'waiting'
					? m('section.card', [
							m('h2.card__title', t('tableAssignment.stage.waiting')),
							m('p.card__hint', t('tableAssignment.stage.waiting.hint')),
						])
					: null,
				stage === 'myTable'
					? m('section.card', [
							m('h2.card__title', t('tableAssignment.myTable')),
							m(
								m.route.Link,
								{ href: participantScreenPath(id, 'my-table'), class: 'btn btn--primary' },
								t('tableAssignment.stage.seeMyTable'),
							),
						])
					: null,
				topics.length > 0 && stage !== 'notOpen'
					? m(
							m.route.Link,
							{ href: participantScreenPath(id, 'topics'), class: 'btn btn--ghost' },
							t('tableAssignment.stage.readTopics'),
						)
					: null,
			];
		},
	};
};

/** `/sessions/:id`: Participant home. */
export const ParticipantHome: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.participantHome',
			isHome: true,
			render: (context: ParticipantContext) => m(HomeBody, { context }),
		});
	},
};
