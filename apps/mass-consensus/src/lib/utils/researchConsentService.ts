/**
 * Research Consent Service for Mass Consensus app
 *
 * Manages user consent for research logging.
 * Consent is per-topParentId (covers all sub-statements).
 * Uses the same Firestore collection as the main app so consent
 * given in one app is respected in all apps.
 */

import { loadFirestore } from '@/lib/firebase/lazyFirestore';
import { Collections, getResearchConsentId } from '@freedi/shared-types';
import type { ResearchConsent } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

// In-memory cache: consentId -> consented
const consentCache = new Map<string, boolean>();

/**
 * Check if user has consented to research for a given topParentId.
 * Returns: true = consented, false = opted out, null = no record (needs to ask)
 */
export async function getResearchConsent(
	userId: string,
	topParentId: string,
): Promise<boolean | null> {
	const consentId = getResearchConsentId(userId, topParentId);

	if (consentCache.has(consentId)) {
		return consentCache.get(consentId)!;
	}

	try {
		const { sdk, db } = await loadFirestore();
		const docRef = sdk.doc(db, Collections.researchConsent, consentId);
		const snapshot = await sdk.getDoc(docRef);

		if (!snapshot.exists()) return null;

		const data = snapshot.data() as ResearchConsent;
		consentCache.set(consentId, data.consented);

		return data.consented;
	} catch (error) {
		logError(error, {
			operation: 'researchConsent.getResearchConsent',
			metadata: { topParentId },
		});

		return null;
	}
}

/**
 * Save user's consent decision.
 */
export async function saveResearchConsent(
	userId: string,
	topParentId: string,
	consented: boolean,
): Promise<boolean> {
	const consentId = getResearchConsentId(userId, topParentId);

	try {
		const consent: ResearchConsent = {
			consentId,
			userId,
			topParentId,
			consented,
			timestamp: Date.now(),
		};

		const { sdk, db } = await loadFirestore();
		const docRef = sdk.doc(db, Collections.researchConsent, consentId);
		await sdk.setDoc(docRef, consent);

		consentCache.set(consentId, consented);

		return true;
	} catch (error) {
		logError(error, {
			operation: 'researchConsent.saveResearchConsent',
			metadata: { topParentId, consented },
		});

		return false;
	}
}
