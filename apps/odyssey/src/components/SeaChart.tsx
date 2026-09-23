import { useLayoutEffect, useRef, useState } from 'react';
import {
	partyShipPlacement,
	proximityBandOf,
	rangeRings,
	seaFan,
	type ProximityBandKey,
} from '../lib/seaLayout';
import type { ShipProximity } from './NearbyShips';
import ShipTag from './ShipTag';
import {
	FRAME_PAD,
	LANDSCAPE,
	PORTRAIT,
	PORTRAIT_BELOW,
	SPRITE_ABOVE_WATER,
	SPRITE_RATIO,
	YOUR_SHIP_WIDTH,
	hullPolygon,
	measureName,
	placePennants,
	type ChartSpace,
	type TagPlacement,
} from '../lib/seaPennants';

interface Props {
	/** Party ships only — the personas keep company, they do not run. */
	ships: ShipProximity[];
	/** Open a ship's card — the same card the chips below the sea open. */
	onSelect?: (partyId: string) => void;
	/** The ship whose card is open, drawn lit. */
	selectedId?: string | null;
}

/** The 2.5D hull, seen from astern and above (public/assets/ship.png). */
const SHIP_SPRITE = '/assets/ship.png';
/**
 * The water itself — the same Mediterranean sunset every screen sits on.
 *
 * The art is placed, not stretched. `seaLayout` sends the farthest ring to
 * 0.2 of the frame and the player's berth to 0.56, so the horizon has to sit
 * ABOVE the far ring or ships sail in the sky — these numbers put it at 0.15,
 * with water under every hull and the city left on the skyline where the
 * fiction wants it.
 */
const OCEAN = '/assets/mediterranean-ocean.png';
const OCEAN_RATIO = 1672 / 941;
const OCEAN_HORIZON = 0.3;
const CHART_HORIZON = 0.15;

function oceanRect(space: ChartSpace): { x: number; y: number; width: number; height: number } {
	const height = space.height * 1.5;
	const width = height * OCEAN_RATIO;

	return {
		x: (space.width - width) / 2,
		y: space.height * CHART_HORIZON - height * OCEAN_HORIZON,
		width,
		height,
	};
}

interface PlacedShip {
	ship: ShipProximity;
	x: number;
	y: number;
	alpha: number;
	width: number;
	height: number;
	lit: boolean;
	label: string;
}

/** How many hulls the sea carries before the player asks for the rest. */
const NEAREST_SHOWN = 5;
const BAND_WORD: Record<ProximityBandKey, string> = {
	near: 'קרובה למסלולך',
	middle: 'באמצע הדרך',
	far: 'רחוקה ממסלולך',
};

/** What each ring is, said once on the water in the words the rows below use. */
const RING_CAPTION: Record<ProximityBandKey, string> = {
	near: 'קרובות',
	middle: 'באמצע',
	far: 'רחוקות',
};
const RING_BANDS: ProximityBandKey[] = ['near', 'middle', 'far'];
/** A caption's padding, measured against the pennant type it is smaller than. */
const CAPTION_CHROME = 12;
/** A caption box, for keeping pennants off it. */
const CAPTION_HEIGHT = 18;
/** Where on each ring its caption sits: aft of the beam, over open water. */
const CAPTION_ANGLE = (118 * Math.PI) / 180;

/** SVG ids must be word-safe, and a partyId is whatever the admin typed. */
function tintId(partyId: string): string {
	return `tint-${partyId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
/**
 * The sea, read from the player's own deck.
 *
 * `seaLayout` puts the player at the berth and every ship on a ring whose
 * radius is that party's distance, with the LANE fixed by sortOrder so the
 * picture never ranks anyone left to right. This SVG draws exactly that.
 *
 * What the drawing adds is legibility: every hull flies a pennant with its
 * party's colour and name — always, not on hover, because a phone has no
 * hover — and the pennant is the same badge as the chip under the sea and
 * the heading of the card, so the three read as one instrument. The picked
 * ship is lit, ringed in gold, and joined to the player's boat by a course
 * line whose length is the distance the card puts a number on.
 */
export default function SeaChart({ ships, onSelect, selectedId }: Props) {
	const [showAll, setShowAll] = useState(false);
	/** The ship under the pointer, on the hull or on its pennant. */
	const [hovered, setHovered] = useState<string | null>(null);
	/** The frame's width in CSS pixels — pennants are laid out in pixels. */
	const [frameWidth, setFrameWidth] = useState(0);
	const frameRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const frame = frameRef.current;
		if (!frame) return undefined;
		const measure = () => setFrameWidth(frame.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(frame);

		return () => observer.disconnect();
	}, []);

	const space = frameWidth > 0 && frameWidth < PORTRAIT_BELOW ? PORTRAIT : LANDSCAPE;
	const scale = frameWidth / space.width;
	const fan = seaFan(space.width, space.height);
	const rings = rangeRings(space.width, space.height);
	const ocean = oceanRect(space);
	const yourWidth = YOUR_SHIP_WIDTH * space.hull;

	// Drawing order is by distance, farthest first, so the near ship — the
	// answer the player came for — is painted over the far one. The lane each
	// ship sails in is still its own roster index, so nothing ranks anyone.
	const byDistance = ships
		.map((ship, index) => ({ ship, index }))
		.sort((a, b) => (b.ship.distance ?? 0.9) - (a.ship.distance ?? 0.9));
	const drawn = showAll ? byDistance : byDistance.slice(-NEAREST_SHOWN);
	const hidden = ships.length - drawn.length;

	// Lanes are shared out among the ships actually on the water, in roster
	// order — five ships get the whole fan to spread across.
	const lanes = new Map(
		drawn
			.map((entry) => entry.index)
			.sort((a, b) => a - b)
			.map((index, lane) => [index, lane]),
	);

	const placed: PlacedShip[] = drawn.map(({ ship, index }) => {
		const place = partyShipPlacement(
			ship.distance,
			lanes.get(index) ?? index,
			lanes.size,
			space.width,
			space.height,
		);
		// A full fleet on one horizon is a crowd, so opening the rest trims every hull.
		const width = 1024 * place.scale * (showAll ? 0.5 * space.hullCrowd : 0.62 * space.hull);

		return {
			ship,
			x: place.x,
			y: place.y,
			alpha: place.alpha,
			width,
			height: width * SPRITE_RATIO,
			lit: selectedId === ship.partyId,
			label: `${ship.name} — ${
				ship.distance === null
					? 'עדיין אין מספיק נתונים'
					: BAND_WORD[proximityBandOf(ship.distance)]
			}`,
		};
	});

	const picked = placed.find((entry) => entry.lit) ?? null;
	// The lit pennant is painted last, over any neighbour's.
	const pennantOrder = [...placed].sort((a, b) => Number(a.lit) - Number(b.lit));

	// Ring captions sit on their ring, aft of the beam; on a narrow frame the
	// outer ones slide in so no word is cut at the edge.
	const captions = rings.map((ring, index) => {
		const band = RING_BANDS[index];
		const width = CAPTION_CHROME + measureName(RING_CAPTION[band]);

		return {
			band,
			width,
			x: Math.min(
				(fan.cx + Math.sin(CAPTION_ANGLE) * ring.rx) * scale,
				space.width * scale - FRAME_PAD - width,
			),
			y: (fan.cy - Math.cos(CAPTION_ANGLE) * ring.ry - space.viewTop) * scale,
		};
	});

	const pennants =
		scale > 0
			? placePennants(
					placed.map(({ ship, x, y, width, height }) => ({
						partyId: ship.partyId,
						name: ship.name,
						x,
						y,
						width,
						height,
					})),
					space,
					scale,
					{ x: fan.cx, y: fan.cy },
					captions.map((caption) => ({
						x: caption.x,
						y: caption.y - CAPTION_HEIGHT / 2,
						w: caption.width,
						h: CAPTION_HEIGHT,
					})),
				)
			: new Map<string, TagPlacement>();

	return (
		<div className="sea-chart">
			<div className="sea-chart__frame" ref={frameRef}>
				<svg
					viewBox={`0 ${space.viewTop} ${space.width} ${space.viewHeight}`}
					role="img"
					aria-label="הים סביב הסירה שלך"
				>
					<defs>
						<clipPath id="seaFrame">
							<rect x="0" y={space.viewTop} width={space.width} height={space.viewHeight} />
						</clipPath>
						<linearGradient id="seaShade" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="rgba(6,24,44,0.55)" />
							<stop offset="38%" stopColor="rgba(6,24,44,0.08)" />
							<stop offset="100%" stopColor="rgba(6,24,44,0.55)" />
						</linearGradient>
						{/* The hull is one painted sprite, and a party's colour is
						    multiplied into it rather than replacing it — a tinted ship is
						    still a ship; a flooded one is a silhouette. */}
						{placed.map(({ ship }) => (
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
							x={ocean.x}
							y={ocean.y}
							width={ocean.width}
							height={ocean.height}
							preserveAspectRatio="xMidYMid slice"
						/>
						<rect x="0" y="0" width={space.width} height={space.height} fill="url(#seaShade)" />

						{/* near / middle / far. Faint: a reading of the water, not a HUD. */}
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

						{/* The course from your boat to the ship you picked. Its length IS
						    the distance the card gives a number to — the two are one fact. */}
						{picked ? (
							<line
								className="sea-course"
								x1={fan.cx}
								y1={fan.cy - 4}
								x2={picked.x}
								y2={picked.y - 2}
							/>
						) : null}
					</g>

					{/* Leader lines: a pennant that had to climb away from its masthead
					    stays tied to it. Under the hulls, so they never cover a ship. */}
					<g className="sea-leaders" aria-hidden="true">
						{placed.map((entry) => {
							const leader = pennants.get(entry.ship.partyId)?.leader;
							if (!leader) return null;

							return (
								<line
									key={entry.ship.partyId}
									x1={leader.from.x}
									y1={leader.from.y}
									x2={leader.to.x}
									y2={leader.to.y}
								/>
							);
						})}
					</g>

					{/* Hulls. Decorative here — the pennant above each one is the
					    button a screen reader and a keyboard reach; the hull is a
					    pointer target for the player who aims at the ship itself. */}
					{placed.map(({ ship, x, y, alpha, width, height, lit }) => {
						const hot = hovered === ship.partyId;

						return (
							<g
								key={ship.partyId}
								className={`sea-ship${lit ? ' sea-ship--lit' : ''}${hot ? ' sea-ship--hot' : ''}`}
								data-party={ship.partyId}
								transform={`translate(${x} ${y})`}
								opacity={lit ? 1 : alpha}
								aria-hidden="true"
								onPointerEnter={() => setHovered(ship.partyId)}
								onPointerLeave={() =>
									setHovered((current) => (current === ship.partyId ? null : current))
								}
								onClick={onSelect ? () => onSelect(ship.partyId) : undefined}
							>
								{/* The pointer surface is the hull's own silhouette — masts,
								    sails, hull — and nothing else in the sprite's frame. The
								    image and the wake beneath it take no events at all. */}
								<polygon className="sea-ship__hit" points={hullPolygon(width, height)} />
								<ellipse
									cy={-2}
									rx={width * 0.34}
									ry={width * 0.07}
									fill="rgba(4,18,34,0.35)"
									pointerEvents="none"
								/>
								{lit ? (
									<ellipse
										className="sea-ship__pick"
										cy={-1}
										rx={width * 0.4}
										ry={width * 0.085}
										pointerEvents="none"
									/>
								) : (
									<ellipse
										cy={-1}
										rx={width * 0.3}
										ry={width * 0.05}
										fill="none"
										stroke="rgba(255,255,255,0.35)"
										strokeWidth={Math.max(1, width * 0.02)}
										pointerEvents="none"
									/>
								)}
								<image
									href={SHIP_SPRITE}
									x={-width / 2}
									y={-height * SPRITE_ABOVE_WATER}
									width={width}
									height={height}
									filter={`url(#${tintId(ship.partyId)})`}
									preserveAspectRatio="xMidYMax meet"
									pointerEvents="none"
								/>
							</g>
						);
					})}

					{/* The player, at the berth every ring is drawn around. Painted last
					    of the hulls, and taking no pointer events: a hull that covers a
					    ship must not also swallow the tap meant for it. */}
					<g className="sea-you" aria-hidden="true">
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
							x={fan.cx - yourWidth / 2}
							y={fan.cy - yourWidth * SPRITE_RATIO * SPRITE_ABOVE_WATER}
							width={yourWidth}
							height={yourWidth * SPRITE_RATIO}
							filter="url(#tint-you)"
							preserveAspectRatio="xMidYMax meet"
						/>
					</g>
				</svg>

				{/* Everything written on the water is HTML, so it is the same size
				    on a phone as on a desk: the ring captions, the player's own
				    berth, and a pennant for every ship. */}
				{scale > 0 ? (
					<div className="sea-overlay">
						{captions.map((caption) => (
							<span
								key={caption.band}
								className="sea-caption"
								style={{ left: caption.x, top: caption.y }}
								aria-hidden="true"
							>
								{RING_CAPTION[caption.band]}
							</span>
						))}
						<span
							className="sea-berth"
							style={{ left: fan.cx * scale, top: (fan.cy - space.viewTop) * scale + 8 }}
						>
							הסירה שלך
						</span>
						<div className="sea-pennants" role="group" aria-label="הספינות על הים">
							{pennantOrder.map((entry) => {
								const placement = pennants.get(entry.ship.partyId);
								if (!placement) return null;

								return (
									<ShipTag
										key={entry.ship.partyId}
										name={entry.ship.name}
										color={entry.ship.color}
										lit={entry.lit}
										hot={hovered === entry.ship.partyId}
										dim={picked !== null && !entry.lit}
										ariaLabel={entry.label}
										partyId={entry.ship.partyId}
										onSelect={onSelect ? () => onSelect(entry.ship.partyId) : undefined}
										onHover={(hovering) =>
											setHovered((current) =>
												hovering
													? entry.ship.partyId
													: current === entry.ship.partyId
														? null
														: current,
											)
										}
										className="ship-tag--afloat"
										style={{ left: placement.box.x, top: placement.box.y, width: placement.box.w }}
									/>
								);
							})}
						</div>
					</div>
				) : null}
			</div>

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
