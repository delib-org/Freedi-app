/**
 * One-click unsubscribe for the Odyssey voyage-story digest — the link in
 * every digest footer AND the target of the List-Unsubscribe header. GET for
 * humans clicking from any mail client (RTL confirmation page); POST for the
 * RFC 8058 one-click flow mail providers drive themselves. The token is an
 * HMAC of the uid so a guessed link can't silence someone else's digest.
 * Flips `notificationSettings/{uid}.odysseyDigest.enabled` off.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import { Collections, functionConfig } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

const getDb = () => getFirestore();

function unsubscribeSecret(): string {
	return process.env.EMAIL_UNSUB_SECRET || process.env.GCLOUD_PROJECT || 'odyssey';
}

/** The token the digest builder puts in the unsubscribe link. */
export function odysseyUnsubscribeToken(userId: string): string {
	return createHmac('sha256', unsubscribeSecret()).update(userId).digest('hex').slice(0, 16);
}

const PAGE = (message: string): string => `<!DOCTYPE html>
<html dir="rtl" lang="he"><body style="font-family:Arial,sans-serif;background:#04121f;color:#e6f2fb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:24px"><h1 style="color:#fff4d3">⛵ אודיסיאה ישראלית</h1><p style="font-size:16px">${message}</p></div>
</body></html>`;

export const odysseyDigestUnsubscribe = onRequest(
	{ region: functionConfig.region },
	async (req, res): Promise<void> => {
		const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
		const token = typeof req.query.t === 'string' ? req.query.t : '';

		if (!userId || token !== odysseyUnsubscribeToken(userId)) {
			res.status(400).send(PAGE('הקישור אינו תקין. אפשר לבטל את המייל גם מתוך המשחק עצמו.'));

			return;
		}

		try {
			await getDb()
				.collection(Collections.notificationSettings)
				.doc(userId)
				.set({ odysseyDigest: { enabled: false }, lastUpdate: Date.now() }, { merge: true });
			// The one-click POST comes from the mail provider's machinery — no
			// human is looking, a bare 200 is the whole contract
			if (req.method === 'POST') {
				res.status(200).send('OK');

				return;
			}
			res.send(PAGE('הוסרתם מרשימת התפוצה של סיפור המסע. מחכים לכם בים 🌊'));
		} catch (error) {
			logError(error, { operation: 'odyssey.digestUnsubscribe', userId });
			res.status(500).send(PAGE('משהו השתבש. נסו שוב מאוחר יותר.'));
		}
	},
);
