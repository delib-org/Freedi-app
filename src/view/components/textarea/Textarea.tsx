import React, { useRef, useEffect, useState } from 'react';
import styles from './Textarea.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface TextAreaProps {
	label?: string;
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
	backgroundColor?: string;
	name: string;
	maxLength?: number;
	onKeyUp?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	isDisabled?: boolean;
	minRows?: number;
	maxRows?: number;
}

const Textarea: React.FC<TextAreaProps> = ({
	label = 'Your description',
	placeholder = 'Please write the description of your suggestion here...',
	value = '',
	onChange,
	backgroundColor = '#fff',
	name,
	maxLength,
	onKeyUp,
	isDisabled = false,
	minRows = 1,
	maxRows,
}) => {
	const { t, dir } = useTranslation();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [hasOverflow, setHasOverflow] = useState(false);

	const adjustHeight = () => {
		const textarea = textareaRef.current;
		if (textarea) {
			// Reset height to auto to get the correct scrollHeight
			textarea.style.height = 'auto';

			const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 24;
			const minHeight = lineHeight * minRows;
			const maxHeight = maxRows ? lineHeight * maxRows : Infinity;

			const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
			textarea.style.height = `${newHeight}px`;

			// Check if content exceeds max height
			setHasOverflow(textarea.scrollHeight > maxHeight);
		}
	};

	// Adjust height on initial render and when value changes
	useEffect(() => {
		adjustHeight();
	}, [value, minRows, maxRows]);

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		adjustHeight();
		onChange?.(e.target.value);
	};

	return (
		<div className={styles.container}>
			<div className={styles.labelContainer}>
				<div
					className={`${styles.labelWrapper} ${dir === 'ltr' ? styles['labelWrapper--ltr'] : styles['labelWrapper--rtl']}`}
					style={{ backgroundColor: backgroundColor }}
				>
					<span className={styles.label}>{label}</span>
				</div>
			</div>
			<div className={styles.inputContainer}>
				<textarea
					name={name}
					disabled={isDisabled}
					ref={textareaRef}
					className={`${styles.textArea} ${hasOverflow ? styles['textArea--scrollable'] : ''}`}
					placeholder={t(placeholder)}
					defaultValue={value}
					onChange={handleChange}
					rows={minRows}
					maxLength={maxLength}
					onKeyUp={onKeyUp}
				/>
			</div>
			{typeof maxLength === 'number' && (
				<div className={styles.charCounter} style={{ direction: dir === 'rtl' ? 'rtl' : 'ltr' }}>
					{value.length} / {maxLength} {t('characters')}
				</div>
			)}
		</div>
	);
};

export default Textarea;
