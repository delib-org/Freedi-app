import type { AgoraStage } from './agoraEnums';

/**
 * Wire contracts of the civic-track callables.
 *
 * These shapes used to be declared twice — once in the Odyssey client
 * (`apps/odyssey/src/lib/callables.ts`) and once in each function under
 * `functions/src/agora` — so a field renamed on one side sailed straight past
 * the compiler. Both sides now import from here: drift is a compile error.
 *
 * Field names are the wire format. Do not rename them.
 */

/** `agoraProvisionCivicSessions` — open one always-on deliberation per island. */
export interface ProvisionCivicSessionsRequest {
	gameId: string;
	/** Islands to open; omitted = every enabled island not already open */
	islandStatementIds?: string[];
}

export interface ProvisionedCivicSession {
	islandStatementId: string;
	sessionId: string;
	code: string;
}

export interface ProvisionCivicSessionsResponse {
	sessions: ProvisionedCivicSession[];
	/** Islands skipped because a deliberation was already open for them */
	alreadyOpen: string[];
}

/** `agoraUpdateCivicFlow` — re-point open deliberations at the game's current script. */
export interface UpdateCivicFlowRequest {
	gameId: string;
}

export interface UpdateCivicFlowResponse {
	/** Sessions whose flow now matches the game's script */
	updated: string[];
	/** Sessions left alone because they have already ended */
	skipped: string[];
}

/**
 * `agoraAdvanceStage` — teacher-only forward stage transition.
 *
 * Either names the next plan position (`toIndex`, what the Agora teacher
 * board sends) or the stage KIND to move to (`stage`, what Odyssey's admin
 * and the older scripts send) — the server resolves a kind to the first plan
 * item of that kind after the current one.
 */
export interface AdvanceCivicStageRequest {
	sessionId: string;
	stage?: AgoraStage;
	toIndex?: number;
}

export interface AdvanceCivicStageResponse {
	ok: boolean;
}
