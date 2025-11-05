import { Statement } from 'delib-npm';
import React, { FC, useState } from 'react';
import styles from './SearchBar.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import OptionMCCard from '../deleteCard/OptionMCCard';
import Close from '@/assets/icons/close.svg?react';

interface SearchBarProps {
	options: Statement[];
	setIsSearching?: (isSearching: boolean) => void;
}

const SearchBar: FC<SearchBarProps> = ({ options, setIsSearching }) => {
	const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
	const empty = '';
	const [searchTerm, setSearchTerm] = useState(empty);
	const { t } = useTranslation();

	if (!isSearchBarOpen) {
		return (
			<button
				className={styles.magnifyingGlass}
				onClick={() => setIsSearchBarOpen(true)}
			>
				⌕
			</button>
		);
	}
	function searchResults(e: React.ChangeEvent<HTMLInputElement>) {
		setSearchTerm(e.target.value);
		if (e.target.value.trim() === '') {
			setIsSearching(false);

			return;
		}
		setIsSearching(true);
	}
	const filteredOptions = options.filter((option) =>
		option.statement.toLowerCase().includes(searchTerm.toLowerCase())
	);

	return (
		<div className={styles.searchContainer}>
			<div className={styles.inlineInput}>
				<input
					className={styles.searchInput}
					type='search'
					placeholder={t('Search suggestions...')}
					value={searchTerm}
					onChange={(e) => searchResults(e)}
				/>
				<Close
					className={styles.XBtn}
					onClick={() => setIsSearchBarOpen(false)}
				></Close>
			</div>
			{<h3>{t('Search results')}</h3>}
			{searchTerm != empty &&
				filteredOptions?.map((option) => (
					<OptionMCCard
						key={option.statementId}
						statement={option}
						isDelete={false}
					/>
				))}
			<hr />
		</div>
	);
};

export default SearchBar;
