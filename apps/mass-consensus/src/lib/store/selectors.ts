import type { RootState } from './store';
import type { FairEvalWallet, FairEvalTransaction } from '@freedi/shared-types';

/**
 * Fair Evaluation Selectors for Mass Consensus
 *
 * Pure selector functions for accessing fair evaluation state.
 */

// ============================================================================
// WALLET SELECTORS
// ============================================================================

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
		const userId = state.fairEval.currentUserId;
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

// ============================================================================
// TRANSACTION SELECTORS
// ============================================================================

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
	(topParentId: string, userId: string) =>
	(state: RootState): FairEvalTransaction[] =>
		state.fairEval.transactions.filter(
			(tx) => tx.topParentId === topParentId && tx.userId === userId
		);

// Get current user's transactions for a group (sorted by date, newest first)
export const selectCurrentUserTransactions =
	(topParentId: string) =>
	(state: RootState): FairEvalTransaction[] => {
		const userId = state.fairEval.currentUserId;
		if (!userId) return [];
		return state.fairEval.transactions
			.filter((tx) => tx.topParentId === topParentId && tx.userId === userId)
			.sort((a, b) => b.createdAt - a.createdAt);
	};

// ============================================================================
// STATE SELECTORS
// ============================================================================

// Get current user ID
export const selectCurrentUserId = (state: RootState): string | null =>
	state.fairEval.currentUserId;

// Get loading state
export const selectFairEvalLoading = (state: RootState): boolean =>
	state.fairEval.isLoading;

// Get error state
export const selectFairEvalError = (state: RootState): string | null =>
	state.fairEval.error;
