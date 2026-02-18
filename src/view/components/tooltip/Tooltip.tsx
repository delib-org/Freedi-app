import { FC, ReactNode, useState, useRef, useEffect } from 'react';
import styles from './Tooltip.module.scss';

interface TooltipProps {
	content: string;
	children: ReactNode;
	position?:
		| 'top'
		| 'bottom'
		| 'left'
		| 'right'
		| 'top-left'
		| 'top-right'
		| 'bottom-left'
		| 'bottom-right';
}

export const Tooltip: FC<TooltipProps> = ({ content, children, position = 'top' }) => {
	const [isVisible, setIsVisible] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLDivElement>(null);

	// Check if device is mobile
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth <= 768);
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	}, []);

	// Handle outside clicks on mobile
	useEffect(() => {
		if (!isMobile) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
				setIsVisible(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isMobile]);

	const toggleTooltip = () => {
		if (isMobile) {
			setIsVisible(!isVisible);
		}
	};

	const showTooltip = () => {
		if (!isMobile) {
			setIsVisible(true);
		}
	};

	const hideTooltip = () => {
		if (!isMobile) {
			setIsVisible(false);
		}
	};

	return (
		<div
			className={styles.tooltipWrapper}
			ref={triggerRef}
			onClick={toggleTooltip}
			onMouseEnter={showTooltip}
			onMouseLeave={hideTooltip}
		>
			{children}
			{isVisible && (
				<div className={`${styles.tooltip} ${styles[position]}`} ref={tooltipRef}>
					{content}
					<span className={styles.arrow}></span>
				</div>
			)}
		</div>
	);
};
