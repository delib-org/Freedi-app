// Store configuration
export { makeStore } from './store';
export type { AppStore, RootState, AppDispatch } from './store';

// Provider
export { StoreProvider } from './StoreProvider';

// Hooks
export { useAppDispatch, useAppSelector, useAppStore } from './hooks';

// Fair Eval Slice
export {
	fairEvalSlice,
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
} from './fairEvalSlice';

// Selectors
export {
	selectAllWallets,
	selectWalletById,
	selectWalletByGroupAndUser,
	selectCurrentUserWallet,
	selectWalletsByGroup,
	selectCurrentUserBalance,
	selectTotalGroupBalance,
	selectGroupMemberCount,
	selectAllTransactions,
	selectTransactionsByGroup,
	selectTransactionsByGroupAndUser,
	selectCurrentUserTransactions,
	selectCurrentUserId,
	selectFairEvalLoading,
	selectFairEvalError,
} from './selectors';
