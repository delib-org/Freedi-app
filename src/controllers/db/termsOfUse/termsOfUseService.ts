// termsOfUseService.ts
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { TermsOfUseAcceptanceSchema, type TermsOfUseAcceptance } from '@/types/agreement/Agreement';
import { DB, auth } from '../config';
import { Collections } from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';

export async function getLatestTermsAcceptance(
	userId: string,
): Promise<TermsOfUseAcceptance | null> {
	try {
		if (!auth.currentUser) {
			return null;
		}

		// Ensure the auth token is ready before querying Firestore
		await auth.currentUser.getIdToken();

		const q = query(
			collection(DB, Collections.termsOfUseAcceptance),
			where('userId', '==', userId),
		);

		const querySnapshot = await getDocs(q);

		if (querySnapshot.empty) return null;

		const doc = parse(TermsOfUseAcceptanceSchema, querySnapshot.docs[0].data());

		return doc;
	} catch (error) {
		// Permission errors during auth initialization are transient — suppress them
		if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
			return null;
		}

		logError(error, {
			operation: 'termsOfUse.termsOfUseService.getLatestTermsAcceptance',
			metadata: { message: 'Error fetching terms acceptance:' },
		});

		return null;
	}
}

/**
 * Outcome of attempting to persist a terms-of-use acceptance.
 * `blocked` means the write was rejected before it reached our security rules —
 * almost always a failed Firebase App Check token because a browser extension /
 * ad blocker is blocking reCAPTCHA. That case needs a user-facing message, not a
 * silent no-op.
 *
 * A string-literal union (rather than a boolean-discriminated object union) is
 * used deliberately: this project compiles without `strictNullChecks`, where
 * boolean-literal discriminants do not narrow reliably.
 */
export type SaveTermsResult = 'success' | 'not-authenticated' | 'blocked' | 'unknown';

/**
 * Detect a Firestore permission-denied error. When App Check is enforced, a
 * missing/failed App Check token surfaces here as `permission-denied` even though
 * the user is authenticated and the rules would otherwise allow the write.
 */
function isPermissionDeniedError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;

	const code = (error as { code?: unknown }).code;

	return (
		code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')
	);
}

export async function saveTermsAcceptance(
	acceptance: TermsOfUseAcceptance,
): Promise<SaveTermsResult> {
	if (!auth.currentUser) {
		return 'not-authenticated';
	}

	try {
		const termsRef = collection(DB, Collections.termsOfUseAcceptance);

		await addDoc(termsRef, {
			...acceptance,
			date: Date.now(),
		});

		return 'success';
	} catch (error) {
		const blocked = isPermissionDeniedError(error);

		logError(error, {
			operation: 'termsOfUse.termsOfUseService.saveTermsAcceptance',
			userId: auth.currentUser.uid,
			metadata: { message: 'Error saving terms acceptance', blocked },
		});

		return blocked ? 'blocked' : 'unknown';
	}
}

// Firestore Security Rules
/*
  rules_version = '2';
  service cloud.firestore {
	match /databases/{database}/documents {
	  match /termsOfUseAcceptance/{document} {
		allow read: if request.auth != null && 
					  request.auth.uid == resource.data.userId;
		allow create: if request.auth != null && 
					   request.auth.uid == request.resource.data.userId &&
					   request.resource.data.accepted == true;
	  }
	}
  }
  */
