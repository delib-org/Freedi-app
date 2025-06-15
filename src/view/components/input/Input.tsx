import React, { ChangeEvent } from 'react';
import styles from './Input.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
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
	const { dir } = useUserConfig();

	const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
		onChange?.(e.target.value);
	};

	const handleClear = (): void => {
		onChange?.('');
	};

	return (
		<div className={styles.container}>
			<div
				className={`${styles.label} ${dir === 'ltr' ? styles['label--ltr'] : styles['label--rtl']
					}`}
				style={{ backgroundColor: backgroundColor }}
			>
				{label}
			</div>
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
					name={name}
					type='text'
					value={value}
					onChange={handleChange}
					placeholder={placeholder}
					className={styles.input}
					autoFocus={autoFocus}
				/>
				{value && (
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
