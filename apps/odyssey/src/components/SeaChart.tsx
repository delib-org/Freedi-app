import { useState } from 'react';
import { partyShipPlacement, proximityBandOf, rangeRings, seaFan } from '../lib/seaLayout';
import type { ShipProximity } from './NearbyShips';

interface Props {
	/** Party ships only — the personas keep company, they do not run. */
	ships: ShipProximity[];
	/** Open a ship's card — the same card the chips below the sea open. */
	onSelect?: (partyId: string) => void;
	/** The ship whose card is open, drawn lit. */
	selectedId?: string | null;
}

/** The chart's own coordinate space; the SVG scales to whatever width it gets. */
const WIDTH = 1000;
const HEIGHT = 620;

/** The 2.5D hull, seen from astern and above (public/assets/ship.png). */
const SHIP_SPRITE = '/assets/ship.png';
const SPRITE_RATIO = 1536 / 1024;

/**
 * The water itself — the same Mediterranean sunset every screen sits on.
 *
 * The ships have to float on a sea, not on a navy rectangle with rings drawn
 * in it: a diagram of distance is not the voyage, and the game already owns
 * the sea it happens on.
 *
 * The art is placed, not stretched. `seaLayout` sends the farthest ring to
 * 0.2 of the frame and the player's berth to 0.56, so the horizon has to sit
 * ABOVE the far ring or ships sail in the sky — these numbers put it at 0.15,
 * with water under every hull and the city left on the skyline where the
 * fiction wants it.
 */
const OCEAN = '/assets/mediterranean-ocean.png';
const OCEAN_RATIO = 1672 / 941;
/** Where the horizon falls inside the source art, and inside our frame. */
const OCEAN_HORIZON = 0.3;
const CHART_HORIZON = 0.15;
const OCEAN_HEIGHT = HEIGHT * 1.5;
const OCEAN_WIDTH = OCEAN_HEIGHT * OCEAN_RATIO;
const OCEAN_Y = HEIGHT * CHART_HORIZON - OCEAN_HEIGHT * OCEAN_HORIZON;
const OCEAN_X = (WIDTH - OCEAN_WIDTH) / 2;

/**
 * The band of that space the player actually sees.
 *
 * The maths needs the whole frame — the fan is drawn against it — but the top
 * of it is sky and the bottom is empty foreground water, and neither is worth
 * the height on a phone. The window keeps a strip of sky with the city on it,
 * every ship, and enough water in front of the berth to be sailing on.
 */
const VIEW_TOP = 46;
const VIEW_HEIGHT = 430;

/**
 * How many hulls the sea carries before the player asks for the rest.
 *
 * Twelve ships is a crowd on one horizon, and the question the voyage asks is
 * "who is near me" — so the sea answers that and keeps the rest a tap away.
 */
const NEAREST_SHOWN = 5;

/** The player's own hull. Large enough to be unmistakably the centre of the
 *  frame, small enough not to become a wall the far ships hide behind. */
const YOUR_SHIP_WIDTH = 118;

const BAND_WORD = {
	near: 'קרובה למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקה ממסלולך',
} as const;

/** SVG ids must be word-safe, and a partyId is whatever the admin typed. */
function tintId(partyId: string): string {
	return `tint-${partyId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * The sea, read from the player's own deck.
 *
 * This is the picture the voyage is actually about, and for a while it could
 * not be shown: the ships sailed on a Phaser canvas, and when the game settled
 * on the plain questionnaire that canvas stopped loading — leaving "how close
 * is each party to me", a spatial fact, told in words only.
 *
 * Nothing about the maths is new: `seaLayout` already put the player at the
 * berth and every ship on a ring whose radius is that party's distance, with
 * the LANE fixed by sortOrder so the picture never ranks anyone left to right.
 * The same tested functions drive this SVG, and the same painted hull rides
 * it, so the drawing and the stage tell one story if the stage comes back.
 */
export default function SeaChart({ ships, onSelect, selectedId }: Props) {
	const [showAll, setShowAll] = useState(false);
	const fan = seaFan(WIDTH, HEIGHT);
	const rings = rangeRings(WIDTH, HEIGHT);

	// Lane order is DOM order, which paints a far ship over a near one often
	// enough to matter — and the near ship is the whole answer the player came
	// for. Drawing order is by distance, farthest first; the lane each ship
	// sails in is still its own index, so nothing ranks anyone left to right.
	const byDistance = ships
		.map((ship, index) => ({ ship, index }))
		.sort((a, b) => (b.ship.distance ?? 0.9) - (a.ship.distance ?? 0.9));
	const drawn = showAll ? byDistance : byDistance.slice(-NEAREST_SHOWN);
	const hidden = ships.length - drawn.length;

	return (
		<div className="sea-chart">
			<svg
				viewBox={`0 ${VIEW_TOP} ${WIDTH} ${VIEW_HEIGHT}`}
				role="img"
				aria-label="הים סביב הסירה שלך"
			>
				<defs>
					<clipPath id="seaFrame">
						<rect x="0" y={VIEW_TOP} width={WIDTH} height={VIEW_HEIGHT} />
					</clipPath>
					<linearGradient id="seaShade" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="rgba(6,24,44,0.55)" />
						<stop offset="38%" stopColor="rgba(6,24,44,0.08)" />
						<stop offset="100%" stopColor="rgba(6,24,44,0.55)" />
					</linearGradient>
					{/* The hull is one painted sprite, and a party's colour is
					    multiplied into it rather than replacing it — a tinted ship is
					    still a ship; a flooded one is a silhouette. */}
					{drawn.map(({ ship }) => (
						<filter key={ship.partyId} id={tintId(ship.partyId)} colorInterpolationFilters="sRGB">
							<feFlood floodColor={ship.color} floodOpacity="0.6" result="tint" />
							<feBlend in="tint" in2="SourceGraphic" mode="multiply" result="painted" />
							<feComposite in="painted" in2="SourceAlpha" operator="in" />
						</filter>
					))}
					<filter id="tint-you" colorInterpolationFilters="sRGB">
						<feFlood floodColor="#e8b958" floodOpacity="0.45" result="tint" />
						<feBlend in="tint" in2="SourceGraphic" mode="multiply" result="painted" />
						<feComposite in="painted" in2="SourceAlpha" operator="in" />
					</filter>
				</defs>

				<g clipPath="url(#seaFrame)">
					<image
						href={OCEAN}
						x={OCEAN_X}
						y={OCEAN_Y}
						width={OCEAN_WIDTH}
						height={OCEAN_HEIGHT}
						preserveAspectRatio="xMidYMid slice"
					/>
					{/* Sky and foreground dimmed a little, so a name on the water and the
					    heading above it stay readable against a sunset. */}
					<rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#seaShade)" />

					{/* near / middle / far, drawn and never labelled — the words belong to
					    the chips under the sea and to the card a tap opens. Faint: they
					    are a reading of the water, not a HUD laid over it. */}
					{rings.map((ring, index) => (
						<ellipse
							key={ring.rx}
							cx={fan.cx}
							cy={fan.cy}
							rx={ring.rx}
							ry={ring.ry}
							fill="none"
							stroke="rgba(255,243,209,0.22)"
							strokeWidth={index === rings.length - 1 ? 1.5 : 1.2}
							strokeDasharray="6 14"
						/>
					))}
				</g>

				{drawn.map(({ ship, index }) => {
					const place = partyShipPlacement(ship.distance, index, ships.length, WIDTH, HEIGHT);
					const width = 1024 * place.scale * 0.62;
					const height = width * SPRITE_RATIO;
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
							{/* A generous transparent disc: a distant hull is not a tap
							    target, and this is a screen people use on a phone. */}
							<circle r={Math.max(width * 0.55, 26)} fill="transparent" />
							<ellipse cy={-2} rx={width * 0.34} ry={width * 0.07} fill="rgba(4,18,34,0.35)" />
							<ellipse
								cy={-1}
								rx={width * 0.3}
								ry={width * 0.05}
								fill="none"
								stroke="rgba(255,255,255,0.35)"
								strokeWidth={Math.max(1, width * 0.02)}
							/>
							<image
								href={SHIP_SPRITE}
								x={-width / 2}
								y={-height * 0.93}
								width={width}
								height={height}
								filter={`url(#${tintId(ship.partyId)})`}
								preserveAspectRatio="xMidYMax meet"
							/>
							<text className="sea-ship__name" y={26} textAnchor="middle">
								{ship.name}
							</text>
						</g>
					);
				})}

				{/* The player, at the berth every ring is drawn around. */}
				<g className="sea-you">
					<ellipse cx={fan.cx} cy={fan.cy - 2} rx={44} ry={9} fill="rgba(4,18,34,0.4)" />
					<ellipse
						cx={fan.cx}
						cy={fan.cy - 1}
						rx={40}
						ry={7}
						fill="none"
						stroke="rgba(255,255,255,0.4)"
						strokeWidth="2"
					/>
					<image
						href={SHIP_SPRITE}
						x={fan.cx - YOUR_SHIP_WIDTH / 2}
						y={fan.cy - YOUR_SHIP_WIDTH * SPRITE_RATIO * 0.93}
						width={YOUR_SHIP_WIDTH}
						height={YOUR_SHIP_WIDTH * SPRITE_RATIO}
						filter="url(#tint-you)"
						preserveAspectRatio="xMidYMax meet"
					/>
					<text className="sea-chart__you" x={fan.cx} y={fan.cy + 32} textAnchor="middle">
						הסירה שלך
					</text>
				</g>
			</svg>

			{hidden > 0 || showAll ? (
				<div className="sea-chart__more">
					<button
						type="button"
						className="btn-outline !py-1.5 !px-4 !text-[13px]"
						onClick={() => setShowAll(!showAll)}
					>
						{showAll ? `להציג רק את ${NEAREST_SHOWN} הקרובות` : `להציג עוד ${hidden} ספינות`}
					</button>
				</div>
			) : null}
		</div>
	);
}
