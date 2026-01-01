'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, AppStore } from './store';

/**
 * Redux Store Provider for Mass Consensus
 *
 * Wraps the application with the Redux store provider.
 * Uses a ref to ensure the store is only created once per client.
 *
 * Usage in layout.tsx:
 * ```tsx
 * import { StoreProvider } from '@/lib/store/StoreProvider';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <StoreProvider>
 *           {children}
 *         </StoreProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

interface StoreProviderProps {
	children: React.ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
	const storeRef = useRef<AppStore>();

	if (!storeRef.current) {
		// Create the store instance the first time this renders
		storeRef.current = makeStore();
	}

	return <Provider store={storeRef.current}>{children}</Provider>;
}

export default StoreProvider;
