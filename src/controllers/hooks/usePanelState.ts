import { useState, useEffect } from 'react';

interface UsePanelStateOptions {
	storageKey: string;
	defaultDesktopOpen?: boolean;
	defaultMobileOpen?: boolean;
}

export const usePanelState = ({
	storageKey,
	defaultDesktopOpen = true,
	defaultMobileOpen = false,
}: UsePanelStateOptions): [boolean, (value: boolean) => void] => {
	const [isOpen, setIsOpenState] = useState<boolean>(() => {
		// Check localStorage first
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(storageKey);
			if (stored !== null) {
				return stored === 'true';
			}
			// If no stored value, use defaults based on screen size
			const isDesktop = window.innerWidth > 768;

			return isDesktop ? defaultDesktopOpen : defaultMobileOpen;
		}

		return false;
	});

	// Save to localStorage whenever state changes
	useEffect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem(storageKey, String(isOpen));
		}
	}, [isOpen, storageKey]);

	// Handle window resize - only update if no stored preference
	useEffect(() => {
		const handleResize = () => {
			const stored = localStorage.getItem(storageKey);
			// Only auto-update on resize if user hasn't manually set a preference
			if (stored === null) {
				const isDesktop = window.innerWidth > 768;
				setIsOpenState(isDesktop ? defaultDesktopOpen : defaultMobileOpen);
			}
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('resize', handleResize);

			return () => window.removeEventListener('resize', handleResize);
		}
	}, [storageKey, defaultDesktopOpen, defaultMobileOpen]);

	// Listen for custom panelsClose event
	useEffect(() => {
		const handlePanelsClose = () => {
			// Unconditionally close the panel when event is received
			setIsOpenState(false);
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('panelsClose', handlePanelsClose);

			return () => window.removeEventListener('panelsClose', handlePanelsClose);
		}
	}, [storageKey]);

	const setIsOpen = (value: boolean) => {
		setIsOpenState(value);
	};

	return [isOpen, setIsOpen];
};
