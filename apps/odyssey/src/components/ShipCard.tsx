import { proximityBandOf } from '../lib/seaLayout';
import type { ShipProximity } from './NearbyShips';

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
 * The sea says how near a party is by where it rides; this says it in words
 * for the player who wants the answer rather than the picture — and for anyone
 * reading the page with a screen reader, who gets no picture at all.
 *
 * A bar, not a score: the reading is a proximity on the islands answered so
 * far, and the caption says so plainly. Nothing here ranks the party against
 * the others, which is what the standing list is for.
 */
export default function ShipCard({ ship, onClose, onShowAll }: Props) {
	const near = ship.distance === null ? null : Math.round((1 - ship.distance) * 100);

	return (
		<div className="panel !py-3 flex flex-col gap-2.5 text-right" role="status">
			<div className="flex items-center gap-2">
				<span
					className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
					style={{ background: ship.color }}
					aria-hidden="true"
				/>
				<strong className="text-[16px] text-[var(--cream)]">{ship.name}</strong>
				<span className="text-[13px] opacity-80">
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
