import m from 'mithril';
import { CLASS_REPLY_MAX_LENGTH, type Statement } from '@freedi/shared-types';
import '@/styles/teacher-replies.scss';
import { t } from '@/lib/i18n';
import type { Unsubscribe } from '@/lib/firebase';
import { listenLessonReplies, newReplyId, postReply } from '@/lib/classroom/replies';
import { replyRole, visibleReplies } from '@/lib/classroom/replyLogic';
import { setHidden } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * The teacher's replies on each proposal in "מה כתבו" (IA 22.5): "Replies (n)"
 * opens every reply with the writer's real name (hidden ones too), hide /
 * restore on each, and a composer whose reply shows to the class as "Teacher"
 * and notifies the author. One listener for the whole lesson while the view is
 * open.
 */

interface TeacherRepliesState {
	byProposal: Map<string, Statement[]>;
	open: Set<string>;
	drafts: Map<string, string>;
	/** Reply id of a send in flight, per proposal (reused on retry). */
	pending: Map<string, string>;
	failed: Set<string>;
	stop: Unsubscribe | null;
	topParentId: string | null;
}

const state: TeacherRepliesState = {
	byProposal: new Map(),
	open: new Set(),
	drafts: new Map(),
	pending: new Map(),
	failed: new Set(),
	stop: null,
	topParentId: null,
};

/** Start (or keep) the lesson's replies listener. */
export function watchTeacherReplies(topParentId: string): void {
	if (state.topParentId === topParentId && state.stop) return;
	stopTeacherReplies();
	state.topParentId = topParentId;
	state.stop = listenLessonReplies(
		topParentId,
		(list) => {
			const next = new Map<string, Statement[]>();
			for (const reply of list)
				next.set(reply.parentId, [...(next.get(reply.parentId) ?? []), reply]);
			state.byProposal = next;
			m.redraw();
		},
		(error) =>
			console.error(
				'[TeacherReplies] listener error',
				{ operation: 'teacherReplies.listen', topParentId },
				error,
			),
	);
}

export function stopTeacherReplies(): void {
	state.stop?.();
	state.stop = null;
	state.topParentId = null;
	state.byProposal = new Map();
}

async function send(mainId: string, proposalId: string): Promise<void> {
	const text = (state.drafts.get(proposalId) ?? '').trim();
	if (!text || state.pending.has(proposalId)) return;
	const replyId = newReplyId();
	state.pending.set(proposalId, replyId);
	state.failed.delete(proposalId);
	m.redraw();
	try {
		await postReply(mainId, proposalId, replyId, text);
		state.drafts.delete(proposalId);
	} catch {
		state.failed.add(proposalId);
	} finally {
		state.pending.delete(proposalId);
		m.redraw();
	}
}

function tagOf(reply: Statement): string {
	const name = reply.creator?.displayName?.trim() || t('turn.someone');
	const role = replyRole(reply);
	if (role === 'teacher') return t('reply.by_teacher');
	if (role === 'author') return `${name} · ${t('reply.by_author')}`;

	return name;
}

function replyRow(reply: Statement): m.Vnode {
	const hidden = reply.hide === true;

	return m(
		'li.teacher-reply',
		{ key: reply.statementId, class: hidden ? 'teacher-reply--hidden' : '' },
		[
			m('p.teacher-reply__tag', [
				m('span', tagOf(reply)),
				hidden ? m('span.written-card__flag', t('console.hidden_flag')) : null,
			]),
			m('p.teacher-reply__text', { dir: 'auto' }, reply.statement),
			m(
				'button.btn.btn--tertiary.btn--small',
				{
					type: 'button',
					'data-testid': 'teacher-reply-hide',
					disabled: isBusy(`hide:${reply.statementId}`),
					onclick: () => void setHidden(reply.statementId, !hidden),
				},
				t(hidden ? 'console.restore' : 'console.hide'),
			),
		],
	);
}

export interface TeacherRepliesAttrs {
	mainId: string;
	proposalId: string;
}

/** "Replies (n)" under one proposal card of "מה כתבו". */
export const TeacherReplies: m.Component<TeacherRepliesAttrs> = {
	view({ attrs }) {
		const { proposalId, mainId } = attrs;
		const list = visibleReplies(state.byProposal.get(proposalId) ?? [], '', true);
		const shown = list.filter((r) => r.hide !== true).length;
		const open = state.open.has(proposalId);
		const draft = state.drafts.get(proposalId) ?? '';
		const sending = state.pending.has(proposalId);

		return m('div.teacher-replies', [
			m(
				'button.btn.btn--tertiary.btn--small.teacher-replies__toggle',
				{
					type: 'button',
					'aria-expanded': open ? 'true' : 'false',
					'data-testid': 'teacher-replies-toggle',
					onclick: () => {
						if (open) state.open.delete(proposalId);
						else state.open.add(proposalId);
					},
				},
				[
					m('span', { 'aria-hidden': 'true' }, open ? '▾ ' : '▸ '),
					t('console.replies', { n: shown }),
				],
			),
			open
				? [
						list.length > 0 ? m('ol.teacher-replies__list', list.map(replyRow)) : null,
						m('div.teacher-replies__composer', [
							m('label.teacher-replies__label', [
								m('span.visually-hidden', t('console.reply_placeholder')),
								m('textarea.teacher-replies__area', {
									dir: 'auto',
									rows: 2,
									maxlength: CLASS_REPLY_MAX_LENGTH,
									placeholder: t('console.reply_placeholder'),
									value: draft,
									oninput: (event: Event) => {
										state.drafts.set(proposalId, (event.target as HTMLTextAreaElement).value);
									},
								}),
							]),
							state.failed.has(proposalId)
								? m('p.teacher-replies__failed', { role: 'alert' }, t('reply.failed'))
								: null,
							m(
								'button.btn.btn--secondary.btn--small',
								{
									type: 'button',
									'data-testid': 'teacher-reply-send',
									disabled: sending || draft.trim().length === 0 ? true : undefined,
									onclick: () => void send(mainId, proposalId),
								},
								sending ? t('reply.sending') : t('reply.send'),
							),
						]),
					]
				: null,
		]);
	},
};
