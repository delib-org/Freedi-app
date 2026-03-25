import { createContext, useContext, useState, useCallback, useRef, FC, ReactNode } from 'react';
import { TreeFilterMode } from './TreeFilterMode';

interface TreeFilterContextValue {
	filterMode: TreeFilterMode;
	setFilterMode: (mode: TreeFilterMode) => void;
	toggleCollapseExpand: () => void;
	isCollapsed: boolean;
	registerCollapseAll: (fn: () => void) => void;
	registerExpandAll: (fn: () => void) => void;
}

const TreeFilterContext = createContext<TreeFilterContextValue | null>(null);

export const TreeFilterProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [filterMode, setFilterMode] = useState<TreeFilterMode>(TreeFilterMode.all);
	const [isCollapsed, setIsCollapsed] = useState(false);
	const collapseAllRef = useRef<(() => void) | null>(null);
	const expandAllRef = useRef<(() => void) | null>(null);

	const registerCollapseAll = useCallback((fn: () => void) => {
		collapseAllRef.current = fn;
	}, []);

	const registerExpandAll = useCallback((fn: () => void) => {
		expandAllRef.current = fn;
	}, []);

	const toggleCollapseExpand = useCallback(() => {
		setIsCollapsed((prev) => {
			if (prev) {
				expandAllRef.current?.();
			} else {
				collapseAllRef.current?.();
			}

			return !prev;
		});
	}, []);

	return (
		<TreeFilterContext.Provider
			value={{
				filterMode,
				setFilterMode,
				toggleCollapseExpand,
				isCollapsed,
				registerCollapseAll,
				registerExpandAll,
			}}
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
