import { doc, setDoc, updateDoc, deleteDoc, getDoc, collection, query, where, onSnapshot, increment, Unsubscribe } from 'firebase/firestore';
import { FireStore, auth } from '../config';
import { Collections, Statement, StatementType, Creator } from 'delib-npm';
import { logger } from '@/services/logger';

function generateId(): string {
	return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an evidence post (statement with evidence field)
 */
export async function createEvidencePost(
	parentStatementId: string,
	content: string,
	support: number // -1 to 1
): Promise<Statement> {
	try {
		// Get current user
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('User must be authenticated to create evidence');
		}

		// Get parent statement to access topParentId
		const parentRef = doc(FireStore, Collections.statements, parentStatementId);
		const parentSnap = await getDoc(parentRef);

		if (!parentSnap.exists()) {
			throw new Error('Parent statement not found');
		}

		const parentStatement = parentSnap.data() as Statement;

		if (support < -1 || support > 1) {
			throw new Error('Support value must be between -1 and 1');
		}

		const statementId = generateId();

		// Create creator object from current user
		const creator: Creator = {
			displayName: currentUser.displayName || 'Anonymous',
			uid: currentUser.uid,
			photoURL: currentUser.photoURL || '',
			email: currentUser.email || ''
		};

		const evidenceStatement: Statement = {
			statementId,
			statement: content,
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
				evidenceWeight: 1.0 // Will be updated by Firebase Function after AI classification
			}
		};

		await setDoc(
			doc(FireStore, Collections.statements, statementId),
			evidenceStatement
		);

		logger.info('Evidence post created', { statementId, parentId: parentStatement.statementId });

		return evidenceStatement;
	} catch (error) {
		logger.error('Failed to create evidence post', error, {
			parentId: parentStatementId
		});
		throw error;
	}
}

/**
 * Listen to evidence posts for a statement
 */
export function listenToEvidencePosts(
	statementId: string,
	callback: (posts: Statement[]) => void
): Unsubscribe {
	const q = query(
		collection(FireStore, Collections.statements),
		where('parentId', '==', statementId),
		where('evidence', '!=', null)
	);

	return onSnapshot(q, (snapshot) => {
		const posts = snapshot.docs.map(doc => doc.data() as Statement);
		callback(posts);
	}, (error) => {
		logger.error('Error listening to evidence posts', error, { statementId });
	});
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
	voteType: 'helpful' | 'not-helpful'
): Promise<void> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
		const statementRef = doc(FireStore, Collections.statements, evidenceStatementId);

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
						lastUpdate: Date.now()
					});
				} else {
					await updateDoc(statementRef, {
						'evidence.notHelpfulCount': increment(-1),
						lastUpdate: Date.now()
					});
				}

				// Increment new vote type
				if (voteType === 'helpful') {
					await updateDoc(statementRef, {
						'evidence.helpfulCount': increment(1),
						lastUpdate: Date.now()
					});
				} else {
					await updateDoc(statementRef, {
						'evidence.notHelpfulCount': increment(1),
						lastUpdate: Date.now()
					});
				}

				// Update vote document
				await updateDoc(voteRef, {
					voteType,
					createdAt: Date.now()
				});

				logger.info('Vote changed', { voteId, voteType });
			}
		} else {
			// New vote - increment appropriate counter
			if (voteType === 'helpful') {
				await updateDoc(statementRef, {
					'evidence.helpfulCount': increment(1),
					lastUpdate: Date.now()
				});
			} else {
				await updateDoc(statementRef, {
					'evidence.notHelpfulCount': increment(1),
					lastUpdate: Date.now()
				});
			}

			// Create vote document
			const vote: EvidenceVote = {
				voteId,
				evidenceStatementId,
				userId,
				voteType,
				createdAt: Date.now()
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
export async function removeVote(
	evidenceStatementId: string,
	userId: string
): Promise<void> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
		const statementRef = doc(FireStore, Collections.statements, evidenceStatementId);

		// Get existing vote
		const voteSnap = await getDoc(voteRef);

		if (voteSnap.exists()) {
			const vote = voteSnap.data() as EvidenceVote;

			// Decrement appropriate counter
			if (vote.voteType === 'helpful') {
				await updateDoc(statementRef, {
					'evidence.helpfulCount': increment(-1),
					lastUpdate: Date.now()
				});
			} else {
				await updateDoc(statementRef, {
					'evidence.notHelpfulCount': increment(-1),
					lastUpdate: Date.now()
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
	userId: string
): Promise<'helpful' | 'not-helpful' | null> {
	try {
		const voteId = `${evidenceStatementId}_${userId}`;
		const voteRef = doc(FireStore, Collections.evidenceVotes, voteId);
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
