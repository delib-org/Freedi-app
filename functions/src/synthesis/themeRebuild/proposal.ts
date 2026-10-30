import type { ThemeRebuildPreviewTheme } from '@freedi/shared-types';
import { NONE_KEY, SAMPLE_TITLES_PER_THEME } from './constants';
import type { AtomAssignments } from './assignAtoms';
import type { DiscoveredTheme, MatchedTheme, StoredProposal, ThemeWithMembers } from './types';

/** The proposal's pure steps: grouping answers, and re-validating them at apply time. */

export interface GroupedAssignments {
	/** Themes with at least one member, in discovery order. */
	themes: ThemeWithMembers[];
	otherIds: string[];
}

/** Each atom lands in exactly one theme or in Other. Empty themes are dropped. */
export function groupAssignments(
	themes: DiscoveredTheme[],
	atomIds: string[],
	assignments: AtomAssignments,
): GroupedAssignments {
	const members = new Map<string, string[]>(themes.map((t) => [t.key, []]));
	const otherIds: string[] = [];
	for (const atomId of atomIds) {
		const key = assignments.get(atomId) ?? NONE_KEY;
		const bucket = members.get(key);
		if (bucket) bucket.push(atomId);
		else otherIds.push(atomId);
	}

	return {
		themes: themes
			.map((t) => ({ ...t, memberIds: members.get(t.key) ?? [] }))
			.filter((t) => t.memberIds.length > 0),
		otherIds,
	};
}

export interface ReconciledProposal extends GroupedAssignments {
	/** Atoms that exist now but were not in the preview: they go to Other. */
	lateArrivals: string[];
}

/**
 * The stored proposal against the atoms as they are now. Members that stopped
 * being atoms (hidden, deleted, absorbed into a synthesis) are dropped; atoms
 * the preview never saw go to Other, for the live filing sweep to pick up.
 */
export function reconcileWithCurrent(
	proposal: Pick<StoredProposal, 'atomIds' | 'themes' | 'otherIds'>,
	currentAtomIds: string[],
): ReconciledProposal {
	const current = new Set(currentAtomIds);
	const previewed = new Set(proposal.atomIds);
	const lateArrivals = currentAtomIds.filter((id) => !previewed.has(id));

	return {
		themes: proposal.themes
			.map((t) => ({ ...t, memberIds: t.memberIds.filter((id) => current.has(id)) }))
			.filter((t) => t.memberIds.length > 0),
		otherIds: [...proposal.otherIds.filter((id) => current.has(id)), ...lateArrivals],
		lateArrivals,
	};
}

export function toPreviewThemes(
	themes: MatchedTheme[],
	titleById: Map<string, string>,
): ThemeRebuildPreviewTheme[] {
	return themes.map((t) => {
		const preview: ThemeRebuildPreviewTheme = {
			key: t.key,
			name: t.name,
			rule: t.rule,
			memberCount: t.memberIds.length,
			sampleTitles: t.memberIds
				.map((id) => titleById.get(id))
				.filter((title): title is string => Boolean(title))
				.slice(0, SAMPLE_TITLES_PER_THEME),
		};
		if (t.reusesThemeId) preview.reusesThemeId = t.reusesThemeId;

		return preview;
	});
}
