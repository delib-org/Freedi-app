import { httpsCallable, getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { app } from '../config';
import { functionConfig } from '@freedi/shared-types';

const functionsWithRegion = getFunctions(app, functionConfig.region);

if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
	try {
		connectFunctionsEmulator(functionsWithRegion, 'localhost', 5001);
	} catch {
		// Already connected
	}
}

export interface SynthesisFilters {
	minAverage?: number;
	minConsensus?: number;
	minEvaluators?: number;
}

export interface SynthesisPreviewGroup {
	groupId: string;
	memberIds: string[];
	memberPreviews: Array<{ id: string; statement: string }>;
	suggestedTitle: string;
	suggestedDescription: string;
	/**
	 * Multi-paragraph plan returned by the synthesis-proposal LLM. When
	 * provided, the execute call writes these as paragraph child Statements
	 * under the new cluster.
	 */
	suggestedParagraphs?: string[];
	reasons: string[];
	/**
	 * Set when the synthesis-proposal LLM refused to merge this group due
	 * to directional conflict (e.g. raise-X vs lower-X). The admin UI
	 * surfaces this as "can't synthesize as one — split into N?" rather
	 * than producing a muddy middle.
	 */
	cannotSynthesize?: boolean;
	splitReason?: string;
	splitProposal?: string[][];
}

export type SynthesisPreviewStatus = 'ready' | 'needs-embeddings' | 'no-candidates';

export interface SynthesisPreviewResponse {
	status: SynthesisPreviewStatus;
	parentStatementId: string;
	threshold: number;
	filters: SynthesisFilters;
	embeddingCoverage: number;
	inputCount: number;
	candidateEdgeCount: number;
	verifiedSameEdgeCount: number;
	groups: SynthesisPreviewGroup[];
}

interface SynthesisPreviewRequest {
	parentStatementId: string;
	threshold?: number;
	filters?: SynthesisFilters;
}

interface SynthesisExecuteGroup {
	memberIds: string[];
	mergedTitle: string;
	mergedDescription: string;
	/** Optional rich body — paragraph child Statements per the project's standing rule. */
	paragraphs?: string[];
}

interface SynthesisExecuteRequest {
	parentStatementId: string;
	threshold: number;
	filters: SynthesisFilters;
	confirmedGroups: SynthesisExecuteGroup[];
}

export interface SynthesisExecuteResponse {
	success: true;
	createdCount: number;
	createdStatementIds: string[];
}

// Client-side timeout for the long-running synthesis callables. The server
// is configured for 540s (timeoutSeconds in fn_synthesizeIdeas.ts); the
// browser callable defaults to only 70s, which trips `deadline-exceeded` on
// any cold-cache run that needs LLM verdicts. Match the server budget.
const SYNTHESIS_TIMEOUT_MS = 540_000;

export async function synthesizeIdeasPreview(
	request: SynthesisPreviewRequest,
): Promise<SynthesisPreviewResponse> {
	const fn = httpsCallable<SynthesisPreviewRequest, SynthesisPreviewResponse>(
		functionsWithRegion,
		'synthesizeIdeasPreview',
		{ timeout: SYNTHESIS_TIMEOUT_MS },
	);
	const result = await fn(request);

	return result.data;
}

export async function synthesizeIdeasExecute(
	request: SynthesisExecuteRequest,
): Promise<SynthesisExecuteResponse> {
	const fn = httpsCallable<SynthesisExecuteRequest, SynthesisExecuteResponse>(
		functionsWithRegion,
		'synthesizeIdeasExecute',
		{ timeout: SYNTHESIS_TIMEOUT_MS },
	);
	const result = await fn(request);

	return result.data;
}
