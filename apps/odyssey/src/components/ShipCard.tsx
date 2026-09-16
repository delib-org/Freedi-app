import { proximityBandOf } from '../lib/seaLayout';
import type { ShipProximity } from './NearbyShips';
import ShipTag from './ShipTag';

interface Props {
	ship: ShipProximity;
	onClose: () => void;
	onShowAll: () => void;
}

const BAND_SENTENCE: Record<ReturnType<typeof proximityBandOf>, string> = {
	near: 'שטה קרוב למסלול שלך',
	middle: 'שטה באמצע הדרך',
	far: 'שטה רחוק ממסלולך',
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
export default function ShipCard({ ship, onClose, onShowAll }: Props) {
	const near = ship.distance === null ? null : Math.round((1 - ship.distance) * 100);

	return (
		<div className="ship-card flex flex-col gap-2.5 text-right" role="status">
			<div className="flex items-center gap-2 flex-wrap">
				<ShipTag name={ship.name} color={ship.color} lit />
				<span className="text-[13px] opacity-85">
					{ship.distance === null
						? 'עדיין אין נתוני מסלול'
						: BAND_SENTENCE[proximityBandOf(ship.distance)]}
				</span>
				<button
					type="button"
					className="mr-auto text-[13px] opacity-70 hover:opacity-100"
					onClick={onClose}
					aria-label="סגירה"
				>
					✕
				</button>
			</div>

			{near !== null ? (
				<div className="flex items-center gap-3">
					<div className="distance-track flex-1" aria-hidden="true">
						<div className="distance-fill" style={{ width: `${near}%` }} />
					</div>
					<span className="text-[13px] opacity-85 shrink-0">קרבה {near}%</span>
				</div>
			) : null}

			<div className="flex items-center justify-between gap-3">
				<button type="button" className="text-[13px] underline opacity-80" onClick={onShowAll}>
					כל הספינות
				</button>
				<span className="text-[12px] opacity-60">עגינה זמנית — לא פסק דין ולא הוראת הצבעה.</span>
			</div>
		</div>
	);
}
