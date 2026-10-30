import type { Statement } from '@freedi/shared-types';
import { REUSE_JACCARD_MIN } from './constants';
import type { HiddenTheme, MatchResult, MatchedTheme, ThemeWithMembers } from './types';

/**
 * Keep old theme docs where the new list overlaps them, so their ids, direct
 * votes and `absorbedClusterIds` survive the rebuild.
 *
 * A new theme reuses the old doc with the highest member-Jaccard when that is
 * at least REUSE_JACCARD_MIN, one-to-one, best pairs first. Every old theme not
 * reused is hidden; when it shares members with a new theme it is merged into
 * the one it overlaps most, so its direct votes carry over through
 * `absorbedClusterIds` (see condensation/absorbedClusters.ts). An old theme
 * that overlaps nothing is hidden without a merge target: there is no theme
 * its voters were voting for.
 */

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let shared = 0;
	for (const id of a) if (b.has(id)) shared++;

	return shared / (a.size + b.size - shared);
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	let shared = 0;
	for (const id of a) if (b.has(id)) shared++;

	return shared;
}

interface Pair {
	newIndex: number;
	oldIndex: number;
	score: number;
}

function reusePairs(newSets: Set<string>[], oldSets: Set<string>[]): Pair[] {
	const pairs: Pair[] = [];
	newSets.forEach((n, newIndex) => {
		oldSets.forEach((o, oldIndex) => {
			const score = jaccard(n, o);
			if (score >= REUSE_JACCARD_MIN) pairs.push({ newIndex, oldIndex, score });
		});
	});

	return pairs.sort((a, b) => b.score - a.score);
}

function bestMergeTarget(
	oldSet: Set<string>,
	themes: ThemeWithMembers[],
	newSets: Set<string>[],
): string | undefined {
	let bestKey: string | undefined;
	let bestShared = 0;
	newSets.forEach((n, i) => {
		const shared = overlap(oldSet, n);
		if (shared > bestShared) {
			bestShared = shared;
			bestKey = themes[i].key;
		}
	});

	return bestKey;
}

export function matchToExisting(themes: ThemeWithMembers[], oldThemes: Statement[]): MatchResult {
	const newSets = themes.map((t) => new Set(t.memberIds));
	const oldSets = oldThemes.map((t) => new Set(t.integratedOptions ?? []));

	const reuseByNew = new Map<number, number>();
	const reusedOld = new Set<number>();
	for (const pair of reusePairs(newSets, oldSets)) {
		if (reuseByNew.has(pair.newIndex) || reusedOld.has(pair.oldIndex)) continue;
		reuseByNew.set(pair.newIndex, pair.oldIndex);
		reusedOld.add(pair.oldIndex);
	}

	const matched: MatchedTheme[] = themes.map((theme, i) => {
		const oldIndex = reuseByNew.get(i);

		return oldIndex === undefined
			? { ...theme }
			: { ...theme, reusesThemeId: oldThemes[oldIndex].statementId };
	});

	const hidden: HiddenTheme[] = oldThemes
		.map((old, oldIndex) => ({ old, oldIndex }))
		.filter(({ oldIndex }) => !reusedOld.has(oldIndex))
		.map(({ old, oldIndex }) => {
			const mergedIntoKey = bestMergeTarget(oldSets[oldIndex], themes, newSets);

			return mergedIntoKey
				? { themeId: old.statementId, mergedIntoKey }
				: { themeId: old.statementId };
		});

	return { themes: matched, hidden };
}
