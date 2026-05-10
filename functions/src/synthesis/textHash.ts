import { createHash } from 'node:crypto';

/**
 * Hashing helpers for the synthesis verdict cache.
 *
 * `computeTextHash` produces a stable sha1 of a normalized statement text.
 * `computePairKey` produces a symmetric, content-addressable doc id for
 * the `synthesisVerdicts` collection so the cache is order-independent
 * and auto-invalidates when either statement's text changes.
 *
 * See docs/clusters and synthesis/clustering-and-synthesis-paper.md §5.6.
 */

export function normalizeForHash(text: string): string {
	// Trim and collapse internal whitespace so cosmetic edits (extra spaces,
	// trailing newlines) do not invalidate the cache. Case is preserved
	// because case can carry semantic weight in stance language.
	return text.replace(/\s+/g, ' ').trim();
}

export function computeTextHash(text: string): string {
	return createHash('sha1').update(normalizeForHash(text), 'utf8').digest('hex');
}

export function computePairKey(hashA: string, hashB: string): string {
	const [lo, hi] = hashA < hashB ? [hashA, hashB] : [hashB, hashA];

	return createHash('sha1').update(`${lo}|${hi}`, 'utf8').digest('hex');
}
