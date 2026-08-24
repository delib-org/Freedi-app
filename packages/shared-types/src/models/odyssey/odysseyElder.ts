import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	array,
	record,
	InferOutput,
} from 'valibot';
import { AgoraValueSchema } from '../agora/agoraTopicPackage';

/**
 * An Elder (זקן/זקנה) — a historical figure who plays the game alongside the
 * live player: a labeled ship on the sea holding declared stances, and a
 * negotiating counterpart inside an island's Agora deliberation.
 *
 * Elders are ALWAYS presented as AI personas, never as fellow players: their
 * ships are named and marked, their Agora participants carry `isAI`, and they
 * are excluded from human participant counts. Their opinions DO join the
 * opinion-distance engine the same way parties do — `positions` has the exact
 * `OdysseyParty.positions` shape so the party virtual-user arithmetic applies
 * verbatim.
 */
export const OdysseyElderSchema = object({
	elderId: string(),
	/** Hebrew display name, e.g. דוד בן-גוריון */
	name: string(),
	/** Short historical role line, e.g. ראש הממשלה הראשון */
	role: string(),
	portraitUrl: optional(nullable(string())),
	/** Ship/label tint */
	color: string(),
	/** Short biography shown when the player inspects the elder */
	bio: string(),
	/** The needs this elder negotiates for — drive review scoring and prompts */
	needs: array(string()),
	/** The values the persona reasons from (same shape the Agora review uses) */
	values: array(AgoraValueSchema),
	/** island statementId → stance statementId the elder declares (party shape) */
	positions: record(string(), string()),
	/**
	 * stance statementId → authored in-character Hebrew remark, shown when the
	 * player marks that stance. This is the elder's deterministic voice — it
	 * needs no LLM and doubles as the fixture fallback where one is used.
	 */
	reactions: record(string(), string()),
	/**
	 * island statementId → a standing challenge line in the elder's voice,
	 * inviting the player to argue the island with them. Reused verbatim by
	 * the email digest as the "elder challenge" section.
	 */
	challenges: record(string(), string()),
	sortOrder: number(),
	enabled: boolean(),
});

export type OdysseyElder = InferOutput<typeof OdysseyElderSchema>;

/** Uid prefix for elder AI identities — used for isAI flags and exclusions. */
export const ODYSSEY_ELDER_UID_PREFIX = 'odyssey-elder--';

/** Deterministic uid of an elder's AI identity across sea and Agora. */
export function createOdysseyElderUid(elderId: string): string {
	return `${ODYSSEY_ELDER_UID_PREFIX}${elderId}`;
}

/** True for elder AI uids — excludes them from human-only metrics. */
export function isOdysseyElderUid(uid: string): boolean {
	return uid.startsWith(ODYSSEY_ELDER_UID_PREFIX);
}

/** Extract the elderId back out of an elder AI uid, or null if not one. */
export function elderIdFromUid(uid: string): string | null {
	return isOdysseyElderUid(uid) ? uid.slice(ODYSSEY_ELDER_UID_PREFIX.length) : null;
}
