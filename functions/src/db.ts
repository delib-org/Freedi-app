import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase if not already initialized
if (!getApps().length) {
	initializeApp();
}

export const db: Firestore = getFirestore();
