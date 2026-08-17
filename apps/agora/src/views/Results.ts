import m from 'mithril';
import { t, tCount } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import { VideoScene } from '../components/VideoScene';
import { formatPoints } from '../components/PointsPill';
import { getDeliberationState, isSuggestionKind, listenToDeliberation } from '../lib/proposals';
import { Icon, iconLabel, type IconName } from '../components/Icon';
import { getConsensusPool, getSessionState } from '../lib/session';
import { ResultsBoard } from '../components/ResultsBoard';
import { HelpersBoard } from '../components/HelpersBoard';
import { countThanks, ResultsSwitch, type ResultsTab } from '../components/ResultsSwitch';
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
	ideasLanded: number;
	classmatesHelped: number;
	voicesWovenIn: number;
}

/**
 * The statuses that mean "this idea really helped". The 🙏 thank-you is the
 * live attestation; accepted/implemented survive only on old sessions. The
 * old counters here read implemented/accepted EXCLUSIVELY, which nothing has
 * written since the thank became the answer — so the story lines were
 * permanently zero and only "you helped N proposals" ever rendered.
 */
const LANDED_STATUSES: ReadonlySet<string> = new Set([
	AgoraSuggestionStatus.thanked,
	AgoraSuggestionStatus.accepted,
	AgoraSuggestionStatus.implemented,
]);

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
		ideasLanded: authored.filter((s) => LANDED_STATUSES.has(s.suggestionStatus ?? '')).length,
		classmatesHelped: new Set(authored.map((s) => s.parentId)).size,
		voicesWovenIn: new Set(
			received.filter((s) => LANDED_STATUSES.has(s.suggestionStatus ?? '')).map((s) => s.creatorId),
		).size,
	};
}

/**
 * "Your proposal traveled 41 → 68": the whole revision journey as one
 * retrospective sentence — the finale is where the per-version numbers are
 * safe to say out loud (nothing left to fixate on mid-lesson).
 */
function journeyLine(userId: string): m.Children {
	const { proposals, scores } = getDeliberationState();
	const mine = proposals.find((proposal) => proposal.creatorId === userId);
	if (!mine) return null;
	const score = scores[mine.statementId];
	const history = score?.editHistory ?? [];
	if (history.length === 0) return null;
	const from = Math.round(history[0].bridgingAtEdit);
	const to = Math.round(score?.bridgingScore ?? 0);
	if (from === to) return null;

	return m(
		'p.results__journey',
		iconLabel(
			'trend',
			t('results.journey_traveled', { range: `⁦${from} → ${to}⁩`, n: history.length + 1 }),
		),
	);
}

/**
 * The private forward look: one optional "what would you change next time?"
 * box. Stored locally, shown to nobody — a reflection scaffold, not data.
 */
function reflectionBox(sessionId: string): m.Children {
	const key = `agora_${sessionId}_reflection`;
	let stored = '';
	try {
		stored = sessionStorage.getItem(key) ?? '';
	} catch {
		// Storage unavailable — the box still works for the sitting
	}

	return m('.results__reflection', [
		m('p.results__debrief-heading', t('results.reflection_prompt')),
		m('textarea.text-input', {
			value: stored,
			rows: 2,
			placeholder: t('results.reflection_placeholder'),
			oninput: (event: InputEvent) => {
				try {
					sessionStorage.setItem(key, (event.target as HTMLTextAreaElement).value);
				} catch {
					// Nothing to do
				}
			},
		}),
		m('p.results__mine-note', t('results.reflection_private')),
	]);
}

interface Recognition {
	icon: IconName;
	titleKey: string;
	value: string;
}

/**
 * Plural, role-based recognitions — a portrait of the class instead of one
 * hierarchy. Multiple students win on different dimensions, every dimension
 * is mastery-referenced, and proposal-based ones credit the PROPOSAL by
 * number (proposals stay anonymous; helping identities are the public ones).
 */
function buildRecognitions(
	participants: readonly AgoraParticipant[],
	userId?: string,
): Recognition[] {
	const { proposals, scores, suggestions } = getDeliberationState();
	const out: Recognition[] = [];
	const numberOf = (statementId: string): number =>
		proposals.findIndex((proposal) => proposal.statementId === statementId) + 1;
	const nameOf = (uid: string): string => {
		if (uid === userId) return t('board.you');

		return participants.find((participant) => participant.userId === uid)?.anonName ?? '';
	};

	// Bridge-Builder: the proposal both camps hold up highest
	const byBridge = [...proposals].sort(
		(a, b) =>
			(scores[b.statementId]?.bridgingScore ?? 0) - (scores[a.statementId]?.bridgingScore ?? 0),
	)[0];
	if (byBridge && (scores[byBridge.statementId]?.bridgingScore ?? 0) > 0) {
		out.push({
			icon: 'trend',
			titleKey: 'results.recognition_bridge',
			value: t('results.recognition_proposal', { n: numberOf(byBridge.statementId) }),
		});
	}

	// Craftsperson: the proposal that traveled furthest upward across drafts
	const travel = (statementId: string): number => {
		const score = scores[statementId];
		const history = score?.editHistory ?? [];
		if (history.length === 0) return 0;

		return (score?.bridgingScore ?? 0) - history[0].bridgingAtEdit;
	};
	const byTravel = [...proposals].sort((a, b) => travel(b.statementId) - travel(a.statementId))[0];
	if (byTravel && travel(byTravel.statementId) > 0) {
		out.push({
			icon: 'edit',
			titleKey: 'results.recognition_craft',
			value: t('results.recognition_proposal', { n: numberOf(byTravel.statementId) }),
		});
	}

	// First Responder: the classmate whose first improvement idea came earliest
	const ideas = Object.values(suggestions)
		.flat()
		.filter((entry) => isSuggestionKind(entry))
		.sort((a, b) => a.createdAt - b.createdAt);
	const first = ideas[0];
	if (first && nameOf(first.creatorId)) {
		out.push({
			icon: 'idea',
			titleKey: 'results.recognition_first',
			value: nameOf(first.creatorId),
		});
	}

	// Quiet Engine: the classmate who kept the commons running — most ratings
	const byRatings = [...participants].sort(
		(a, b) => (b.points.rating ?? 0) - (a.points.rating ?? 0),
	)[0];
	if (byRatings && (byRatings.points.rating ?? 0) > 0) {
		out.push({
			icon: 'square',
			titleKey: 'results.recognition_engine',
			value: nameOf(byRatings.userId),
		});
	}

	return out;
}

/**
 * The student's private ledger. The game shouts "+1!" and "+2!" all lesson
 * and then, until now, never showed anyone their own total — announced points
 * with no accounting read as play money and quietly devalue every
 * celebration. Deliberately framed as a contribution to the CLASS score
 * (which averages everyone's points), and deliberately shows only your own
 * numbers: no ranking, no comparison, nothing to lose by reading it.
 */
function myJourneyCard(participant: AgoraParticipant, sessionId: string): m.Children {
	const points = participant.points;
	const story = readMyStory(participant.userId);
	const parts: Array<{ value: number; label: string }> = [
		{ value: points.helping, label: t('results.my_helping') },
		{ value: points.rating ?? 0, label: t('results.my_rating') },
		{ value: points.revising ?? 0, label: t('results.my_revising') },
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
		// How far the text itself came — the retrospective is where the
		// per-version numbers belong
		journeyLine(participant.userId),
		// The sentences that carry the collaboration message home
		m('ul.results__story', [
			story.ideasLanded > 0 ? m('li', tCount('results.story_woven', story.ideasLanded)) : null,
			story.classmatesHelped > 0
				? m('li', tCount('results.story_helped', story.classmatesHelped))
				: null,
			story.voicesWovenIn > 0 ? m('li', tCount('results.story_voices', story.voicesWovenIn)) : null,
		]),
		m('p.results__mine-note', t('results.my_contribution_note')),
		// The forward look: the one question a finale should leave behind
		reflectionBox(sessionId),
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
			const thanks = countThanks(participants);

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
			const recognitions = buildRecognitions(participants, myParticipant?.userId);

			/**
			 * What the class ELECTED, when it held a vote.
			 *
			 * Named whether or not it cleared the teacher's bar: a class that
			 * voted has to be told what its vote did, and "the proposal you chose
			 * fell short of the agreement the room required" is a lesson, where
			 * silence is just a screen that forgot.
			 */
			const voteCard = ((): m.Children => {
				const winnerId = score.voteWinnerStatementId;
				if (!winnerId) return null;

				const candidate = session.voting?.candidates.find(
					(entry) => entry.statementId === winnerId,
				);
				const votes = score.voteCounts?.[winnerId] ?? 0;
				const met = score.voteWinnerMetThreshold !== false;

				return m('.card.stack.results__vote', [
					m(
						'p.teacher__section-title',
						met ? t('results.vote_winner') : t('results.vote_winner_missed'),
					),
					candidate ? m('p.results__vote-text', candidate.statement) : null,
					m(
						'p.results__vote-count',
						t('results.vote_count', {
							n: String(votes),
							total: String(score.voteTotal ?? 0),
						}),
					),
					!met && score.winningConsensusThreshold !== undefined
						? m(
								'p.results__vote-gap',
								t('results.vote_threshold_gap', {
									cp: (candidate?.consensus ?? 0).toFixed(2),
									threshold: score.winningConsensusThreshold.toFixed(2),
								}),
							)
						: null,
				]);
			})();

			const classHalf: m.Children = [
				// Mine first: the student reads their own story, then sees the
				// class outcome their points fed into
				myParticipant ? myJourneyCard(myParticipant, session.sessionId) : null,

				voteCard,

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
				// behind any score one press away.
				m('.card.stack', [
					m(ResultsBoard, {
						sessionId: session.sessionId,
						topic,
						proposals: getDeliberationState().proposals,
						scores: getDeliberationState().scores,
						census: getConsensusPool(),
						userId: myParticipant?.userId,
						leadStatementId: score.leadStatementId,
						finale: true,
					}),
				]),

				// Plural recognitions: several ways to have mattered, so the
				// finale reads as a portrait of the class, not one hierarchy
				recognitions.length > 0
					? m('.card.stack.results__recognitions', [
							m('p.teacher__section-title', t('results.recognitions_title')),
							// NO keys: these rows sit beside an unkeyed title in one
							// children array, and Mithril forbids mixing (blank-screen
							// crash); the list is short and stable, keys buy nothing
							...recognitions.map((recognition) =>
								m('.results__recognition', [
									m(
										'span.results__recognition-icon',
										{ 'aria-hidden': 'true' },
										m(Icon, { name: recognition.icon, size: 20 }),
									),
									m('span.results__recognition-title', t(recognition.titleKey)),
									m('span.results__recognition-value', recognition.value),
								]),
							),
						])
					: null,

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

					m(ResultsSwitch, {
						tab,
						thanks,
						onTab: (next: ResultsTab) => {
							tab = next;
						},
					}),

					tab === 'helpers'
						? m(HelpersBoard, {
								participants,
								userId: myParticipant?.userId,
								finale: true,
							})
						: classHalf,
				]),
			]);
		},
	};
};
