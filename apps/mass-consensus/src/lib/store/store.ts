import { configureStore } from '@reduxjs/toolkit';
import fairEvalReducer from './fairEvalSlice';

/**
 * Redux Store Configuration for Mass Consensus
 *
 * Sets up the Redux store with all slices.
 * Uses Redux Toolkit for simplified configuration.
 */

export const makeStore = () => {
	return configureStore({
		reducer: {
			fairEval: fairEvalReducer,
		},
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: {
					// Ignore these action types
					ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
				},
			}),
		devTools: process.env.NODE_ENV !== 'production',
	});
};

// Infer the type of makeStore
export type AppStore = ReturnType<typeof makeStore>;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
