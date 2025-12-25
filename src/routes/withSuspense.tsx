import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import React, { Suspense, ComponentType, useRef, useEffect } from 'react';

// Global registry of loaded components - persists across navigations
const loadedComponents = new Set<string>();

// Minimal fallback for subsequent loads (just a brief flash prevention)
const MinimalFallback = () => (
	<div style={{ minHeight: '100vh', background: 'var(--bg-screen, #f2f6ff)' }} />
);

// Smart Suspense that only shows full loading on first visit
interface FirstLoadSuspenseProps {
	componentId: string;
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

function FirstLoadSuspense({ componentId, children, fallback }: FirstLoadSuspenseProps) {
	const isFirstLoad = !loadedComponents.has(componentId);
	const hasMarkedLoaded = useRef(false);

	// Mark as loaded after first successful render
	useEffect(() => {
		if (!hasMarkedLoaded.current) {
			loadedComponents.add(componentId);
			hasMarkedLoaded.current = true;
		}
	}, [componentId]);

	return (
		<Suspense fallback={isFirstLoad ? (fallback ?? <LoadingPage />) : <MinimalFallback />}>
			{children}
		</Suspense>
	);
}

// Generate unique ID for lazy component
let componentCounter = 0;
const componentIdMap = new WeakMap<object, string>();

function getComponentId(Component: React.LazyExoticComponent<ComponentType>): string {
	if (!componentIdMap.has(Component)) {
		componentIdMap.set(Component, `lazy-component-${++componentCounter}`);
	}

	return componentIdMap.get(Component)!;
}

// Default wrapper with loading page
export default function withSuspense(
	Component: React.LazyExoticComponent<ComponentType<Record<string, never>>>
) {
	const componentId = getComponentId(Component);

	return (
		<FirstLoadSuspense componentId={componentId}>
			<Component />
		</FirstLoadSuspense>
	);
}

// Wrapper with custom fallback (e.g., skeleton)
export function withCustomSuspense(
	Component: React.LazyExoticComponent<ComponentType<Record<string, never>>>,
	fallback: React.ReactNode
) {
	const componentId = getComponentId(Component);

	return (
		<FirstLoadSuspense componentId={componentId} fallback={fallback}>
			<Component />
		</FirstLoadSuspense>
	);
}

// Export for use in other files
export { FirstLoadSuspense, MinimalFallback };
