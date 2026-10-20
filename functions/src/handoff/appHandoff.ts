import { createHash, randomBytes } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { AGORA_STATION_LINK, Collections, type AgoraLinkedApp } from '@freedi/shared-types';
import { db } from '../db';

/**
 * One-time codes that carry a signed-in uid from one WizCol app to another
 * (docs/ia/agora-linked-app-stations.md §9.3). The main→Sign handoff in
 * `deliberation/handoff.ts` is the same pattern and should fold into this.
 *
 * Only the SHA-256 of a code is stored, as the doc id: a database read never
 * yields a usable code. A code is redeemed once (get + delete in one
 * transaction) and dies after `HANDOFF_TTL_MS` (a TTL policy on `expiresAt`
 * sweeps the ones nobody redeemed).
 */

export interface AppHandoffRecord {
	uid: string;
	app: AgoraLinkedApp;
	sessionId: string;
	itemId: string;
	statementId: string;
	expiresAt: number;
	createdAt: number;
}

/** Why a code could not be redeemed — the reason rides in the error's details */
export type AppHandoffRefusal = 'expired' | 'wrong_app';

export function digestHandoffCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

/** 32 random bytes, URL-safe (43 characters) */
export function mintHandoffCode(): string {
	return randomBytes(32).toString('base64url');
}

function handoffRef(code: string) {
	return db.collection(Collections.appHandoffs).doc(digestHandoffCode(code));
}

/** Store a fresh code for `record` and return it (the plain code exists only in the reply) */
export async function storeAppHandoff(
	record: Omit<AppHandoffRecord, 'expiresAt' | 'createdAt'>,
	now: number,
): Promise<{ code: string; expiresAt: number }> {
	const code = mintHandoffCode();
	const expiresAt = now + AGORA_STATION_LINK.HANDOFF_TTL_MS;
	await handoffRef(code).create({ ...record, expiresAt, createdAt: now });

	return { code, expiresAt };
}

function refuse(reason: AppHandoffRefusal): never {
	throw new HttpsError(
		'permission-denied',
		'This link has expired. Go back to the village and open the task again.',
		{ reason },
	);
}

/**
 * Redeem a code: read and delete it in one transaction, so two tabs racing
 * the same code get one sign-in between them. An unknown, expired or
 * already-used code all read as `expired`; a code minted for another app as
 * `wrong_app` (and stays usable there).
 */
export async function consumeAppHandoff(
	code: string,
	app: AgoraLinkedApp,
	now: number,
): Promise<AppHandoffRecord> {
	if (typeof code !== 'string' || !code || code.length > AGORA_STATION_LINK.CODE_CHARS) {
		throw new HttpsError('invalid-argument', 'Invalid handoff code');
	}
	const ref = handoffRef(code);

	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(ref);
		const record = snap.exists ? (snap.data() as AppHandoffRecord | undefined) : undefined;
		if (!record) refuse('expired');
		if (record.app !== app) refuse('wrong_app');
		// A throw aborts the transaction: an expired code is left for the TTL sweep
		if (record.expiresAt < now) refuse('expired');
		transaction.delete(ref);

		return record;
	});
}
