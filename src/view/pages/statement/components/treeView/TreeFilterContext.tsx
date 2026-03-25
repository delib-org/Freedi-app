import { createContext, useContext, useState, useCallback, useRef, FC, ReactNode } from 'react';
import { TreeFilterMode } from './TreeFilterMode';

interface TreeFilterContextValue {
	filterMode: TreeFilterMode;
	setFilterMode: (mode: TreeFilterMode) => void;
	collapseAll: () => void;
	registerCollapseAll: (fn: () => void) => void;
}

const TreeFilterContext = createContext<TreeFilterContextValue | null>(null);

export const TreeFilterProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [filterMode, setFilterMode] = useState<TreeFilterMode>(TreeFilterMode.all);
	const collapseAllRef = useRef<(() => void) | null>(null);

	const registerCollapseAll = useCallback((fn: () => void) => {
		collapseAllRef.current = fn;
	}, []);

	const collapseAll = useCallback(() => {
		collapseAllRef.current?.();
	}, []);

	return (
		<TreeFilterContext.Provider
			value={{ filterMode, setFilterMode, collapseAll, registerCollapseAll }}
		>
			{children}
		</TreeFilterContext.Provider>
	);
};

export function useTreeFilter(): TreeFilterContextValue {
	const ctx = useContext(TreeFilterContext);
	if (!ctx) {
		throw new Error('useTreeFilter must be used within TreeFilterProvider');
	}

	return ctx;
}

export function useTreeFilterOptional(): TreeFilterContextValue | null {
	return useContext(TreeFilterContext);
}
