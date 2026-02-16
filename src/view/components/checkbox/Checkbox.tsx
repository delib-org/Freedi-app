import React, { FC } from 'react';
import CheckboxCheckedIcon from '@/assets/icons/checkboxCheckedIcon.svg?react';
import CheckboxEmptyIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Checkbox.module.scss';
import VisuallyHidden from '../accessibility/toScreenReaders/VisuallyHidden';

interface CheckboxProps {
	name?: string;
	label: string;
	isChecked: boolean;
	onChange: (checked: boolean) => void;
	className?: string;
}

const Checkbox: FC<CheckboxProps> = ({
	name,
	label,
	isChecked,
	onChange,
	className,
}: CheckboxProps) => {
	const { t } = useTranslation();

	// Ensure isChecked is always a boolean
	const checkedValue = Boolean(isChecked);

	const handleChange = () => {
		onChange(!checkedValue);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleChange();
		}
	};

	return (
		<div
			className={`${styles.checkbox} ${checkedValue ? styles.checked : ''} ${className ?? ''}`}
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			role="checkbox"
			aria-checked={checkedValue}
			tabIndex={0}
		>
			<label htmlFor={`checkbox-${label}`}>
				<VisuallyHidden labelName={t(label)} />
			</label>
			<div className={styles.checkboxIcon} aria-hidden="true">
				{checkedValue ? <CheckboxCheckedIcon /> : <CheckboxEmptyIcon />}
			</div>
			<input
				type="checkbox"
				name={name}
				id={`checkbox-${label}`}
				checked={checkedValue}
				onChange={handleChange}
				tabIndex={-1}
				className={styles.hiddenInput}
			/>
			<div className={styles.checkboxLabel}>{t(label)}</div>
		</div>
	);
};

export default Checkbox;
