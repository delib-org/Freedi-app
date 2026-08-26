import { proximityBandOf, type ProximityBandKey } from '../lib/seaLayout';

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
	 * to "הקישו על ספינה" a few lines above them. Tapping a hull on the Phaser
	 * sea worked; tapping the name or the coloured dot right here did nothing,
	 * and off the canvas — the direct-questionnaire route, and every screen
	 * reader — there was no tappable ship anywhere on the page.
	 */
	onSelect?: (partyId: string) => void;
}

const BAND_TITLE: Record<ProximityBandKey, string> = {
	near: 'קרובות למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקות ממסלולך',
};

/**
 * Which ships are near, said in words.
 *
 * The sea encodes proximity in how low and how large a ship rides, which is
 * true but not readable — a player looking at twelve hulls cannot tell which
 * one is closest, and that is the whole question the voyage asks. The bands on
 * the water and this list are the same fact told twice, once spatially and
 * once in Hebrew.
 *
 * Sorted by proximity, because a list has to be in some order and alphabetical
 * would be a lie about what the reader is looking for. The captions stay
 * proximity language ("עגינה זמנית") — never a recommendation.
 */
export default function NearbyShips({ ships, compact = false, onSelect }: Props) {
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
		<div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-3'}`}>
			{groups.map((group) => (
				<div key={group.band} className="flex flex-wrap items-center justify-center gap-2">
					<span className="text-[13px] opacity-70 shrink-0">{BAND_TITLE[group.band]}:</span>
					{group.ships.map((ship) => {
						const className =
							'inline-flex items-center gap-1.5 rounded-full border border-[rgba(94,223,255,0.28)] bg-[rgba(6,24,44,0.6)] px-2.5 py-1 text-[13px]';
						const dot = (
							<span
								className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
								style={{ background: ship.color }}
								aria-hidden="true"
							/>
						);

						return onSelect ? (
							<button
								key={ship.partyId}
								type="button"
								className={`${className} cursor-pointer hover:border-[rgba(94,223,255,0.7)]`}
								onClick={() => onSelect(ship.partyId)}
							>
								{dot}
								{ship.name}
							</button>
						) : (
							<span key={ship.partyId} className={className}>
								{dot}
								{ship.name}
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
}
