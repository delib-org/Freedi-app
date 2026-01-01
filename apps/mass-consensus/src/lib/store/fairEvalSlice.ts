import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import {
	FairEvalWallet,
	FairEvalWalletSchema,
	FairEvalTransaction,
	FairEvalTransactionSchema,
	updateArray,
} from '@freedi/shared-types';
import { parse } from 'valibot';

/**
 * Fair Evaluation Redux Slice for Mass Consensus
 *
 * Manages wallet balances and transaction history for the fair evaluation system.
 * Adapted from the main app's slice for Next.js/Mass Consensus architecture.
 */

// ============================================================================
// STATE TYPE
// ============================================================================

interface FairEvalState {
	wallets: FairEvalWallet[];
	transactions: FairEvalTransaction[];
	currentUserId: string | null;
	isLoading: boolean;
	error: string | null;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: FairEvalState = {
	wallets: [],
	transactions: [],
	currentUserId: null,
	isLoading: false,
	error: null,
};

// ============================================================================
// SLICE
// ============================================================================

export const fairEvalSlice = createSlice({
	name: 'fairEval',
	initialState,
	reducers: {
		// Set current user ID
		setCurrentUserId: (state, action: PayloadAction<string | null>) => {
			state.currentUserId = action.payload;
		},

		// Wallet actions
		setWalletToStore: (state, action: PayloadAction<FairEvalWallet>) => {
			try {
				const newWallet = parse(FairEvalWalletSchema, action.payload);
				state.wallets = updateArray(state.wallets, newWallet, 'walletId');
			} catch (error) {
				console.error('Error parsing wallet:', error);
			}
		},
		setWalletsToStore: (state, action: PayloadAction<FairEvalWallet[]>) => {
			try {
				const newWallets = action.payload.map((w) =>
					parse(FairEvalWalletSchema, w)
				);
				newWallets.forEach((wallet) => {
					state.wallets = updateArray(state.wallets, wallet, 'walletId');
				});
			} catch (error) {
				console.error('Error parsing wallets:', error);
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

// ============================================================================
// ACTIONS
// ============================================================================

export const {
	setCurrentUserId,
	setWalletToStore,
	setWalletsToStore,
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

export default fairEvalSlice.reducer;
