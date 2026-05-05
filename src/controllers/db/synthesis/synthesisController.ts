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
	reasons: string[];
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

export async function synthesizeIdeasPreview(
	request: SynthesisPreviewRequest,
): Promise<SynthesisPreviewResponse> {
	const fn = httpsCallable<SynthesisPreviewRequest, SynthesisPreviewResponse>(
		functionsWithRegion,
		'synthesizeIdeasPreview',
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
	);
	const result = await fn(request);

	return result.data;
}
