import { functions, httpsCallable } from './firebase';
import type { AgoraDeviceMode, AgoraStage } from '@freedi/shared-types';

export interface CreateSessionRequest {
	topicPackageId: string;
	deviceMode: AgoraDeviceMode;
	teamSizeMax?: number;
	lessonLengthMs?: number;
}

export interface CreateSessionResponse {
	sessionId: string;
	code: string;
}

export interface JoinSessionRequest {
	code: string;
	teamMemberCount?: number;
}

export interface JoinSessionResponse {
	sessionId: string;
	participantId: string;
	anonName: string;
}

export interface AdvanceStageRequest {
	sessionId: string;
	stage: AgoraStage;
}

export interface AdvanceStageResponse {
	ok: boolean;
}

export async function createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
	const call = httpsCallable<CreateSessionRequest, CreateSessionResponse>(
		functions,
		'agoraCreateSession',
	);
	const result = await call(request);

	return result.data;
}

export async function joinSession(request: JoinSessionRequest): Promise<JoinSessionResponse> {
	const call = httpsCallable<JoinSessionRequest, JoinSessionResponse>(
		functions,
		'agoraJoinSession',
	);
	const result = await call(request);

	return result.data;
}

export async function advanceStage(request: AdvanceStageRequest): Promise<AdvanceStageResponse> {
	const call = httpsCallable<AdvanceStageRequest, AdvanceStageResponse>(
		functions,
		'agoraAdvanceStage',
	);
	const result = await call(request);

	return result.data;
}

export interface GenerateTopicPackageRequest {
	topic: string;
	language: string;
}

export interface GenerateTopicPackageResponse {
	topicPackageId: string;
}

/**
 * Authoring a new topic with AI. Slow by nature — the function is allowed five
 * minutes — so callers must keep their own "generating" state rather than
 * assuming this returns promptly.
 */
export async function generateTopicPackage(
	request: GenerateTopicPackageRequest,
): Promise<GenerateTopicPackageResponse> {
	const call = httpsCallable<GenerateTopicPackageRequest, GenerateTopicPackageResponse>(
		functions,
		'agoraGenerateTopicPackage',
	);
	const result = await call(request);

	return result.data;
}

export interface RerateStancesRequest {
	sessionId: string;
	/** stance statementId → attitude on the standard -1..1 scale */
	ratings: Record<string, number>;
}

export interface RerateStancesResponse {
	before: number | null;
	after: number | null;
	score: number | null;
	participants: number;
}

/**
 * The closing question of a camp-less event: where do you stand now?
 *
 * Writes the answers back onto the island's own evaluations — the same
 * documents Odyssey's sea reads — and returns the room's convergence as it
 * stands including this person, so the screen can show it immediately rather
 * than waiting for the session snapshot to come back round.
 */
export async function rerateStances(request: RerateStancesRequest): Promise<RerateStancesResponse> {
	const call = httpsCallable<RerateStancesRequest, RerateStancesResponse>(
		functions,
		'agoraRerateStances',
	);
	const result = await call(request);

	return result.data;
}
