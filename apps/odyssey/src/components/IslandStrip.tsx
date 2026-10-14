import { Link } from 'react-router-dom';
import type { IslandContent } from '../lib/game';
import type { AttitudeMap } from '../lib/distance';
import { islandSailed, sailedCount } from '../lib/voyageRoute';

interface IslandStripProps {
	islands: IslandContent[];
	attitudes: AttitudeMap;
	/** index into `islands` of the island the player is standing on */
	currentIndex: number;
	onSelect(index: number): void;
}

/**
 * כל האיים במסע — the way to any other island, from any island.
 *
 * A reviewer standing on "אי 3 מתוך 3" could not tell how to reach the islands
 * he had already sailed: the only way off an island was "the next one". Now
 * that nobody chooses islands up front, the route is every island, and this
 * is where you see all of them — which you have sailed (✓), which one you are
 * on, which are still waiting — and sail to any of them with one tap. It
 * starts folded so the question stays first on a phone; its summary line says
 * what it is for, so a folded strip is still a visible way out.
 *
 * Ending the voyage lives here too: the player may stop whenever they like,
 * and that has to be said on every island, not only after the last one.
 */
export default function IslandStrip({
	islands,
	attitudes,
	currentIndex,
	onSelect,
}: IslandStripProps) {
	if (islands.length < 2) return null;

	const sailed = sailedCount(islands, attitudes);

	return (
		<details className="panel !py-2.5 fade-in">
			<summary className="cursor-pointer text-[14px] text-[var(--cream)]">
				🗺️ כל האיים במסע — חקרתם {sailed} מתוך {islands.length}. לחצו כדי לעבור לאי אחר
			</summary>
			<nav aria-label="האיים במסע" className="mt-3 flex flex-col gap-3">
				<ol className="flex flex-wrap gap-2 m-0 p-0 list-none">
					{islands.map((island, index) => {
						const here = index === currentIndex;
						const done = islandSailed(island, attitudes);

						return (
							<li key={island.statementId}>
								<button
									type="button"
									className={`chip ${here ? 'active' : ''}`}
									aria-current={here ? 'step' : undefined}
									onClick={() => onSelect(index)}
								>
									{done ? '✓ ' : ''}
									{index + 1}. {island.title}
									<span className="sr-only">{done ? ' (נחקר)' : ' (טרם נחקר)'}</span>
								</button>
							</li>
						);
					})}
				</ol>
				{sailed > 0 ? (
					<p className="m-0 text-[13px] opacity-80">
						אין חובה לעבור בכל האיים.{' '}
						<Link className="underline" to="/summary">
							לסיים את המסע כאן ולראות את מפת ההפלגה שלך
						</Link>
					</p>
				) : null}
			</nav>
		</details>
	);
}
