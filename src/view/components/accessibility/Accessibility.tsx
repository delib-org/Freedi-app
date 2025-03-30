import React, { useCallback, useEffect, useRef, useState } from 'react';
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
	const [position, setPosition] = useState({ top: 250, right: 100 });
	const dragRef = useRef<HTMLDivElement | null>(null);
	const startPos = useRef({ x: 0, y: 0 });
	const isDragging = useRef(false);

	const handleStart = (event: React.MouseEvent | React.TouchEvent) => {
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startPos.current = { x: clientX, y: clientY };
		isDragging.current = false;

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleEnd);
		document.addEventListener('touchmove', handleMove, { passive: false });
		document.addEventListener('touchend', handleEnd);
	};

	const handleMove = (event: MouseEvent | TouchEvent) => {
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

		const deltaX = clientX - startPos.current.x;
		const deltaY = clientY - startPos.current.y;

		if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
			isDragging.current = true;
		}

		startPos.current = { x: clientX, y: clientY };

		setPosition((prev) => ({
			top: Math.min(Math.max(prev.top + deltaY, 0), window.innerHeight - 100),
			right: Math.min(Math.max(prev.left - deltaX, 0), window.innerWidth - 100),
		}));
	};

	const handleEnd = () => {
		document.removeEventListener('mousemove', handleMove);
		document.removeEventListener('mouseup', handleEnd);
		document.removeEventListener('touchmove', handleMove);
		document.removeEventListener('touchend', handleEnd);

		if (!isDragging.current) {
			handleOpen();
		}
	};

	return (
		<div
			ref={(node) => {
				dragRef.current = node;
				if (accessibilityRef) accessibilityRef.current = node;
			}
			}
			className={`accessibility ${isOpen ? 'is-open' : ''}`}
			style={{ fontSize, top: `${position.top}px`, right: `${position.left}px` }}
		>
			<button
				className='accessibility-button'
				onMouseDown={handleStart}
				onTouchStart={handleStart}
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
					<output className='accessibility__fonts__size'>Aa</output>
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
