import m from 'mithril';
import { t } from '../../../lib/i18n';
import type { TextRow } from '../../../lib/flows/moderationQueue';
import { realNameOf, threadFor } from '../../../lib/teacherConsole';
import { formatMessageTime } from '../../ThreadChat';
import type { AgoraSession } from '@freedi/shared-types';
import type { WritingActions } from './WritingActions';

/**
 * One line a student wrote: head (kind, time, and the author when the list
 * is not already one student's page), the words, a status line for what the
 * teacher already did, then the same three buttons every time — never in a
 * menu — plus the inline sheet one of them opened.
 */
export interface WritingRowAttrs {
	session: AgoraSession;
	item: TextRow;
	actions: WritingActions;
	showAuthor: boolean;
	/** The author was taken out of the lesson: still readable, still reachable */
	removed: boolean;
}

/** What the teacher already did about this line, from the private thread */
export function statusLines(item: TextRow): string[] {
	const lines: string[] = [];
	const thread = threadFor(item.authorUid).filter(
		(line) => line.aboutStatementId === item.statementId,
	);
	if (item.editedByTeacher && !item.hidden) lines.push(t('teacher.edited_by_you'));
	if (item.hidden) {
		const reason = [...thread].reverse().find((line) => line.moderation === 'hidden')?.text ?? '';
		lines.push(reason ? t('teacher.w_status_reason', { reason }) : t('teacher.w_status_hidden'));
	}
	if (thread.some((line) => line.kind === 'note' && line.from === 'teacher')) {
		lines.push(t('teacher.w_status_note'));
	}

	return lines;
}

function button(label: string, onclick: () => void, disabled: boolean, extra = ''): m.Vnode {
	return m(
		`button.btn.btn--sm.${extra || 'btn--ghost'}`,
		{ type: 'button', disabled, onclick },
		label,
	);
}

export const WritingRow: m.Component<WritingRowAttrs> = {
	view(vnode) {
		const { session, item, actions, showAuthor, removed } = vnode.attrs;
		const real = realNameOf(item.authorUid);
		const sheet = actions.sheetOf(item.statementId);
		const busy = actions.busy(item.statementId);
		const status = statusLines(item);
		const error = sheet === null ? actions.errorFor(item.statementId) : null;

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
					showAuthor
						? m('span.mod-row__who', [
								m('span.class-panel__name', item.anonName),
								real ? m('span.class-panel__real', ` · ${real}`) : null,
							])
						: m('span.mod-row__who'),
					m('span.mod-row__kind', t(`teacher.kind_${item.kind}`)),
					m('span.thread__time', formatMessageTime(item.createdAt)),
				]),
				item.hidden
					? m('p.mod-row__text.mod-row__text--hidden', t('teacher.hidden_by_you'))
					: m('p.mod-row__text', item.text),
				status.length > 0
					? m(
							'p.mod-row__status',
							status.map((line) => m('span.mod-row__status-item', { key: line }, line)),
						)
					: null,
				sheet ? actions.sheet(session, item, removed) : null,
				sheet
					? null
					: m('.mod-row__actions', [
							item.hidden
								? button(
										t('teacher.restore_text'),
										() => actions.restore(session, item),
										busy,
										'btn--secondary',
									)
								: [
										button(t('teacher.edit_text'), () => actions.open(item, 'edit'), busy),
										button(t('teacher.w_hide'), () => actions.open(item, 'hide'), busy),
									],
							button(t('teacher.w_note'), () => actions.open(item, 'note'), busy, 'btn--secondary'),
							button(t('teacher.w_delete'), () => actions.open(item, 'delete'), busy),
						]),
				item.hidden && !sheet ? m('p.voting-settings__hint', t('teacher.w_restore_hint')) : null,
				error ? m('p.join__error', t(error)) : null,
			],
		);
	},
};
