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

export async function saveTermsAcceptance(acceptance: TermsOfUseAcceptance): Promise<boolean> {
	try {
		if (!auth.currentUser) {
			return false;
		}

		const termsRef = collection(DB, Collections.termsOfUseAcceptance);

		await addDoc(termsRef, {
			...acceptance,
			date: Date.now(),
		});

		return true;
	} catch (error) {
		logError(error, {
			operation: 'termsOfUse.termsOfUseService.saveTermsAcceptance',
			metadata: { message: 'Error saving terms acceptance:' },
		});

		return false;
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
