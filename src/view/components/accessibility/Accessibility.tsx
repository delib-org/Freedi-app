import React, { useCallback, useEffect, useRef } from 'react';
import IconButton from '../iconButton/IconButton';
import AccessibilityIcon from '@/assets/icons/accessibilityIcon.svg?react';
import HighContrastIcon from '@/assets/icons/highContrast.svg?react';
import LightContrastIcon from '@/assets/icons/lightContrast.svg?react';
import styles from './Accessibility.module.scss';
import { useAutoClose } from '@/controllers/hooks/useAutoClose';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { colorMappings } from './colorContrast';

export default function Accessibility() {
	const { fontSize, changeFontSize, colorContrast, setColorContrast, t } = useUserConfig();
	const { isOpen, handleOpen } = useAutoClose(10000);

	const handleClickOutside = useCallback(() => {
		if (isOpen) handleOpen();
	}, [isOpen, handleOpen]);

	const accessibilityRef = useClickOutside(handleClickOutside);

	useEffect(() => {
		Object.entries(colorMappings).forEach(([key, contrastKey]) => {
			document.documentElement.style.setProperty(key, colorContrast ? `var(${contrastKey})` : '');
		});
	}, [colorContrast]);

	// Drag & Drop
	const [position, setPosition] = React.useState({ top: 250 });
	const startPos = useRef({ x: 0, y: 0 });
	const isDragging = useRef(false);
	const touchMoved = useRef(false);
	const buttonRef = useRef(null);

	const handleMove = useCallback((event) => {
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

		const deltaX = clientX - startPos.current.x;
		const deltaY = clientY - startPos.current.y;

		if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
			isDragging.current = true;
			if ('touches' in event) {
				touchMoved.current = true;
			}
		}

		startPos.current = { x: clientX, y: clientY };
		setPosition((prev) => ({
			top: Math.min(Math.max(prev.top + deltaY, 0), window.innerHeight - 100),
		}));
	}, []);

	const handleEnd = useCallback(
		(event) => {
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleEnd);
			document.removeEventListener('touchmove', handleMove);
			document.removeEventListener('touchend', handleEnd);

			const isTouchEvent = event && event.type === 'touchend';

			if ((!isTouchEvent && !isDragging.current) || (isTouchEvent && !touchMoved.current)) {
				handleOpen();
			}
		},
		[handleMove, handleOpen],
	);

	const handleStart = useCallback(
		(event) => {
			if ('touches' in event) {
				event.preventDefault();
			}
			const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
			const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
			startPos.current = { x: clientX, y: clientY };
			isDragging.current = false;

			if ('touches' in event) {
				touchMoved.current = false;
			}

			document.addEventListener('mousemove', handleMove);
			document.addEventListener('mouseup', handleEnd);
			document.addEventListener('touchmove', handleMove, {
				passive: false,
			});
			document.addEventListener('touchend', handleEnd);
		},
		[handleMove, handleEnd],
	);

	useEffect(() => {
		const button = buttonRef.current;
		if (!button) return;

		const handleTouchStart = (event) => {
			event.preventDefault();
			handleStart(event);
		};

		button.addEventListener('touchstart', handleTouchStart, {
			passive: false,
		});
		button.addEventListener('mousedown', handleStart);

		return () => {
			button.removeEventListener('touchstart', handleTouchStart);
			button.removeEventListener('mousedown', handleStart);
		};
	}, [handleStart]);

	return (
		<div
			ref={accessibilityRef}
			className={`${styles.accessibility} ${isOpen ? styles.isOpen : ''}`}
			style={{ fontSize, top: `${position.top}px` }}
		>
			<button
				className={styles.accessibilityButton}
				ref={buttonRef}
				aria-label={t('Accessibility options')}
			>
				<AccessibilityIcon />
			</button>
			<div className={styles.accessibilityPanel}>
				<div className={styles.accessibilityPanel__fonts}>
					<IconButton
						className={styles.changeFontSizeButton}
						onClick={() => changeFontSize(fontSize + 1)}
					>
						+
					</IconButton>
					<span className={styles.accessibilityFontsSize}>Aa</span>
					<IconButton
						className={styles.changeFontSizeButton}
						onClick={() => changeFontSize(fontSize - 1)}
					>
						-
					</IconButton>
				</div>
				<div className={styles.accessibilityPanel__contrast}>
					<button onClick={() => setColorContrast(true)} className={styles.highContrast}>
						<HighContrastIcon /> {t('High contrast')}
					</button>
					<button onClick={() => setColorContrast(false)} className={styles.lightContrast}>
						<LightContrastIcon /> {t('Light contrast')}
					</button>
				</div>
			</div>
		</div>
	);
}
