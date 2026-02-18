import React, { JSX } from 'react';
import styles from './MultiSwitch.module.scss';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import { Tooltip } from '../../tooltip/Tooltip';

export interface MultiSwitchProps {
	options: { label: string; value: string; icon?: JSX.Element; toolTip?: string }[];
	onClick: (value: string) => void;
	currentValue: string;
}

const MultiSwitch: React.FC<MultiSwitchProps> = ({ options, onClick, currentValue }) => {
	function handleSwitch(value: string) {
		onClick(value);
	}

	return (
		<div className={styles.switch}>
			{options.map((option) => (
				<button
					className={`${styles.option} ${currentValue === option.value ? styles.active : ''}`}
					key={option.value}
					onClick={() => handleSwitch(option.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleSwitch(option.value)}
					tabIndex={0}
				>
					<Tooltip content={option.toolTip ? option.toolTip : ''} position="top">
						<div className={styles.optionContent}>
							{option.icon ? option.icon : null}
							{option.label}
							{currentValue === option.value && <CheckIcon />}
						</div>
					</Tooltip>
				</button>
			))}
		</div>
	);
};

export default MultiSwitch;
