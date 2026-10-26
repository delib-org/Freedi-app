import type { Statement } from '@freedi/shared-types';
import { gateBars } from './projectorLogic';

/**
 * Pure rules of the projector's big gate (the Agora goal line, ported).
 * The gate opens the moment any option's consensus reaches the lesson's gate;
 * each option reports whether it is through, or how far it still has to go.
 */

export const GAP_DECIMALS = 2;
/** Chips shown under the gate at most, so it never pushes the wall past one screen. */
export const GATE_CHIP_LIMIT = 4;
const GAP_SCALE = 10 ** GAP_DECIMALS;

export interface GateItem {
	id: string;
	text: string;
	consensus: number;
	passed: boolean;
	/** How much consensus is still missing; 0 once passed. Rounded to 2 decimals. */
	gap: number;
}

export interface GateView {
	gate: number;
	/** True when at least one option is through. */
	open: boolean;
	passedCount: number;
	/** Options through the gate, best first. */
	through: GateItem[];
	/** Options still below the gate, closest first. */
	waiting: GateItem[];
}

/** Options named by a frozen ballot, in ballot order; ids with no statement are dropped. */
export function ballotOptions(
	candidateIds: readonly string[],
	options: readonly Statement[],
): Statement[] {
	const byId = new Map(options.map((o) => [o.statementId, o]));

	return candidateIds.flatMap((id) => {
		const option = byId.get(id);

		return option ? [option] : [];
	});
}

/** Gate state for these options against the lesson's gate. */
export function gateView(options: readonly Statement[], gate: number): GateView {
	const items: GateItem[] = gateBars(options, gate).map((bar) => ({
		id: bar.id,
		text: bar.text,
		consensus: bar.consensus,
		passed: bar.passed,
		gap: bar.passed ? 0 : Math.round((gate - bar.consensus) * GAP_SCALE) / GAP_SCALE,
	}));
	const through = items.filter((item) => item.passed);

	return {
		gate,
		open: through.length > 0,
		passedCount: through.length,
		through,
		waiting: items.filter((item) => !item.passed),
	};
}

export interface CappedChips {
	through: GateItem[];
	waiting: GateItem[];
	/** Options left out of the chips (the "+N" chip). */
	hidden: number;
}

/** At most `limit` chips in all: options that got through first, the rest fill what is left. */
export function capChips(
	through: readonly GateItem[],
	waiting: readonly GateItem[],
	limit: number = GATE_CHIP_LIMIT,
): CappedChips {
	const shownThrough = through.slice(0, limit);
	const shownWaiting = waiting.slice(0, Math.max(0, limit - shownThrough.length));

	return {
		through: shownThrough,
		waiting: shownWaiting,
		hidden: through.length + waiting.length - shownThrough.length - shownWaiting.length,
	};
}
