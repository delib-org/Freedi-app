import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { OdysseyElder } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { activeElders, crewByCloseness } from '../lib/elders';
import { distanceEngine } from '../lib/distance';
import { sailedCount, voyageIslands } from '../lib/voyageRoute';

/**
 * המלחים: who the sailors are, and who is sailing with you now.
 *
 * This used to be a board where the player picked a crew before setting out.
 * The first reviewer said the choosing belonged after the first island, not
 * before it — you cannot know whose company you want before you have said
 * anything — and three sailors were too few. So nobody is chosen here any
 * more: the crew forms by itself from the elders whose courses sit closest to
 * the player's answers (`crewByCloseness`), and this screen only explains them.
 * Every elder is on the board, nearest first; the ones currently aboard say
 * so. Before the first island there is no crew yet, and the screen says that
 * instead of showing a board nobody can be on.
 *
 * The board still spends its explanation once, here — that these are AI
 * personas with declared positions, not parties or candidates.
 */
export default function Elders() {
	const navigate = useNavigate();
	const { content, journey, attitudes } = useGame();
	const elders = useMemo(() => activeElders(content?.game), [content]);
	const distances = useMemo((): Record<string, number | null> => {
		if (!content) return {};

		return Object.fromEntries(
			distanceEngine
				.elderDistances({ attitudes, islands: content.islands, elders })
				.map((entry) => [entry.elderId, entry.distance]),
		);
	}, [content, attitudes, elders]);
	const crew = useMemo(() => crewByCloseness(elders, distances), [elders, distances]);
	const sailed = sailedCount(voyageIslands(content), attitudes);

	/**
	 * Which elder is telling you who they are — one at a time.
	 *
	 * Opened in place, the answer grew the cell and stretched every card in
	 * that row to match; a board of twelve identical cards is the whole point
	 * of the screen. It arrives as a bubble over the board instead.
	 */
	const [openBio, setOpenBio] = useState<string | null>(null);

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
	// has no sailors to explain — back to the voyage. As an effect, not during
	// render (calling navigate() mid-render is a React error).
	const shouldRedirect = Boolean(content && journey) && elders.length === 0;
	useEffect(() => {
		if (shouldRedirect) navigate('/voyage', { replace: true });
	}, [shouldRedirect, navigate]);

	if (!content || !journey) return <NoGameYet />;
	if (shouldRedirect) return null;

	const crewIds = new Set(crew.map((elder) => elder.elderId));
	// Nearest first: the crew in its own order, then everyone else in the
	// organizer's order.
	const board = [...crew, ...elders.filter((elder) => !crewIds.has(elder.elderId))];

	/** The three keywords under the name — the elder's own values, verbatim. */
	function keywords(elder: OdysseyElder): string {
		return elder.values.map((value) => value.label).join(', ');
	}

	return (
		<>
			<GameChrome stage="המלחים" />
			<div className="page">
				<div className="w-full max-w-5xl flex flex-col gap-4 pb-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">המלחים</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-1">
							{sailed === 0
								? 'המלחים מצטרפים אחרי האי הראשון: אלה שהעמדות שלהם קרובות לתשובות שלכם יעלו לסיפון.'
								: `על הסיפון ${crew.length} המלחים הקרובים ביותר לתשובות שלכם עד כה. הצוות מתעדכן בכל אי.`}
						</p>
						<p className="text-[14px] text-[#cfe6f5] opacity-85 m-0">
							המלחים לא יחליטו במקומכם — הם ישאלו, יזהירו ויעזרו לכם לראות את הדרך מזוויות שונות.
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

					<div className="crew-grid fade-in">
						{board.map((elder) => {
							const active = crewIds.has(elder.elderId);

							return (
								<div key={elder.elderId} className="crew-cell">
									<div className={`crew-card ${active ? 'chosen' : ''}`}>
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
										{active ? (
											<span className="text-[12px] text-[var(--gold-strong)] mt-1">
												⚓ על הסיפון
											</span>
										) : null}
									</div>
									{/*
									  The ⓘ sits in the card's free top corner as a SIBLING of the
									  card, not a child — the card used to be a button, and a button
									  may not contain a button. Absolute inside the cell puts it on
									  the card without putting it in it.
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
						<Link className="btn" to="/voyage">
							⛵ חזרה להפלגה
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
