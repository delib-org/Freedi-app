import m from 'mithril';
import { t } from '@/lib/i18n';
import { createSuggestion, getQuestion } from '@/lib/store';
import { getRtdb } from '@/lib/firebase';
import {
	startBroadcast,
	updateBroadcastText,
	stopBroadcast,
	isBroadcasting,
} from '@/lib/liveDrafts';

interface AddSuggestionModalAttrs {
	onClose: () => void;
	/** When true, the submission goes through the organizer Cloud Function and
	 *  carries the organizer badge. When false, it joins the crowd list as a
	 *  regular participant suggestion — which admins can opt into when the
	 *  question allows participant additions. */
	asOrganizer: boolean;
}

let text = '';
let submitting = false;
let shareLive = false;

// Live broadcast covers NEW suggestions only — EditSuggestionModal is
// intentionally out of scope (edits are quick fixes, not table work).
export const AddSuggestionModal: m.Component<AddSuggestionModalAttrs> = {
	oninit() {
		text = '';
		submitting = false;
		shareLive = false;
	},

	onremove() {
		// Single hook covering every exit path: cancel, overlay click,
		// submit-close, and route change unmounting the parent view.
		if (isBroadcasting()) void stopBroadcast();
	},

	view(vnode) {
		const { onClose, asOrganizer } = vnode.attrs;
		const canSubmit = !submitting && text.trim().length > 0;
		const liveAvailable =
			getQuestion()?.statementSettings?.enableLiveDraftBroadcast === true && getRtdb() !== null;
		// Copy follows the chosen mode, not the user's role: an admin posting
		// as a participant gets the neutral crowd-list framing.
		const titleKey = asOrganizer ? 'admin.add_suggestion' : 'solutions.add_suggestion';
		const placeholderKey = asOrganizer
			? 'admin.suggestion_placeholder'
			: 'solutions.add_suggestion_placeholder';
		const submitKey = asOrganizer ? 'admin.submit' : 'solutions.add_suggestion_submit';

		return m(
			'.modal__overlay',
			{
				onclick: (e: Event) => {
					if (e.target === e.currentTarget) onClose();
				},
			},
			[
				m('.modal__body', [
					m('h2.modal__title', t(titleKey)),

					m('.modal__field', [
						m('label.modal__label', { for: 'organizer-suggestion-text' }, t(placeholderKey)),
						m('textarea.modal__input', {
							id: 'organizer-suggestion-text',
							rows: 4,
							value: text,
							oninput: (e: InputEvent) => {
								text = (e.target as HTMLTextAreaElement).value;
								if (isBroadcasting()) updateBroadcastText(text);
							},
						}),
						m('.modal__hint', t('solutions.format_hint')),
					]),

					liveAvailable
						? m('label.modal__live-toggle', [
								m('input[type=checkbox]', {
									checked: shareLive,
									onchange: (e: Event) => {
										shareLive = (e.target as HTMLInputElement).checked;
										if (shareLive) void startBroadcast(text);
										else void stopBroadcast();
									},
								}),
								m('span.modal__live-toggle-dot', { 'aria-hidden': 'true' }),
								m('.modal__live-toggle-copy', [
									m('span.modal__live-toggle-label', t('live.share_toggle')),
									m('span.modal__live-toggle-hint', t('live.share_hint')),
								]),
							])
						: null,

					m('.modal__actions', [
						m('button.btn.btn--secondary.btn--small', { onclick: onClose }, t('form.cancel')),
						m(
							'button.btn.btn--primary.btn--small',
							{
								disabled: !canSubmit,
								onclick: () => handleSubmit(onClose, asOrganizer),
							},
							submitting ? t('form.submitting') : t(submitKey),
						),
					]),
				]),
			],
		);
	},
};

async function handleSubmit(onClose: () => void, asOrganizer: boolean): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed || submitting) return;

	submitting = true;
	m.redraw();

	try {
		await createSuggestion(trimmed, asOrganizer);
		// End the live session before closing so watchers see the draft
		// vanish the moment the real suggestion card appears.
		if (isBroadcasting()) await stopBroadcast();
		onClose();
	} catch (err) {
		console.error('[AddSuggestionModal] Submission failed:', err);
	} finally {
		submitting = false;
		m.redraw();
	}
}
