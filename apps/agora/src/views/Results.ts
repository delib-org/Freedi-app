import m from 'mithril';
import { t, tCount } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import { VideoScene } from '../components/VideoScene';
import { formatPoints } from '../components/PointsPill';
import { getDeliberationState, listenToDeliberation } from '../lib/proposals';
import { getCampCensus, getSessionState } from '../lib/session';
import { ResultsBoard } from '../components/ResultsBoard';
import { HelpersBoard } from '../components/HelpersBoard';
import { Icon } from '../components/Icon';
import {
	AgoraParticipant,
	AgoraSceneKind,
	AgoraSession,
	AgoraSessionOutcome,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
} from '@freedi/shared-types';

export interface ResultsAttrs {
	session: AgoraSession;
	topic: AgoraTopicPackage;
	/** The student's own ledger — absent for spectators and old callers */
	myParticipant?: AgoraParticipant | null;
}

interface MyStory {
	ideasWoven: number;
	ideasAdopted: number;
	classmatesHelped: number;
	voicesWovenIn: number;
}

/**
 * What the student actually DID, counted from the suggestions still in the
 * local deliberation state. Numbers alone ("helping: 5") mean nothing to a
 * teenager; "three classmates' ideas are in your text" is the sentence that
 * lands, and it is the one the collaborative design wants remembered.
 */
function readMyStory(userId: string): MyStory {
	const { proposals, suggestions } = getDeliberationState();
	const mine = new Set(
		proposals.filter((proposal) => proposal.creatorId === userId).map((p) => p.statementId),
	);
	const all = Object.values(suggestions).flat();

	const authored = all.filter((suggestion) => suggestion.creatorId === userId);
	const received = all.filter(
		(suggestion) => mine.has(suggestion.parentId) && suggestion.creatorId !== userId,
	);

	return {
		ideasWoven: authored.filter((s) => s.suggestionStatus === AgoraSuggestionStatus.implemented)
			.length,
		ideasAdopted: authored.filter((s) => s.suggestionStatus === AgoraSuggestionStatus.accepted)
			.length,
		classmatesHelped: new Set(authored.map((s) => s.parentId)).size,
		voicesWovenIn: new Set(
			received
				.filter((s) => s.suggestionStatus === AgoraSuggestionStatus.implemented)
				.map((s) => s.creatorId),
		).size,
	};
}

/**
 * The student's private ledger. The game shouts "+1!" and "+2!" all lesson
 * and then, until now, never showed anyone their own total — announced points
 * with no accounting read as play money and quietly devalue every
 * celebration. Deliberately framed as a contribution to the CLASS score
 * (which averages everyone's points), and deliberately shows only your own
 * numbers: no ranking, no comparison, nothing to lose by reading it.
 */
function myJourneyCard(participant: AgoraParticipant): m.Children {
	const points = participant.points;
	const story = readMyStory(participant.userId);
	const parts: Array<{ value: number; label: string }> = [
		{ value: points.helping, label: t('results.my_helping') },
		{ value: points.rating ?? 0, label: t('results.my_rating') },
		{ value: points.proposals, label: t('results.my_proposals') },
		{ value: points.valueAccuracy, label: t('results.my_values') },
	];

	return m('.card.results__mine', [
		m('p.teacher__section-title', t('results.my_journey')),
		m('.results__total.results__total--mine', formatPoints(points.total)),
		m('p.results__outcome-label', t('results.my_total_label')),
		m(
			'.results__breakdown',
			parts.map((part, index) =>
				m('.results__part', { key: index }, [
					m('span.results__part-value', formatPoints(part.value)),
					m('span.results__part-label', part.label),
				]),
			),
		),
		// The sentences that carry the collaboration message home
		m('ul.results__story', [
			story.ideasWoven > 0 ? m('li', tCount('results.story_woven', story.ideasWoven)) : null,
			story.ideasAdopted > 0 ? m('li', tCount('results.story_adopted', story.ideasAdopted)) : null,
			story.classmatesHelped > 0
				? m('li', tCount('results.story_helped', story.classmatesHelped))
				: null,
			story.voicesWovenIn > 0 ? m('li', tCount('results.story_voices', story.voicesWovenIn)) : null,
		]),
		m('p.results__mine-note', t('results.my_contribution_note')),
	]);
}

function metricBar(
	label: string,
	min: number,
	max: number,
	baseline: number,
	value: number,
	narrative: string,
	higherIsBetter: boolean,
): m.Children {
	const span = Math.max(1, max - min);
	const baseFraction = (baseline - min) / span;
	const valueFraction = (value - min) / span;
	const improved = higherIsBetter ? value >= baseline : value <= baseline;

	return m('.metric', [
		m('.metric__head', [
			m('span.metric__label', label),
			m(
				'span.metric__delta',
				{ class: improved ? 'metric__delta--up' : 'metric__delta--down' },
				`${baseline} → ${value}`,
			),
		]),
		m('.metric__track', [
			m('.metric__baseline', { style: { insetInlineStart: `${baseFraction * 100}%` } }),
			m('.metric__fill', {
				class: improved ? undefined : 'metric__fill--down',
				style: { width: `${valueFraction * 100}%` },
			}),
		]),
		narrative ? m('p.metric__narrative', narrative) : null,
	]);
}

/** The recap's two halves — how the PROPOSALS did, and how the PEOPLE did */
type ResultsTab = 'class' | 'helpers';

/**
 * The results + ending stage: the map transforms with the simulated fate
 * of the realm, the class score breaks down, and the success/failure
 * ending scene plays.
 *
 * A closure, not a plain component, because the switch between the two halves
 * is state that has to survive a redraw — and there are a lot of them here,
 * one per rating that lands while the recap is open.
 */
export const Results: m.ClosureComponent<ResultsAttrs> = () => {
	let tab: ResultsTab = 'class';

	/**
	 * The door between the recap's two halves.
	 *
	 * They answer the same question about different subjects — the class map
	 * ranks PROPOSALS, the helpers board ranks PEOPLE — and stacking them made
	 * the second one the thing you reach by scrolling past the first, which is
	 * exactly the half that belongs to the students who spent the lesson
	 * improving somebody else's text.
	 */
	function tabButton(kind: ResultsTab, label: string, icon: 'chart' | 'helped', count?: number) {
		return m(
			'button.results__switch-btn',
			{
				type: 'button',
				role: 'tab',
				'aria-selected': String(tab === kind),
				onclick: () => {
					tab = kind;
				},
			},
			[
				m(Icon, { name: icon, size: 18 }),
				m('span', label),
				count !== undefined && count > 0
					? m('span.results__switch-count', { 'aria-hidden': 'true' }, String(count))
					: null,
			],
		);
	}

	return {
		view(vnode) {
			const { session, topic, myParticipant } = vnode.attrs;
			const score = session.classScore;

			// The deliberation view tears its listeners down on unmount, so by the
			// time we get here the suggestions that make up "your journey" are
			// gone. Re-attach (idempotent per session+user) — the recap is the one
			// screen allowed to total the lesson up, and it must not be blank.
			if (myParticipant) listenToDeliberation(session.sessionId, myParticipant.userId);

			if (!score) {
				return m('.shell.shell--wide', [
					m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
						m(EraMap, { participants: [] }),
						m('.spinner'),
						m('p.lobby__status.lobby__waiting-dots.text-center', t('results.computing')),
					]),
				]);
			}

			const participants = getSessionState().participants;
			const thanks = participants.reduce((sum, participant) => sum + participant.points.helping, 0);

			// Sessions computed before the three-way outcome existed fall back on
			// the boolean
			const outcome =
				score.outcome ??
				(score.success ? AgoraSessionOutcome.success : AgoraSessionOutcome.collapse);

			const endingKind =
				outcome === AgoraSessionOutcome.success
					? AgoraSceneKind.successEnding
					: outcome === AgoraSessionOutcome.honestDisagreement
						? AgoraSceneKind.honestDisagreementEnding
						: AgoraSceneKind.failureEnding;
			// Old topic packages lack the honest-disagreement scene — fall back to
			// the failure scene text while keeping the dignified framing around it
			const endingScene =
				topic.scenes.find((scene) => scene.kind === endingKind) ??
				topic.scenes.find((scene) => scene.kind === AgoraSceneKind.failureEnding);

			const mood =
				outcome === AgoraSessionOutcome.success
					? ('prosperous' as const)
					: outcome === AgoraSessionOutcome.honestDisagreement
						? ('dusk' as const)
						: ('ruined' as const);
			const totalClass =
				outcome === AgoraSessionOutcome.success
					? 'results__total--success'
					: outcome === AgoraSessionOutcome.honestDisagreement
						? 'results__total--honest'
						: 'results__total--failure';
			const outcomeLabel =
				outcome === AgoraSessionOutcome.success
					? t('results.outcome_success')
					: outcome === AgoraSessionOutcome.honestDisagreement
						? t('results.outcome_honest')
						: t('results.outcome_collapse');
			const debrief = score.debrief;
			const showFullDebrief = outcome !== AgoraSessionOutcome.success;

			/** How the PROPOSALS did — the class map and everything hung off it */
			const classHalf: m.Children = [
				// Mine first: the student reads their own story, then sees the
				// class outcome their points fed into
				myParticipant ? myJourneyCard(myParticipant) : null,

				m('.card.results__score-panel', [
					m('p.teacher__section-title', t('results.class_score')),
					m('.results__total', { class: totalClass }, `${score.total}/100`),
					m('p.results__outcome-label', outcomeLabel),
					// The class score depends on how much of the class actually
					// rated the leading proposal, so the coverage is published
					// with it rather than left implicit in the number.
					score.leadCoverage
						? m(
								'p.results__coverage',
								t('picture.coverage', {
									n: String(score.leadCoverage.rated),
									total: String(score.leadCoverage.eligible),
								}),
							)
						: null,
					m('.results__breakdown', [
						m('.results__part', [
							m('span.results__part-value', String(score.maxConsensus)),
							m('span.results__part-label', t('results.max_consensus')),
						]),
						m('.results__part', [
							m('span.results__part-value', String(score.personalPointsSum)),
							m('span.results__part-label', t('results.personal_points')),
						]),
						m('.results__part', [
							m('span.results__part-value', String(score.avgPlausibility)),
							m('span.results__part-label', t('results.plausibility')),
						]),
					]),
				]),

				// The scoreboard the lesson has been playing toward: every proposal
				// ranked by the class consensus on one -100%…+100% axis, the winner
				// crowned, your own marked wherever it landed, and the arithmetic
				// behind any score one press away. Its helping-hands section is off
				// here — that half of the lesson has its own place now, behind the
				// switch above, and printing it twice on one screen said the same
				// thing quieter both times.
				m('.card.stack', [
					m(ResultsBoard, {
						sessionId: session.sessionId,
						topic,
						proposals: getDeliberationState().proposals,
						scores: getDeliberationState().scores,
						census: getCampCensus(),
						participants,
						userId: myParticipant?.userId,
						leadStatementId: score.leadStatementId,
						finale: true,
						helpers: false,
					}),
				]),

				m('.card.stack', [
					m('p.teacher__section-title', t('results.health_title')),
					...topic.healthMetrics.map((metric) => {
						const metricOutcome = score.healthMetricOutcomes.find(
							(candidate) => candidate.metricId === metric.metricId,
						);

						return metricBar(
							metric.label,
							metric.min,
							metric.max,
							metric.baseline,
							metricOutcome?.value ?? metric.baseline,
							metricOutcome?.narrative ?? '',
							metric.higherIsBetter ?? true,
						);
					}),
				]),

				debrief &&
				(debrief.whatWentWell.length > 0 ||
					debrief.whatToTryNextTime.length > 0 ||
					debrief.encouragement)
					? m('.card.stack.results__debrief', [
							m('p.teacher__section-title', t('results.debrief_title')),
							showFullDebrief && debrief.whatWentWell.length > 0
								? m('.stack', [
										m('p.results__debrief-heading', t('results.went_well')),
										m(
											'ul.results__debrief-list',
											debrief.whatWentWell.map((entry, index) => m('li', { key: index }, entry)),
										),
									])
								: null,
							debrief.whatToTryNextTime.length > 0
								? m('.stack', [
										m('p.results__debrief-heading', t('results.try_next')),
										m(
											'ul.results__debrief-list',
											debrief.whatToTryNextTime.map((entry, index) =>
												m('li', { key: index }, entry),
											),
										),
									])
								: null,
							showFullDebrief && debrief.encouragement
								? m('p.results__debrief-encouragement', debrief.encouragement)
								: null,
						])
					: null,

				endingScene
					? m(VideoScene, {
							scene: endingScene,
							doneLabel: t('scene.continue'),
							onDone: () => {
								/* final scene — nothing further */
							},
						})
					: null,
			];

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m(EraMap, {
						participants: [],
						mood,
					}),

					m('.results__switch', { role: 'tablist', 'aria-label': t('results.switch_aria') }, [
						tabButton('class', t('results.tab_class'), 'chart'),
						tabButton('helpers', t('results.tab_helpers'), 'helped', thanks),
					]),

					tab === 'helpers'
						? m(HelpersBoard, { participants, userId: myParticipant?.userId })
						: classHalf,
				]),
			]);
		},
	};
};
