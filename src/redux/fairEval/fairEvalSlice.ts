import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../types';
import {
	FairEvalWallet,
	FairEvalWalletSchema,
	FairEvalTransaction,
	FairEvalTransactionSchema,
	updateArray,
} from '@freedi/shared-types';
import { parse } from 'valibot';

// Define a type for the slice state
interface FairEvalState {
	wallets: FairEvalWallet[];
	transactions: FairEvalTransaction[];
	isLoading: boolean;
	error: string | null;
}

// Define the initial state
const initialState: FairEvalState = {
	wallets: [],
	transactions: [],
	isLoading: false,
	error: null,
};

export const fairEvalSlice = createSlice({
	name: 'fairEval',
	initialState,
	reducers: {
		// Wallet actions
		setWalletToStore: (state, action: PayloadAction<FairEvalWallet>) => {
			try {
				const newWallet = parse(FairEvalWalletSchema, action.payload);
				state.wallets = updateArray(state.wallets, newWallet, 'walletId');
			} catch (error) {
				console.error('Error parsing wallet:', error);
			}
		},
		removeWalletFromStore: (state, action: PayloadAction<string>) => {
			state.wallets = state.wallets.filter(
				(wallet) => wallet.walletId !== action.payload
			);
		},

		// Transaction actions
		setTransactionToStore: (state, action: PayloadAction<FairEvalTransaction>) => {
			try {
				const newTransaction = parse(FairEvalTransactionSchema, action.payload);
				state.transactions = updateArray(
					state.transactions,
					newTransaction,
					'transactionId'
				);
			} catch (error) {
				console.error('Error parsing transaction:', error);
			}
		},
		setTransactionsToStore: (state, action: PayloadAction<FairEvalTransaction[]>) => {
			try {
				const newTransactions = action.payload.map((tx) =>
					parse(FairEvalTransactionSchema, tx)
				);
				newTransactions.forEach((tx) => {
					state.transactions = updateArray(
						state.transactions,
						tx,
						'transactionId'
					);
				});
			} catch (error) {
				console.error('Error parsing transactions:', error);
			}
		},
		removeTransactionFromStore: (state, action: PayloadAction<string>) => {
			state.transactions = state.transactions.filter(
				(tx) => tx.transactionId !== action.payload
			);
		},

		// Loading state
		setFairEvalLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},

		// Error state
		setFairEvalError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},

		// Reset state
		resetFairEval: (state) => {
			state.wallets = [];
			state.transactions = [];
			state.isLoading = false;
			state.error = null;
		},

		// Clear wallets for a specific group
		clearWalletsForGroup: (state, action: PayloadAction<string>) => {
			state.wallets = state.wallets.filter(
				(wallet) => wallet.topParentId !== action.payload
			);
		},

		// Clear transactions for a specific group
		clearTransactionsForGroup: (state, action: PayloadAction<string>) => {
			state.transactions = state.transactions.filter(
				(tx) => tx.topParentId !== action.payload
			);
		},
	},
});

export const {
	setWalletToStore,
	removeWalletFromStore,
	setTransactionToStore,
	setTransactionsToStore,
	removeTransactionFromStore,
	setFairEvalLoading,
	setFairEvalError,
	resetFairEval,
	clearWalletsForGroup,
	clearTransactionsForGroup,
} = fairEvalSlice.actions;

// Selectors

// Get all wallets
export const selectAllWallets = (state: RootState): FairEvalWallet[] =>
	state.fairEval.wallets;

// Get wallet by ID
export const selectWalletById =
	(walletId: string) =>
	(state: RootState): FairEvalWallet | undefined =>
		state.fairEval.wallets.find((wallet) => wallet.walletId === walletId);

// Get wallet by group (topParentId) and user
export const selectWalletByGroupAndUser =
	(topParentId: string, userId: string) =>
	(state: RootState): FairEvalWallet | undefined =>
		state.fairEval.wallets.find(
			(wallet) =>
				wallet.topParentId === topParentId && wallet.userId === userId
		);

// Get current user's wallet for a group
export const selectCurrentUserWallet =
	(topParentId: string) =>
	(state: RootState): FairEvalWallet | undefined => {
		const userId = state.creator.creator?.uid;
		if (!userId) return undefined;
		return state.fairEval.wallets.find(
			(wallet) =>
				wallet.topParentId === topParentId && wallet.userId === userId
		);
	};

// Get all wallets for a group
export const selectWalletsByGroup =
	(topParentId: string) =>
	(state: RootState): FairEvalWallet[] =>
		state.fairEval.wallets.filter(
			(wallet) => wallet.topParentId === topParentId
		);

// Get all transactions
export const selectAllTransactions = (state: RootState): FairEvalTransaction[] =>
	state.fairEval.transactions;

// Get transactions by group
export const selectTransactionsByGroup =
	(topParentId: string) =>
	(state: RootState): FairEvalTransaction[] =>
		state.fairEval.transactions.filter((tx) => tx.topParentId === topParentId);

// Get transactions by group and user
export const selectTransactionsByGroupAndUser =
	(topParentId: string, userId?: string) =>
	(state: RootState): FairEvalTransaction[] => {
		const uid = userId ?? state.creator.creator?.uid;
		if (!uid) return [];
		return state.fairEval.transactions.filter(
			(tx) => tx.topParentId === topParentId && tx.userId === uid
		);
	};

// Get current user's transactions for a group (sorted by date, newest first)
export const selectCurrentUserTransactions =
	(topParentId: string) =>
	(state: RootState): FairEvalTransaction[] => {
		const userId = state.creator.creator?.uid;
		if (!userId) return [];
		return state.fairEval.transactions
			.filter((tx) => tx.topParentId === topParentId && tx.userId === userId)
			.sort((a, b) => b.createdAt - a.createdAt);
	};

// Get loading state
export const selectFairEvalLoading = (state: RootState): boolean =>
	state.fairEval.isLoading;

// Get error state
export const selectFairEvalError = (state: RootState): string | null =>
	state.fairEval.error;

// Get current user's balance for a group
export const selectCurrentUserBalance =
	(topParentId: string) =>
	(state: RootState): number => {
		const wallet = selectCurrentUserWallet(topParentId)(state);
		return wallet?.balance ?? 0;
	};

// Get total balance across all wallets in a group
export const selectTotalGroupBalance =
	(topParentId: string) =>
	(state: RootState): number =>
		state.fairEval.wallets
			.filter((wallet) => wallet.topParentId === topParentId)
			.reduce((total, wallet) => total + wallet.balance, 0);

// Get number of wallets (members) in a group
export const selectGroupMemberCount =
	(topParentId: string) =>
	(state: RootState): number =>
		state.fairEval.wallets.filter(
			(wallet) => wallet.topParentId === topParentId
		).length;

export default fairEvalSlice.reducer;
