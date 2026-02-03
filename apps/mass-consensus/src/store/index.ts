/**
 * Redux Store Configuration
 * Following CLAUDE.md guidelines
 */

import { configureStore } from '@reduxjs/toolkit';
import swipeReducer from './slices/swipeSlice';

export const store = configureStore({
  reducer: {
    swipe: swipeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for timestamp fields
        ignoredActions: ['swipe/cardEvaluated', 'swipe/setCardStack'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
