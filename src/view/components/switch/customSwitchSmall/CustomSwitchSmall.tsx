import React, { FC, useState } from "react";
import "./CustomSwitchSmall.scss";
import VisuallyHidden from "../../accessibility/toScreenReaders/VisuallyHidden";
import BackgroundImage from "./customSwitchSmallBackground.svg";
import { useLanguage } from "@/controllers/hooks/useLanguages";

interface Props {
	label: string;
	textChecked: string;
	textUnchecked: string;
	imageChecked: React.ReactNode;
	imageUnchecked: React.ReactNode;
	checked: boolean;
	setChecked: (check: boolean) => void;
}

const CustomSwitchSmall: FC<Props> = ({
	label,
	checked,
	textChecked,
	textUnchecked,
	imageChecked,
	imageUnchecked,
	setChecked,
}) => {
	const { dir } = useLanguage();
	const [isChecked, setIsChecked] = useState(checked);

	const handleChange = () => {
		setIsChecked(!isChecked);
		setChecked(!isChecked);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleChange();
		}
	};

	return (
		<div
			className="custom-switch-small"
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			role="switch"
			aria-checked={isChecked}
			tabIndex={0}
		>
			<div
				className={dir === "rtl" ? "background" : "background background--ltr"}
				style={{ backgroundImage: `url(${BackgroundImage})` }}
			>
				<div
					className="ball ball-background"
					style={{ left: "4.15rem" }}
					aria-hidden="true"
				>
					{imageUnchecked}
				</div>
				<div
					className="ball ball-background ball-background-off"
					aria-hidden="true"
				>
					{imageChecked}
				</div>
				<div
					className={`ball ball-switch ball-switch--${isChecked ? "checked" : "unchecked"}`}
					style={{ left: `${isChecked ? 0 : 4.15}rem` }}
					aria-hidden="true"
				>
					{isChecked ? imageChecked : imageUnchecked}
				</div>
			</div>
			<div className="text" aria-hidden="true">
				{isChecked ? textChecked : textUnchecked}
			</div>
			<label htmlFor={`toggleSwitchSimple-${label}`}>
				<VisuallyHidden labelName={label} />
			</label>
			<input
				type="checkbox"
				name={label}
				id={`toggleSwitchSimple-${label}`}
				className="switch-input"
				onChange={handleChange}
				value={isChecked ? "on" : "off"}
				checked={isChecked}
				data-cy={`toggleSwitch-input-${label}`}
				tabIndex={-1}
				style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
			/>
		</div>
	);
};

export default CustomSwitchSmall;