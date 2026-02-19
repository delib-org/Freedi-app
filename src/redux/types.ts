// Redux type definitions - centralized to avoid circular dependencies
// NOTE: RootState and AppDispatch are now exported from store.ts directly.
// This file is kept for backward compatibility but no longer re-exports from store
// to avoid creating circular dependencies.
//
// If you need RootState or AppDispatch, import directly from '@/redux/store'.
// Slice files should use narrowly-typed state parameters instead of RootState
// to avoid circular dependencies (e.g., { statements: StatementsState }).
