import { buildStatementPath } from '@/routes/statementPaths';

/** The six cards of the Host hub, in display order. */
export const HOST_HUB_SECTIONS = [
	'live',
	'people',
	'answers',
	'results',
	'settings',
	'insights',
] as const;

export type HostHubSectionId = (typeof HOST_HUB_SECTIONS)[number];

export const DEFAULT_HOST_HUB_SECTION: HostHubSectionId = 'live';

export const HOST_HUB_SECTION_PARAM = 'section';

export function isHostHubSection(value: string | null | undefined): value is HostHubSectionId {
	return HOST_HUB_SECTIONS.includes(value as HostHubSectionId);
}

/** `?section=` from the URL, falling back to Live now. */
export function parseHostHubSection(params: URLSearchParams): HostHubSectionId {
	const raw = params.get(HOST_HUB_SECTION_PARAM);

	return isHostHubSection(raw) ? raw : DEFAULT_HOST_HUB_SECTION;
}

/** Canonical deep link into one hub section. */
export function buildHostHubPath(statementId: string, section: HostHubSectionId): string {
	return buildStatementPath({
		statementId,
		view: 'settings',
		query: new URLSearchParams({ [HOST_HUB_SECTION_PARAM]: section }),
	});
}

/** How many of a question's answers are hidden from participants right now. */
export function countHidden(subStatements: ReadonlyArray<{ hide?: boolean }>): number {
	return subStatements.filter((s) => s.hide === true).length;
}

/**
 * Setting keys the Live now card writes. Declared here (not scanned) because
 * the card writes them through variables; the duplicate-control guard test
 * merges this list with the settings form's composition for the hub page.
 */
export const LIVE_NOW_SETTING_KEYS = [
	'powerFollowMe',
	'enableAddEvaluationOption',
	'enableAddVotingOption',
	'enableEvaluation',
	'showEvaluation',
	'deadline',
] as const;
