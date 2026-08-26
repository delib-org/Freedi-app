import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { enabledIslands } from '../lib/game';
import { islandArtUrl } from '../lib/islandArt';
import { useMode } from '../lib/mode';
import { enterIslandDeliberation, getGateState } from '../lib/agoraGate';
import { stageBus } from '../lib/stageBus';

/** Rough voyage length per the design doc: 3→~5min, 5→~8, 8→~12, 12→~20. */
function estimateMinutes(count: number): number {
	if (count === 0) return 0;

	return Math.max(3, Math.round(count * 1.6));
}

/**
 * המפה נפתחת: the civic issues spread out as islands on the sea. Each island
 * is a Freedi `question` Statement; choosing islands only marks the journey —
 * answering happens on the voyage. In game mode the islands live on the
 * Phaser chart (tap → anchor stamp); selection state stays here in React.
 */
export default function MapPage() {
	const navigate = useNavigate();
	const mode = useMode();
	const { content, journey, attitudes, text, updateJourney } = useGame();
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(journey?.selectedIslandIds ?? []),
	);
	const [saving, setSaving] = useState(false);
	const [enteringIslandId, setEnteringIslandId] = useState('');

	const islands = useMemo(() => (content ? enabledIslands(content) : []), [content]);

	/**
	 * Islands this player has actually taken positions on. After the voyage the
	 * map stops being only a place to choose from and becomes the hub of the
	 * round trip: these are the ones with a deliberation waiting.
	 */
	const addressedIslands = useMemo(
		() =>
			islands.filter((island) =>
				island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
			),
		[islands, attitudes],
	);

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

	const agoraOrigin = text('agoraOrigin');
	const gatedIslands = agoraOrigin
		? addressedIslands
				.map((island) => ({
					island,
					state: getGateState(island.statementId, content.game, journey),
				}))
				.filter((entry) => entry.state !== 'unprovisioned')
		: [];

	async function sail(): Promise<void> {
		setSaving(true);
		try {
			await updateJourney({ selectedIslandIds: [...selected] });
			navigate('/voyage');
		} finally {
			setSaving(false);
		}
	}

	async function enterGate(islandStatementId: string): Promise<void> {
		if (!content || enteringIslandId) return;
		setEnteringIslandId(islandStatementId);
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
			<GameChrome stage={text('mapTitle')} />
			<div className="page">
				<div className="w-full max-w-5xl flex flex-col gap-4">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{text('mapTitle')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">{text('mapIntro')}</p>
						<p className="text-[13px] opacity-75 mt-1">
							אפשר לבחור מעט איים למסע קצר, או יותר איים למסע מלא. אין חובה לעבור בכל האיים.
						</p>
					</header>

					{mode === 'game' ? (
						// the islands live on the Phaser chart behind this window
						<div className="h-[52vh]" aria-hidden="true" />
					) : (
						<div className="flex flex-col gap-2 fade-in">
							{islands.map((island) => (
								<label
									key={island.statementId}
									className="panel !py-3 !px-4 flex items-start gap-3 cursor-pointer"
								>
									<input
										type="checkbox"
										className="mt-1.5 w-4 h-4"
										checked={selected.has(island.statementId)}
										onChange={() => toggle(island.statementId)}
									/>
									<span>
										<strong className="text-[var(--cream)]">{island.title}</strong>
										<span className="opacity-80"> — {island.issue}</span>
										<span className="block text-[13px] opacity-70 mt-0.5">
											{island.shortExplain}
										</span>
									</span>
								</label>
							))}
						</div>
					)}

					{gatedIslands.length > 0 ? (
						<section className="panel fade-in">
							<h2 className="text-lg font-bold text-[var(--cream)] mt-0 mb-1">
								🏛️ שערי הדיון שנפתחו לך
							</h2>
							<p className="text-[13px] opacity-75 mt-0 mb-3">
								על האיים שכבר חקרת אפשר להיפגש עם אחרים ולחפש יחד פתרונות.
							</p>
							<div className="flex flex-col gap-2.5">
								{gatedIslands.map(({ island, state }) => (
									<div
										key={island.statementId}
										className="flex items-center gap-3 flex-wrap justify-between"
									>
										<span className="text-[15px]">
											{state === 'visited' ? '⚑ ' : ''}
											{island.title}
										</span>
										<button
											type="button"
											className="btn"
											disabled={enteringIslandId === island.statementId}
											onClick={() => void enterGate(island.statementId)}
										>
											{enteringIslandId === island.statementId
												? 'מפליגים…'
												: state === 'visited'
													? 'חזרה לדיון'
													: text('agoraButton')}
										</button>
									</div>
								))}
							</div>
						</section>
					) : null}

					<div className="flex flex-col items-center gap-2 pb-4">
						<button
							type="button"
							className="btn"
							disabled={selected.size === 0 || saving}
							onClick={() => void sail()}
						>
							{saving
								? 'שומר…'
								: selected.size === 0
									? 'בחרו לפחות אי אחד'
									: `מפליגים אל ${selected.size} איים (~${estimateMinutes(selected.size)} דקות)`}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
