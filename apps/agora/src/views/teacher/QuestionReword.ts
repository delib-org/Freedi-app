import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { rewordQuestion } from '../../lib/callables';
import { AGORA_STAGE_PLAN, questionKindOf } from '@freedi/shared-types';
import type { AgoraQuestionKind } from '@freedi/shared-types';

export interface QuestionRewordAttrs {
	sessionId: string;
	itemId: string;
	kind?: AgoraQuestionKind;
	/** The words as the room reads them NOW — the item's own, or the kind's prompt */
	title: string;
	explanation: string;
}

/**
 * The teacher rewrites the question the class is looking at.
 *
 * The one edit an opened stage allows: a class that does not understand
 * "what matters to you here?" cannot be helped by a plan change next lesson.
 * The box opens on the words the room is reading right now — the item's own
 * or, for a round that never had a title, the book's prompt — so the teacher
 * edits real sentences rather than filling a blank.
 *
 * A round is asked one more thing before it saves: these rounds come round
 * every lesson, so wording that finally landed should not have to be typed
 * again. `kind` scope files it as this teacher's own wording for that round
 * (and fixes the other rounds of the same kind in THIS plan on the way past).
 * An open question is a one-off and skips the question entirely.
 */
export function QuestionReword(): m.Component<QuestionRewordAttrs> {
	/** null = the pencil, not the form */
	let draft: { title: string; explanation: string } | null = null;
	/** The form is filled and the teacher pressed save — now: for which games? */
	let askingScope = false;
	let saving = false;
	let failed = false;
	/** What the last save did, so the teacher sees it took */
	let saved: 'session' | 'kind' | null = null;
	/** Which item the state above belongs to — the stage advances under this component */
	let stateItemId = '';

	function close(): void {
		draft = null;
		askingScope = false;
		failed = false;
	}

	function open(attrs: QuestionRewordAttrs): void {
		draft = { title: attrs.title, explanation: attrs.explanation };
		askingScope = false;
		failed = false;
		saved = null;
	}

	function save(attrs: QuestionRewordAttrs, scope: 'session' | 'kind'): void {
		if (!draft || saving) return;
		const { title, explanation } = draft;
		saving = true;
		failed = false;
		rewordQuestion({ sessionId: attrs.sessionId, itemId: attrs.itemId, title, explanation, scope })
			.then(() => {
				saved = scope;
				close();
			})
			.catch((error: unknown) => {
				failed = true;
				console.error('[Teacher] Rewording the question failed:', error);
			})
			.finally(() => {
				saving = false;
				m.redraw();
			});
	}

	return {
		view({ attrs }) {
			// The teacher advanced the room while the box was open — the draft
			// belongs to a question nobody is looking at any more.
			if (stateItemId !== attrs.itemId) {
				stateItemId = attrs.itemId;
				draft = null;
				askingScope = false;
				failed = false;
				saved = null;
			}

			const kind = questionKindOf(attrs);
			const isRound = kind !== 'open';

			if (!draft) {
				return m('.question-reword', [
					m(
						'button.btn.btn--sm.btn--ghost.question-reword__open',
						{ type: 'button', onclick: () => open(attrs) },
						[m(Icon, { name: 'edit', size: 16 }), ` ${t('teacher.reword')}`],
					),
					saved
						? m(
								'p.question-reword__done',
								saved === 'kind'
									? t('teacher.reword_saved_all', { round: t(`question.kind_${kind}`) })
									: t('teacher.reword_saved'),
							)
						: null,
				]);
			}

			return m('.question-reword.question-reword--open', [
				m('p.question-reword__title', t('teacher.reword_title')),
				m('p.question-reword__hint', t('teacher.reword_hint')),

				m('label.question-reword__field', [
					m('span', t('teacher.reword_question')),
					m('input.question-reword__text[type=text]', {
						value: draft.title,
						maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
						disabled: askingScope,
						oncreate: (node: m.VnodeDOM) => (node.dom as HTMLInputElement).focus(),
						oninput: (event: InputEvent) => {
							if (draft) draft.title = (event.target as HTMLInputElement).value;
						},
					}),
				]),
				m('label.question-reword__field', [
					m('span', t('teacher.reword_explanation')),
					m('textarea.question-reword__textarea', {
						value: draft.explanation,
						rows: 3,
						maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
						disabled: askingScope,
						oninput: (event: InputEvent) => {
							if (draft) draft.explanation = (event.target as HTMLTextAreaElement).value;
						},
					}),
				]),

				// A round asks where the words should live before it writes them;
				// an open question has nowhere else to put them.
				askingScope
					? m('.question-reword__scope', [
							m('p.question-reword__scope-title', t('teacher.reword_scope_title')),
							m('.question-reword__actions', [
								m(
									'button.btn.btn--sm.btn--primary',
									{ type: 'button', disabled: saving, onclick: () => save(attrs, 'kind') },
									t('teacher.reword_scope_kind', { round: t(`question.kind_${kind}`) }),
								),
								m(
									'button.btn.btn--sm.btn--secondary',
									{ type: 'button', disabled: saving, onclick: () => save(attrs, 'session') },
									t('teacher.reword_scope_here'),
								),
							]),
							m('p.question-reword__hint', t('teacher.reword_scope_hint')),
						])
					: m('.question-reword__actions', [
							m(
								'button.btn.btn--sm.btn--primary',
								{
									type: 'button',
									disabled: saving || (!isRound && !draft.title.trim()),
									onclick: () => {
										if (isRound) {
											askingScope = true;

											return;
										}
										save(attrs, 'session');
									},
								},
								saving ? t('common.loading') : t('teacher.reword_save'),
							),
							m(
								'button.btn.btn--sm.btn--ghost',
								{ type: 'button', disabled: saving, onclick: close },
								t('common.cancel'),
							),
						]),

				failed ? m('p.join__error', t('teacher.reword_failed')) : null,
			]);
		},
	};
}
