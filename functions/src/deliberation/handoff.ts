import { randomBytes, createHash } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../db';
import { ALLOWED_ORIGINS } from '../config/cors';
import { questionFor } from './service';

const options = { region: 'me-west1', cors: [...ALLOWED_ORIGINS, 'http://localhost:3012'] };
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export const createAgreementHandoff = onCall(options, async (request) => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
	const id = request.data?.documentId;
	if (typeof id !== 'string' || id.includes('/') || id.length > 128)
		throw new HttpsError('invalid-argument', 'Invalid document.');
	const document = (await db.collection('statements').doc(id).get()).data();
	if (!document?.agreementMeta?.questionId)
		throw new HttpsError('not-found', 'Agreement unavailable.');
	await questionFor(request.auth.uid, document.agreementMeta.questionId);
	const code = randomBytes(32).toString('base64url');
	await db
		.collection('agreementHandoffs')
		.doc(digest(code))
		.create({ uid: request.auth.uid, documentId: id, expiresAt: Date.now() + 60000 });

	return { code };
});
export const redeemAgreementHandoff = onCall(options, async (request) => {
	const code = request.data?.code,
		id = request.data?.documentId;
	if (typeof code !== 'string' || code.length > 100 || typeof id !== 'string')
		throw new HttpsError('invalid-argument', 'Invalid handoff.');
	const ref = db.collection('agreementHandoffs').doc(digest(code));
	const uid = await db.runTransaction(async (tx) => {
		const record = (await tx.get(ref)).data();
		if (!record || record.expiresAt < Date.now() || record.documentId !== id)
			throw new HttpsError(
				'permission-denied',
				'Sign-in link expired. Open Sign from the question again.',
			);
		tx.delete(ref);

		return String(record.uid);
	});

	return { token: await getAuth().createCustomToken(uid) };
});
