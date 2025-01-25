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

	//checked means multi-stage question

	return (
		<button className="custom-switch-small" onClick={handleChange}>
			<div
				className={dir === "rtl" ? "background" : "background background--ltr"}
				style={{ backgroundImage: `url(${BackgroundImage})` }}
			>
				<div className="ball ball-background" style={{ left: "4.15rem" }}>
					{imageUnchecked}
				</div>
				<div className="ball ball-background ball-background-off">
					{imageChecked}
				</div>
				<button
					className={`ball ball-switch ball-switch--${isChecked ? "checked" : "unchecked"}`}
					type="button"
					style={{ left: `${isChecked ? 0 : 4.15}rem` }}
					aria-label={isChecked ? "Turn off" : "Turn on"}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleChange();
						}
					}}
				>
					{isChecked ? imageChecked : imageUnchecked}
				</button>
			</div>
			<div className="text">{isChecked ? textChecked : textUnchecked}</div>
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
			/>
		</button>
	);
};

export default CustomSwitchSmall;
