import type { Indicator, IndicatorScope, ResolveOptions } from './types';
import type { IndicatorContextMap } from './contexts';
import { CLASS_INDICATORS } from './class';
import { STUDENT_INDICATORS } from './student';
import { TEACHER_INDICATORS } from './teacher';
import { SCHOOL_INDICATORS } from './school';
import { SYSTEM_INDICATORS } from './system';

type Registry = { [S in IndicatorScope]: Indicator<IndicatorContextMap[S]>[] };

const REGISTRY: Registry = {
	class: CLASS_INDICATORS,
	student: STUDENT_INDICATORS,
	teacher: TEACHER_INDICATORS,
	school: SCHOOL_INDICATORS,
	system: SYSTEM_INDICATORS,
};

/** The full, ordered registry for one dashboard scope. */
export function indicatorsFor<S extends IndicatorScope>(scope: S): Indicator<IndicatorContextMap[S]>[] {
	// The mapped type guarantees the pairing; TS cannot narrow an indexed
	// access through a generic key, hence the assertion.
	return [...(REGISTRY[scope] as Indicator<IndicatorContextMap[S]>[])];
}

/**
 * The registry after an app's (or a settings doc's) hide/order preferences.
 * Unknown ids in `hide`/`order` are ignored; ids missing from `order` keep
 * their registry order after the listed ones.
 */
export function resolveIndicators<S extends IndicatorScope>(
	scope: S,
	opts: ResolveOptions = {},
): Indicator<IndicatorContextMap[S]>[] {
	const hidden = new Set(opts.hide ?? []);
	const visible = indicatorsFor(scope).filter((i) => !hidden.has(i.id));
	if (!opts.order || opts.order.length === 0) return visible;
	const rank = new Map(opts.order.map((id, i) => [id, i]));
	const listed = visible.filter((i) => rank.has(i.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
	const rest = visible.filter((i) => !rank.has(i.id));

	return [...listed, ...rest];
}

/** Every i18n key any indicator of `scope` may ask for — for dictionary audits. */
export function labelKeysFor(scope: IndicatorScope): string[] {
	return Array.from(new Set(indicatorsFor(scope).flatMap((i) => i.labelKeys))).sort();
}
