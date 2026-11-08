/**
 * Turn a drag on the world into a turn of the camera.
 *
 * The camera's yaw grows to the LEFT and its pitch grows UP (three.js, Euler
 * 'YXZ', looking down -Z). Two conventions meet here:
 *
 * - a finger GRABS the world, as on a map or a photo sphere: drag right and
 *   the ground follows the finger right, so the camera turns left. Phones and
 *   tablets used to get the mouse rule below, and the hill slid against the
 *   finger.
 * - a mouse LOOKS, as in a desktop game: drag right to look right.
 *
 * Pure, so the direction is pinned by a unit test rather than by eye.
 */
export const LOOK_SPEED = { yaw: .004, pitch: .003 };

/**
 * @param {{yaw:number,pitch:number}} view
 * @param {number} dx pixels the pointer moved right since the last event
 * @param {number} dy pixels the pointer moved down since the last event
 * @param {string} pointerType 'mouse' | 'touch' | 'pen' (PointerEvent.pointerType)
 * @param {{min:number,max:number}} pitchLimits
 * @returns {{yaw:number,pitch:number}}
 */
export function dragLook(view, dx, dy, pointerType, pitchLimits = { min: -.7, max: .55 }) {
	const sign = pointerType === 'mouse' ? -1 : 1;
	const pitch = view.pitch + sign * dy * LOOK_SPEED.pitch;

	return {
		yaw: view.yaw + sign * dx * LOOK_SPEED.yaw,
		pitch: Math.min(pitchLimits.max, Math.max(pitchLimits.min, pitch)),
	};
}
