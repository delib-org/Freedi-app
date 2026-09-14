import React, { type ChangeEvent } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * SearchBox Molecule - Atomic Design System
 *
 * Controlled search input with a clear button. Styling lives in
 * src/view/style/molecules/_search-box.scss.
 */

export interface SearchBoxProps {
	value: string;
	onChange: (value: string) => void;
	/** Accessible name — also used as the placeholder when none is given. */
	label: string;
	placeholder?: string;
	autoFocus?: boolean;
	className?: string;
	id?: string;
}

const SearchBox: React.FC<SearchBoxProps> = ({
	value,
	onChange,
	label,
	placeholder,
	autoFocus = false,
	className,
	id,
}) => {
	const { t, dir } = useTranslation();

	const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
		onChange(event.target.value);
	};

	return (
		<div className={clsx('search-box', className)} dir={dir}>
			<Search className="search-box__icon" size={18} aria-hidden="true" />
			<input
				id={id}
				className="search-box__input"
				type="search"
				value={value}
				onChange={handleChange}
				aria-label={label}
				placeholder={placeholder ?? label}
				autoFocus={autoFocus}
				autoComplete="off"
				enterKeyHint="search"
			/>
			{value && (
				<button
					type="button"
					className="search-box__clear"
					onClick={() => onChange('')}
					aria-label={t('Clear search')}
				>
					<X size={16} aria-hidden="true" />
				</button>
			)}
		</div>
	);
};

export default SearchBox;
