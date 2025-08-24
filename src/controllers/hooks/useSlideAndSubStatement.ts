import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";

const useSlideAndSubStatement = (parentId: string | undefined, statementId: string | undefined) => {
	const location = useLocation();
	const [toSlide, setToSlide] = useState(false);
	const [toSubStatement, setToSubStatement] = useState(false);
	const [slideInOrOut, setSlideInOrOut] = useState("slide-out");
	
	// Keep track of previous statement ID
	const previousStatementIdRef = useRef<string | undefined>(undefined);
	const previousParentIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		// Check if coming from home/main screen using location state
		const isFromHome = location.state?.from === "/home" || 
						   location.state?.from === "/home/main" ||
						   location.state?.from?.startsWith("/home/");
		
		// Skip initial render unless coming from home
		if (previousStatementIdRef.current === undefined && !isFromHome) {
			previousStatementIdRef.current = statementId;
			previousParentIdRef.current = parentId;
			return;
		}
		
		// Handle navigation from home screen
		if (isFromHome) {
			setToSlide(true);
			setToSubStatement(false);
			setSlideInOrOut("slide-out"); // slide left when coming from home
			console.info('Animation: Coming from home screen (slide left)');
			previousStatementIdRef.current = statementId;
			previousParentIdRef.current = parentId;
			return;
		}
		
		// Only animate when changing statements
		if (previousStatementIdRef.current === statementId) {
			return;
		}
		
		// Log for debugging
		console.info('useSlideAndSubStatement:', {
			previousStatement: previousStatementIdRef.current,
			currentStatement: statementId,
			previousParent: previousParentIdRef.current,
			currentParent: parentId,
			pathname: location.pathname,
			from: location.state?.from
		});
		
		// Determine animation direction based on hierarchy
		if (previousStatementIdRef.current && statementId) {
			// Going from parent to child (entering sub-statement)
			if (parentId === previousStatementIdRef.current) {
				setToSlide(true);
				setToSubStatement(true);
				setSlideInOrOut("slide-out"); // slide left
				console.info('Animation: Entering sub-statement (slide left)');
			}
			// Going from child to parent (exiting sub-statement)
			else if (statementId === previousParentIdRef.current) {
				setToSlide(true);
				setToSubStatement(false);
				setSlideInOrOut("slide-in"); // slide right
				console.info('Animation: Going back to parent (slide right)');
			}
			// Same level navigation or unrelated statements
			else {
				setToSlide(true);
				setToSubStatement(false);
				setSlideInOrOut("slide-out"); // default slide left
				console.info('Animation: Same level navigation (slide left)');
			}
		} else {
			// Default case - initial load or coming from elsewhere
			setToSlide(true);
			setSlideInOrOut("slide-out");
			console.info('Animation: Default case (slide left)');
		}
		
		// Update refs for next navigation
		previousStatementIdRef.current = statementId;
		previousParentIdRef.current = parentId;
		
	}, [statementId, parentId, location.pathname, location.state]);

	return { toSlide, toSubStatement, slideInOrOut };
};

export default useSlideAndSubStatement;
