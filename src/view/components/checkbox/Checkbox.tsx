import React, { FC, useState } from "react";
import CheckboxCheckedIcon from "@/assets/icons/checkboxCheckedIcon.svg?react";
import CheckboxEmptyIcon from "@/assets/icons/checkboxEmptyIcon.svg?react";
import { useLanguage } from "@/controllers/hooks/useLanguages";
import "./Checkbox.scss";
import VisuallyHidden from "../accessibility/toScreenReaders/VisuallyHidden";

interface CheckboxProps {
	name?: string;
	label: string;
	isChecked: boolean;
	onChange: (checked: boolean) => void;
}

const Checkbox: FC<CheckboxProps> = ({
	name,
	label,
	isChecked,
	onChange,
}: CheckboxProps) => {
	const { t } = useLanguage();
	const [checked, setChecked] = useState(isChecked);

	const handleChange = () => {
		setChecked(!checked);
		onChange(!checked);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleChange();
		}
	};

	return (
		<div
			className={`checkbox ${checked ? "checked" : ""}`}
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			role="checkbox"
			aria-checked={checked}
			tabIndex={0}
		>
			<label htmlFor={`checkbox-${label}`}>
				<VisuallyHidden labelName={t(label)} />
			</label>
			<div
				className="checkbox-icon"
				aria-hidden="true"
			>
				{checked ? <CheckboxCheckedIcon /> : <CheckboxEmptyIcon />}
			</div>
			<input
				type="checkbox"
				name={name}
				id={`checkbox-${label}`}
				checked={checked}
				onChange={handleChange}
				tabIndex={-1}
				style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
			/>
			<div className="checkbox-label">{t(label)}</div>
		</div>
	);
};

export default Checkbox;