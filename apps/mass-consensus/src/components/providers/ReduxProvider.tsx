'use client';

/**
 * Redux Provider for Next.js App Router
 * Must be a Client Component
 */

import { type ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';

type ProviderChildren = ComponentProps<typeof Provider>['children'];

export function ReduxProvider({ children }: { children: ProviderChildren }) {
  return <Provider store={store}>{children}</Provider>;
}
