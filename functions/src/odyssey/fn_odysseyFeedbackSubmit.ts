import { randomUUID } from 'crypto';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { safeParse } from 'valibot';
import {
	Collections,
	OdysseyFeedbackRequestSchema,
	functionConfig,
	type OdysseyFeedback,
	type OdysseyFeedbackResponse as Result,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { sendOdysseyFeedbackEmail } from './odysseyFeedbackEmail';
import { reserveOdysseyFeedbackSlot } from './odysseyRateLimit';

/**
 * "מכתב לבוני הספינה" — a player writes to the people who built the game.
 *
 * The order is validate → throttle → write → email, and each step is where it is
 * for a reason: a malformed payload must not burn a rate-limit slot, and the
 * letter must be on disk before anything as failure-prone as SMTP is attempted.
 *
 * Auth is required even though the button appears before sign-in. The client
 * signs in anonymously first (`apps/odyssey/src/lib/feedback.ts`), which costs
 * the visitor nothing — it is the same call the intro page makes to start a
 * voyage. An unauthenticated callable would instead be a public email relay:
 * this project has no App Check, the URL is discoverable, and the two recipients
 * are fixed, so a scripted loop would cost us the deliverability of the Gmail
 * account that also carries organization invites and voyage digests. Requiring
 * auth also gives the throttle a key to count against.
 */
export const odysseyFeedbackSubmit = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<unknown>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		// Identity comes from the verified token and nowhere else. The request
		// schema has no uid field, so a payload cannot claim to be someone.
		const token = request.auth?.token;
		const isAnonymous = token?.firebase?.sign_in_provider === 'anonymous';
		const displayName = typeof token?.name === 'string' ? token.name : (token?.email ?? undefined);

		const parsed = safeParse(OdysseyFeedbackRequestSchema, request.data);
		if (!parsed.success) {
			// The PATH, not the English validator prose — the client maps it to a
			// Hebrew line of its own.
			const path = parsed.issues[0]?.path?.map((entry) => String(entry.key)).join('.');
			throw new HttpsError('invalid-argument', path ?? 'message');
		}

		await reserveOdysseyFeedbackSlot(uid, Date.now());

		const feedbackId = randomUUID();
		const feedback: OdysseyFeedback = {
			feedbackId,
			message: parsed.output.message,
			...(parsed.output.email ? { email: parsed.output.email } : {}),
			uid,
			isAnonymous,
			...(displayName ? { displayName } : {}),
			context: parsed.output.context ?? {},
			createdAt: Date.now(),
			emailed: false,
		};

		try {
			await db.collection(Collections.odysseyFeedback).doc(feedbackId).set(feedback);
		} catch (error) {
			// The only failure the player is told about, because it is the only one
			// where their words are actually lost.
			logError(error, {
				operation: 'odyssey.feedbackSubmit.write',
				userId: uid,
				metadata: { feedbackId },
			});
			throw new HttpsError('internal', 'Failed to save feedback');
		}

		// sendOdysseyFeedbackEmail swallows its own failures, but belt and braces:
		// the letter is already on disk, and nothing that happens to the mail is
		// worth telling the player their words were lost.
		const emailed = await sendOdysseyFeedbackEmail(feedback).catch((error: unknown) => {
			logError(error, {
				operation: 'odyssey.feedbackSubmit.email',
				userId: uid,
				metadata: { feedbackId },
			});

			return false;
		});

		if (emailed) {
			try {
				await db
					.collection(Collections.odysseyFeedback)
					.doc(feedbackId)
					.update({ emailed: true, emailedAt: Date.now() });
			} catch (error) {
				// Bookkeeping only. A letter that already arrived must not be
				// reported as a failure because we could not tick a box.
				logError(error, {
					operation: 'odyssey.feedbackSubmit.markEmailed',
					userId: uid,
					metadata: { feedbackId },
				});
			}
		}

		return { feedbackId, emailed };
	},
);
