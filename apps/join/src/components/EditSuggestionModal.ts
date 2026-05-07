import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getOptionParagraphs, loadOptionParagraphs, updateSuggestion } from '@/lib/store';

interface EditSuggestionModalAttrs {
	option: Statement;
	onClose: () => void;
}

let text = '';
let submitting = false;
let lastOptionId: string | null = null;

/** Build the textarea seed from the option's title plus any paragraph
 *  children. Inline-shape options (no children) fall through to the multi-line
 *  `statement` field; canonical-shape options stitch the title and each
 *  paragraph into one newline-joined block. */
function seedTextFromOption(option: Statement): string {
	const paras = getOptionParagraphs(option.statementId);
	if (paras && paras.length > 0) {
		const title = option.statement ?? '';
		const body = paras
			.map((p) => p.statement ?? '')
			.filter((s) => s.length > 0);

		return [title, ...body].join('\n');
	}

	return option.statement ?? '';
}

/** Kick off a paragraph-children fetch and re-seed the textarea once it
 *  resolves — only if the modal is still on the same option and the user
 *  hasn't started typing. The id capture guards against a late callback
 *  overwriting a newer edit session opened on a different card. */
function loadAndReseed(option: Statement): void {
	const capturedId = option.statementId;
	const initialText = text;
	void loadOptionParagraphs(capturedId).then(() => {
		if (lastOptionId !== capturedId) return;
		if (text !== initialText) return;
		text = seedTextFromOption(option);
		m.redraw();
	});
}

export const EditSuggestionModal: m.Component<EditSuggestionModalAttrs> = {
	oninit(vnode) {
		// Seed immediately from whatever's already cached so the modal paints
		// without waiting on a fetch. Tracking the option id lets us reset
		// cleanly when reopening on a different card.
		lastOptionId = vnode.attrs.option.statementId;
		text = seedTextFromOption(vnode.attrs.option);
		submitting = false;
		loadAndReseed(vnode.attrs.option);
	},

	onupdate(vnode) {
		if (vnode.attrs.option.statementId !== lastOptionId) {
			lastOptionId = vnode.attrs.option.statementId;
			text = seedTextFromOption(vnode.attrs.option);
			submitting = false;
			loadAndReseed(vnode.attrs.option);
		}
	},

	view(vnode) {
		const { option, onClose } = vnode.attrs;
		const trimmed = text.trim();
		// Compare against the same seed used to populate the textarea so a
		// canonical option (title + paragraph children stitched together)
		// doesn't read as "changed" the moment the modal opens.
		const unchanged = trimmed === seedTextFromOption(option).trim();
		const canSubmit = !submitting && trimmed.length > 0 && !unchanged;

		return m(
			'.modal__overlay',
			{
				onclick: (e: Event) => {
					if (e.target === e.currentTarget) onClose();
				},
			},
			[
				m('.modal__body', [
					m('h2.modal__title', t('solutions.edit_suggestion')),

					m('.modal__field', [
						m(
							'label.modal__label',
							{ for: 'edit-suggestion-text' },
							t('solutions.edit_suggestion_placeholder'),
						),
						m('textarea.modal__input', {
							id: 'edit-suggestion-text',
							rows: 4,
							value: text,
							oninput: (e: InputEvent) => {
								text = (e.target as HTMLTextAreaElement).value;
							},
						}),
						m('.modal__hint', t('solutions.format_hint')),
					]),

					m('.modal__actions', [
						m('button.btn.btn--secondary.btn--small', { onclick: onClose }, t('form.cancel')),
						m(
							'button.btn.btn--primary.btn--small',
							{
								disabled: !canSubmit,
								onclick: () => handleSubmit(option.statementId, onClose),
							},
							submitting ? t('form.submitting') : t('solutions.edit_suggestion_submit'),
						),
					]),
				]),
			],
		);
	},
};

async function handleSubmit(optionId: string, onClose: () => void): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed || submitting) return;

	submitting = true;
	m.redraw();

	try {
		await updateSuggestion(optionId, trimmed);
		onClose();
	} catch (err) {
		console.error('[EditSuggestionModal] Update failed:', err);
	} finally {
		submitting = false;
		m.redraw();
	}
}
