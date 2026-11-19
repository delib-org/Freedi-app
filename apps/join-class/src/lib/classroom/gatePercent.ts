const PERCENT = 100;

/** The goal as the teacher reads it: a whole percent (0.4 -> 40), never a decimal. */
export function gatePercent(gate: number): number {
	return Math.round(gate * PERCENT);
}
