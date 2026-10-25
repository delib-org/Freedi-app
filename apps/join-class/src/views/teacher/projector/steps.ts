import m from 'mithril';
import { supportBySide } from '@freedi/shared-types';
import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { gateOf, sideNamesOf } from '@/lib/classroom/classSettings';
import { projectorData } from '@/lib/classroom/projectorData';
import { ProjectorQr, QR_WAITING_SIZE } from './ProjectorBand';
import { openingStage } from './OpeningStage';
import { GateStage } from './GateStage';
import { ballotOptions, gateView } from './gateLogic';
import {
	allTablesRating,
	countTables,
	gateBars,
	readBallot,
	readRoundPhase,
	studentsOf,
	supportPercent,
	tableTiles,
	tallyBars,
	topProposals,
	unseatedNames,
	visibleProposals,
	voteStatus,
} from './projectorLogic';

/** One renderer per lesson step: the ONE thing the class needs to see (UX section 6). */

export interface StepContext {
	code: string | undefined;
	joinUrl: string | undefined;
}

function barStyle(percent: number): Record<string, string> {
	return { '--bar': `${percent}%` };
}

function initialOf(name: string): string {
	return Array.from(name)[0] ?? '';
}

// ---- steps ------------------------------------------------------------------

function waiting(ctx: StepContext): m.Vnode {
	const count = studentsOf(classState.roster, projectorData.main?.creatorId).length;

	return m('section.projector-step.projector-step--waiting', [
		ctx.code ? m('p.projector-code', { dir: 'ltr' }, ctx.code) : null,
		ctx.joinUrl ? m(ProjectorQr, { url: ctx.joinUrl, size: QR_WAITING_SIZE }) : null,
		m('p.projector-count', { 'aria-live': 'polite' }, t('projector.inClass', { n: count })),
	]);
}

function opening(): m.Vnode {
	return openingStage();
}

function side(): m.Vnode {
	const names = sideNamesOf(projectorData.main);
	const character = (key: 'a' | 'b'): m.Vnode =>
		m(`.projector-character.projector-character--${key}`, [
			m('span.projector-character__circle', { 'aria-hidden': 'true' }, initialOf(names[key])),
			m('span.projector-character__name', names[key]),
		]);

	return m('section.projector-step.projector-step--side', [
		m('h1.projector-instruction', t('projector.sideQuestion')),
		m('.projector-characters', [
			character('a'),
			m('span.projector-center', t('projector.center')),
			character('b'),
		]),
	]);
}

function tables(): m.Vnode {
	const teacherId = projectorData.main?.creatorId;
	const tiles = tableTiles(classState.tables, classState.roster);
	const loose = unseatedNames(classState.roster, teacherId);

	return m('section.projector-step.projector-step--tables', [
		m(
			'ol.projector-grid',
			tiles.map((tile) =>
				m('li.projector-tile', { key: tile.n }, [
					m('h2.projector-tile__title', t('projector.table', { n: tile.n })),
					m('p.projector-tile__names', tile.names.join(' · ')),
				]),
			),
		),
		loose.length > 0
			? m('p.projector-loose', [m('strong', t('projector.noTable')), ' ', loose.join(' · ')])
			: null,
	]);
}

function tableTalk(): m.Vnode {
	const counts = countTables(classState.tables);
	const tile = (value: number, label: string): m.Vnode =>
		m('li.projector-count-tile', [
			m('span.projector-count-tile__value', value),
			m('span.projector-count-tile__label', label),
		]);
	const tiles = allTablesRating(counts)
		? [tile(counts.rating, t('projector.rating'))]
		: [
				tile(counts.picking, t('projector.picking')),
				tile(counts.talking, t('projector.talking')),
				tile(counts.writing, t('projector.writing')),
				tile(counts.rating, t('projector.rating')),
			];

	return m('section.projector-step.projector-step--table-talk', [
		m(
			'h1.projector-instruction',
			t(counts.tables === 1 ? 'projector.tablesCountOne' : 'projector.tablesCount', {
				n: counts.tables,
			}),
		),
		m('ul.projector-count-tiles', tiles),
	]);
}

function proposals(): m.Vnode {
	const challenge = projectorData.challenge;
	const options = visibleProposals(projectorData.proposals);
	if (readRoundPhase(challenge) === 'improve') return plenum(options);
	const gate = gateOf(challenge, projectorData.main);

	return m('section.projector-step.projector-step--proposals', [
		challenge?.statement
			? m(
					'h2.projector-ask',
					{ dir: 'auto', 'data-testid': 'projector-ask' },
					t('proposals.heading', { question: challenge.statement }),
				)
			: null,
		m(
			'h1.projector-instruction',
			t(options.length === 1 ? 'projector.proposalsSentOne' : 'projector.proposalsSent', {
				n: options.length,
			}),
		),
		m(GateStage, { view: gateView(options, gate), showWaiting: false }),
		m(
			'ul.projector-gate-bars',
			gateBars(options, gate).map((bar) =>
				m(
					`li.projector-gate-bar${bar.passed ? '.projector-gate-bar--passed' : ''}`,
					{ key: bar.id },
					[
						m('span.projector-gate-bar__text', bar.text),
						m('span.projector-gate-bar__track', { style: { ...barStyle(bar.percent) } }, [
							m('span.projector-gate-bar__fill'),
							m('span.projector-gate-bar__gate', {
								style: { '--gate': `${supportPercent(gate)}%` },
							}),
						]),
						m(
							'span.projector-gate-bar__state',
							bar.passed ? t('projector.passed') : t('projector.below'),
						),
					],
				),
			),
		),
	]);
}

function plenum(options: ReturnType<typeof visibleProposals>): m.Vnode {
	return m('section.projector-step.projector-step--plenum', [
		m('h1.projector-instruction', t('projector.topProposals')),
		m(
			'ol.projector-top',
			topProposals(options).map((option, index) =>
				m('li.projector-top__card', { key: option.statementId }, [
					m('span.projector-top__rank', index + 1),
					m('span.projector-top__text', option.statement),
				]),
			),
		),
	]);
}

function vote(): m.Vnode {
	const challenge = projectorData.challenge;
	const ballot = readBallot(challenge);
	const selections = challenge?.selections as Record<string, number> | undefined;
	const bars = ballot ? tallyBars(ballot.candidateIds, selections, projectorData.proposals) : [];

	const candidates = ballot ? ballotOptions(ballot.candidateIds, projectorData.proposals) : [];
	const gate = gateOf(challenge, projectorData.main);
	const status = voteStatus(ballot);

	return m('section.projector-step.projector-step--vote', [
		m('h1.projector-instruction', t('projector.voteTitle')),
		status === 'open'
			? null
			: m(
					'p.projector-vote-status',
					{ role: 'status', 'data-status': status },
					t(status === 'paused' ? 'voting.paused' : 'voting.closed'),
				),
		candidates.length > 0
			? m(GateStage, { view: gateView(candidates, gate), showWaiting: true })
			: null,
		bars.length === 0
			? m('p.projector-empty', t('projector.noBallot'))
			: m(
					'ul.projector-tally',
					bars.map((bar) =>
						m('li.projector-tally__row', { key: bar.id }, [
							m('span.projector-tally__text', bar.text),
							m('span.projector-tally__track', { style: barStyle(bar.percent) }, [
								m('span.projector-tally__fill'),
							]),
							m('span.projector-tally__count', bar.count),
						]),
					),
				),
	]);
}

function summary(): m.Vnode {
	const challenge = projectorData.challenge;
	const ballot = readBallot(challenge);
	const decision = projectorData.proposals.find((o) => o.statementId === ballot?.decisionId);
	const names = sideNamesOf(projectorData.main);
	const support = supportBySide(
		studentsOf(classState.roster, projectorData.main?.creatorId),
		gateOf(challenge, projectorData.main),
	);
	const rows = [
		{ key: 'a', label: names.a, camp: support.a },
		{ key: 'center', label: t('projector.center'), camp: support.center },
		{ key: 'b', label: names.b, camp: support.b },
	];

	return m('section.projector-step.projector-step--summary', [
		m('.projector-decision', [
			m('p.projector-eyebrow', t('projector.decision')),
			m('p.projector-decision__text', decision?.statement ?? t('projector.noDecision')),
		]),
		m(
			'ul.projector-support',
			{ 'aria-label': t('projector.supportTitle') },
			rows.map((row) =>
				m(`li.projector-support__row.projector-support__row--${row.key}`, { key: row.key }, [
					m('span.projector-support__label', row.label),
					m(
						'span.projector-support__track',
						{ style: barStyle(supportBarPercent(row.camp.mean, row.camp.n)) },
						[m('span.projector-support__fill')],
					),
					m('span.projector-support__n', t('projector.rated', { n: row.camp.n, m: row.camp.m })),
				]),
			),
		),
		m(
			`p.projector-verdict.projector-verdict--${support.verdict}`,
			t(`projector.verdict.${support.verdict}`),
		),
	]);
}

function supportBarPercent(mean: number, n: number): number {
	return n === 0 ? 0 : supportPercent(mean);
}

const RENDERERS: Record<LessonStepKey, (ctx: StepContext) => m.Vnode> = {
	waiting,
	opening,
	side,
	tables,
	tableTalk,
	proposals,
	vote,
	summary,
};

export function renderStep(key: LessonStepKey, ctx: StepContext): m.Vnode {
	return RENDERERS[key](ctx);
}
