import { partyShipPlacement, proximityBandOf, rangeRings, seaFan } from '../lib/seaLayout';
import type { ShipProximity } from './NearbyShips';

export interface SeaChartShip extends ShipProximity {
	/** 📜 personas sail the same water, marked as what they are */
	isElder?: boolean;
}

interface Props {
	ships: SeaChartShip[];
	/** Open a ship's card — the same card the chips below the sea open. */
	onSelect?: (partyId: string) => void;
	/** The ship whose card is open, drawn lit. */
	selectedId?: string | null;
}

/** The chart's own coordinate space; the SVG scales to whatever width it gets. */
const WIDTH = 1000;
const HEIGHT = 620;

const BAND_WORD = {
	near: 'קרובה למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקה ממסלולך',
} as const;

/**
 * The sea, read from the player's own deck.
 *
 * This is the picture the voyage always promised and, for a while, could not
 * show: the ships sailed on a Phaser canvas, and when the game settled on the
 * plain questionnaire the canvas stopped loading — leaving "how close is each
 * party to me" as three lists of names. Distance is a spatial fact and wants a
 * spatial answer.
 *
 * Nothing about the maths is new: `seaLayout` already placed the player at the
 * berth and every ship on a ring whose radius is that party's distance, with
 * the LANE fixed by sortOrder so the picture never ranks anyone left to right.
 * Those same tested functions drive this SVG, so the drawing and the canvas
 * that may come back tell one story.
 */
export default function SeaChart({ ships, onSelect, selectedId }: Props) {
	const fan = seaFan(WIDTH, HEIGHT);
	const rings = rangeRings(WIDTH, HEIGHT);

	// Lane order is DOM order, which paints a far ship over a near one often
	// enough to matter — and the near ship is the whole answer the player came
	// for. Drawing order is by distance; the lane each ship sails in is still
	// its own index, so nothing about the picture ranks anyone left to right.
	const drawOrder = ships
		.map((ship, index) => ({ ship, index }))
		.sort((a, b) => (b.ship.distance ?? 0.9) - (a.ship.distance ?? 0.9));

	return (
		<div className="sea-chart">
			<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="הים סביב הסירה שלך">
				<defs>
					<radialGradient id="seaLight" cx="50%" cy="56%" r="62%">
						<stop offset="0%" stopColor="rgba(94,223,255,0.20)" />
						<stop offset="100%" stopColor="rgba(94,223,255,0)" />
					</radialGradient>
				</defs>

				{/* The water immediately around the player, so the berth reads as a
				    place on the sea rather than a mark on a diagram. */}
				<ellipse cx={fan.cx} cy={fan.cy} rx={fan.rx} ry={fan.ry} fill="url(#seaLight)" />

				{/* near / middle / far, drawn and never labelled — the words belong to
				    the chips under the sea and to the card a tap opens. */}
				{rings.map((ring, index) => (
					<ellipse
						key={ring.rx}
						cx={fan.cx}
						cy={fan.cy}
						rx={ring.rx}
						ry={ring.ry}
						fill="none"
						stroke="rgba(94,223,255,0.28)"
						strokeWidth={index === rings.length - 1 ? 2 : 1.5}
						strokeDasharray="7 11"
					/>
				))}

				{drawOrder.map(({ ship, index }) => {
					const place = partyShipPlacement(ship.distance, index, ships.length, WIDTH, HEIGHT);
					const size = 390 * place.scale;
					const band = proximityBandOf(ship.distance);
					const lit = selectedId === ship.partyId;
					const label = `${ship.name} — ${
						ship.distance === null ? 'עדיין אין מספיק נתונים' : BAND_WORD[band]
					}`;

					return (
						<g
							key={ship.partyId}
							className={`sea-ship ${lit ? 'sea-ship--lit' : ''}`}
							transform={`translate(${place.x} ${place.y})`}
							opacity={place.alpha}
							role={onSelect ? 'button' : undefined}
							tabIndex={onSelect ? 0 : undefined}
							aria-label={onSelect ? label : undefined}
							onClick={onSelect ? () => onSelect(ship.partyId) : undefined}
							onKeyDown={
								onSelect
									? (event) => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault();
												onSelect(ship.partyId);
											}
										}
									: undefined
							}
						>
							<title>{label}</title>
							{/* A generous transparent disc: a hull 30px across is not a tap
							    target, and this is a screen people use on a phone. */}
							<circle r={Math.max(size * 0.8, 26)} fill="transparent" />
							<g transform={`scale(${size / 100})`}>
								<ellipse cx="0" cy="34" rx="44" ry="7" fill="rgba(4,18,34,0.45)" />
								<path d="M-36 20 L36 20 L26 36 L-26 36 Z" fill={ship.color} />
								<path d="M-36 20 L36 20 L33 26 L-33 26 Z" fill="rgba(255,243,209,0.35)" />
								<line
									x1="0"
									y1="20"
									x2="0"
									y2="-40"
									stroke="rgba(255,243,209,0.8)"
									strokeWidth="3"
								/>
								<path d="M4 -38 L34 14 L4 14 Z" fill="rgba(255,243,209,0.92)" />
								<path d="M-6 -26 L-30 14 L-6 14 Z" fill="rgba(255,243,209,0.7)" />
							</g>
							{/* A persona flies a pennant rather than a 📜: the emoji renders as
							    a brown lozenge at hull size, and a flag is what a ship uses to
							    say who it is. The scroll stays in every word about it. */}
							{ship.isElder ? (
								<g transform={`scale(${size / 100})`}>
									<path d="M0 -40 L26 -33 L0 -26 Z" fill="rgba(255,243,209,0.95)" />
								</g>
							) : null}
							<text className="sea-ship__name" y={size * 0.62 + 20} textAnchor="middle">
								{ship.name}
							</text>
						</g>
					);
				})}

				{/* The player, at the berth every ring is drawn around. */}
				<g transform={`translate(${fan.cx} ${fan.cy})`}>
					<g transform="scale(0.55)">
						<ellipse cx="0" cy="34" rx="50" ry="8" fill="rgba(4,18,34,0.5)" />
						<path d="M-40 18 L40 18 L28 38 L-28 38 Z" fill="var(--gold-strong)" />
						<line x1="0" y1="18" x2="0" y2="-46" stroke="rgba(255,243,209,0.95)" strokeWidth="4" />
						<path d="M5 -44 L40 12 L5 12 Z" fill="rgba(255,243,209,0.95)" />
						<path d="M-7 -30 L-34 12 L-7 12 Z" fill="rgba(255,243,209,0.8)" />
					</g>
					<text className="sea-chart__you" y={44} textAnchor="middle">
						הסירה שלך
					</text>
				</g>
			</svg>
		</div>
	);
}
