'use client';

import { useCallback, useEffect } from 'react';
import {
	useAppDispatch,
	useAppSelector,
	setCurrentUserId,
	setWalletToStore,
	setWalletsToStore,
	setTransactionToStore,
	setTransactionsToStore,
	selectCurrentUserWallet,
	selectWalletsByGroup,
	selectCurrentUserTransactions,
	selectCurrentUserBalance,
	selectFairEvalLoading,
	selectFairEvalError,
} from '@/lib/store';
import type { FairEvalWallet, FairEvalTransaction } from '@freedi/shared-types';

/**
 * Hook for accessing fair evaluation state in Mass Consensus
 *
 * Provides access to wallet balances, transactions, and actions.
 */

export interface UseFairEvalResult {
	/** Current user's wallet for the group */
	wallet: FairEvalWallet | undefined;
	/** Current user's balance */
	balance: number;
	/** All wallets in the group */
	groupWallets: FairEvalWallet[];
	/** Current user's transactions */
	transactions: FairEvalTransaction[];
	/** Loading state */
	isLoading: boolean;
	/** Error state */
	error: string | null;
	/** Set the current user ID */
	setUserId: (userId: string) => void;
	/** Update wallet in store */
	updateWallet: (wallet: FairEvalWallet) => void;
	/** Update multiple wallets in store */
	updateWallets: (wallets: FairEvalWallet[]) => void;
	/** Add transaction to store */
	addTransaction: (transaction: FairEvalTransaction) => void;
	/** Set transactions in store */
	setTransactions: (transactions: FairEvalTransaction[]) => void;
}

export function useFairEval(topParentId: string): UseFairEvalResult {
	const dispatch = useAppDispatch();

	// Selectors
	const wallet = useAppSelector(selectCurrentUserWallet(topParentId));
	const balance = useAppSelector(selectCurrentUserBalance(topParentId));
	const groupWallets = useAppSelector(selectWalletsByGroup(topParentId));
	const transactions = useAppSelector(selectCurrentUserTransactions(topParentId));
	const isLoading = useAppSelector(selectFairEvalLoading);
	const error = useAppSelector(selectFairEvalError);

	// Actions
	const setUserId = useCallback(
		(userId: string) => {
			dispatch(setCurrentUserId(userId));
		},
		[dispatch]
	);

	const updateWallet = useCallback(
		(walletData: FairEvalWallet) => {
			dispatch(setWalletToStore(walletData));
		},
		[dispatch]
	);

	const updateWallets = useCallback(
		(wallets: FairEvalWallet[]) => {
			dispatch(setWalletsToStore(wallets));
		},
		[dispatch]
	);

	const addTransaction = useCallback(
		(transaction: FairEvalTransaction) => {
			dispatch(setTransactionToStore(transaction));
		},
		[dispatch]
	);

	const setTransactionsData = useCallback(
		(txs: FairEvalTransaction[]) => {
			dispatch(setTransactionsToStore(txs));
		},
		[dispatch]
	);

	return {
		wallet,
		balance,
		groupWallets,
		transactions,
		isLoading,
		error,
		setUserId,
		updateWallet,
		updateWallets,
		addTransaction,
		setTransactions: setTransactionsData,
	};
}

export default useFairEval;
