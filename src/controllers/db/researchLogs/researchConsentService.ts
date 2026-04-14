/**
 * Research Consent Service
 *
 * Manages user consent for research logging.
 * Consent is per-topParentId (covers all sub-statements).
 * Cached in memory to avoid repeated Firestore reads.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DB } from '@/controllers/db/config';
import { Collections, getResearchConsentId } from '@freedi/shared-types';
import type { ResearchConsent } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

// In-memory cache: consentId → consented
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

	// Check cache first
	if (consentCache.has(consentId)) {
		return consentCache.get(consentId)!;
	}

	try {
		const docRef = doc(DB, Collections.researchConsent, consentId);
		const snapshot = await getDoc(docRef);

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

		const docRef = doc(DB, Collections.researchConsent, consentId);
		await setDoc(docRef, consent);

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

/**
 * Check cached consent synchronously (for use in logResearchAction).
 * Returns: true = consented, false = opted out, undefined = unknown/not cached
 */
export function getCachedConsent(userId: string, topParentId: string): boolean | undefined {
	const consentId = getResearchConsentId(userId, topParentId);

	return consentCache.get(consentId);
}
