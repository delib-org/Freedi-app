import { proximityBandOf, type ProximityBandKey } from '../lib/seaLayout';
import ShipTag from './ShipTag';

export interface ShipProximity {
	partyId: string;
	name: string;
	color: string;
	/** 0 = sailing your course, 1 = opposite horizon; null = not enough data */
	distance: number | null;
}

interface Props {
	ships: ShipProximity[];
	/** the compact chip row that sits under the sea stage */
	compact?: boolean;
	/**
	 * Open this ship's card. Given, every chip becomes a button.
	 *
	 * Without it these were `<span>`s, and the voyage screen invited the player
	 * to "הקישו על ספינה" a few lines above them. Off the canvas — the
	 * direct-questionnaire route, and every screen reader — there was no
	 * tappable ship anywhere on the page.
	 */
	onSelect?: (partyId: string) => void;
	/** The ship whose card is open: its chip goes gold, the same as its pennant
	 *  on the water and the heading of the card. */
	selectedId?: string | null;
	/**
	 * Heading for this list. Elders are rendered as their OWN list under their
	 * own heading rather than sorted in among the parties: a reviewer found
	 * Golda Meir riding in the same row as the parties on a screen whose whole
	 * job is telling you which party sails near you, and read it as a claim
	 * that she was running.
	 */
	caption?: string;
}

const BAND_TITLE: Record<ProximityBandKey, string> = {
	near: 'קרובות למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקות ממסלולך',
};

const BAND_WORD: Record<ProximityBandKey, string> = {
	near: 'קרובה למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקה ממסלולך',
};

/**
 * Which ships are near, said in words.
 *
 * The sea encodes proximity in which ring a ship rides; these rows are the
 * same three rings — near, middle, far — as a list, with the same pennant on
 * each ship. Sorted by proximity within a row, because a list has to be in
 * some order and alphabetical would be a lie about what the reader is looking
 * for. The captions stay proximity language ("עגינה זמנית") — never a
 * recommendation.
 */
export default function NearbyShips({
	ships,
	compact = false,
	onSelect,
	selectedId,
	caption,
}: Props) {
	const known = ships
		.filter((ship) => ship.distance !== null)
		.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));

	if (known.length === 0) {
		return <p className="m-0 text-[13px] opacity-80">עדיין אין מספיק נתונים על מסלולי הספינות.</p>;
	}

	const groups = (['near', 'middle', 'far'] as const)
		.map((band) => ({
			band,
			ships: known.filter((ship) => proximityBandOf(ship.distance) === band),
		}))
		.filter((group) => group.ships.length > 0);

	return (
		<div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2.5'}`}>
			{caption ? <p className="text-[13px] opacity-70 m-0 text-center">{caption}</p> : null}
			{groups.map((group) => (
				<div key={group.band} className="ship-row">
					<span className="ship-row__band">{BAND_TITLE[group.band]}:</span>
					{group.ships.map((ship) => (
						<ShipTag
							key={ship.partyId}
							name={ship.name}
							color={ship.color}
							lit={selectedId === ship.partyId}
							ariaLabel={`${ship.name} — ${BAND_WORD[group.band]}`}
							onSelect={onSelect ? () => onSelect(ship.partyId) : undefined}
						/>
					))}
				</div>
			))}
		</div>
	);
}
