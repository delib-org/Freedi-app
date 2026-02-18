import { ComponentProps } from 'react';
import RadioButtonCheckedIcon from '@/assets/icons/radioButtonChecked.svg?react';
import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import styles from './RadioButtonWithLabel.module.scss';

interface RadioButtonWithLabelProps extends ComponentProps<'input'> {
	labelText: string;
	id: string;
	name?: string;
}

export default function RadioButtonWithLabel({
	labelText,
	id,
	checked,
	name = 'radioGroup',
	...inputProps
}: RadioButtonWithLabelProps) {
	return (
		<label
			htmlFor={id}
			className={`${styles.radioButtonWithLabel} ${checked ? styles.checked : ''}`}
		>
			<span className={styles.iconWrapper}>
				<span className={`${styles.icon} ${checked ? styles.visible : styles.hidden}`}>
					<RadioButtonCheckedIcon />
				</span>
				<span className={`${styles.icon} ${!checked ? styles.visible : styles.hidden}`}>
					<RadioButtonEmptyIcon />
				</span>
			</span>
			<input id={id} type="radio" name={name} checked={checked} {...inputProps} />
			{labelText}
		</label>
	);
}
