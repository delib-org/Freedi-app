import { FC, useState } from "react";
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

	return (
		<button
			className={`checkbox ${checked ? "checked" : ""}`}
			onClick={handleChange}
		>
			<label
				htmlFor={`checkbox-${label}`}
			>
				<VisuallyHidden labelName={t(label)} />
			</label>
			<button
				type="button"
				className="checkbox-icon"
				onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
					if (e.key === "Enter") {
						e.preventDefault();
					}
				}}
				aria-label={checked ? "Uncheck" : "Check"}
			>
				{checked ? <CheckboxCheckedIcon /> : <CheckboxEmptyIcon />}
			</button>
			<input
				type="checkbox"
				name={name}
				id={`checkbox-${label}`}
				checked={checked}
				onChange={handleChange}
			/>
			<div className="checkbox-label">{t(label)}</div>
		</button>
	);
};

export default Checkbox;