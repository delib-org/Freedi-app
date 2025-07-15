import React, { FC } from 'react';
import CheckboxCheckedIcon from '@/assets/icons/checkboxCheckedIcon.svg?react';
import CheckboxEmptyIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import './Checkbox.scss';
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
	const { t } = useUserConfig();

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
			className={`checkbox ${checkedValue ? 'checked' : ''} ${className ?? ''}`}
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			role='checkbox'
			aria-checked={checkedValue}
			tabIndex={0}
		>
			<label htmlFor={`checkbox-${label}`}>
				<VisuallyHidden labelName={t(label)} />
			</label>
			<div className='checkbox-icon' aria-hidden='true'>
				{checkedValue ? <CheckboxCheckedIcon /> : <CheckboxEmptyIcon />}
			</div>
			<input
				type='checkbox'
				name={name}
				id={`checkbox-${label}`}
				checked={checkedValue}
				onChange={handleChange}
				tabIndex={-1}
				style={{
					position: 'absolute',
					opacity: 0,
					pointerEvents: 'none',
				}}
			/>
			<div className='checkbox-label'>{t(label)}</div>
		</div>
	);
};

export default Checkbox;