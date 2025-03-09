import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import React, { Suspense } from 'react';

export default function withSuspense(
	Component: React.LazyExoticComponent<() => React.JSX.Element>
) {
	return (
		<Suspense fallback={<LoadingPage />}>
			<Component />
		</Suspense>
	);
}
