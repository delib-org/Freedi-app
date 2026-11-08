import m from 'mithril';
import { CLASS_REPLY_MAX_LENGTH, type Statement } from '@freedi/shared-types';
import '@/styles/teacher-replies.scss';
import '@/styles/teacher-threads.scss';
import { t } from '@/lib/i18n';
import type { Unsubscribe } from '@/lib/firebase';
import { listenLessonReplies, newReplyId, postReply } from '@/lib/classroom/replies';
import { replyRole, threadsToOpen, visibleReplies } from '@/lib/classroom/replyLogic';
import { HideControl } from './HideControl';

/**
 * The reply thread under a proposal in "מה כתבו" (IA 24.1): the children of the
 * proposal block, indented under it. "Replies (n)" opens every reply with the
 * writer's real name (hidden ones too, greyed, each with its own hide control)
 * and, last, the teacher's composer, whose reply shows to the class as
 * "Teacher" and notifies the author. A thread opens by itself when it has
 * replies the teacher has not seen this session (view state only). One
 * listener for the whole lesson while the view is open.
 */

interface TeacherRepliesState {
	byProposal: Map<string, Statement[]>;
	open: Set<string>;
	/** Replies each thread had when the teacher last saw it (this session). */
	known: Map<string, number>;
	drafts: Map<string, string>;
	/** Reply id of a send in flight, per proposal (reused on retry). */
	pending: Map<string, string>;
	failed: Set<string>;
	stop: Unsubscribe | null;
	lessonId: string | null;
}

const state: TeacherRepliesState = {
	byProposal: new Map(),
	open: new Set(),
	known: new Map(),
	drafts: new Map(),
	pending: new Map(),
	failed: new Set(),
	stop: null,
	lessonId: null,
};

/** Start (or keep) the lesson's replies listener. */
export function watchTeacherReplies(lessonId: string): void {
	if (state.lessonId === lessonId && state.stop) return;
	stopTeacherReplies();
	state.lessonId = lessonId;
	state.stop = listenLessonReplies(
		lessonId,
		(list) => {
			const next = new Map<string, Statement[]>();
			for (const reply of list)
				next.set(reply.parentId, [...(next.get(reply.parentId) ?? []), reply]);
			for (const proposalId of threadsToOpen(next, state.known)) state.open.add(proposalId);
			for (const [proposalId, replies] of next) state.known.set(proposalId, replies.length);
			state.byProposal = next;
			m.redraw();
		},
		(error) =>
			console.error(
				'[TeacherReplies] listener error',
				{ operation: 'teacherReplies.listen', lessonId },
				error,
			),
	);
}

export function stopTeacherReplies(): void {
	state.stop?.();
	state.stop = null;
	state.lessonId = null;
	state.byProposal = new Map();
	state.known = new Map();
	state.open = new Set();
}

/** Replies the class can see under one proposal (hidden ones not counted). */
export function visibleReplyCount(proposalId: string): number {
	return (state.byProposal.get(proposalId) ?? []).filter((r) => r.hide !== true).length;
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
				hidden ? m('span.written-card__flag.chip-hidden', t('console.hidden_flag')) : null,
			]),
			m('p.teacher-reply__text', { dir: 'auto' }, reply.statement),
			m(HideControl, {
				statementId: reply.statementId,
				hidden,
				small: true,
				testId: 'teacher-reply-hide',
			}),
		],
	);
}

export interface TeacherRepliesAttrs {
	mainId: string;
	proposalId: string;
}

/** The thread under one proposal block of "מה כתבו". */
export const TeacherReplies: m.Component<TeacherRepliesAttrs> = {
	view({ attrs }) {
		const { proposalId, mainId } = attrs;
		const list = visibleReplies(state.byProposal.get(proposalId) ?? [], '', true);
		const open = state.open.has(proposalId);
		const draft = state.drafts.get(proposalId) ?? '';
		const sending = state.pending.has(proposalId);

		return m('div.thread', { 'data-testid': 'teacher-thread' }, [
			m(
				'button.btn.btn--tertiary.btn--small.thread__toggle',
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
					t('console.replies', { n: visibleReplyCount(proposalId) }),
				],
			),
			open
				? m('div.thread__body', [
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
					])
				: null,
		]);
	},
};
