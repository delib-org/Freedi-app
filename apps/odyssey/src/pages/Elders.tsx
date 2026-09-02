import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OdysseyElder } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { activeElders } from '../lib/elders';

/**
 * המלחים מחכים: choosing the crew.
 *
 * They used to arrive unannounced. Every enabled elder sailed with every
 * player, so the same Ben-Gurion line appeared above island after island with
 * nothing to explain it, and Golda's ship rode in the same row as the parties
 * — which reads as a claim that she is running in this election, on a screen
 * whose whole job is telling you which party sails near you.
 *
 * Being asked fixes both. A player who chose Begin knows why Begin is
 * answering her, and a screen that says plainly what these figures are — AI
 * personas with declared positions, not candidates — spends its explanation
 * once, here, instead of failing to make it twelve times on the water.
 *
 * With twelve on the roster the screen is a portrait board, not a list: a
 * list of twelve bios is a wall nobody reads, and a player who scrolls past
 * the crew has not chosen a crew, only dismissed one. Nobody is pre-selected
 * for the same reason — twelve voices arriving unasked is precisely the noise
 * this screen exists to prevent. One sailor now is a real answer, so is none,
 * and the crew can be changed at any point in the voyage.
 */
export default function Elders() {
	const navigate = useNavigate();
	const { content, journey, updateJourney } = useGame();
	const elders = activeElders(content?.game);
	const [chosen, setChosen] = useState<Set<string>>(() => new Set(journey?.selectedElderIds ?? []));
	const [saving, setSaving] = useState(false);

	// A game whose organizer switched the elders off, or never authored any,
	// must not show an empty ceremony — it goes straight on to the map. As an
	// effect, not during render (calling navigate() mid-render is a React error).
	const shouldRedirectToMap = Boolean(content && journey) && elders.length === 0;
	useEffect(() => {
		if (shouldRedirectToMap) navigate('/map', { replace: true });
	}, [shouldRedirectToMap, navigate]);

	if (!content || !journey) return <NoGameYet />;
	if (shouldRedirectToMap) return null;

	function toggle(elderId: string): void {
		setChosen((current) => {
			const next = new Set(current);
			if (next.has(elderId)) next.delete(elderId);
			else next.add(elderId);

			return next;
		});
	}

	async function save(): Promise<void> {
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

	return (
		<>
			<GameChrome stage="המלחים" />
			<div className="page">
				<div className="w-full max-w-5xl flex flex-col gap-4 pb-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">המלחים מחכים</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-1">
							כל קברניט צריך צוות על הסיפון. בחרו מי יעזור לכם במסע.
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
						{elders.map((elder, index) => {
							const active = chosen.has(elder.elderId);

							return (
								<div key={elder.elderId} className="crew-cell">
									<button
										type="button"
										aria-pressed={active}
										onClick={() => toggle(elder.elderId)}
										className={`crew-card ${active ? 'chosen' : ''}`}
									>
										<span className="crew-number" aria-hidden="true">
											{index + 1}
										</span>
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
										<span className="text-[12px] text-[var(--gold-strong)] mt-1">
											{active ? '⚓ על הסיפון' : '＋ לצרף לצוות'}
										</span>
									</button>
									<details className="crew-bio">
										<summary>מי זה?</summary>
										<p>
											{elder.role} · {elder.bio}
										</p>
									</details>
								</div>
							);
						})}
					</div>

					<div className="flex flex-col items-center gap-2 pb-4">
						<button type="button" className="btn" disabled={saving} onClick={() => void save()}>
							{saving
								? 'שומר…'
								: chosen.size === 0
									? 'להפליג לבד — לפתיחת המפה'
									: `להפליג עם ${chosen.size} — לפתיחת המפה`}
						</button>
						<p className="text-[13px] opacity-75 m-0">
							אפשר לבחור מלח אחד כעת, ולצרף נוספים בהמשך.
						</p>
					</div>
				</div>
			</div>
		</>
	);
}
