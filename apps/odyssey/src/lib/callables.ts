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
