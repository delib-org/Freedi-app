import m from 'mithril';
import { TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH } from '@freedi/shared-types';
import type { TablesNameMatch } from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { safeStorage } from '@/lib/safeStorage';
import { tablesApi } from '@/lib/tableAssignment/client';
import { canEditPreferences } from '@/logic/nextAction';
import { clearDraft } from '@/logic/localDraft';
import { nextStep, stepNumber, stepsOf } from '@/logic/steps';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { Redirect } from '@/components/Redirect';
import { stepLabel, StepHeader } from '@/components/StepHeader';
import { ReturnByNameDialog } from '@/views/participant/ReturnByNameDialog';
import { participantHomePath, participantScreenPath } from '@/paths';

const NAME_FIELD_ID = 'full-name';
const NAME_HINT_ID = 'full-name-hint';

export interface NameFormAttrs {
	context: ParticipantContext;
	/** The name to start from: the person's own when editing, the last one after cancelling. */
	initialName: string;
	/** True from the moment the name is sent, false again if it was not saved. */
	onPending?: (pending: boolean) => void;
	/** Called after the server saved it. */
	onRegistered?: () => void;
}

function field(value: string, onInput: (value: string) => void): m.Vnode {
	return m('.field', [
		m(
			'label.field__label.field__label--small',
			{ for: NAME_FIELD_ID },
			t('tableAssignment.home.fullName'),
		),
		m('input.field__input.field__input--large', {
			id: NAME_FIELD_ID,
			type: 'text',
			name: 'name',
			autocomplete: 'name',
			dir: 'auto',
			required: true,
			maxlength: TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
			value,
			'aria-describedby': NAME_HINT_ID,
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
		}),
		m('span.field__hint', { id: NAME_HINT_ID }, t('tableAssignment.home.fullName.hint')),
	]);
}

/** Step 1, first time and when editing: the server decides whether the name needs a question. */
export const NameForm: m.ClosureComponent<NameFormAttrs> = (initial) => {
	const register = new Action(
		'tables.participant.register',
		'tableAssignment.error.registrationClosed',
	);
	let fullName = initial.attrs.initialName;
	let askAboutName: string | null = null;

	async function submit(attrs: NameFormAttrs, nameMatch: TablesNameMatch): Promise<void> {
		const { session, uid } = attrs.context;
		const sessionId = session.tableAssignmentId;
		const name = fullName.trim();

		if (name === '') return;
		attrs.onPending?.(true);
		// Whoever continues a registration by name starts empty: nothing old is ever shown.
		// Cleared before the request, so the new record arriving can never meet the old draft.
		if (nameMatch === 'claim') clearDraft(sessionId, uid, safeStorage);

		const result = await register.run(
			() => tablesApi.register({ sessionId, fullName: name, nameMatch }),
			{ sessionId },
		);

		if (!result || result.outcome === 'nameExists') {
			attrs.onPending?.(false);
			if (result) askAboutName = name;

			return;
		}
		askAboutName = null;
		attrs.onRegistered?.();
	}

	return {
		view({ attrs, children }) {
			const { context } = attrs;
			const editing = context.me !== null;

			return m(
				'form.screen.screen--airy',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						void submit(attrs, 'ask');
					},
				},
				[
					m('.screen__center', [
						children,
						field(fullName, (value) => {
							fullName = value;
						}),
						register.errorKey && !askAboutName
							? m('p.notice.notice--error', { role: 'alert' }, t(register.errorKey))
							: null,
					]),
					m('.screen__foot', [
						m(
							'button.btn.btn--primary.btn--cta',
							{ type: 'submit', disabled: register.busy || fullName.trim() === '' },
							t(
								register.busy
									? 'tableAssignment.saving'
									: editing
										? 'tableAssignment.continue'
										: 'tableAssignment.home.start',
							),
						),
						editing
							? null
							: m(
									'span.screen__foot-hint',
									t(`tableAssignment.home.stepsHint.${stepsOf(context.session).length}`),
								),
					]),
					askAboutName
						? m(ReturnByNameDialog, {
								name: askAboutName,
								busy: register.busy,
								errorKey: register.errorKey,
								onAnswer: (nameMatch: TablesNameMatch) => void submit(attrs, nameMatch),
								onClose: () => {
									askAboutName = null;
									register.clear();
								},
							})
						: null,
				],
			);
		},
	};
};

/** The body of step 1 on the assignment link: count, gathering name, why tables, the form. */
export function joinIntro(context: ParticipantContext): m.Children {
	const { session, registeredCount } = context;

	return [
		registeredCount
			? m('span.pill.pill--success', tPlural('tableAssignment.home.count', registeredCount))
			: null,
		m('h1.screen__title.screen__title--hero', { dir: 'auto' }, session.title),
		m('p.screen__text', t(`tableAssignment.home.intro.${session.mode}`)),
	];
}

function afterName(context: ParticipantContext): string {
	const id = context.session.tableAssignmentId;
	const next = nextStep(context.session, 'name');

	return next ? participantScreenPath(id, next) : participantHomePath(id);
}

/** `/sessions/:id/name`: step 1 again, when editing. */
export const ParticipantName: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			barLabel: ({ session }: ParticipantContext) =>
				stepLabel(stepNumber(session, 'name'), stepsOf(session).length),
			render: (context: ParticipantContext) => {
				if (!context.me || !canEditPreferences(context.session.status)) {
					return m(Redirect, { to: participantHomePath(attrs.id) });
				}

				return m(
					NameForm,
					{
						context,
						initialName: context.me.fullName,
						onRegistered: () => goTo(afterName(context)),
					},
					m(StepHeader, {
						title: t('tableAssignment.editDetails'),
						titleClass: 'screen__title--hero',
						backHref: participantHomePath(attrs.id),
					}),
				);
			},
		});
	},
};
