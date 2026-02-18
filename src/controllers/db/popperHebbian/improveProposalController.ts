import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { FireStore, functions, auth } from '../config';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logger } from '@/services/logger';
import { ImproveProposalResponse, StatementVersion } from '@/models/popperHebbian';

/**
 * Request AI improvement for a proposal based on discussion comments
 */
export async function requestProposalImprovement(
	statementId: string,
	language: string = 'en',
): Promise<ImproveProposalResponse> {
	try {
		const improveProposal = httpsCallable<
			{ statementId: string; language: string },
			ImproveProposalResponse
		>(functions, 'improveProposalWithAI');

		const result = await improveProposal({ statementId, language });
		logger.info('Proposal improvement requested', { statementId });

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'improveProposalController.requestProposalImprovement',
			statementId,
		});
		throw error;
	}
}

/**
 * Apply AI improvement with version control
 * Saves the original (if first improvement) and new version to version history
 */
export async function applyImprovement(
	statementId: string,
	currentTitle: string,
	currentDescription: string,
	improvedTitle: string,
	improvedDescription: string,
	improvementSummary: string,
	currentVersion: number = 0,
): Promise<void> {
	try {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('User must be authenticated');
		}

		const statementRef = doc(FireStore, Collections.statements, statementId);
		const newVersion: StatementVersion = {
			version: currentVersion + 1,
			title: improvedTitle,
			description: improvedDescription,
			timestamp: getCurrentTimestamp(),
			changedBy: currentUser.uid,
			changeType: 'ai-improved',
			improvementSummary,
		};

		// Build update object
		const updates: Record<string, unknown> = {
			statement: improvedTitle,
			description: improvedDescription,
			lastUpdate: getCurrentTimestamp(),
			currentVersion: currentVersion + 1,
		};

		if (currentVersion === 0) {
			// First improvement: save original as version 0
			const originalVersion: StatementVersion = {
				version: 0,
				title: currentTitle,
				description: currentDescription,
				timestamp: getCurrentTimestamp(),
				changedBy: currentUser.uid,
				changeType: 'manual',
			};
			updates.versions = [originalVersion, newVersion];
		} else {
			// Subsequent improvements: append to versions array
			updates.versions = arrayUnion(newVersion);
		}

		await updateDoc(statementRef, updates);
		logger.info('Improvement applied', {
			statementId,
			newVersion: currentVersion + 1,
		});
	} catch (error) {
		logError(error, {
			operation: 'improveProposalController.applyImprovement',
			statementId,
		});
		throw error;
	}
}

/**
 * Revert to a previous version
 * Creates a new version entry that restores the title and description from the target version
 */
export async function revertToVersion(
	statementId: string,
	versions: StatementVersion[],
	targetVersion: number,
): Promise<void> {
	try {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('User must be authenticated');
		}

		const targetVersionData = versions.find((v) => v.version === targetVersion);
		if (!targetVersionData) {
			throw new Error('Target version not found');
		}

		const statementRef = doc(FireStore, Collections.statements, statementId);

		// Create revert version entry
		const revertVersion: StatementVersion = {
			version: versions.length,
			title: targetVersionData.title,
			description: targetVersionData.description,
			timestamp: getCurrentTimestamp(),
			changedBy: currentUser.uid,
			changeType: 'manual',
			improvementSummary: `Reverted to version ${targetVersion}`,
		};

		await updateDoc(statementRef, {
			statement: targetVersionData.title,
			description: targetVersionData.description || '',
			lastUpdate: getCurrentTimestamp(),
			currentVersion: versions.length,
			versions: arrayUnion(revertVersion),
		});

		logger.info('Reverted to version', { statementId, targetVersion });
	} catch (error) {
		logError(error, {
			operation: 'improveProposalController.revertToVersion',
			statementId,
			metadata: { targetVersion },
		});
		throw error;
	}
}

/**
 * Check if user can improve this proposal
 * Returns true if user is the creator or has admin/creator role
 */
export function canUserImprove(statement: Statement, userId: string, userRole?: string): boolean {
	const isCreator = statement.creatorId === userId;
	const isAdmin = userRole === 'admin' || userRole === 'creator';

	return isCreator || isAdmin;
}

/**
 * Get statement with versions from Firestore
 */
export async function getStatementWithVersions(
	statementId: string,
): Promise<Statement & { versions?: StatementVersion[]; currentVersion?: number }> {
	try {
		const statementRef = doc(FireStore, Collections.statements, statementId);
		const statementSnap = await getDoc(statementRef);

		if (!statementSnap.exists()) {
			throw new Error('Statement not found');
		}

		return statementSnap.data() as Statement & {
			versions?: StatementVersion[];
			currentVersion?: number;
		};
	} catch (error) {
		logError(error, {
			operation: 'improveProposalController.getStatementWithVersions',
			statementId,
		});
		throw error;
	}
}
