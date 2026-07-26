import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ODYSSEY_ATTITUDES, OdysseyAttitudeKey } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { useMode } from '../lib/mode';
import { distanceEngine } from '../lib/distance';
import { valueToAttitude } from '../lib/evaluations';
import { stageBus, type SeaDistances } from '../lib/stageBus';

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
	const [depth, setDepth] = useState('');
	const [log, setLog] = useState('');
	const [saving, setSaving] = useState(false);

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

	const distances: SeaDistances = useMemo(
		() =>
			content
				? Object.fromEntries(
						distanceEngine
							.partyDistances({ attitudes, islands: content.islands, parties })
							.map((entry) => [entry.partyId, entry.distance]),
					)
				: {},
		[content, attitudes, parties],
	);

	// Feed the voyage scene: parties once, then the current island vignette.
	// Ships take their positions instantly on entry (no mid-question motion).
	useEffect(() => {
		if (mode !== 'game' || parties.length === 0) return;
		stageBus.send({
			type: 'setParties',
			parties: parties.map((party) => ({
				id: party.partyId,
				name: party.name,
				color: party.color,
			})),
		});
	}, [mode, parties]);

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
			},
		});
		stageBus.send({ type: 'updateDistances', distances, animate: false });
		// distances intentionally omitted: ships take a snapshot when the island
		// changes and only move again during the reaction phase
	}, [mode, island, index, selectedIslands.length]);

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
			const patch: Parameters<typeof updateJourney>[0] = {};
			if (depth.trim()) {
				patch.depthAnswers = {
					...journey!.depthAnswers,
					[island!.statementId]: depth.trim(),
				};
			}
			if (log.trim()) {
				patch.logEntries = [
					...journey!.logEntries,
					{
						islandStatementId: island!.statementId,
						text: log.trim(),
						createdAt: Date.now(),
					},
				];
			}
			if (Object.keys(patch).length > 0) await updateJourney(patch);
			setDepth('');
			setLog('');
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
	}

	const nearest = parties
		.map((party) => ({ party, distance: distances[party.partyId] }))
		.filter((entry) => entry.distance !== null && entry.distance !== undefined)
		.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));

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

							{island.depthQuestion ? (
								<div>
									<p className="m-0 mb-2 text-[15px]">
										<strong>🔎 שאלת עומק:</strong> {island.depthQuestion}
									</p>
									<textarea
										rows={2}
										value={depth}
										onChange={(event) => setDepth(event.target.value)}
										placeholder="לא חובה — אפשר לדלג"
									/>
								</div>
							) : null}

							<div>
								<p className="m-0 mb-2 text-[15px]">
									<strong>📖 יומן קברניט:</strong> מה חשוב לך במיוחד בסוגיה הזו, או איפה ההתלבטות?
								</p>
								<textarea
									rows={2}
									value={log}
									onChange={(event) => setLog(event.target.value)}
									placeholder="לא חובה — הסתייגות, התלבטות או הסבר קצר"
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
							{mode === 'game' ? (
								<>
									{/* the sea itself reacts behind this window */}
									<div className="h-[38vh]" aria-hidden="true" />
									<div className="panel !py-2.5 text-center text-[14px] text-[#d5ecf7]">
										{text('voyageShipsNote')}
									</div>
								</>
							) : (
								<div className="panel">
									<h2 className="text-lg font-bold text-[var(--cream)] mt-0 mb-2">
										הים מגיב לבחירות שלך
									</h2>
									{nearest.length > 0 ? (
										<ul className="m-0 pr-5 leading-relaxed text-[15px]">
											{nearest.slice(0, 3).map((entry) => (
												<li key={entry.party.partyId}>
													<strong>{entry.party.name}</strong> — שטה כעת קרוב למסלול שלך
												</li>
											))}
											{nearest.length > 3 ? (
												<li className="opacity-75">
													הרחוקות ביותר:{' '}
													{nearest
														.slice(-2)
														.map((entry) => entry.party.name)
														.join(', ')}
												</li>
											) : null}
										</ul>
									) : (
										<p className="m-0 opacity-80">עדיין אין מספיק נתונים על מסלולי הספינות.</p>
									)}
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
