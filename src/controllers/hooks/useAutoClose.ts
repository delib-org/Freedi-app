import { useEffect, useRef, useState } from 'react';

export const useAutoClose = (autoCloseDelay = 5000) => {
	const [isOpen, setIsOpen] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

	const handleOpen = () => {
		if (isOpen) {
			clearTimeout(timeoutRef.current);
			setIsOpen(false);
		} else {
			setIsOpen(true);
			timeoutRef.current = setTimeout(() => {
				setIsOpen(false);
			}, autoCloseDelay);
		}
	};

	useEffect(() => {
		return () => clearTimeout(timeoutRef.current);
	}, []);

	return { isOpen, handleOpen };
};
