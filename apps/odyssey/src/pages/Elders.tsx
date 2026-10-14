import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OdysseyElder } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { activeElders } from '../lib/elders';
import { crewIsComplete, crewIsFull, crewLimits, rankEldersByWinds } from '../lib/crew';

/**
 * המלחים מחכים: choosing the crew.
 *
 * The sailors are the conscience of the game — they are there so the player
 * chooses more consciously on every island, not to choose for them. That is
 * why the crew is picked right after the compass and before the islands,
 * and why the choosing is the player's alone: the whole roster is offered,
 * nobody is ticked in advance (a tester who was handed three felt the choice
 * had been made for him), and the way on opens only once a real crew is
 * aboard (see lib/crew for the limits).
 *
 * The roster is ORDERED by the player's compass — sailors whose values echo
 * the values the player ranked come first, and say so — but ordering is not
 * choosing. Every card is the same card.
 *
 * The screen also says plainly what these figures are — AI personas with
 * declared positions, not candidates — once, here, instead of failing to
 * make it twelve times on the water.
 */
export default function Elders() {
	const navigate = useNavigate();
	const { content, journey, updateJourney } = useGame();
	const elders = useMemo(() => activeElders(content?.game), [content]);
	const limits = crewLimits(elders.length);
	const [chosen, setChosen] = useState<Set<string>>(
		() =>
			new Set(
				// A crew saved earlier is the player's own choice and comes back;
				// a sailor the organizer has since switched off does not.
				(journey?.selectedElderIds ?? []).filter((id) =>
					elders.some((elder) => elder.elderId === id),
				),
			),
	);
	const [saving, setSaving] = useState(false);
	/**
	 * Which elder is telling you who they are — one at a time.
	 *
	 * Opened in place, the answer grew the cell and stretched every card in
	 * that row to match; a board of twelve identical cards is the whole point
	 * of the screen. It arrives as a bubble over the board instead.
	 */
	const [openBio, setOpenBio] = useState<string | null>(null);

	/** The values the player ranked on רוח ההכרעה, in rank order, as labels. */
	const rankedLabels = useMemo(() => {
		if (!content || !journey) return [];

		return Object.entries(journey.valueRankings ?? {})
			.sort((a, b) => a[1] - b[1])
			.map(([valueId]) => content.game.values.find((value) => value.valueId === valueId)?.label)
			.filter((label): label is string => Boolean(label));
	}, [content, journey]);

	const roster = useMemo(() => rankEldersByWinds(elders, rankedLabels), [elders, rankedLabels]);
	const matchingCount = roster.filter((entry) => entry.matchesWinds).length;

	// A bubble over the board closes the way every overlay does: Escape, or a
	// click anywhere that is not the bubble itself. The ⓘ badges are exempt —
	// they close it on their own, and dismissing first would reopen it.
	useEffect(() => {
		if (!openBio) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') setOpenBio(null);
		};
		const onPointer = (event: PointerEvent): void => {
			const target = event.target;
			if (target instanceof Element && target.closest('.speech-bubble, .crew-info')) return;
			setOpenBio(null);
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onPointer);

		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
		};
	}, [openBio]);

	// A game whose organizer switched the elders off, or never authored any,
	// must not show an empty ceremony — it goes straight on to the map. As an
	// effect, not during render (calling navigate() mid-render is a React error).
	const shouldRedirectToMap = Boolean(content && journey) && elders.length === 0;
	useEffect(() => {
		if (shouldRedirectToMap) navigate('/map', { replace: true });
	}, [shouldRedirectToMap, navigate]);

	if (!content || !journey) return <NoGameYet />;
	if (shouldRedirectToMap) return null;

	const complete = crewIsComplete(chosen.size, elders.length);
	const full = crewIsFull(chosen.size, elders.length);

	function toggle(elderId: string): void {
		setChosen((current) => {
			const next = new Set(current);
			if (next.has(elderId)) next.delete(elderId);
			else if (!crewIsFull(next.size, elders.length)) next.add(elderId);

			return next;
		});
	}

	async function save(): Promise<void> {
		if (!complete) return;
		setSaving(true);
		try {
			await updateJourney({ selectedElderIds: [...chosen] });
			navigate('/map');
		} finally {
			setSaving(false);
		}
	}

	/** The three keywords under the name — the elder's own values, verbatim. */
	function keywords(elder: OdysseyElder): string {
		return elder.values.map((value) => value.label).join(', ');
	}

	const rangeText = limits.min === limits.max ? `${limits.min}` : `${limits.min}–${limits.max}`;
	const missing = Math.max(0, limits.min - chosen.size);

	return (
		<>
			<GameChrome stage="המלחים" />
			<div className="page">
				<div className="w-full max-w-5xl flex flex-col gap-4 pb-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">המלחים מחכים</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-1">
							כל קברניט צריך צוות על הסיפון. בחרו {rangeText} מלחים שילוו אתכם מאי לאי.
						</p>
						<p className="text-[14px] text-[#cfe6f5] opacity-85 m-0">
							המלחים לא יחליטו במקומכם — בכל אי תוכלו להתייעץ איתם, והם יעזרו לכם לראות את הסוגיה
							מזוויות שונות.
						</p>
					</header>

					<section className="panel fade-in">
						<p className="text-[15px] m-0 mb-2">
							<strong className="text-[var(--gold-strong)]">חשוב לדעת:</strong> אלה דמויות בינה
							מלאכותית בהשראת אישים היסטוריים — <strong>לא מפלגות ולא מועמדים בבחירות</strong>. הן
							מסומנות תמיד ב־📜, שטות בנפרד מספינות המפלגות, ואינן משפיעות על מידת הקרבה שלכם לאף
							מפלגה.
						</p>
						<p className="text-[15px] m-0">
							העמדות שלהן הן <strong>שחזור משוער</strong> מתוך מה שאמרו וכתבו בחייהם, ולא ציטוט. מלח
							ששתק בנושא מסוים — שותק גם כאן.
						</p>
					</section>

					{matchingCount > 0 ? (
						<p className="text-[13px] text-center opacity-80 m-0 fade-in" aria-live="polite">
							🧭 המלחים שמסומנים ב"מתאים לרוחות שלך" מדברים על ערכים שדירגתם במצפן. זה סדר בלבד —
							הבחירה כולה שלכם.
						</p>
					) : null}

					<div className="crew-grid fade-in">
						{roster.map(({ elder, matchesWinds }) => {
							const active = chosen.has(elder.elderId);
							const blocked = !active && full;

							return (
								<div key={elder.elderId} className="crew-cell">
									<button
										type="button"
										aria-pressed={active}
										aria-disabled={blocked || undefined}
										onClick={() => toggle(elder.elderId)}
										className={`crew-card ${active ? 'chosen' : ''} ${blocked ? 'crew-card--full' : ''}`}
									>
										<span className="crew-persona-mark" aria-hidden="true">
											📜
										</span>
										<span
											className="crew-portrait"
											style={{ background: elder.color }}
											aria-hidden="true"
										>
											{elder.portraitUrl ? <img src={elder.portraitUrl} alt="" /> : '⚓'}
										</span>
										<span className="crew-name">{elder.name}</span>
										{elder.years ? <span className="crew-years">{elder.years}</span> : null}
										<span className="crew-values">{keywords(elder)}</span>
										{matchesWinds ? <span className="crew-winds">🧭 מתאים לרוחות שלך</span> : null}
										{/* Only the berth that was taken says so. An empty card invites the
										    click by being a card on a board that asked you to choose. */}
										{active ? (
											<span className="text-[12px] text-[var(--gold-strong)] mt-1">
												⚓ על הסיפון
											</span>
										) : null}
									</button>
									{/*
									  The ⓘ sits in the card's free top corner — but it is a SIBLING of
									  the card, not a child: a button may not contain a button, and the
									  sentence it opens has to stay reachable by keyboard. Absolute
									  inside the cell puts it on the card without putting it in it.
									*/}
									<button
										type="button"
										className="crew-info"
										aria-label={`מי זה ${elder.name}?`}
										aria-expanded={openBio === elder.elderId}
										aria-controls={`bio-${elder.elderId}`}
										onClick={() =>
											setOpenBio((current) => (current === elder.elderId ? null : elder.elderId))
										}
									>
										<span aria-hidden="true">i</span>
									</button>
									{openBio === elder.elderId ? (
										<div className="speech-bubble" id={`bio-${elder.elderId}`}>
											<p>
												{elder.role} · {elder.bio}
											</p>
										</div>
									) : null}
								</div>
							);
						})}
					</div>

					<div className="flex flex-col items-center gap-2 pb-4">
						<p className="text-[14px] text-[var(--cream)] m-0" aria-live="polite">
							על הסיפון: {chosen.size} מתוך {limits.max}
							{full ? ' — הצוות מלא' : ''}
						</p>
						<button
							type="button"
							className="btn"
							disabled={!complete || saving}
							onClick={() => void save()}
						>
							{saving
								? 'שומר…'
								: complete
									? `להפליג עם ${chosen.size} מלחים — לפתיחת המפה`
									: `בחרו עוד ${missing} כדי להמשיך`}
						</button>
						<p className="text-[13px] opacity-75 m-0">
							{complete
								? 'אפשר לשנות את הצוות בכל שלב של המסע.'
								: `צוות הוא לפחות ${limits.min} מלחים. אפשר לשנות אותו בכל שלב של המסע.`}
						</p>
					</div>
				</div>
			</div>
		</>
	);
}
