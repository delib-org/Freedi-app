// Redux type definitions - centralized to avoid circular dependencies
// Import the actual types from store.ts
// Slices should import from here instead of directly from store

export type { RootState, AppDispatch } from './store';
