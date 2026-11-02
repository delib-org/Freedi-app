/**
 * Number of stakeholders (N) helpers for the survey form and its API.
 *
 * Empty, 0, negative or non-numeric input all mean "not known": no N is
 * stored. 0 is also the wire signal for "clear it", because JSON drops
 * `undefined` and null would fail the schema and shadow inheritance.
 */

/** Sent to the API when the admin emptied the field. */
export const CLEAR_TARGET_POPULATION = 0;

/** A positive whole number, or undefined when the input does not name one. */
export function parseTargetPopulation(raw: unknown): number | undefined {
	const value = typeof raw === 'string' ? parseInt(raw, 10) : raw;

	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const whole = Math.floor(value);

	return whole >= 1 ? whole : undefined;
}

/** What the form puts in settings.targetPopulation on the wire. */
export function toWireTargetPopulation(value: number | undefined): number {
	return parseTargetPopulation(value) ?? CLEAR_TARGET_POPULATION;
}
