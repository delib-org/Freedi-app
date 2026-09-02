import { ActivityType, DEFAULT_DRAFT_CUTOFF, type StudioDraftCutoff } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';

/**
 * The Draft step: a strong model writes a Sign document from the top
 * suggestions of source activities. These helpers hold the admin-facing
 * vocabulary shared by the plan card, the timeline, the edit modal and the
 * "Draft from results" section of the document drawer.
 */

export interface DraftSettings {
	sourceStatementIds: string[];
	cutoff: StudioDraftCutoff;
	intent: string;
}

type Translate = (text: string) => string;
type TranslateWithParams = (text: string, params: Record<string, string | number>) => string;

/** Activities whose results a document can be drafted from. */
export function isDraftSource(activity: Pick<DerivedActivity, 'type'>): boolean {
	return activity.type === ActivityType.massConsensus || activity.type === ActivityType.join;
}

/**
 * Default sources for a document: every closed crowd survey / live session
 * of the question. When none has closed yet, all of them — so the button is
 * usable while the facilitator is still experimenting.
 */
export function defaultDraftSources(activities: DerivedActivity[], excludeId?: string): string[] {
	const candidates = activities.filter((a) => isDraftSource(a) && a.statementId !== excludeId);
	const closed = candidates.filter((a) => a.runState === 'closed');

	return (closed.length > 0 ? closed : candidates).map((a) => a.statementId);
}

export function defaultDraftSettings(
	activities: DerivedActivity[],
	excludeId?: string,
): DraftSettings {
	return {
		sourceStatementIds: defaultDraftSources(activities, excludeId),
		cutoff: { ...DEFAULT_DRAFT_CUTOFF },
		intent: '',
	};
}

/**
 * One line for a cutoff: "top 20 suggestions, at least 3 raters" ·
 * "top answers" · "consensus ≥ 0.6".
 */
export function describeCutoff(
	cutoff: StudioDraftCutoff | undefined,
	t: Translate,
	tWithParams: TranslateWithParams,
): string {
	const c = cutoff ?? DEFAULT_DRAFT_CUTOFF;
	const parts: string[] = [];
	switch (c.mode) {
		case 'chosen':
			parts.push(t('top answers'));
			break;
		case 'threshold':
			parts.push(tWithParams('consensus ≥ {{min}}', { min: c.minConsensus ?? 0 }));
			break;
		case 'topN':
		default:
			parts.push(tWithParams('top {{n}} suggestions', { n: c.n ?? DEFAULT_DRAFT_CUTOFF.n ?? 20 }));
			break;
	}
	if (c.minEvaluators !== undefined && c.minEvaluators > 0) {
		parts.push(tWithParams('at least {{n}} raters', { n: c.minEvaluators }));
	}

	return parts.join(', ');
}

/** Whether a cutoff is complete enough to send. */
export function isCutoffValid(cutoff: StudioDraftCutoff): boolean {
	switch (cutoff.mode) {
		case 'topN':
			return cutoff.n !== undefined && Number.isInteger(cutoff.n) && cutoff.n > 0;
		case 'threshold':
			return (
				cutoff.minConsensus !== undefined && cutoff.minConsensus >= 0 && cutoff.minConsensus <= 1
			);
		case 'chosen':
		default:
			return true;
	}
}
