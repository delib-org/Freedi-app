import m from 'mithril';
import { noDeviceCountOf, studentCountOf, type Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { currentUid } from '@/lib/classroom/c3Data';
import { setMyDecisionSupport } from '@/lib/classroom/studentWrites';
import { gateOf, sideNamesOf } from '@/lib/classroom/classSettings';
import { summaryOf } from '@/lib/classroom/voteSummary';
import { liveResultsOn, supportVisibleToClass } from '@/lib/classroom/voteResults';
import { DecisionCard } from './DecisionCard';
import { ErrorLine } from './ErrorLine';
import { FlowFeed } from './FlowFeed';
import { RateFaces } from './RateFaces';
import { SupportBySide } from './SupportBySide';
import { supportForScreen } from '@/lib/classroom/registrationSupport';
import { VoteResults } from './VoteResults';

export interface SummaryScreenAttrs {
	main: Statement;
}

class SummaryState {
	feed = new FlowFeed();
	pending: number | undefined;
	error: string | null = null;
}

/**
 * The summary (UX §2.9 + §11, IA 20): the vote's result first (the decision
 * and the votes per proposal, or "still open" while the vote runs), then, once
 * there is a decision, "How much do you support the proposal?" on the five
 * faces, three bars of mean support by the side each student picked in the
 * Side step (with one sentence saying what they mean), and one verdict line.
 */
export const SummaryScreen: m.ClassComponent<SummaryScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: SummaryState }).self = new SummaryState();
	},

	onremove(vnode) {
		(vnode.state as { self?: SummaryState }).self?.feed.stop();
	},

	view(vnode) {
		const self = (vnode.state as { self?: SummaryState }).self as SummaryState;
		const { main } = vnode.attrs;
		const challenge = getChallengeQuestion(getSubQuestions());
		self.feed.sync(main, main.statementId, null, [], false);
		// The class size from the server: a phone may not read the class's subscriptions (Trello sN881XCU).
		const students = studentCountOf(main);
		const summary = summaryOf({
			ballot: challenge?.statementSettings?.ballot ?? null,
			selections: challenge?.selections,
			proposals: self.feed.options,
			present: (students ?? 0) + noDeviceCountOf(main),
			resultsShown: liveResultsOn(challenge),
		});
		const mine = self.pending ?? classState.mySide?.decisionSupport;
		const shared = supportVisibleToClass(challenge);
		// Totals from the server (the sides are private), only when the teacher shared them.
		const registered = supportForScreen(main, main.statementId, shared);
		const rate = (score: number): void => {
			self.pending = score;
			self.error = null;
			setMyDecisionSupport(main.statementId, score)
				.catch(() => {
					self.pending = undefined;
					self.error = t('summary.support_failed');
				})
				.finally(() => m.redraw());
		};

		const decided = summary.kind === 'none' || summary.kind === 'closed';
		const note = summary.mostAgreed
			? t('summary.most_agreed')
			: summary.tie
				? t('summary.tie_by_ratings')
				: null;

		return m(StudentFrame, { headerLine: t('summary.title') }, [
			summary.kind === 'none' ? m('p.summary__no-vote', t('summary.no_vote')) : null,
			decided && summary.decisionText
				? m(DecisionCard, {
						text: summary.decisionText,
						note: summary.kind === 'none' ? note : null,
					})
				: null,
			m(VoteResults, {
				summary,
				proposals: self.feed.options,
				uid: currentUid(),
				turnoutShown: students !== null,
			}),
			summary.showSupport
				? [
						m('h2.summary__ask', { id: 'summary-ask' }, t('summary.how_much')),
						m(RateFaces, {
							value: mine,
							onRate: rate,
							label: t('summary.how_much'),
							testPrefix: 'support-face',
						}),
						m(ErrorLine, { message: self.error }),
						shared && registered.kind === 'ready'
							? m(SupportBySide, {
									result: registered.result,
									gate: gateOf(challenge, main),
									names: registered.names ?? sideNamesOf(main),
								})
							: m('p.summary__support-later', { role: 'status' }, t('summary.support_later')),
					]
				: null,
		]);
	},
};
