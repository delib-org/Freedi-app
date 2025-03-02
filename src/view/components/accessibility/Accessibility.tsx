import { useCallback, useEffect } from 'react';
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

	return (
		<div
			ref={accessibilityRef}
			className={`accessibility ${isOpen ? 'is-open' : ''}`}
			style={{ fontSize }}
		>
			<button className='accessibility-button' onClick={handleOpen}>
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
