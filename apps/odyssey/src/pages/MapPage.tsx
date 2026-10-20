import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { enabledIslands } from '../lib/game';
import { islandArtUrl } from '../lib/islandArt';
import { initialRouteSelection } from '../lib/voyageRoute';
import { useMode } from '../lib/mode';
import { stageBus } from '../lib/stageBus';
import { useT } from '../i18n/useT';

/** The shortest voyage: one island. A map with none chosen has nowhere to sail. */
const ISLANDS_MIN = 1;

/** Rough voyage length per the design doc: 3→~5min, 5→~8, 8→~12, 12→~20. */
function estimateMinutes(count: number): number {
	if (count === 0) return 0;

	return Math.max(3, Math.round(count * 1.6));
}

/**
 * המפה נפתחת: the civic issues spread out as islands on the sea. Each island
 * is a Freedi `question` Statement; choosing islands only marks the journey —
 * answering happens on the voyage. The discussion gates that used to sit here
 * live on the summary now: a gate is the step AFTER an island, and a tester
 * rightly asked what one was doing before the voyage had begun. In game mode
 * the islands live on the Phaser chart (tap → anchor stamp); selection state
 * stays here in React.
 */
export default function MapPage() {
	const navigate = useNavigate();
	const mode = useMode();
	const { content, journey, attitudes, text, updateJourney } = useGame();
	const { t } = useT();
	const islands = useMemo(() => (content ? enabledIslands(content) : []), [content]);
	// Nothing ticked on a voyage not yet begun: the islands are the player's
	// to choose. A route already being sailed comes back (see voyageRoute).
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(initialRouteSelection(journey?.selectedIslandIds, islands, attitudes)),
	);
	const [saving, setSaving] = useState(false);
	/** Which island is explaining itself, one at a time (see the crew board). */
	const [openIsland, setOpenIsland] = useState<string | null>(null);

	useEffect(() => {
		if (!openIsland) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') setOpenIsland(null);
		};
		const onPointer = (event: PointerEvent): void => {
			const target = event.target;
			if (target instanceof Element && target.closest('.speech-bubble, .bubble-toggle')) return;
			setOpenIsland(null);
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onPointer);

		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
		};
	}, [openIsland]);

	const toggle = useCallback((statementId: string): void => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(statementId)) next.delete(statementId);
			else next.add(statementId);

			return next;
		});
	}, []);

	// Feed the chart scene: islands (with revisit lanterns) + live selection.
	useEffect(() => {
		if (mode !== 'game' || islands.length === 0) return;
		stageBus.send({
			type: 'setIslands',
			islands: islands.map((island) => ({
				id: island.statementId,
				title: island.title,
				issue: island.issue,
				posX: island.posX,
				posY: island.posY,
				imageUrl: island.imageUrl ?? islandArtUrl(island.sortOrder),
				visited: island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
			})),
		});
	}, [mode, islands, attitudes]);

	useEffect(() => {
		if (mode !== 'game') return;
		stageBus.send({ type: 'setSelection', islandIds: [...selected] });
	}, [mode, selected]);

	useEffect(
		() =>
			stageBus.onEvent((event) => {
				if (event.type === 'islandTapped') toggle(event.islandId);
			}),
		[toggle],
	);

	if (!content || !journey) return <NoGameYet />;

	async function sail(): Promise<void> {
		setSaving(true);
		try {
			await updateJourney({ selectedIslandIds: [...selected] });
			navigate('/voyage', { state: { fresh: true } });
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<GameChrome stage={text('mapTitle')} />
			<div className="page">
				<div className="w-full max-w-5xl flex flex-col gap-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{text('mapTitle')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">{text('mapIntro')}</p>
						<p className="text-[13px] opacity-75 mt-1">{t('map.hint')}</p>
					</header>

					{mode === 'game' ? (
						// the islands live on the Phaser chart behind this window
						<div className="h-[52vh]" aria-hidden="true" />
					) : (
						<div className="isle-grid fade-in">
							{islands.map((island) => {
								const chosen = selected.has(island.statementId);
								const art = island.imageUrl ?? islandArtUrl(island.sortOrder);

								return (
									<div key={island.statementId} className="isle-cell">
										<button
											type="button"
											aria-pressed={chosen}
											onClick={() => toggle(island.statementId)}
											className={`isle-card ${chosen ? 'chosen' : ''}`}
										>
											<span className="isle-art" aria-hidden="true">
												{art ? <img src={art} alt="" loading="lazy" /> : '🏝️'}
											</span>
											<span className="isle-title">{island.title}</span>
											<span className="isle-issue">{island.issue}</span>
											<span className="isle-state">
												{chosen ? t('map.onRoute') : t('map.addToRoute')}
											</span>
										</button>
										<button
											type="button"
											className="bubble-toggle"
											aria-expanded={openIsland === island.statementId}
											aria-controls={`isle-${island.statementId}`}
											onClick={() =>
												setOpenIsland((current) =>
													current === island.statementId ? null : island.statementId,
												)
											}
										>
											{t('map.whatIsHere')}
										</button>
										{openIsland === island.statementId ? (
											<div className="speech-bubble" id={`isle-${island.statementId}`}>
												<p>{island.shortExplain}</p>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}

					<div className="flex flex-col items-center gap-2 pb-4">
						<p className="text-[14px] text-[var(--cream)] m-0" aria-live="polite">
							{t('map.selectedCount', { selected: selected.size, total: islands.length })}
						</p>
						<button
							type="button"
							className="btn"
							disabled={selected.size < ISLANDS_MIN || saving}
							onClick={() => void sail()}
						>
							{saving
								? t('common.saving')
								: selected.size < ISLANDS_MIN
									? t('map.pickOne')
									: t('map.sail', {
											count: selected.size,
											minutes: estimateMinutes(selected.size),
										})}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
