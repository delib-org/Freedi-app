import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AGORA_CLASSROOM } from '@freedi/shared-types';

/**
 * Rejoin-PIN helpers. A 4-digit PIN is not a secret worth a KDF — its whole
 * space fits in a coffee break — so the real guard is the server-side attempt
 * counter on the member doc (MAX_PIN_ATTEMPTS, teacher resets). Hashing with a
 * salt still keeps raw PINs out of Firestore, backups and admin eyeballs.
 */

export function generatePin(): string {
	let pin = '';
	for (let index = 0; index < AGORA_CLASSROOM.PIN_LENGTH; index++) {
		pin += String(randomInt(10));
	}

	return pin;
}

export function hashPin(pin: string): string {
	const salt = randomBytes(8).toString('hex');
	const digest = createHash('sha256').update(`${salt}:${pin}`).digest('hex');

	return `${salt}:${digest}`;
}

export function verifyPin(pin: string, stored: string | undefined): boolean {
	if (!stored) return false;
	const [salt, digest] = stored.split(':');
	if (!salt || !digest) return false;
	const candidate = createHash('sha256').update(`${salt}:${pin}`).digest('hex');

	return (
		candidate.length === digest.length &&
		timingSafeEqual(Buffer.from(candidate), Buffer.from(digest))
	);
}
