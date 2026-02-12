import React, { useState, ChangeEvent } from 'react';
import styles from './Input.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import CloseIcon from '@/assets/icons/close.svg?react';

interface SearchInputProps {
	label?: string;
	placeholder?: string;
	value?: string;
	image?: string;
	onChange?: (value: string) => void;
	backgroundColor?: string;
	name: string;
	autoFocus?: boolean;
}

const Input: React.FC<SearchInputProps> = ({
	label = 'Your name',
	placeholder = 'Search...',
	value = '',
	image,
	onChange,
	backgroundColor = '#fff',
	name,
	autoFocus = false,
}) => {
	const { dir } = useTranslation();
	const [inputValue, setInputValue] = useState<string>(value);

	const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
		setInputValue(e.target.value);
		onChange?.(e.target.value);
	};

	const handleClear = (): void => {
		setInputValue('');
		onChange?.('');
	};

	const inputId = `input-${name}`;

	return (
		<div className={styles.container}>
			<label
				htmlFor={inputId}
				className={`${styles.label} ${dir === 'ltr' ? styles['label--ltr'] : styles['label--rtl']
					}`}
				style={{ backgroundColor: backgroundColor }}
			>
				{label}
			</label>
			<div className={styles.inputContainer}>
				{image && (
					<img
						src={image}
						alt='search'
						className={styles.searchIcon}
						width={24}
						height={24}
					/>
				)}
				<input
					id={inputId}
					name={name}
					type='text'
					value={inputValue}
					onChange={handleChange}
					placeholder={placeholder}
					className={styles.input}
					autoFocus={autoFocus}
				/>
				{inputValue && (
					<button
						onClick={handleClear}
						className={styles.clearButton}
						type='button'
						aria-label='Clear input'
					>
						<CloseIcon />
					</button>
				)}
			</div>
		</div>
	);
};

export default Input;
