import { Link } from 'react-router-dom';
import type { IslandContent } from '../lib/game';
import type { AttitudeMap } from '../lib/distance';
import { routeStops, sailedCount } from '../lib/voyageRoute';
import { useT } from '../i18n/useT';

interface IslandStripProps {
	islands: IslandContent[];
	attitudes: AttitudeMap;
	/** index into `islands` of the island the player is standing on */
	currentIndex: number;
	onSelect(index: number): void;
}

const STATUS_KEY = {
	done: 'strip.status.done',
	current: 'strip.status.current',
	open: 'strip.status.open',
} as const;

/**
 * The islands you chose — the way to any of them, from any of them.
 *
 * A tester standing on "island 3 of 3" could not tell how to reach the other
 * islands he had chosen: the only way off an island was "the next one". This
 * strip sits under the island's name on every island and lists the whole
 * route — sailed (✓), the one under your feet, the ones still waiting — and
 * sails to any of them with one tap. It starts folded so the island's
 * question stays first on a phone; its summary line is a visible way out
 * even when folded.
 */
export default function IslandStrip({
	islands,
	attitudes,
	currentIndex,
	onSelect,
}: IslandStripProps) {
	const { t } = useT();
	if (islands.length < 2) return null;

	const sailed = sailedCount(islands, attitudes);
	const stops = routeStops(islands, attitudes, currentIndex);

	return (
		<details className="island-strip fade-in">
			<summary className="island-strip__summary">
				{t('strip.summary', { sailed, total: islands.length })}
			</summary>
			<nav aria-label={t('strip.nav')} className="island-strip__body">
				<ol className="island-strip__list">
					{stops.map((stop) => (
						<li key={stop.island.statementId}>
							<button
								type="button"
								className={`island-strip__stop island-strip__stop--${stop.status}`}
								aria-current={stop.status === 'current' ? 'step' : undefined}
								disabled={stop.status === 'current'}
								onClick={() => onSelect(stop.index)}
							>
								<span aria-hidden="true">
									{stop.status === 'done' ? '✓' : stop.status === 'current' ? '⚓' : '○'}
								</span>{' '}
								{stop.index + 1}. {stop.island.title}
								<span className="sr-only"> — {t(STATUS_KEY[stop.status])}</span>
							</button>
						</li>
					))}
				</ol>
				{sailed > 0 ? (
					<p className="island-strip__note">
						{t('strip.noNeedAll')}{' '}
						<Link className="underline" to="/summary">
							{t('strip.finishHere')}
						</Link>
					</p>
				) : null}
			</nav>
		</details>
	);
}
