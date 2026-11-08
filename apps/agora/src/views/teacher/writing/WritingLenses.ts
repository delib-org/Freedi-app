import m from 'mithril';
import { t } from '../../../lib/i18n';
import type { QuestionRef, TextRow } from '../../../lib/flows/moderationQueue';
import { quote } from '../../../lib/flows/writingContext';
import { runsOf, type StudentSummary } from '../../../lib/flows/writingGroups';
import { realNameOf, unreadRepliesFor } from '../../../lib/teacherConsole';
import { formatMessageTime } from '../../ThreadChat';
import type { AgoraSession } from '@freedi/shared-types';
import { WritingRow } from './WritingRow';
import type { WritingActions } from './WritingActions';

/** What a divider says about where the next lines were written */
export function placeLabel(
	contextKey: string,
	sample: TextRow | undefined,
	questions: readonly QuestionRef[],
): string {
	if (contextKey === 'square') return t('teacher.w_square');
	if (contextKey.startsWith('q:')) {
		const question = questions.find((candidate) => `q:${candidate.id}` === contextKey);
		if (!question) return t('teacher.w_question_unknown');

		return question.title
			? t('teacher.w_question', { n: String(question.number), title: question.title })
			: t('teacher.w_question_n', { n: String(question.number) });
	}

	return sample?.proposalText
		? t('teacher.w_on_proposal', { text: quote(sample.proposalText) })
		: t('teacher.w_on_proposal_gone');
}

export interface RowsAttrs {
	session: AgoraSession;
	rows: readonly TextRow[];
	questions: readonly QuestionRef[];
	actions: WritingActions;
	showAuthor: boolean;
	removedUids: Readonly<Record<string, unknown>>;
}

/** The rows alone, under a header the caller already drew */
export function plainRows(attrs: RowsAttrs): m.Children {
	return attrs.rows.map((item) =>
		m(WritingRow, {
			key: item.statementId,
			session: attrs.session,
			item,
			actions: attrs.actions,
			showAuthor: attrs.showAuthor,
			removed: Object.prototype.hasOwnProperty.call(attrs.removedUids, item.authorUid),
		}),
	);
}

/** Rows with a place divider above every run that shares one */
export function rowsWithDividers(attrs: RowsAttrs): m.Children {
	return runsOf(attrs.rows).map((run) =>
		m('section.writing-run', { key: `${run.contextKey}:${run.first.statementId}` }, [
			m('h4.writing-run__place', placeLabel(run.contextKey, run.first, attrs.questions)),
			plainRows({ ...attrs, rows: run.rows }),
		]),
	);
}

/** The list of students: tap one to open their page */
export function studentList(
	students: readonly StudentSummary[],
	onOpen: (uid: string) => void,
): m.Children {
	return m(
		'ul.writing-students',
		students.map((student) => {
			const real = realNameOf(student.uid);
			const news = unreadRepliesFor(student.uid);

			return m(
				'li.writing-students__item',
				{
					key: student.uid,
					class: student.removed ? 'writing-students__item--removed' : undefined,
				},
				m('button.writing-student', { type: 'button', onclick: () => onOpen(student.uid) }, [
					m('span.writing-student__name', [
						m('span.class-panel__name', student.anonName),
						real ? m('span.class-panel__real', ` · ${real}`) : null,
						student.removed ? m('span.writing-student__tag', t('teacher.w_removed_tag')) : null,
					]),
					m('span.writing-student__facts', [
						m('span', t('teacher.w_count', { n: String(student.count) })),
						student.lastAt > 0
							? m('span', t('teacher.w_last', { when: formatMessageTime(student.lastAt) }))
							: null,
						student.hiddenCount > 0
							? m(
									'span.writing-student__flag',
									t('teacher.w_hidden_n', { n: String(student.hiddenCount) }),
								)
							: null,
						news > 0 ? m('span.writing-student__news', t('teacher.w_news_one')) : null,
					]),
					m('span.writing-student__chev', { 'aria-hidden': 'true' }, '‹'),
				]),
			);
		}),
	);
}
