import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

/**
 * Save excluded inherited demographic question IDs for a statement
 * @param statementId - The statement ID to update
 * @param excludedIds - Array of demographic question IDs to exclude
 */
export async function setExcludedInheritedDemographics(
	statementId: string,
	excludedIds: string[]
): Promise<void> {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required');
		}

		const statementRef = doc(FireStore, Collections.statements, statementId);

		await updateDoc(statementRef, {
			'statementSettings.excludedInheritedDemographicIds': excludedIds,
		});

		console.info(
			`Updated excluded inherited demographics for statement ${statementId}:`,
			excludedIds.length,
			'questions excluded'
		);
	} catch (error) {
		logError(error, {
			operation: 'excludedInheritedDemographics.setExcludedInheritedDemographics',
			statementId,
			metadata: { excludedIdsCount: excludedIds.length },
		});
		throw error;
	}
}

/**
 * Get excluded inherited demographic question IDs for a statement
 * @param statementId - The statement ID to fetch
 * @returns Array of excluded demographic question IDs
 */
export async function getExcludedInheritedDemographics(
	statementId: string
): Promise<string[]> {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required');
		}

		const statementRef = doc(FireStore, Collections.statements, statementId);
		const statementDoc = await getDoc(statementRef);

		if (!statementDoc.exists()) {
			return [];
		}

		const data = statementDoc.data() as Statement;

		return data.statementSettings?.excludedInheritedDemographicIds || [];
	} catch (error) {
		logError(error, {
			operation: 'excludedInheritedDemographics.getExcludedInheritedDemographics',
			statementId,
		});

		return [];
	}
}

/**
 * Get excluded inherited demographics for multiple statements at once
 * This is useful for the polarization index calculation
 * @param statementIds - Array of statement IDs
 * @returns Map of statementId to excluded question IDs
 */
export async function getExcludedInheritedDemographicsBatch(
	statementIds: string[]
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>();

	try {
		const promises = statementIds.map(async (statementId) => {
			const excludedIds = await getExcludedInheritedDemographics(statementId);
			result.set(statementId, excludedIds);
		});

		await Promise.all(promises);
	} catch (error) {
		logError(error, {
			operation: 'excludedInheritedDemographics.getExcludedInheritedDemographicsBatch',
			metadata: { statementIdsCount: statementIds.length },
		});
	}

	return result;
}
