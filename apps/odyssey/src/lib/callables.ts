import { functions, httpsCallable } from './firebase';

/**
 * The only two things Odyssey asks a server to do. Everything else in this
 * game is a direct Firestore write — these two need privileges the player
 * does not have: minting a sign-in token, and opening Agora sessions.
 */

export interface MintAgoraHandoffResponse {
	token: string;
	uid: string;
}

export interface ProvisionCivicSessionsRequest {
	gameId: string;
	islandStatementIds?: string[];
}

export interface ProvisionedCivicSession {
	islandStatementId: string;
	sessionId: string;
	code: string;
}

export interface ProvisionCivicSessionsResponse {
	sessions: ProvisionedCivicSession[];
	alreadyOpen: string[];
}

/** A short-lived token that lets the player enter Agora as themselves. */
export async function mintAgoraHandoff(): Promise<MintAgoraHandoffResponse> {
	const call = httpsCallable<Record<string, never>, MintAgoraHandoffResponse>(
		functions,
		'odysseyMintAgoraHandoff',
	);
	const result = await call({});

	return result.data;
}

/** Admin action: open one always-on deliberation per island. Idempotent. */
export async function provisionCivicSessions(
	gameId: string,
	islandStatementIds?: string[],
): Promise<ProvisionCivicSessionsResponse> {
	const call = httpsCallable<ProvisionCivicSessionsRequest, ProvisionCivicSessionsResponse>(
		functions,
		'agoraProvisionCivicSessions',
	);
	const result = await call({ gameId, islandStatementIds });

	return result.data;
}

export interface UpdateCivicFlowResponse {
	updated: string[];
	skipped: string[];
}

/**
 * Admin action: re-point the already-open deliberations at the game's current
 * script.
 *
 * Editing the script after opening the squares is the normal case, not the
 * exception — the first thing anyone does with a new knob is try it. Opening
 * again would not help: provisioning treats an existing session as done.
 */
export async function updateCivicFlow(gameId: string): Promise<UpdateCivicFlowResponse> {
	const call = httpsCallable<{ gameId: string }, UpdateCivicFlowResponse>(
		functions,
		'agoraUpdateCivicFlow',
	);
	const result = await call({ gameId });

	return result.data;
}

export interface AdvanceCivicStageRequest {
	sessionId: string;
	stage: string;
}

/**
 * Move one civic deliberation to its next stage.
 *
 * Reuses the classroom's own stage machinery: provisioning records the game
 * admin as the session's teacher, so the organizer already holds the only
 * permission this needs.
 */
export async function advanceCivicStage(sessionId: string, stage: string): Promise<void> {
	const call = httpsCallable<AdvanceCivicStageRequest, { ok: boolean }>(
		functions,
		'agoraAdvanceStage',
	);
	await call({ sessionId, stage });
}
