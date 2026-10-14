import m from 'mithril';
import { t } from '../../../lib/i18n';
import type { TextRow } from '../../../lib/flows/moderationQueue';
import {
	moderateStatement,
	moderationErrorKey,
	sendTeacherNote,
} from '../../../lib/teacherConsole';
import { quote } from '../../../lib/flows/writingContext';
import {
	AGORA_LIMITS,
	AGORA_TEACHER_MESSAGE,
	AGORA_TEACHER_PRESETS,
	type AgoraSession,
} from '@freedi/shared-types';

/**
 * The teacher's four moves on one line and the inline sheet each opens under
 * the row — reword, hide from the class, delete for good, write the author a
 * note. Every sheet says what will happen BEFORE the button: who sees what,
 * and whether it can be undone. One sheet is open at a time across the whole
 * list.
 */
export type SheetKind = 'edit' | 'hide' | 'delete' | 'note';

const REASON_CHIPS = ['language', 'offtopic', 'personal'] as const;

export interface WritingActions {
	sheetOf(statementId: string): SheetKind | null;
	open(item: TextRow, kind: SheetKind): void;
	close(): void;
	busy(statementId: string): boolean;
	/** Restore has no sheet: one tap, the consequence is printed beside it */
	restore(session: AgoraSession, item: TextRow): void;
	sheet(session: AgoraSession, item: TextRow, removed: boolean): m.Children;
	errorFor(statementId: string): string | null;
}

export function createWritingActions(): WritingActions {
	let openId: string | null = null;
	let kind: SheetKind | null = null;
	let busyId: string | null = null;
	let errorId: string | null = null;
	let errorKey: string | null = null;
	/** Reword: the new wording. Hide / delete / reword: the notice the author reads. Note: the note. */
	let wording = '';
	let notice = '';
	let note = '';

	async function run(statementId: string, move: () => Promise<unknown>): Promise<void> {
		if (busyId) return;
		busyId = statementId;
		errorKey = null;
		m.redraw();
		try {
			await move();
			openId = null;
			kind = null;
		} catch (error) {
			console.error('[Teacher] Writing-view move failed:', error);
			errorKey = moderationErrorKey(error);
			errorId = statementId;
		} finally {
			busyId = null;
			m.redraw();
		}
	}

	function open(item: TextRow, next: SheetKind): void {
		openId = item.statementId;
		kind = next;
		errorKey = null;
		wording = item.text;
		notice = next === 'edit' ? t('teacher.w_reword_default') : '';
		note = '';
	}

	function close(): void {
		openId = null;
		kind = null;
		errorKey = null;
	}

	function buttons(confirm: m.Children, disabled: boolean, onConfirm: () => void, danger = false) {
		return m('.teacher__mode-row', [
			m(
				'button.btn.btn--sm',
				{
					type: 'button',
					class: danger ? 'btn--danger-sm' : 'btn--primary',
					disabled,
					onclick: onConfirm,
				},
				confirm,
			),
			m(
				'button.btn.btn--sm.btn--ghost',
				{ type: 'button', disabled: busyId !== null, onclick: close },
				t('common.cancel'),
			),
		]);
	}

	function noticeField(busy: boolean, hintKey: string): m.Children {
		return [
			m('label.voting-settings__hint', { for: 'writing-notice' }, t(hintKey)),
			m(
				'.mod-reason-chips',
				REASON_CHIPS.map((chip) =>
					m(
						'button.mod-reason-chip',
						{
							key: chip,
							type: 'button',
							class:
								notice === t(`teacher.hide_reason_${chip}`) ? 'mod-reason-chip--on' : undefined,
							onclick: () => {
								notice = t(`teacher.hide_reason_${chip}`);
							},
						},
						t(`teacher.hide_reason_${chip}`),
					),
				),
			),
			m('input.join__name-input#writing-notice', {
				type: 'text',
				value: notice,
				maxlength: AGORA_TEACHER_MESSAGE.MAX_REASON,
				placeholder: t('teacher.hide_reason_placeholder'),
				disabled: busy,
				oninput: (event: InputEvent) => {
					notice = (event.target as HTMLInputElement).value;
				},
			}),
		];
	}

	function editSheet(session: AgoraSession, item: TextRow, busy: boolean): m.Children {
		const next = wording.trim();

		return [
			m('p.voting-settings__hint', t('teacher.w_reword_hint')),
			m('textarea.text-input.thread__input', {
				value: wording,
				rows: 3,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				'aria-label': t('teacher.edit_text'),
				disabled: busy,
				oninput: (event: InputEvent) => {
					wording = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m(
				'label.voting-settings__hint',
				{ for: 'writing-notice-edit' },
				t('teacher.w_reword_notice'),
			),
			m('input.join__name-input#writing-notice-edit', {
				type: 'text',
				value: notice,
				maxlength: AGORA_TEACHER_MESSAGE.MAX_REASON,
				disabled: busy,
				oninput: (event: InputEvent) => {
					notice = (event.target as HTMLInputElement).value;
				},
			}),
			buttons(
				t('teacher.save_text'),
				busy || !next || next === item.text,
				() =>
					void run(item.statementId, () =>
						moderateStatement({
							sessionId: session.sessionId,
							action: 'edit',
							statementId: item.statementId,
							text: next,
							reason: notice.trim(),
						}),
					),
			),
		];
	}

	function removeSheet(
		session: AgoraSession,
		item: TextRow,
		busy: boolean,
		action: 'hide' | 'delete',
	): m.Children {
		const forGood = action === 'delete';

		return [
			m('p.voting-settings__hint', t(forGood ? 'teacher.w_delete_hint' : 'teacher.w_hide_hint')),
			noticeField(busy, 'teacher.hide_reason'),
			buttons(
				t(forGood ? 'teacher.w_delete_confirm' : 'teacher.w_hide_confirm'),
				busy,
				() =>
					void run(item.statementId, () =>
						moderateStatement({
							sessionId: session.sessionId,
							action,
							statementId: item.statementId,
							reason: notice.trim(),
						}),
					),
				forGood,
			),
		];
	}

	function noteSheet(session: AgoraSession, item: TextRow, busy: boolean, removed: boolean) {
		const send = (body: { text?: string; presetKey?: string }): void =>
			void run(item.statementId, () =>
				sendTeacherNote({
					sessionId: session.sessionId,
					studentUid: item.authorUid,
					aboutStatementId: item.statementId,
					...body,
				}),
			);

		return [
			m(
				'blockquote.teacher-thread__removed',
				t('teacher.w_note_about', { text: quote(item.text) }),
			),
			m('p.voting-settings__hint', t(removed ? 'teacher.w_note_removed' : 'teacher.w_note_hint')),
			m(
				'.mod-reason-chips',
				AGORA_TEACHER_PRESETS.map((preset) =>
					m(
						'button.mod-reason-chip',
						{
							key: preset,
							type: 'button',
							disabled: busy,
							onclick: () => send({ presetKey: preset }),
						},
						t(`teacherPreset.${preset}`),
					),
				),
			),
			m('textarea.text-input.thread__input', {
				value: note,
				rows: 2,
				maxlength: AGORA_TEACHER_MESSAGE.MAX_TEXT,
				placeholder: t('teacher.note_placeholder'),
				'aria-label': t('teacher.note_placeholder'),
				disabled: busy,
				oninput: (event: InputEvent) => {
					note = (event.target as HTMLTextAreaElement).value;
				},
			}),
			buttons(t('teacher.note_send'), busy || !note.trim(), () => send({ text: note.trim() })),
		];
	}

	return {
		sheetOf: (statementId) => (openId === statementId ? kind : null),
		open,
		close,
		busy: (statementId) => busyId === statementId,
		errorFor: (statementId) => (errorId === statementId ? errorKey : null),
		restore(session, item) {
			void run(item.statementId, () =>
				moderateStatement({
					sessionId: session.sessionId,
					action: 'restore',
					statementId: item.statementId,
				}),
			);
		},
		sheet(session, item, removed) {
			const busy = busyId === item.statementId;
			const body =
				kind === 'edit'
					? editSheet(session, item, busy)
					: kind === 'hide' || kind === 'delete'
						? removeSheet(session, item, busy, kind)
						: noteSheet(session, item, busy, removed);

			return m(
				'.mod-row__editor',
				{ class: kind === 'delete' ? 'mod-row__editor--danger' : undefined },
				[body, errorKey && errorId === item.statementId ? m('p.join__error', t(errorKey)) : null],
			);
		},
	};
}
