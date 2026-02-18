import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { FireStore } from '../config';

export interface MemberValidationStatus {
	statementId: string;
	userId: string;
	status: 'pending' | 'approved' | 'flagged' | 'banned';
	reason?: string;
	reviewedBy?: string;
	reviewedAt?: number;
	createdAt: number;
	lastUpdate: number;
}

/**
 * Save member validation status to Firestore
 */
export async function saveMemberValidationStatus(
	statementId: string,
	userId: string,
	status: 'pending' | 'approved' | 'flagged' | 'banned',
	reason?: string,
	reviewedBy?: string,
): Promise<void> {
	try {
		const validationId = `${statementId}_${userId}`;
		const validationRef = doc(FireStore, 'memberValidationStatuses', validationId);

		const validationData: Record<string, unknown> = {
			statementId,
			userId,
			status,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		};

		// Only add optional fields if they have values
		if (reason) {
			validationData.reason = reason;
		}
		if (reviewedBy) {
			validationData.reviewedBy = reviewedBy;
		}
		if (status !== 'pending') {
			validationData.reviewedAt = Date.now();
		}

		await setDoc(validationRef, validationData, { merge: true });
	} catch (error) {
		console.error('Error saving member validation status:', error);
		throw error;
	}
}

/**
 * Get member validation status from Firestore
 */
export async function getMemberValidationStatus(
	statementId: string,
	userId: string,
): Promise<MemberValidationStatus | null> {
	try {
		const validationId = `${statementId}_${userId}`;
		const validationRef = doc(FireStore, 'memberValidationStatuses', validationId);
		const validationDoc = await getDoc(validationRef);

		if (validationDoc.exists()) {
			return validationDoc.data() as MemberValidationStatus;
		}

		return null;
	} catch (error) {
		console.error('Error getting member validation status:', error);

		return null;
	}
}

/**
 * Get all member validation statuses for a statement
 */
export async function getAllMemberValidationStatuses(
	statementId: string,
): Promise<Map<string, MemberValidationStatus>> {
	try {
		const statusesRef = collection(FireStore, 'memberValidationStatuses');
		const q = query(statusesRef, where('statementId', '==', statementId));
		const querySnapshot = await getDocs(q);

		const statusMap = new Map<string, MemberValidationStatus>();

		querySnapshot.forEach((doc) => {
			const status = doc.data() as MemberValidationStatus;
			statusMap.set(status.userId, status);
		});

		return statusMap;
	} catch (error) {
		console.error('Error getting all member validation statuses:', error);

		return new Map();
	}
}
