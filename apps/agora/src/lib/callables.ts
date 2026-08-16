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
