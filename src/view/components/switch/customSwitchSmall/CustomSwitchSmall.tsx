import React, { FC, useState } from 'react';
import styles from './CustomSwitchSmall.module.scss';
import VisuallyHidden from '../../accessibility/toScreenReaders/VisuallyHidden';
import BackgroundImage from './customSwitchSmallBackground.svg?url';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface Props {
	label: string;
	textChecked: string;
	textUnchecked: string;
	imageChecked: React.ReactNode;
	imageUnchecked: React.ReactNode;
	checked: boolean;
	setChecked: (check: boolean) => void;
	colorChecked?: string;
	colorUnchecked?: string;
}

const CustomSwitchSmall: FC<Props> = ({
	label,
	checked,
	textChecked,
	textUnchecked,
	imageChecked,
	imageUnchecked,
	setChecked,
	colorChecked,
	colorUnchecked,
}) => {
	const { dir } = useTranslation();
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
			className={styles.customSwitchSmall}
			onClick={handleChange}
			onKeyDown={handleKeyDown}
			role="switch"
			aria-checked={isChecked}
			tabIndex={0}
		>
			<div
				className={
					dir === 'rtl' ? styles.background : `${styles.background} ${styles.backgroundLtr}`
				}
				style={{ backgroundImage: `url("${BackgroundImage}")` }}
			>
				<div
					className={`${styles.ball} ${styles.ballBackground}`}
					style={{ left: '4.15rem' }}
					aria-hidden="true"
				>
					{imageUnchecked}
				</div>
				<div
					className={`${styles.ball} ${styles.ballBackground} ${styles.ballBackgroundOff}`}
					aria-hidden="true"
				>
					{imageChecked}
				</div>
				<div
					className={`${styles.ball} ${styles.ballSwitch} ${isChecked ? styles.ballSwitchChecked : styles.ballSwitchUnchecked}`}
					style={{
						left: `${isChecked ? 0 : 4.15}rem`,
						backgroundColor: isChecked
							? (colorChecked ?? '#4ade80')
							: (colorUnchecked ?? '#ef4444'),
					}}
					aria-hidden="true"
				>
					{isChecked ? imageChecked : imageUnchecked}
				</div>
			</div>
			<div className={styles.text} aria-hidden="true">
				{isChecked ? textChecked : textUnchecked}
			</div>
			<label htmlFor={`toggleSwitchSimple-${label}`}>
				<VisuallyHidden labelName={label} />
			</label>
			<input
				type="checkbox"
				name={label}
				id={`toggleSwitchSimple-${label}`}
				className={styles.switchInput}
				onChange={handleChange}
				value={isChecked ? 'on' : 'off'}
				checked={isChecked}
				data-cy={`toggleSwitch-input-${label}`}
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

export default CustomSwitchSmall;
