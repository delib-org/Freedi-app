import m from 'mithril';
import { t } from '../../../lib/i18n';
import { checkStationLink } from '../../../lib/callables';
import { linkCheckIdle, linkErrorKey, type LinkCheckState } from '../../../lib/flows/linkedStation';
import {
	AGORA_STAGE_PLAN,
	AGORA_STATION_LINK,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

type ItemPatch = Partial<Omit<AgoraStagePlanItem, 'itemId' | 'stage'>>;

export interface LinkedStepEditorAttrs {
	item: AgoraStagePlanItem;
	index: number;
	onPatch: (patch: ItemPatch) => void;
	focusLink: boolean;
	onFocused: () => void;
	onDone: () => void;
}

/**
 * The editor of a "Task in another app" step: the link to the question,
 * the title students see (prefilled with the question's words) and what to
 * do there. The link is checked as the teacher leaves the field — the server
 * says "Linked to: <question>" or exactly what is wrong — and checked again
 * when the plan is saved.
 */
export function LinkedStepEditor(): m.Component<LinkedStepEditorAttrs> {
	let url = '';
	let checked = '';
	let status: LinkCheckState | null = null;

	async function check(attrs: LinkedStepEditorAttrs): Promise<void> {
		const text = url.trim();
		if (!text || text === checked) return;
		checked = text;
		status = { kind: 'checking' };
		m.redraw();
		try {
			const result = await checkStationLink({ url: text });
			if (checked !== text) return;
			status = { kind: 'linked', title: result.title };
			const typed = (attrs.item.title ?? '').trim();
			const previous = attrs.item.link?.title ?? '';
			attrs.onPatch({
				link: {
					app: result.app,
					statementId: result.statementId,
					title: result.title,
					linkedAt: Date.now(),
				},
				// The title follows the question until the teacher types their own
				...(!typed || typed === previous ? { title: result.title } : {}),
			});
		} catch (error) {
			if (checked !== text) return;
			status = { kind: 'error', key: linkErrorKey(error) };
			console.info('[LinkedStepEditor] link refused', error);
		}
		m.redraw();
	}

	return {
		view({ attrs }) {
			const { item, index, onPatch, focusLink, onFocused, onDone } = attrs;
			const id = `step-editor-${index}`;
			const state = status ?? linkCheckIdle(item);
			const describedBy = `${id}-link-help ${id}-link-status`;

			return m('.step-editor.step-editor--linked', [
				m('.step-editor__group', [
					m('label.step-editor__label', { for: `${id}-link` }, t('linked.link_label')),
					m('input.step-editor__input[type=url]', {
						id: `${id}-link`,
						value: url,
						inputmode: 'url',
						autocomplete: 'off',
						maxlength: AGORA_STATION_LINK.MAX_URL_CHARS,
						placeholder: 'https://app.wizcol.com/statement/…',
						'aria-describedby': describedBy,
						'aria-invalid': state.kind === 'error' || !item.link ? 'true' : undefined,
						oncreate: (node: m.VnodeDOM) => {
							if (!focusLink) return;
							onFocused();
							(node.dom as HTMLInputElement).focus();
						},
						oninput: (event: InputEvent) => {
							url = (event.target as HTMLInputElement).value;
						},
						onblur: () => void check(attrs),
						onkeydown: (event: KeyboardEvent) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							void check(attrs);
						},
					}),
					m('p.step-editor__hint', { id: `${id}-link-help` }, t('linked.link_help')),
					m(
						'p.step-editor__link-status',
						{
							id: `${id}-link-status`,
							role: 'status',
							class: `step-editor__link-status--${state.kind}`,
						},
						state.kind === 'checking'
							? t('linked.checking')
							: state.kind === 'linked'
								? t('linked.linked_to', { title: state.title })
								: state.kind === 'error'
									? t(state.key)
									: t('linked.needs_link'),
					),
				]),
				m('.step-editor__group', [
					m('label.step-editor__label', { for: `${id}-title` }, t('linked.title_label')),
					m('textarea.step-editor__input', {
						id: `${id}-title`,
						value: item.title ?? '',
						rows: 2,
						maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
						oninput: (event: InputEvent) =>
							onPatch({ title: (event.target as HTMLTextAreaElement).value }),
					}),
				]),
				m('.step-editor__group', [
					m('label.step-editor__label', { for: `${id}-explanation` }, t('linked.todo_label')),
					m('textarea.step-editor__input', {
						id: `${id}-explanation`,
						value: item.explanation ?? '',
						rows: 2,
						maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
						placeholder: t('linked.todo_ph'),
						oninput: (event: InputEvent) =>
							onPatch({ explanation: (event.target as HTMLTextAreaElement).value }),
					}),
				]),
				m(
					'.step-editor__footer',
					m(
						'button.btn.btn--sm.btn--secondary.step-editor__done',
						{ type: 'button', onclick: onDone },
						t('planb.done'),
					),
				),
			]);
		},
	};
}
