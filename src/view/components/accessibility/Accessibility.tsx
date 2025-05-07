import React, { useCallback, useEffect, useRef } from 'react';
import IconButton from '../iconButton/IconButton';
import AccessibilityIcon from '@/assets/icons/accessibilityIcon.svg?react';
import HighContrastIcon from '@/assets/icons/highContrast.svg?react';
import LightContrastIcon from '@/assets/icons/lightContrast.svg?react';
import './Accessibility.scss';
import { useAutoClose } from '@/controllers/hooks/useAutoClose';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { colorMappings } from './colorContrast';

export default function Accessibility() {
	const { fontSize, changeFontSize, colorContrast, setColorContrast, t } =
		useUserConfig();

	// Using the useAutoClose hook correctly
	const { isOpen, handleOpen } = useAutoClose(10000);

	const handleClickOutside = useCallback(() => {
		if (isOpen) handleOpen();
	}, [isOpen, handleOpen]);

	const accessibilityRef = useClickOutside(handleClickOutside);

	useEffect(() => {
		Object.entries(colorMappings).forEach(([key, contrastKey]) => {
			document.documentElement.style.setProperty(
				key,
				colorContrast ? `var(${contrastKey})` : ''
			);
		});
	}, [colorContrast]);

	// * Drag & Drop * //
	const [position, setPosition] = React.useState({ top: 250 });
	const dragRef = useRef(null);
	const startPos = useRef({ x: 0, y: 0 });
	const isDragging = useRef(false);
	// Track if a touch event has been moved
	const touchMoved = useRef(false);

	const handleStart = (event) => {
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startPos.current = { x: clientX, y: clientY };
		isDragging.current = false;

		// Reset touch moved flag at start of touch
		if ('touches' in event) {
			touchMoved.current = false;
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleEnd);
		document.addEventListener('touchmove', handleMove, { passive: false });
		document.addEventListener('touchend', handleEnd);
	};

	const handleMove = (event) => {
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

		const deltaX = clientX - startPos.current.x;
		const deltaY = clientY - startPos.current.y;

		// Mark as dragging if moved significantly
		if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
			isDragging.current = true;

			// For touch events, explicitly mark as moved
			if ('touches' in event) {
				touchMoved.current = true;
			}
		}

		startPos.current = { x: clientX, y: clientY };

		setPosition((prev) => ({
			top: Math.min(Math.max(prev.top + deltaY, 0), window.innerHeight - 100),
		}));
	};

	const handleEnd = (event) => {
		document.removeEventListener('mousemove', handleMove);
		document.removeEventListener('mouseup', handleEnd);
		document.removeEventListener('touchmove', handleMove);
		document.removeEventListener('touchend', handleEnd);

		// For mouse: toggle if not dragging
		// For touch: toggle only if tap (not moved)
		const isTouchEvent = event && event.type === 'touchend';

		if ((!isTouchEvent && !isDragging.current) ||
			(isTouchEvent && !touchMoved.current)) {
			handleOpen();
		}
	};

	// Explicit click handler for mobile - as a backup
	const handleClick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		handleOpen();

		return false;
	};

	return (
		<div
			ref={(node) => {
				dragRef.current = node;
				if (accessibilityRef) accessibilityRef.current = node;
			}}
			className={`accessibility ${isOpen ? 'is-open' : ''}`}
			style={{ fontSize, top: `${position.top}px` }}
		>
			<button
				className='accessibility-button'
				onMouseDown={handleStart}
				onTouchStart={handleStart}
				onClick={handleClick}
				aria-label={t('Accessibility options')}
			>
				<AccessibilityIcon />
			</button>
			<div className='accessibility-panel'>
				<div className='accessibility-panel__fonts'>
					<IconButton
						className='change-font-size-button'
						onClick={() => changeFontSize(fontSize + 1)}
					>
						+
					</IconButton>
					<span className='accessibility__fonts__size'>Aa</span>
					<IconButton
						className='change-font-size-button'
						onClick={() => changeFontSize(fontSize - 1)}
					>
						-
					</IconButton>
				</div>
				<div className='accessibility-panel__contrast'>
					<button
						onClick={() => setColorContrast(true)}
						className='high-contrast'
					>
						<HighContrastIcon /> {t('High contrast')}
					</button>
					<button
						onClick={() => setColorContrast(false)}
						className='light-contrast'
					>
						<LightContrastIcon /> {t('Light contrast')}
					</button>
				</div>
			</div>
		</div>
	);
}