import m from 'mithril';
import '@/styles/student-state.scss';
import { Collections } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion, lessonStepOf, stepLabel } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { db, doc, getDoc } from '@/lib/firebase';
import { DecisionCard } from './c3/DecisionCard';

/**
 * A student's whole screen while the lesson is paused or ended (IA 13.6, UX
 * 13.F). Calm and without controls: the same paper and centred composition as
 * "waiting for the teacher", an ink-soft mark, words about the teacher and not
 * about a problem. An unsent draft is kept by the write boxes on the device, so
 * it is back when the step returns. The screen changes by itself on "resume" or
 * "reopen". An ended lesson shows the decision when there is one.
 */

export type StateStatus = 'paused' | 'ended';

export interface LessonStateAttrs {
	status: StateStatus;
	main: Statement;
}

interface DecisionCache {
	id: string;
	text: string | null;
	loading: boolean;
}

let decision: DecisionCache | null = null;

/** The decided proposal's text, fetched once per decision (a get, not a listener). */
function decisionText(): string | null {
	const id = getChallengeQuestion(getSubQuestions())?.statementSettings?.ballot?.decisionId;
	if (!id) return null;
	if (decision?.id === id) return decision.text;
	const cache: DecisionCache = { id, text: null, loading: true };
	decision = cache;
	getDoc(doc(db, Collections.statements, id))
		.then((snap) => {
			cache.text = snap.exists() ? ((snap.data() as Statement).statement ?? null) : null;
		})
		.catch((err: unknown) => {
			console.error('[LessonState] reading the decision failed:', err);
		})
		.finally(() => {
			cache.loading = false;
			m.redraw();
		});

	return null;
}

function focusTitle(vnode: m.VnodeDOM): void {
	(vnode.dom as HTMLElement).focus();
}

export const LessonStateScreen: m.Component<LessonStateAttrs> = {
	view({ attrs }) {
		const { status, main } = attrs;
		const ended = status === 'ended';
		const text = ended ? decisionText() : null;
		const headerLine = ended
			? main.statement
			: stepLabel(lessonStepOf(main.statementSettings?.lessonPlan).key);

		return m(StudentFrame, { headerLine }, [
			m('.lesson-state', { class: `lesson-state--${status}`, role: 'status' }, [
				m('span.lesson-state__mark', [
					m('span.status-mark', { class: `status-mark--${status}`, 'aria-hidden': 'true' }),
				]),
				m(
					'h1.lesson-state__title',
					{ tabindex: '-1', oncreate: focusTitle },
					t(ended ? 'lesson.ended.title' : 'lesson.paused.title'),
				),
				m('p.lesson-state__body', t(ended ? 'lesson.ended.body' : 'lesson.paused.body')),
			]),
			text ? m(DecisionCard, { text }) : null,
		]);
	},
};
