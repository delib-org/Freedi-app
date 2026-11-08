import { Statement } from '@freedi/shared-types';
import type { AddStatementCommit, AddStatementIntent } from '@/redux/statements/newStatementSlice';
import type { AddAnswerStep } from '@/services/analytics';

/**
 * Pure state machine for adding a statement:
 *   draft → structuredDebatePreCheck? → multiSplit? → similarity? → create → done
 * The hook (useCreateStatementFlow) runs the network effects; this file only
 * decides which step comes next, so the sequence is testable without React.
 */

export type FlowStep =
	| 'draft'
	| 'structuredDebatePreCheck'
	| 'multiSplit'
	| 'similarity'
	| 'create'
	| 'done'
	| 'error';

export interface FlowDraft {
	title: string;
	description: string;
}

export interface FlowConfig {
	preCheck: boolean;
	multiSplit: boolean;
	similarity: boolean;
}

export interface FlowState {
	step: FlowStep;
	/** True while the hook is running this step's async work. */
	pending: boolean;
	draft: FlowDraft;
	/** Split candidates offered by the multi-suggestion detector (multiSplit step). */
	splits: FlowDraft[];
	/** Similar existing statements (similarity step). */
	similar: Statement[];
	/** Everything queued for creation; one item unless a split was confirmed. */
	toCreate: FlowDraft[];
	createdIds: string[];
	error: string | null;
}

export type FlowEvent =
	| { type: 'EDIT'; draft: Partial<FlowDraft> }
	| { type: 'SUBMIT' }
	| { type: 'PRECHECK_PUBLISH'; draft: FlowDraft }
	| { type: 'PRECHECK_CLOSE' }
	| { type: 'MULTI_RESULT'; splits: FlowDraft[] }
	| { type: 'MULTI_CONFIRM'; splits: FlowDraft[] }
	| { type: 'MULTI_DISMISS' }
	| { type: 'MULTI_CANCEL' }
	| { type: 'SIMILARITY_RESULT'; similar: Statement[] }
	| { type: 'SIMILARITY_SUPPORTED' }
	| { type: 'SIMILARITY_CONTINUE' }
	| { type: 'SIMILARITY_BACK' }
	| { type: 'CREATE_OK'; ids: string[] }
	| { type: 'FAIL'; message: string }
	| { type: 'RETRY' };

export const EMPTY_DRAFT: FlowDraft = { title: '', description: '' };

export const initialFlowState: FlowState = {
	step: 'draft',
	pending: false,
	draft: EMPTY_DRAFT,
	splits: [],
	similar: [],
	toCreate: [],
	createdIds: [],
	error: null,
};

interface ParentLike {
	statementSettings?: {
		popperianDiscussionEnabled?: boolean;
		popperianPreCheckEnabled?: boolean;
		enableMultiSuggestionDetection?: boolean;
		defaultLookForSimilarities?: boolean;
		enableSimilaritiesSearch?: boolean;
	};
}

/**
 * Which optional steps this parent turns on. Only answers get the AI steps, and
 * only when the result is going to the database — a temp node never leaves the
 * browser, so there is nothing to de-duplicate against.
 */
export function deriveFlowConfig(
	parent: ParentLike | 'top' | null | undefined,
	intent: AddStatementIntent,
	commit: AddStatementCommit = 'db',
): FlowConfig {
	if (!parent || parent === 'top' || intent !== 'answer' || commit !== 'db') {
		return { preCheck: false, multiSplit: false, similarity: false };
	}
	const s = parent.statementSettings ?? {};
	const preCheck = (s.popperianDiscussionEnabled ?? false) && (s.popperianPreCheckEnabled ?? false);

	return {
		preCheck,
		// The structured-debate refinery already rewrites the idea; splitting and
		// de-duplicating a refined proposal would second-guess it.
		multiSplit: !preCheck && (s.enableMultiSuggestionDetection ?? false),
		similarity:
			!preCheck &&
			((s.defaultLookForSimilarities ?? false) || (s.enableSimilaritiesSearch ?? false)),
	};
}

/** The ordered steps this configuration will visit after the draft. */
export function planSteps(config: FlowConfig): FlowStep[] {
	return [
		'draft',
		...(config.preCheck ? (['structuredDebatePreCheck'] as FlowStep[]) : []),
		...(config.multiSplit ? (['multiSplit'] as FlowStep[]) : []),
		...(config.similarity ? (['similarity'] as FlowStep[]) : []),
		'create',
		'done',
	];
}

export function stepAfter(step: FlowStep, config: FlowConfig): FlowStep {
	const plan = planSteps(config);
	const index = plan.indexOf(step);
	if (index === -1 || index === plan.length - 1) return 'done';

	return plan[index + 1];
}

/** Analytics name for the furthest step reached. */
export function toAnalyticsStep(step: FlowStep): AddAnswerStep {
	switch (step) {
		case 'structuredDebatePreCheck':
			return 'precheck';
		case 'multiSplit':
			return 'split';
		case 'similarity':
			return 'similarity';
		case 'create':
		case 'done':
		case 'error':
			return 'create';
		default:
			return 'draft';
	}
}

function enter(state: FlowState, step: FlowStep): FlowState {
	// Async steps start pending; the hook clears it with a *_RESULT event.
	const pending = step === 'multiSplit' || step === 'similarity' || step === 'create';

	return { ...state, step, pending, error: null };
}

export function flowReducer(state: FlowState, event: FlowEvent, config: FlowConfig): FlowState {
	switch (event.type) {
		case 'EDIT':
			return { ...state, draft: { ...state.draft, ...event.draft } };
		case 'SUBMIT': {
			if (state.step !== 'draft' || !state.draft.title.trim()) return state;

			return enter({ ...state, toCreate: [state.draft] }, stepAfter('draft', config));
		}
		case 'PRECHECK_PUBLISH':
			if (state.step !== 'structuredDebatePreCheck') return state;

			// The refined idea is final: go straight to create.
			return enter({ ...state, draft: event.draft, toCreate: [event.draft] }, 'create');
		case 'PRECHECK_CLOSE':
			if (state.step !== 'structuredDebatePreCheck') return state;

			return enter(state, 'draft');
		case 'MULTI_RESULT': {
			if (state.step !== 'multiSplit') return state;
			if (event.splits.length > 1) {
				return { ...state, pending: false, splits: event.splits };
			}

			return enter({ ...state, splits: [] }, stepAfter('multiSplit', config));
		}
		case 'MULTI_CONFIRM':
			if (state.step !== 'multiSplit') return state;

			// Confirmed splits are already distinct ideas; skip the similarity step.
			return enter({ ...state, toCreate: event.splits, splits: [] }, 'create');
		case 'MULTI_DISMISS':
			if (state.step !== 'multiSplit') return state;

			return enter(
				{ ...state, splits: [], toCreate: [state.draft] },
				stepAfter('multiSplit', config),
			);
		case 'MULTI_CANCEL':
			if (state.step !== 'multiSplit') return state;

			return enter({ ...state, splits: [] }, 'draft');
		case 'SIMILARITY_RESULT': {
			if (state.step !== 'similarity') return state;
			if (event.similar.length > 0) {
				return { ...state, pending: false, similar: event.similar };
			}

			return enter({ ...state, similar: [] }, 'create');
		}
		case 'SIMILARITY_SUPPORTED':
			if (state.step !== 'similarity') return state;

			return { ...state, step: 'done', pending: false, similar: [] };
		case 'SIMILARITY_CONTINUE':
			if (state.step !== 'similarity') return state;

			return enter({ ...state, similar: [] }, 'create');
		case 'SIMILARITY_BACK':
			if (state.step !== 'similarity') return state;

			return enter({ ...state, similar: [] }, 'draft');
		case 'CREATE_OK':
			if (state.step !== 'create') return state;

			return { ...state, step: 'done', pending: false, createdIds: event.ids };
		case 'FAIL':
			return { ...state, step: 'error', pending: false, error: event.message };
		case 'RETRY':
			if (state.step !== 'error') return state;

			return enter(state, 'draft');
		default:
			return state;
	}
}
