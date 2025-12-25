import React, { Suspense, ComponentType } from 'react';
import { StatementSkeleton } from '@/view/components/atomic/molecules/StatementSkeleton';

export default function withStatementSuspense(
	Component: React.LazyExoticComponent<ComponentType<Record<string, never>>>
) {
	return (
		<Suspense fallback={<StatementSkeleton />}>
			<Component />
		</Suspense>
	);
}
