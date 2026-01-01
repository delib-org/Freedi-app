import {
	collection,
	doc,
	onSnapshot,
	query,
	where,
	orderBy,
	Unsubscribe,
	getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FireStore, functions } from '../config';
import { parse } from 'valibot';
import {
	Collections,
	FairEvalWallet,
	FairEvalWalletSchema,
	FairEvalTransaction,
	FairEvalTransactionSchema,
	getWalletId,
} from '@freedi/shared-types';
import { AppDispatch, store } from '@/redux/store';
import {
	setWalletToStore,
	setTransactionToStore,
	setTransactionsToStore,
	setFairEvalLoading,
	setFairEvalError,
} from '@/redux/fairEval/fairEvalSlice';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';

// Helper to check if an error is IndexedDB-related
function isIndexedDBError(error: unknown): boolean {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorCode = (error as { code?: string })?.code;

	const indexedDBPatterns = [
		'IndexedDB',
		'IDBDatabase',
		'Connection to Indexed Database server lost',
	];

	const firestoreErrorCodes = ['failed-precondition', 'unavailable', 'aborted'];

	return (
		indexedDBPatterns.some((pattern) =>
			errorMessage.toLowerCase().includes(pattern.toLowerCase())
		) || (errorCode !== undefined && firestoreErrorCodes.includes(errorCode))
	);
}

/**
 * Subscribe to the current user's wallet for a specific group
 */
export function subscribeFairEvalWallet(
	topParentId: string,
	userId: string,
	dispatch?: AppDispatch
): Unsubscribe {
	const _dispatch = dispatch ?? store.dispatch;

	try {
		if (!topParentId) throw new Error('topParentId not provided');
		if (!userId) throw new Error('userId not provided');

		const walletId = getWalletId(topParentId, userId);
		const walletRef = doc(FireStore, Collections.fairEvalWallets, walletId);

		return onSnapshot(
			walletRef,
			(walletDoc) => {
				if (walletDoc.exists()) {
					try {
						const wallet = parse(FairEvalWalletSchema, walletDoc.data());
						_dispatch(setWalletToStore(wallet));
					} catch (parseError) {
						logError(parseError, {
							operation: 'fairEvalController.subscribeFairEvalWallet.parse',
							metadata: { topParentId, userId },
						});
					}
				}
			},
			(error) => {
				if (isIndexedDBError(error)) {
					console.error(
						'IndexedDB connection lost in wallet listener. App will continue with limited offline features.',
						error
					);
					return;
				}

				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, {
						operation: 'fairEvalController.subscribeFairEvalWallet.listener',
						metadata: { topParentId, userId },
					});
				}
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.subscribeFairEvalWallet',
			metadata: { topParentId, userId },
		});
		return () => {};
	}
}

/**
 * Subscribe to all wallets for a group (admin view)
 */
export function subscribeAllWalletsForGroup(
	topParentId: string,
	dispatch?: AppDispatch
): Unsubscribe {
	const _dispatch = dispatch ?? store.dispatch;

	try {
		if (!topParentId) throw new Error('topParentId not provided');

		const walletsRef = collection(FireStore, Collections.fairEvalWallets);
		const q = query(walletsRef, where('topParentId', '==', topParentId));

		return onSnapshot(
			q,
			(walletsSnapshot) => {
				walletsSnapshot.docChanges().forEach((change) => {
					try {
						const wallet = parse(FairEvalWalletSchema, change.doc.data());
						if (change.type === 'added' || change.type === 'modified') {
							_dispatch(setWalletToStore(wallet));
						}
					} catch (parseError) {
						logError(parseError, {
							operation: 'fairEvalController.subscribeAllWalletsForGroup.parse',
							metadata: { topParentId },
						});
					}
				});
			},
			(error) => {
				if (isIndexedDBError(error)) {
					console.error(
						'IndexedDB connection lost in wallets listener. App will continue with limited offline features.',
						error
					);
					return;
				}

				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, {
						operation: 'fairEvalController.subscribeAllWalletsForGroup.listener',
						metadata: { topParentId },
					});
				}
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.subscribeAllWalletsForGroup',
			metadata: { topParentId },
		});
		return () => {};
	}
}

/**
 * Subscribe to the current user's transactions for a group
 */
export function subscribeFairEvalTransactions(
	topParentId: string,
	userId: string,
	dispatch?: AppDispatch
): Unsubscribe {
	const _dispatch = dispatch ?? store.dispatch;

	try {
		if (!topParentId) throw new Error('topParentId not provided');
		if (!userId) throw new Error('userId not provided');

		const transactionsRef = collection(FireStore, Collections.fairEvalTransactions);
		const q = query(
			transactionsRef,
			where('topParentId', '==', topParentId),
			where('userId', '==', userId),
			orderBy('createdAt', 'desc')
		);

		return onSnapshot(
			q,
			(transactionsSnapshot) => {
				const transactions: FairEvalTransaction[] = [];
				let firstCall = true;

				transactionsSnapshot.docChanges().forEach((change) => {
					try {
						const transaction = parse(
							FairEvalTransactionSchema,
							change.doc.data()
						);
						if (change.type === 'added') {
							if (firstCall) {
								transactions.push(transaction);
							} else {
								_dispatch(setTransactionToStore(transaction));
							}
						}
						if (change.type === 'modified') {
							_dispatch(setTransactionToStore(transaction));
						}
					} catch (parseError) {
						logError(parseError, {
							operation: 'fairEvalController.subscribeFairEvalTransactions.parse',
							metadata: { topParentId, userId },
						});
					}
				});

				if (firstCall && transactions.length > 0) {
					_dispatch(setTransactionsToStore(transactions));
				}
				firstCall = false;
			},
			(error) => {
				if (isIndexedDBError(error)) {
					console.error(
						'IndexedDB connection lost in transactions listener. App will continue with limited offline features.',
						error
					);
					return;
				}

				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, {
						operation: 'fairEvalController.subscribeFairEvalTransactions.listener',
						metadata: { topParentId, userId },
					});
				}
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.subscribeFairEvalTransactions',
			metadata: { topParentId, userId },
		});
		return () => {};
	}
}

/**
 * Get wallet balance for a user in a group
 */
export async function getWalletBalance(
	topParentId: string,
	userId: string
): Promise<number | null> {
	try {
		if (!topParentId) throw new Error('topParentId not provided');
		if (!userId) throw new Error('userId not provided');

		const walletId = getWalletId(topParentId, userId);
		const walletRef = doc(FireStore, Collections.fairEvalWallets, walletId);
		const walletDoc = await getDoc(walletRef);

		if (!walletDoc.exists()) return null;

		const wallet = parse(FairEvalWalletSchema, walletDoc.data());
		return wallet.balance;
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.getWalletBalance',
			metadata: { topParentId, userId },
		});
		return null;
	}
}

// ============================================================================
// HTTP Callable Functions (Admin Actions)
// ============================================================================

interface AddMinutesRequest {
	topParentId: string;
	amount: number;
}

interface AddMinutesResult {
	success: boolean;
	message: string;
	updatedCount: number;
	totalDistributed: number;
}

/**
 * Add minutes to all members' wallets in a group (admin only)
 */
export async function addMinutesToGroup(
	topParentId: string,
	amount: number
): Promise<AddMinutesResult> {
	const dispatch = store.dispatch;
	dispatch(setFairEvalLoading(true));
	dispatch(setFairEvalError(null));

	try {
		const addMinutes = httpsCallable<AddMinutesRequest, AddMinutesResult>(
			functions,
			'addMinutesToGroup'
		);

		const result = await addMinutes({ topParentId, amount });

		logger.info('Minutes added to group', {
			topParentId,
			amount,
			updatedCount: result.data.updatedCount,
			totalDistributed: result.data.totalDistributed,
		});

		dispatch(setFairEvalLoading(false));
		return result.data;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Failed to add minutes';
		dispatch(setFairEvalError(errorMessage));
		dispatch(setFairEvalLoading(false));

		logError(error, {
			operation: 'fairEvalController.addMinutesToGroup',
			metadata: { topParentId, amount },
		});
		throw error;
	}
}

interface SetAnswerCostRequest {
	statementId: string;
	cost: number;
}

interface SetAnswerCostResult {
	success: boolean;
	message: string;
	statementId: string;
	cost: number;
}

/**
 * Set the cost for an answer (admin only)
 */
export async function setAnswerCost(
	statementId: string,
	cost: number
): Promise<SetAnswerCostResult> {
	try {
		const setCost = httpsCallable<SetAnswerCostRequest, SetAnswerCostResult>(
			functions,
			'setAnswerCost'
		);

		const result = await setCost({ statementId, cost });

		logger.info('Answer cost set', {
			statementId,
			cost,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.setAnswerCost',
			metadata: { statementId, cost },
		});
		throw error;
	}
}

interface AcceptAnswerRequest {
	statementId: string;
}

interface AcceptAnswerResult {
	success: boolean;
	message: string;
	statementId: string;
	totalPaymentCollected: number;
	numberOfPayments: number;
}

/**
 * Accept an answer and deduct payments from supporters (admin only)
 */
export async function acceptFairEvalAnswer(
	statementId: string
): Promise<AcceptAnswerResult> {
	const dispatch = store.dispatch;
	dispatch(setFairEvalLoading(true));
	dispatch(setFairEvalError(null));

	try {
		const accept = httpsCallable<AcceptAnswerRequest, AcceptAnswerResult>(
			functions,
			'acceptFairEvalAnswer'
		);

		const result = await accept({ statementId });

		logger.info('Fair eval answer accepted', {
			statementId,
			totalPaymentCollected: result.data.totalPaymentCollected,
			numberOfPayments: result.data.numberOfPayments,
		});

		dispatch(setFairEvalLoading(false));
		return result.data;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Failed to accept answer';
		dispatch(setFairEvalError(errorMessage));
		dispatch(setFairEvalLoading(false));

		logError(error, {
			operation: 'fairEvalController.acceptFairEvalAnswer',
			metadata: { statementId },
		});
		throw error;
	}
}

interface CompleteToGoalRequest {
	statementId: string;
}

interface CompleteToGoalResult {
	success: boolean;
	message: string;
	statementId: string;
	minutesAdded: number;
	minutesPerUser: number;
	numberOfUsers: number;
}

/**
 * Add needed minutes to reach goal, then accept answer (admin only)
 */
export async function completeToGoal(
	statementId: string
): Promise<CompleteToGoalResult> {
	const dispatch = store.dispatch;
	dispatch(setFairEvalLoading(true));
	dispatch(setFairEvalError(null));

	try {
		const complete = httpsCallable<CompleteToGoalRequest, CompleteToGoalResult>(
			functions,
			'completeToGoal'
		);

		const result = await complete({ statementId });

		logger.info('Complete to goal executed', {
			statementId,
			minutesAdded: result.data.minutesAdded,
			minutesPerUser: result.data.minutesPerUser,
			numberOfUsers: result.data.numberOfUsers,
		});

		dispatch(setFairEvalLoading(false));
		return result.data;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Failed to complete to goal';
		dispatch(setFairEvalError(errorMessage));
		dispatch(setFairEvalLoading(false));

		logError(error, {
			operation: 'fairEvalController.completeToGoal',
			metadata: { statementId },
		});
		throw error;
	}
}

interface GetWalletInfoRequest {
	topParentId: string;
	userId?: string;
}

interface GetWalletInfoResult {
	success: boolean;
	wallet: FairEvalWallet | null;
	transactions: FairEvalTransaction[];
}

/**
 * Get wallet info and recent transactions from the server
 */
export async function fetchWalletInfo(
	topParentId: string,
	userId?: string
): Promise<GetWalletInfoResult> {
	try {
		const getInfo = httpsCallable<GetWalletInfoRequest, GetWalletInfoResult>(
			functions,
			'getWalletInfo'
		);

		const result = await getInfo({ topParentId, userId });

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'fairEvalController.fetchWalletInfo',
			metadata: { topParentId, userId },
		});
		throw error;
	}
}
