const CONSENSUS_DECIMALS = 2;

/** A moment in milliseconds as a short local date and time ("version" of a published assignment). */
export function formatMoment(ms: number, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(ms),
	);
}

/** C_p as shown to hosts and participants: a plain number, never a personal score. */
export function formatConsensus(value: number): string {
	return value.toFixed(CONSENSUS_DECIMALS);
}

/** Table number people read on the day: the stored index is zero-based. */
export function tableNumber(index: number): number {
	return index + 1;
}
