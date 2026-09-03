import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { formatMessageTime } from '../ThreadChat';
import { teacherLineText } from '../../components/TeacherThreadSheet';
import {
	markStudentThreadSeen,
	moderationErrorKey,
	sendTeacherNote,
	threadFor,
} from '../../lib/teacherConsole';
import {
	AGORA_TEACHER_MESSAGE,
	AGORA_TEACHER_PRESETS,
	type AgoraTeacherMessage,
} from '@freedi/shared-types';

export interface StudentThreadDrawerAttrs {
	sessionId: string;
	studentUid: string;
	anonName: string;
	realName?: string;
	/** A note about one text: the row the teacher pressed "message" on */
	aboutStatementId?: string;
	onClose: () => void;
}

/**
 * One student's private thread, as a drawer beside the console: the notes
 * sent, the replies received, the moderation notices in between, five quick
 * phrases and a composer. Opening it marks everything read.
 */
export function StudentThreadDrawer(): m.Component<StudentThreadDrawerAttrs> {
	let draft = '';
	let sending = false;
	let errorKey: string | null = null;
	let seenFor = '';

	async function send(
		attrs: StudentThreadDrawerAttrs,
		body: { text?: string; presetKey?: string },
	): Promise<void> {
		if (sending) return;
		sending = true;
		errorKey = null;
		m.redraw();
		try {
			await sendTeacherNote({
				sessionId: attrs.sessionId,
				studentUid: attrs.studentUid,
				...body,
				...(attrs.aboutStatementId ? { aboutStatementId: attrs.aboutStatementId } : {}),
			});
			if (body.text) draft = '';
		} catch (error) {
			console.error('[Teacher] Sending the note failed:', error);
			errorKey = moderationErrorKey(error);
		} finally {
			sending = false;
			m.redraw();
		}
	}

	function line(entry: AgoraTeacherMessage): m.Children {
		if (entry.kind === 'moderation') {
			const key =
				entry.moderation === 'hidden'
					? 'teacher.notice_hidden'
					: entry.moderation === 'restored'
						? 'teacher.notice_restored'
						: 'teacher.notice_edited';

			return m('.chat-system', { key: entry.messageId }, [
				m('.chat-system__head', [
					m('span.chat-system__title', t(key)),
					m('span.chat-system__time', formatMessageTime(entry.createdAt)),
				]),
				entry.text ? m('p.chat-system__text', entry.text) : null,
				entry.removedText ? m('blockquote.teacher-thread__removed', entry.removedText) : null,
			]);
		}
		const mine = entry.from === 'teacher';

		return m(
			'.thread__msg',
			{ key: entry.messageId, class: mine ? 'thread__msg--mine' : 'thread__msg--peer' },
			[
				m('p.thread__text', teacherLineText(entry)),
				m('span.thread__time', formatMessageTime(entry.createdAt)),
			],
		);
	}

	// Escape closes it from anywhere: the scrim is never the focused element,
	// so a key handler on it would only ever hear keys nobody presses there
	let closeNow: (() => void) | null = null;
	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') closeNow?.();
	}

	return {
		oncreate() {
			document.addEventListener('keydown', onKey);
		},

		onremove() {
			document.removeEventListener('keydown', onKey);
		},

		view(vnode) {
			closeNow = vnode.attrs.onClose;
			const attrs = vnode.attrs;
			if (seenFor !== attrs.studentUid) {
				seenFor = attrs.studentUid;
				markStudentThreadSeen(attrs.studentUid);
			}
			const thread = threadFor(attrs.studentUid);

			return m(
				'.teacher-drawer__scrim',
				{
					onclick: (event: MouseEvent) => {
						if (event.target === event.currentTarget) attrs.onClose();
					},
				},
				m(
					'.teacher-drawer',
					{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'teacher-drawer-title' },
					[
						m('.teacher-drawer__head', [
							m('h3.teacher-drawer__title#teacher-drawer-title', [
								m('span.class-panel__name', attrs.anonName),
								attrs.realName
									? m('span.class-panel__real', ` → ${attrs.realName}`)
									: m(
											'span.class-panel__real.class-panel__real--none',
											` · ${t('teacher.no_real_name')}`,
										),
							]),
							m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', 'aria-label': t('common.close'), onclick: attrs.onClose },
								'✕',
							),
						]),
						thread.length === 0
							? m('p.home-explanation', t('teacher.thread_empty'))
							: m('.teacher-drawer__lines', thread.map(line)),
						m('.teacher-drawer__quick', [
							m('p.voting-settings__hint', t('teacher.quick_phrases')),
							m(
								'.mod-reason-chips',
								AGORA_TEACHER_PRESETS.map((preset) =>
									m(
										'button.mod-reason-chip',
										{
											key: preset,
											type: 'button',
											disabled: sending,
											onclick: () => void send(attrs, { presetKey: preset }),
										},
										t(`teacherPreset.${preset}`),
									),
								),
							),
						]),
						m('.teacher-thread__composer', [
							m('textarea.thread__input', {
								value: draft,
								rows: 2,
								maxlength: AGORA_TEACHER_MESSAGE.MAX_TEXT,
								placeholder: t('teacher.note_placeholder'),
								'aria-label': t('teacher.note_placeholder'),
								disabled: sending,
								oninput: (event: InputEvent) => {
									draft = (event.target as HTMLTextAreaElement).value;
								},
							}),
							m(
								'button.btn.btn--primary',
								{
									type: 'button',
									disabled: sending || !draft.trim(),
									onclick: () => void send(attrs, { text: draft.trim() }),
								},
								[m(Icon, { name: 'megaphone', size: 16 }), ` ${t('teacher.note_send')}`],
							),
						]),
						errorKey ? m('p.join__error', t(errorKey)) : null,
					],
				),
			);
		},
	};
}
