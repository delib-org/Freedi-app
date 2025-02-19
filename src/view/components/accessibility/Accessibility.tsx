import { useCallback, useEffect } from 'react';
import IconButton from '../iconButton/IconButton';
import AccessibilityIcon from '@/assets/icons/accessibilityIcon.svg?react';
import HighContrastIcon from '@/assets/icons/highContrast.svg?react';
import LightContrastIcon from '@/assets/icons/lightContrast.svg?react';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { defaultFontSize } from '@/model/fonts/fontsModel';
import {
	colorContrastSelector,
	fontSizeSelector,
	setColorContrast,
	userSelector,
} from '@/redux/users/userSlice';
import './Accessibility.scss';
import { colorMappings } from './colorContrast';
import { useAutoClose } from '@/controllers/hooks/useAutoClose';
import { useFontSize } from '@/controllers/hooks/useFontSize';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { useLanguage } from '@/controllers/hooks/useLanguages';

export default function Accessibility() {
	// * Redux * //
	const dispatch = useAppDispatch();
	const fontSize = useAppSelector(fontSizeSelector);
	const user = useAppSelector(userSelector);
	const colorContrast = useAppSelector(colorContrastSelector);

	// * Hooks * //
	const { isOpen, handleOpen } = useAutoClose(10000);
	const { t } = useLanguage();

	const handleClickOutside = useCallback(() => {
		if (isOpen) handleOpen();
	}, [isOpen, handleOpen]);

	const accessibilityRef = useClickOutside(handleClickOutside);

	const { currentFontSize, handleChangeFontSize } = useFontSize(
		fontSize || defaultFontSize,
		!!user
	);

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
			style={{ fontSize: currentFontSize }}
		>
			<button className='accessibility-button' onClick={handleOpen}>
				<AccessibilityIcon />
			</button>

			<div className='accessibility-panel'>
				<div className='accessibility-panel__fonts'>
					<IconButton
						className='change-font-size-button'
						onClick={() => handleChangeFontSize(1)}
					>
						+
					</IconButton>
					<output className='accessibility__fonts__size'>
						Aa
					</output>
					<IconButton
						className='change-font-size-button'
						onClick={() => handleChangeFontSize(-1)}
					>
						-
					</IconButton>
				</div>
				<div className='accessibility-panel__contrast'>
					<button onClick={() => dispatch(setColorContrast(true))} className='high-contrast'>
						<HighContrastIcon /> {t("High contrast")}
					</button>
					<button onClick={() => dispatch(setColorContrast(false))} className='light-contrast'>
						<LightContrastIcon /> {t("Light contrast")}
					</button>
				</div>
			</div>
		</div>
	);
}
