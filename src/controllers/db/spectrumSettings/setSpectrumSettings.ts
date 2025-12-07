import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { Collections, getRandomUID } from 'delib-npm';
import { SpectrumSettings } from '@/types/spectrumSettings';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';

const SPECTRUM_SETTINGS_COLLECTION = 'spectrumSettings';

/**
 * Save or update spectrum settings for a statement (question)
 */
export async function saveSpectrumSettings(
	settings: Omit<SpectrumSettings, 'settingsId' | 'createdAt' | 'lastUpdate'>
): Promise<SpectrumSettings | null> {
	try {
		const { statementId } = settings;

		// Check if settings already exist for this statement
		const existingSettings = await getSpectrumSettings(statementId);

		const now = getCurrentTimestamp();
		const settingsId = existingSettings?.settingsId || `spectrum--${statementId}`;

		const spectrumSettings: SpectrumSettings = {
			...settings,
			settingsId,
			createdAt: existingSettings?.createdAt || now,
			lastUpdate: now,
		};

		const docRef = doc(FireStore, SPECTRUM_SETTINGS_COLLECTION, settingsId);
		await setDoc(docRef, spectrumSettings);

		return spectrumSettings;
	} catch (error) {
		logError(error, {
			operation: 'spectrumSettings.saveSpectrumSettings',
			statementId: settings.statementId,
		});

		return null;
	}
}

/**
 * Get spectrum settings for a statement
 */
export async function getSpectrumSettings(
	statementId: string
): Promise<SpectrumSettings | null> {
	try {
		const settingsId = `spectrum--${statementId}`;
		const docRef = doc(FireStore, SPECTRUM_SETTINGS_COLLECTION, settingsId);
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			return docSnap.data() as SpectrumSettings;
		}

		return null;
	} catch (error) {
		logError(error, {
			operation: 'spectrumSettings.getSpectrumSettings',
			statementId,
		});

		return null;
	}
}

/**
 * Delete spectrum settings for a statement
 */
export async function deleteSpectrumSettings(
	statementId: string
): Promise<boolean> {
	try {
		const settingsId = `spectrum--${statementId}`;
		const docRef = doc(FireStore, SPECTRUM_SETTINGS_COLLECTION, settingsId);
		await deleteDoc(docRef);

		return true;
	} catch (error) {
		logError(error, {
			operation: 'spectrumSettings.deleteSpectrumSettings',
			statementId,
		});

		return false;
	}
}

/**
 * Get default spectrum settings
 */
export function getDefaultSpectrumSettings(
	statementId: string,
	createdBy: { uid: string; displayName?: string }
): Omit<SpectrumSettings, 'settingsId' | 'createdAt' | 'lastUpdate'> {
	return {
		statementId,
		questionText: 'Where do you position yourself on this issue?',
		labels: ['Very Left', 'Left', 'Center', 'Right', 'Very Right'] as [string, string, string, string, string],
		enabled: true,
		createdBy: {
			uid: createdBy.uid,
			displayName: createdBy.displayName || 'Admin',
		},
	};
}
