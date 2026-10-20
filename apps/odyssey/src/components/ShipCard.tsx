import { proximityBandOf, type ProximityBandKey } from '../lib/seaLayout';
import { aiPersonaNote } from '../lib/counsel';
import { useT } from '../i18n/useT';
import type { ShipProximity } from './NearbyShips';
import ShipTag from './ShipTag';

interface Props {
	ship: ShipProximity;
	/**
	 * A sailor's reaction to the shore the island answered (reveal phase only,
	 * and only when the ship is a sailor's); parties have none.
	 */
	reaction?: string | null;
	onClose: () => void;
	onShowAll: () => void;
}

const BAND_SENTENCE_KEY: Record<ProximityBandKey, string> = {
	near: 'ships.band.near.sentence',
	middle: 'ships.band.middle.sentence',
	far: 'ships.band.far.sentence',
};

/**
 * One ship, answered.
 *
 * The sea says how near a party is by where it rides, and draws the course
 * from your boat to the ship you picked; this puts a number on that course,
 * for the player who wants the answer rather than the picture — and for
 * anyone reading the page with a screen reader, who gets no picture at all.
 * It is headed by the same lit pennant the ship flies on the water, so there
 * is no doubt which ship it is about.
 *
 * A bar, not a score: the reading is a proximity on the islands answered so
 * far, and the caption says so plainly. Nothing here ranks the party against
 * the others, which is what the standing list is for.
 */
export default function ShipCard({ ship, reaction = null, onClose, onShowAll }: Props) {
	const { t } = useT();
	// The ring is relative to the fleet; the number is the true proximity.
	const trueDistance = ship.trueDistance === undefined ? ship.distance : ship.trueDistance;
	const near = trueDistance === null ? null : Math.round((1 - trueDistance) * 100);

	return (
		<div className="ship-card flex flex-col gap-2.5 text-start" role="status">
			<div className="flex items-center gap-2 flex-wrap">
				<ShipTag name={ship.name} color={ship.color} lit />
				<span className="text-[13px] opacity-85">
					{ship.distance === null
						? t('ships.noRouteData')
						: t(BAND_SENTENCE_KEY[proximityBandOf(ship.distance)])}
				</span>
				<button
					type="button"
					className="ms-auto text-[13px] opacity-70 hover:opacity-100"
					onClick={onClose}
					aria-label={t('common.close')}
				>
					✕
				</button>
			</div>

			{near !== null ? (
				<div className="flex items-center gap-3">
					<div className="distance-track flex-1" aria-hidden="true">
						<div className="distance-fill" style={{ width: `${near}%` }} />
					</div>
					<span className="text-[13px] opacity-85 shrink-0">
						{t('ships.proximity', { percent: near })}
					</span>
				</div>
			) : null}

			{reaction ? (
				<>
					<p className="ship-card__reaction">{reaction}</p>
					<p className="ship-card__note">{aiPersonaNote()}</p>
				</>
			) : null}

			<div className="flex items-center justify-between gap-3">
				<button type="button" className="text-[13px] underline opacity-80" onClick={onShowAll}>
					{t('ships.all')}
				</button>
				<span className="text-[12px] opacity-60">{t('ships.temporaryBerth')}</span>
			</div>
		</div>
	);
}
