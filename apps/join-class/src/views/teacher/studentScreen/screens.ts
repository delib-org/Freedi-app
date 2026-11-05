import m from 'mithril';
import { allowOwnQuestionsOf } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { StudentFrame } from '@/components/StudentFrame';
import { SideSlider } from '@/components/SideSlider';
import { t } from '@/lib/i18n';
import { getChallengeQuestion, getGuidingQuestions, stepLabel } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { gateOf, sideClaimsOf, sideNamesOf, sideQuestionOf } from '@/lib/classroom/classSettings';
import { SIDE_CENTER, campMark } from '@/views/student/c2/c2Helpers';
import { QuestionPick } from '@/views/student/c3/QuestionPick';
import type { PickQuestion } from '@/views/student/c3/QuestionPick';
import { WriteBox } from '@/views/student/c3/WriteBox';
import { TextCard } from '@/views/student/c3/TextCard';
import { RateFaces } from '@/views/student/c3/RateFaces';
import { VoteList } from '@/views/student/c3/VoteList';
import { DecisionCard } from '@/views/student/c3/DecisionCard';
import { SupportBySide } from '@/views/student/c3/SupportBySide';
import {
	SAMPLE_RATING,
	SAMPLE_TABLE_N,
	SAMPLE_TURN,
	SAMPLE_TURN_MAX,
	sampleDraft,
	sampleMates,
	sampleProposals,
	sampleResults,
	sampleSupport,
} from './sampleData';

/**
 * One look-only stand-in per student step, built from the student screens'
 * shared parts (StudentFrame, SideSlider, QuestionPick, WriteBox, TextCard,
 * RateFaces, VoteList, DecisionCard, SupportBySide). They take part in no
 * write, listener or router: every handler is a no-op and every piece of
 * student-made content is a fixed sample (sampleData.ts). The whole sample is
 * `inert` (StudentScreenSample).
 */

const noop = (): void => undefined;

/** The vote stand-in shows the ballot's real state. */
export type SampleBallot = 'waiting' | 'open' | 'paused' | 'closed';

function disabledButton(label: string): m.Vnode {
	return m('button.btn.btn--primary', { type: 'button', disabled: true }, label);
}

function lockIcon(): m.Vnode {
	return m(
		'svg.waiting__icon',
		{ viewBox: '0 0 24 24', width: 48, height: 48, 'aria-hidden': 'true', focusable: 'false' },
		[
			m('rect', {
				x: 5,
				y: 11,
				width: 14,
				height: 9,
				rx: 2,
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 2,
			}),
			m('path', {
				d: 'M8 11V8a4 4 0 0 1 8 0v3',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 2,
			}),
		],
	);
}

export function waitingSample(): m.Children {
	return m(StudentFrame, { headerLine: stepLabel('waiting') }, [
		m('.waiting', [
			lockIcon(),
			m('p.waiting__title', t('step.waiting')),
			m('p.waiting__count', t('opening.waiting_count', { n: sampleMates().length })),
		]),
	]);
}

export function sideSample(main: Statement): m.Children {
	const names = sideNamesOf(main);
	const claims = sideClaimsOf(main);

	return m(
		StudentFrame,
		{
			headerLine: stepLabel('side'),
			instruction: sideQuestionOf(main),
			action: disabledButton(t('side.confirm')),
		},
		m(SideSlider, {
			value: SIDE_CENTER,
			nameA: names.a,
			nameB: names.b,
			claimA: claims.a,
			claimB: claims.b,
			onInput: noop,
		}),
	);
}

function chip(name: string, camp: string, mark: string, isMe: boolean): m.Vnode {
	return m(`li.table-chip.table-chip--${camp}`, { class: isMe ? 'table-chip--me' : '' }, [
		m('span.table-chip__mark', { 'aria-hidden': 'true' }, mark),
		m('span.table-chip__name', isMe ? `${name} ${t('table.you')}` : name),
	]);
}

export function tablesSample(): m.Children {
	return m(
		StudentFrame,
		{ headerLine: t('table.header'), instruction: t('table.go_sit') },
		m('.table-step', [
			m('p.table-step__number', t('table.number', { n: SAMPLE_TABLE_N })),
			m('section.table-step__card', [
				m('h2.table-step__members-title', t('table.members')),
				m(
					'ul.table-step__chips',
					sampleMates().map((mate) => chip(mate.name, mate.camp, campMark(mate.camp), mate.isMe)),
				),
			]),
		]),
	);
}

/** The teacher's real guiding questions, none of them used yet. */
function pickQuestions(): PickQuestion[] {
	return getGuidingQuestions(getSubQuestions())
		.filter((q) => !q.classTable)
		.map((q) => ({
			id: q.statementId,
			text: q.statement,
			hint: q.statementSettings?.hint,
			own: false,
			used: false,
		}));
}

/** Table talk, one fixed moment: the asker picking a question. */
export function tableTalkSample(main: Statement): m.Children {
	const questions = pickQuestions();

	return m(
		StudentFrame,
		{
			headerLine: t('turn.header', { n: SAMPLE_TABLE_N, turn: SAMPLE_TURN, max: SAMPLE_TURN_MAX }),
			instruction: t('turn.instr_pick'),
			action: disabledButton(t('turn.claim')),
		},
		m(
			'.tt',
			m(QuestionPick, {
				questions,
				selectedId: null,
				ownSelected: false,
				ownText: '',
				teacherUsedUp: false,
				noTeacherQuestions: questions.length === 0,
				allowOwn: allowOwnQuestionsOf(main),
				disabled: false,
				onSelect: noop,
				onSelectOwn: noop,
				onOwnText: noop,
			}),
		),
	);
}

/** Proposals, one fixed moment: writing. */
export function proposalsSample(): m.Children {
	const challenge = getChallengeQuestion(getSubQuestions());

	return m(
		StudentFrame,
		{
			headerLine: t('turn.header_proposals', { n: SAMPLE_TABLE_N, step: t('turn.now_write') }),
			instruction: t('turn.instr_write_proposals'),
			ask: challenge?.statement
				? t('proposals.heading', { question: challenge.statement })
				: undefined,
			action: disabledButton(t('proposal.send')),
		},
		m(WriteBox, {
			label: t('proposal.mine'),
			value: sampleDraft(),
			onInput: noop,
			state: 'idle',
			placeholder: t('proposal.placeholder'),
		}),
	);
}

export function allProposalsSample(): m.Children {
	const eyebrow = `${t('proposal.title')} · ${t('table.number', { n: SAMPLE_TABLE_N })}`;

	return m(
		StudentFrame,
		{ headerLine: t('step.allProposals'), instruction: t('allProposals.instruction') },
		m(
			'.all-proposals__board',
			sampleProposals().map((proposal, index) =>
				m(
					'.all-proposals__card',
					{ key: proposal.statementId },
					m(TextCard, {
						eyebrow,
						text: proposal.statement,
						footer: m(RateFaces, {
							value: index === 0 ? SAMPLE_RATING : undefined,
							onRate: noop,
							disabled: true,
						}),
					}),
				),
			),
		),
	);
}

const VOTE_INSTRUCTION: Record<SampleBallot, string> = {
	waiting: 'voting.waiting',
	open: 'voting.pick_one',
	paused: 'voting.paused_hint',
	closed: 'voting.closed_hint',
};

/** The status line under the cards, as on the phones: only a paused or closed vote has one. */
const VOTE_STATUS: Partial<Record<SampleBallot, string>> = {
	paused: 'voting.paused',
	closed: 'voting.closed',
};

/**
 * The vote stand-in follows the lesson's real "who sees the results" switch
 * (`resultsShown`, from `liveResultsOn`): closed, the cards carry no share and no
 * winner, a closed vote reads "Results will be shown soon" and an open or paused
 * one adds the calm "results later" note, exactly as VoteScreen does.
 */
export function voteSample(ballot: SampleBallot, resultsShown: boolean): m.Children {
	const proposals = sampleProposals();
	const standing = ballot === 'paused' || ballot === 'closed';
	const instruction =
		ballot === 'closed' && !resultsShown ? 'voting.closed_hidden' : VOTE_INSTRUCTION[ballot];
	const statusKey = VOTE_STATUS[ballot];

	return m(
		StudentFrame,
		{
			headerLine: t('voting.title'),
			instruction: t(instruction),
			action:
				ballot === 'waiting'
					? null
					: m('p.vote__status', { role: 'status' }, statusKey ? t(statusKey) : ''),
		},
		ballot === 'waiting'
			? null
			: [
					!resultsShown && ballot !== 'closed'
						? m('p.vote__results-later', { role: 'status' }, t('voting.results_later'))
						: null,
					m(VoteList, {
						candidates: proposals,
						selectedId: null,
						locked: standing,
						// the shares are the sample's, never a real count; shown only when the
						// teacher opened the results and the vote stands still
						results: standing && resultsShown ? sampleResults(proposals) : null,
						animateReorder: false,
						winnerId: ballot === 'closed' && resultsShown ? proposals[0].statementId : null,
						onSelect: noop,
					}),
				],
	);
}

/** Closed results on the Summary: the proposals by name and the calm note; no decision, no support. */
function hiddenResults(): m.Vnode {
	return m('section.vote-result', [
		m('h2.vote-result__title', t('summary.vote_results')),
		m(
			'ol.vote-result__rows',
			sampleProposals().map((proposal) =>
				m('li.vote-result__row', { key: proposal.statementId }, [
					m('span.vote-result__text', { dir: 'auto' }, proposal.statement),
				]),
			),
		),
		m('p.vote-result__wait', { role: 'status' }, t('voting.results_later')),
	]);
}

/** A vote is running or done, so closed results hide the decision (the phones' summaryOf rule). */
function resultsHidden(resultsShown: boolean): boolean {
	return !resultsShown && !!getChallengeQuestion(getSubQuestions())?.statementSettings?.ballot;
}

export function summarySample(
	main: Statement,
	resultsShown: boolean,
	supportShown: boolean,
): m.Children {
	const challenge = getChallengeQuestion(getSubQuestions());
	const [decided] = sampleProposals();
	if (resultsHidden(resultsShown)) {
		return m(StudentFrame, { headerLine: t('summary.title') }, hiddenResults());
	}

	return m(StudentFrame, { headerLine: t('summary.title') }, [
		m(DecisionCard, { text: decided.statement, note: t('summary.most_agreed') }),
		m('h2.summary__ask', t('summary.how_much')),
		m(RateFaces, {
			value: SAMPLE_RATING,
			onRate: noop,
			label: t('summary.how_much'),
			disabled: true,
		}),
		supportShown
			? m(SupportBySide, {
					result: sampleSupport(),
					gate: gateOf(challenge, main),
					names: sideNamesOf(main),
				})
			: m('p.summary__support-later', { role: 'status' }, t('summary.support_later')),
	]);
}

/** The ended lesson: the state screen's markup; the sample decision only when the results are open. */
export function endedSample(main: Statement, resultsShown: boolean): m.Children {
	const [decided] = sampleProposals();

	return m(StudentFrame, { headerLine: main.statement }, [
		m('.lesson-state.lesson-state--ended', [
			m('span.lesson-state__mark', [
				m('span.status-mark.status-mark--ended', { 'aria-hidden': 'true' }),
			]),
			m('h1.lesson-state__title', t('lesson.ended.title')),
			m('p.lesson-state__body', t('lesson.ended.body')),
		]),
		resultsHidden(resultsShown) ? null : m(DecisionCard, { text: decided.statement }),
	]);
}
