import React, { JSX } from 'react'
import styles from "./MultiSwitch.module.scss";
import { CustomTooltip } from '../../tooltip/CustomTooltip';

export interface MultiSwitchProps {
	options: { label: string; value: string; icon?: JSX.Element; toolTip?: string }[];
	onClick: (value: string) => void;
	currentValue: string;
}

const MultiSwitch: React.FC<MultiSwitchProps> = ({ options, onClick, currentValue }) => {
	function handleSwitch(value: string) {
		onClick(value)
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
					<CustomTooltip content={option.toolTip ? option.toolTip : ''} position="top" >
						{option.icon ? option.icon : null}
						{option.label}
					</CustomTooltip>
				</button>
			))}
		</div>
	)
}

export default MultiSwitch