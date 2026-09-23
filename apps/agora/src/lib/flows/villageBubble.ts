/**
 * The writing bubble at a booth's table. The paper is written in the speech
 * bubble of the booth's guide, so the bubble hangs beside that figure — on
 * the side of the screen with room — and its tail points at them. The world
 * reports where the guide's head is (`agora-village-anchor`); everything
 * else is layout, kept here so it can be tested without a browser.
 */

/** Where the booth's guide stands on the world's screen, and who they are */
export interface BubbleAnchor {
	x: number;
	y: number;
	speaker: string;
	/** Where the paper lies on screen — the bubble hangs on the guide's other side, off the table */
	avoidX?: number;
}

/** The world frame inside the shell, in shell pixels */
export interface BubbleBox {
	width: number;
	frameTop: number;
	frameHeight: number;
	/** Space occupied by the persistent navigation, including its safe area. */
	bottomInset?: number;
}

export interface BubblePlacement {
	left: number;
	top: number;
	width: number;
	maxHeight: number;
	/** Absent when the bubble is centred (a phone, or no guide in view) */
	tail: { side: 'left' | 'right'; left: number; top: number } | null;
}

export const BUBBLE = {
	MAX_WIDTH: 480,
	GUTTER: 16,
	/** Below this width there is no room beside the figure: centre the bubble */
	NARROW: 720,
	/** Space between the figure's head and the bubble's edge */
	GAP: 56,
	/** Below the stage strip: the same 70px ceiling as the open panels and world-scene's topRoom */
	TOP_FLOOR: 70,
	BOTTOM_ROOM: 24,
	/** How far above the head the bubble starts: it uses the sky over the guide, the tail still meets the head */
	LIFT: 300,
	MIN_HEIGHT: 240,
	/** Narrower than this beside the figure, the bubble takes the other side */
	MIN_WIDTH: 320,
	TAIL: 22,
	TAIL_INSET: 24,
} as const;

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(value, Math.max(min, max)));

export function bubblePlacement(box: BubbleBox, anchor: BubbleAnchor | null): BubblePlacement {
	const width = Math.max(0, Math.min(BUBBLE.MAX_WIDTH, box.width - 2 * BUBBLE.GUTTER));
	const bottom = Math.max(
		box.frameTop,
		box.frameTop + box.frameHeight - Math.max(BUBBLE.BOTTOM_ROOM, box.bottomInset ?? 0),
	);
	const topFloor = Math.max(box.frameTop, Math.min(BUBBLE.TOP_FLOOR, bottom - BUBBLE.MIN_HEIGHT));
	const topOf = (y: number): number => clamp(y, topFloor, bottom - BUBBLE.MIN_HEIGHT);
	const heightFrom = (top: number): number => Math.max(0, bottom - top);

	if (!anchor || box.width < BUBBLE.NARROW) {
		const top = topOf(BUBBLE.TOP_FLOOR);

		return { left: (box.width - width) / 2, top, width, maxHeight: heightFrom(top), tail: null };
	}

	const headY = box.frameTop + anchor.y;
	const top = topOf(headY - BUBBLE.LIFT);
	// The bubble goes on the side of the guide where the table is not, and
	// takes the other side only when there is no room to write on this one.
	const roomRight = box.width - BUBBLE.GUTTER - (anchor.x + BUBBLE.GAP);
	const roomLeft = anchor.x - BUBBLE.GAP - BUBBLE.GUTTER;
	const deskOnRight =
		anchor.avoidX !== undefined ? anchor.avoidX > anchor.x : anchor.x >= box.width / 2;
	let toRight = !deskOnRight;
	const room = (right: boolean): number => (right ? roomRight : roomLeft);
	if (room(toRight) < BUBBLE.MIN_WIDTH && room(!toRight) >= BUBBLE.MIN_WIDTH) toRight = !toRight;
	const bubbleWidth = clamp(room(toRight), Math.min(BUBBLE.MIN_WIDTH, width), width);
	const left = clamp(
		toRight ? anchor.x + BUBBLE.GAP : anchor.x - BUBBLE.GAP - bubbleWidth,
		BUBBLE.GUTTER,
		box.width - bubbleWidth - BUBBLE.GUTTER,
	);
	const maxHeight = heightFrom(top);
	// The tail meets the guide's head, anywhere along the bubble's side.
	const tailTop = clamp(
		headY - BUBBLE.TAIL / 2,
		top + BUBBLE.TAIL_INSET,
		top + maxHeight - BUBBLE.TAIL_INSET - BUBBLE.TAIL,
	);

	return {
		left,
		top,
		width: bubbleWidth,
		maxHeight,
		tail: toRight
			? { side: 'left', left: left - BUBBLE.TAIL, top: tailTop }
			: { side: 'right', left: left + bubbleWidth, top: tailTop },
	};
}

/** The world's anchor message, or null when the guide is off screen or the payload is not one */
export function readBubbleAnchor(payload: unknown): BubbleAnchor | null {
	if (!payload || typeof payload !== 'object') return null;
	const data = payload as Record<string, unknown>;
	if (data.type !== 'agora-village-anchor' || data.visible !== true) return null;
	if (typeof data.x !== 'number' || typeof data.y !== 'number') return null;
	if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return null;

	const speaker = typeof data.speaker === 'string' ? data.speaker : '';
	const avoidX =
		typeof data.avoidX === 'number' && Number.isFinite(data.avoidX) ? data.avoidX : undefined;

	return avoidX === undefined
		? { x: data.x, y: data.y, speaker }
		: { x: data.x, y: data.y, speaker, avoidX };
}
