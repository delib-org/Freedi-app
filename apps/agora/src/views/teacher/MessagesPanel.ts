import m from 'mithril';
import { t } from '../../lib/i18n';
import { getDeliberationState } from '../../lib/proposals';
import {
	authorsOf,
	buildTextRows,
	filterRows,
	type TextKind,
	type TextRow,
} from '../../lib/flows/moderationQueue';
import { moderateStatement, moderationErrorKey, realNameOf } from '../../lib/teacherConsole';
import { formatMessageTime } from '../ThreadChat';
import {
	AGORA_LIMITS,
	AGORA_TEACHER_MESSAGE,
	type AgoraParticipant,
	type AgoraSession,
} from '@freedi/shared-types';

export interface MessagesPanelAttrs {
	session: AgoraSession;
	participants: readonly AgoraParticipant[];
	onMessage: (studentUid: string, aboutStatementId?: string) => void;
}

const KINDS: readonly TextKind[] = ['proposal', 'answer', 'suggestion', 'chat', 'pitch'];
const REASON_CHIPS = ['language', 'offtopic', 'personal'] as const;

/**
 * The Messages tab: every line a student wrote, newest first, with the
 * teacher's three moves on each — reword it, take it down (with a reason the
 * author will read), put it back — and the door to a note to its author.
 *
 * Everything on this screen is already in the deliberation state the Live
 * tab listens to; this only renders it. The moves go through the moderation
 * callable, which is what makes them honest (see fn_agoraModerateStatement).
 */
export function MessagesPanel(): m.Component<MessagesPanelAttrs> {
	let studentUid = '';
	let kind: TextKind | '' = '';
	let showHidden = false;
	/** The row being reworded, and the draft */
	let editingId: string | null = null;
	let editDraft = '';
	/** The row about to be hidden, and the reason */
	let hidingId: string | null = null;
	let reason = '';
	let busyId: string | null = null;
	let errorKey: string | null = null;

	async function run(statementId: string, move: () => Promise<unknown>): Promise<void> {
		if (busyId) return;
		busyId = statementId;
		errorKey = null;
		m.redraw();
		try {
			await move();
			editingId = null;
			hidingId = null;
			reason = '';
		} catch (error) {
			console.error('[Teacher] Moderation failed:', error);
			errorKey = moderationErrorKey(error);
		} finally {
			busyId = null;
			m.redraw();
		}
	}

	function actions(
		session: AgoraSession,
		item: TextRow,
		onMessage: MessagesPanelAttrs['onMessage'],
	): m.Children {
		const busy = busyId === item.statementId;
		if (item.hidden) {
			return m('.mod-row__actions', [
				m(
					'button.btn.btn--sm.btn--secondary',
					{
						type: 'button',
						disabled: busy,
						onclick: () =>
							void run(item.statementId, () =>
								moderateStatement({
									sessionId: session.sessionId,
									action: 'restore',
									statementId: item.statementId,
								}),
							),
					},
					t('teacher.restore_text'),
				),
				messageButton(item, onMessage),
			]);
		}

		return m('.mod-row__actions', [
			m(
				'button.btn.btn--sm.btn--ghost',
				{
					type: 'button',
					disabled: busy,
					onclick: () => {
						editingId = item.statementId;
						editDraft = item.text;
						hidingId = null;
					},
				},
				t('teacher.edit_text'),
			),
			m(
				'button.btn.btn--sm.btn--ghost',
				{
					type: 'button',
					disabled: busy,
					onclick: () => {
						hidingId = item.statementId;
						reason = '';
						editingId = null;
					},
				},
				t('teacher.hide_text'),
			),
			messageButton(item, onMessage),
		]);
	}

	function messageButton(item: TextRow, onMessage: MessagesPanelAttrs['onMessage']): m.Children {
		return m(
			'button.btn.btn--sm.btn--secondary',
			{ type: 'button', onclick: () => onMessage(item.authorUid, item.statementId) },
			t('teacher.message_student'),
		);
	}

	function editor(session: AgoraSession, item: TextRow): m.Children {
		const busy = busyId === item.statementId;

		return m('.mod-row__editor', [
			m('textarea.thread__input', {
				value: editDraft,
				rows: 3,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				'aria-label': t('teacher.edit_text'),
				disabled: busy,
				oninput: (event: InputEvent) => {
					editDraft = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m('.teacher__mode-row', [
				m(
					'button.btn.btn--sm.btn--primary',
					{
						type: 'button',
						disabled: busy || !editDraft.trim() || editDraft.trim() === item.text,
						onclick: () =>
							void run(item.statementId, () =>
								moderateStatement({
									sessionId: session.sessionId,
									action: 'edit',
									statementId: item.statementId,
									text: editDraft.trim(),
								}),
							),
					},
					t('teacher.save_text'),
				),
				m(
					'button.btn.btn--sm.btn--ghost',
					{
						type: 'button',
						disabled: busy,
						onclick: () => {
							editingId = null;
						},
					},
					t('common.cancel'),
				),
			]),
		]);
	}

	function hider(session: AgoraSession, item: TextRow): m.Children {
		const busy = busyId === item.statementId;

		return m('.mod-row__editor', [
			m('p.voting-settings__hint', t('teacher.hide_reason')),
			m(
				'.mod-reason-chips',
				REASON_CHIPS.map((chip) =>
					m(
						'button.mod-reason-chip',
						{
							key: chip,
							type: 'button',
							class:
								reason === t(`teacher.hide_reason_${chip}`) ? 'mod-reason-chip--on' : undefined,
							onclick: () => {
								reason = t(`teacher.hide_reason_${chip}`);
							},
						},
						t(`teacher.hide_reason_${chip}`),
					),
				),
			),
			m('input.join__name-input', {
				type: 'text',
				value: reason,
				maxlength: AGORA_TEACHER_MESSAGE.MAX_REASON,
				placeholder: t('teacher.hide_reason_placeholder'),
				'aria-label': t('teacher.hide_reason'),
				disabled: busy,
				oninput: (event: InputEvent) => {
					reason = (event.target as HTMLInputElement).value;
				},
			}),
			m('.teacher__mode-row', [
				m(
					'button.btn.btn--sm.btn--primary',
					{
						type: 'button',
						disabled: busy,
						onclick: () =>
							void run(item.statementId, () =>
								moderateStatement({
									sessionId: session.sessionId,
									action: 'hide',
									statementId: item.statementId,
									reason: reason.trim(),
								}),
							),
					},
					t('teacher.hide_confirm'),
				),
				m(
					'button.btn.btn--sm.btn--ghost',
					{
						type: 'button',
						disabled: busy,
						onclick: () => {
							hidingId = null;
						},
					},
					t('common.cancel'),
				),
			]),
		]);
	}

	function row(
		session: AgoraSession,
		item: TextRow,
		onMessage: MessagesPanelAttrs['onMessage'],
	): m.Children {
		const real = realNameOf(item.authorUid);

		return m(
			'.mod-row',
			{
				key: item.statementId,
				class: [
					item.hidden ? 'mod-row--hidden' : undefined,
					item.editedByTeacher ? 'mod-row--edited' : undefined,
				]
					.filter(Boolean)
					.join(' '),
			},
			[
				m('.mod-row__head', [
					m('span.mod-row__who', [
						m('span.class-panel__name', item.anonName),
						real ? m('span.class-panel__real', ` · ${real}`) : null,
					]),
					m('span.mod-row__kind', t(`teacher.kind_${item.kind}`)),
					m('span.thread__time', formatMessageTime(item.createdAt)),
				]),
				editingId === item.statementId
					? editor(session, item)
					: item.hidden
						? m('p.mod-row__text.mod-row__text--hidden', t('teacher.hidden_by_you'))
						: m('p.mod-row__text', item.text),
				item.editedByTeacher && !item.hidden
					? m('span.moderation__edited', t('teacher.edited_by_you'))
					: null,
				hidingId === item.statementId ? hider(session, item) : null,
				editingId === item.statementId || hidingId === item.statementId
					? null
					: actions(session, item, onMessage),
				errorKey &&
				busyId === null &&
				(hidingId === item.statementId || editingId === item.statementId)
					? m('p.join__error', t(errorKey))
					: null,
			],
		);
	}

	return {
		view(vnode) {
			const { session, participants, onMessage } = vnode.attrs;
			const state = getDeliberationState();
			const rows = buildTextRows({
				proposals: state.proposals,
				answersByQuestion: state.answersByQuestion,
				suggestions: state.suggestions,
				participants,
				challengerStatementId: session.votingGame?.challengerStatementId,
			});
			const shown = filterRows(rows, {
				showHidden,
				...(studentUid ? { studentUid } : {}),
				...(kind ? { kind } : {}),
			});
			const hiddenCount = rows.filter((item) => item.hidden).length;

			return m('.card.stack.messages-panel', [
				m('.class-progress__head', [
					m('p.teacher__section-title', t('teacher.messages_title')),
					m('span.class-progress__count', String(shown.length)),
				]),
				m('.messages-panel__filters', [
					m(
						'select.messages-panel__select',
						{
							'aria-label': t('teacher.filter_all_students'),
							onchange: (event: Event) => {
								studentUid = (event.target as HTMLSelectElement).value;
							},
						},
						[
							m(
								'option',
								{ value: '', selected: studentUid === '' },
								t('teacher.filter_all_students'),
							),
							authorsOf(rows).map((author) =>
								m(
									'option',
									{ key: author.uid, value: author.uid, selected: studentUid === author.uid },
									realNameOf(author.uid)
										? `${author.anonName} · ${realNameOf(author.uid)}`
										: author.anonName,
								),
							),
						],
					),
					m(
						'select.messages-panel__select',
						{
							'aria-label': t('teacher.filter_all_kinds'),
							onchange: (event: Event) => {
								kind = (event.target as HTMLSelectElement).value as TextKind | '';
							},
						},
						[
							m('option', { value: '', selected: kind === '' }, t('teacher.filter_all_kinds')),
							KINDS.map((value) =>
								m(
									'option',
									{ key: value, value, selected: kind === value },
									t(`teacher.kind_${value}`),
								),
							),
						],
					),
					m('label.voting-settings__row', [
						m('input[type=checkbox]', {
							checked: showHidden,
							onchange: (event: Event) => {
								showHidden = (event.target as HTMLInputElement).checked;
							},
						}),
						m('span', t('teacher.filter_show_hidden', { n: hiddenCount })),
					]),
				]),
				errorKey && hidingId === null && editingId === null
					? m('p.join__error', t(errorKey))
					: null,
				shown.length === 0
					? m('p.home-explanation', t('teacher.no_messages_yet'))
					: m(
							'.messages-panel__list',
							shown.map((item) => row(session, item, onMessage)),
						),
			]);
		},
	};
}
