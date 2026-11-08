import m from 'mithril';
import { t } from '../../lib/i18n';
import { Icon } from '../../components/Icon';
import { Collapsible } from '../../components/Collapsible';
import { AGORA_STAGE_PLAN } from '@freedi/shared-types';

export interface QuestionDraft {
	question: string;
	title: string;
	explanation: string;
}

export interface QuestionSheetAttrs {
	draft: QuestionDraft;
	/** What the lesson will be called if the name is left empty */
	derivedTitle: string;
	onChange: (next: QuestionDraft) => void;
	/** Pressed with a question written. An empty question never gets here. */
	onContinue: () => void;
	/** Back, ✕, Escape, the scrim: close and keep whatever was typed */
	onClose: () => void;
}

const PHONE_QUERY = '(max-width: 600px)';
/** Matches --motion-base, which the way in uses */
const EXIT_MS = 300;
/** The counter appears only once the question is nearly at its limit */
const COUNT_FROM = 20;
const SHEET_ID = 'question-sheet';

/**
 * The teacher's own question, on its own surface: a full-screen sheet on a
 * phone, a centred dialog on a laptop. One required field, two optional
 * ones behind a fold, and one button.
 *
 * It used to be a form wedged between the scenario list and the class
 * chips, on a page that also held the stage plan. The question is the one
 * thing this path requires, so it gets a screen where it is the only thing.
 *
 * Props in, vnodes out. The draft lives in the caller: closing keeps it,
 * and nothing reaches the server until the lesson opens.
 */
export function QuestionSheet(): m.Component<QuestionSheetAttrs> {
	let closeNow: (() => void) | null = null;
	let continueNow: (() => void) | null = null;
	/** Continue was pressed with nothing written — say so under the box */
	let showRequired = false;
	let moreOpen = false;
	let textarea: HTMLTextAreaElement | null = null;

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeNow?.();

			return;
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			continueNow?.();
		}
	}

	/** Tab wraps inside the dialog: the page behind it is not for now */
	function trapTab(event: KeyboardEvent, root: HTMLElement): void {
		if (event.key !== 'Tab') return;
		const focusable = Array.from(
			root.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	return {
		oncreate({ dom, attrs }) {
			closeNow = attrs.onClose;
			document.addEventListener('keydown', onKey);
			document.body.classList.add('is-panel-open');
			// Editing a draft that already has a name or an explanation must not hide them
			moreOpen = attrs.draft.title.trim().length > 0 || attrs.draft.explanation.trim().length > 0;
			const root = dom as HTMLElement;
			root.addEventListener('keydown', (event) => trapTab(event, root));
			textarea = root.querySelector<HTMLTextAreaElement>('.question-sheet__question');
			textarea?.focus();
			if (moreOpen) m.redraw();
		},
		onupdate({ attrs }) {
			closeNow = attrs.onClose;
		},
		onbeforeremove({ dom }) {
			// Leave the way it came: the CSS keyframes only play on the way in
			const sheet = dom.querySelector('.question-sheet__dialog') as HTMLElement | null;
			if (!sheet || typeof sheet.animate !== 'function') return;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const phone = window.matchMedia(PHONE_QUERY).matches;
			const exit = sheet.animate(
				[
					{ transform: 'none', opacity: 1 },
					{ transform: phone ? 'translateY(24px)' : 'scale(0.98)', opacity: 0 },
				],
				{ duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
			);

			return exit.finished.then(
				() => undefined,
				() => undefined,
			);
		},
		onremove() {
			document.removeEventListener('keydown', onKey);
			document.body.classList.remove('is-panel-open');
			closeNow = null;
			continueNow = null;
		},

		view({ attrs }) {
			const { draft, derivedTitle, onChange, onContinue, onClose } = attrs;
			const patch = (next: Partial<QuestionDraft>): void => onChange({ ...draft, ...next });
			const left = AGORA_STAGE_PLAN.MAX_TITLE_LENGTH - draft.question.length;
			const empty = draft.question.trim().length === 0;
			const invalid = showRequired && empty;

			// Never disabled: a dead primary on a one-field sheet tells a
			// keyboard or screen-reader user nothing. Pressing it empty says why.
			continueNow = (): void => {
				if (empty) {
					showRequired = true;
					textarea?.focus();
					m.redraw();

					return;
				}
				showRequired = false;
				onContinue();
			};

			const describedBy = [
				`${SHEET_ID}-hint`,
				invalid ? `${SHEET_ID}-error` : '',
				left <= COUNT_FROM ? `${SHEET_ID}-count` : '',
			]
				.filter(Boolean)
				.join(' ');

			return m('.question-sheet', [
				m('.question-sheet__scrim', { onclick: onClose }),
				m(
					'.question-sheet__dialog',
					{
						id: SHEET_ID,
						role: 'dialog',
						'aria-modal': 'true',
						'aria-labelledby': `${SHEET_ID}-title`,
						'aria-describedby': `${SHEET_ID}-hint`,
					},
					[
						m('header.question-sheet__head', [
							m(
								'button.question-sheet__back',
								{ type: 'button', 'aria-label': t('common.back'), onclick: onClose },
								m(Icon, { name: 'arrow', size: 20 }),
							),
							m(
								'h2.question-sheet__title',
								{ id: `${SHEET_ID}-title` },
								t('startGame.question_title'),
							),
							m(
								'button.question-sheet__close',
								{ type: 'button', 'aria-label': t('common.close'), onclick: onClose },
								'✕',
							),
						]),

						m('.question-sheet__body', [
							m('p.question-sheet__hint', { id: `${SHEET_ID}-hint` }, t('startGame.question_hint')),

							m('label.start-game__field', [
								m('span.start-game__field-label', [
									t('startGame.quick_question'),
									m('span.question-sheet__required', { 'aria-hidden': 'true' }, ' *'),
								]),
								m('textarea.text-input.question-sheet__question', {
									value: draft.question,
									rows: 3,
									maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
									placeholder: t('startGame.quick_question_ph'),
									'aria-required': 'true',
									'aria-invalid': invalid ? 'true' : undefined,
									'aria-describedby': describedBy,
									oninput: (event: InputEvent) => {
										patch({ question: (event.target as HTMLTextAreaElement).value });
										if (showRequired) showRequired = false;
									},
								}),
							]),
							m(
								'p.question-sheet__error',
								{ id: `${SHEET_ID}-error`, 'aria-live': 'polite' },
								invalid ? t('startGame.question_required') : '',
							),
							left <= COUNT_FROM
								? m(
										'p.question-sheet__count',
										{ id: `${SHEET_ID}-count` },
										t('startGame.chars_left', { n: String(left) }),
									)
								: null,

							m(
								'button.btn.btn--ghost.btn--sm.start-game__more',
								{
									type: 'button',
									'aria-expanded': String(moreOpen),
									'aria-controls': `${SHEET_ID}-more`,
									onclick: () => {
										moreOpen = !moreOpen;
									},
								},
								t('startGame.more'),
							),
							moreOpen
								? m(
										Collapsible,
										m(`#${SHEET_ID}-more.stack`, [
											m('label.start-game__field', [
												m('span.start-game__field-label', t('startGame.quick_title')),
												m('input.text-input[type=text]', {
													value: draft.title,
													maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
													placeholder: derivedTitle || t('startGame.quick_title_ph'),
													oninput: (event: InputEvent) =>
														patch({ title: (event.target as HTMLInputElement).value }),
												}),
												m('span.question-sheet__field-hint', t('startGame.quick_title_hint')),
											]),
											m('label.start-game__field', [
												m('span.start-game__field-label', t('startGame.quick_explanation')),
												m('textarea.text-input', {
													value: draft.explanation,
													rows: 3,
													maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
													placeholder: t('startGame.quick_explanation_ph'),
													oninput: (event: InputEvent) =>
														patch({ explanation: (event.target as HTMLTextAreaElement).value }),
												}),
											]),
										]),
									)
								: null,
						]),

						m('footer.question-sheet__foot', [
							m(
								'button.btn.btn--secondary.question-sheet__cancel',
								{ type: 'button', onclick: onClose },
								t('common.cancel'),
							),
							m(
								'button.btn.btn--primary.btn--lg.question-sheet__continue',
								{ type: 'button', onclick: () => continueNow?.() },
								t('startGame.question_continue'),
							),
						]),
					],
				),
			]);
		},
	};
}
