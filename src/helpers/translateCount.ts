import { fillPlaceholders } from './fillPlaceholders';

type Translate = (key: string) => string;

/**
 * The key for a counted phrase: `{base}_one` for exactly one, `{base}_other`
 * otherwise (the i18next suffixes). `t()` has no plural support, so the
 * choice happens here; each language writes its `_other` so it reads for
 * any count.
 */
export function pluralKey(baseKey: string, count: number): string {
	return `${baseKey}_${count === 1 ? 'one' : 'other'}`;
}

/** Translates a counted phrase and fills its `{{count}}`. */
export function translateCount(t: Translate, baseKey: string, count: number): string {
	return fillPlaceholders(t(pluralKey(baseKey, count)), { count });
}
