import React from 'react';
import clsx from 'clsx';
import { StatementType, type SearchCandidate, type SearchMatch } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import HighlightedText from '@/view/components/atomic/atoms/HighlightedText';

/**
 * SearchResults Molecule - Atomic Design System
 *
 * Presents what useStatementSearch returns: close (lexical) matches, then
 * similar-meaning (semantic) matches, with loading, coverage, empty and error
 * states. Styling lives in src/view/style/molecules/_search-results.scss.
 */

export interface SearchResultsProps {
	query: string;
	lexical: SearchMatch[];
	semantic: SearchMatch[];
	isLoading: boolean;
	isLoadingTree?: boolean;
	isSearchingMeaning?: boolean;
	coverage?: { scanned: number; total: number } | null;
	hasError?: boolean;
	onSelect: (statementId: string) => void;
	/** Where a hit lives (e.g. its top statement's title); omitted when undefined. */
	getContextLabel?: (candidate: SearchCandidate) => string | undefined;
	className?: string;
}

const TYPE_LABELS: Partial<Record<StatementType, string>> = {
	[StatementType.question]: 'Question',
	[StatementType.option]: 'Option',
	[StatementType.group]: 'Group',
	[StatementType.comment]: 'Comment',
	[StatementType.statement]: 'Discussion',
};

interface ResultListProps {
	heading: string;
	matches: SearchMatch[];
	onSelect: (statementId: string) => void;
	getContextLabel?: (candidate: SearchCandidate) => string | undefined;
}

const ResultList: React.FC<ResultListProps> = ({ heading, matches, onSelect, getContextLabel }) => {
	const { t } = useTranslation();

	return (
		<section className="search-results__group">
			<h3 className="search-results__heading">{heading}</h3>
			<ul className="search-results__list">
				{matches.map(({ candidate, field, ranges }) => {
					const context = getContextLabel?.(candidate);

					return (
						<li key={candidate.statementId}>
							<button
								type="button"
								className="search-results__item"
								onClick={() => onSelect(candidate.statementId)}
							>
								<span className="search-results__type">
									{t(TYPE_LABELS[candidate.statementType] ?? 'Discussion')}
								</span>
								<span className="search-results__title">
									<HighlightedText
										text={candidate.title}
										ranges={field === 'title' ? ranges : undefined}
									/>
								</span>
								{field === 'description' && candidate.description && (
									<span className="search-results__description">
										<HighlightedText text={candidate.description} ranges={ranges} />
									</span>
								)}
								{context && <span className="search-results__context">{context}</span>}
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
};

const SearchResults: React.FC<SearchResultsProps> = ({
	query,
	lexical,
	semantic,
	isLoading,
	isLoadingTree = false,
	isSearchingMeaning = false,
	coverage,
	hasError = false,
	onSelect,
	getContextLabel,
	className,
}) => {
	const { t, currentLanguage } = useTranslation();
	const formatNumber = (value: number): string =>
		new Intl.NumberFormat(currentLanguage).format(value);
	const hasResults = lexical.length > 0 || semantic.length > 0;
	const isBusy = isLoading || isSearchingMeaning || isLoadingTree;

	return (
		<div className={clsx('search-results', className)} aria-live="polite" aria-busy={isBusy}>
			{isLoading && (
				<p className="search-results__status" role="status">
					{t('Searching…')}
				</p>
			)}
			{isLoadingTree && (
				<p className="search-results__status search-results__status--quiet" role="status">
					{`${t('Loading all statements')}…`}
				</p>
			)}
			{coverage && coverage.total > coverage.scanned && (
				<p className="search-results__status search-results__status--quiet">
					{`${t('Searched')} ${formatNumber(coverage.scanned)} ${t('of')} ${formatNumber(coverage.total)}`}
				</p>
			)}

			{lexical.length > 0 && (
				<ResultList
					heading={t('Close matches')}
					matches={lexical}
					onSelect={onSelect}
					getContextLabel={getContextLabel}
				/>
			)}
			{semantic.length > 0 && (
				<ResultList
					heading={t('Similar meaning')}
					matches={semantic}
					onSelect={onSelect}
					getContextLabel={getContextLabel}
				/>
			)}
			{isSearchingMeaning && (
				<p className="search-results__status search-results__status--quiet" role="status">
					{t('Looking for similar ideas…')}
				</p>
			)}

			{hasError && (
				<p className="search-results__status search-results__status--error" role="alert">
					{t('Search is not available right now')}
				</p>
			)}
			{!hasResults && !isBusy && query && (
				<p className="search-results__empty">{`${t('No matches for')} “${query}”`}</p>
			)}
		</div>
	);
};

export default SearchResults;
