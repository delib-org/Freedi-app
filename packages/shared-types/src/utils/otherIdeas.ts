/**
 * "Other ideas": the derived group of ideas that no visible theme holds.
 *
 * One pure function feeds every surface (Themes & synthesis, Groups board, tree
 * view footer) and the results exports, so an idea is in exactly one place.
 * Spec: docs/ia/main-app-theme-other.md
 *
 * Vocabulary:
 * - theme: a visible cluster that is not a synthesis (derivedByPipeline !== 'synthesis')
 * - synthesis: a visible cluster with derivedByPipeline === 'synthesis'
 * - atom: a visible synthesis, or a visible option that is in no visible synthesis.
 *   A synthesis's members are never atoms.
 *
 * This file imports no runtime values so scripts and tests can load it as is.
 */

/** Export block id for the leftover group. */
export const OTHER_IDEAS_EXPORT_ID = 'other-ideas';
/** Board / DOM id for the leftover group. */
export const OTHER_IDEAS_ID = '__other_ideas__';

const OPTION_TYPE = 'option';
const SYNTHESIS_PIPELINE = 'synthesis';
const TOPIC_CLUSTER_PIPELINE = 'topic-cluster';

/** The minimal shape the function reads; Statement and export source rows both satisfy it. */
export interface IdeaNode {
	statementId: string;
	statementType?: string;
	hide?: boolean;
	isCluster?: boolean;
	derivedByPipeline?: string;
	integratedOptions?: string[];
}

export interface OtherIdeasResult<T extends IdeaNode> {
	/** Visible themes, in input order. */
	themes: T[];
	/** Every atom, in input order (themed or not). */
	atoms: T[];
	/** Atoms no visible theme holds, in input order. */
	otherAtoms: T[];
	/** atom id -> id of the theme that holds it (absent for Other atoms). */
	themeIdByAtomId: Map<string, string>;
	/** True when at least one visible theme exists. Other is shown only then. */
	hasThemes: boolean;
}

function isVisibleOption(node: IdeaNode): boolean {
	return node.statementType === OPTION_TYPE && node.hide !== true;
}

function isSynthesis(node: IdeaNode): boolean {
	return node.isCluster === true && node.derivedByPipeline === SYNTHESIS_PIPELINE;
}

/**
 * A theme, for voting purposes: a cluster the topic-cluster pipeline wrote
 * (`derivedByPipeline === 'topic-cluster'`). Themes are navigation containers:
 * their numbers are roll-ups of their members and they are never voted on
 * directly.
 *
 * Deliberately strict and fail-open: a cluster without the field (a manual
 * merge from `performIntegration`, or a legacy doc) is NOT a theme here.
 * Manual merges carry migrated votes and are voted on, so they must stay
 * votable. `computeOtherIdeas` keeps its own, broader grouping predicate.
 */
export function isTheme(node: Pick<IdeaNode, 'isCluster' | 'derivedByPipeline'>): boolean {
	return node.isCluster === true && node.derivedByPipeline === TOPIC_CLUSTER_PIPELINE;
}

/** Grouping predicate of the Themes view: any cluster that is not a synthesis. */
function isThemeLike(node: IdeaNode): boolean {
	return node.isCluster === true && !isSynthesis(node);
}

/** Theme sharing the most members with the synthesis; ties go to the earlier theme. */
function bestThemeByMembers(
	synthesis: IdeaNode,
	themeMemberSets: ReadonlyArray<readonly [string, Set<string>]>,
): string | undefined {
	const members = synthesis.integratedOptions ?? [];
	let bestId: string | undefined;
	let bestOverlap = 0;
	for (const [themeId, memberSet] of themeMemberSets) {
		const overlap = members.filter((id) => memberSet.has(id)).length;
		if (overlap > bestOverlap) {
			bestOverlap = overlap;
			bestId = themeId;
		}
	}

	return bestId;
}

/**
 * @param siblings the question's children (hidden ones may be included, they are skipped)
 */
export function computeOtherIdeas<T extends IdeaNode>(siblings: T[]): OtherIdeasResult<T> {
	const visible = siblings.filter(isVisibleOption);
	const themes = visible.filter(isThemeLike);
	const syntheses = visible.filter(isSynthesis);

	const synthesisMemberIds = new Set<string>();
	for (const synthesis of syntheses) {
		for (const id of synthesis.integratedOptions ?? []) synthesisMemberIds.add(id);
	}

	// First theme (input order) that lists a given id wins.
	const themeIdByListedId = new Map<string, string>();
	for (const theme of themes) {
		for (const id of theme.integratedOptions ?? []) {
			if (!themeIdByListedId.has(id)) themeIdByListedId.set(id, theme.statementId);
		}
	}

	const themeMemberSets = themes.map(
		(theme) => [theme.statementId, new Set(theme.integratedOptions ?? [])] as const,
	);

	const themeIdByAtomId = new Map<string, string>();
	const atoms: T[] = [];
	const otherAtoms: T[] = [];

	const place = (atom: T, themeId: string | undefined): void => {
		atoms.push(atom);
		if (themeId) themeIdByAtomId.set(atom.statementId, themeId);
		else otherAtoms.push(atom);
	};

	for (const node of visible) {
		if (node.isCluster === true) {
			if (!isSynthesis(node)) continue;
			// Same rule as synthToTopic: a theme lists the synthesis, or (legacy
			// flat data) lists any of its members.
			place(
				node,
				themeIdByListedId.get(node.statementId) ?? bestThemeByMembers(node, themeMemberSets),
			);
		} else if (!synthesisMemberIds.has(node.statementId)) {
			place(node, themeIdByListedId.get(node.statementId));
		}
	}

	return { themes, atoms, otherAtoms, themeIdByAtomId, hasThemes: themes.length > 0 };
}
