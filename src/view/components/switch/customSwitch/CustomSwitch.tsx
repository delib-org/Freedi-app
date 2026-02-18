// CustomSwitch.tsx
import { useTranslation } from '@/controllers/hooks/useTranslation';
import React, { FC, ReactNode } from 'react';
import styles from './CustomSwitch.module.scss';
import VisuallyHidden from '../../accessibility/toScreenReaders/VisuallyHidden';

interface Props {
	label: string;
	name: string;
	checked: boolean;
	children: ReactNode;
	setChecked: (checked: boolean) => void;
}

const CustomSwitch: FC<Props> = ({ label, checked, name, setChecked, children }) => {
	const { t } = useTranslation();

	const handleChange = () => {
		setChecked(!checked);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleChange();
		}
	};

	return (
		<div
			className={`${styles.customSwitch} ${checked ? styles.checked : ''}`}
			role="switch"
			aria-checked={checked}
			tabIndex={0}
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			data-cy={`toggleSwitch-${name}`}
		>
			<div className={styles.tag} aria-hidden="true">
				{children}
			</div>
			<div className={styles.label}>{t(label)}</div>
			<label htmlFor={`toggleSwitch-${name}`}>
				<VisuallyHidden labelName={label} />
			</label>
			<input
				type="checkbox"
				name={name}
				id={`toggleSwitch-${name}`}
				className={styles.switchInput}
				onChange={handleChange}
				value={checked ? 'on' : 'off'}
				checked={checked}
				data-cy={`toggleSwitch-input-${name}`}
				tabIndex={-1}
				style={{
					position: 'absolute',
					opacity: 0,
					pointerEvents: 'none',
				}}
			/>
		</div>
	);
};

export default CustomSwitch;
