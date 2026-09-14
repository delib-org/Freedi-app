import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { StatementType, type SearchCandidate } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	statementsSubscriptionsSelector,
	statementsSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { useHomeStatementOverlay } from '@/controllers/hooks/useHomeStatementOverlay';
import { useLazyLoadHomeSubscriptions } from '../hooks/useLazyLoadHomeSubscriptions';
import { useStatementSearch } from '@/controllers/hooks/useStatementSearch';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import SearchResults from '@/view/components/atomic/molecules/SearchResults';
import ConversationHome, {
	ConversationSummary,
} from '@/view/components/atomic/organisms/ThinkingSpace/ConversationHome';
import styles from './HomeMain.module.scss';

export default function HomeMain() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const user = useAppSelector(creatorSelector);
	const subscriptions = useAppSelector(statementsSubscriptionsSelector);
	const statements = useAppSelector(statementsSelector);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<'all' | 'groups'>('all');
	const [searchQuery, setSearchQuery] = useState('');
	const [searchScope, setSearchScope] = useState<'home' | 'subscriptions'>('home');
	const search = useStatementSearch({ kind: searchScope }, searchQuery);
	const topLevelSubscriptions = useMemo(
		() => subscriptions.filter((sub) => (sub.parentId || sub.statement?.parentId) === 'top'),
		[subscriptions],
	);
	useHomeStatementOverlay(topLevelSubscriptions);
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadHomeSubscriptions(
		filter === 'groups' ? 'topics' : 'discussions',
	);
	useEffect(() => {
		const timeout = window.setTimeout(() => setLoading(false), 1500);

		return () => window.clearTimeout(timeout);
	}, []);
	useEffect(() => {
		if (subscriptions.length) setLoading(false);
	}, [subscriptions.length]);
	const conversations = useMemo<ConversationSummary[]>(() => {
		const byId = new Map(statements.map((statement) => [statement.statementId, statement]));

		return subscriptions
			.filter(
				(sub) =>
					sub.userId === user?.uid &&
					!sub.isDocument &&
					![StatementType.document, StatementType.paragraph].includes(
						sub.statementType || sub.statement.statementType,
					),
			)
			.map((sub) => {
				const statement = byId.get(sub.statementId) || sub.statement;
				const latest = (statement.lastSubStatements || sub.lastSubStatements || [])
					.filter(
						(child) =>
							![StatementType.document, StatementType.paragraph].includes(child.statementType),
					)
					.slice()
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];

				return {
					id: sub.statementId,
					title: statement.statement,
					description: statement.brief || statement.description,
					isGroup: statement.statementType === StatementType.group,
					recentText: latest?.statement,
					recentAuthor: latest?.creator?.displayName,
				};
			});
	}, [subscriptions, statements, user?.uid]);
	// Where a hit sits, for hits below the top level: the title of its space.
	const titleById = useMemo(() => {
		if (!searchQuery.trim()) return new Map<string, string>();
		const titles = new Map<string, string>();
		subscriptions.forEach((sub) => {
			if (sub.statement?.statement) titles.set(sub.statementId, sub.statement.statement);
		});
		statements.forEach((statement) => titles.set(statement.statementId, statement.statement));

		return titles;
	}, [searchQuery, subscriptions, statements]);
	const getContextLabel = useCallback(
		(candidate: SearchCandidate): string | undefined =>
			candidate.parentId === 'top' ? undefined : titleById.get(candidate.topParentId),
		[titleById],
	);

	const create = (): void => {
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
	};

	const createGroup = (): void => {
		dispatch(
			setNewStatementModal({
				parentStatement: 'top',
				newStatement: { statementType: StatementType.group },
				showModal: true,
				isLoading: false,
				error: null,
			}),
		);
	};

	return (
		<>
			<ConversationHome
				conversations={conversations}
				userName={user?.displayName || ''}
				onOpen={(id) => navigate(`/statement/${id}`)}
				onCreate={create}
				onCreateGroup={createGroup}
				onFilterChange={setFilter}
				loading={loading}
				search={{
					query: searchQuery,
					onQueryChange: setSearchQuery,
					results: (
						<div className={styles.search}>
							<SegmentedControl
								segments={[
									{ id: 'home', label: t('My spaces') },
									{ id: 'subscriptions', label: t('Everything I follow') },
								]}
								activeId={searchScope}
								onChange={(id) => setSearchScope(id === 'subscriptions' ? 'subscriptions' : 'home')}
							/>
							<SearchResults
								query={search.query}
								lexical={search.lexical}
								semantic={search.semantic}
								isLoading={search.isLoading}
								hasError={search.hasError}
								onSelect={(id) => navigate(`/statement/${id}`)}
								getContextLabel={getContextLabel}
							/>
						</div>
					),
				}}
				t={t}
				more={
					<>
						{hasMore && (
							<div ref={sentinelRef} className={styles.lazyLoadSentinel} aria-hidden="true" />
						)}
						{isLoadingMore && (
							<div className={styles.lazyLoadStatus} role="status">
								{t('Loading more…')}
							</div>
						)}
					</>
				}
			/>
		</>
	);
}
