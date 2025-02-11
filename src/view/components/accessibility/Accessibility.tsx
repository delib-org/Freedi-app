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

export default function Accessibility() {
	// * Redux * //
	const dispatch = useAppDispatch();
	const fontSize = useAppSelector(fontSizeSelector);
	const user = useAppSelector(userSelector);
	const colorContrast = useAppSelector(colorContrastSelector);

	// * Hooks * //
	const { isOpen, handleOpen } = useAutoClose(10000);

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
		>
			<button className='accessibility-button' onClick={handleOpen}>
				<AccessibilityIcon />
			</button>

			<div className='accessibility-panel'>
				<div className='accessibility-panel__fonts'>
					<IconButton
						className='change-font-size-button'
						onClick={() => handleChangeFontSize(2)}
					>
						+
					</IconButton>
					<output className='accessibility__fonts__size'>
						Aa
					</output>
					<IconButton
						className='change-font-size-button'
						onClick={() => handleChangeFontSize(-2)}
					>
						-
					</IconButton>
				</div>
				<div className='accessibility-panel__contrast'>
					<button onClick={() => dispatch(setColorContrast(true))}>
						<HighContrastIcon /> High contrast
					</button>
					<button onClick={() => dispatch(setColorContrast(false))} style={{backgroundColor: "var(--btn-primary-disabled)"}}>
						<LightContrastIcon /> Light contrast
					</button>
				</div>
			</div>
		</div>
	);
}
