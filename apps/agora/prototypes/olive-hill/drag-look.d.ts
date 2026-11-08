export declare const LOOK_SPEED: { yaw: number; pitch: number };
export interface LookView {
	yaw: number;
	pitch: number;
}
export declare function dragLook(
	view: LookView,
	dx: number,
	dy: number,
	pointerType: string,
	pitchLimits?: { min: number; max: number },
): LookView;
