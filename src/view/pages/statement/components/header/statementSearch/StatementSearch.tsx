import { FC, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import type { SearchCandidate, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useStatementSearch } from '@/controllers/hooks/useStatementSearch';
import { statementSelector, statementsSelector } from '@/redux/statements/statementsSlice';
import Sheet from '@/view/components/atomic/molecules/Sheet/Sheet';
import SearchBox from '@/view/components/atomic/molecules/SearchBox';
import SearchResults from '@/view/components/atomic/molecules/SearchResults';

interface Props {
	statement: Statement;
}

/**
 * Header search button for a statement page: searches everything under the
 * page's top statement, by words and by meaning, and opens the chosen hit.
 * The search only runs while the sheet is open.
 */
const StatementSearch: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState('');

	const rootId =
		statement.parentId === 'top' || !statement.topParentId
			? statement.statementId
			: statement.topParentId;
	const rootSelector = useMemo(() => statementSelector(rootId), [rootId]);
	const root = useAppSelector(rootSelector);
	const statements = useAppSelector(statementsSelector);

	const search = useStatementSearch(isOpen ? { kind: 'tree', rootId } : null, query);

	const titleById = useMemo(() => {
		if (!isOpen) return new Map<string, string>();

		return new Map(statements.map((item) => [item.statementId, item.statement]));
	}, [isOpen, statements]);

	// Where a hit sits: its parent's title, unless the parent is the space itself.
	const getContextLabel = useCallback(
		(candidate: SearchCandidate): string | undefined =>
			candidate.parentId === rootId || candidate.parentId === 'top'
				? undefined
				: titleById.get(candidate.parentId),
		[rootId, titleById],
	);

	const handleClose = useCallback(() => setIsOpen(false), []);

	const handleSelect = useCallback(
		(statementId: string) => {
			setIsOpen(false);
			setQuery('');
			navigate(`/statement/${statementId}`);
		},
		[navigate],
	);

	return (
		<>
			<button
				type="button"
				className="app-header-back-button"
				onClick={() => setIsOpen(true)}
				aria-label={t('Search this space')}
				aria-haspopup="dialog"
				data-cy="statement-search-button"
			>
				<Search size={22} aria-hidden="true" />
			</button>
			<Sheet
				id="statement-search"
				isOpen={isOpen}
				onClose={handleClose}
				title={root?.statement ? `${t('Search')} · ${root.statement}` : t('Search this space')}
				size="full"
			>
				<SearchBox
					value={query}
					onChange={setQuery}
					label={t('Search this space')}
					placeholder={t('Type a word or an idea')}
					autoFocus
				/>
				<SearchResults
					query={search.query}
					lexical={search.lexical}
					semantic={search.semantic}
					isLoading={search.isLoading}
					isLoadingTree={search.isLoadingTree}
					isSearchingMeaning={search.isSearchingMeaning}
					coverage={search.coverage}
					hasError={search.hasError}
					onSelect={handleSelect}
					getContextLabel={getContextLabel}
				/>
			</Sheet>
		</>
	);
};

export default StatementSearch;
