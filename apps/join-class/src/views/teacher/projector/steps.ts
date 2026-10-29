import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { gateOf, sideClaimsOf, sideNamesOf, sideQuestionOf } from '@/lib/classroom/classSettings';
import { projectorData } from '@/lib/classroom/projectorData';
import { ProjectorQr, QR_WAITING_SIZE } from './ProjectorBand';
import { openingStage } from './OpeningStage';
import { GoalPitch } from './GoalPitch';
// >>> voteSummary BEGIN
import { summaryStage, voteStage } from './VoteStage';
// >>> voteSummary END
// >>> allProposals BEGIN
import { allProposalsStage } from './AllProposalsStage';
// >>> allProposals END
import {
	allTablesRating,
	countTables,
	gateBars,
	readRoundPhase,
	studentsOf,
	supportPercent,
	tableTiles,
	topProposals,
	unseatedNames,
	visibleProposals,
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
	const claims = sideClaimsOf(projectorData.main);
	const own = projectorData.main?.statementSettings?.sideQuestion?.trim();
	const character = (key: 'a' | 'b'): m.Vnode =>
		m(`.projector-character.projector-character--${key}`, [
			m('span.projector-character__circle', { 'aria-hidden': 'true' }, initialOf(names[key])),
			m('span.projector-character__name', names[key]),
			claims[key] ? m('p.projector-character__claim', { dir: 'auto' }, claims[key]) : null,
		]);

	return m('section.projector-step.projector-step--side', [
		// the teacher's question, else the projector's own wording of the default
		m(
			'h1.projector-instruction',
			{ dir: 'auto' },
			own ? sideQuestionOf(projectorData.main) : t('projector.sideQuestion'),
		),
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
		m(GoalPitch, {
			options,
			gate,
			lessonKey: `${projectorData.main?.statementId ?? ''}/${challenge?.statementId ?? ''}`,
		}),
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

const RENDERERS: Record<LessonStepKey, (ctx: StepContext) => m.Vnode> = {
	waiting,
	opening,
	side,
	tables,
	tableTalk,
	proposals,
	// >>> voteSummary BEGIN
	vote: voteStage,
	summary: summaryStage,
	// >>> voteSummary END
	// >>> allProposals BEGIN
	allProposals: allProposalsStage,
	// >>> allProposals END
};

export function renderStep(key: LessonStepKey, ctx: StepContext): m.Vnode {
	return RENDERERS[key](ctx);
}
