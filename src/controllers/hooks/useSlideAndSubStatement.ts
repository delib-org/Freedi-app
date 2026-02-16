import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';

const useSlideAndSubStatement = (parentId: string | undefined, statementId: string | undefined) => {
	const location = useLocation();
	const [toSlide, setToSlide] = useState(false);
	const [toSubStatement, setToSubStatement] = useState(false);
	const [slideInOrOut, setSlideInOrOut] = useState('slide-out');
	const [forceUpdate, setForceUpdate] = useState(0);

	// Use sessionStorage for persistence across component unmounts
	const getStoredNavigation = () => {
		const stored = sessionStorage.getItem('navigationState');
		if (stored) {
			try {
				return JSON.parse(stored);
			} catch {
				return { previousId: undefined, previousPath: '', count: 0 };
			}
		}

		return { previousId: undefined, previousPath: '', count: 0 };
	};

	const setStoredNavigation = (
		previousId: string | undefined,
		previousPath: string,
		count: number,
	) => {
		sessionStorage.setItem('navigationState', JSON.stringify({ previousId, previousPath, count }));
	};

	// Initialize from storage
	const storedNav = getStoredNavigation();
	const previousStatementIdRef = useRef<string | undefined>(storedNav.previousId);
	const previousPathRef = useRef<string>(storedNav.previousPath);
	const navigationCountRef = useRef<number>(storedNav.count);

	// Track if this is a fresh mount with a navigation pending
	const hasMountedRef = useRef(false);

	// Get both current and previous statements from Redux store
	const currentStatement = useAppSelector(statementSelector(statementId));
	const previousStatement = useAppSelector(statementSelector(previousStatementIdRef.current));

	// Force re-check when statements load
	useEffect(() => {
		if (statementId && !currentStatement) {
			// Statement not loaded yet, try again in a moment
			const timer = setTimeout(() => {
				setForceUpdate((prev) => prev + 1);
			}, 100);

			return () => clearTimeout(timer);
		}
	}, [statementId, currentStatement]);

	useEffect(() => {
		// Check if component just mounted
		const justMounted = !hasMountedRef.current;
		hasMountedRef.current = true;

		// Track unique navigations
		const currentNavKey = `${location.pathname}-${statementId}`;
		const previousNavKey = `${previousPathRef.current}-${previousStatementIdRef.current}`;
		const isNewNavigation = currentNavKey !== previousNavKey;

		// Skip only if same navigation AND not just mounted with stored state
		if (!isNewNavigation && !justMounted) {
			return;
		}

		// If just mounted but we have stored navigation state, treat it as a navigation
		if (
			justMounted &&
			previousStatementIdRef.current &&
			statementId !== previousStatementIdRef.current
		) {
			// Navigation will be handled below
		}

		// Increment navigation counter
		navigationCountRef.current++;

		// Check special routes
		const isToStage = location.pathname.includes('/stage/');
		const isFromStage = previousPathRef.current.includes('/stage/');
		const isFromHome =
			previousPathRef.current.includes('/home') ||
			previousPathRef.current === '/' ||
			previousPathRef.current === '';

		// Initial load
		if (navigationCountRef.current === 1 && !previousStatementIdRef.current) {
			// Animate on initial load if we're on a statement
			if (statementId) {
				setToSlide(true);
				setSlideInOrOut('slide-out');
			}
			previousStatementIdRef.current = statementId;
			previousPathRef.current = location.pathname;

			return;
		}

		// Skip if not on a statement page
		if (!statementId) {
			previousStatementIdRef.current = undefined;
			previousPathRef.current = location.pathname;

			return;
		}

		let animationType = 'slide-out'; // default
		let shouldAnimate = true;

		// Priority 1: Stage navigation
		if (isToStage && !isFromStage) {
			animationType = 'zoom-in';
		} else if (isFromStage && !isToStage) {
			animationType = 'zoom-out';
		}
		// Priority 2: From home
		else if (isFromHome) {
			animationType = 'slide-out';
		}
		// Priority 3: Statement to statement navigation
		else if (previousStatementIdRef.current !== statementId) {
			// First try using the actual statement data if available
			if (currentStatement && previousStatement) {
				// Current is child of previous (going deeper)
				if (currentStatement.parentId === previousStatement.statementId) {
					animationType = 'slide-out';
				}
				// Current is parent of previous (going back up)
				else if (previousStatement.parentId === currentStatement.statementId) {
					animationType = 'slide-in';
				}
				// Check if they share the same parent (sibling navigation)
				else if (
					currentStatement.parentId === previousStatement.parentId &&
					currentStatement.parentId
				) {
					animationType = 'slide-out';
				}
				// Unrelated statements
				else {
					animationType = 'slide-out';
				}
			}
			// Try using the parentId passed to the hook
			else if (parentId && previousStatementIdRef.current) {
				if (parentId === previousStatementIdRef.current) {
					animationType = 'slide-out';
				} else {
					animationType = 'slide-out';
				}
			}
			// Always animate if we're changing statements
			else {
				animationType = 'slide-out';
			}
		}
		// Priority 4: Same statement, different view
		else if (previousStatementIdRef.current === statementId) {
			// Same statement but different path (like chat to vote)
			if (previousPathRef.current !== location.pathname) {
				shouldAnimate = false;
			} else {
				shouldAnimate = false;
			}
		}

		// Apply animation
		if (shouldAnimate) {
			// Directly set the animation state
			setToSlide(true);
			setSlideInOrOut(animationType);
			setToSubStatement(
				animationType === 'slide-out' &&
					currentStatement?.parentId === previousStatementIdRef.current,
			);
		} else {
			setToSlide(false);
		}

		// Update refs and storage for next navigation
		previousStatementIdRef.current = statementId;
		previousPathRef.current = location.pathname;
		setStoredNavigation(statementId, location.pathname, navigationCountRef.current);
	}, [statementId, location.pathname, currentStatement, previousStatement, forceUpdate]);

	return { toSlide, toSubStatement, slideInOrOut };
};

export default useSlideAndSubStatement;
