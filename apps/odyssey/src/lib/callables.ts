import type {
	AdvanceCivicStageRequest,
	AdvanceCivicStageResponse,
	AgoraStage,
	MintAgoraHandoffResponse,
	OdysseyFeedbackRequest,
	OdysseyFeedbackResponse,
	OdysseyTranslateGameRequest,
	OdysseyTranslateGameResponse,
	OdysseyTranslationLang,
	ProvisionCivicSessionsRequest,
	ProvisionCivicSessionsResponse,
	UpdateCivicFlowRequest,
	UpdateCivicFlowResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from './firebase';

/**
 * The things Odyssey asks a server to do. Everything else in this game is a
 * direct Firestore write — these need privileges the player does not have:
 * minting a sign-in token, opening Agora sessions, and mailing a letter to the
 * developers from an account no client may hold credentials for.
 *
 * The request/response shapes live in shared-types and are imported by the
 * functions too — a drift between the two sides is a compile error.
 */

export type {
	AdvanceCivicStageRequest,
	MintAgoraHandoffResponse,
	OdysseyFeedbackRequest,
	OdysseyFeedbackResponse,
	OdysseyTranslateGameRequest,
	OdysseyTranslateGameResponse,
	OdysseyTranslationLang,
	ProvisionCivicSessionsRequest,
	ProvisionCivicSessionsResponse,
	ProvisionedCivicSession,
	UpdateCivicFlowResponse,
} from '@freedi/shared-types';

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

/**
 * Admin action: re-point the already-open deliberations at the game's current
 * script.
 *
 * Editing the script after opening the squares is the normal case, not the
 * exception — the first thing anyone does with a new knob is try it. Opening
 * again would not help: provisioning treats an existing session as done.
 */
export async function updateCivicFlow(gameId: string): Promise<UpdateCivicFlowResponse> {
	const call = httpsCallable<UpdateCivicFlowRequest, UpdateCivicFlowResponse>(
		functions,
		'agoraUpdateCivicFlow',
	);
	const result = await call({ gameId });

	return result.data;
}

/**
 * Move one civic deliberation to its next stage.
 *
 * Reuses the classroom's own stage machinery: provisioning records the game
 * admin as the session's teacher, so the organizer already holds the only
 * permission this needs.
 */
export async function advanceCivicStage(sessionId: string, stage: AgoraStage): Promise<void> {
	const call = httpsCallable<AdvanceCivicStageRequest, AdvanceCivicStageResponse>(
		functions,
		'agoraAdvanceStage',
	);
	await call({ sessionId, stage });
}

/**
 * Admin action: (re)translate the game's Hebrew content into `lang`.
 *
 * The server hashes every Hebrew field and re-translates only the ones that
 * changed since the last run, so pressing the button after an edit is cheap;
 * `force` re-translates everything. The result counts fields, not screens.
 */
export async function translateGame(
	gameId: string,
	lang: OdysseyTranslationLang,
	force = false,
): Promise<OdysseyTranslateGameResponse> {
	return callTranslateGame({ gameId, lang, force });
}

/**
 * How many fields of `lang` are out of date — the admin status line. Calls
 * no model and writes nothing; `translated` is the count that a press of the
 * button would translate.
 */
export async function countStaleTranslations(
	gameId: string,
	lang: OdysseyTranslationLang,
): Promise<OdysseyTranslateGameResponse> {
	return callTranslateGame({ gameId, lang, dryRun: true });
}

async function callTranslateGame(
	request: OdysseyTranslateGameRequest,
): Promise<OdysseyTranslateGameResponse> {
	const call = httpsCallable<OdysseyTranslateGameRequest, OdysseyTranslateGameResponse>(
		functions,
		'odysseyTranslateGame',
	);
	const result = await call(request);

	return result.data;
}

/**
 * Send one letter to the developers. Requires an authenticated caller — see
 * `submitFeedback()` in lib/feedback.ts, which guarantees one.
 */
export async function submitOdysseyFeedback(
	input: OdysseyFeedbackRequest,
): Promise<OdysseyFeedbackResponse> {
	const call = httpsCallable<OdysseyFeedbackRequest, OdysseyFeedbackResponse>(
		functions,
		'odysseyFeedbackSubmit',
	);
	const result = await call(input);

	return result.data;
}
