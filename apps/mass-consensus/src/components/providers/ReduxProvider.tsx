'use client';

/**
 * Redux Provider for Next.js App Router
 * Must be a Client Component
 */

import { Provider } from 'react-redux';
import { store } from '@/store';

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
