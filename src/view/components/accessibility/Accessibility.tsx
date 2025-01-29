import { useCallback, useEffect, useRef } from "react";
import IconButton from "../iconButton/IconButton";
import AccessibilityIcon from "@/assets/icons/accessibilityIcon.svg?react";
import { useAppDispatch, useAppSelector } from "@/controllers/hooks/reduxHooks";
import { defaultFontSize } from "@/model/fonts/fontsModel";
import {
	colorContrastSelector,
	fontSizeSelector,
	setColorContrast,
	userSelector,
} from "@/model/users/userSlice";
import "./Accessibility.scss";
import { colorMappings } from "./colorContrast";
import { useAutoClose } from "@/controllers/hooks/useAutoClose";
import { useFontSize } from "@/controllers/hooks/useFontSize";
import useClickOutside from "@/controllers/hooks/useClickOutside";

export default function Accessibility() {
	const { isOpen, handleOpen } = useAutoClose(5000);
	const dispatch = useAppDispatch();
	const fontSize = useAppSelector(fontSizeSelector);
	const user = useAppSelector(userSelector);
	const colorContrast = useAppSelector(colorContrastSelector);
	const accessibilityRef = useRef<HTMLDivElement>(null);

	const { currentFontSize, handleChangeFontSize } = useFontSize(fontSize || defaultFontSize, !!user);

	useEffect(() => {
		Object.entries(colorMappings).forEach(([key, contrastKey]) => {
			document.documentElement.style.setProperty(
				key,
				colorContrast ? `var(${contrastKey})` : ""
			);
		});
	}, [colorContrast]);

	const handleClickOutside = useCallback(() => {
		if (isOpen) handleOpen();
	  }, [isOpen, handleOpen]);
	  useClickOutside(accessibilityRef, handleClickOutside);

	return (
		<div ref={accessibilityRef} className={`accessibility ${isOpen ? 'is-open' : ''}`}>
			<button className="accessibility-button" onClick={handleOpen}>
				<AccessibilityIcon />
			</button>

			<div className="accessibility-panel">
				<div className="accessibility-panel__fonts">
					<IconButton
						className="change-font-size-button"
						onClick={() => handleChangeFontSize(1)}
					>
						+
					</IconButton>
					<output className="accessibility__fonts__size">
						{currentFontSize}px
					</output>
					<IconButton
						className="change-font-size-button"
						onClick={() => handleChangeFontSize(-1)}
					>
						-
					</IconButton>
					<span dir="ltr">Fonts:</span>
				</div>
				<div className="accessibility-panel__contrast">
					<button onClick={() => dispatch(setColorContrast(true))}>High contrast</button>
					<button onClick={() => dispatch(setColorContrast(false))}>Light Contrast</button>
				</div>
			</div>
		</div>
	);
}
