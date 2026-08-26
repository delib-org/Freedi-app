import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Evaluation } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import OpinionMap from '../components/OpinionMap';
import { useGame } from '../state/GameContext';
import { useUser } from '../lib/user';
import { useMode } from '../lib/mode';
import { distanceEngine, ParticipantDistance } from '../lib/distance';
import { buildOpinionMap } from '../lib/opinionMap';
import { islandArtUrl } from '../lib/islandArt';
import { loadGameEvaluations } from '../lib/evaluations';
import { enterIslandDeliberation, getGateState } from '../lib/agoraGate';
import { stageBus } from '../lib/stageBus';
import { activeElders, elderStageId } from '../lib/elders';
import DigestSettings from '../components/DigestSettings';

/**
 * תוצר סוף המסע: not a "which party are you" quiz result — a personal
 * sailing map. In game mode the homecoming tableau (lanterns, wake trail,
 * ships at their true distances, the lighthouse Agora gate) plays on the sea
 * stage; the DOM keeps the journal, the lists and the SVG opinion map
 * (whose honesty rules stay exactly as they are).
 */
export default function Summary() {
	const { user } = useUser();
	const mode = useMode();
	const { content, journey, attitudes, text, updateJourney } = useGame();
	const [participants, setParticipants] = useState<ParticipantDistance[]>([]);
	const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
	/** The gate being walked through — the token round trip is not instant */
	const [enteringIslandId, setEnteringIslandId] = useState('');
	const [digestOpen, setDigestOpen] = useState(false);

	const gameId = content?.game.gameId;
	const uid = user?.uid;
	useEffect(() => {
		if (!gameId || !uid) return;
		let cancelled = false;
		void loadGameEvaluations(gameId).then((loaded: Evaluation[]) => {
			if (cancelled) return;
			setEvaluations(loaded);
			setParticipants(distanceEngine.participantDistances({ uid, evaluations: loaded }));
		});

		return () => {
			cancelled = true;
		};
	}, [gameId, uid]);

	const parties = useMemo(
		() =>
			(content?.game.parties ?? [])
				.filter((party) => party.enabled)
				.sort((a, b) => a.sortOrder - b.sortOrder),
		[content],
	);

	const elders = useMemo(() => activeElders(content?.game), [content]);

	const partyDistances = useMemo(
		() =>
			content
				? distanceEngine.partyDistances({ attitudes, islands: content.islands, parties })
				: [],
		[content, attitudes, parties],
	);

	const elderDistances = useMemo(
		() =>
			content ? distanceEngine.elderDistances({ attitudes, islands: content.islands, elders }) : [],
		[content, attitudes, elders],
	);

	const opinionMap = useMemo(() => {
		if (!uid || !content || evaluations.length === 0) return null;

		return buildOpinionMap({ uid, evaluations, islands: content.islands, parties, elders });
	}, [uid, content, evaluations, parties, elders]);

	const sortedParticipants = useMemo(
		() =>
			participants
				.filter((entry) => entry.distance !== null)
				.sort((a, b) => (a.distance ?? 2) - (b.distance ?? 2))
				.slice(0, 8),
		[participants],
	);

	// Feed the homecoming tableau: lit islands, ships, sailors — then the
	// one-time arrival celebration (skippable by simply scrolling on).
	const celebrated = useRef(false);
	useEffect(() => {
		if (mode !== 'game' || !content) return;
		const visitedIslandIds = content.islands
			.filter((island) =>
				island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
			)
			.map((island) => island.statementId);

		stageBus.send({
			type: 'setIslands',
			islands: content.islands.map((island) => ({
				id: island.statementId,
				title: island.title,
				issue: island.issue,
				posX: island.posX,
				posY: island.posY,
				imageUrl: island.imageUrl ?? islandArtUrl(island.sortOrder),
				visited: visitedIslandIds.includes(island.statementId),
			})),
		});
		stageBus.send({
			type: 'setParties',
			parties: [
				...parties.map((party) => ({
					id: party.partyId,
					name: party.name,
					color: party.color,
				})),
				...elders.map((elder) => ({
					id: elderStageId(elder.elderId),
					name: elder.name,
					color: elder.color,
					isElder: true,
				})),
			],
		});
		stageBus.send({
			type: 'updateDistances',
			distances: Object.fromEntries([
				...partyDistances.map((entry): [string, number | null] => [entry.partyId, entry.distance]),
				...elderDistances.map((entry): [string, number | null] => [
					elderStageId(entry.elderId),
					entry.distance,
				]),
			]),
			animate: false,
		});
		if (!celebrated.current && visitedIslandIds.length > 0) {
			celebrated.current = true;
			stageBus.send({ type: 'celebrateArrival', islandCount: visitedIslandIds.length });
		}
	}, [mode, content, attitudes, parties, partyDistances, elders, elderDistances]);

	useEffect(() => {
		if (mode !== 'game') return;
		stageBus.send({
			type: 'setSailors',
			distances: sortedParticipants
				.map((entry) => entry.distance)
				.filter((distance): distance is number => distance !== null),
		});
	}, [mode, sortedParticipants]);

	if (!content || !journey) return <NoGameYet />;

	const sortedParties = [...partyDistances]
		.map((entry) => ({
			...entry,
			party: parties.find((party) => party.partyId === entry.partyId),
		}))
		.filter((entry) => entry.party)
		.sort((a, b) => (a.distance ?? 2) - (b.distance ?? 2));

	const rankedValues = Object.entries(journey.valueRankings)
		.sort((a, b) => a[1] - b[1])
		.map(([valueId]) => content.game.values.find((value) => value.valueId === valueId)?.label)
		.filter(Boolean);

	const visitedIslands = content.islands.filter((island) =>
		island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
	);

	/**
	 * The captain's log, in island order.
	 *
	 * What a player writes on an island now lands in `depthAnswers`, keyed by
	 * island — the two open boxes were merged into one. `logEntries` is where
	 * the second box used to write, and journeys sailed before the merge still
	 * carry entries there, so both are read and neither is shown twice.
	 */
	const logbook: Array<{ islandTitle: string; text: string }> = [
		...content.islands
			.filter((island) => journey.depthAnswers?.[island.statementId]?.trim())
			.map((island) => ({
				islandTitle: island.title,
				text: journey.depthAnswers[island.statementId],
			})),
		...journey.logEntries
			// A legacy entry with no island (`islandStatementId` is nullable) has
			// nothing newer to be superseded by, so it always survives.
			.filter((entry) => !journey.depthAnswers?.[entry.islandStatementId ?? '']?.trim())
			.map((entry) => ({
				islandTitle:
					content.islands.find((island) => island.statementId === entry.islandStatementId)?.title ??
					'',
				text: entry.text,
			})),
	];

	const unvisitedCount = content.islands.filter(
		(island) => island.enabled && !visitedIslands.includes(island),
	).length;

	const agoraOrigin = text('agoraOrigin');

	async function enterGate(islandStatementId: string): Promise<void> {
		if (!content || enteringIslandId) return;
		setEnteringIslandId(islandStatementId);
		// fire-and-go: the boat sails into the lighthouse beam, navigation is
		// never blocked on the animation
		if (mode === 'game') stageBus.send({ type: 'sailToLighthouse' });
		try {
			await enterIslandDeliberation({
				islandStatementId,
				game: content.game,
				journey,
				agoraOrigin,
				updateJourney,
			});
		} catch (error) {
			console.error('[Odyssey] Could not open the gate:', error);
			setEnteringIslandId('');
		}
	}

	return (
		<>
			<GameChrome stage={text('summaryTitle')} />
			<div className="page">
				<div className="w-full max-w-4xl flex flex-col gap-5">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{text('summaryTitle')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">{text('summaryIntro')}</p>
					</header>

					{mode === 'game' ? (
						<>
							{/* the homecoming tableau plays on the sea stage behind this window */}
							<div className="h-[44vh]" aria-hidden="true" />
							<div className="panel !py-2.5 text-center text-[13px] text-[#d5ecf7]">
								ספינות קרובות שטות במסלול דומה לשלך. הקרבה היא עגינה זמנית — לא פסק דין ולא הוראת
								הצבעה.
							</div>
						</>
					) : null}

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">🚢 הספינות באופק</h2>
						<p className="text-[13px] opacity-75 mt-0 mb-4">
							לכל ספינה: קרבה למסלול שלך על פי {visitedIslands.length} האיים שחקרת. אפשרות עגינה —
							לא כרטיס הצבעה.{' '}
							<Link className="underline" to="/parties">
								איך נקבע מסלול של ספינה?
							</Link>
						</p>
						<div className="flex flex-col gap-3">
							{sortedParties.map(({ party, distance, sharedIslands }) => (
								<div key={party!.partyId} className="flex items-center gap-3">
									<span
										className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
										style={{ background: party!.color }}
										aria-hidden="true"
									/>
									<span className="w-40 shrink-0 text-[15px]">{party!.name}</span>
									{distance === null ? (
										<span className="text-[13px] opacity-60">אין עדיין נתוני מסלול לספינה זו</span>
									) : (
										<>
											<div className="distance-track flex-1" aria-hidden="true">
												<div
													className="distance-fill"
													style={{
														width: `${Math.round((1 - distance) * 100)}%`,
													}}
												/>
											</div>
											<span className="w-24 shrink-0 text-[13px] opacity-85 text-left">
												{distance <= 0.25
													? 'קרובה למסלולך'
													: distance <= 0.55
														? 'אפשרות לעגינה'
														: 'מתרחקת'}
											</span>
											<span className="text-[12px] opacity-60 shrink-0">
												({sharedIslands} איים)
											</span>
										</>
									)}
								</div>
							))}
						</div>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">🧭 יומן המסע שלך</h2>
						{content.game.compassQuestions.map((question) => {
							const entry = journey.compassAnswers[question.questionId];
							if (!entry || (!entry.answer && entry.chips.length === 0)) {
								return null;
							}

							return (
								<p key={question.questionId} className="m-0 mb-2 text-[15px]">
									<strong className="text-[var(--gold-strong)]">{question.title}:</strong>{' '}
									{[entry.answer, entry.chips.join(', ')].filter(Boolean).join(' · ')}
								</p>
							);
						})}
						{rankedValues.length > 0 ? (
							<p className="m-0 mb-2 text-[15px]">
								<strong className="text-[var(--gold-strong)]">רוח ההכרעה:</strong>{' '}
								{rankedValues.join(' ← ')}
							</p>
						) : null}
						{logbook.length > 0 ? (
							<div className="mt-3 border-t border-[rgba(232,185,88,0.35)] pt-3">
								<p className="eyebrow m-0 mb-2">יומן הקברניט</p>
								{logbook.map((entry, index) => (
									<p key={index} className="m-0 mb-1.5 text-[14px] opacity-90">
										{entry.islandTitle ? <strong>{entry.islandTitle}: </strong> : null}
										{entry.text}
									</p>
								))}
							</div>
						) : null}
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">⛵ מפליגים לצידך</h2>
						{sortedParticipants.length > 0 ? (
							<div className="flex flex-col gap-2">
								{sortedParticipants.map((entry) => (
									<div key={entry.userId} className="flex items-center gap-3">
										<span className="w-32 shrink-0 text-[15px]">{entry.displayName}</span>
										<div className="distance-track flex-1" aria-hidden="true">
											<div
												className="distance-fill"
												style={{
													width: `${Math.round((1 - (entry.distance ?? 1)) * 100)}%`,
												}}
											/>
										</div>
										<span className="text-[13px] opacity-85 shrink-0">
											{entry.distance !== null && entry.distance <= 0.3
												? 'מסלול דומה'
												: 'מסלול שונה'}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="m-0 opacity-80 text-[15px]">
								עדיין אין מפליגים נוספים בים הזה. כשיצטרפו — תראו כאן מי שט במסלול דומה לשלכם.
							</p>
						)}
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">🗺️ מפת ים הדעות</h2>
						<p className="text-[13px] opacity-75 mt-0 mb-4">
							כל נקודה היא מפליג/ה או ספינת מפלגה. ככל ששתי נקודות קרובות יותר — התשובות שלהן דומות
							יותר.
						</p>
						<OpinionMap result={opinionMap} />
					</section>

					{/*
					  Before the way out, the way back.
					  This used to be one dim line under the Agora gates, and a reader
					  who had sailed a few islands came away thinking the voyage was
					  over — she signed in again from scratch to reach the islands she
					  had skipped. The map is still open; that has to be said before
					  the exit, not after it.
					*/}
					<section className="panel fade-in text-center">
						<h2 className="text-lg font-bold text-[var(--cream)] mt-0 mb-2">
							🧭 המסע לא נגמר — יש עוד איים
						</h2>
						<p className="text-[15px] text-[#dcecf7] mt-0 mb-3">
							{unvisitedCount > 0
								? `חקרתם ${visitedIslands.length} איים. עוד ${unvisitedCount} ממתינים לכם על המפה, ואפשר לחזור אליהם בכל רגע — מפת ההפלגה תתעדכן.`
								: 'עברתם בכל האיים. אפשר לחזור למפה בכל רגע ולשנות עמדה על אי שכבר חקרתם.'}
						</p>
						<Link className="btn" to="/map">
							🗺️ חזרה למפה
						</Link>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2 text-center">
							🏛️ שערי האגורה
						</h2>
						<p className="text-[15px] text-[#dcecf7] mt-0 mb-4 text-center">
							{text('agoraQuestion')}
						</p>
						{visitedIslands.length > 0 ? (
							<div className="flex flex-col gap-2.5">
								{visitedIslands.map((island) => {
									const state = getGateState(island.statementId, content.game, journey);
									const entering = enteringIslandId === island.statementId;

									return (
										<div
											key={island.statementId}
											className="flex items-center gap-3 flex-wrap justify-between"
										>
											<span className="text-[15px]">
												{state === 'visited' ? '⚑ ' : ''}
												{island.title}
											</span>
											{state === 'unprovisioned' || !agoraOrigin ? (
												<button
													type="button"
													className="btn"
													disabled
													title="הדיון על האי הזה ייפתח במסך הניהול"
												>
													{text('agoraButton')} (בקרוב)
												</button>
											) : (
												<button
													type="button"
													className="btn"
													disabled={entering}
													onClick={() => void enterGate(island.statementId)}
												>
													{entering
														? 'מפליגים…'
														: state === 'visited'
															? 'חזרה לדיון'
															: text('agoraButton')}
												</button>
											)}
										</div>
									);
								})}
							</div>
						) : (
							<p className="m-0 opacity-80 text-[15px] text-center">
								חקרו אי אחד לפחות, ושער הדיון עליו ייפתח כאן.
							</p>
						)}
					</section>

					{uid ? (
						digestOpen ? (
							<DigestSettings uid={uid} onClose={() => setDigestOpen(false)} />
						) : (
							<section className="panel fade-in text-center">
								<p className="m-0 text-[14px] text-[#dcecf7]">
									רוצים לדעת מה קורה בים כשאתם לא כאן?{' '}
									<button type="button" className="underline" onClick={() => setDigestOpen(true)}>
										📬 סיפור המסע שלכם למייל
									</button>
								</p>
							</section>
						)
					) : null}
				</div>
			</div>
		</>
	);
}
