import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ODYSSEY_ATTITUDES, OdysseyAttitudeKey } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { useMode } from '../lib/mode';
import { distanceEngine } from '../lib/distance';
import { valueToAttitude } from '../lib/evaluations';
import { islandArtUrl } from '../lib/islandArt';
import { stageBus, type SeaDistances } from '../lib/stageBus';
import { invitedElders, elderStageId, pickIslandRemark, type ElderRemark } from '../lib/elders';
import NearbyShips, { type ShipProximity } from '../components/NearbyShips';
import ShipCard from '../components/ShipCard';
import ElderRemarkCard from '../components/ElderRemarkCard';

/**
 * What the captain's log asks when an island has no question of its own.
 * Islands carry a tailored `depthQuestion`; this is the floor.
 */
const DEFAULT_LOG_PROMPT = 'מה חשוב לך במיוחד בסוגיה הזו, או איפה ההתלבטות?';

/**
 * ההפלגה: one island (a `question` Statement) at a time. Each of its stances
 * is an `option` Statement; marking תומך/יכול לחיות עם/מתנגד writes a
 * standard Freedi evaluation on that option. In game mode the sea stage
 * shows the island vignette; marking an attitude plants a buoy, and after
 * each island the sea reacts — party ships sail by the updated distances
 * (only in the reaction phase, never mid-question).
 */
export default function Voyage() {
	const navigate = useNavigate();
	const mode = useMode();
	const { content, journey, attitudes, text, setAttitude, updateJourney } = useGame();

	const selectedIslands = useMemo(() => {
		if (!content || !journey) return [];

		return content.islands.filter(
			(island) => island.enabled && journey.selectedIslandIds.includes(island.statementId),
		);
	}, [content, journey]);

	const [index, setIndex] = useState(() => {
		const unanswered = selectedIslands.findIndex(
			(island) => !island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
		);

		return unanswered === -1 ? Math.max(0, selectedIslands.length - 1) : unanswered;
	});
	const [phase, setPhase] = useState<'question' | 'reaction'>('question');
	/** which ship the player asked about: a partyId, 'all' for the standing, or none */
	const [asked, setAsked] = useState<string | null>(null);
	const [depth, setDepth] = useState('');
	const [saving, setSaving] = useState(false);
	/** an elder's in-character answer to this island, shown only in reaction */
	const [remark, setRemark] = useState<ElderRemark | null>(null);

	const island = useMemo(
		() => selectedIslands[Math.min(index, Math.max(0, selectedIslands.length - 1))] ?? null,
		[selectedIslands, index],
	);

	const parties = useMemo(
		() =>
			(content?.game.parties ?? [])
				.filter((party) => party.enabled)
				.sort((a, b) => a.sortOrder - b.sortOrder),
		[content],
	);

	const elders = useMemo(
		() => invitedElders(content?.game, journey?.selectedElderIds),
		[content, journey?.selectedElderIds],
	);

	const distances: SeaDistances = useMemo(() => {
		if (!content) return {};
		const partyEntries = distanceEngine
			.partyDistances({ attitudes, islands: content.islands, parties })
			.map((entry): [string, number | null] => [entry.partyId, entry.distance]);
		const elderEntries = distanceEngine
			.elderDistances({ attitudes, islands: content.islands, elders })
			.map((entry): [string, number | null] => [elderStageId(entry.elderId), entry.distance]);

		return Object.fromEntries([...partyEntries, ...elderEntries]);
	}, [content, attitudes, parties, elders]);

	// Feed the voyage scene: parties once, then the current island vignette.
	// Ships take their positions instantly on entry (no mid-question motion).
	useEffect(() => {
		if (mode !== 'game' || parties.length + elders.length === 0) return;
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
	}, [mode, parties, elders]);

	useEffect(() => {
		if (mode !== 'game' || !island) return;
		stageBus.send({
			type: 'voyageIsland',
			island: {
				islandId: island.statementId,
				title: island.title,
				index: Math.min(index, selectedIslands.length - 1),
				count: selectedIslands.length,
				stanceCount: island.stances.length,
				imageUrl: island.imageUrl ?? islandArtUrl(island.sortOrder),
			},
		});
		stageBus.send({ type: 'updateDistances', distances, animate: false });
		// distances intentionally omitted: ships take a snapshot when the island
		// changes and only move again during the reaction phase
	}, [mode, island, index, selectedIslands.length]);

	// The sea answers taps only while it is reacting. During the question the
	// distances are still moving with every attitude marked, and letting a
	// player check which party an answer pushes them toward before they commit
	// to it is the mid-evaluation nudge the game refuses to make.
	useEffect(() => {
		// Closing the card belongs to every route, canvas or not: an open ship
		// card carried onto the next island would answer a question about the
		// previous one.
		if (phase !== 'reaction') setAsked(null);
		if (mode !== 'game') return;
		stageBus.send({ type: 'setSeaTappable', enabled: phase === 'reaction' });
	}, [mode, phase, island]);

	useEffect(() => {
		if (mode !== 'game') return;
		stageBus.send({ type: 'markShip', partyId: asked === 'all' ? null : asked });
	}, [mode, asked]);

	useEffect(() => {
		if (mode !== 'game') return;

		return stageBus.onEvent((event) => {
			if (event.type === 'shipTapped') setAsked(event.partyId);
			else if (event.type === 'myShipTapped') setAsked('all');
			else if (event.type === 'waterTapped') setAsked(null);
		});
	}, [mode]);

	// Sailing back to an island shows what you wrote there, so the box is a
	// draft you can revise rather than a slot that silently overwrites.
	useEffect(() => {
		setDepth(island ? (journey?.depthAnswers?.[island.statementId] ?? '') : '');
	}, [island, journey?.depthAnswers]);

	if (!content || !journey) return <NoGameYet />;
	if (selectedIslands.length === 0) {
		navigate('/map');

		return null;
	}
	if (!island) return null;

	const answeredOnIsland = island.stances.filter(
		(stance) => attitudes[stance.statementId] !== undefined,
	).length;

	function markAttitude(stanceIndex: number, stanceId: string, key: OdysseyAttitudeKey): void {
		void setAttitude(island!.statementId, stanceId, key);
		if (mode === 'game') {
			stageBus.send({ type: 'attitudeMarked', stanceIndex, attitude: key });
		}
	}

	async function submitIsland(): Promise<void> {
		setSaving(true);
		try {
			// Island-keyed, so sailing back to an island shows what you wrote and
			// replaces it rather than appending a second entry. `logEntries` is
			// still read on the summary for journeys written before the merge.
			if (depth.trim()) {
				await updateJourney({
					depthAnswers: {
						...journey!.depthAnswers,
						[island!.statementId]: depth.trim(),
					},
				});
			}
			setRemark(pickIslandRemark(elders, island!, attitudes));
			setPhase('reaction');
			if (mode === 'game') {
				// the log-stamp beat, then the sea reacts
				stageBus.send({ type: 'islandCompleted', islandId: island!.statementId });
				stageBus.send({ type: 'updateDistances', distances, animate: true });
			}
		} finally {
			setSaving(false);
		}
	}

	function nextIsland(): void {
		if (index + 1 >= selectedIslands.length) {
			navigate('/summary');

			return;
		}
		setIndex(index + 1);
		setPhase('question');
		setRemark(null);
	}

	// Two lists, never one. See NearbyShips' `caption`.
	const shipProximity: ShipProximity[] = parties.map((party) => ({
		partyId: party.partyId,
		name: party.name,
		color: party.color,
		distance: distances[party.partyId] ?? null,
	}));
	const elderProximity: ShipProximity[] = elders.map((elder) => ({
		partyId: elderStageId(elder.elderId),
		name: `📜 ${elder.name}`,
		color: elder.color,
		distance: distances[elderStageId(elder.elderId)] ?? null,
	}));
	const askedShip =
		[...shipProximity, ...elderProximity].find((ship) => ship.partyId === asked) ?? null;

	return (
		<>
			<GameChrome stage="ההפלגה" />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4">
					<header className="text-center fade-in">
						<p className="eyebrow m-0">
							אי {index + 1} מתוך {selectedIslands.length}
						</p>
						<h1 className="text-3xl font-bold text-[var(--cream)] mt-1 mb-1">{island.title}</h1>
						<p className="text-[15px] text-[#cfe6f5] m-0">{island.issue}</p>
					</header>

					{mode === 'game' && phase === 'question' ? (
						// window onto the island vignette and the sea
						<div className="h-[26vh]" aria-hidden="true" />
					) : null}

					{phase === 'question' ? (
						<section className="panel fade-in flex flex-col gap-4" key={island.statementId}>
							{island.opening ? (
								<p className="text-[15px] text-[#dcecf7] italic m-0">{island.opening}</p>
							) : null}
							<h2 className="text-lg font-bold text-[var(--cream)] m-0">
								⚓ {island.statement.statement}
							</h2>
							<p className="text-[13px] opacity-75 m-0">
								לפניכם {island.stances.length} חופים. סמנו את יחסכם לכל חוף — חובה לסמן לפחות אחד.
								אין צורך לבחור תשובה אחת בלבד.
							</p>

							<div className="flex flex-col gap-3">
								{island.stances.map((stance, stanceIndex) => {
									const myAttitude = valueToAttitude(attitudes[stance.statementId] ?? Number.NaN);

									return (
										<div
											key={stance.statementId}
											className="rounded-xl border border-[rgba(94,223,255,0.3)] bg-[rgba(6,24,44,0.6)] p-3"
										>
											<p className="m-0 mb-2 text-[15px]">
												<strong className="text-[var(--gold-strong)]">
													חוף {stanceIndex + 1}:
												</strong>{' '}
												{stance.statement}
											</p>
											<div
												className="flex flex-wrap gap-2"
												role="group"
												aria-label={`יחס לחוף ${stanceIndex + 1}`}
											>
												{ODYSSEY_ATTITUDES.map((attitude) => (
													<button
														key={attitude.key}
														type="button"
														className={`attitude ${myAttitude === attitude.key ? `active-${attitude.key}` : ''}`}
														onClick={() =>
															markAttitude(
																stanceIndex,
																stance.statementId,
																attitude.key as OdysseyAttitudeKey,
															)
														}
													>
														{attitude.label}
													</button>
												))}
											</div>
										</div>
									);
								})}
							</div>

							{/*
							  One open question, not two. There used to be a "depth question"
							  and a "captain's log" side by side, and on one island they were
							  word-for-word the same sentence. Even where they differed, a
							  reader could not tell which box was for what and answered
							  whichever came first — so the pair collected less than the
							  single box does.
							*/}
							<div>
								<p className="m-0 mb-2 text-[15px]">
									<strong>📖 יומן קברניט:</strong> {island.depthQuestion || DEFAULT_LOG_PROMPT}
								</p>
								<textarea
									rows={3}
									value={depth}
									onChange={(event) => setDepth(event.target.value)}
									placeholder="לא חובה — התלבטות, הסתייגות, או כל מה שעוד יש לכם לומר על הסוגיה"
								/>
							</div>

							<div className="flex flex-col items-center gap-2">
								<button
									type="button"
									className="btn"
									disabled={answeredOnIsland === 0 || saving}
									onClick={() => void submitIsland()}
								>
									{saving ? 'מפליגים…' : 'להמשך המסע ⛵'}
								</button>
								{answeredOnIsland === 0 ? (
									<p className="text-[13px] opacity-75 m-0">סמנו יחס לפחות לחוף אחד כדי להמשיך.</p>
								) : null}
							</div>
						</section>
					) : (
						<section className="fade-in flex flex-col gap-4">
							{remark ? <ElderRemarkCard remark={remark} /> : null}
							{mode === 'game' ? (
								<>
									{/* the sea itself reacts behind this window */}
									{/* the standing is the tallest card the sea can raise; giving it
									    the same window would push the way onward off the screen */}
									<div className={asked === 'all' ? 'h-[34vh]' : 'h-[50vh]'} aria-hidden="true" />
									{askedShip ? (
										<ShipCard
											ship={askedShip}
											onClose={() => setAsked(null)}
											onShowAll={() => setAsked('all')}
										/>
									) : asked === 'all' ? (
										<div className="panel !py-3 flex flex-col gap-2.5">
											<div className="flex items-center gap-2">
												<strong className="text-[15px] text-[var(--cream)]">הספינות סביבך</strong>
												<button
													type="button"
													className="mr-auto text-[13px] opacity-70 hover:opacity-100"
													onClick={() => setAsked(null)}
													aria-label="סגירה"
												>
													✕
												</button>
											</div>
											<NearbyShips ships={shipProximity} compact onSelect={setAsked} />
											{elderProximity.length > 0 ? (
												<div className="border-t border-[rgba(232,185,88,0.25)] pt-2">
													<NearbyShips
														ships={elderProximity}
														compact
														onSelect={setAsked}
														caption="📜 הזקנים ששטים איתך — דמויות בינה מלאכותית, לא מפלגות"
													/>
												</div>
											) : null}
											<p className="m-0 text-[12px] opacity-60 text-center">
												עגינה זמנית — לא פסק דין ולא הוראת הצבעה.
											</p>
										</div>
									) : (
										<div className="panel !py-2.5 text-center text-[14px] text-[#d5ecf7] flex flex-col gap-1.5">
											<p className="m-0">{text('voyageShipsNote')}</p>
											<p className="m-0 text-[13px] opacity-80">
												הספינה המוארת במרכז היא שלך. הקישו על ספינה כדי לראות כמה היא קרובה אליכם,
												או{' '}
												<button type="button" className="underline" onClick={() => setAsked('all')}>
													הציגו את כל הספינות
												</button>
												.
											</p>
										</div>
									)}
								</>
							) : (
								<div className="panel flex flex-col gap-3">
									<h2 className="text-lg font-bold text-[var(--cream)] m-0">
										הים מגיב לבחירות שלך
									</h2>
									<p className="m-0 text-[13px] opacity-80">
										הקישו על ספינה כדי לראות כמה היא קרובה למסלול שלכם.
									</p>
									<NearbyShips ships={shipProximity} onSelect={setAsked} />
									{elderProximity.length > 0 ? (
										<div className="border-t border-[rgba(232,185,88,0.25)] pt-3">
											<NearbyShips
												ships={elderProximity}
												onSelect={setAsked}
												caption="📜 הזקנים ששטים איתך — דמויות בינה מלאכותית, לא מפלגות"
											/>
										</div>
									) : null}
									{askedShip ? (
										<ShipCard
											ship={askedShip}
											onClose={() => setAsked(null)}
											onShowAll={() => setAsked(null)}
										/>
									) : null}
									<p className="m-0 text-[12px] opacity-65">
										הקרבה היא עגינה זמנית — לא פסק דין ולא הוראת הצבעה.
									</p>
								</div>
							)}
							<div className="flex justify-center">
								<button type="button" className="btn" onClick={() => nextIsland()}>
									{index + 1 >= selectedIslands.length ? 'אל מפת ההפלגה שלך 🗺️' : 'לאי הבא ⚓'}
								</button>
							</div>
						</section>
					)}
				</div>
			</div>
		</>
	);
}
