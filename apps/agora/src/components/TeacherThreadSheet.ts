import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { formatMessageTime } from '../views/ThreadChat';
import { getTeacherThread, replyToTeacher } from '../lib/teacherThread';
import { AGORA_TEACHER_MESSAGE, type AgoraTeacherMessage } from '@freedi/shared-types';

export interface TeacherThreadSheetAttrs {
	sessionId: string;
	onClose: () => void;
}

/** A quick phrase the teacher tapped, said in THIS phone's language */
export function teacherLineText(line: AgoraTeacherMessage): string {
	if (line.presetKey) {
		const said = t(`teacherPreset.${line.presetKey}`);
		if (said && said !== `teacherPreset.${line.presetKey}`) return said;
	}

	return line.text;
}

/** What a moderation notice says happened, in the student's language */
function moderationLine(line: AgoraTeacherMessage): m.Children {
	const key =
		line.moderation === 'hidden'
			? 'moderation.removed_title'
			: line.moderation === 'restored'
				? 'moderation.restored'
				: 'moderation.edited_notice';

	return m('.chat-system.teacher-thread__notice', { key: line.messageId }, [
		m('.chat-system__head', [
			m('span.chat-system__title', t(key)),
			m('span.chat-system__time', formatMessageTime(line.createdAt)),
		]),
		line.text ? m('p.chat-system__text', line.text) : null,
		line.removedText ? m('blockquote.teacher-thread__removed', line.removedText) : null,
	]);
}

/**
 * The private thread with the teacher, as a sheet over whatever stage the
 * student is on — a note about language has to be readable on the scene
 * screen it was sent during, not only in the square. Escape and the scrim
 * both close it.
 */
export function TeacherThreadSheet(): m.Component<TeacherThreadSheetAttrs> {
	let draft = '';
	let sending = false;
	let sendFailed = false;

	// Escape closes it from anywhere — a handler on the sheet itself only hears
	// keys while something inside it has focus
	let closeNow: (() => void) | null = null;
	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') closeNow?.();
	}

	async function send(sessionId: string): Promise<void> {
		const text = draft.trim();
		if (!text || sending) return;
		sending = true;
		sendFailed = false;
		m.redraw();
		try {
			await replyToTeacher(sessionId, text);
			draft = '';
		} catch (error) {
			console.error('[TeacherThread] Reply failed:', error);
			sendFailed = true;
		} finally {
			sending = false;
			m.redraw();
		}
	}

	function line(entry: AgoraTeacherMessage): m.Children {
		if (entry.kind === 'moderation') return moderationLine(entry);
		const mine = entry.from === 'student';

		return m(
			'.thread__msg',
			{
				key: entry.messageId,
				class: mine ? 'thread__msg--mine' : 'thread__msg--peer thread__msg--teacher',
			},
			[
				mine ? null : m('span.thread__who', t('teacherThread.from_teacher')),
				m('p.thread__text', teacherLineText(entry)),
				m('span.thread__time', formatMessageTime(entry.createdAt)),
			],
		);
	}

	return {
		oncreate() {
			document.addEventListener('keydown', onKey);
		},

		onremove() {
			document.removeEventListener('keydown', onKey);
		},

		view(vnode) {
			const { sessionId, onClose } = vnode.attrs;
			closeNow = onClose;
			const thread = getTeacherThread();

			return m(
				'.look-sheet.teacher-thread',
				{
					onclick: (event: MouseEvent) => {
						if (event.target === event.currentTarget) onClose();
					},
				},
				m(
					'.look-sheet__panel.teacher-thread__panel',
					{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'teacher-thread-title' },
					[
						m('.look-sheet__head', [
							m('h2.look-sheet__title#teacher-thread-title', [
								m(
									'span.teacher-thread__icon',
									{ 'aria-hidden': 'true' },
									m(Icon, { name: 'megaphone', size: 20 }),
								),
								t('teacherThread.title'),
							]),
							m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', 'aria-label': t('common.close'), onclick: onClose },
								'✕',
							),
						]),
						thread.length === 0
							? m('p.look-sheet__hint', t('teacherThread.empty'))
							: m('.teacher-thread__lines', thread.map(line)),
						m('.teacher-thread__composer', [
							m('textarea.thread__input', {
								value: draft,
								rows: 2,
								maxlength: AGORA_TEACHER_MESSAGE.MAX_TEXT,
								placeholder: t('teacherThread.reply_placeholder'),
								'aria-label': t('teacherThread.reply_placeholder'),
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
									onclick: () => void send(sessionId),
								},
								t('teacherThread.send'),
							),
						]),
						sendFailed ? m('p.join__error', t('common.error')) : null,
					],
				),
			);
		},
	};
}
