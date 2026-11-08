import m from 'mithril';
import { t } from '../../lib/i18n';
import { getDeliberationState } from '../../lib/proposals';
import { buildTextRows, type TextRow } from '../../lib/flows/moderationQueue';
import { planContext } from '../../lib/flows/writingContext';
import {
	groupByQuestion,
	rowsOfStudent,
	searchRows,
	summarizeStudents,
} from '../../lib/flows/writingGroups';
import { realNameOf, unreadRepliesFor } from '../../lib/teacherConsole';
import type { AgoraParticipant, AgoraSession } from '@freedi/shared-types';
import { createWritingActions } from './writing/WritingActions';
import { placeLabel, plainRows, rowsWithDividers, studentList } from './writing/WritingLenses';

export interface MessagesPanelAttrs {
	session: AgoraSession;
	participants: readonly AgoraParticipant[];
	onMessage: (studentUid: string, aboutStatementId?: string) => void;
	/** Opened from the class list on one student: land on their page */
	focusStudentUid?: string;
	/** Opened from the strip mid-lesson: "what is the class writing now" is the live question */
	defaultTab?: Tab;
}

export type Tab = 'student' | 'question';

/**
 * "What they wrote" — everything the class wrote, with the teacher's moves on
 * each line. Two lenses on the same rows: BY STUDENT (a list, then one
 * student's whole path oldest first) and BY QUESTION (each place in the order
 * the lesson ran). One search box and two chips replace the old selects.
 *
 * Everything shown is already in the deliberation state the Live tab listens
 * to; the moves go through the moderation callable (fn_agoraModerateStatement)
 * and the note callable (fn_agoraTeacherMessage).
 */
export function MessagesPanel(): m.Component<MessagesPanelAttrs> {
	let tab: Tab = 'student';
	let selected: string | null = null;
	let query = '';
	let onlyHidden = false;
	let onlyNews = false;
	let started = false;
	const actions = createWritingActions();

	function chips(hiddenCount: number, newsCount: number): m.Children {
		const chip = (label: string, on: boolean, toggle: () => void): m.Vnode =>
			m(
				'button.mod-reason-chip',
				{
					type: 'button',
					'aria-pressed': String(on),
					class: on ? 'mod-reason-chip--on' : undefined,
					onclick: toggle,
				},
				label,
			);

		return m('.mod-reason-chips', [
			chip(t('teacher.w_chip_hidden', { n: String(hiddenCount) }), onlyHidden, () => {
				onlyHidden = !onlyHidden;
			}),
			tab === 'student' && !selected
				? chip(t('teacher.w_chip_news', { n: String(newsCount) }), onlyNews, () => {
						onlyNews = !onlyNews;
					})
				: null,
		]);
	}

	function tabs(): m.Children {
		const one = (value: Tab, label: string): m.Vnode =>
			m(
				'button.writing-tabs__tab',
				{
					type: 'button',
					role: 'tab',
					'aria-selected': String(tab === value),
					class: tab === value ? 'writing-tabs__tab--on' : undefined,
					onclick: () => {
						tab = value;
						selected = null;
						actions.close();
					},
				},
				label,
			);

		return m('.writing-tabs', { role: 'tablist' }, [
			one('student', t('teacher.w_tab_student')),
			one('question', t('teacher.w_tab_question')),
		]);
	}

	function studentPage(
		uid: string,
		rows: readonly TextRow[],
		removedNames: Record<string, string>,
		attrs: MessagesPanelAttrs,
		questions: ReturnType<typeof planContext>['questions'],
	): m.Children {
		const mine = rowsOfStudent(rows, uid);
		const shown = onlyHidden ? mine.filter((item) => item.hidden) : mine;
		const anonName = mine[0]?.anonName ?? removedNames[uid] ?? '';
		const real = realNameOf(uid);
		const removed = Object.prototype.hasOwnProperty.call(removedNames, uid);

		return m('.writing-page', [
			m(
				'button.btn.btn--sm.btn--ghost',
				{
					type: 'button',
					onclick: () => {
						selected = null;
						actions.close();
					},
				},
				`› ${t('teacher.w_back')}`,
			),
			m('.writing-page__head', [
				m('h3.writing-page__title', [
					m('span.class-panel__name', anonName),
					real ? m('span.class-panel__real', ` · ${real}`) : null,
					removed ? m('span.writing-student__tag', t('teacher.w_removed_tag')) : null,
				]),
				m(
					'button.btn.btn--sm.btn--secondary',
					{ type: 'button', onclick: () => attrs.onMessage(uid) },
					t('teacher.w_dm'),
				),
			]),
			shown.length === 0
				? m(
						'p.home-explanation',
						t(removed ? 'teacher.w_nothing_removed' : 'teacher.w_nothing_found'),
					)
				: rowsWithDividers({
						session: attrs.session,
						rows: shown,
						questions,
						actions,
						showAuthor: false,
						removedUids: attrs.session.removedUids ?? {},
					}),
		]);
	}

	return {
		view(vnode) {
			const attrs = vnode.attrs;
			const { session, participants } = attrs;
			if (!started) {
				started = true;
				if (attrs.focusStudentUid) selected = attrs.focusStudentUid;
				else if (attrs.defaultTab) tab = attrs.defaultTab;
			}
			const state = getDeliberationState();
			const { questions, squareOrder } = planContext(session);
			const removedNames: Record<string, string> = {};
			for (const [uid, entry] of Object.entries(session.removedUids ?? {})) {
				removedNames[uid] = entry.anonName;
			}
			const all = buildTextRows({
				proposals: state.proposals,
				answersByQuestion: state.answersByQuestion,
				suggestions: state.suggestions,
				hiddenOthers: state.hiddenOthers,
				challengeQuestionId: session.challengeQuestionId,
				participants,
				removedUids: Object.keys(removedNames),
				challengerStatementId: session.votingGame?.challengerStatementId,
				questions,
				squareOrder,
			});
			const hiddenCount = all.filter((item) => item.hidden).length;
			const newsCount = new Set(
				all.map((item) => item.authorUid).filter((uid) => unreadRepliesFor(uid) > 0),
			).size;
			const found = searchRows(all, query, realNameOf);
			const visible = onlyHidden ? found.filter((item) => item.hidden) : found;

			let body: m.Children;
			if (tab === 'student' && selected) {
				body = studentPage(selected, query ? found : all, removedNames, attrs, questions);
			} else if (tab === 'student') {
				let students = summarizeStudents(visible, removedNames);
				if (!query && !onlyHidden) students = summarizeStudents(all, removedNames);
				if (onlyNews) students = students.filter((student) => unreadRepliesFor(student.uid) > 0);
				body =
					students.length === 0
						? m(
								'p.home-explanation',
								t(all.length === 0 ? 'teacher.no_messages_yet' : 'teacher.w_nothing_found'),
							)
						: studentList(students, (uid) => {
								selected = uid;
								actions.close();
							});
			} else {
				const groups = groupByQuestion(visible);
				body =
					groups.length === 0
						? m(
								'p.home-explanation',
								t(all.length === 0 ? 'teacher.no_messages_yet' : 'teacher.w_nothing_found'),
							)
						: groups.map((group) =>
								m('section.writing-run', { key: group.key }, [
									m('h4.writing-run__place', placeLabel(group.key, group.rows[0], questions)),
									plainRows({
										session,
										rows: group.rows,
										questions,
										actions,
										showAuthor: true,
										removedUids: session.removedUids ?? {},
									}),
								]),
							);
			}

			return m('.card.stack.messages-panel', [
				tabs(),
				m('input.join__name-input.writing-search', {
					type: 'search',
					value: query,
					placeholder: t('teacher.w_search'),
					'aria-label': t('teacher.w_search'),
					oninput: (event: InputEvent) => {
						query = (event.target as HTMLInputElement).value;
					},
				}),
				chips(hiddenCount, newsCount),
				body,
			]);
		},
	};
}
