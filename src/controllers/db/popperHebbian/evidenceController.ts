import {
	setDoc,
	updateDoc,
	deleteDoc,
	getDoc,
	query,
	where,
	onSnapshot,
	increment,
	Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config';
import { Collections, Statement, StatementType, Creator } from '@freedi/shared-types';
import { logger } from '@/services/logger';
import { createStatementRef, createDocRef, createCollectionRef } from '@/utils/firebaseUtils';
import { detectUrls } from '@/utils/urlHelpers';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

function generateId(): string {
	return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

interface LinkMetadata {
	url: string;
	title: string;
	summary: string;
	domain: string;
}

interface LinkWithMetadata {
	formattedText: string;
	metadata: LinkMetadata | null;
}

/**
 * Get user's language preference from the Freedi app config
 */
function getUserLanguage(): string {
	try {
		// Read userConfig from localStorage (where app stores all user preferences)
		const savedConfig = localStorage.getItem(LocalStorageObjects.UserConfig);
		if (savedConfig) {
			const parsedConfig = JSON.parse(savedConfig);
			const chosenLanguage = parsedConfig.chosenLanguage;
			if (chosenLanguage) {
				console.info('[Link Summary] Using app language preference:', chosenLanguage);

				return chosenLanguage;
			}
		}
	} catch (error) {
		console.error('[Link Summary] Error reading userConfig from localStorage:', error);
	}

	// Fallback to browser language
	const browserLanguage = navigator.language || navigator.languages?.[0];
	if (browserLanguage) {
		// Extract just the language code (e.g., 'en' from 'en-US')
		const lang = browserLanguage.split('-')[0];
		console.info('[Link Summary] Using browser language:', lang, 'from', browserLanguage);

		return lang;
	}

	// Default to Hebrew (app default)
	console.info('[Link Summary] Using default language: he');

	return 'he';
}

/**
 * Process text containing links - fetch metadata and format
 */
async function processLinks(text: string): Promise<LinkWithMetadata> {
	const urls = detectUrls(text);

	if (urls.length === 0) {
		return { formattedText: text, metadata: null };
	}

	try {
		// For now, only process the first link
		const url = urls[0];

		// Get user's language preference
		const language = getUserLanguage();
		console.info('[Link Summary] Processing link with language:', language, 'URL:', url);

		// Call the summarizeLink function with language
		const summarizeLinkFn = httpsCallable<{ url: string; language: string }, LinkMetadata>(
			functions,
			'summarizeLink',
		);
		const result = await summarizeLinkFn({ url, language });
		console.info('[Link Summary] Received summary in language:', language);

		const metadata = result.data;

		// Replace the URL in the text with formatted markdown link
		const formattedText = text.replace(url, `[${metadata.title}](${url})`);

		return { formattedText, metadata };
	} catch (error) {
		logger.error('Failed to process link', error, { urls });

		// Return original text if processing fails
		return { formattedText: text, metadata: null };
	}
}

/**
 * Create an evidence post (statement with evidence field)
 * Note: support level is now auto-classified by AI, default is 0 (neutral)
 */
export async function createEvidencePost(
	parentStatementId: string,
	content: string,
	support: number = 0, // Default to neutral, will be overridden by AI
): Promise<Statement> {
	try {
		// Get current user
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('User must be authenticated to create evidence');
		}

		// Get parent statement to access topParentId
		const parentRef = createStatementRef(parentStatementId);
		const parentSnap = await getDoc(parentRef);

		if (!parentSnap.exists()) {
			throw new Error('Parent statement not found');
		}

		const parentStatement = parentSnap.data() as Statement;

		if (support < -1 || support > 1) {
			throw new Error('Support value must be between -1 and 1');
		}

		// Process any links in the content
		const { formattedText, metadata: linkMetadata } = await processLinks(content);

		const statementId = generateId();

		// Create creator object from current user
		const creator: Creator = {
			displayName: currentUser.displayName || 'Anonymous',
			uid: currentUser.uid,
			photoURL: currentUser.photoURL || '',
			email: currentUser.email || '',
		};

		const evidenceStatement: Statement = {
			statementId,
			statement: formattedText, // Use formatted text with link
			statementType: StatementType.statement,
			parentId: parentStatement.statementId,
			topParentId: parentStatement.topParentId,
			creatorId: currentUser.uid,
			creator,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
			consensus: 0,
			evidence: {
				support, // -1 to 1: how much this evidence supports/challenges the parent
				helpfulCount: 0,
				notHelpfulCount: 0,
				netScore: 0,
				evidenceWeight: 1.0, // Will be updated by Firebase Function after AI classification
				...(linkMetadata && { linkMetadata }), // Add link metadata if available
			},
		};

		await setDoc(createStatementRef(statementId), evidenceStatement);

		logger.info('Evidence post created', { statementId, parentId: parentStatement.statementId });

		return evidenceStatement;
	} catch (error) {
		logger.error('Failed to create evidence post', error, {
			parentId: parentStatementId,
		});
		throw error;
	}
}

/**
 * Listen to evidence posts for a statement
 */
export function listenToEvidencePosts(
	statementId: string,
	callback: (posts: Statement[]) => void,
): Unsubscribe {
	const q = query(
		createCollectionRef(Collections.statements),
		where('parentId', '==', statementId),
		where('evidence', '!=', null),
	);

	return onSnapshot(
		q,
		(snapshot) => {
			const posts = snapshot.docs.map((doc) => doc.data() as Statement);
			callback(posts);
		},
		(error) => {
			logger.error('Error listening to evidence posts', error, { statementId });
		},
	);
}

/**
 * Vote interface for evidence quality
 */
export interface EvidenceVote {
	voteId: string;
	evidenceStatementId: string;
	userId: string;
	voteType: 'helpful' | 'not-helpful';
	createdAt: number;
}

/**
 * Submit or change a vote on evidence quality
 */
export async function submitVote(
	evidenceStatementId: string,
	userId: string,
	voteType: 'helpful' | 'not-helpful',
): Promise<void> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = createDocRef(Collections.evidenceVotes, voteId);
		const statementRef = createStatementRef(evidenceStatementId);

		// Check if user already voted
		const existingVote = await getDoc(voteRef);

		if (existingVote.exists()) {
			const oldVote = existingVote.data() as EvidenceVote;

			// If changing vote type
			if (oldVote.voteType !== voteType) {
				// Decrement old vote type
				if (oldVote.voteType === 'helpful') {
					await updateDoc(statementRef, {
						'evidence.helpfulCount': increment(-1),
						lastUpdate: Date.now(),
					});
				} else {
					await updateDoc(statementRef, {
						'evidence.notHelpfulCount': increment(-1),
						lastUpdate: Date.now(),
					});
				}

				// Increment new vote type
				if (voteType === 'helpful') {
					await updateDoc(statementRef, {
						'evidence.helpfulCount': increment(1),
						lastUpdate: Date.now(),
					});
				} else {
					await updateDoc(statementRef, {
						'evidence.notHelpfulCount': increment(1),
						lastUpdate: Date.now(),
					});
				}

				// Update vote document
				await updateDoc(voteRef, {
					voteType,
					createdAt: Date.now(),
				});

				logger.info('Vote changed', { voteId, voteType });
			}
		} else {
			// New vote - increment appropriate counter
			if (voteType === 'helpful') {
				await updateDoc(statementRef, {
					'evidence.helpfulCount': increment(1),
					lastUpdate: Date.now(),
				});
			} else {
				await updateDoc(statementRef, {
					'evidence.notHelpfulCount': increment(1),
					lastUpdate: Date.now(),
				});
			}

			// Create vote document
			const vote: EvidenceVote = {
				voteId,
				evidenceStatementId,
				userId,
				voteType,
				createdAt: Date.now(),
			};

			await setDoc(voteRef, vote);

			logger.info('Vote submitted', { voteId, voteType });
		}
	} catch (error) {
		logger.error('Failed to submit vote', error, { evidenceStatementId, userId });
		throw error;
	}
}

/**
 * Remove a vote
 */
export async function removeVote(evidenceStatementId: string, userId: string): Promise<void> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = createDocRef(Collections.evidenceVotes, voteId);
		const statementRef = createStatementRef(evidenceStatementId);

		// Get existing vote
		const voteSnap = await getDoc(voteRef);

		if (voteSnap.exists()) {
			const vote = voteSnap.data() as EvidenceVote;

			// Decrement appropriate counter
			if (vote.voteType === 'helpful') {
				await updateDoc(statementRef, {
					'evidence.helpfulCount': increment(-1),
					lastUpdate: Date.now(),
				});
			} else {
				await updateDoc(statementRef, {
					'evidence.notHelpfulCount': increment(-1),
					lastUpdate: Date.now(),
				});
			}

			// Delete vote document
			await deleteDoc(voteRef);

			logger.info('Vote removed', { voteId });
		}
	} catch (error) {
		logger.error('Failed to remove vote', error, { evidenceStatementId, userId });
		throw error;
	}
}

/**
 * Get user's vote for an evidence post
 */
export async function getUserVote(
	evidenceStatementId: string,
	userId: string,
): Promise<'helpful' | 'not-helpful' | null> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = createDocRef(Collections.evidenceVotes, voteId);
		const voteSnap = await getDoc(voteRef);

		if (voteSnap.exists()) {
			const vote = voteSnap.data() as EvidenceVote;

			return vote.voteType;
		}

		return null;
	} catch (error) {
		logger.error('Failed to get user vote', error, { evidenceStatementId, userId });

		return null;
	}
}

/**
 * Update an existing evidence post
 * This will trigger AI re-evaluation via the backend function
 * Note: support level will be re-classified by AI after update
 */
export async function updateEvidencePost(
	statementId: string,
	content: string,
	support: number = 0, // Default to neutral, will be overridden by AI
): Promise<void> {
	try {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('User must be authenticated to update evidence');
		}

		if (support < -1 || support > 1) {
			throw new Error('Support value must be between -1 and 1');
		}

		const statementRef = createStatementRef(statementId);
		const statementSnap = await getDoc(statementRef);

		if (!statementSnap.exists()) {
			throw new Error('Statement not found');
		}

		const statement = statementSnap.data() as Statement;

		// Check if user is the creator
		if (statement.creatorId !== currentUser.uid) {
			throw new Error('Only the creator can edit this evidence');
		}

		// Process any links in the content
		const { formattedText, metadata: linkMetadata } = await processLinks(content);

		// Update the statement and evidence support level
		const updateData: Record<string, unknown> = {
			statement: formattedText,
			'evidence.support': support,
			lastUpdate: Date.now(),
		};

		// Add or remove link metadata
		if (linkMetadata) {
			updateData['evidence.linkMetadata'] = linkMetadata;
		}

		await updateDoc(statementRef, updateData);

		logger.info('Evidence post updated', { statementId });
	} catch (error) {
		logger.error('Failed to update evidence post', error, { statementId });
		throw error;
	}
}
