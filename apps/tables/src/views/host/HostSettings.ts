import m from 'mithril';
import {
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { draftFromSettings, draftToRequest, settingsErrors } from '@/logic/settings';
import type { SettingsDraft, SettingsField } from '@/logic/settings';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { SideSlider } from '@/components/SideSlider';

const TOLERANCE_STEP = 0.05;

interface SettingsBodyAttrs {
	context: HostContext;
}

function textField(
	labelKey: string,
	value: string,
	onInput: (value: string) => void,
	invalid: boolean,
	attrs: Record<string, unknown> = {},
): m.Vnode {
	return m('label.field', [
		m('span.field__label', t(labelKey)),
		m('input.field__input', {
			type: 'text',
			value,
			'aria-invalid': invalid ? 'true' : 'false',
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
			...attrs,
		}),
		invalid
			? m('small.field__error', { role: 'alert' }, t('tableAssignment.settings.invalid'))
			: null,
	]);
}

const SettingsBody: m.ClosureComponent<SettingsBodyAttrs> = () => {
	const save = new Action('tables.host.saveSettings', 'tableAssignment.error.generic');
	let draft: SettingsDraft | null = null;
	let dirty = false;
	let showErrors = false;

	function change(patch: Partial<SettingsDraft>): void {
		if (!draft) return;
		draft = { ...draft, ...patch };
		dirty = true;
		save.clear();
	}

	async function submit(sessionId: string): Promise<void> {
		if (!draft) return;
		showErrors = true;
		if (settingsErrors(draft).length > 0) return;

		const result = await save.run(
			() => tablesApi.saveSettings(draftToRequest(sessionId, draft as SettingsDraft)),
			{
				sessionId,
			},
		);

		if (result) {
			dirty = false;
			showErrors = false;
			draft = null;
		}
	}

	return {
		view({ attrs }) {
			const { session } = attrs.context;

			if (draft === null || !dirty) draft = draftFromSettings(session.settings);

			const current = draft;
			const errors: SettingsField[] = showErrors ? settingsErrors(current) : [];
			const bad = (field: SettingsField): boolean => errors.includes(field);

			return m(
				'form.stack',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						void submit(session.tableAssignmentId);
					},
				},
				[
					m('section.card', [
						m('h2.card__title', t('tableAssignment.settings.mode')),
						m('p.card__value', t(`tableAssignment.mode.${session.mode}`)),
						m('p.card__hint', t(`tableAssignment.mode.${session.mode}.hint`)),
						m('p.card__hint', t('tableAssignment.settings.modeFixed')),
					]),
					m('section.card', [
						m('h2.card__title', t('tableAssignment.settings.tables')),
						m('label.field', [
							m('span.field__label', t('tableAssignment.field.tableSize')),
							m('input.field__input', {
								type: 'number',
								inputmode: 'numeric',
								min: TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
								max: TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
								value: current.tableSize,
								'aria-invalid': bad('tableSize') ? 'true' : 'false',
								oninput: (event: Event) =>
									change({ tableSize: (event.target as HTMLInputElement).value }),
							}),
							bad('tableSize')
								? m(
										'small.field__error',
										{ role: 'alert' },
										t('tableAssignment.settings.tableSizeInvalid', {
											min: TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
											max: TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
										}),
									)
								: null,
						]),
						session.mode === 'ranked'
							? m('label.field', [
									m('span.field__label', t('tableAssignment.field.balanceTolerance')),
									m('input.field__input', {
										type: 'number',
										inputmode: 'decimal',
										min: 0,
										step: TOLERANCE_STEP,
										value: current.balanceTolerance,
										'aria-describedby': 'tolerance-help',
										'aria-invalid': bad('balanceTolerance') ? 'true' : 'false',
										oninput: (event: Event) =>
											change({ balanceTolerance: (event.target as HTMLInputElement).value }),
									}),
									m(
										'small.field__hint',
										{ id: 'tolerance-help' },
										t('tableAssignment.settings.toleranceHelp'),
									),
									bad('balanceTolerance')
										? m(
												'small.field__error',
												{ role: 'alert' },
												t('tableAssignment.settings.invalid'),
											)
										: null,
								])
							: m('p.card__hint', t('tableAssignment.settings.directNoBalance')),
					]),
					m('section.card', [
						m('h2.card__title', t('tableAssignment.settings.positionTitle')),
						m('label.switch', [
							m('input', {
								type: 'checkbox',
								checked: current.positionEnabled,
								onchange: (event: Event) =>
									change({ positionEnabled: (event.target as HTMLInputElement).checked }),
							}),
							m('span', t('tableAssignment.settings.positionOn')),
						]),
						m('p.card__hint', t('tableAssignment.settings.positionHelp')),
						current.positionEnabled
							? [
									textField(
										'tableAssignment.field.positionLabel',
										current.positionLabel,
										(value) => change({ positionLabel: value }),
										bad('positionLabel'),
										{ maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH },
									),
									textField(
										'tableAssignment.field.poleA',
										current.poleA,
										(value) => change({ poleA: value }),
										bad('poleA'),
										{ maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH },
									),
									textField(
										'tableAssignment.field.poleB',
										current.poleB,
										(value) => change({ poleB: value }),
										bad('poleB'),
										{ maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH },
									),
									current.poleA.trim() && current.poleB.trim()
										? m('.settings__preview', [
												m('p.card__hint', t('tableAssignment.settings.preview')),
												m(SideSlider, {
													value: null,
													labelA: current.poleA.trim(),
													labelB: current.poleB.trim(),
													onInput: () => undefined,
												}),
											])
										: null,
								]
							: null,
					]),
					m('section.card.card--sticky', [
						save.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(save.errorKey)) : null,
						save.succeeded && !dirty
							? m('p.notice.notice--ok', { role: 'status' }, t('tableAssignment.saved'))
							: null,
						m(
							'button.btn.btn--primary',
							{ type: 'submit', disabled: save.busy || !dirty },
							t(save.busy ? 'tableAssignment.saving' : 'tableAssignment.settings.save'),
						),
					]),
				],
			);
		},
	};
};

/** `/host/sessions/:id/settings`: Settings. */
export const HostSettings: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.settings',
			render: (context: HostContext) => m(SettingsBody, { context }),
		});
	},
};
