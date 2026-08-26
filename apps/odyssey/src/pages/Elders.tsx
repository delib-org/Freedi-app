import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { activeElders } from '../lib/elders';

/**
 * מי מפליג איתך: choosing the Elders.
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
 * Choosing none is a real answer and the sea honours it.
 */
export default function Elders() {
	const navigate = useNavigate();
	const { content, journey, updateJourney } = useGame();
	const elders = activeElders(content?.game);
	const [chosen, setChosen] = useState<Set<string>>(
		() => new Set(journey?.selectedElderIds ?? elders.map((elder) => elder.elderId)),
	);
	const [saving, setSaving] = useState(false);

	if (!content || !journey) return <NoGameYet />;

	// A game whose organizer switched the elders off, or never authored any,
	// must not show an empty ceremony — it goes straight on to the map.
	if (elders.length === 0) {
		navigate('/map', { replace: true });

		return null;
	}

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

	return (
		<>
			<GameChrome stage="הזקנים" />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4 pb-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">מי מפליג איתך?</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">
							דמויות מן העבר יכולות להצטרף למסע — להעיר על עמדות שתסמנו, ולהתווכח איתכם באגורה.
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
							אפשר לבחור כמה שתרצו, או לא לבחור אף אחת ולהפליג לבד. אפשר לשנות בכל שלב.
						</p>
					</section>

					<div className="flex flex-col gap-2.5 fade-in">
						{elders.map((elder) => {
							const active = chosen.has(elder.elderId);

							return (
								<button
									key={elder.elderId}
									type="button"
									aria-pressed={active}
									onClick={() => toggle(elder.elderId)}
									className={`panel !py-3 !px-4 flex items-start gap-3 text-right cursor-pointer transition-[border-color] ${
										active ? '!border-[var(--gold-strong)]' : 'opacity-70'
									}`}
								>
									<span
										className="inline-block w-3.5 h-3.5 rounded-full shrink-0 mt-1.5"
										style={{ background: elder.color }}
										aria-hidden="true"
									/>
									<span className="flex-1">
										<span className="block">
											<strong className="text-[var(--cream)]">📜 {elder.name}</strong>
											<span className="opacity-80"> — {elder.role}</span>
										</span>
										<span className="block text-[13px] opacity-75 mt-1">{elder.bio}</span>
									</span>
									<span className="text-[18px] shrink-0 mt-0.5" aria-hidden="true">
										{active ? '⚓' : '＋'}
									</span>
								</button>
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
					</div>
				</div>
			</div>
		</>
	);
}
