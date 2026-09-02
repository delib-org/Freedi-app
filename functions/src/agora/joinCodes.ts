import { randomInt } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import { Collections, AGORA_SESSION, AGORA_CLASSROOM } from '@freedi/shared-types';

const MAX_ATTEMPTS = 10;

/**
 * Mint a join code no other recent session is using.
 *
 * Shared by the teacher's session and the civic sessions an Odyssey island
 * opens, because a code collision between the two tracks would be exactly as
 * bad as one within either.
 */
export async function generateUniqueCode(): Promise<string> {
	const { JOIN_CODE_LENGTH, JOIN_CODE_ALPHABET, JOIN_CODE_UNIQUE_WINDOW_MS } = AGORA_SESSION;
	const cutoff = Date.now() - JOIN_CODE_UNIQUE_WINDOW_MS;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		let code = '';
		for (let index = 0; index < JOIN_CODE_LENGTH; index++) {
			// randomInt is CSPRNG-backed and rejection-samples internally, so every
			// symbol is equally likely. Math.random() is neither: it is predictable
			// from prior output, which would let anyone who has seen a few codes
			// guess the next class's.
			code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
		}

		// Collide against everything minted in the window, not just sessions that
		// are still open. A finished lesson's code has to stay taken, or a student
		// still holding it would land in whatever class recycled it today.
		const recent = await db
			.collection(Collections.agoraSessions)
			.where('code', '==', code)
			.where('createdAt', '>=', cutoff)
			.limit(1)
			.get();

		if (recent.empty) return code;
	}

	throw new HttpsError('resource-exhausted', 'Could not generate a unique join code');
}

/**
 * Mint a persistent class code no other class is using.
 *
 * Deliberately ONE digit longer than a session code, so the join screen can
 * tell "join today's game" from "join your class" by length alone. Unlike
 * session codes these live for years and are never recycled, so the collision
 * check runs against every class ever opened, not a time window.
 */
export async function generateUniqueClassCode(): Promise<string> {
	const { JOIN_CODE_ALPHABET } = AGORA_SESSION;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		let code = '';
		for (let index = 0; index < AGORA_CLASSROOM.CLASS_CODE_LENGTH; index++) {
			code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
		}

		const existing = await db
			.collection(Collections.agoraClasses)
			.where('classCode', '==', code)
			.limit(1)
			.get();

		if (existing.empty) return code;
	}

	throw new HttpsError('resource-exhausted', 'Could not generate a unique class code');
}
