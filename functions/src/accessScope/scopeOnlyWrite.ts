import { isDeepStrictEqual } from 'util';

function withoutScope(data: object): object {
	const { accessScope: _accessScope, ...rest } = data as { accessScope?: unknown };

	return rest;
}

/**
 * True for a write that changed `accessScope` and nothing else. Stamping a large
 * tree fires every statement trigger once per document, so a handler that does
 * real work must leave these alone.
 */
export function isAccessScopeOnlyWrite(before: unknown, after: unknown): boolean {
	if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false;
	if ((before as { accessScope?: unknown }).accessScope === (after as { accessScope?: unknown }).accessScope) {
		return false;
	}

	return isDeepStrictEqual(withoutScope(before), withoutScope(after));
}
