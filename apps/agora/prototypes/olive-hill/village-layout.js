/**
 * Where the village stands. Kept apart from the buildings so the characters
 * can be placed against the same anchors without importing them back.
 *
 * The village is meant to be walked across: from the square it takes a good
 * half minute to reach the far side, and the booth ring widens with the
 * number of questions, so a long lesson is a bigger village and not a
 * tighter one.
 */

/** The village square every path leads to, and every booth board faces. */
export const CENTER = { x: 0, z: 15 };

/**
 * The three fixed sites. Each is an anchor its whole site is drawn around —
 * floor, walls, sign, guides and approach point all move with it — so the
 * village can be spread out by moving three numbers.
 */
export const PLACES = {
	library: { x: -32, z: 15 },
	study: { x: -19, z: 1 },
	council: { x: 21, z: 0 },
};

/** The arc left free by the fixed sites: east → south → south-west. */
const ARC_FIRST = 12, ARC_LAST = 152;
/** Clear ground between two neighbouring pavilions (a pavilion is 8 wide). */
const BOOTH_GAP = 15;
/** However few the questions, the ring stays a walk away from the square; however many, it stops widening here. */
export const RING_MIN = 22, RING_MAX = 34;

/**
 * How far the booth ring stands from the square. Two booths on a wide arc
 * need no room; eight crowded into the same arc need a lot, so the ring
 * grows until the gap between neighbours is a pavilion and a half.
 */
export function villageRadius(count) {
	if (count < 2) return RING_MIN;
	const step = (((ARC_LAST - ARC_FIRST) / (count - 1)) * Math.PI) / 180;

	return Math.min(RING_MAX, Math.max(RING_MIN, BOOTH_GAP / (2 * Math.sin(step / 2))));
}

/**
 * Where N booths stand: on that ring, spread evenly over the free arc, each
 * turned to face the square, with its approach point a few steps in front.
 */
export function boothLayout(count) {
	const radius = villageRadius(count);
	const step = count > 1 ? (ARC_LAST - ARC_FIRST) / (count - 1) : 0;

	return Array.from({ length: count }, (_, i) => {
		const angle = ((count > 1 ? ARC_FIRST + step * i : 82) * Math.PI) / 180;
		const x = CENTER.x + Math.cos(angle) * radius, z = CENTER.z + Math.sin(angle) * radius;
		// Face the square: the local +z axis points at the centre.
		const facing = Math.atan2(CENTER.x - x, CENTER.z - z);
		const toward = { x: Math.sin(facing), z: Math.cos(facing) };

		return { x, z, facing, ax: x + toward.x * 5.6, az: z + toward.z * 5.6 };
	});
}
