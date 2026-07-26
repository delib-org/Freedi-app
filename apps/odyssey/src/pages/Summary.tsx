import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Evaluation } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import PartySea from '../components/PartySea';
import { useGame } from '../state/GameContext';
import { useUser } from '../lib/user';
import { useMode } from '../lib/mode';
import OpinionMap from '../components/OpinionMap';
import { distanceEngine, ParticipantDistance } from '../lib/distance';
import { buildOpinionMap } from '../lib/opinionMap';
import { loadGameEvaluations } from '../lib/evaluations';

/**
 * תוצר סוף המסע: not a "which party are you" quiz result — a personal
 * sailing map. Compass journal, ships by distance from your route, fellow
 * sailors (computed from everyone's evaluations), and the Agora gate.
 */
export default function Summary() {
	const { user } = useUser();
	const mode = useMode();
	const { content, journey, attitudes, text } = useGame();
	const [participants, setParticipants] = useState<ParticipantDistance[]>([]);
	const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

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

	const opinionMap = useMemo(() => {
		if (!uid || !content || evaluations.length === 0) return null;

		return buildOpinionMap({ uid, evaluations, islands: content.islands, parties });
	}, [uid, content, evaluations, parties]);

	if (!content || !journey) return <NoGameYet />;

	const partyDistances = distanceEngine.partyDistances({
		attitudes,
		islands: content.islands,
		parties,
	});
	const distanceMap = Object.fromEntries(
		partyDistances.map((entry) => [entry.partyId, entry.distance]),
	);

	const sortedParties = [...partyDistances]
		.map((entry) => ({
			...entry,
			party: parties.find((party) => party.partyId === entry.partyId),
		}))
		.filter((entry) => entry.party)
		.sort((a, b) => (a.distance ?? 2) - (b.distance ?? 2));

	const sortedParticipants = participants
		.filter((entry) => entry.distance !== null)
		.sort((a, b) => (a.distance ?? 2) - (b.distance ?? 2))
		.slice(0, 8);

	const rankedValues = Object.entries(journey.valueRankings)
		.sort((a, b) => a[1] - b[1])
		.map(([valueId]) => content.game.values.find((value) => value.valueId === valueId)?.label)
		.filter(Boolean);

	const visitedIslands = content.islands.filter((island) =>
		island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
	);

	const agoraUrl = text('agoraUrl');

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
						<PartySea
							parties={parties.map((party) => ({
								id: party.partyId,
								name: party.name,
								color: party.color,
							}))}
							distances={distanceMap}
							caption="ספינות קרובות שטות במסלול דומה לשלך. הקרבה היא עגינה זמנית — לא פסק דין ולא הוראת הצבעה."
						/>
					) : null}

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">🚢 הספינות באופק</h2>
						<p className="text-[13px] opacity-75 mt-0 mb-4">
							לכל ספינה: קרבה למסלול שלך על פי {visitedIslands.length} האיים שחקרת. אפשרות עגינה —
							לא כרטיס הצבעה.
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
						{journey.logEntries.length > 0 ? (
							<div className="mt-3 border-t border-[rgba(232,185,88,0.35)] pt-3">
								<p className="eyebrow m-0 mb-2">יומן הקברניט</p>
								{journey.logEntries.map((entry, index) => {
									const island = content.islands.find(
										(candidate) => candidate.statementId === entry.islandStatementId,
									);

									return (
										<p key={index} className="m-0 mb-1.5 text-[14px] opacity-90">
											{island ? <strong>{island.title}: </strong> : null}
											{entry.text}
										</p>
									);
								})}
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

					<section className="panel fade-in text-center">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">🏛️ שער לאגורה</h2>
						<p className="text-[15px] text-[#dcecf7] mt-0 mb-4">{text('agoraQuestion')}</p>
						{agoraUrl ? (
							<a className="btn" href={agoraUrl}>
								{text('agoraButton')}
							</a>
						) : (
							<button type="button" className="btn" disabled title="כתובת האגורה תוגדר במסך הניהול">
								{text('agoraButton')} (בקרוב)
							</button>
						)}
						<p className="text-[13px] opacity-70 mt-3 mb-0">
							אפשר גם{' '}
							<Link className="underline" to="/map">
								לחזור למפה
							</Link>{' '}
							ולחקור איים נוספים — המפה תתעדכן.
						</p>
					</section>
				</div>
			</div>
		</>
	);
}
